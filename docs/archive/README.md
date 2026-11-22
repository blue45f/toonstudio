# ToonStudio 문서 아카이브 (`docs/archive/`)

- 문서 상태: **역사 자료 (`historical` / archive)**
- 최종 정비: **2026-11-22**

이 디렉터리는 완료되었거나 새 정본 문서로 대체된 백로그, 과거 운영 사고·QA 기록, 시효가 지난 설계 초안을 활성 문서 디렉터리(`루트`, `docs/operations/`, `docs/features/`, `docs/engines/`, `docs/studio/`)와 분리해 보관하는 구역입니다.

> **주의:** 이 구역의 문서는 작성 시점의 과거 맥락을 보존할 뿐 **현재 구현·운영 권위를 주장하지 않습니다.** 현재 사실은 [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md), [`../README.md`](../README.md), [`../operations/infrastructure-map.md`](../operations/infrastructure-map.md)와 실제 소스·테스트에서 확인합니다.

## 디렉터리 분류

| 경로 | 포함 내용 | 원본 위치 |
| --- | --- | --- |
| `root-backlogs/` | 전 항목 해소 완료된 UX 플로우 백로그(`ux-flow-backlog-2026-11-21.md`), 모바일 드로잉 벤치마크 후속 티켓 스냅샷(`pending-tickets-mobile-draw-2026-11-21.md`) | 저장소 루트(`UX_FLOW_BACKLOG.md`, `PENDING-TICKETS-MOBILE-DRAW.md`) |
| `operations-2026/` | 퇴역한 Vercel·Render·Supabase 시기의 사고·릴리스·QA·배포 계약 변경 기록(2026-09 ~ 2026-11-05) | `docs/ops/`(삭제됨), `docs/operations/` |
| `ux-and-plans-2026/` | `2026-11-11` UI/UX v2 개편 및 `2026-10-29` 브러시 내재화 완료 이전에 작성된 사용성 감사·계획 스냅샷 | `docs/`, `docs/ux/`(삭제됨), `docs/superpowers/plans/`(삭제됨) |
| `studio-2026-09/` | `2026-09` 시점의 2D/댓글/엔진/드로잉 UX/블루프린트 구현 스냅샷 | `docs/`, `docs/engines/`, `docs/quality/`, `docs/studio/` |

## 아카이브 vs 삭제 기준 (`2026-11-22` 정비 정책)

1. **아카이브 이동(`docs/archive/`)**: 이후 감사·회고·설계 맥락 추적에 참고 가치가 있는 완료 백로그, 과거 운영 사고·릴리스 기록, 대체된 중기 계획서.
2. **직접 삭제(Git 이력 보존)**: 일회성 브랜치 통합 체크리스트, 유휴 worktree 정리 영수증, 단일 PR·CI 실패 수정 메모, 미참조 빈 스텁·미체크 초안 목록(`ARCHITECTURE.md` §10 및 `docs/README.md` 작성 원칙).
3. **이동·삭제 전 필수 확인**: `config/documentation-authority.json` 원장 등록 여부, 코드·테스트·계약 테스트(`engineering-seminar-*.test.ts`, `deploy-docs-contract.test.mjs`, `STUDIO_MANUAL.md` 1:1 동기화 검사 등) 참조 여부, `pnpm run validate:documentation` 내부 링크 무결성을 모두 확인합니다.
