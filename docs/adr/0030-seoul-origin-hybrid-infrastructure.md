# ADR-0030: Seoul-origin hybrid — Core API·DB는 onpod 서울, 웹 엣지는 Cloudflare 유지

- 상태: **Accepted**(소유자 2026-10-22 대화 승인) — 컷오버는 실행하지 않았고 별도 승인 대기
- 날짜: 2026-10-22
- 범위: Core API 런타임, PostgreSQL 원장, 웹 정적·엣지·실시간의 호스팅 위치와 비밀값 저장 규칙. 제품 기능과 데이터 모델은 범위 밖이다.
- 관련: [ADR-0029](0029-onpod-hosting-migration.md)(DB 판정을 이 문서가 대체), [인프라 지도](../operations/infrastructure-map.md), [운영 DB / 데이터 플레인 정본](../operations/canonical-database-topology.md), [최소 비용·수동 전용 배포 정책](../operations/minimum-cost-deployment-policy.md), [`AGENTS.md`](../../AGENTS.md) 8·9절
- 문서 상태: 결정은 `migration`, 근거 수치는 `current`(2026-10-22 직접 측정)다.

## 맥락

2026-10-22 운영 Core API(Render 무료)는 `toonspectrum_app` 역할의 DB 비밀번호 인증 실패로 재시작을 반복했다. DB 정본으로 적힌 Supabase 프로젝트는 일시정지(`INACTIVE`)였고 Neon은 quota 오류였다. 소유자는 "도메인만 유지하고 새로 만든다, 공식 운영 전이라 이전할 의미 있는 데이터가 없다, onpod를 메인으로 무료 한도 안에서 최적으로 구성하고 onpod에서 무료로 가능한 것은 onpod로 둔다"고 결정했다.

ADR-0029는 Core API만 onpod로 옮기고 DB는 Supabase를 유지하라고 제안했고, 정적 웹의 이전 가능성과 무료 서버 앱의 실제 동작을 신규 세션이 측정하라고 남겼다. 이 ADR은 그 측정 결과와 소유자의 새 결정을 기록한다.

## 결정

1. **PostgreSQL 원장은 onpod `toonstudio-db`(서울, dev 플랜, PG 17.10, 0원)로 한다.** Supabase `toonspectrum-collaboration`과 Neon은 legacy로 내린다(삭제는 별도 승인).
2. **Core API는 onpod 앱 `toonstudio-api`(서울, 무료 티어)로 옮긴다.** 이미지는 지금까지와 같은 SHA 핀 공개 GHCR 이미지를 쓰고 서버 소스 빌드는 쓰지 않는다.
3. **웹 정적·엣지 게이트웨이·R2·실시간(Durable Objects)·apex 리다이렉트는 Cloudflare에 둔다.** 아래 측정이 이유다.
4. **컷오버는 Cloudflare Worker의 `CORE_API_ORIGIN`과 시크릿 `CORE_ORIGIN_SECRET`만 바꾸는 한 번의 변경이다.** 변수·시크릿 변경이므로 변경 표를 제시하고 사용자의 명시적 승인을 받은 뒤에만 한다.
5. **실제 비밀값은 `.env.infrastructure.local` 하나에만 둔다.** onpod는 주입한 값을 읽을 때 가려 주고 DB 비밀번호는 서버에 평문으로 없으므로 이 파일이 유일한 사본이다. 새로 만든 값은 만든 즉시 저장하고, 재발급이 일어나는 절차(`--attach-db` 배포, `rotate-password`)는 직후 동기화를 필수로 한다.

## 근거 (2026-10-22 직접 측정)

| 질문 | 측정 | 결과 |
| --- | --- | --- |
| 웹 셸을 onpod 정적으로 옮길 수 있는가 | 프로토타입 `ts-web-proto`(운영 빌드 2,386개·약 404 MB) | 불가. `_headers` 미지원으로 보안 헤더·캐시 제어가 없고, `/studio`에서 `crossOriginIsolated=false`라 SAB 경로가 꺼진다. `_redirects` 프록시는 GET·HEAD만 통과해 모든 쓰기 API가 405다. 사이트당 약 100 MiB·5,000개 한도를 넘는다 |
| 무료 서버 앱으로 Core API가 서는가 | `toonstudio-api` 배포 | 선다. 공개 GHCR 이미지를 자격 등록 없이 배포했고 `/api/health/live` 200이다. 부팅 정점 RSS 약 482 MiB(한도 512 MiB)로 여유가 작다 |
| 운영 스키마가 onpod DB에 올라가는가 | 공식 부트스트랩 순서 재현 | 올라간다. 마이그레이션 113개 적용, 원장 114행, 검증 12/12. 다만 TLS·역할 제약으로 공식 러너를 그대로 쓸 수 없다 |
| 앱이 완전한가 | `/api/health/ready`·`capabilities` | **아니다.** 마켓플레이스 ACL 플래그 6개가 false라 준비성이 503이고 DB 기반 기능이 `unavailable`이다 |
| onpod 뒤에서 클라이언트 IP를 볼 수 있는가 | 헤더 에코 앱 | ingress가 `X-Forwarded-For`를 `실제 클라이언트, 프록시`로 덮어쓴다. Worker 경유 시 API가 실제 사용자 IP를 못 볼 가능성이 높다 |

