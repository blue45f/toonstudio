# Character Labs 포즈 상태 명확화 및 키보드·선택 상태 회귀 검증 보고서 (Round 6 — 2026-11-07)

## 1. 개요 및 Round 5 원격 `main` Ancestry 확인

1. **Round 5 완료분 원격 `main` Ancestry 확인**:
   - Round 5 구현 커밋(`7b2db38b2d7050b5aebc0d206952662b97e4e7f7`)과 병합 커밋(`65da4036cec52f1d5b048855a51085c9b7503264`)에 대해 `git merge-base --is-ancestor 7b2db38b2d7050b5aebc0d206952662b97e4e7f7 origin/main`을 실행해 **`origin/main`의 정상 조상(ancestor)임을 확인**했다.
2. **소유 범위 및 보호 경계 준수**:
   - 수정 파일:
     - [`PosePanel.tsx`](../../apps/character-lab/src/app/shell/panels/PosePanel.tsx) (787줄, 800줄 이하 준수)
     - [`PosePanel.test.tsx`](../../apps/character-lab/src/app/shell/panels/PosePanel.test.tsx) (588줄, 800줄 이하 준수)
     - [`verification-report.json`](./verification-report.json) 및 본 문서/스크린샷 증거
   - 엔진, 에셋, 모델, [`PackagePanel.tsx`](../../apps/character-lab/src/app/shell/panels/PackagePanel.tsx), [`PackageDetail.tsx`](../../apps/character-lab/src/app/shell/panels/package-panel/PackageDetail.tsx), [`ExportPanel.tsx`](../../apps/character-lab/src/app/shell/panels/ExportPanel.tsx), [`CharacterLabApp.tsx`](../../apps/character-lab/src/app/shell/CharacterLabApp.tsx), 공유 스토어, 스키마, 라우트, 전역 CSS([`character-lab.css`](../../apps/character-lab/src/app/styles/character-lab.css)) 및 다른 앱/페이지는 일절 수정하지 않았다.

---

## 2. 실제 상태(`actual-unloaded`)와 합성 Fixture(`synthetic-fixture`)의 명시적 구분

| 구분 | 환경 및 자산 상태 | 포즈·IK 조작 가능 여부 | 검증 범위 (허위 성공 주장 금지) |
| --- | --- | --- | --- |
| **실제 상태 (`actual-unloaded`)** | 브라우저 초기 진입 상태 (GPU 백엔드 미선택 · 외부 GLB/키트 미로드, `capabilities.pose.status === "unavailable"`, 사유: `"캐릭터 소스가 아직 로드되지 않았습니다."`) | **비활성 (`disabled = true`)** — 실제 적용 가능한 리그 자산이 아직 로드되지 않았으므로 포즈 프리셋·IK·손 포즈 조작은 정당하게 차단됨 | 포즈/IK 실행 성공을 허위로 주장하지 않으며, **리그 미로드 상태 오분류 방지(`선택 상태: 리그 미로드 · 포즈 비활성`)**, **상단 1문장 안내 + 1개 다음 행동(`리그·패키지 선택`) 노출**, **상세 비활성 사유의 기본 접힘(`open = false`) 및 중복 제거**, **인스펙터 탭 roving `tabIndex` 및 다음 행동 `Enter` 시 `#cl-tab-package` 초점 복원**만 검증 |
| **합성 Fixture (`synthetic-fixture`)** | `composeCharacterLab` + `createMockEngineFactory`로 주입한 3종 결정적 fixture: ① 정적 메시(`bones: []`, `스켈레톤 없음`), ② 손상 스켈레톤(`hips <-> spine` 부모 순환 `skeleton-cycle`), ③ 활성 절차적 휴머노이드 리그(55본, `ALL_AVAILABLE_CAPABILITIES`) | ①·②는 **비활성 (`disabled = true`)**, ③ 활성 절차적 리그는 **활성 (`disabled = false`)** | ①·②에서 **정적 메시 vs 손상 스켈레톤 1문장 안내 + 1개 다음 행동 + 접힘 상세 사유**를 5개 뷰포트에서 검증하고, ③에서 **키보드 연속 사용자 여정(포즈 프리셋 `0→8본` → 관절 `leftLeg` IK 적용 `8→10본` → Undo `10→8본` / Redo `8→10본` → 내보내기 탭 전환·저장·파일 취소 시 보존)**을 검증 |

---

## 3. [`PosePanel.tsx`](../../apps/character-lab/src/app/shell/panels/PosePanel.tsx) 개선 내용

