# Cloudflare Observability 무료 운영과 엣지 오류 진단

상태: **current** — 기본 비활성 오류 진단 코드와 운영 확인 절차.
기준일: **2026-11-20**. 아래 계정 상태는 미확인이며, 코드 준비를 운영 활성화 완료로 해석하지 않는다.

## 1. 비용 경계와 현재 확인 상태

사용자는 2026-11-20에 **추가 요금이 발생하지 않는 범위의 변경**을 승인했다. 유료 플랜 전환,
유료 초과 사용, 새 유료 내보내기 대상은 이 승인에 포함되지 않는다. 실제 계정 상태를 확인할 수
없으면 새 수집을 활성화하지 않는다. 기존 데이터 수집을 임의로 끄거나 진단을 삭제하지 않는다.

| 항목 | 2026-11-20 확인 상태 |
| --- | --- |
| Cloudflare 계정 요금제·Observability 사용량·활성 데이터 세트 | 미확인. 사용량 화면이 로그인으로 연결됨 |
| 운영 Worker의 배포 SHA·샘플링·보관·Issues | 미확인 |
| 로컬 운영 접근 | 연결된 Desktop Commander 기기 오프라인, 작업 환경에 Cloudflare 인증 없음 |
| 웹·실시간·apex Worker 저장소 설정 | Observability 정책 미선언. 실제 운영 비활성을 뜻하지 않음 |
| Analytics Worker 설정 생성기 | `observability: { enabled: false }` 선언. 실제 배포 적용 여부 미확인 |
| 새 웹 Worker 오류 진단 | 환경변수 미설정 시 출력 0건. 이 변경은 활성화 변수를 등록하지 않음 |

요금제와 사용량의 과거 기록은 현재 증거가 아니다. 도메인의 Free 표시, R2 바인딩 존재,
Wrangler 설정 생략만으로 현재 Observability Free를 확정하지 않는다.

### 2026-12-01 전후 정책

| 기간·플랜 | 포함량 | 추가 사용의 의미 |
| --- | --- | --- |
| 2026-11-30까지 Workers Logs Free | 200,000 이벤트/일, 3일 보관 | 기존 이벤트 기준 정책 적용 |
| 2026-11-30까지 Workers Logs Paid | 2,000만 이벤트/월, 7일 보관 | 초과 이벤트 요금 가능 |
| 2026-12-01부터 Observability Free | 계정 전체 0.5GB/일, 7일 보관 | 신규 수집 중단. 추가 수집 과금 없음 |
| 2026-12-01부터 Observability Paid | 수집 50GB/청구 주기, 저장 10GB-월/청구 주기 | 수집·저장 초과분을 각각 과금 |

새 Free의 일일 한도는 00:00 UTC, 한국 시간 09:00에 재설정된다. 이미 저장한 자료는 보관
기간까지 조회할 수 있다. Paid의 수집·저장 포함량은 독립적이다. 새 수집 요금은 2026-12-01
이후 받은 데이터에 적용하지만, Paid의 당일 잔존 데이터는 그날부터 저장 사용량에 포함된다.

Workers Logs·Traces, Cloudflare Traces, R2 Data Access Logs, AI Gateway logs, Containers logs,
Issues는 계정의 한도를 공유한다. R2 객체 용량·전송량, 자체 분석 DB의 90일 보관, 실시간
재전송 상태의 15분 보관은 Observability 로그 사용량·보관 기간이 아니다.

수집 크기는 이벤트 본문과 플랫폼·사용자 속성의 비압축 크기다. `console.error` 추가만으로도
이미 켜진 저장 로그와 Issues 사용량이 늘 수 있다. 작은 메시지나 낮은 샘플링률은 Paid에서
추가 요금이 없다는 보장이 아니다. Workers CPU·요청 spending limit도 Observability 상한이 아니다.

## 2. 웹 Worker의 기본 비활성 오류 진단

구현: [`edge-error-diagnostics.ts`](../../deploy/cloudflare-static/src/edge-error-diagnostics.ts).
호출 위치: [`index.ts`](../../deploy/cloudflare-static/src/index.ts)의 R2 예외와 상위 API 예외 경로.

`EDGE_ERROR_DIAGNOSTICS_ENABLED`가 정확히 문자열 `true`일 때만 기록한다. 미설정, `false`,
`1`, `TRUE`, 공백을 포함한 값은 모두 비활성이다. 비활성 상태에서는 오류 분류·요청 헤더 읽기·
시각 조회·직렬화·console 출력도 실행하지 않는다. 원래 응답 본문·상태, 재시도 및 R2 폴백을 유지한다.

