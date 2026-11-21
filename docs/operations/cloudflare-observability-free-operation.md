# Cloudflare Observability 무료 운영과 엣지 오류 진단

상태: **current** — 기본 비활성 오류 진단, 관측 설정 회귀 검사와 실측 입력 계산 절차.
기준일: **2026-11-21**. 아래 계정 상태는 미확인이며, 코드 준비를 운영 활성화 완료로 해석하지 않는다.

## 1. 비용 경계와 현재 확인 상태

사용자는 2026-11-20에 **추가 요금이 발생하지 않는 범위의 변경**을 승인했다. 유료 플랜 전환,
유료 초과 사용, 새 유료 내보내기 대상은 이 승인에 포함되지 않는다. 실제 계정 상태를 확인할 수
없으면 새 수집을 활성화하지 않는다. 기존 데이터 수집을 임의로 끄거나 진단을 삭제하지 않는다.

| 항목 | 2026-11-21 확인 상태 |
| --- | --- |
| Cloudflare 계정 요금제·Observability 사용량·활성 데이터 세트 | 미확인. 2026-11-20 조회는 로그인으로 연결됐으며, 2026-11-21에는 연결된 브라우저 문맥이 없어 계정 화면에 도달하지 못함 |
| 운영 Worker의 배포 SHA·샘플링·보관·Issues | 미확인 |
| 로컬 운영 접근 | 연결된 Desktop Commander 기기 오프라인, 작업 환경에 Cloudflare 인증 없음. 계정 설정 변경·배포 없음 |
| 웹·실시간·apex Worker 저장소 설정 | Observability 정책 미선언. 실제 운영 비활성을 뜻하지 않음 |
| Analytics Worker 설정 생성기 | `observability: { enabled: false }` 선언. 실제 배포 적용 여부 미확인 |
| 새 웹 Worker 오류 진단 | 환경변수 미설정 시 출력 0건. 이 변경은 활성화 변수를 등록하지 않음 |

