# 2026-10-09 정적 웹 운영 배포 기록

- 상태: **현재** (Cloudflare Static Assets + Worker 수동 배포 완료)
- 승인: 2026-10-09 목표 지시 "운영 배포도 진행해줘" (별도 명시적 승인)
- 승인 SHA: `8d181ef9c8ffafab57697789b6d9d79970207573` (배포 시점 main HEAD, clean worktree)
- 실행자: Sisyphus (에이전트)

## 배포 단위

- Cloudflare Static Assets + Worker `toonspectrum-web`만 배포했다.
- R2 `toonspectrum-public-assets`: 스크립트가 동기화했다 (신규 923 assets 업로드).
- Render Core API: 변경 없음 (수동 release는 대시보드 전용, API 키 없음).
- DB migration: 실행하지 않았다 (앱 배포 승인에 포함되지 않음, 별도 승인 필요).

## 배포 결과

- Worker Version ID: `2eb8c4d8-9884-423d-9321-e8117e10febc`
- 롤백 대상: 직전 버전 `842774d1-727c-447a-9e3c-2aa4b428731e` (Cloudflare 대시보드에서 확인)
- 배포 시각: 2026-10-09 (UTC 2026-10-08 야간 작업분)

## 사전 검증

- `validate:architecture` 통과
- `verify:free-infrastructure` 통과
- `verify:cloudflare-static` 통과 (83건)
- `cloudflare:static:dry-run` 통과
- `verify:render-core-origin` 통과 (live=200, ready=200)
- GitHub CI `verify` 성공 (HEAD 기준)

## 배포 후 점검 (2026-10-09)

- 홈 `https://www.toonstudio.cloud/` 200
- `/api/auth/providers` 200
- `/api/ranking?axis=popular&period=daily&limit=5` 200, 스냅샷 산식 응답 (60229건)
- `/api/cover` 502: 허용되지 않은 원격 호스트에 대한 설계된 폴백 경로 (핫링크 위조 금지 정책)
- 참고: ranking 응답 meta에 문서의 `source="formula-api"` 키가 없다 (문서 drift, 기능은 정상)

## 남은 작업 (사람 승인 필요)

- Render `toonspectrum-core-api` 수동 release (대시보드)
- DB migration workflow (`production-database-migrations.yml`, Environment reviewer 승인 필요)

## 2차 배포 (2026-10-09, 같은 날 추가분)

- 승인 SHA: `d336b8bd055a6431a67573f4cc3d55171ecde8e4` (main HEAD, clean worktree)
- 포함: main-verify 4종 병합분 + heisenberg 이동감 6건 + 이전 배포 이후 main 전진분
- 사전 검증: architecture/free-infra/cloudflare-static(83건)/dry-run/render-origin(live·ready 200)/CI verify 성공
- Worker Version ID: `0c147959-0fcd-4b38-b0c4-e1633ce3b1ef`
- 배포 후 점검: 홈 200, providers 200, ranking 200
- 롤백 대상: 직전 버전 `2eb8c4d8-9884-423d-9321-e8117e10febc` (1차 배포분)

## 3차 배포 (2026-10-09, 같은 날 추가분)

- 승인 SHA: `da200748e8e990c39869b6dbe2ea50c6a89d24d0` (main HEAD, clean worktree)
- 포함: PR #2276-2280 병합분(bright-lab 실험레인·heisenberg 스프라이트 고도화 등) + production-cover-fill 병합분 + 이전 배포 이후 main 전진분
- 사전 검증: architecture/free-infra/cloudflare-static(83건)/dry-run/render-origin(live·ready 200)/CI verify 성공
- Worker Version ID: `61eead80-1b89-4cc0-8cf3-3bd9ceeea065`
- 배포 후 점검: 홈 200, providers 200, ranking 200
- 롤백 대상: 직전 버전 `0c147959-0fcd-4b38-b0c4-e1633ce3b1ef` (2차 배포분)

## 4차 배포 (2026-10-09, 같은 날 추가분)

- 승인 SHA: `ca94aab4abacd489fdb1109b238d75457bc364bf` (main HEAD, clean worktree)
- 포함: 디자인 웨이브 11·12 + realtime-ticket capabilities 수정 + motion-webtoon-alias + 빨간 main 복구핀 2건 + 이전 배포 이후 main 전진분
- 배포 전 복구: DB bootstrap 원장 핀 104→106, 크리에이터 홈 서사 핀 웨이브11 반영 (CI 적색 원인 제거)
- 사전 검증: architecture/free-infra/cloudflare-static(83건)/dry-run/render-origin(live·ready 200)/CI verify 성공
- Worker Version ID: `dda82ca9-f9bd-484b-89cc-318470d98462`
- 배포 후 점검: 홈 200, providers 200, ranking 200
- 롤백 대상: 직전 버전 `61eead80-1b89-4cc0-8cf3-3bd9ceeea065` (3차 배포분)
