# 3D 렌더 게이트 Metal 기준선 스윕 (2026-10-23)

- 문서 상태: `current` — 2026-10-23 에 이 Mac 에서 실행한 측정의 원본 기록이다(역사 문서). 이후 커밋·환경에서는 달라질 수 있다.
- 기준 커밋: `db522ce2b`(origin/main, 2026-10-23 09:40 KST). 이 커밋을 빌드(약 575초)한 `dist/` 와 소스로 게이트를 돌렸고 저장소 코드는 바꾸지 않았다.
- 환경: Apple M2 Max(12코어·32 GiB·Metal 4), macOS 26.7.2, Node v24.16.0, pnpm 11.4.0, Playwright 1.64.1(Chrome for Testing 156.0.8078.4), 시스템 Google Chrome 156.0.8078.47.
- 방법: 직렬 실행, 게이트마다 하드 타임아웃, 최소 환경변수만 전달, 끝난 뒤 남은 브라우저·서버 프로세스 정리. 선언된 레인·결과·실제 렌더러 문자열을 같이 적었다. 측정 시각은 레인 프로브 10:07 KST, 스윕 10:11~10:36 KST.
- 파일: `lane-probe.json`(레인 프로브 원본), `sweep-results.json`(게이트별 결과·원인 분류·로그 끝부분), `ui-triage.json`(화면 구조 진단), `tools/*.txt`(실행한 도구 소스, 아래 §7).
- 짝 계획: 3D 고도화 계획 W0 의 X-2(Metal 기준선 스윕). 이 문서는 계획·결정을 담지 않고 측정과 확인한 원인만 적는다.

## 1. 먼저 읽을 결론

1. 16회 실행(게이트 15개, 캐릭터 랩 프로브는 기본·Metal 두 구성): **통과 6 · 실패 10 · 멈춤 0**. 실패 10건 중 8건은 "게이트 드리프트"(Studio 화면이 바뀌었는데 게이트의 진입 경로·선택자가 그대로)이고 2건은 캐릭터 랩 프로브의 부분 통과(통과 10·14, 실패 1)다.
2. **레인 이름을 믿을 수 없다.** 선언이 hardware 인 `specialists` 도 기본 launch(headless shell)라 SwiftShader 로 돌았다. 기본 headless shell 은 macOS 에서도 SwiftShader·WebGPU 어댑터 없음이고, 전체 Chrome for Testing(`channel: "chromium"`)과 시스템 Chrome 은 Metal 이다(§2).
3. **Metal 에서 실제로 확인된 것**: 콘솔 게이트의 WebGPU 증명 샤드 2개(`babylon-artifact-parity`, `magic-layer-alignment`) 통과, `tiled` WebGPU 하드웨어 어댑터 ok(apple/metal-3, `isFallbackAdapter` false), 소크 스모크 4주기·컨텍스트 손실 0, 셰이퍼 뷰포트 렌더(고유 색 427)와 렌더러 단언 통과, 캐릭터 랩 WebGPU·WebGL2 둘 다 ready·썸네일 각 6개·PBR/툰 투명 PNG 통과·페이지 오류 0건.
4. **3D 편집기를 화면으로 여는 게이트가 전부 적색이다**(콘솔 패스·visual e2e 7건·physics·inapp-editor·셰이퍼 2종). 야간 CI(`main-full-qa-studio`)도 같은 지점에서 적색이고 최근 4회 실행이 모두 failure 다(§5). 이 게이트들은 필수 CI 목록(`scripts/ci-required-vitest-targets.txt` 는 vitest 전용)에 없고 `main` 에는 GitHub 필수 상태 검사도 걸려 있지 않아, 3D 편집기를 실제 브라우저에서 지키는 상시 게이트가 사실상 없다.
5. 코드 주석 하나가 틀렸다: `verify-studio-3d-console.mts` 의 "macOS 에서 SwiftShader 어댑터를 강제하면 requestDevice 가 걸린다(Chromium 151)"는 Chrome for Testing 156 에서 재현되지 않는다(`bg3d-webgpu-engine` 통과, 레인 프로브 requestDevice ok).