## 결과와 트레이드오프

- 얻는 것: 0원, 한국 리전, 운영 DB·API가 한 공급자 안에 있고 앱↔DB가 내부 호스트로 닿는다. 웹과 엣지는 검증된 Cloudflare 구성을 그대로 쓴다.
- **보안 계약이 낮아지는 곳**: onpod DB의 인증서는 자체 서명이라 `verify-full`이 불가능하다. 앱은 `sslmode=no-verify`(암호화 유지, 서버 인증서 검증 생략)로 내부 호스트에 붙는다. 이는 ADR-0029가 "하지 않는다"고 적은 TLS 검증 완화이며, 소유자의 이 결정으로 수용한다. 공식 마이그레이션 검증기의 `verify-full` 계약은 바꾸지 않고, onpod 전용 도구(`deploy/onpod/schema-apply`)가 우회한다.
- **역할 분리가 없다**: 접속 역할이 소유자 하나다. 공식 설계의 "마이그레이터와 런타임 역할 분리"가 성립하지 않아 마켓플레이스 ACL 준비성이 풀리지 않는다. 해결 전에는 컷오버하지 않는다(아래 열린 문제).
- 무료 티어는 30분 무요청이면 절전하고 콜드 스타트를 겪는다. 웹은 502/503/504를 "깨우는 중"으로 90초까지 처리하고 Cloudflare가 정적 요청과 liveness를 대신 답하므로 영향은 동적 요청에 한정된다(현재 Render 무료와 같은 구조).
- 계약상 가용성·상업적 이용 보증이 없다(ADR-0029 위험과 같다). 컷오버 뒤에도 변수 하나로 이전 origin으로 돌아올 수 있게 한다.

## 대안과 기각 이유

| 대안 | 기각 이유 |
| --- | --- |
| 전부 onpod(정적·게이트웨이·실시간까지) | 헤더·격리·메서드·용량 때문에 무료로 불가능하고, 유료 상시 가동과 약 9천 줄 재작성이 필요하다(월 약 3만 9천 원 규모) |
| DB를 Supabase에 유지·복구 | 소유자의 새 결정과 충돌한다. 단, 아래 열린 문제 1이 막히면 폴백 후보다(Seoul PG17, 역할 생성 가능) |
| 유료 승급(`hobby` 앱 + `basic` DB, 월 약 2만 9천 원) | 지금은 무료로 충분히 검증되지 않았다. 메모리 승급은 `hobby`로는 풀리지 않는다(둘 다 512 MB). 필요 시 비용 승인으로 |

## 열린 문제 (해결 전 컷오버 금지)

1. **마켓플레이스 ACL 준비성**: 단일 소유자 역할은 SQL로 해결되지 않는다. A) onpod가 비소유 로그인 역할을 발급하게 한다(권장, 코드 변경 없음). B) `isSchemaReady()`의 여섯 비교를 환경변수 스위치로 건너뛰는 임시 코드 변경(새 이미지 릴리스 필요, 런타임 비소유 보장이 약해짐). 소유자 결정 사항이다.
2. **클라이언트 IP**: 신뢰 프록시 설정이 정확한 IP 목록만 받고 onpod 피어가 가변이며 ingress가 헤더를 덮어쓴다. Worker가 출처 비밀을 증명한 요청에서만 신뢰하는 전용 헤더를 API가 인정하도록 `auth-client-ip.ts`를 확장하는 방안을 컷오버 전에 실측과 함께 검토한다.
3. **원격에만 있는 비밀값**(OAuth·Toss·AI 공급자 등): 확보 경로를 소유자가 정한다. 확보 전에는 Render와 Worker 시크릿을 삭제·중지하지 않는다.
4. **0093 마이그레이션 결함**: 비한정 `CREATE FUNCTION`이 슈퍼유저가 아닌 마이그레이터에서 실패한다. 운영에도 영향이 있다.
5. 메모리 여유(약 30 MiB), 사용자 도메인·약관(상업적 이용) 확인은 컷오버 전 관찰 항목이다.

## 되돌리기

- 컷오버 전: 병렬 스테이징이므로 되돌릴 것이 없다. `onpod app rm toonstudio-api`, `onpod db rm toonstudio-db`(7일 유예)로 철수하며 둘 다 사용자 승인이 필요하다.
- 컷오버 후: Worker의 `CORE_API_ORIGIN`·`CORE_ORIGIN_SECRET`을 이전 값으로 되돌려 재배포한다. 이전 origin이 Render이면 Render의 `CLOUDFLARE_EDGE_ORIGIN_SECRET`을 컷오버 전에 같은 새 값으로 맞춰 둔다.
