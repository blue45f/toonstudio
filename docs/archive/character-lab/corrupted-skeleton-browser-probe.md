# 손상 스켈레톤 실브라우저 프로브 (corrupted-skeleton-probe)

상태: **current (2026-11-06)**. 이 문서는 `apps/character-lab/scripts/corrupted-skeleton-probe.mjs`와 픽스처·평가 모듈 `apps/character-lab/scripts/corrupted-skeleton-fixtures.mjs`의 실행 규약, 3가지 실행 경로(Track A), 공식 `PackagePanel` 진입점 기반 라이브 호출부 결함 감사(Track B), 그리고 음성 대조군(`--negative-control`) 검증 체계를 설명한다.

## 1. 목적과 검증 범위

Character Lab의 뷰포트 기즈모·형상 제어점·관절 드래그 계산 경계(`skeleton-boundary-guard.ts`, `viewport-interactions.ts`, `shaper-bone-gizmo.ts`, `shaper-control-points.ts`)는 외부 제작(authored) 스켈레톤이나 합성 입력에 다음 결함이 섞여 들어올 때 렌더 루프나 포인터 핸들러가 중단되지 않도록 격리한다.

- **비유한 레스트 변환** (`skeleton-non-finite-rest`): `NaN` 또는 `±Infinity`가 포함된 `restTranslation`
- **부모 참조 순환** (`skeleton-cycle`): 휴머노이드 본 순환(`hips <-> spine`), 자기 참조(`hips -> hips`), 보조 본 순환(`auxA <-> auxB`)
- **구조·형식 손상** (`skeleton-invalid-input`): 비배열 `bones`, 빈 본 이름, 중복 본 이름, 비문자열/빈 문자열 `parent`, 비유한·영벡터 `restRotation`, 비유한 픽셀/피벗 좌표
- **정상 빈 결과 구분**: 스켈레톤이 없는 소스(`bones: []` 또는 `poseSkeleton() === null`)는 오류가 아니며 `onFailure`를 호출하지 않는다(`failureCount === 0`).
- **예기치 않은 프로그래밍 오류 보존**: 스켈레톤 경계 오류가 아닌 `TypeError` 등은 삼키지 않고 그대로 다시 던진다.

이 프로브는 Node 단위 테스트만으로는 확인하기 어려운 **실제 Chromium 브라우저 내 Vite ES 모듈 로드, WebGL2 엔진 마운트, 공식 `PackagePanel` 네트워크 페치, 실제 DOM 포인터 이벤트(`page.mouse`), React 상태·Undo 히스토리 보존, 라이브 `.tsx` 호출부 결함 재현**을 한 번에 검증하고 구조화된 JSON 리포트로 남긴다.

```text
scripts/corrupted-skeleton-probe.mjs
  ├─ [사전] Git 커밋·조상 커밋(f8a04aee, 06d95bc8, 39976d11)·작업 트리 상태 수집
  ├─ [안전장치] guardTmpdir(/tmp 소켓 104바이트 제한) + Vite dev 서버(detached 그룹 + 부모 감시자)
  ├─ [라우팅] page.route("**/assets/characters/**") → 공식 제작 패키지 형식의 합성 카탈로그 4종 서빙
  ├─ [Track A] 경계 가드 계약 검증 (3가지 실행 경로)
  │    ├─ Path 1: DIRECT_API_CALL (브라우저 내 실제 Vite ES 모듈 직접 호출)
  │    ├─ Path 2: SYNTHETIC_INJECTION (공식 PackagePanel UI를 통한 손상 GLB·매핑 패키지 주입)
  │    └─ Path 3: REAL_DOM_POINTER (실제 page.mouse 드래그·원자성·복구 후 Undo/Redo 검증)
  └─ [Track B] LIVE_APP_CALLER_DEFECT_AUDIT (공식 PackagePanel 진입점만 사용한 라이브 .tsx 호출부 감사 · 전수 RESOLVED 검증)
       ├─ viewport-pane-onfailure-unwired (ViewportPane.tsx onFailure 배선 및 중복 배너 억제: status="RESOLVED")
       ├─ pose-panel-direct-fk-cycle-crash (PosePanel.tsx 순환 스켈레톤 경계 가드·원자성·복구: status="RESOLVED")
       ├─ pose-panel-direct-fk-nan-rest-crash (PosePanel.tsx 비유한 restTranslation 경계 가드·원자성·복구: status="RESOLVED")
       └─ importFlowBoundaries (Recipe JSON · Kit manifest · Authored Package 도달 가능성 명세)
```

