# Godot 3D PoC (`tools/godot-3d-poc`)

- 상태: `target` — 평가용 실험 도구다. 운영 앱(`apps/web`, `apps/api`, `packages/*`)에 연결되어 있지 않고 배포 대상도 아니다.
  운영 중인 Godot 섬(가상스튜디오 `godot-space`, `/play`, `/cuts`)과 `tools/play-godot`·`tools/cuts-godot`는 이 도구와 별개이며 이 도구가 바꾸지 않는다.
  **2026-10-23 정정**: 그 섬과 두 빌드 도구는 2026-10-21 PR #2354 로 제거됐고 ADR-0028 은 Superseded 다. 이 도구는 역사 측정 재현용으로만 남아 있다.
- 날짜: 2026-10-15
- 근거 문서: [ADR-0028](../../docs/adr/0028-godot-3d-adoption-modes.md)(적용 모드 제안), [평가 보고서](../../docs/reports/godot-3d-evaluation-2026-10-15.md),
  [측정 증거](../../docs/evidence/godot-3d-poc/2026-10-15/README.md)
- 위치 근거: [ADR-0026](../../docs/adr/0026-labs-experimental-apps-engine-selection-and-promotion.md)의 실험 규칙(운영 배포 없음, 제품 소스 import 없음, 소프트웨어 렌더러 결과를 성능 증거로 쓰지 않음)을 따른다.
  pnpm workspace 앱이 아니고 `tools/README.md`의 규칙(제품 애플리케이션은 runtime에서 tool source를 import하지 않는다)을 지킨다.

## 무엇을 확인하는가

Godot 4.4.1 웹 export(GL Compatibility = WebGL2)로 다음이 실제로 되는지, 되면 얼마나 드는지를 같은 조건에서 잰다.

| 항목 | 구현 위치 |
| --- | --- |
| GLB 런타임 로드(`GLTFDocument.append_from_buffer` + `generate_scene`) | `project/scripts/glb_loader.gd`, `project/scripts/main.gd`(`load-glb`) |
| 툰 3단 셰이더 + 뒤집은 껍질(inverted hull) 외곽선 | `project/shaders/toon.gdshader`, `project/shaders/outline.gdshader` |
| 궤도 카메라 + `Camera3D.PROJECTION_FRUSTUM`의 `frustum_offset`으로 만든 2점 투시(렌즈 시프트) | `project/scripts/orbit_camera.gd` |
| 선화·톤·깊이·법선 패스를 PNG로 캡처해 호스트에 돌려주기 | `project/scripts/pass_capture.gd`, `project/shaders/pass_*.gdshader`, `line.gdshader`, `tone_halftone.gdshader` |
| `MultiMeshInstance3D` 인스턴스 벤치 | `project/scripts/instance_bench.gd` |
| `JavaScriptBridge` 명령/이벤트 DTO(JSON) + 이진 입출력 | `project/scripts/bridge.gd`, `measure/host/ts3d-host.js` |
| 같은 GLB를 최소 Three.js 페이지로 그린 상대 비교 기준 | `measure/three-baseline/` |
| 빌드타임 도구(모드 B)용 렌더 가능 여부 프로브: `--headless` 와 Xvfb + Mesa 비교 | `native/render_probe.gd`, `native/probe-render.sh` |
| 같은 glTF 확장 픽스처를 네이티브 `--headless`·Xvfb에서 열어 웹 결과와 대조 | `native/ext_probe.gd`, `native/probe-ext.sh` |

하지 않는 것: 운영 앱 연결, 편집 기능(선택·기즈모·undo), VRM 휴머노이드/스프링본, 물리·클로스, 실GPU·모바일 측정. 이 항목들은 [보고서](../../docs/reports/godot-3d-evaluation-2026-10-15.md)의 "미검증"에 따로 적었다.

## 구성