이 함수는 fetch, KV, R2, Durable Object 쓰기 또는 외부 exporter를 추가하지 않는다. 정상 요청,
정적 파일 성공, health 응답에 새 기록을 추가하지 않는다. Wrangler의 logs·traces·Issues·persist·
head sampling이나 기존 공급자 수집 설정도 바꾸지 않는다. 이 변수만 켜도 저장 로그가 활성화되는
것은 아니므로 실제 저장 수집기 상태를 따로 확인해야 한다.

### 기록 필드와 제한

| 필드 | 내용 |
| --- | --- |
| `event` | 고정값 `edge_dependency_failure` |
| `at` | 정수 Unix 시각(ms) |
| `dependency` | `r2` 또는 `upstream` |
| `route` | core·public-read 등 고정 분류. 실제 URL·경로는 제외 |
| `operation` | R2 get/head/응답 처리 또는 upstream fetch/응답 처리 |
| `errorType` | 허용된 JavaScript 오류 이름 또는 `unknown` |
| `attempt`, `retrying` | 제한된 시도 횟수와 읽기 재시도 여부 |
| `releaseSha` | 유효한 소문자 40자리 SHA가 있는 경우만 |
| `rayId` | 허용 형식의 CF-Ray가 있는 경우만 |

원문 exception/message/stack, 객체 key, URL/query, header 묶음, body, 인증 값, 사용자·문서·방
식별자를 새 진단 JSON에 기록하지 않는다. Cloudflare가 자동으로 붙이는 요청 속성은 실제 저장
로그에서 따로 확인한다. 오류의 사용자 정의 getter를 실행하지 않으며, 분류나 출력이 실패해도
기존 요청 처리를 실패시키지 않는다.
`name`이 accessor인 실제 `DOMException`의 abort·timeout도 이 방어 때문에 `unknown`으로
분류될 수 있다. HTTP 오류 응답이나 R2의 정상적인 `null` 반환은 잡힌 예외가 아니므로 이 진단의 대상이 아니다.

- 출력 JSON은 ASCII 허용 목록으로 구성하며 최대 **512바이트**다. Cloudflare가 붙이는 속성은
  이 크기에 포함되지 않으므로 청구 이벤트 전체가 512바이트 이하라는 뜻은 아니다.
- 같은 route·operation·오류 종류·재시도 여부는 60초 고정 창에서 처음 한 번만 기록한다.
- 하나의 gateway 인스턴스/isolate에서 같은 창에 최대 **20건**만 기록한다. 이동하는 임의의 60초
  구간에 대한 제한은 아니며, 창 경계에서는 짧은 시간에 20건보다 많이 기록될 수 있다.
- 이 제한은 계정 전체의 GB·비용 상한이 아니다. 다른 isolate, 다른 Worker와 데이터 세트는 별도다.
- 중복으로 생략된 오류의 수와 요청 문맥은 남지 않는다. 출력 건수를 전체 실패 건수로 사용하지 않는다.

## 3. 활성화 전 읽기 전용 확인

운영자 또는 승인받은 작업자가 대상 계정에서 다음을 확인하고, 조회 시각·기간·근거를 기록한다.
원문 로그·비밀값을 공개 PR이나 CI 출력에 붙이지 않는다.

1. Workers 구독과 Observability Free/Paid 적용 상태를 각각 확인한다. Paid이거나 미확인이면
   새 진단은 계속 비활성으로 둔다. 기존 요금은 새 진단을 끈 것만으로 차단되지 않는다.
2. 계정 전체와 데이터 세트별 일별 수집량, 최근 피크, 저장 사용량, 한도 도달 여부를 확인한다.
   2026-11-30 이전 이벤트 수와 2026-12-01 이후 GB 기준을 섞지 않는다.
3. 웹·실시간·apex·analytics Worker별 실제 logs, invocation logs, traces, Issues, sampling,
   persist와 배포 버전을 확인한다. 도메인 trace rule, R2 버킷 로그, AI Gateway와 export도 확인한다.
4. 같은 계정의 다른 프로젝트 사용량을 합산한다. 새 정책의 내부 운영 목표로 **0.35GB/일 이하**를
   검토할 수 있지만, 이는 공식 cap이나 무제한 오류 보존 보장이 아니다.
5. 새 오류 이벤트와 이미 활성인 Issues의 중복 사용량을 고려하고, 무료 조건과 실제 수집 여유를
   확인한 경우에만 진단 변수의 활성화를 검토한다. trace나 새 저장 서비스를 함께 켜지 않는다.

새 진단을 켠 뒤에도 실제 저장·마스킹·이벤트 크기·중복 억제를 확인해야 한다. head sampling을
낮추면 `console.error`도 빠질 수 있다. Issues 감지는 Workers Logs·Traces와 별개지만, 세부 문맥은
수집된 자료에 달리고 Issues 자체도 공용 한도에 포함된다.

