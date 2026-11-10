# 배포 단위 안내

- 상태: **current** — 저장소 탐색 안내(2026-11-08).
- 빠른 진입 명령(검증·빌드·배포·상태 확인·롤백)과 금지 사항은 [AI·운영자 정본 배포 안내](../docs/operations/ai-deployment-quickstart.md)를 먼저 본다.
- 운영 자원과 마지막 공급자 조회 기록은 [인프라 지도](../docs/operations/infrastructure-map.md)가 정본이다. 아래 상태는 그 기록과 저장소 설정을 구분하며 이번 세션의 실시간 공급자 조회를 뜻하지 않는다.
- 승인 범위는 루트 `AGENTS.md`, `DEPLOY.md`, `STANDING_APPROVAL.json`을 따른다. 이 인덱스는 승인 범위를 바꾸지 않는다.

| 단위 | 역할·근거 | 가동 상태의 근거 |
| --- | --- | --- |
| `cloudflare-static/` | SPA·엣지 gateway·R2 공개 에셋. `wrangler.jsonc`의 `ASSETS`·`LARGE_ASSETS` binding | 인프라 지도 1절의 운영 기록 |
| `cloudflare-analytics/` | 트래픽 분석 Worker·D1 | 인프라 지도 1절의 운영 기록 |
| `cloudflare-apex-redirect/` | apex → www 정본 리다이렉트 | 인프라 지도 1절의 운영 기록 |
| `cloudflare-realtime/` | Studio 임시 실시간 상태·Durable Objects | 인프라 지도 1절의 운영 기록 |
| `onpod/` | 서울 Core API·DB 재구축 도구. [README](onpod/README.md)의 고정 커밋 재현 절차 | 2026-10-23 컷오버·2026-10-29 조회 기록. 재구축 스크립트는 일상 이미지 교체 절차가 아님 |
| `capability-worker/` | 선택형 capability 배포 구현·설정 | 이 조사에서는 원격 가동 여부 미확인 |
| `federated-data-plane/` | 선택형 데이터 평면 배포 구현 | 이 조사에서는 원격 가동 여부 미확인. API 내부 구현과 이름이 같다는 이유로 중복 삭제하지 않음 |
| `gcp-free-data/` | GCP 데이터 계층 배포 구현 | 이 조사에서는 원격 가동 여부 미확인 |
| `trust/` | 신뢰·검증 관련 구성 | 앱 호스팅 단위 수에 포함해 세지 않음 |

GPU 추론 코드는 별도 [`services/creator-inference/README.md`](../services/creator-inference/README.md)에 있다. CPU 시험과 CUDA GPU 검증·운영 배포는 구분되며, 이 목록으로 GPU 공급자나 운영 중인 GPU 인스턴스를 추정하지 않는다. onpod와 RunPod도 서로 다른 서비스다.

환경변수 계약은 `backend-capabilities.env.example`, `integration-runtime-connectors.env.example`과 각 단위의 예제를 참조한다. 예제나 코드 참조는 실제 credential의 존재·유효성 증거가 아니다. 비밀값은 문서에 기록하지 않는다.

새 단위는 역할·설정 근거·가동 증거를 함께 추가한다. 삭제·통합은 호출·배포 참조와 운영 상태를 확인한 뒤 결정한다.