## 2. 레인 프로브 — 같은 Mac 에서 실행 구성별 렌더러

| 실행 구성 | WebGL2 렌더러 | WebGPU 어댑터 | requestDevice |
| --- | --- | --- | --- |
| `chromium.launch({ headless: true })` (Playwright 기본, headless shell) | SwiftShader (ANGLE Vulkan, 소프트웨어) | adapter null | - |
| `channel: "chromium"` + `--no-sandbox` (전체 Chrome for Testing) | Apple M2 Max (ANGLE Metal) | apple/metal-3 | ok |
| `channel: "chromium"` + 콘솔 게이트의 darwin 네이티브 인자 | Apple M2 Max (ANGLE Metal) | apple/metal-3 | ok |
| `channel: "chromium"` + `--use-angle=metal --disable-software-rasterizer` | Apple M2 Max (ANGLE Metal) | apple/metal-3 | ok |
| `channel: "chromium"` + `--use-angle=swiftshader` (WebGL 소프트웨어) | SwiftShader (ANGLE Vulkan, 소프트웨어) | adapter null | - |
| `channel: "chromium"` + WebGPU SwiftShader 고정 인자 세트 | SwiftShader (ANGLE Vulkan, 소프트웨어) | google/swiftshader | ok |
| `channel: "chrome"` (시스템 Google Chrome 156.0.8078.47) | Apple M2 Max (ANGLE Metal) | apple/metal-3 | ok |

읽는 법: 같은 기계에서도 실행 구성이 렌더러를 정한다. 기본 headless shell 은 소프트웨어 렌더러이고 WebGPU 어댑터가 없다(`--enable-unsafe-webgpu` 를 주면 소프트웨어 폴백 어댑터가 잡히고, 캐릭터 랩처럼 폴백을 막는 앱은 WebGPU 가 failed 가 된다). WebGPU 까지 소프트웨어로 쓰려면 `--use-webgpu-adapter=swiftshader` 계열 인자가 따로 필요하다.

## 3. 게이트 스윕

| 게이트 | 선언 레인 | 실제로 확인된 레인 | 결과 | 분류 | 핵심 | 소요 |
| --- | --- | --- | --- | --- | --- | --- |
| `(tsx) verify-studio-3d-quality-soak.mts` | 기본(실GPU 렌더러 단언) | Metal (Apple M2 Max) | 통과 | 통과 | 0.1분 스모크 4주기, 30분 통과 아님 | 24s |
| `verify:studio-scene3d-capture-resources` | hardware(기본) | 미확인(페이지가 먼저 죽음) | 실패 | 게이트 드리프트 | react 모듈 로드 실패 → 120초 타임아웃 | 121s |
| `verify:studio-3d-specialists:browser` | hardware(기본) | SwiftShader | 통과 | 통과 | 선언과 실제가 다름 | 18s |
| `verify:studio-3d-tiled:browser` | hardware(기본) | Metal WebGPU (apple/metal-3) | 통과 | 통과 | isFallbackAdapter false | 18s |
| `verify:studio-3d-inplace:browser` | swiftshader 고정 | SwiftShader | 실패 | 게이트 드리프트 | theme-packs.json 404 3건을 오류로 셈 | 12s |
| `verify:studio-character-shaper` | native(darwin 기본) | Metal WebGL2 (Apple M2 Max) | 실패 | 게이트 드리프트 | '헤어' 레일 버튼을 못 찾음 | 51s |
| `verify:studio-character-production-framing` | native | Metal WebGL2 (Apple M2 Max) | 실패 | 게이트 드리프트 | '파일 내보내기 해상도'를 못 찾음 | 40s |
| `verify:studio-bg3d-physics` | 기본 launch (WebGL2) | SwiftShader로 추정(기록 없음) | 실패 | 게이트 드리프트 | creative-starter 안 보임(CI 동일) | 53s |
| `verify:studio-bg3d-inapp-editor` | 기본 launch | SwiftShader로 추정(기록 없음) | 실패 | 게이트 드리프트 | #bg3d-tab-view 안 보임(CI 동일) | 345s |
| `verify:studio-3d-console` | darwin 네이티브 (WebGPU 샤드) | WebGPU 샤드 Metal, 헤드풀 창 | 실패 | 게이트 드리프트 | 샤드 2 PASS 뒤 삽입 메뉴 3D 항목이 접힘 안(CI 동일) | 55s |
| `verify:studio-3d-visual` | SwiftShader 고정 (config) | SwiftShader (기록 없음) | 실패 | 게이트 드리프트 | 7/8 실패, 레일 설정 버튼 2개 strict(CI 동일) | 102s |
| `verify:studio-3d-web-authoring:browser` | SwiftShader 고정 (config) | SwiftShader (설정 고정) | 통과 | 통과 | 시스템 Chrome 헤드리스 | 60s |
| `character-lab browser-probe` | 기본 launch | WebGL2 SwiftShader · WebGPU 폴백 차단 | 실패 | 부분 통과 | 통과 10·실패 1·건너뜀 1 | 235s |
| `(tsx) verify-vrm-hand-visual-audit.mts` | swiftshader 고정 | SwiftShader | 통과 | 통과 | 손 캡처 PNG 산출 | 108s |
| `verify:studio-bg3d-webgpu-engine` | swiftshader-determinism | SwiftShader WebGPU (google/swiftshader) | 통과 | 통과 | macOS 에서 requestDevice ok | 15s |
| `character-lab browser-probe (CHARACTER_LAB_CHROMIUM_PATH=Chrome for Testing)` | 전체 CfT 명시 (Metal) | Metal WebGPU+WebGL2 (apple/metal-3) | 실패 | 부분 통과 | 통과 14·실패 1, 실패는 레시피 왕복 | 215s |