---

## 2. 빠른 시작과 CLI 옵션

저장소 루트에서 실행한다. `CHARACTER_LAB_BROWSER_PROBE=1` 환경 변수가 켜져 있을 때만 실브라우저 프로브를 구동한다(`--negative-control`은 브라우저 없이 즉시 실행 가능).

```sh
# 1) 컨테이너/리눅스 소프트웨어 렌더러(SwiftShader)로 실브라우저 프로브 실행 + JSON 리포트 저장
CHARACTER_LAB_BROWSER_PROBE=1 node apps/character-lab/scripts/corrupted-skeleton-probe.mjs \
  --software --out /tmp/corrupted-skeleton-probe-report.json

# 2) 라이브 앱 .tsx 호출부 결함 3건이 모두 RESOLVED(reproducedDefectCount: 0)인지 강제하는 엄격 모드 (통과 시 exit 0, 회귀 시 exit 1)
CHARACTER_LAB_BROWSER_PROBE=1 node apps/character-lab/scripts/corrupted-skeleton-probe.mjs \
  --software --strict-app-defects --out /tmp/corrupted-skeleton-probe-strict.json

# 3) 음성 대조군(Negative Control): 깨진 리포트가 반드시 실패(exit 1)로 판정되는지 검증
CHARACTER_LAB_BROWSER_PROBE=1 node apps/character-lab/scripts/corrupted-skeleton-probe.mjs \
  --negative-control --out /tmp/corrupted-skeleton-negative-control.json

# 4) 이미 떠 있는 Vite 개발 서버를 재사용해 실행
CHARACTER_LAB_BROWSER_PROBE=1 node apps/character-lab/scripts/corrupted-skeleton-probe.mjs \
  --software --url http://127.0.0.1:5173/
```

### CLI 옵션 표

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `--software` | `false` | Linux 컨테이너용 SwiftShader 플래그(`--no-sandbox`, `--enable-features=Vulkan`, `--use-angle=swiftshader`, `--use-webgpu-adapter=swiftshader`)를 추가하고 리포트에 `softwareRenderer: true` 및 하드웨어 미검증 고지를 기록한다 |
| `--strict-app-defects` | `false` | Track B의 라이브 앱 `.tsx` 호출부 결함 감사 항목 3건이 모두 `status: "RESOLVED"`(`reproduced: false`, `reproducedDefectCount: 0`)이고 Track A가 통과할 때 종료 코드 `0`을 반환하며, 어느 하나라도 미해결(`REPRODUCED_DEFECT`)로 회귀하거나 누락되면 종료 코드 `1`로 실패시킨다 |
| `--negative-control` | `false` | 경계 가드가 깨진 가짜 리포트 6종을 평가기에 주입해 모두 실패로 거부되는지 검증하고, 음성 대조군 계약에 따라 종료 코드 `1`로 끝난다 |
| `--out <path>` | 없음 | 전체 JSON 리포트를 지정한 경로에 저장한다(부모 폴더가 없으면 생성) |
| `--url <url>` | 자체 기동 | 이미 실행 중인 Vite 개발 서버 주소를 사용한다. 생략하면 스크립트가 빈 포트에 Vite 개발 서버를 직접 띄우고 종료 시 정리한다 |
| `--timeout-sec <sec>` | `120` | 브라우저 단계별 대기 및 서버 준비 타임아웃(초) |

### 종료 코드

| 종료 코드 | 의미 |
| --- | --- |
| `0` | Track A 모든 경계 검증 통과(및 `--strict-app-defects`에서 Track B 호출부 결함 3건 모두 `RESOLVED` 확인, 또는 `CHARACTER_LAB_BROWSER_PROBE !== "1"`로 게이트 건너뜀) |
| `1` | Track A 검증 실패, `--strict-app-defects`에서 라이브 앱 호출부 결함 회귀(`REPRODUCED_DEFECT`) 또는 누락, 또는 `--negative-control` 실행 완료 |
| `2` | `playwright` 패키지 또는 Chromium 실행 파일 부재(구조적 skip) |

