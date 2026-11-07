# ToonStudio 프로덕션/일정 페이지 읽기·편집 동선 개선 검증 보고서 (2026-11-07)

## 1. 작업 범위 및 소유 경계

- **대상 경로**: `/production/projects/:projectId/schedule`
- **소유 파일 (로컬 UI 및 테스트/증거 문서만 수정)**:
  - `apps/web/src/domains/creator/production-hub/ProductionScheduleWorkspace.tsx`
  - `apps/web/src/domains/creator/production-hub/production-schedule-workspace.css`
  - `apps/web/src/domains/creator/production-hub/ProductionScheduleWorkspace.test.tsx`
  - `docs/parallel-toon-production-20261107/**`
- **비수정 보존 영역**:
  - export/import 데이터, 공통 스토어, 라우트, 테마, 설정 파일, 다른 도메인/페이지 무수정 보존.

## 2. 6대 핵심 시나리오 개선 요약

1. **날짜 파싱·이동·인라인 조정**:
   - `YYYY-MM-DD` 문자열을 로컬 타임존(`new Date(year, month - 1, day, 9, 0, 0, 0)`)으로 안전하게 파싱하여 타임존 드리프트를 방지하고 비정상 날짜 입력을 방어했습니다.
   - 헤더에 `이전 2주`, `오늘 기준`, `첫 마감 기준`, `다음 2주` 버튼과 `구간 시작일 선택` 입력을 배치하고, 현재 14일 구간 밖의 마감 작업에는 `마감 구간으로 이동` 점프 버튼을 추가했습니다.
   - 각 작업에서 마감일 직접 선택 외에 `-1일`, `+1일`, `+1주` 원클릭 마감 조정과 상대 마감 배지(`D-Day`, `D-n`, `D+n 지연`, `마감 미정`, `완료`)를 제공합니다.
2. **필터·검색·정렬·초기화**:
   - 검색창(`작업 검색`)이 제목·공정 코드·로컬라이즈된 한글 공정명(예: `선화`, `콘티`)·범위·담당자 이름을 모두 매칭합니다.
   - `담당자 필터`(`담당 미지정` 포함), `위험 필터`, `상태 필터`(14종 정본 상태), `작업 정렬`(`마감 빠른순`, `위험 높은순`, `공수 큰순`, `제목 가나다순`) 및 원클릭 `필터 초기화` 버튼을 제공합니다.
3. **긴 제목 가독성 및 인라인 상세 편집**:
   - 모든 뷰의 작업 제목에 `.production-schedule-task-title`(`line-clamp: 2`, `overflow-wrap: anywhere`, `word-break: break-word`) 및 `title` 툴팁을 적용해 초장문/무공백 토큰도 레이아웃 깨짐 없이 읽을 수 있습니다.
   - 각 작업의 `상세 편집` 인라인 폼에서 제목, 공정, 담당자, 예상 공수(h), 마감일을 즉시 수정하고 저장할 수 있습니다.
4. **빈 상태 및 복구 동선**:
   - 정본 i18n 키(`productionHub.schedule.emptyFilteredTasks`, `productionHub.schedule.emptyWorkload`)를 보존하면서 `필터 초기화`, `새 작업 추가`, `목록 보기에서 작업 확인` 복구 액션을 연결했습니다.
5. **작은 화면(320/390/768/1440) 및 200% 확대 가로 오버플로우 방지**:
   - 검색 레이블의 고정 최소폭(`min-w-56`)과 모바일 타임라인의 과도한 좌측 열 폭(`21rem = 336px`)을 반응형 CSS(`production-schedule-workspace.css`)로 분리하여 320px 및 200% 확대에서도 페이지 가로 스크롤이 발생하지 않습니다.
6. **타임라인·캘린더·목록·워크로드 뷰 전환**:
   - `일정 보기 방식` 그룹에서 `타임라인`, `캘린더`, `목록`, `워크로드` 4종 전환 시 검색·필터·정렬·날짜 구간 상태를 그대로 유지하며 타임라인/캘린더/목록 어디서든 상태·마감일·상세 편집이 가능합니다.

## 3. 실제 브라우저 반응형·확대 검증 매트릭스 (Playwright Chromium)

