# ToonStudio Character Labs 패널 로컬 UI 개선 및 회귀 검증 보고서 (2026-11-07)

## 1. 작업 개요 및 소유권 경계

- **목표**: `apps/character-lab`의 로컬 패널 UI 및 스타일(`PosePanel`, `PackagePanel`, `character-lab.css`)만 소유하여 **포즈/리그 선택 요약 및 전환 · 빈 상태 안내 · 고급 진단 접기 · 작은 화면 터치 영역(>= 44×44 px) 및 가로 오버플로우(0 px) 개선**을 완료하고, 실제 포즈 조작·관절 핸들 드래그·Undo/Redo 회귀를 실브라우저와 단위 테스트로 검증한다.
- **소유 파일 (지정 페이지 로컬 파일만 수정)**:
  - `apps/character-lab/src/app/shell/panels/PosePanel.tsx`
  - `apps/character-lab/src/app/shell/panels/PosePanel.test.tsx`
  - `apps/character-lab/src/app/shell/panels/PackagePanel.tsx`
  - `apps/character-lab/src/app/shell/panels/PackagePanel.test.tsx`
  - `apps/character-lab/src/app/styles/character-lab.css`
  - `docs/parallel-toon-character-20261107/**` (검증 증거 및 리포트)
- **비수정(보호) 영역**:
  - 리깅·애니메이션·렌더 엔진(`apps/character-lab/src/animation/**`, `apps/character-lab/src/render/**`)
  - 공통 패키지(`packages/*`), 브러시(`apps/brush-lab`), 드로잉 로직, 공유 라우트·스토어·테마·설정 및 타 페이지 무수정

---

## 2. 주요 개선 사항

### 2.1 포즈·리그 선택 상태 요약 및 양방향 빠른 전환 (`PosePanel.tsx`, `PackagePanel.tsx`)
- **`PosePanel` 활성 리그·포즈 요약 바 (`data-testid="pose-rig-summary"`)**:
  - 현재 활성 리그 소스(`절차적 휴머노이드`, `모듈식 키트(toonstudio-kit-v1 · 여성/남성 베이스)`, `제작 캐릭터 패키지(<id>)`)를 `data-testid="pose-active-rig-source"`에 표시한다.
  - 현재 선택된 포즈 상태(`기본 자세(Rest · 프리셋: A 포즈)`, 프리셋 이름 및 편집된 본 개수, 부분 범위 편집 상태, 스켈레톤 손상/빈 상태)를 `data-testid="pose-active-selection-summary"`에 표시한다.
  - **`리그·패키지 선택` 버튼 (`data-testid="pose-switch-to-package-tab"`)**: 포즈 탭에서 제작 패키지·리그 선택 탭(`package`)으로 즉시 이동한다.
- **`PackagePanel` 활성 패키지 표시 및 포즈 탭 이동 (`PackagePanel.tsx`)**:
  - **`포즈 탭으로 이동` 버튼 (`data-testid="package-switch-to-pose-tab"`)**: 리그·패키지 선택 후 포즈 탭(`pose`)으로 즉시 복귀할 수 있다.
  - **현재 선택된 패키지 배지 (`data-testid="package-selected-badge-<characterId>"`)**: 현재 활성 소스가 제작 캐릭터 패키지일 때 목록 항목(`li.cl-package-item--selected[data-selected="true"]`)에 `현재 선택됨` 배지를 명시한다.

### 2.2 빈 상태(Empty State) 처리 및 정적 메시 안전 차단 (`PosePanel.tsx`, `PackagePanel.tsx`)
- **스켈레톤 본 0개 / 정적 메시 빈 상태 (`data-testid="pose-empty-skeleton-notice"`)**:
  - 엔진의 `poseSkeleton()`이 `null`이거나 `bones.length === 0`인 정적 메시(`normal-empty-rig`)일 때 오류 배너를 띄우지 않고 빈 상태 안내 문구(`스켈레톤이 없는 정적 메시이거나 포즈 본이 비어 있어 관절 회전·IK를 조작할 수 없습니다...`)를 노출하며, 포즈·손 포즈·IK 조작 컨트롤을 안전하게 비활성화(`poseBlocked`/`handBlocked`)한다.
- **기본 휴식 포즈(Rest · 변형 본 0개) 빈 상태 힌트 (`data-testid="pose-rest-empty-notice"`)**:
  - 회전된 본이 0개인 기본 자세일 때 빠른 스탠스·프리셋 카드·뷰포트 관절 핸들·IK 조작 안내를 표시하고, 포즈가 적용되면 자동으로 숨긴다.
- **제작 패키지 색인 빈 목록 안내 (`data-testid="package-list-empty"`)**:
  - `index.json` 로드가 완료됐으나 등록된 패키지가 0개일 때 빈 목록 안내(`등록된 제작 패키지가 없습니다. 목록 새로고침을 누르거나 모듈식 키트·절차 소스를 선택하세요.`)를 표시한다.