```text
tools/godot-3d-poc/
  README.md
  .gitignore                    # build/, .cache/, *.wasm, *.pck, *.glb, *.tpz 는 커밋하지 않는다
  checksums/                    # 공식 SHA512-SUMS.txt에서 옮긴 신뢰 앵커(4.4.1-stable, 4.7-stable)
  scripts/fetch-engine.sh       # 공식 릴리스 다운로드 + SHA512 검증 + 엔진·웹 템플릿만 추출
  scripts/build.sh              # import + 웹 export(단일 스레드 / 스레드 변형)
  scripts/remote-template-members.py   # 버전 비교용: 템플릿 tpz 에서 지정 멤버만 HTTP Range 로 읽기(전체 SHA512 검증은 못 함)
  native/                       # 모드 B/C 확인: 같은 프로젝트를 네이티브 엔진(Xvfb + Mesa 소프트웨어 GL)에서 실행해 패스를 PNG 로 저장,
                                #   probe-render.sh 는 --headless 가 실제로 그리는지(그리지 않는다)를 Xvfb 경로와 대조,
                                #   probe-ext.sh 는 glTF 확장 픽스처를 두 경로에서 열어 웹 ext 스위트 결과와 대조
  project/                      # Godot 프로젝트 소스(GDScript, 셰이더, 사용자 정의 HTML 셸, export 프리셋)
  measure/                      # Playwright + 헤드리스 Chromium 측정 하네스(Node, ESM)
    run.mjs                     # 측정 스위트 실행 -> 결과 JSON
    summarize.mjs               # 결과 JSON -> 마크다운 표
    make-fixtures.mjs           # 결정적 합성 GLB 및 확장(meshopt/quantization/draco/KTX2 3종) 픽스처 생성
    sizes.mjs                   # 공식 템플릿 wasm/js 크기(raw/gzip/brotli)
    parity.mjs                  # 웹과 네이티브가 캡처한 패스 PNG 의 픽셀 차이
    coep-probe.mjs              # COEP 부모 아래 iframe 차단 이유(CDP) 확인
    serve.mjs                   # 빌드를 사람이 직접 열어 보는 정적 서버
    lib/ host/ three-baseline/  # 서버(변형별 격리 헤더, 재방문용 brotli 전송), 호스트 브리지 참조 구현, 최소 Three.js 비교 페이지
```

프로젝트 소스는 이 저장소 안에 있다. 운영 Godot 섬의 프로젝트 소스는 저장소 밖에 있어(`tools/play-godot/README.md`, `tools/cuts-godot/README.md`)
빌드를 재현할 수 없다는 점이 이 PoC가 의도적으로 다르게 한 부분이다. 그래도 엔진 바이너리·wasm·pck는 저장소에 넣지 않는다(공급망 절 참고).

## 전제

- Linux x86_64(다른 OS는 `fetch-engine.sh`의 엔진 파일명을 바꿔야 한다), `curl`, `sha512sum`, `unzip`, Node.js(저장소 `engines` 기준), `pnpm install` 완료(저장소의 `playwright`, `three`, `vite`, `@gltf-transform/*`, `meshoptimizer`를 쓴다. 새 의존성은 추가하지 않았다).
- 디스크: 다운로드 중 약 1.5GB(엔진 zip + 템플릿 tpz), 검증·추출 뒤 tpz를 지우면 약 160MB. 캐시 위치는 `GODOT_POC_CACHE`(기본 `~/.cache/toonstudio-godot-3d-poc`)이며 저장소 밖이다.
- 네트워크: `github.com/godotengine/godot/releases` 다운로드가 필요하다. 오프라인이면 `fetch-engine.sh`가 실패한다(대체 경로 없음).
- 측정용 Chromium: `PW_CHROMIUM_PATH` 또는 `--chromium <실행 파일>`. 컨테이너 root 실행용 `--no-sandbox`가 하네스 인자에 들어 있다. 일반 개발 머신에서는 필요 없지만 해롭지도 않다.

## 재현 순서

