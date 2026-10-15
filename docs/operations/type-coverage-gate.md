# type-coverage 게이트의 측정 범위와 전체 측정

상태: **current** (2026-10-15 기준). 마지막 절의 "후속 후보"만 **target**이며 아직 구현되지 않았다.
근거 파일: `package.json`(`typeCoverage`, `check:type-coverage*`), `tsconfig.type-coverage.json`,
`scripts/type-coverage-shards.mjs`, `scripts/type-coverage-gate-contract.test.mjs`.

## 1. 요약

| 구분 | 명령 | 측정 범위 | 실행 위치 | 대략 비용 |
| --- | --- | --- | --- | --- |
| PR 필수 게이트 | `pnpm run check:type-coverage` | 테스트를 뺀 운영 소스에서 Studio 도메인(`apps/web/src/domains/creator/**`)을 뺀 범위 | CI `core`의 `typecheck` 잡 | 최대 RSS 약 6.3GB, 한가한 환경에서 약 5분(측정 기록 참고) |
| 전체 측정 | `pnpm run check:type-coverage:full` | 테스트를 뺀 운영 소스 전체(위 범위 + Studio 도메인) | 야간 진단 `main-full-qa-fast-diagnostics.yml`의 `type-coverage-full` | 샤드당 최대 RSS 6.2~6.5GB, 합계 약 16.5분(측정 기록 참고) |

임계값(95%)은 `package.json`의 `scripts["check:type-coverage"]` 한 곳에만 있다. 전체 측정 스크립트와
계약 테스트도 그 문자열에서 값을 읽으며, 워크플로에는 임계값 숫자를 쓰지 않는다.

## 2. 배경: 2026-10-15 힙 부족

CI 실행 38658151982(main `7e0a4571`)의 `Core preflight and application typecheck` 잡에서
`pnpm run check:type-coverage`(`type-coverage --at-least 95`)가 약 10분 뒤
`JavaScript heap out of memory`(힙 12.2GB, 종료 코드 134)로 죽었다. 커버리지 미달이 아니라 도구가
메모리를 다 쓴 것이다. 당시 측정 대상은 루트 `tsconfig.json`의 루트 파일 13,670개였고 그중 테스트가
5,781개였다.

type-coverage는 프로그램 전체를 한 프로세스에서 분석한다. 프로그램을 읽고 바인딩하는 데 힙 약 4GB가
들고, 분석한 소스가 늘수록 타입 체커 캐시가 계속 쌓여 소스 1MB당 힙이 약 55~85MB 늘어난다. 같은
프로그램을 둘로 나누지 않는 한 한 프로세스의 힙은 줄어들지 않는다.

## 3. 현재 범위 (current)

### 3.1 PR 필수 게이트

`package.json`의 `typeCoverage` 설정이 `check:type-coverage`의 범위를 정한다. 스크립트 문자열
(`type-coverage --at-least 95`)과 CI 호출(`pnpm run check:type-coverage`)은 바뀌지 않았다.

- `project`: `tsconfig.type-coverage.json` — 루트 `tsconfig.json`을 상속하고 테스트 파일만 더 뺀다
  (`*.test.*`, `*.spec.*`, `__tests__/`, `apps/web/tests/`). `include`와 컴파일러 옵션은 상속하므로
  새 소스 폴더는 자동으로 측정 대상이 된다.
- `ignoreFiles`: `apps/web/src/domains/creator/**` — Studio 도메인은 분석에서 뺀다.

### 3.2 전체 측정 (야간)

`scripts/type-coverage-shards.mjs`가 측정 범위를 서로 겹치지 않는 4개 샤드로 나눠 샤드마다 별도
프로세스에서 type-coverage를 실행하고, 정확/전체 식별자 수를 모두 더해 비율을 낸다(비율의 평균이
아니다). 샤드는 프로그램을 각자 새로 읽으므로 한 프로세스의 메모리가 분석한 소스 양에 맞춰 6~7GB 안에
머문다(네 샤드 모두 힙 상한 9000MB 안에서 완주했고 실측 최대 RSS는 6.2~6.5GB다).