(결과 집계: 통과 6 · 실패 10)
(분류 집계: 통과 6 · 게이트 드리프트 8 · 부분 통과 2)

게이트별 한 줄 원인과 확인 방법(`sweep-results.json` 의 `cause` 가 원본):

- `scene3d-capture-resources`: 하니스 페이지가 `react` 모듈을 못 불러온다(`does not provide an export named 'default'`) — `optimizeDeps.include` 에 react 가 없다. 증명 객체가 안 생겨 120초 타임아웃이고 GPU 와 무관하다. 계측 사본으로 pageerror 를 직접 확인했다.
- `scene3d-inplace-browser`: 안쪽 작업(lod)은 ok 인데 콘솔 404 3건을 실패로 센다. URL 은 `/assets/3d/environments/bundle-v1/theme-packs.json` — 하니스 서버가 `publicDir: false` 라서 새로 생긴 런타임 fetch 가 404 다. 계측 사본으로 URL 을 직접 확인했다.
- `character-shaper`: 렌더러 단언·뷰포트 픽셀 검사 통과 뒤 `[data-character-shaper-rail] button` 의 '헤어'를 못 찾는다. 데스크톱 주 카테고리 레일은 이 속성을 모바일일 때만 단다(`CharacterShaperCategoryRail.tsx:47`).
- `character-production-framing`: 렌더러 단언 통과 뒤 `getByLabel('파일 내보내기 해상도')`를 못 찾는다. select 는 출력 도크(`CharacterShaperOutputDock.tsx:426`) 안에 있고 개편된 화면에서는 '출력 설정'을 열어야 보이는 것으로 추정한다(직접 열어 보지는 않았다).
- `studio-3d-console`: WebGPU 샤드 2개 통과 뒤 콘솔 패스가 `삽입` 메뉴의 '인물·포즈 편집'을 못 찾는다. 빌드된 앱의 삽입 메뉴는 기본 5항목과 '고급 도구 펼치기 (7개)'뿐이고, 펼치면 요소·도형·장면 도우미·기본 데생 인형·인물·포즈 편집·캐릭터 만들기·정밀 3D 모델링…이 나온다(`ui-triage.json`). 야간 CI 도 같은 지점에서 실패한다.
- `studio-3d-visual`: 8개 중 7개 실패·1개 건너뜀. 7개 모두 `openStudio3dRailTool`(spec:541)에서 `[data-studio-tool-rail-settings] button` 이 2개('전체 도구'·'도구막대 구성')로 풀려 strict mode violation 이다. 기본 레일 도구 10개(select·pen·eraser·fill·marquee-rect·smart-shape·text·image·transform·lasso)에는 3D 도구가 없다.
- `bg3d-physics`: 세 사례 모두 `[data-studio-creative-starter="true"]` 가 5초 안에 안 보인다. 진단 프로브에서도 `/studio/canvas?preset=illustration` 8초 뒤 시작 패널이 0개였다. 야간 CI 도 같은 실패.
- `bg3d-inapp-editor`: 다섯 프로필 모두 `#bg3d-tab-view` 가 30초 안에 안 보인다(야간 CI 도 같은 실패). 위와 같은 계열의 진입 경로 변경으로 추정하며 이 게이트의 진입 코드는 읽지 않았다.
- 캐릭터 랩 프로브: 기본 구성은 WebGPU 가 소프트웨어 폴백 어댑터라 `[webgpu-fallback-adapter]` 로 막히는 것이 앱 정책대로의 결과이고 그 뒤 WebGPU 단계는 건너뛴다. **Metal 구성(`CHARACTER_LAB_CHROMIUM_PATH` 지정)은 WebGPU(apple metal-3)·WebGL2(ANGLE Metal) 모두 ready**, 통과 14·실패 1. 두 구성에서 공통으로 실패하는 1건은 '레시피 저장→실행 취소→불러오기 왕복' 단계의 `.cl-slot-card:not([aria-pressed="true"]):not(:disabled)` 첫 카드 `getAttribute` 180초 타임아웃이고 원인은 확정하지 못했다. HUD 에 `Babylon 9.19 WebGPU`와 `Babylon 9.31.0` 이 나란히 찍혀 표기 불일치가 드러났다(수정은 별도 PR).