모두 저장소 루트에서 실행한다. 1~2는 네트워크·디스크를 쓰고, 3~6은 CPU를 오래 쓴다(소프트웨어 렌더링). 다른 작업과 CPU를 나눠 쓰는 머신에서는 결과 편차가 커진다.

```bash
# 1) 공식 엔진 + 웹 템플릿 받기(SHA512 검증, 웹 템플릿만 추출, 검증 뒤 아카이브 삭제)
bash tools/godot-3d-poc/scripts/fetch-engine.sh                       # 4.4.1-stable
# GODOT_VERSION=4.7-stable bash tools/godot-3d-poc/scripts/fetch-engine.sh   # 비교용 4.7

# 2) 웹 export 빌드(포그라운드 실행. 백그라운드 실행 시 pck가 잘린 전례가 tools/play-godot/README.md에 있다)
bash tools/godot-3d-poc/scripts/build.sh
# POC_BUILD_DIR=/tmp/poc-build-4.7 GODOT_VERSION=4.7-stable bash tools/godot-3d-poc/scripts/build.sh

# 3) 합성 픽스처 생성(결정적, .cache/fixtures 에 생성되며 커밋하지 않는다). KTX2 는 UASTC(zstd)·UASTC(무압축)·ETC1S(BasisLZ) 세 모드이고
#    fixtures.json 의 ktx2 필드가 KTX2 헤더에서 읽은 supercompressionScheme·colorModel 을 보여 준다.
node tools/godot-3d-poc/measure/make-fixtures.mjs

# 4) 측정(스위트: sizes,cold,warm,revisit,coi,glb,ext,bridge,capture,twopoint,bench,compare,memory / 반복 기본 5). 일부만: --only sizes,cold  파일 이름 덧붙임: --engine-tag -rerun
node tools/godot-3d-poc/measure/run.mjs --label 4.4.1 --out docs/evidence/godot-3d-poc/<날짜>
# --room <studio-room.glb> --avatar <avatar.glb> 로 비교용 실모델 경로를 바꿀 수 있다(기본: 저장소의 godot-space 방 배경, character-lab Orion).
# 부모 COEP 아래에서 iframe 이 막히는 이유(CDP blockedReason)만 보려면: node tools/godot-3d-poc/measure/coep-probe.mjs --iso credentialless --stage n

# 5) 결과 JSON -> 표
node tools/godot-3d-poc/measure/summarize.mjs docs/evidence/godot-3d-poc/2026-10-15/results-4.4.1*.json

# 6) (선택) 모드 B/C 확인: 같은 프로젝트를 네이티브 엔진으로 실행(Xvfb + Mesa 소프트웨어 GL, OpenGL 3.3+ 필요)해 패스 PNG 저장 -> 웹 결과와 픽셀 비교
bash tools/godot-3d-poc/native/run-native.sh <입력.glb> /tmp/native-out 960x540
node tools/godot-3d-poc/measure/parity.mjs --glb <입력.glb> --native /tmp/native-out --out /tmp/parity.json
# 모드 B 전제 확인: 같은 프로브를 --headless 와 xvfb-run(Mesa)로 실행해 "그려지는가"를 JSON 으로 출력(--headless 는 framesDrawn 0)
bash tools/godot-3d-poc/native/probe-render.sh > /tmp/render-probe.json
# glTF 확장 호환을 네이티브 두 경로(--headless, xvfb-run)에서 확인: 웹 ext 스위트와 같은 픽스처를 GLTFDocument 로 연다. 엔진이 다른 위치면 GODOT_BIN·GODOT_PROJECT 를 준다.
bash tools/godot-3d-poc/native/probe-ext.sh > /tmp/ext-probe.json

# 7) (선택) 버전 비교: 다른 버전 템플릿의 wasm 크기만 필요할 때(전체 아카이브를 받지 않는다. 새 빈 폴더를 쓰고 python 은 -I 로 실행)
python3 -I tools/godot-3d-poc/scripts/remote-template-members.py <tpz URL> <새 빈 폴더> templates/web_nothreads_release.zip
```