| 샤드 | 분석하는 파일 | 소스 크기(대략) |
| --- | --- | --- |
| `core` | Studio 도메인 밖 전부 — PR 게이트와 같은 설정 | 약 21MB |
| `studio-root` | `apps/web/src/domains/creator/` 바로 아래 파일 | 약 29MB |
| `studio-engines` | `bg3d`, `brush`, `live`, `production-hub`, `render`, `virtual-space`, `vrm` | 약 30MB |
| `studio-rest` | 위에 속하지 않는 나머지 Studio 하위 폴더 | 약 21MB |

야간 진단은 이 합산 비율이 임계값 미만이면 실패한다. 이 경로는 PR을 막지 않는다.

## 4. 이전 범위와 달라진 점

| 항목 | 이전(2026-10-15 이전) | 현재 |
| --- | --- | --- |
| 프로그램 | 루트 `tsconfig.json` 루트 파일 13,670개(테스트 5,781개 포함) | `tsconfig.type-coverage.json` 루트 파일 약 7,900개(테스트 제외) |
| PR 게이트가 재는 소스 | 운영 소스 + 테스트 전체 | 운영 소스 중 Studio 도메인 밖 약 21MB |
| Studio 도메인(운영 소스의 약 79%) | PR 게이트에 포함(완주하지 못함) | PR 게이트에서 제외, 야간 전체 측정에서 측정 |
| 테스트 파일 | 측정 대상 | 어디서도 측정하지 않음 |
| 임계값 | 95% | 95% (변경 없음) |

테스트 파일(약 46MB)은 전체 측정에서도 제외한다. 테스트의 `any`는 운영 코드의 타입 안전성 지표가 아니고,
프로그램에 올리면 파싱과 분석 비용만 늘어난다.

## 5. 실행 방법

실행 위치는 저장소 루트, 전제는 `pnpm install` 완료다. 모두 읽기 전용이며 파일을 쓰지 않는다. 메모리를
크게 쓰므로 한 번에 하나만 실행한다.

```sh
# PR 게이트와 같은 범위(힙 상한을 명시해 도구가 먼저 실패하게 한다)
NODE_OPTIONS=--max-old-space-size=9000 pnpm run check:type-coverage

# 샤드와 CLI 인자만 출력(실행하지 않는다)
node scripts/type-coverage-shards.mjs --list

# 한 샤드만 측정
TYPE_COVERAGE_HEAP_MB=9000 node scripts/type-coverage-shards.mjs --shard studio-rest

# 전체 범위 측정(샤드를 차례로 실행, 약 17분)
TYPE_COVERAGE_HEAP_MB=9000 pnpm run check:type-coverage:full
```

`TYPE_COVERAGE_HEAP_MB`는 샤드 프로세스의 힙 상한(기본 9000)이다. 종료 코드 134는 힙 부족이므로 값을
올리거나 샤드를 더 잘게 나눈다.

## 6. 범위를 바꿀 때의 규칙

- 승인 주체: 저장소 소유자 또는 해당 변경을 리뷰하는 담당자. 임계값은 낮추지 않는다.
- 입력: 바꾸는 이유, 이전 범위와 새 범위, 두 범위의 측정값(분자/분모/비율).
- 고정 장치: `scripts/type-coverage-gate-contract.test.mjs`가 허용 키(`project`, `ignoreFiles`),
  테스트 전용 제외 목록, 샤드 구성, 임계값의 단일 출처를 고정한다. 목록을 바꾸려면 테스트와 이 문서,
  커밋 본문의 측정값을 함께 바꾼다. 소스를 빼서 숫자를 올리는 변경은 이 테스트가 막는다.
- 샤드 구성(`STUDIO_ENGINE_DIRECTORIES`)을 바꾸면 `ignoreFiles` 패턴이 같은 정의에서 만들어지므로
  샤드는 겹치지 않고 빠지지 않는다. 같은 테스트가 모든 추적 파일에서 이를 확인한다.
- 실패 경로: 야간 전체 측정이 임계값 미만이면 새로 생긴 `any`를 고친다. 힙 부족이면 샤드를 더 나누거나
  `TYPE_COVERAGE_HEAP_MB`를 조정한다. 어느 쪽도 PR 게이트의 범위나 임계값을 바꿔 덮지 않는다.