기본 비활성 오류 진단은 [PR #2848](https://github.com/blue45f/toonstudio/pull/2848)로 이미
병합됐다. 이번 후속 작업은 실제 사용량을 확보했을 때의 계산과 저장소 설정 회귀 검사를 보강한다.
`keep_vars: true`인 웹 Worker는 dashboard의 변수가 유지될 수 있으므로 저장소에 진단 변수가
없다는 사실만으로 운영에서도 비활성이라고 판단하지 않는다.

요금제와 사용량의 과거 기록은 현재 증거가 아니다. 도메인의 Free 표시, R2 바인딩 존재,
Wrangler 설정 생략만으로 현재 Observability Free를 확정하지 않는다.

### 2026-12-01 전후 정책

| 기간·플랜 | 포함량 | 추가 사용의 의미 |
| --- | --- | --- |
| 2026-11-30까지 Workers Logs Free | 200,000 이벤트/일, 3일 보관 | 기존 이벤트 기준 정책 적용 |
| 2026-11-30까지 Workers Logs Paid | 2,000만 이벤트/월, 7일 보관 | 초과 이벤트 요금 가능 |
| 2026-12-01부터 Observability Free | 계정 전체 0.5GB/일, 7일 보관 | 신규 수집 중단. 추가 수집 과금 없음 |
| 2026-12-01부터 Observability Paid | 수집 50GB/청구 주기, 저장 10GB-월/청구 주기 | 수집·저장 초과분을 각각 과금 |

[공식 전환 안내](https://developers.cloudflare.com/observability/pricing/#existing-customers)에서
기존 Free·Pro·Business 고객은 2026-12-01 자동 전환, Enterprise는 다음 계약 갱신 때 적용하며
그전에는 기존 계약을 유지한다. 이 구분과 Observability Free/Paid 적용 상태를 각각 확인한다.

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
   검토하고, **0.4GB/일**을 내부 경고값으로 사용할 수 있다. 앞의 값은 운영 목표, 뒤의 값은
   공식 일일 한도 0.5GB의 80% 경고다. 둘 다 공급자 cap이나 무제한 오류 보존 보장이 아니다.
5. 새 오류 이벤트와 이미 활성인 Issues의 중복 사용량을 고려하고, 무료 조건과 실제 수집 여유를
   확인한 경우에만 진단 변수의 활성화를 검토한다. trace나 새 저장 서비스를 함께 켜지 않는다.

새 진단을 켠 뒤에도 실제 저장·마스킹·이벤트 크기·중복 억제를 확인해야 한다. head sampling을
낮추면 `console.error`도 빠질 수 있다. Issues 감지는 Workers Logs·Traces와 별개지만, 세부 문맥은
수집된 자료에 달리고 Issues 자체도 공용 한도에 포함된다.

R2 Data Access Logs는 상태 400 이상 요청을 제외하고 비동기·최선 노력으로 전달되므로 R2 실패의
완전한 진단·감사 장부가 아니다. 자동 invocation 기록을 끄면 요청 문맥이, trace를 줄이면 호출
시간 분해가 사라진다. 계정 실측 없이 이를 일괄 비활성화하지 않는다.

## 4. 실제 계정 자료로 비용 계산

[`cloudflare-observability-cost.mjs`](../../scripts/cloudflare-observability-cost.mjs)는 계정 접속이나
설정 변경 없이 입력 JSON을 계산한다. `confirmed`는 입력자가 근거를 확인했다는 표시이며,
도구가 계정·계약·청구서를 검증했다는 뜻이 아니다. 계정 식별자, 토큰, 원문 로그는 입력에 필요 없다.

저장소 루트에서 템플릿을 저장소 밖 임시 파일로 만든다. `paid` 대신 `free`도 가능하다.

```bash
usage_file="$(mktemp /tmp/toonstudio-observability-usage.XXXXXX.json)"
node scripts/cloudflare-observability-cost.mjs --template paid > "$usage_file"
# 실제 계정 자료를 확인한 뒤 위 파일의 null·미확인 값을 채운다.
node scripts/cloudflare-observability-cost.mjs --input "$usage_file" --json
```

빈 템플릿의 계산 종료 코드 2는 정상적인 **근거 부족** 판정이다. 값이 없다는 이유로 0을 입력하거나
`confirmed`를 true로 바꾸지 않는다. 입력 파일은 PR·CI artifact에 올리지 않는다.

| 확보할 항목 | 입력·계산 규칙 | 누락 시 의미 |
| --- | --- | --- |
| 실제 Observability 플랜·표준 요금 적용 근거 | `plan`, `pricing.model`, `pricing.confirmed` | Free/Paid 추정 금지. 별도 계약은 표준 요금으로 계산하지 않음 |
| 계정 전체 범위·조회 시각 | `evidence`에 같은 계정의 다른 프로젝트와 기존 저장 데이터 포함 여부를 표시 | ToonStudio 일부만으로 계정 초과요금 판정 금지 |
| Paid의 단일 청구 주기 여부 | `evidence.singleBillingCycle`로 한 번에 하나의 실제 청구 주기 안만 계산하는지 확인 | 서로 다른 주기의 사용량·포함량을 합산해 남는 포함량을 이월하지 않음 |
| 계산 대상 기간과 관측 완료일 | `period`에 새 요금 적용 구간의 시작·끝·자료 확보일까지 표시 | 실제 청구 주기, 전환일의 적용 시각·시간대와 부분일 처리 확인 필요 |
| Paid 실제 포함량 | `ingestionAllowanceGB`, `storageAllowanceGBMonth`를 명시 | 표준 50GB·10GB-월의 전환 주기 적용·일할 계산을 임의 가정하지 않음 |
| Paid 계정 수집량 | `usage.ingestionGB`, 비압축 GB 기준 | 이벤트 수·요청 수·R2 객체 크기로 대신 계산하지 않음 |
| Paid 일별 최대 조회 가능 용량 | `usage.dailyStorage`에 계산 구간의 모든 날짜와 최대 GB | 월말 용량·현재 용량·7일 보관 근사로 실측 저장량을 대체하지 않음 |
| Free UTC 일별 수집량 | `usage.dailyIngestion`에 누락·중복 없는 UTC 날짜별 GB | 월 합계·평균만으로 일일 한도 충족 판정 금지 |
| 동일 범위·동일 기간의 이전 추가요금 | `comparison.oldAdditionalUsd`, `sameScopeAndPeriod` | 미확인이면 비용 증가분은 계산하지 않음 |

일별 배열의 한 행은 Paid에서 `{ "date": "YYYY-MM-DD", "maxQueryableGB": null }`, Free에서
`{ "date": "YYYY-MM-DD", "ingestionGB": null }` 형식이다. 실제 날짜·실측값으로 바꾸고 대상 날짜를
모두 포함한다. `null`은 0이 아닌 미확인 값이며, 무수집일도 실제 0이 확인됐을 때만 0을 기록한다.

GB는 공급자 화면·내보내기의 비압축 GB 단위를 사용한다. 별도 과금인 Log Explorer (Legacy)의
사용량을 공용 포함량에 섞지 않는다. 별도 계약, 표준 요금 적용 전 기간, 임의의 보관 연장 요금은
이 계산기의 지원 범위가 아니며 해당 계약·요금표로 따로 검증한다.

Free의 날짜 경계는 UTC다. Paid의 `evidence.capturedAt`은 공급자가 일별 집계에 사용하는
시간대의 offset으로 기록한다. 자료 확보일보다 미래인 날짜를 실측으로 표시하면 입력 오류다.
`observed_complete`는 마지막 집계일이 끝난 뒤에만 사용하며, 당일 진행 중인 자료에는
`in_progress`, 미래 시나리오에는 `forecast`를 사용한다. 날짜가 지났더라도 공급자 집계 반영이
완료됐는지 따로 확인해야 한다.

표준 Paid 요금이 실제 적용된다는 근거가 있을 때만 다음을 계산한다.

```text
I = 해당 구간 계정 전체 수집 GB
S = 해당 구간 일별 최대 queryable GB의 합계 / 30
C_new_USD = 0.25 × max(I − 실제 수집 포함량, 0)
          + 0.10 × max(S − 실제 저장 포함량, 0)
delta_USD = C_new_USD − 동일 범위·동일 기간의 이전 추가요금
```

`C_new_USD`는 새 Observability 수집·저장 초과분의 참고 계산이다. 고정 구독료, Workers 요청·CPU,
R2, 외부 내보내기, 세금·환율을 포함한 월 청구액이 아니다. 크레딧을 적용해 최종 결제가 0이어도
초과 사용량이 없었다는 뜻은 아니다. 아주 작은 양수 초과분도 반올림해 0원 달성으로 판정하지 않는다.

| 결과 | 해석·후속 조치 |
| --- | --- |
| `needs_evidence`, `unsupported_plan`, `invalid_input` | 판정 보류. 부족한 자료나 형식을 보완하고 다시 실행 |
| `observed_within_allowance` | 입력한 관측 구간은 포함량 이내. 진행 중 주기의 나머지 기간까지 0원이라는 뜻은 아님 |
| `observed_overage`, `forecast_overage` | 입력 범위에서 양수 초과분. 원인을 데이터 세트별로 확인하고 조건부 조정 |
| `forecast_within_allowance` | 예상 입력에서만 포함량 이내. 실제 사용량·청구 결과와 분리 |
| `free_cap_reached` | Free 금전 초과요금과 별개로 수집 중단·오류 진단 누락 위험 확인 |

종료 코드 0은 입력 구간에서 포함량 이내, 1은 초과 또는 Free 한도 도달, 2는 입력·근거 부족이다.
계산기는 어떤 경우에도 최종 청구 검증 완료를 반환하지 않는다. 최종 상태는 실제 청구서의 해당
항목까지 확인한 뒤 **해당 청구 주기 0원 검증 완료**로 기록한다.

### 적용 전·후 우선순위

| 우선순위·시점 | 확인·작업 | 완료 근거 |
| --- | --- | --- |
| P0 · 2026-11-23~24 | 요금제, 실제 청구 주기·포함량, 계정 공용 데이터 세트, 실제 배포 설정 확보 | 조회 시각과 출처를 남긴 비밀 제외 목록 |
| P0 · 2026-11-25 | 평시·피크·수집 중지 시나리오를 계산. 기존 잔존 저장량 포함 | 각 입력의 관측·예상 구분, 수집·저장 독립 계산 |
| P1 · 2026-11-27~29 | 초과 가능성이 확인된 경우에만 불필요한 로그·속성·중복 수집 또는 샘플링 조정 검토 | 변경 전후 계정 사용량, 오류 진단·요청 응답 보존 확인 |
| P0 · 2026-11-30 | 적용 플랜·시각, 배포된 설정, 잔여 포함량과 관측 가능성 최종 확인 | 0원 예상 조건 충족 또는 판정 보류를 명시 |
| P0 · 2026-12-01 적용 직후·첫 주 | 수집 GB, 일별 최대 저장 GB, 초과 항목, Free 수집 중단과 진단 누락 확인 | 자료 반영 지연을 고려한 일별 비교 |
| P1 · 보관 만료·첫 실제 청구 마감 | 잔존 데이터 감소와 누적 저장 사용량, 최종 항목 대조 | 해당 청구 주기 검증 결과와 다음 주기 잔여 위험 |

수집을 중지해도 기존 데이터가 만료되기 전 저장 비용이 남을 수 있고, 이미 누적된 GB-월과
초과분은 되돌아가지 않는다. Paid의 내부 경고는 **실제 적용 포함량의 80%**를 기준으로 관측 누적과
주기 말 예측을 각각 확인한다. 표준 전체 포함량이 확인된 경우에만 40GB·8GB-월에 해당한다.
경고는 자동 차단이나 비용 보장이 아니다.

## 5. 저장소에서 새 수집의 우발적 활성화 방지

[`cloudflare-observability-policy.mjs`](../../scripts/cloudflare-observability-policy.mjs)를 기존
무료 인프라 검증기에 연결한다. 웹·실시간·apex Wrangler의 명시적인 관측 활성화, 환경별 override,
진단 opt-in과 Analytics 생성 결과를 검사한다. 새 명시 활성화는 계정·요금·사용량 근거와 함께
정책을 별도 검토해야 한다. 검사 통과가 운영 계정의 수집 중단 또는 0원 보장을 뜻하지 않는다.

미선언인 기존 설정은 그대로 둔다. 계정 확인 없이 `observability.enabled=false`를 일괄 삽입하지
않으며, 배포된 dashboard 설정이나 이미 저장된 데이터를 수정하지 않는다. 기존 요청 처리와
진단 코드의 기본 비활성 동작은 유지한다.

## 6. 검증·반영·중지

저장소 루트, 설치된 프로젝트 의존성으로 실행한다. 아래 명령은 계정 변경이나 운영 배포를 하지 않는다.

```bash
node --test scripts/cloudflare-observability-cost.test.mjs scripts/cloudflare-observability-policy.test.mjs
pnpm exec vitest run scripts/free-infrastructure-policy.test.mjs scripts/deploy-cloudflare-analytics.test.mjs
node scripts/verify-free-infrastructure-policy.mjs
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

### 2026-11-21 후속 검증 기록

- Node에서 계산기 49개·관측 정책 30개, 총 **79개 테스트 통과**. 누락 근거·미래 실측·단일 청구
  주기·독립 저장 초과·소액 양수·Free UTC 한도·Wrangler 환경별 활성화를 포함한다.
- Vitest에서 계산기·관측 정책·기존 무료 인프라·Analytics **4개 파일, 348개 테스트 통과**.
  새 두 테스트는 기존 필수 CI 회귀 목록에 등록했다.
- 전체 `pnpm typecheck`는 전체 프로그램 목록 생성 중 `SIGKILL`로 **미완료**다. 이 실행에서
  Web 또는 API 전체 타입 검사를 통과했다고 보고하지 않는다. 필수 원격 CI 결과는 해당 PR의
  실제 커밋을 기준으로 확인해야 하며, 기존 main의 실패를 새 변경의 성공으로 바꾸지 않는다.
- 계정 조회·플랜 전환·수집 설정 변경·진단 활성화·Worker 배포는 수행하지 않았다. 실측값을
  확보하지 않았으므로 실제 월 청구액, 비용 증가분, 추가 요금 0원 달성 여부는 미확정이다.

## 공식 근거

- [Cloudflare Observability 요금](https://developers.cloudflare.com/observability/pricing/)
- [Workers Logs 설정·이전 요금·샘플링](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
- [Workers Issues와 배포 시 설정 유지](https://developers.cloudflare.com/workers/observability/issues/)
- [Issues 감지·문맥·보관](https://developers.cloudflare.com/workers/observability/issues/investigate/)
- [R2 Data Access Logs 범위](https://developers.cloudflare.com/r2/buckets/data-access-logs/)
- [GitHub Actions 과금과 저장량](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
