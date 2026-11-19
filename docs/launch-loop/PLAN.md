# ToonStudio 20시간 무인 상용화 고도화 실행 계획 (PLAN)

- 작성일: `2026-11-19`
- 목표 시간: 최대 20시간 무인 자율 실행 (`scripts/launch-loop-runner.sh` 기반 Fresh-Context 사이클 반복)
- 실행 단위: 1사이클 = `AC_LEDGER.md`에서 최상위 미완료(`REJECTED` 우선 -> `IN_PROGRESS` -> `TODO`) 슬라이스 **1개**를 끝까지(구현 -> 기계 게이트 -> 적대적 QA -> 체크포인트 커밋) 완주.

---

## Wave별 로드맵 및 시간 배분 (총 20시간 예산)

| Wave | 목표 | 대상 AC | 예상 소요 | 핵심 종료 게이트 |
| --- | --- | --- | --- | --- |
| **Wave 0** | 기준선 감사·원장·러너 구축 | (완료) | 0.5h | `GAP_AUDIT.md`, `AC_LEDGER.md`, `launch-loop-runner.sh` 준비 |
| **Wave 1** | P0 출시 차단 결함 & 모바일 신뢰선 해소 | `AC-001` ~ `AC-005` | 3.5h | 320/390/1440px 겹침·clip 0, 로컬 인증 E2E, 2/3핑거 Undo/Redo·팜 리젝션 |
| **Wave 2** | 내구성·협업·AI 큐·원스톱 출고 완성 | `AC-006` ~ `AC-009` | 3.5h | AI 9상태 큐, 충돌 3선택, OPFS/멀티탭, Rights BOM+PSD, 협업 안정성 |
| **Wave 3** | 경쟁 초격차 신규 기능 10선 전수 구현 | `AC-010` ~ `AC-018` | 7.5h | Spectrum 해자 6종 + Procreate급 작화 코어 + 3D 원클릭 굽기 + 타임랩스·3컷 브리지 |
| **Wave 4** | UI v2 디자인·표면 통합·시각/토큰 폴리싱 | `AC-019` ~ `AC-022` | 3.0h | 44px 상단바/82%+ 시야, 18→7 메뉴, 전 화면 시각 UX 감사·미연결 코드 0 |
| **Wave 5** | 최종 전수 회귀·접근성·출시 게이트 | `AC-023` ~ `AC-024` | 2.0h | `verify:studio-inapp-feature-sweep`, `test:a11y:editor`, `pnpm verify:push` 100% 녹색 |

---

## 무인 자율 실행 안전 규칙 (Circuit Breakers)

1. **운영 배포 절대 차단**: `deploy:web`, `deploy:cloud`, `cloudflare:static:deploy`, `onpod app update` 등 운영 배포·인프라 변경 명령은 어떤 경우에도 자동 실행하지 않는다.
2. **WebGPU/3D 순차 실행 강제**: 3D/WebGPU Playwright 테스트는 GPU 컨텍스트 경합을 막기 위해 반드시 단일 프로세스로 순차 실행한다.
3. **동일 AC 3회 연속 실패 시 격리**: 한 `AC-ID`가 3회 연속 `REJECTED` 또는 게이트 실패 시, 무한 루프 대신 `MEMORY.md`에 정확한 `file:line` 블로커를 기록하고 다음 독립 `AC-ID`로 넘어가거나 안전 정지한다.
4. **워킹 트리 청결성 유지**: 매 사이클 종료 시 실패한 실험 코드가 `main`이나 체크포인트 커밋을 오염시키지 않도록 게이트 통과 후에만 커밋한다.
