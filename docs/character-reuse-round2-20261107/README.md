# ToonStudio Character Lab — R&D 실험 결과 안전 재사용 흐름 검증 및 로컬 UI 개선 (Round 2: 2026-11-07)

## 1. 사전 확인 (최신 `main` 커밋 및 소유 범위)

- **최신 `main` 기준 확인**:
  - Round 1 커밋 `1f585a2` (`feat(character-lab): 포즈·리그 선택/빈 상태/고급 진단 접기/터치 영역 로컬 UI 개선`) 및 병합 커밋 `4a9bfdd`가 `origin/main`에 포함되어 있음을 확인했습니다.
  - 열린 원격 PR 및 브랜치에서 `apps/character-lab/**` 경로와 충돌하는 활성 작업이 없음을 확인했습니다.
- **독립 소유 범위 준수**:
  - 수정된 코드는 `apps/character-lab` 로컬 패널 UI·스타일·테스트 7개 파일로만 제한했습니다:
    - `apps/character-lab/src/app/shell/panels/ExportPanel.tsx`
    - `apps/character-lab/src/app/shell/panels/ExportPanel.test.tsx`
    - `apps/character-lab/src/app/shell/panels/PackagePanel.tsx`
    - `apps/character-lab/src/app/shell/panels/PackagePanel.test.tsx`
    - `apps/character-lab/src/app/shell/panels/PosePanel.tsx`
    - `apps/character-lab/src/app/shell/panels/PosePanel.test.tsx`
    - `apps/character-lab/src/app/styles/character-lab.css`
  - 리깅 엔진(`src/animation/**`, `src/render/babylon/**`), 공유 스토어(`src/state/**`), 드로잉/브러시, 다른 앱(`apps/web`, `apps/brush-lab` 등)은 수정하지 않았습니다.

---

## 2. 재현된 로컬 UI 결함 및 최소 수정 내역

사용자가 **패키지 선택 → 포즈 실험 → 기존 내보내기/재가져오기(`.character.json`, `.preset`, PNG/PSD/GLB)** 여정으로 실험 결과를 보존·복구할 때 발생한 로컬 UI 결함 6건을 재현·수정했습니다.

### 결함 1A: 손상된 페인트 레이어(`paint.layers`) 포함 레시피 가져오기 시 거짓 성공 및 기존 실험 데이터 소실 (`ExportPanel.tsx`)
- **원인**: `onRecipeFile`에서 `extractPaintSessionFromRecipe(loaded.recipe)`가 `paint.failures`를 반환하더라도 이를 확인하지 않고 즉시 `recipe/load` 디스패치, `paintSession.replaceLayers`, `setReceipt("저장됨: ...")`를 실행하여 **거짓 성공 영수증**이 표시되고 기존 포즈·페인트 실험 상태가 덮어써졌습니다.
- **수정**: `paint.failures[0]`가 존재하면 즉시 `setFailure(firstFailure)`로 한국어 오류 배너(`실패(paint-layer-png | paint-layer-base64 | paint-layer-size)`)를 표시하고 조기 반환하여 기존 레시피·포즈·페인트 상태를 온전히 보존하도록 수정했습니다.

### 결함 1B: 빈 파일(0 B / 공백 파일) 가져오기 시 불명확한 JSON 구문 오류 표시 (`ExportPanel.tsx`)
- **원인**: 0바이트 또는 공백만 있는 파일을 선택하면 일반 JSON 구문 오류(`recipe-json-syntax`)로만 표시되어 빈 파일 여부가 불명확했습니다.
- **수정**: `text.trim().length === 0`일 때 `failVisible("recipe-file-empty", "${file.name}: 파일이 비어 있습니다(0 B). 올바른 레시피(.character.json) 또는 프리셋(.preset) 파일을 선택하세요.")`를 반환하고 기존 실험 상태를 유지하도록 개선했습니다.

### 결함 1C: 엔진 세션 미연결 상태에서 레시피 재가져오기 시 Capabilities 불일치 및 미로드 제작 패키지 안내 누락 (`ExportPanel.tsx`)
- **원인**: `engineSession.engine()`이 없을 때 `onRecipeFile`이 `recipe/load`만 디스패치하고 `capabilities/set`을 동기화하지 않아, 제작 패키지(`source.kind === "package"`) 레시피를 가져온 뒤 패키지 플랜이 아직 메모리에 등록되지 않았음에도 준비 완료처럼 보이거나 capabilities가 이전 소스 상태로 남았습니다.
- **수정**:
  - `procedural` 소스는 `ALL_AVAILABLE_CAPABILITIES`, 등록 및 SHA 일치 `package` 소스는 `registered.capabilities`, 미등록/SHA 불일치 `package` 소스는 `ALL_UNAVAILABLE_CAPABILITIES`, `kit` 소스는 `deriveKitCapabilities`로 동기화했습니다.
  - 미등록 `package` 레시피 가져오기 시 `importNotices`에 `"제작 패키지(${source.characterId}) 레시피를 불러왔습니다. 패키지 탭에서 해당 패키지를 로드하면 3D 리그가 활성화됩니다."` 안내를 추가했습니다.