---

## 3. 운영 안전장치 및 환경 제약 고지

1. **유닉스 소켓 경로 길이 방어 (`guardTmpdir`)**:
   Chromium은 프로필 디렉터리 안에 `SingletonSocket` 유닉스 도메인 소켓을 생성하며, 경로가 104바이트(macOS 기준; Linux 108바이트)를 넘으면 즉시 실패한다. 스크립트는 `os.tmpdir()` 바이트 길이를 검사해 여유가 부족하면 프로세스 `TMPDIR`을 `/tmp`로 자동 전환한다.
2. **프로세스 그룹 격리 및 이중 정리 (`startViteDevServer` + `PARENT_WATCHDOG_SOURCE`)**:
   자체 기동하는 Vite 개발 서버는 `detached: true` 프로세스 그룹으로 띄우며, `--import`로 부모 감시자(`PARENT_WATCHDOG_SOURCE`)를 주입한다. 정상 종료·예외·`SIGINT`·`SIGTERM`에서는 `killGroup(child)`으로 프로세스 그룹 전체를 종료하고, 만일 부모 프로세스가 `SIGKILL`로 죽더라도 2초 안에 개발 서버가 스스로 종료한다.
3. **브라우저 프로세스 신원 기록 (`readOwnedBrowserIdentity`)**:
   연결한 브라우저의 CDP `SystemInfo.getProcessInfo`로 실제 `browserPid`, `browser.version()`, 프로세스 명령줄만 기록하며 사용자의 다른 Chrome 프로세스를 탐색하거나 종료하지 않는다.
4. **소프트웨어 렌더러(`--software`) 한계 고지**:
   컨테이너 환경에서 `--software`(SwiftShader)로 실행한 결과는 **실제 물리 GPU(WebGPU/Metal/Vulkan/DX12), 실제 웹캠(MediaPipe 카메라 스트림), 모바일/태블릿 터치 기기 및 성능(프레임 시간)을 검증한 증거가 아니다.** 리포트의 `environment.hardwareDisclaimerKo`에 이 한계를 명시한다.

---

## 4. 소스 및 커밋 출처 기록 (Provenance)

리포트의 `provenance` 섹션은 실행 시점의 Git 상태를 자동으로 수집한다.

- `commitSha` / `shortCommit` / `branch`: 현재 `HEAD` 커밋 해시와 브랜치 이름
- `ancestorCommits`: 스켈레톤 수치 안정성·통합 계약·안전 경계를 구축한 핵심 선행 커밋 3개(`f8a04aee`, `06d95bc8`, `39976d11`)가 현재 `HEAD`의 조상인지 `git merge-base --is-ancestor`로 확인한 결과
- `dirtyFiles`: `git status --porcelain`으로 수집한 작업 트리 변경 파일 목록

---

## 5. Track A: 실브라우저 3가지 실행 경로 검증

프로브는 `page.route("**/assets/characters/**")`로 `buildOfficialFixturePackageCatalog("/assets/characters/")`가 생성한 공식 제작 패키지 형식의 카탈로그(`/assets/characters/index.json` 및 각 캐릭터의 `manifest.json`, `slot-mapping.json`, `<id>.glb`)를 서빙한다.

| 합성 패키지 ID | 용도 | `poseSkeleton()` 결과 |
| --- | --- | --- |
| `valid-humanoid-rig` | 정상 16본 휴머노이드 GLB 패키지 | 유한한 16본 `SkeletonData` (`hips`, `spine`, `chest`, `upperChest`, `neck`, `head`, 양팔·양다리) |
| `normal-empty-rig` | 스켈레톤이 없는 정적 메시 GLB 패키지 (`skeleton: false`) | `null` (정상 빈 결과, 관절 핸들 0개) |
| `corrupt-cycle-rig` | `Hips_CycleRoot`와 `Hips_Root`가 모두 `hips`로 매핑되어 `hips <-> spine` 부모 순환을 만드는 패키지 | `hips.parent === "spine"`, `spine.parent === "hips"` 순환 `SkeletonData` |
| `corrupt-nan-rest-rig` | 부모·자식 본의 극단 평행이동(`1.7976931348623157e308`) 회전 후 차감(`Infinity - Infinity = NaN`)으로 `spine.restTranslation`에 `NaN`이 발생하는 패키지 | `spine.restTranslation`에 `NaN`이 포함된 `SkeletonData` |