### 2.3 고급 진단 접기 (`PosePanel.tsx`, `PackagePanel.tsx`)
- **`PosePanel` 고급 진단 (`data-testid="pose-advanced-diagnostics"`)**:
  - 기본 접힘(`open === false`) 상태를 유지하며, 정적 메시일 때 `스켈레톤 본 0개 · 정적 메시(스켈레톤 없음)`를 정확히 표시한다.
  - 스윙·트위스트 관절 한계 위반 본이 있을 때 접이식 본문 안에 위반 본별 상세 목록(`data-testid="pose-violation-list"`)을 노출한다.
- **`PackagePanel` 고급 리그·슬롯 지원 요약 (`data-testid="package-advanced-diagnostics"`)**:
  - 기본 접힘(`open === false`) `<details>` 블록으로 활성/부분 제한/비활성 슬롯 수 및 포즈·손 리그 지원 상태를 요약한다.

### 2.4 작은 화면 터치 영역(>= 44×44 px) 및 반응형 오버플로우 방지 (`character-lab.css`)
- `.cl-pose-rig-switch`, `.cl-package-panel button`, `.cl-package-diagnostics-summary`, `.cl-package-gaps summary`, `.cl-package-unmapped summary` 등 모든 대화형 컨트롤에 `min-width: 44px; min-height: 44px; display: inline-flex; align-items: center;`를 보장했다.
- `.cl-package-capabilities` 테이블에 `table-layout: fixed; overflow-wrap: anywhere;`를 적용하여 모바일 `320px`/`390px`, 태블릿 `768px`, PC `1440px`, `200%` 확대 전 구간에서 가로 스크롤 오버플로우(`0 px`)를 달성했다.

---

## 3. 검증 증거 요약

### 3.1 정적 분석 및 단위 테스트
- **타입 검사**: `pnpm --filter @toonstudio/character-lab typecheck` -> **0 에러 통과**
- **단위 및 아키텍처 테스트**: `pnpm --filter @toonstudio/character-lab exec vitest run --no-file-parallelism src/architecture.test.ts src/app/shell/panels/PosePanel.test.tsx src/app/shell/panels/PackagePanel.test.tsx src/app/shell/panels/ViewportPane.test.tsx` -> **4개 파일, 118개 테스트 전원 통과**
- **ESLint / Secretlint**:
  - `node scripts/lint-changed.mjs` -> **0 에러 통과**
  - `node scripts/secretlint-files.mjs` -> **0 에러 통과**

### 3.2 실브라우저 멀티뷰포트 · 포즈/Undo 회귀 프로브
1. **`pose-usability-probe.mjs` ([pose-usability-probe-report.json](./pose-usability-probe-report.json))**:
   - `evaluation.ok`: `true` (`failures: []`, 종료 코드 `0`)
   - **뷰포트 매트릭스 (`320px`, `390px`, `768px`, `1440px`, `200pct-zoom`)**: 5개 뷰포트 모두 `horizontalOverflowPx: 0`, `posePanelOverflowPx: 0`, `under44Count: 0` (67개 대화형 요소 전수 통과)
   - **포인터 관절 핸들 드래그 및 Undo/Redo 회귀**: `leftLowerArm` 드래그 시 히스토리 깊이 `1 -> 2` 증가, 버튼 및 `Ctrl+Z` / `Ctrl+Y` 키보드 Undo/Redo 정상 복원 (`pageErrorCount: 0`)
   - **리그 전환 및 손상 스켈레톤 경계**: `normal-empty-rig` 빈 상태 안내 표시(`emptyNoticeShown: true`), `corrupt-cycle-rig` / `corrupt-nan-rest-rig` 조작 차단, `valid-humanoid-rig` 전환 즉시 복구(`poseActionSucceeded: true`)
2. **`pose-usability-negative-control.json` ([pose-usability-negative-control.json](./pose-usability-negative-control.json))**:
   - 변이 케이스 6종 모두 평가기에서 정확히 거부(`allRejected: true`)
3. **`character-lab-ui-verification-report.json` ([character-lab-ui-verification-report.json](./character-lab-ui-verification-report.json))**:
   - `ok`: `true` (`allPackageViewportsPass: true`, `pageErrors: []`)
   - `PosePanel` <-> `PackagePanel` 양방향 빠른 전환 버튼 동작 확인
   - `PackagePanel` 고급 진단 기본 접힘(`defaultOpen: false`) 및 열기/닫기 토글 확인
   - `PackagePanel` 5개 뷰포트(`320px`, `390px`, `768px`, `1440px`, `200pct-zoom`) `horizontalOverflowPx: 0`, `panelOverflowPx: 0`, `under44Count: 0` 확인
   - 포즈 적용(`서기`) 시 `pose-rest-empty-notice` 숨김 -> `실행 취소`(Undo) 시 `pose-rest-empty-notice` 복원 -> `다시 실행`(Redo) 시 `서기` 재적용 확인
4. **스크린샷 산출물**:
   - `before/before-{320px,390px,768px,1440px,200pct-zoom}.png`
   - `after/after-{320px,390px,768px,1440px,200pct-zoom}.png`
   - `package-viewports/package-{320px,390px,768px,1440px,200pct-zoom}.png`
