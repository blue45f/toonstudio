# 전체 문맥을 유지하는 메모리 제한 TypeScript 검사

상태: **current** — 2026-11-05. 구현·fixture 검증과 최신 main 통합 체크아웃의 전체 웹·API 타입
검증을 완료했다. 실제 저장소 전체 통과 여부는 해당 실행의 coverage manifest로 판단하며,
일부 샤드 통과를 전체 통과로 표시하지 않는다.

## 문제와 보존하는 계약

16GiB cgroup에서 기존 전체 root `tsc`가 종료 코드 137로 종료되었고, 별도 11GiB V8 힙 한도를 준
순차 실행도 약 305초에 JavaScript heap out of memory(134)로 종료됐다. root에는 테스트를 포함해
약 1만 7천 개의 root 파일이 있고, 실제 import·표준 라이브러리·선언까지 읽은 프로그램은 더 크다.
`type-coverage-shards.mjs`는 식별자 커버리지 도구이므로 이 타입 진단의 대체가 아니다.

`typecheck-shards.mjs`는 root tsconfig의 strict 옵션·include·exclude·paths·skipLibCheck를
바꾸지 않는다. 매 worker가 **동일한 전체 프로그램**을 만들고, 그 프로그램의 모든 SourceFile에
대한 의미 진단 요청만 서로 겹치지 않게 나눈다. ambient 선언과 module augmentation도 모든
worker에서 함께 존재한다. import된 비root 파일과 compiler가 읽은 선언 파일까지 coverage에 포함한다.
skipLibCheck 등의 생략 판단은 기존 TypeScript compiler가 그대로 수행한다.

설치된 TypeScript 6.0.3의 `Program.getSemanticDiagnostics()` 자체도 모든 SourceFile을 같은
파일별 helper로 검사해 합산한다. 파일별 요청이 파일 없는 지연 global 진단을 반환할 수 있으므로
결과를 담당 파일 이름으로 필터링하지 않는다. 관련 진단 위치·코드·범주·전체 메시지도 보존한다.
CLI와 같은 순서로 config·구문·options·global 진단을 확인하며, 구문·options·global 오류 때문에
의미 검사를 시작하지 못했을 때는 전체 의미 검사 완료로 표시하지 않는다.

이 도구는 `noEmit:true`, declaration·incremental·composite 비활성 프로젝트를 위한 읽기 전용
검사다. emit 또는 declaration 검사가 필요한 프로젝트를 몰래 약화시키지 않고 명시적으로 거부한다.

## 실행

일반 `pnpm typecheck`는 workspace link 검사 → 메모리 제한 `typecheck:web` → 기존 API·도구 검사를
수행한다. `pnpm build`도 같은 웹 타입 검사 뒤 기존 Vite 빌드를 수행한다. canonical 명령의 source
예산은 실측한 12MiB이고 worker heap은 8GiB다. 아래 직접 호출의 기본 4MiB는 더 작은 그룹을
원할 때 사용하는 기본값이며, 어느 경우에도 검사 범위와 strict 옵션은 같다.

저장소 루트, lockfile에 맞는 의존성 설치 후 실행한다. root 전체 검사는 메모리를 크게 사용하므로
다른 Vite 빌드·전체 checker·모델 inference와 동시에 실행하지 않는다.

```sh
# 전체 파일 목록만 생성하고 분할 계획을 출력한다. 의미 검사는 실행하지 않는다.
node scripts/typecheck-shards.mjs --list

# 모든 의미 진단을 순차 worker로 검사하고 증거를 기록한다.
node scripts/typecheck-shards.mjs \
  --heap-mb 8192 \
  --max-source-bytes 4194304 \
  --report node_modules/.cache/typecheck-shards/report.json

# 검사기 자체의 회귀 검증
node --test scripts/typecheck-shards.test.mjs
```

`--project`를 지정하지 않으면 호출 디렉터리와 관계없이 저장소 root `tsconfig.json`을 사용한다.
기본 heap은 8192MiB, 의미 검사 그룹의 source 예산은 4MiB다. 기존 NODE_OPTIONS의 힙 한도만
제거하고 worker의 명시적 한도를 적용한다. 그룹이 메모리 한도로 종료되면 이분해 새 프로세스로
재검사한다. 단일 파일도 실패하면 blocker로 남긴다. 프로세스 실패·신호·응답 누락을 성공으로
간주하거나 해당 파일을 제외하지 않는다.

## coverage manifest와 판정