| 뷰포트 / 확대 | 뷰 모드 | innerWidth | docScrollWidth | workspaceWidth | 가로 Overflow 판정 |
| --- | --- | --- | --- | --- | --- |
| `mobile-320` (320×800, zoom 100%) | `timeline` | 320px | 305px | 249px | PASS (0 overflow) |
| `mobile-320` (320×800, zoom 100%) | `calendar` | 320px | 305px | 249px | PASS (0 overflow) |
| `mobile-320` (320×800, zoom 100%) | `list` | 320px | 305px | 249px | PASS (0 overflow) |
| `mobile-320` (320×800, zoom 100%) | `workload` | 320px | 305px | 249px | PASS (0 overflow) |
| `mobile-390` (390×844, zoom 100%) | `timeline` | 390px | 375px | 319px | PASS (0 overflow) |
| `mobile-390` (390×844, zoom 100%) | `calendar` | 390px | 375px | 319px | PASS (0 overflow) |
| `mobile-390` (390×844, zoom 100%) | `list` | 390px | 375px | 319px | PASS (0 overflow) |
| `mobile-390` (390×844, zoom 100%) | `workload` | 390px | 375px | 319px | PASS (0 overflow) |
| `tablet-768` (768×1024, zoom 100%) | `timeline` | 768px | 753px | 546px | PASS (0 overflow) |
| `tablet-768` (768×1024, zoom 100%) | `calendar` | 768px | 753px | 546px | PASS (0 overflow) |
| `tablet-768` (768×1024, zoom 100%) | `list` | 768px | 753px | 546px | PASS (0 overflow) |
| `tablet-768` (768×1024, zoom 100%) | `workload` | 768px | 753px | 546px | PASS (0 overflow) |
| `desktop-1440` (1440×900, zoom 100%) | `timeline` | 1440px | 1425px | 882px | PASS (0 overflow) |
| `desktop-1440` (1440×900, zoom 100%) | `calendar` | 1440px | 1425px | 882px | PASS (0 overflow) |
| `desktop-1440` (1440×900, zoom 100%) | `list` | 1440px | 1425px | 882px | PASS (0 overflow) |
| `desktop-1440` (1440×900, zoom 100%) | `workload` | 1440px | 1425px | 882px | PASS (0 overflow) |
| `zoom-200pct` (1440×900, zoom 200%) | `timeline` | 1440px | 1425px | 354px | PASS (0 overflow) |
| `zoom-200pct` (1440×900, zoom 200%) | `calendar` | 1440px | 1425px | 354px | PASS (0 overflow) |
| `zoom-200pct` (1440×900, zoom 200%) | `list` | 1440px | 1425px | 354px | PASS (0 overflow) |
| `zoom-200pct` (1440×900, zoom 200%) | `workload` | 1440px | 1425px | 354px | PASS (0 overflow) |

## 4. 캡처 스크린샷 증거

- `screenshots/mobile-320-timeline.png`
- `screenshots/mobile-320-calendar.png`
- `screenshots/mobile-320-list.png`
- `screenshots/mobile-390-timeline.png`
- `screenshots/mobile-390-calendar.png`
- `screenshots/tablet-768-timeline.png`
- `screenshots/tablet-768-calendar.png`
- `screenshots/desktop-1440-timeline.png`
- `screenshots/desktop-1440-calendar.png`
- `screenshots/desktop-1440-list-edited.png`
- `screenshots/zoom-200pct-timeline.png`
- `screenshots/zoom-200pct-calendar.png`
- `screenshots/empty-state-recovery.png`

## 5. 정적·단위·통합 검증 결과

- `ProductionScheduleWorkspace.test.tsx`: 5/5 통과
- `production-labels.schedule-canonical.test.ts`: 5/5 통과
- `studio-hub-storyworld-status-i18n-r3c02.test.ts`: 6/6 통과
- `ProductionHubPage.test.tsx`: 17/17 통과
- `node scripts/check-source-file-size.mjs`: 통과 (785줄 <= 800줄 상한)
- `node scripts/lint-changed.mjs --base=HEAD`: 통과 (0 errors, 0 warnings)
- `node scripts/secretlint-files.mjs --base=HEAD`: 통과
- TypeScript 의미 검사 (`ProductionScheduleWorkspace.tsx`, `ProductionScheduleWorkspace.test.tsx`, `ProductionHubPage.tsx` 포함 2,642개 파일 프로그램): 0 diagnostics 통과