## 4. 분류 기준

- **통과**: 종료 코드 0. 통과가 Metal 증거인지는 "실제로 확인된 레인" 칸이 따로 말한다.
- **게이트 드리프트**: 게이트가 가정한 진입 경로·선택자·하니스 설정이 현재 앱과 맞지 않아 GPU 이전 단계에서 실패. 위 원인 중 직접 재현·덤프로 확인한 것과 야간 CI 로그로 대조한 것, 추정인 것을 문장에서 구분했다.
- **부분 통과**: 대부분 통과하고 1건이 실패 — 캐릭터 랩 프로브 두 구성.
- 멈춤(하드 타임아웃)은 한 건도 없었다. 설계 문서가 걱정한 "macOS 에서 requestDevice 가 걸림"은 재현되지 않았다.

## 5. 야간 CI 교차 확인

`main-full-qa-studio` 의 `3d-runtime-a` 레인 최신 야간 실행(런 39863986390, 커밋 6ad6d17e4, 2026-10-22, Linux·Xvfb)의 게이트별 종료 코드와 이 Mac 의 결과가 맞는다.

| 게이트 | 야간 CI(Linux) | 이 Mac |
| --- | --- | --- |
| `studio-3d-console` | 실패(삽입 메뉴의 '인물·포즈 편집' 못 찾음) | 실패(같은 지점) |
| `studio-3d-visual` | 실패(exit 1, 사유는 열람 안 함) | 실패(7/8) |
| `bg3d-inapp-editor` | 실패(`#bg3d-tab-view`) | 실패(같은 지점) |
| `bg3d-physics` | 실패(`creative-starter`) | 실패(같은 지점) |
| `bg3d-webgpu-engine` | 통과 | 통과 |
| `bg3d-webgpu-rotation` | 실패(exit 1) | 돌리지 않음(헤드풀) |

`main-full-qa-studio` 의 최근 4회 야간 실행(2026-10-19~22)은 모두 failure 이고 `main-full-qa-fast-diagnostics` 도 같다(레인별 내역은 최신 1회만 열었다). 즉 이 실패들은 Mac·Metal 고유가 아니라 저장소 전체의 기존 적색이다.