사람이 직접 보려면 `node tools/godot-3d-poc/measure/serve.mjs`를 실행하고 출력된 주소의 `/g/n/index.html`(단일 스레드), `/g/ni/index.html`(COOP/COEP credentialless),
`/host/embed.html?stage=/g/n/index.html`(iframe 임베드 호스트)을 연다. 개발자 콘솔에서 `window.__host.send({ cmd: "load-glb", source: { kind: "url", url: "/fixtures/synthetic-character.glb" } })` 같은 명령을 보낼 수 있다.

성공 기준: `build.sh`가 `web/`·`web-threads/` 산출물과 sha256을 출력하고, `run.mjs`가 `results-<라벨>*.json`을 쓰며 각 스위트에 `error` 키가 없다.
실패·롤백: 모든 산출물은 `tools/godot-3d-poc/build`, `tools/godot-3d-poc/.cache`, `GODOT_POC_CACHE` 아래에만 생긴다. 지우면 원상태다.

## 브리지 계약(DTO)

기존 가상스튜디오 godot-space 브리지(`apps/web/src/domains/creator/virtual-space/studio-godot-space-embed-support.ts`의 `TsvsHostBridge`/`TsvsGodotFrameWindow`)와 같은 모양을 쓰되 이름은 `ts3d`로 분리했다.
기존 계약을 바꾸지 않는다.

- 호스트 -> Godot: iframe 창의 전역 함수 `window.__ts3d_command(json)` 하나. 모든 명령은 `{ id, cmd, ... }` JSON 문자열이다.
- Godot -> 호스트: `parent.__ts3dHost.onEvent(json)`. 응답은 `replyTo == id`인 `<cmd>:result` 이벤트이고 모든 이벤트에 `v`(프로토콜 버전 1)와 `engineMs`가 붙는다.
  JSON에서 `NaN`/`Infinity`는 `null`로 바꿔 보낸다(GDScript `JSON.stringify`가 `nan`/`inf`를 쓰면 호스트 `JSON.parse`가 실패한다는 것을 이 PoC가 실측했다).
- 이진 입력(확장): 호스트가 `window.__ts3dInbox`에 **`Uint8Array` 뷰**를 두면 Godot가 `JavaScriptBridge.is_js_buffer` + `js_buffer_to_packed_byte_array`로 복사해 간다(`eval` 불필요).
  `eval` 경로(`inbox-eval`)도 비교용으로 있다. 이 경로는 CSP `unsafe-eval`이 필요하다.
  **iframe 임베드에서는 `ArrayBuffer`를 그대로 두면 안 된다.** 4.4.1 엔진 JS는 `obj instanceof ArrayBuffer || ArrayBuffer.isView(obj)`로 검사하는데, 부모 창이 만든 `ArrayBuffer`는 iframe 창의 생성자와 달라(교차 realm) 거부되어 Godot가 0 B를 받는다.
  `ArrayBuffer.isView`는 realm과 무관하므로 뷰는 통과한다. `measure/host/ts3d-host.js`의 `setInbox`가 기본으로 뷰를 두고, `bridge` 스위트가 두 형태를 standalone·iframe 모두에서 대조한다.
- 이진 출력(확장): GDScript에서 JS로 넘길 수 있는 값은 기본형뿐이라 base64 문자열을 `parent.__ts3dHost.onBinary(id, label, base64)`로 보낸다(크기 33% 증가).