1. **리그 없음(미로드) / 손상 스켈레톤 / 정적 메시 3종 상태 명확 구별**:
   - **리그 없음 (`isRigUnloaded`)**:
     - 선택 요약(`pose-active-selection-summary`): `선택 상태: 리그 미로드 · 포즈 비활성`
     - 우선 노출 1문장(`pose-unloaded-rig-notice`): `현재 캐릭터 소스가 아직 로드되지 않았거나 휴머노이드 포즈 리그가 준비되지 않아 관절·IK 조작이 비활성화되어 있으니 리그·패키지 선택 탭에서 소스를 확인하세요.`
   - **손상 스켈레톤 (`rigCorrupted`)**:
     - 선택 요약(`pose-active-selection-summary`): `선택 상태: 손상된 스켈레톤 차단됨`
     - 우선 노출 1문장(`pose-skeleton-failure`): `손상된 스켈레톤 데이터([skeleton-cycle])가 감지되어 포즈 조작이 차단되었으니 리그·패키지 선택 탭에서 정상 소스로 교체하세요.`
   - **정적 메시 (`hasEmptySkeleton` — 엔진 본 0개 또는 능력 사유에 `스켈레톤 없음`/`정적 메시` 포함)**:
     - 선택 요약(`pose-active-selection-summary`): `선택 상태: 스켈레톤 없음(정적 메시)`
     - 우선 노출 1문장(`pose-empty-skeleton-notice`): `스켈레톤이 없는 정적 메시이거나 포즈 본이 비어 있어 관절 회전·IK를 조작할 수 없으니 리그·패키지 선택 탭에서 리깅된 소스를 선택하세요.`
2. **차단 상태에서 `1문장 + 1개 다음 행동`만 우선 노출**:
   - `poseBlocked === true`일 때 상단 `.cl-pose-rig-actions`에는 **단 1개의 다음 행동 버튼(`리그·패키지 선택`, `data-testid="pose-switch-to-package-tab"`)**만 노출하고, `내보내기·보존`(`pose-switch-to-export-tab`) 버튼은 포즈 조작이 활성화된 상태(`!poseBlocked`)에서만 함께 노출한다.
3. **비활성 상세 사유 기본 접힘 보존 및 중복 장문 제거**:
   - 상세 슬롯 미지원 사유(`pose-capability-reason`), 스켈레톤 손상 상세 진단(`pose-skeleton-failure-detail`), 미적용 슬롯 사유를 기본 접힘(`<details data-testid="pose-disabled-reason-details">`, `open = false`) 안에 보존했다.
   - `pose`와 `hand-pose`가 동일한 미지원 사유를 가질 때(`sharedUnavailableReason`), 상세 사유를 `포즈·손 포즈 슬롯 미지원: <사유>` 1줄로 통합하고 하단 `손 포즈` 필드셋에서 동일 문구가 중복 출력되지 않도록 정돈했다.

---

## 4. 5대 뷰포트(320 / 390 / 768 / 1440 / 200% 확대) 검증 결과 요약

상세 JSON 측정치는 [`verification-report.json`](./verification-report.json)에 기록되어 있다.

| 뷰포트 | 모드 | 선택 상태 요약 (`pose-active-selection-summary`) | 상단 노출 문장 수 | 상단 다음 행동 수 | 상세 사유 기본 접힘 (`open`) | 손 포즈 중복 사유 수 | 3D 뷰포트 / 인스펙터 공존 | 스크린샷 증거 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `320×640` | 실제 상태 (`actual-unloaded`) | `선택 상태: 리그 미로드 · 포즈 비활성` | `1` | `1` (`리그·패키지 선택`) | `false` (펼침 시 `true`) | `0` | `320×205` / `320×2059` | [`actual-unloaded-320x640-mobile.png`](./actual-unloaded-320x640-mobile.png), [`actual-unloaded-expanded-320x640-mobile.png`](./actual-unloaded-expanded-320x640-mobile.png) |
| `390×844` | 실제 상태 (`actual-unloaded`) | `선택 상태: 리그 미로드 · 포즈 비활성` | `1` | `1` (`리그·패키지 선택`) | `false` | `0` | `390×220` / `390×1733` | [`actual-unloaded-390x844-mobile.png`](./actual-unloaded-390x844-mobile.png) |
| `768×1024` | 실제 상태 (`actual-unloaded`) | `선택 상태: 리그 미로드 · 포즈 비활성` | `1` | `1` (`리그·패키지 선택`) | `false` | `0` | `768×220` / `768×1340` | [`actual-unloaded-768x1024-tablet.png`](./actual-unloaded-768x1024-tablet.png) |
| `1440×900` | 실제 상태 (`actual-unloaded`) | `선택 상태: 리그 미로드 · 포즈 비활성` | `1` | `1` (`리그·패키지 선택`) | `false` (펼침 시 `true`) | `0` | `780×692` / `380×692` | [`actual-unloaded-1440x900-desktop.png`](./actual-unloaded-1440x900-desktop.png), [`actual-unloaded-expanded-1440x900-desktop.png`](./actual-unloaded-expanded-1440x900-desktop.png) |
| `1440×900 @ 200%` | 실제 상태 (`actual-unloaded`) | `선택 상태: 리그 미로드 · 포즈 비활성` | `1` | `1` (`리그·패키지 선택`) | `false` | `0` | `640×897` / `760×897` | [`actual-unloaded-1440x900-zoom200.png`](./actual-unloaded-1440x900-zoom200.png) |
| `320×640` | 합성 (`static-mesh`) | `선택 상태: 스켈레톤 없음(정적 메시)` | `1` | `1` (`리그·패키지 선택`) | `false` | `0` | `320×205` / `320×2024` | [`synthetic-static-mesh-320x640-mobile.png`](./synthetic-static-mesh-320x640-mobile.png) |
| `320×640` | 합성 (`corrupted-skeleton`) | `선택 상태: 손상된 스켈레톤 차단됨` | `1` | `1` (`리그·패키지 선택`) | `false` | `0` | `320×205` / `320×2006` | [`synthetic-corrupted-320x640-mobile.png`](./synthetic-corrupted-320x640-mobile.png) |
| `390×844` | 합성 (`static-mesh` / `corrupted`) | `스켈레톤 없음(정적 메시)` / `손상된 스켈레톤 차단됨` | `1` | `1` (`리그·패키지 선택`) | `false` | `0` | `390×220` / `390×1723` | [`synthetic-static-mesh-390x844-mobile.png`](./synthetic-static-mesh-390x844-mobile.png), [`synthetic-corrupted-390x844-mobile.png`](./synthetic-corrupted-390x844-mobile.png) |
| `768×1024` | 합성 (`static-mesh` / `corrupted`) | `스켈레톤 없음(정적 메시)` / `손상된 스켈레톤 차단됨` | `1` | `1` (`리그·패키지 선택`) | `false` | `0` | `768×220` / `768×1340` | [`synthetic-static-mesh-768x1024-tablet.png`](./synthetic-static-mesh-768x1024-tablet.png), [`synthetic-corrupted-768x1024-tablet.png`](./synthetic-corrupted-768x1024-tablet.png) |
| `1440×900` | 합성 (`static-mesh` / `corrupted`) | `스켈레톤 없음(정적 메시)` / `손상된 스켈레톤 차단됨` | `1` | `1` (`리그·패키지 선택`) | `false` | `0` | `780×638` / `380×638` | [`synthetic-static-mesh-1440x900-desktop.png`](./synthetic-static-mesh-1440x900-desktop.png), [`synthetic-corrupted-1440x900-desktop.png`](./synthetic-corrupted-1440x900-desktop.png) |
| `1440×900 @ 200%` | 합성 (`static-mesh` / `corrupted`) | `스켈레톤 없음(정적 메시)` / `손상된 스켈레톤 차단됨` | `1` | `1` (`리그·패키지 선택`) | `false` | `0` | `640×789` / `760×789` | [`synthetic-static-mesh-1440x900-zoom200.png`](./synthetic-static-mesh-1440x900-zoom200.png), [`synthetic-corrupted-1440x900-zoom200.png`](./synthetic-corrupted-1440x900-zoom200.png) |

