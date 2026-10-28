# 확장 지점 인덱스 (2026-10-28)

상태: 현재 상태 기록. 코드 변경 없음. 아래 레지스트리 표는 새로 만드는 것이 아니라, 이미 있는 확장 지점을 가리키는 지도다. 전체 목록을 새로 열거한 것이 아니며, 확인하지 않은 항목은 확인되지 않았다고 적는다.

## 기본 규칙

- 의존 방향은 한 방향이다: `apps → packages → core`. 역방향은 금지한다.
- 새 기능을 만들 때 기존 파일 본문에 덧붙이지 않는다. 먼저 이 문서의 해당 지점을 확인하고, 그 지점이 정한 진입점을 쓴다.
- 경계는 기계로 강제한다: `config/architecture-boundary-ratchet.json`, `config/architecture-source-ratchet.json`, `scripts/validate-app-boundaries.mjs`.
- 생성 파일(`*.generated.ts`)과 DB 마이그레이션은 손으로 고치지 않는다. 마이그레이션은 dry-run만 한다.
- 돈이 오가는 코드는 나누기 전에 멱등 키 확인이 먼저다.

## L3: 이미 있는 확장 지점

| 확장 종류 | 진입점 | 규칙 |
| --- | --- | --- |
| 새 크리에이터 도구 | `apps/web/src/domains/creator/<도구>/` | EditorHost는 조립만 한다. 도구 로직을 본문에 넣지 않는다. 무거운 하위 모듈은 `lazy()`+`Suspense`로 나눈다. |
| 새 렌더 엔진 | `packages/studio-engine-<이름>/` + `packages/studio-engine-registry`의 역할 장부 | 기존 엔진 본문을 고치지 않는다. 새 엔진은 장부에 한 행을 추가한다. |
| 포맷 입출력 | `packages/studio-format-gateway` | 포맷 입출력은 게이트웨이를 통해서만 한다. `csp-*` 파일은 이름 바꾸기 전에 레지스트리 문서를 먼저 만든다. |
| 새 마켓 기능 | `packages/contracts` 하위 경로 export + `apps/api/src/modules/creator-marketplace/` | 이미 있는 대형 repo/service 쌍에 덧붙이지 않고 수명 주기별로 나눈다. 라이브러리 저장소와 중복 쿼리를 먼저 확인한다. |
| 새 AI 제공자 | 범용 제공자 패턴(인터페이스 + HTTP 구현 + 설정 계층 + 팩토리) | 서비스·DTO·크레딧 로직에 제공자 이름을 쓰지 않는다. 제공자 이름은 프리셋·폴백·문서에만 둔다. 환경변수 패턴: `_API_KEY`(필수), `_PROVIDER`(기본값 있음), `_BASE_URL`(기본 제공자 외 필수), `_TIMEOUT_MS`(15000), `_CREDITS_PER_*`. |
| 명령 | `packages/studio-command-registry` | 카탈로그와 베이스의 역할이 다르다. 베이스는 역사 증거로 남기고, 카탈로그가 호환 이관을 적용한다. |

## L5: 경계 규칙과 확인된 위반 1건

- `apps/api/src/server/kmas.ts` 1행은 `packages/core/src/catalog/catalog-store`를 직접 import한다. 이는 `@toonstudio/core` 공개 export를 우회하는 확인된 위반이다.
- 수정 순서(중위험, 1개씩): kmas를 이미 있는 공개 경로 `@toonstudio/core/catalog`로 전환 → knip + 타입체크 + kmas 관련 테스트. 새로운 export 추가는 필요 없다(2026-10-28 확인, `web-api-format-public-surface-index-2026-10-28.md` 참조). 이 순서를 바꾸지 않는다.
- core 배럴에 새로운 `export *` 도메인을 추가하지 않는다. 하위 경로를 먼저 만들고, 기존 index는 호환용으로 둔다.
- 새 패키지는 5가지 조건을 모두 만족해야 한다: 독립 공개 표면, 2개 이상 소비자, 한 방향 의존 가능, 독립 테스트 가능, 버전 정책상 가치.

## L1·L2·L4: 다음 문서로 남김 (아직 만들지 않음)

- L1 web↔API 대응표: 새 기능을 시작하기 전에 행을 먼저 추가하는 것이 규칙이지만, 전체 대응표 문서는 아직 없다.
- L2 포맷 코드 레지스트리: `csp-*` 코드 이름 → 포맷 이름 → 진입점의 전체 목록은 아직 없다. 파일명을 바꾸기 전에 이 문서를 먼저 만든다.
- L4 contracts·core 공개 표면 인덱스: `packages/contracts/src/index.ts`는 작지만 package.json이 여러 하위 경로를 export하므로, 공개 표면은 index가 아니라 `public-exports.test.ts`를 기준으로 확인한다. 전체 인덱스는 아직 없다.

## 확인하지 않은 것

- 위 진입점의 존재만 2026-10-28에 확인했다. 각 엔진·포맷·마켓 모듈의 전체 목록, 크레딧 단가표, 검증 시나리오 목록은 이 문서에서 주장하지 않는다.
- `apps/api/src/platform/federated-data-plane/`과 `deploy/federated-data-plane/` 두 위치가 의도된 중복인지 여부는 미확인이다.