## 7. 측정 기록

| 날짜 | 범위 | 힙 상한 | 결과 | 소요 |
| --- | --- | --- | --- | --- |
| 2026-10-15 | CI 실행 38658151982, 테스트 포함 전체 | 12288MB(CI) | 힙 부족으로 중단(종료 코드 134) | 약 10분 |
| 2026-10-15 | 테스트만 제외한 전체 | 9000MB | 힙 부족으로 중단(종료 코드 134, 최대 RSS 9.3GB) | 약 19분 |
| 2026-10-15 | PR 게이트(테스트 제외, Studio 제외) | 9000MB | (902360 / 905309) 99.67% 통과, 최대 RSS 6.8GB | 약 7.3분(한가한 환경 4.6분) |
| 2026-10-15 | PR 게이트 `pnpm run check:type-coverage`를 범위 변경 커밋 뒤의 소스에서 다른 작업 없이 재측정 | 9000MB | (902360 / 905309) 99.67% 통과, 최대 RSS 6.3GB | 4.9분 |
| 2026-10-15 | 전체 측정 샤드 `studio-rest`(`scripts/type-coverage-shards.mjs --shard studio-rest`, 실제 type-coverage 실행) | 9000MB | (875861 / 889084) 98.51%, 최대 RSS 6.7GB | 4.8분 |
| 2026-10-15 | Studio 도메인 단독, 파일 크기 순 3,960/5,906개까지의 부분 누적(프로파일러) | 약 8.7GB | (3086748 / 3142997) 98.21%, 이후 힙 부족으로 중단 | 약 22분 |
| 2026-10-15 | 전체 측정 `pnpm run check:type-coverage:full` — 샤드 `core` | 9000MB | (902360 / 905309) 99.67%, 최대 RSS 6.2GB | 5.9분 |
| 2026-10-15 | 같은 실행 — 샤드 `studio-root` | 9000MB | (1177601 / 1181305) 99.68%, 최대 RSS 6.4GB | 4.5분 |
| 2026-10-15 | 같은 실행 — 샤드 `studio-engines` | 9000MB | (1245810 / 1285777) 96.89%, 최대 RSS 6.5GB | 3.0분 |
| 2026-10-15 | 같은 실행 — 샤드 `studio-rest` | 9000MB | (875861 / 889084) 98.51%, 최대 RSS 6.3GB | 3.1분 |
| 2026-10-15 | 같은 실행 — 네 샤드 합산(운영 소스 전체) | 샤드당 9000MB | (4201632 / 4261475) 98.59% 통과 | 16.5분 |

전체 측정(샤드 합산)을 실행하면 샤드별 값과 합계를 이 표에 행으로 추가한다. `core` 샤드는 PR 게이트와
같은 범위라 분자/분모가 PR 게이트 측정값과 같다. 소요 시간은 개발 환경 한 대에서 잰 값이고 다른 작업이
일부 겹쳤을 수 있다(`core` 샤드 실행 중에는 단발 vitest 실행이 겹쳤다). CI 러너에서는 달라질 수 있다.

## 8. 한계와 후속 후보

- **current**: PR에서는 Studio 도메인의 type-coverage 하락을 잡지 못한다. 야간 전체 측정이 하루 안에
  잡는다.
- **current**: 2026-10-15 전체 측정의 합산 비율은 98.59%였고 샤드 중 `studio-engines`가 96.89%로 가장
  낮다. 합산 비율이 임계값 95%에 닿기까지의 여유는 정확하지 않은 식별자(`any` 등) 약 153,000개다
  (전체 식별자 수가 같다고 볼 때). 이 여유가 줄어드는 추세를 야간 측정 기록으로 확인한다.
- **target(미구현)**: PR에서 변경한 Studio 파일만 `type-coverage -- <파일>` 형태로 측정하면 프로그램을
  한 번 읽는 비용(힙 약 4GB, 약 100초)만 더해 PR 단계에서도 Studio 회귀를 막을 수 있다. 변경 파일 목록을
  `typecheck` 잡에 전달하는 배선이 필요해 이번 복구 범위에서 제외했다.