### 5.1 Path 1 — `DIRECT_API_CALL` (실제 Vite ES 모듈 직접 호출)

브라우저 컨텍스트(`page.evaluate(runBrowserDirectApiProbe)`)에서 Vite가 서빙하는 실제 ES 모듈(`skeleton-boundary-guard.ts`, `viewport-interactions.ts`, `shaper-bone-gizmo.ts`, `shaper-control-points.ts`, `lab-store.ts`)을 동적 `import()`해 직접 검증한다.

- **`nan-rest` / `inf-rest`**: `restTranslation`에 `NaN`·`Infinity`가 들어 있을 때 `[skeleton-non-finite-rest]` 코드와 한글 사유를 `onFailure`로 보고하고 빈 배열/`null`을 반환한다.
- **`parent-cycle-humanoid` / `parent-cycle-self` / `parent-cycle-aux`**: 휴머노이드 본 순환, 자기 참조, 보조 본 순환에서 무한 루프 없이 `[skeleton-cycle]`을 보고하고 안전하게 종료한다.
- **`malformed-shape` (5종 변형 모두 검증)**:
  1. `malformed-non-array-bones` (`{ bones: null }`)
  2. `malformed-empty-bone-name` (`name: ""`)
  3. `malformed-duplicate-bone-name` (`hips` 중복)
  4. `malformed-invalid-parent-type` (`parent: ""` 또는 비문자열)
  5. `malformed-invalid-rest-rotation` (길이 미달 또는 영벡터 사원수 `[0, 0, 0, 0]`)
  모두 `[skeleton-invalid-input]`으로 진단된다.
- **`normal-empty`**: 빈 스켈레톤(`{ bones: [] }`)에서 `diagnoseSkeletonData`가 `null`을 반환하고 모든 기즈모·제어점 함수에서 `failureCount === 0`이다.
- **`unexpected-programming-error`**: `camera`가 `null`일 때 발생하는 `TypeError` 등 프로그래밍 오류는 스켈레톤 경계 오류로 위장해 삼키지 않고 그대로 throw한다.
- **상태 원자성 및 즉시 복구**: 손상 스켈레톤 드래그 실패 시 기존 `LabStore`의 포즈(`leftLowerArm`), 슬롯 선택, Undo 히스토리 깊이가 변하지 않으며, 직후 정상 스켈레톤으로 드래그하면 즉시 새 포즈가 커밋되고 Undo/Redo가 동작한다.

### 5.2 Path 2 (`SYNTHETIC_INJECTION`) & Path 3 (`REAL_DOM_POINTER`)

실제 Character Lab 워크벤치 UI에서 공식 버튼·탭과 `page.mouse` 포인터 이벤트만 사용해 검증한다.

1. **엔진 기동 및 기준선 확립**: `"WebGL2"` 버튼 클릭 → `"제작 패키지"` 탭에서 `"절차 소스로 전환"` 클릭 → 뷰포트 도구 막대에서 `"관절 핸들"`(`showHandles`)과 `"형상 제어점"`(`showControlPoints`) 활성화 → 실제 `page.mouse`로 `.cl-viewport-handle` 원을 드래그해 비-레스트 포즈를 만들고 Undo 히스토리 깊이가 `+1`(`깊이 N -> N+1`) 증가하는지 확인한다.
2. **정상 빈 스켈레톤 (`normal-empty-rig`)**: `"제작 패키지"` 탭에서 `normal-empty-rig` 로드 → 관절 핸들 0개, `.cl-viewport`에 `"이 소스에는 스켈레톤이 없어 표시할 관절 핸들이 없습니다."` 안내 표시, `pageerror` 0건 확인.
3. **부모 순환 스켈레톤 (`corrupt-cycle-rig`)**: `"제작 패키지"` 탭에서 `corrupt-cycle-rig` 로드 → `"관절 핸들"`과 `"형상 제어점"`이 켜진 상태에서 `ViewportPane`이 멈추거나 `pageerror`를 던지지 않음을 확인 → 화면의 `.cl-viewport-handle`에 실제 `page.mouse` 드래그를 시도했을 때 뷰포트 안내 문구(`회전 관절을 찾지 못해 끌 수 없습니다.`)가 표시되고 Undo 히스토리 깊이가 변하지 않음(원자성 보존)을 확인.
4. **비유한 레스트 스켈레톤 (`corrupt-nan-rest-rig`)**: `"제작 패키지"` 탭에서 `corrupt-nan-rest-rig` 로드 → `ViewportPane`이 `pageerror` 없이 유지되고, 실제 `page.mouse` 드래그 시도 시 Undo 히스토리 깊이가 변하지 않음을 확인.
5. **정상 소스 복구 및 실제 포인터 드래그 + 실행 취소 (`valid-humanoid-rig`)**: `"제작 패키지"` 탭에서 `valid-humanoid-rig` 로드(또는 `"절차 소스로 돌아가기"`) → 유한한 화면 좌표를 가진 관절 핸들과 13개 형상 제어점(`.cl-viewport-control-point`)이 다시 나타나고, 실제 `page.mouse` 드래그 시 Undo 히스토리 깊이가 `+1` 증가하며 상단 `"실행 취소"` 버튼 클릭 시 이전 깊이(`-1`)로 정확히 되돌아가는지 검증한다.