---

## 5. 합성 Fixture 활성 절차적 리그 연속 키보드 여정 검증 (`synthetic-active-rig`)

1. **Step 1 — 포즈 프리셋 선택 (`Enter`)**:
   - `pose-quick-chip-hands-on-hips` 초점 이동 후 `Enter` 입력 → 선택 요약이 `선택 상태: 기본 자세(Rest · 프리셋: A 포즈)`에서 `선택 상태: 허리에 손 (편집된 본 8개)`로 전환됨 ([`synthetic-active-step1-preset-1440x900.png`](./synthetic-active-step1-preset-1440x900.png)).
   - 활성 리그 상태(`!poseBlocked`)이므로 상단 빠른 이동 버튼 2개(`리그·패키지 선택`, `내보내기·보존`)가 모두 노출됨.
2. **Step 2 — 관절(`leftLeg`) 선택 및 값 변경·IK 적용 (`Enter`)**:
   - `부위` `<select>`에서 `leftLeg`(왼발) 선택 후 `위로 +10cm` 버튼 `Enter` → `IK 적용` 버튼 `Enter` 입력.
   - 선택 요약이 `선택 상태: 허리에 손 (편집된 본 10개)`로 갱신되고 IK 상태가 `왼발 목표 도달 (오차 0.0 mm)`로 기록됨 ([`synthetic-active-step2-ik-1440x900.png`](./synthetic-active-step2-ik-1440x900.png)).
3. **Step 3 — 키보드 Undo / Redo (`Ctrl+Z` / `Ctrl+Shift+Z`)**:
   - `Ctrl+Z` 입력 시 `선택 상태: 허리에 손 (편집된 본 8개)`로 복원되고, `Ctrl+Shift+Z` 입력 시 `선택 상태: 허리에 손 (편집된 본 10개)`로 재적용됨 ([`synthetic-active-step3-undo-redo-1440x900.png`](./synthetic-active-step3-undo-redo-1440x900.png)).
4. **Step 4 — 내보내기 탭 전환·레시피 저장·파일 선택 취소 시 보존**:
   - `pose-switch-to-export-tab`에서 `Enter` 입력 시 `#cl-tab-export`로 초점이 복원되고, `레시피 저장` `Enter` 실행 후 파일 입력(`export-recipe-file-input`) 취소 시에도 `실험 포즈: 허리에 손 (본 10개 · 손 relaxed) · 레시피 #6f3f68fc` 및 저장 영수증이 그대로 보존됨 ([`synthetic-active-step4-export-cancel-1440x900.png`](./synthetic-active-step4-export-cancel-1440x900.png)).