### 결함 1D: 내보내기/재가져오기 전후 현재 보존·복구 대상 실험 요약 및 탭 간 빠른 이동 부재 (`ExportPanel.tsx`, `PosePanel.tsx`, `PackagePanel.tsx`)
- **원인**: 내보내기 탭에서 현재 어떤 캐릭터 소스(절차적/제작 패키지 등록 여부/모듈식 키트)와 어떤 실험 포즈(프리셋·편집 본 개수·손 포즈·레시피 해시)가 저장·복원되는지 즉시 확인할 수 없었고, 패키지↔포즈↔내보내기 탭 간 이동 동선이 분리되어 있었습니다.
- **수정**:
  - `ExportPanel` 상단에 `data-testid="export-experiment-summary"` 카드(`export-active-source`, `export-active-pose`)와 `패키지 선택 탭으로`(`export-switch-to-package-tab`), `포즈 실험 탭으로`(`export-switch-to-pose-tab`) 버튼을 추가했습니다.
  - `PosePanel`의 `pose-rig-summary`에 `내보내기·보존`(`pose-switch-to-export-tab`) 이동 버튼을 추가했습니다.
  - `PackagePanel`에 미등록 패키지 소스 복원 안내 배너(`package-unloaded-source-notice`)와 `내보내기 탭으로 이동`(`package-switch-to-export-tab`) 버튼을 추가했습니다.

### 결함 1E: 패키지 비동기 로드 중 취소(절차적 휴머노이드 전환/기본 캐릭터 변경) 시 거짓 등록 완료 표시 (`PackagePanel.tsx`)
- **원인**: 패키지 다운로드·검증 중 사용자가 `절차적 휴머노이드로 돌아가기` 또는 다른 캐릭터 선택으로 작업을 취소해도, 먼저 시작된 `loadPackage`가 완료될 때 `packagePlans.register(result.plan)`와 `phase: "ready"`(`"플랜을 등록했습니다"`)를 그대로 기록하여 **취소 후 거짓 성공 상태**가 남았습니다.
- **수정**: `sourceOpSeq.current` 증가 시 진행 중인 `loading` 엔트리를 정리(`clearLoadingPackages`)하고, `loadPackage` 완료 시 `sourceOpSeq.current !== op`이면 플랜 등록 및 `ready` 상태 기록 없이 즉시 중단하도록 수정했습니다. 또한 `packagePlans.register`를 `engineSession.reloadSource` 성공 이후에 호출하도록 순서를 바로잡았습니다.

### 결함 1F: 패키지 인덱스/개별 패키지 로드 실패 후 재시도 성공 시 스토어 실패 기록 잔류 (`PackagePanel.tsx`)
- **원인**: 네트워크/매니페스트 오류로 `failure/record`가 스토어에 기록된 뒤 사용자가 `다시 시도`로 정상 복구해도 스토어의 이전 실패 항목이 해제되지 않았습니다.
- **수정**: `lastIndexFailureRef` 및 `lastPackageFailuresRef`로 직전 실패를 추적하고, 재시도 성공 시 `failure/dismiss`를 디스패치하여 이전 실패 상태를 정리하도록 수정했습니다.

---

## 3. 단위·통합·아키텍처·타입·린트 검증 결과

| 검증 항목 | 실행 명령 | 결과 |
| --- | --- | --- |
| 타입검사 (`tsc --noEmit`) | `pnpm --filter @toonstudio/character-lab typecheck` | 통과 (오류 0건) |
| 변경 파일 린트 | `node scripts/lint-changed.mjs` | 통과 (`OK (8 changed file(s) checked)`) |
| 시크릿 스캔 | `pnpm lint:secrets` | 통과 |
| 아키텍처 경계 테스트 | `vitest run src/architecture.test.ts` | 29 passed |
| 레시피 파일 상호운용 테스트 | `vitest run src/app/recipe-file-interop.test.ts` | 7 passed |
| 내보내기/재가져오기 패널 테스트 | `vitest run src/app/shell/panels/ExportPanel.test.tsx` | 15 passed |
| 패키지 패널(취소·재시도·긴 이름) 테스트 | `vitest run src/app/shell/panels/PackagePanel.test.tsx` | 24 passed |
| 포즈 패널 회귀 테스트 | `vitest run src/app/shell/panels/PosePanel.test.tsx` | 24 passed |
| **합계** | **5개 테스트 스위트** | **99 passed (99)** |

---