- TypeScript 버전, tsconfig 옵션, root 목록, 전체 SourceFile 목록·크기·내용 해시를 기록한다.
- 컴파일러가 읽은 config·package metadata도 해시로 기록한다.
- 각 worker는 동일한 입력 fingerprint를 확인하고 검사한 모든 파일을 반환한다.
- 중복 배정·누락·범위 밖 파일·입력 변경은 실패한다. 끝에서 전체 입력 snapshot을 다시 확인한다.
- `complete:true`, 전체 파일 수와 검사 완료 파일 수 일치, 진단 0개, 프로세스 종료 코드 0을
  함께 만족해야 전체 통과다. 진단이 있어도 coverage 자체는 완료될 수 있으며 종료 코드는 실패다.
- 이 증거는 해당 tsconfig 프로그램 범위의 타입 검사다. 독립 API·worker·네이티브 crate 등의
  별도 프로젝트 검사나 런타임·품질·라이선스 검증을 대신하지 않는다.

입력 파일을 고친 뒤에는 전체 실행을 다시 시작해야 한다. 오래된 성공 manifest를 현재 통과로
사용하지 않도록 일반 실행 시작 시 incomplete 상태로 덮어쓰고, worker 실패도 manifest에 기록한다.
manifest는 기본적으로 Git ignore된 `node_modules/.cache`에 기록하며, 공유 증거가 필요하면
`--report`로 별도의 경로를 명시한다.

## 확인된 검사기 회귀 범위

Node 테스트 10개가 전체 단일 프로그램 진단과 분할 진단의 일치를 검증한다. global/module
augmentation, 비root import 파일 오류, skipLibCheck 양쪽 설정, 구문·global·config·options 오류,
내용 변경, 중복·미검사 coverage, 메모리 실패 이분 재시도와 단일 파일 실패, 실제 child CLI의
실패 종료 코드와 manifest를 포함한다. fixture 통과만으로 실제 root 전체 타입 통과를 주장하지 않는다.

실제 프로그램 목록 probe: TypeScript 6.0.3, root 16,927개, 전체 SourceFile 26,220개,
텍스트 246,267,183 bytes, 30.31초, peak RSS 6,197,010,432 bytes. 이는 특정 snapshot의
목록 생성 측정이며 의미 검사 완료나 이후 snapshot의 동일 수치를 뜻하지 않는다.

## 최신 main 통합본 전체 검증 결과

2026-11-05, `/workspace/scratch/toonstudio-commercial-main-validation`의
`2c626df4000fcfc32318faa793a61bea3ef0901b`에 작업 변경을 적용한 상태를 검증했다.
원본 오래된 checkout의 일부 probe 통과를 최신 main 전체 통과로 재사용하지 않았다.
`typecheck:web`를 메모리 제한 checker에 연결하고 `typecheck`는 기존 workspace 링크 확인과
API 검사를 유지했으며, `build`의 첫 단계도 같은 `typecheck:web`를 사용하도록 연결했다.

```sh
npm_config_manage_package_manager_versions=false \
PNPM_HOME=/tmp/toonstudio-pnpm XDG_DATA_HOME=/tmp/toonstudio-xdg \
pnpm run typecheck
```

- 실제 일반 명령이 workspace 링크 29개·19개 패키지 확인 후 웹 전체와 API 단계까지 실행됐다.
- 웹 root 16,936개, 전체 SourceFile 26,231개를 16개 worker에서 빠짐없이 검사했다.
- 진단 0개, 중복·미검사 0개, 최종 입력 fingerprint 일치, `complete:true`다.
- worker peak RSS 최댓값 8,639,463,424 bytes(약 8.05GiB), 메모리 실패 재분할 0회다.
- 의미 검사 worker 누적 시간은 964.28초이며 목록 생성·preflight·최종 snapshot 시간은 별도다.
- API 본체·work-session-browser·postgres-tools 3개 프로젝트의 기존 `tsc --noEmit`도 통과했다.
  최초 일반 명령의 마지막 도구 종료코드가 보존되지 않아, 같은 API 단계만 명시적 종료코드와 함께
  추가 확인했고 exit 0을 도구 결과와 파일에 모두 기록했다. 웹 전체 검사는 반복하지 않았다.

증거:

- `/tmp/toonstudio-main-full-typecheck-report.json` — 전체 파일별 해시·coverage·진단·메모리 기록.
- `/tmp/toonstudio-main-canonical-typecheck-summary.json` — HEAD·명령·전체 단계별 결과와 종료코드
  보존 한계. 웹 manifest SHA-256은 `a4f8d5858f37352e854c4a7fc42cb09cc3f864d291e1665ff2c0bded0296ea57`.
- `/tmp/toonstudio-main-canonical-typecheck.log` — 일반 명령 실행 기록.
- `/tmp/toonstudio-main-api-typecheck-confirm.log`, `.exit` — API 단계 추가 확인, exit 0.

이 결과는 위 main 통합본의 해당 snapshot에 대한 타입 검증이다. 실제 merge·배포, 모델 권리 해결,
모든 런타임 동작 검증을 뜻하지 않는다. 입력을 바꾸면 새로운 전체 검사가 필요하다.