---

## 6. Track B: 공식 `PackagePanel` 진입점 기반 라이브 호출부 결함 감사 (`LIVE_APP_CALLER_DEFECT_AUDIT`)

Track B는 백도어나 테스트 훅 없이 **오직 공식 `PackagePanel` UI 진입점**으로 `corrupt-cycle-rig`와 `corrupt-nan-rest-rig`를 로드한 상태에서 라이브 `.tsx` 컴포넌트(`ViewportPane.tsx`, `PosePanel.tsx`)의 호출부 경계 배선이 정상 작동하는지 감사한다. 현재 3건의 호출부 경계가 모두 연결·검증되어 `status: "RESOLVED"`, `reproduced: false`, `reproducedDefectCount: 0`이며, `--strict-app-defects` 모드는 3건 모두 `RESOLVED`로 유지될 때 종료 코드 `0`, 어느 하나라도 회귀(`REPRODUCED_DEFECT`)하거나 누락되면 종료 코드 `1`을 반환한다.

### 6.1 해결·검증된 라이브 앱 호출부 경계 3건 (`status: "RESOLVED"`, `reproducedDefectCount: 0`)

| 감사 ID | 위치 | 해결 및 실브라우저 검증 계약 |
| --- | --- | --- |
| `viewport-pane-onfailure-unwired` | `src/app/shell/panels/ViewportPane.tsx` (lines 437, 464, 481, 609, 610) | `resolveDragPivotWithMode`, `computeShaperIkHandleDrag`, `computeJointDrag`, `computeVisibleBoneLinks`, `computeShaperControlPoints` 호출부에 `{ onFailure }` 콜백과 중복 억제 가드가 연결되어, `corrupt-cycle-rig` 로드·드래그 시 `.cl-banner-item`에 `[skeleton-cycle]`이 정확히 1건(`cycleBannerDuplicateCount === 1`), `corrupt-nan-rest-rig` 로드·드래그 시 `[skeleton-non-finite-rest]`가 정확히 1건(`nanBannerDuplicateCount === 1`) 게시됨을 검증한다 |
| `pose-panel-direct-fk-cycle-crash` | `src/app/shell/panels/PosePanel.tsx` (lines 95, 99, 174, 180, 182, 194-195) | `PackagePanel`에서 `corrupt-cycle-rig` 로드 후 `"포즈"` 인스펙터 탭(`PosePanel`) 진입 및 `"현재 위치 읽기"`·`"IK 적용"` 클릭 시 미처리 `pageerror` 0건, `.cl-pose-panel` 또는 `.cl-banner-item`에 `[skeleton-cycle]` 진단 노출, Undo 히스토리 깊이 보존(원자성), 그리고 `valid-humanoid-rig` 복구 후 `"IK 적용"`(`+1`)·`"실행 취소"`(`-1`) 동작을 검증한다 |
| `pose-panel-direct-fk-nan-rest-crash` | `src/app/shell/panels/PosePanel.tsx` (lines 95, 99, 174, 180, 182, 194-195) | 페이지 새로고침 및 `"WebGL2"` 선택 후 `PackagePanel`에서 `corrupt-nan-rest-rig`를 로드하고 `"포즈"` 인스펙터 탭(`PosePanel`) 진입 및 `"현재 위치 읽기"`·`"IK 적용"` 클릭 시 미처리 `pageerror` 0건, `[skeleton-non-finite-rest]` 진단 노출, Undo 히스토리 깊이 보존(원자성), 그리고 `valid-humanoid-rig` 복구 후 `"IK 적용"`(`+1`)·`"실행 취소"`(`-1`) 동작을 검증한다 |