## 4. 실제 브라우저 R&D 실험 재사용 여정 및 엣지케이스 검증 결과

실제 Chromium 브라우저(`http://127.0.0.1:4183/`)에서 fixture 데이터만 사용하여 검증한 결과(`verification-report.json`):

1. **패키지 선택 → 포즈 실험 → 내보내기 보존**:
   - `PackagePanel`에서 `avatar-orion-authored` 선택 → `현재 선택됨` 배지 확인.
   - `PosePanel`에서 `손 흔들기` 포즈 프리셋 적용 (`선택 상태: 손 흔들기 (편집된 본 7개)`).
   - `ExportPanel` 요약 카드에서 `활성 소스: 제작 패키지 (avatar-orion-authored · 등록됨)` 및 `실험 포즈: 손 흔들기 (본 7개 · 손 peace) · 레시피 #f185e44b` 확인 후 `.character.json` (7,041 B) 및 `.preset` (261 B) 내보내기 완료 (`journey-1-saved-export-pc-1440.png`).
2. **초기화 후 빈 파일·손상 JSON·손상 페인트 PNG 거부 및 데이터 보존**:
   - 절차적 휴머노이드 + 기본 자세(`레시피 #89e193a2`)로 전환 후:
     - **0바이트 빈 파일(`empty-0byte.character.json`)**: `실패(recipe-file-empty)` 알림 표시, 거짓 성공 영수증 `0건`, 기존 실험 상태 유지.
     - **손상된 JSON(`corrupt-syntax.character.json`)**: `실패(recipe-json-syntax)` 알림 표시, 기존 실험 상태 유지.
     - **손상된 페인트 PNG(`corrupt-paint.character.json`)**: `실패(paint-layer-png): 페인트 레이어(skin)의 PNG를 디코드할 수 없습니다.` 알림 표시, 거짓 성공 영수증 `0건`, 기존 포즈(`레시피 #89e193a2`) 데이터 무손실 유지 (`journey-2-corrupt-error-pc-1440.png`).
3. **실패 후 긴 파일명 레시피 재시도 복구 및 파일 선택 취소 보존**:
   - 130자 이상의 긴 파일명(`orion_wave_experiment_reuse_round2_long_segment_..._restored.character.json`)으로 앞서 보존한 실험 레시피를 재가져오기 시도 → 이전 오류 알림 즉시 해제(`alertCountAfterRetry: 0`), `활성 소스: 제작 패키지 (avatar-orion-authored · 등록됨)` 및 `실험 포즈: 손 흔들기 (본 7개 · 손 peace) · 레시피 #f185e44b` 완벽 복원 (`journey-3-restored-longname-pc-1440.png`).
   - 이후 파일 선택 취소(`files: []`) 시에도 복원된 제작 패키지·포즈·영수증 상태가 소실 없이 유지됨을 확인했습니다.

---

## 5. 5개 뷰포트 + 200% 확대 레이아웃·터치 타깃 검증 (`verification-report.json`)

모든 인터랙티브 요소(`button`, `input`, `select`, `[role="tab"]`) 최소 `44x44px` 충족 및 가로 오버플로 `0px` 달성:

| 뷰포트 | 해상도 / 배율 | ExportPanel 오버플로 / 44px 미달 | PosePanel 오버플로 / 44px 미달 | PackagePanel 오버플로 / 44px 미달 | 스크린샷 증거 |
| --- | --- | --- | --- | --- | --- |
| 모바일 320 | `320×640` (100%) | `0px` / `0건` (22개 검사) | `0px` / `0건` (45개 검사) | `0px` / `0건` (11개 검사) | `export-mobile-320.png`, `pose-mobile-320.png`, `package-mobile-320.png` |
| 모바일 390 | `390×844` (100%) | `0px` / `0건` (22개 검사) | `0px` / `0건` (45개 검사) | `0px` / `0건` (11개 검사) | `export-mobile-390.png`, `pose-mobile-390.png`, `package-mobile-390.png` |
| 태블릿 768 | `768×1024` (100%) | `0px` / `0건` (22개 검사) | `0px` / `0건` (45개 검사) | `0px` / `0건` (11개 검사) | `export-tablet-768.png`, `pose-tablet-768.png`, `package-tablet-768.png` |
| PC 1440 | `1440×900` (100%) | `0px` / `0건` (22개 검사) | `0px` / `0건` (45개 검사) | `0px` / `0건` (11개 검사) | `export-pc-1440.png`, `pose-pc-1440.png`, `package-pc-1440.png` |
| PC 1440 (200% 확대) | `1440×900` (200%) | `0px` / `0건` (22개 검사) | `0px` / `0건` (45개 검사) | `0px` / `0건` (11개 검사) | `export-pc-1440-zoom200.png`, `pose-pc-1440-zoom200.png`, `package-pc-1440-zoom200.png` |