## 6. 이 증거가 말하지 않는 것

- 한 대의 Mac, 1회 실행이다. 반복·분산이 없고 소요 시간은 성능 수치가 아니다.
- 게이트 통과는 시각 품질 합격이 아니다. 어느 게이트도 사람의 육안 판정을 대신하지 않고, 스크린샷·트레이스 산출물은 저장소 밖에 두고 커밋하지 않았다(공개 저장소·용량).
- 확인 수준: 콘솔·visual·셰이퍼·framing·capture-resources·inplace 는 직접 재현이나 화면 덤프로 확인했다. physics·inapp-editor 는 야간 CI 와 같은 증상으로 추정했고, 캐릭터 랩 프로브의 레시피 왕복 실패는 원인을 확정하지 못했다.
- **러너의 전제 오류**: 스윕은 헤드리스만 쓰기로 했지만 `studio-3d-console` 은 darwin 에서 WebGPU 샤드를 `headless: false` 로 띄운다(`verify-studio-3d-console.mts:3207-3215`). 스크립트를 끝까지 읽지 않아 이를 사전에 놓쳤고, 실행 중 Chromium 창이 두 번(샤드마다 1회) 화면에 떴다. `verify-studio-bg3d-camera-projection.mts` 도 헤드풀이다(돌리지 않음).
- 돌리지 않은 것: `verify:studio-bg3d-webgpu-rotation`·`:dev`(gizmo 레인이 headless:false), 캐릭터 랩 `kit-preview`(독립 게이트 아님), 30분 소크(0.1분 스모크만), WebKit·Safari·모바일 실기기, 브러시 엔진 게이트(3D 범위 밖).
- 진단용 계측 사본(capture-resources·inplace)은 저장소 밖 트리에서 돌리고 지웠으며 결과만 반영했다. 저장소 코드는 바꾸지 않았다.

## 7. 재현

`tools/` 의 `.txt` 는 실행한 도구 소스다(`.mjs` 로 이름을 바꿔 쓴다). 체크아웃은 기준 커밋을 별도 워크트리로 만든다.

```bash
git worktree add --detach <체크아웃> db522ce2b && cd <체크아웃>
HUSKY=0 CI=true pnpm install --frozen-lockfile && pnpm build          # 약 10분
SWEEP_TREE=<체크아웃> node lane-probe.mjs --out lane-probe.json
node sweep.mjs --tree <체크아웃> --out <증거 폴더> [--only id,id]
```

러너는 게이트를 직렬로 돌리고 `results.json` 을 게이트마다 갱신한다. 원인 분류(`cause`)는 러너가 아니라 사람이 로그·소스·화면 덤프를 보고 붙였다.

## 8. 후속 (W1 입력)

1. 게이트 진입 경로 복구를 한 PR 에 한 게이트씩: 삽입 메뉴 '고급 도구 펼치기', 레일 '전체 도구' 경유, 시작 패널 조건, 셰이퍼 레일 속성·'출력 설정' 열기, capture-resources 의 `optimizeDeps` react, inplace 의 `publicDir`/theme-packs.
2. 모든 3D 게이트가 렌더러 문자열(`UNMASKED_RENDERER`·`adapter.info`)을 증거에 남기고, 선언 레인과 다르면 실패하게 하는 공통 함수.
3. `specialists` 처럼 hardware 를 선언하고 SwiftShader 로 도는 게이트의 선언 또는 실행 구성을 맞춘다.
4. 이번 캐릭터 랩 Metal 결과를 `docs/shaper-parity-checklist.md` 의 '브라우저 검증' 열(`YYYY-MM-DD·기기·backend`)에 반영한다(CL-1 의 증거 폐쇄 단계).
5. 콘솔 게이트 주석(Chromium 151 requestDevice 걸림)을 156 실측으로 갱신한다.
6. 헤드풀 창 허용 여부(D14)를 정한다 — 콘솔 게이트는 이미 헤드풀이다.