### 6.2 공식 가져오기 경계별 도달 가능성 (`importFlowBoundaries`)

| 가져오기 경로 | 검증 함수·모듈 | 손상 스켈레톤 도달 여부 및 사유 |
| --- | --- | --- |
| **Recipe JSON 불러오기** (`ExportPanel` 파일 입력) | `parseRecipeFile` → `parseRecipe` (`contracts/recipe.ts`) | **도달 불가(사전 차단)**: `JSON.parse`가 `NaN`/`Infinity` 토큰을 거부하고, 레시피 JSON 스키마는 본 회전(`pose`)만 담을 뿐 `SkeletonData.bones` 배열을 포함하지 않는다 |
| **모듈식 키트 (`kit.json` + GLB)** | `parseKitManifest` + `loadKitRig` (`diffJoints`, `kit-skeleton-bind.ts`) | **도달 불가(사전 차단)**: 키트 로더는 계약 상수 `KIT_SKELETON_JOINTS`와 부모 맵을 기준으로 `diffJoints`를 수행해 조인트 목록이나 부모가 어긋나면 `kit-joint-mismatch`로 로드를 거부한다 |
| **제작 패키지 (`PackagePanel` `index.json` + GLB)** | `loadAuthoredPackage` → `loadPackageRig` → `buildPoseFrameSkeleton` (`poseSkeleton()`) | **도달 가능 (`SYNTHETIC_INJECTION` / `REAL_DOM_POINTER`)**: ① 다중 GLB 본 노드가 같은 휴머노이드 이름으로 매핑될 때 `buildPoseFrameSkeleton`에서 부모 순환(`hips <-> spine`)이 만들어져 `poseSkeleton()`에 도달하고, ② 극단 평행이동 오버플로(`Infinity - Infinity = NaN`)가 `restTranslation`의 `NaN`으로 `poseSkeleton()`에 도달한다. 반면 비배열 `{ bones: null }`은 `buildPoseFrameSkeleton`이 항상 배열을 반환하므로 `DIRECT_API_CALL` 경로에서만 도달한다 |

---

## 7. 음성 대조군 검증 (`--negative-control`)

프로브가 항상 통과(무조건 exit `0`)하는 허위 테스트가 아님을 보장하기 위해, `--negative-control` 모드는 `runNegativeControlSuite()`를 실행한다.

- 정상 통과 기준선 리포트(표준 모드 및 `--strict-app-defects` 모드 모두 `exitCode === 0`)에서 각 필수 불변식을 인위적으로 깨뜨린 **변이 리포트(mutated reports)** 를 `evaluateCorruptedSkeletonProbeReport()`에 넣는다:
  1. `missing-nan-rest-case`: 필수 케이스(`nan-rest`) 누락
  2. `normal-empty-false-positive`: 정상 빈 스켈레톤(`normal-empty`)에서 `failureCount > 0` 오탐 발생
  3. `swallowed-programming-error`: 예기치 않은 `TypeError`가 다시 던져지지 않고 삼켜짐
  4. `broken-atomicity`: 손상 드래그 후 Undo 히스토리 깊이나 포즈 상태가 오염됨
  5. `failed-dom-recovery`: 복구 후 실제 DOM 포인터 드래그 또는 실행 취소가 실패함
  6. `strict-mode-unresolved-app-defect`: `strictAppDefects: true`에서 호출부 감사 항목이 `REPRODUCED_DEFECT`(`reproduced: true`)로 회귀함
- 모든 변이 리포트가 `ok === false` 및 `exitCode === 1`로 거부되는지 확인한 뒤, 음성 대조군 CLI 계약에 따라 프로세스 자체도 **종료 코드 `1`** 로 종료한다.