| 명령 | 입력 요지 | 응답 요지 |
| --- | --- | --- |
| `ping`, `wait-frames`, `get-stats` | `n` | 엔진 정보, 프레임 시간 중앙값, 텍스처·버퍼·비디오 메모리, 노드 수 |
| `load-glb` | `source{kind: url\|inbox\|inbox-eval, url, chunkBytes}`, `toon`, `fit` | `acquireMs`, `parseMs`, `generateMs`, `toonMs`, `model{triangles,vertices,bones,...}`, `camera` |
| `clear-model`, `set-toon` | `bands`, `softness`, `outlinePx`, `outline` | `updatedSurfaces` |
| `set-camera` | `yaw`, `pitch`, `distance`, `fovDegrees`, `target`, `near`, `far`, `lensShift`, `twoPoint` | `camera`(유효 렌즈 시프트 포함) |
| `capture` | `size`, `passes[beauty,line,tone,depth,normal]`, `options` | 패스별 `pngBytes`·`stats`, `timingsMs`, 이진은 `onBinary` |
| `diag-encode` | `levels[]` | 3D 출력의 8비트 전달 함수 진단 |
| `verify-two-point` | `cases[]`, `render` | 세로 모서리 기울기(px), 타깃 오차, 저장소 공식과 엔진 `frustum_offset` 비교 |
| `bench-instances` | `count`, `frames`, `warmup`, `useBuffer` | `setupMs`, 프레임 시간, 드로 수, 비디오 메모리 |
| `bridge-echo`, `bridge-binary-in`, `bridge-binary-out` | 크기별 | 왕복·복사·인코딩 시간(브리지 비용 측정용) |

호스트가 없을 때(에디터·네이티브 실행)는 이벤트를 표준 출력에 `[ts3d-event] {json}` 한 줄로 남긴다.

## 측정 방법과 한계

- GPU가 없는 환경이라 Chromium은 `--use-angle=swiftshader`(소프트웨어 WebGL2)로 실행한다. **절대 FPS와 프레임 시간은 실기기 성능을 나타내지 않는다.**
  같은 조건에서 Godot와 Three를 나란히 돌린 상대값, 파일 크기, 메모리, 시작 시간, 브리지·파싱 같은 CPU 비용만 의미가 있다(ADR-0026 §E: 소프트웨어 렌더러 결과는 성능 증거로 쓰지 않는다).
- 반복마다 새 브라우저를 띄워 캐시와 V8 코드 캐시를 비운다(워밍 시작은 별도 스위트). `warm`은 같은 브라우저 컨텍스트 안의 재탐색이고 서버가 압축 없이 43.7 MB를 그대로 보내므로 브라우저 HTTP 캐시가 받지 않았다(응답마다 `transferSize`가 전체 크기). 캐시에서 받는 재방문은 `revisit` 스위트가 따로 잰다: 영구 프로필, 서버가 `index.wasm`·`index.js`를 brotli 9로 압축해 `max-age=3600`으로 보내고(운영이 sidecar 압축본을 보내는 조건과 비슷하게), 방문마다 새 브라우저 프로세스를 띄운다. `cold` 스위트는 변형(격리 헤더·스레드 조합) 사이 비교가 부하 변화와 섞이지 않도록 반복마다 시작 변형을 돌려 가며 실행하는 라운드 로빈이다. 중앙값과 MAD로 요약하고, 스위트 앞뒤 `loadavg`를 결과 JSON에 남긴다.
  측정 머신이 다른 작업과 공유되었다면 편차가 커지고 이는 JSON에 그대로 드러난다.
- `memory` 스위트는 모델을 올리기 전·후·`clear-model` 뒤의 wasm 선형 메모리, JS 힙, RSS 합, 엔진이 보고하는 비디오·텍스처 메모리를 같은 페이지에서 잰다(실기기 메모리 측정이 아니다).
- 모바일 브라우저, Safari, 실GPU, 장시간 soak, 메모리 압력 상황은 측정하지 않았다.
- 8비트 3D 출력이 낮은 값에서 항등이 아니다(입력 16이 12로 읽힘 — `diag-encode`로 실측, 원인은 규명하지 않았다). 그래서 패스 값은 [64, 255] 구간에 오프셋 코딩한다(깊이는 3자리 192진 패킹).
  이 코딩은 호스트가 풀어야 하는 PoC 규약일 뿐 저장소의 캡처 계약(`studio-bg3d-capture-adapter.ts`)과 호환되지 않는다.

## 공급망과 라이선스