R2 Data Access Logs는 상태 400 이상 요청을 제외하고 비동기·최선 노력으로 전달되므로 R2 실패의
완전한 진단·감사 장부가 아니다. 자동 invocation 기록을 끄면 요청 문맥이, trace를 줄이면 호출
시간 분해가 사라진다. 계정 실측 없이 이를 일괄 비활성화하지 않는다.

## 4. 검증·반영·중지

저장소 루트, 설치된 프로젝트 의존성으로 실행한다. 아래 명령은 계정 변경이나 운영 배포를 하지 않는다.

```bash
pnpm exec vitest run deploy/cloudflare-static/src/index.test.ts
pnpm run typecheck:cloudflare-static
pnpm harness:verify
```

테스트는 기본·잘못된 opt-in의 출력 0건, 비밀정보와 getter 제외, JSON 크기, 중복·빈도 제한,
출력 실패 시 요청 계약, R2 폴백·HEAD, 읽기 재시도와 POST 실패를 검증한다.

PR 생성·병합은 기존 CI를 실행할 수 있다. 공개 저장소의 표준 runner 무료 정책과 별개로 현재
artifact·cache 한도 및 비용 차단 상태를 확인한다. 비용을 피하려고 CI를 우회하거나 검증을 약화하지 않는다.
운영 반영은 [`DEPLOY.md`](../../DEPLOY.md)의 정확한 main SHA·core/verify·롤백 조건을 따른다.

진단 활성화 후 불필요한 수집이나 위험한 출력이 보이면 해당 변수만 `false`로 돌려 새 진단을
중지하고 확인한다. 기존 logs·traces·Issues를 일괄 끄거나 이미 보관한 자료를 삭제하지 않는다.
요청 처리 회귀가 생기면 직전 검증된 Worker 버전으로 복구한다. 진단 비활성 상태에서는 새 오류
문맥도 남지 않으므로, 코드 준비와 실제 장애 관측 완료를 별도로 보고한다.

### 2026-11-20 검증 기록

원격 병합 준비 기준 main은 `468d7451a90ff206147e219cd268a7615327cd4b`다. 이 기준까지의 최신 변경은
Cloudflare 설정·소스와 겹치지 않았다.

- `verify:cloudflare-static`: 응답 정책 검사, 전용 TypeScript 검사, 8개 파일의 239개 테스트 통과.
- 하네스 구조 검사·자체 테스트 7개, lockfile importer, workspace links, 변경 파일 ESLint·Secretlint 통과.
- 초기 약 10GB 작업 환경의 `harness:verify` 전체 실행은 **미완료**였다. 전체 Web 타입 검사의 전역·구문 단계에서 `SIGKILL`이
  발생했고, 같은 검사 범위에서 Node 메모리 상한을 낮춘 재시도도 heap 부족 또는 `SIGKILL`로 종료됐다.
  코드 오류가 없다는 증거로 해석하지 않는다. 이 실행에서 API 타입 검사까지 통과했다고 보고하지 않는다.
  메모리가 충분한 환경에서 수행하는 후속 검증의 결과는 해당 PR과 CI 실행 기록으로 확인한다.
- 2026-11-20 GitHub의 인증된 계정 예산 화면에서 계정 전체 Actions 예산 `$0.00`, 사용액
  `$0.00`, 상태 `Usage blocked`를 확인했다. 예산·상한·워크플로 설정은 변경하지 않았다.
  이 확인은 과거 청구액이나 Cloudflare 계정의 요금이 0이라는 뜻이 아니다.
- 사용자의 원격 병합 지시에 따라 로컬 전체 검사 미완료 사실을 PR에 기록하고, 같은 변경
  커밋의 정본 CI에서 전체 저장소 검증과 `core`·`verify`의 실제 성공을 확인한 뒤 병합한다.
  초기 실패 기록을 통과로 바꾸거나 CI·테스트·보호 설정을 약화하지 않는다.
- Cloudflare 계정 조회·진단 활성화·운영 배포는 완료되지 않았다. 이미 받은 무료 범위 승인은
  유효하며, 필요한 것은 추가 승인 대신 계정 접근과 검증 조건이다.

## 공식 근거

- [Cloudflare Observability 요금](https://developers.cloudflare.com/observability/pricing/)
- [Workers Logs 설정·이전 요금·샘플링](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
- [Workers Issues와 배포 시 설정 유지](https://developers.cloudflare.com/workers/observability/issues/)
- [Issues 감지·문맥·보관](https://developers.cloudflare.com/workers/observability/issues/investigate/)
- [R2 Data Access Logs 범위](https://developers.cloudflare.com/r2/buckets/data-access-logs/)
- [GitHub Actions 과금과 저장량](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
