# 프로덕션 일정·용량 작업실 Round 4 경계·밀집 시나리오 검증 및 전후 증거 (2026-11-07)

## 1. 작업 범위 및 소유 경계
- **소유 범위(로컬 UI·전용 테스트·증거 문서만 수정)**:
  - `apps/web/src/domains/creator/production-hub/ProductionScheduleWorkspace.tsx` (786줄 → **716줄**, 800줄 상한 준수)
  - `apps/web/src/domains/creator/production-hub/ProductionScheduleViews.tsx` (**496줄**, 응집된 캘린더·목록·상세 편집 표현 컴포넌트 분리)
  - `apps/web/src/domains/creator/production-hub/production-schedule-workspace.css`
  - `apps/web/src/domains/creator/production-hub/ProductionScheduleWorkspace.test.tsx` (기존 5개 테스트 보존 + 경계·밀집·포커스·전환 테스트 추가 → 총 **7개 테스트**)
  - `docs/schedule-boundary-round4-20261107/**` (전후 비교 리포트 및 브라우저 스크린샷)
- **비수정 경계 준수**:
  - 저장 모델, 공유 날짜 유틸, 타임존 스키마, 공유 스토어/라우트/테마/설정, `PackagePanel` 및 `package-panel`/`PackageDetail` 일절 수정 없음.
  - 사용자 원본 데이터 대신 합성(synthetic) 경계 픽스처만 사용.

---

## 2. 핵심 결함 수정 및 전후(Before / After) 수치 비교

| 점검 항목 | 수정 전 (Before) | 수정 후 (After) |
| --- | --- | --- |
| **소스 줄 수 (800줄 상한)** | `ProductionScheduleWorkspace.tsx` **786줄** (여유 14줄) | `ProductionScheduleWorkspace.tsx` **716줄** + `ProductionScheduleViews.tsx` **496줄** |
| **월말/연말·KST 자정(`+09:00`) 날짜 처리** | 비-KST(UTC/PST) 환경에서 `2026-12-31T00:00:00+09:00` → `2026-12-30`, `2027-01-01T00:00:00+09:00` → `2026-12-31`로 하루 밀림 | 로컬 KST(`Asia/Seoul`, `UTC+9`) 기준 `dateOnly`/`parseDate`/`startOfDay`/`addDays`/`DATE_LABEL` 적용으로 모든 타임존에서 `2026-09-30`↔`2026-10-01`, `2026-12-31`↔`2027-01-01` 무오차 보장 및 `2026-02-30` 무효 날짜 방어 |
| **같은 날 20건 모바일(320×740) 캘린더 셀 높이** | 단일 날짜 셀 내부에 20개 카드 전량 인라인 렌더링 → 셀 높이 **4,557px** 폭주 | 셀 내부 인라인 카드를 최대 **2건**으로 제한 + `+18건 더보기 (20건 전체 열기)` 버튼 제공 → 셀 높이 **585px** (**-3,972px 감소**), 선택 시 하단 `선택 날짜 일정 상세` 패널에서 20건 전체 표시·편집 |
| **모바일 날짜 셀 터치 타깃 (44px 기준)** | 정적 `<div>` 헤더 (높이 **26px**, 선택 불가) | `button[data-calendar-date-button]` + `min-h-11 min-w-11` (`193×44px`, **모든 뷰포트에서 ≥ 44×44px 통과**) |
| **캘린더 ↔ 목록 ↔ 편집 취소/저장 전환 보존** | 날짜 선택 상태(`selectedDate`) 없음 | `selectedDate` 및 검색·담당자·위험·상태·정렬 필터가 `캘린더 ↔ 목록 ↔ 상세 편집 열기/취소/Escape/저장` 전 구간에서 100% 보존 |
| **상세 편집 오버레이/폼 포커스 이동 및 복귀** | 열기 시 트리거 버튼에 잔류, 취소 시 `BODY`로 포커스 유실 | 열기 시 `${task.title} 제목 편집` 입력창으로 즉시 포커스 이동, `취소`·`Escape`·`저장`·`닫기` 시 원래 `${task.title} 상세 편집` 트리거 버튼으로 정확히 복귀 |
| **뷰포트·확대 가로 넘침 (320/390/768/1440·200%)** | 검증 필요 | 5개 뷰포트 × 4개 보기 방식 = **20개 매트릭스 전 구간 `hasHorizontalOverflow: false`** |

---

## 3. 증거 파일 목록
- `before/before-probe.json`: 수정 전 KST 자정 드리프트·같은 날 20건 4,557px 셀 높이·26px 헤더·포커스 유실 계측 JSON
- `before/calendar-320-20tasks-before.png`: 수정 전 320px 캘린더 20건 셀 폭주 스크린샷
- `before/calendar-1440-20tasks-before.png`: 수정 전 1440px 캘린더 20건 스크린샷
- `after/calendar-320-20tasks-capped-after.png`: 수정 후 320px 캘린더 20건 셀 2건 요약 + `+18건 더보기` 및 44px 날짜 버튼 스크린샷
- `after/calendar-320-selected-date-panel-after.png`: 수정 후 320px 선택 날짜 상세 패널 활성화 스크린샷
- `after/list-390-selected-date-editor-focus-after.png`: 수정 후 390px 목록 전환 시 선택 날짜·필터 보존 및 상세 편집 제목 입력창 포커스 스크린샷
- `after/calendar-768-selected-date-after.png`: 수정 후 768px 태블릿 캘린더 선택 날짜 스크린샷
- `after/calendar-1440-20tasks-after.png`: 수정 후 1440px PC 캘린더 선택 날짜 및 20건 상세 패널 스크린샷
- `after/calendar-1440-zoom200-after.png`: 수정 후 1440px 200% 확대(720×450) 캘린더 스크린샷
- `verification-report.json`: 수정 전후 비교 및 20개 뷰포트×뷰 매트릭스 전체 계측 리포트