- Godot Engine은 MIT 라이선스다(공식: <https://godotengine.org/license/>, <https://docs.godotengine.org/en/4.4/about/complying_with_licenses.html>, 2026-10-15 확인).
  배포물에는 라이선스 전문과 서드파티 고지를 사용자가 볼 수 있게 두어야 한다. 이 PoC는 배포하지 않으므로 해당 사항이 없지만, 운영 채택 시에는 [ADR-0028](../../docs/adr/0028-godot-3d-adoption-modes.md)의 조건이 된다.
- 바이너리는 모두 공식 릴리스(<https://github.com/godotengine/godot/releases/tag/4.4.1-stable>)에서만 받는다. `checksums/SHA512-SUMS.4.4.1-stable.txt`는 같은 릴리스의 `SHA512-SUMS.txt`에서 옮긴 두 항목이고,
  `fetch-engine.sh`가 다운로드 직후 `sha512sum -c`로 검증한다. 검증 실패 시 추출하지 않는다.
- 산출 wasm은 공식 `web_nothreads_release` 템플릿 그대로이며 엔진 코드를 고치지 않았다. 사용자 정의 HTML 셸은 공식 4.4.1 `godot.html` 템플릿 뼈대에 계측 훅과 단독 실행용 호스트 기본 구현을 더한 것이라,
  MIT 고지를 위해 Godot 4.4.1-stable의 `LICENSE.txt` 원문을 [`LICENSE-godot-engine.txt`](LICENSE-godot-engine.txt)로 함께 둔다(영어 원문 그대로, sha256 `b0435e3b3e4e55238f05f4b306f30524a1b2e20147810d436eaa554fa6855c80`).
- 커밋 대상은 소스뿐이다: 프로젝트, GDScript, 셰이더, 스크립트, 측정 하네스, 체크섬, 결과 JSON. `.wasm`, `.pck`, `.glb`, `.tpz`와 엔진 실행 파일은 `.gitignore`가 막는다.
- 측정 하네스 의존성은 저장소에 이미 있는 것만 쓴다(Playwright, Three, Vite, glTF-Transform, meshoptimizer, `ktx2-encoder`). Draco 픽스처는 pnpm 가상 저장소의 `draco3d`를 찾아 쓰며,
  KTX2·Draco가 해석되지 않으면 해당 픽스처만 건너뛰고 `fixtures.json`에 사유를 남긴다.

## 알려진 제한

- 프로젝트가 `Web-Threads` 프리셋을 같이 내보내지만 운영 가정은 단일 스레드(`web_nothreads_release`)다. 스레드 변형은 COOP/COEP 영향 측정용이다.
- 4.5 이후에서만 달라지는 항목(WASM SIMD, 스텐실, 4.6 IK 프레임워크, Jolt 기본값 등)은 공식 문서 기준으로만 정리했고 이 PoC에서 동작을 검증하지 않았다. 4.7은 wasm 크기, 확장 호환, 2점 투시만 같은 하네스로 확인했다.
- `KHR_texture_basisu`: 이 PoC의 KTX2 픽스처 세 모드(UASTC + zstd, UASTC 무압축, ETC1S)와 이미지 없이 선언만 한 파일이 4.4.1과 4.7의 웹 템플릿, 네이티브 `--headless`, 네이티브 Xvfb에서 모두 로드되었고
  웹에서는 텍스처가 렌더되었다. 저장소 API 검증기(`studio-godot-background-glb.ts`)는 이 확장을 금지 목록에 두고 "실패 확정"이라고 적고 있어 서로 다른 결과다. 이 PoC는 128x128 합성 텍스처만 시험했고
  저장소 파이프라인이 만든 실제 KTX2 파일로는 시험하지 않았다. 원인을 가리기 전에는 금지 목록을 바꾸지 않는다. 네이티브 프로브에서 디코드된 이미지 포맷은 세 모드 모두 `FORMAT_RGBA8`이었다(GPU 압축 포맷으로 유지되지 않음).
