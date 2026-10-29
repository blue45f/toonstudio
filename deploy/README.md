# deploy/ 인덱스 — 배포 단위 지도 (삭제·이동 결정용이 아님)

> 이 파일은 새로 추가된 인덱스이다. 배포 단위를 삭제하거나 합치지 않는다.
> 각 단위의 실제 가동 여부, 트리거, 소유자는 아래에 "미확인"으로 표시된 항목을
> 실제 배포 현황과 대조한 뒤에 채워야 한다. 인덱스만으로 가동 여부를 단정하지 않는다.

## 배포 단위 목록 (상위 디렉토리 기준)

| 단위 | 종류 (이름 기준) | 주의 사항 |
|---|---|---|
| `cloudflare-static/` | 정적 배포 | 정적 자산 배포 경로와 `apps/`의 빌드 출력이 일치하는지 확인 필요 |
| `cloudflare-analytics/` | 분석 | 정적·실시간 단위와 수집 경로가 겹치는지 확인 필요 |
| `cloudflare-apex-redirect/` | 리다이렉트 | apex 도메인 정책과 다른 Cloudflare 단위 간 우선순위 확인 필요 |
| `cloudflare-realtime/` | 실시간 | 실시간 경로가 `apps/api`의 Socket.IO 경로와 어떻게 연결되는지 확인 필요 |
| `capability-worker/` | 워커 | 어떤 capability를 제공하는지, 호출 주체가 누구인지 확인 필요 |
| `federated-data-plane/` | 데이터 평면 | 이중 위치 주의: `apps/api/src/platform/federated-data-plane/`에도 있다. 기본 비활성으로 알려져 있다. 의도된 분리인지 중복인지 diff·참조 확인 전에는 합치지도, 지우지도 않는다 |
| `gcp-free-data/` | 무료 티어 데이터 | `config/free-database-federation.json`, `config/free-infrastructure-policy.json`과 정책이 겹치는지 확인 필요 |
| `onpod/` | 배포 환경 | 어떤 환경·트리거로 배포되는지 확인 필요 |
| `trust/` | 신뢰·정책 | 어떤 검증·서명을 담당하는지 확인 필요 |

## 기타 파일

- `STANDING_APPROVAL.json` (682B): 존재만 확인했다. 본문 해석은 이 인덱스에서 하지 않는다.
- `backend-capabilities.env.example` (8,937B): 백엔드 capability 관련 예시. 비밀값이 없는 예시 범위에서만 다룬다.
- `integration-runtime-connectors.env.example` (1,756B): 통합 런타임 커넥터 관련 예시.

## 이 인덱스의 사용법

1. 새 배포 단위를 추가할 때는 이 표에 한 줄을 먼저 추가한다: 목적, 대상 앱·서비스, 가동 여부, 트리거.
2. 단위를 삭제·합치려면 가동 여부와 참조를 먼저 증명한다. 이 표에 적혀 있다는 사실만으로는 삭제 근거가 되지 않는다.
3. 서비스 수(메인 백엔드 1개 + GPU 추론 1개)보다 배포 단위가 많다는 점이
   이 레포의 가장 큰 운영 확장성 리스크이다. 단위를 줄이는 것보다,
   먼저 각 단위의 가동 여부와 책임을 확정하는 것이 순서이다.
