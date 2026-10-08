# ToonStudio Brush Lab

- 상태: **현재(current)** — 2026-10-01 작업 트리 기준. 레인별 구현 상태의 권위는 `src/lanes/registry.ts`(아래 표와 1:1)다.
- 목적: 차세대 GPGPU 브러시 엔진 **Sumi**(자체 WebGPU compute 타일 파이프라인)와 **브러시 인증 테스트 벤치**를
  한 곳에서 실험한다. 브러시 **품질·성능 테스트만** 한다(undo·레이어·문서·저장·서버 연동 없음; "그리기" 탭은 손맛 시험용 샌드박스로 PNG 스냅샷만 내려받는다). 여기서 통과한
  브러시·엔진은 [승격 프로세스](docs/drafts/brush-lab-promotion-process.md)를 거쳐 본 서비스(`apps/web`)에 적용한다.

`apps/brush-lab`은 pnpm workspace `@toonstudio/brush-lab`이며 source와 빌드 설정을 이 디렉터리가 소유한다.
서버 기능이 없는 정적 Vite 앱이고 운영 배포 대상이 아니다.

## 명령

```sh
pnpm --filter @toonstudio/brush-lab dev        # http://localhost:4178
pnpm --filter @toonstudio/brush-lab typecheck  # tsc -p tsconfig.json
pnpm --filter @toonstudio/brush-lab test       # vitest run src (앱 로컬 설정, setup 없음)
pnpm --filter @toonstudio/brush-lab build      # apps/brush-lab/dist/ (ES module worker 청크 포함)
pnpm --filter @toonstudio/brush-lab preview    # http://localhost:4179
```

루트에서는 `pnpm dev:brush-lab`, `pnpm typecheck:brush-lab`, `pnpm test:brush-lab`, `pnpm build:brush-lab`을 쓴다.
루트 Vitest 설정으로도 같은 테스트가 통과해야 한다(`pnpm exec vitest run apps/brush-lab/src/app apps/brush-lab/src/platform`
처럼 경로를 좁혀 실행). 변경 파일 lint는 `pnpm exec eslint --max-warnings=0 <files>`다. 생성물 `dist/`는 git이 무시한다.
브라우저 프로브와 wasm 빌드는 아직 `package.json` 스크립트가 아니다(통합 담당이 `test:browser`·`wasm:build`와 playwright devDependency를
추가한다). 그 전에는 아래 명령을 직접 쓴다.

```bash
# wasm 커널 재현 빌드(rustc/cargo + wasm32-unknown-unknown 필요). --check는 산출물·INTEGRITY·내장 TS 일치 검증
bash apps/brush-lab/wasm/sumi-kernel/build.sh
bash apps/brush-lab/wasm/sumi-kernel/build.sh --check
# 같은 --check를 CI(`.github/workflows/architecture-boundaries.yml`)가 푸시마다 GitHub 러너에서 Rust 1.97.0으로 돌린다. 2026-10-07 main 최신 커밋의
# 실행(run 37647426952)에서 재빌드 바이트가 봉인과 동일했다(33,946 B). 커널은 fixed SIMD(+simd128)로 빌드한다(`build.sh`의 RUSTFLAGS).

# 브라우저 프로브(게이트가 꺼져 있으면 즉시 0으로 종료). Playwright·Chromium이 필요하다. BRUSH_LAB_CHROMIUM_PATH가 없고 기본 Chromium을 실행할 수 없으면
# PLAYWRIGHT_BROWSERS_PATH(없으면 ~/.cache/ms-playwright)에 설치된 chromium-<rev>를 찾아 쓴다. Linux는 --use-webgpu-adapter=swiftshader(소프트웨어 WebGPU)로 띄운다
BRUSH_LAB_BROWSER_PROBE=1 node apps/brush-lab/scripts/browser-probe.mjs --set smoke
BRUSH_LAB_BROWSER_PROBE=1 node apps/brush-lab/scripts/browser-probe.mjs --lanes webgpu-compute,wasm-gpu-hybrid,wasm-cpu --presets pencil-hb,airbrush --fixtures zigzag,curve
# 인증 리포트(증빙 JSON)까지 쓴다: apps/brush-lab/docs/evidence/<presetId>-<laneId>-<YYYYMMDD>.json (같은 이름이 있으면 -2, -3 접미)
BRUSH_LAB_BROWSER_PROBE=1 node apps/brush-lab/scripts/browser-probe.mjs --lanes webgpu-compute --presets pencil-hb,charcoal --fixtures zigzag --size 128 --reports apps/brush-lab/docs/evidence
# 습식 GPU 미러 점검(패리티 케이스 없이): 습식 장면(CPU 장면의 시작 상태를 GPU 습식 풀에 올려 1·60프레임 뒤 채널별 max|Δ|·질량·활성 타일 대조),
# 실제 프리셋 습식 파라미터 장면, 획 도중 상태 대조, 다획 지속 레이어, 합성 지그재그(CPU 해시 = 명세 §9.3 기준값), 장치 한도·타이밍 영수증 점검
BRUSH_LAB_BROWSER_PROBE=1 node apps/brush-lab/scripts/browser-probe.mjs --skip-parity --wet-scenes --wet-preset-scenes --limits-check --timing-check --lanes webgpu-compute,webgpu-instanced
BRUSH_LAB_BROWSER_PROBE=1 node apps/brush-lab/scripts/browser-probe.mjs --skip-parity --stroke-state sumi-ink-wet:spiral,oil-impasto:spiral --stroke-checkpoints 1,10,30,60 --seed 7
BRUSH_LAB_BROWSER_PROBE=1 node apps/brush-lab/scripts/browser-probe.mjs --skip-parity --lanes webgpu-compute --sequences "watercolor-wet:curve>pencil-hb:line,oil-impasto:curve>oil-impasto:spiral"
BRUSH_LAB_BROWSER_PROBE=1 node apps/brush-lab/scripts/browser-probe.mjs --skip-parity --lanes webgpu-compute --synthetic watercolor-wet,oil-impasto --size 256 --seed 1
# 외부 엔진 비교 레인(libmypaint·Hokusai)도 같은 프로브로 돌린다(CPU wasm이라 GPU가 필요 없다). 패리티 임계값(δ48·ΔE)은 후보 레인용이라 이 레인들에는 적용되지 않고 수치만 기록된다
BRUSH_LAB_BROWSER_PROBE=1 node apps/brush-lab/scripts/browser-probe.mjs --lanes libmypaint,hokusai --presets pencil-hb,ink-g-pen,airbrush,charcoal --fixtures zigzag,curve --size 128
```

프로브 종료 코드: 0 통과(또는 게이트 꺼짐), 1 WGSL 컴파일·패리티·결정성 실패, 2 브라우저/WebGPU 미지원(구조적 skip). 레인이 설계상 거부하는 프로그램(`not-implemented`, 예: 렌더 인스턴싱의 습식·smudge)은 실패가 아니라 `미지원`으로 기록한다.

## 디렉터리 구조

```text
src/
  boundary.test.ts      경계 게이트(apps/* import·@/·mixbox 부재, engine/ 외부 import 0)
  engine/               ★ Sumi 엔진 코어(승격 단위, 상대 import·zod만)
    core/ input/ physics/ dynamics/ texture/ raster/ pigment/ wet/ presets/ gpu/(layout·device·buffers·timing·pipeline·WGSL) webgl2/ wasm/
  lanes/                레인 계약(lane.ts)·레지스트리(registry.ts)·레인 구현(cpu-reference, platform-baseline, canvas2d, webgpu-compute, webgpu-instanced, webgl2-instanced, hybrid, reserved)
                        외부 엔진 비교 레인: libmypaint-lane·hokusai-lane(공통 뼈대 isolated-stroke-lane, 프로그램→.myb 매핑 mypaint-settings-map, 획 레이어 합성 straight-frame-composite)
  bench/                fixture 9종·지표(texture/render/handfeel/perf/family)·인증 리포트(스키마·임계값·buildReport·직렬화·PNG)·러너
  platform/             브라우저 어댑터: PointerEvent 캡처(lostpointercapture·우클릭 차단·주 버튼 전용), rAF 프레임 스케줄러, Blob 다운로드, 캔버스 표시(문서 맞춤·흰 종이 평탄화), 마우스 압력 시뮬레이션(pressure-sim), lazy-brush, 갤러리 Worker 클라이언트
  app/                  React 19 랩 UI
    bootstrap/main.tsx  shell/BrushLabApp.tsx(탭 셸)  state/(lab-store·draw-store·draw-program·draw-error-text·color-utils·run-compare·live-session·apply-overrides)
    ui/(CapabilityBanner·LaneSelector·BrushParamPanel·FixturePicker·LaneCanvas·DiffHeatmap·MetricsTable·ReportPanel·FamilyGallery·PresetCard·DrawCanvas·DrawBrushPicker·DrawParamPanel·DrawColorPicker·DrawLaneSelect·DrawHud)
    views/(DrawView·GalleryView·CompareView·ReportView)  workers/gallery-render.worker.ts(ES module worker)  styles/brush-lab.css  testing/(모의 레인·러너·캔버스 스텁)
docs/drafts/            저장소 공용 docs/로 옮길 문서 초안 3종(통합 담당이 배치·등록)
docs/evidence/          (커밋하지 않음) 브라우저 프로브 `--reports`가 쓰는 인증 리포트 출력 위치(`<presetId>-<laneId>-<YYYYMMDD>.json`)
wasm/sumi-kernel/       Rust C-ABI wasm 커널(std만, 외부 crate 0) 소스·`build.sh`·`pkg/`(산출 wasm + INTEGRITY.sha256)
scripts/                브라우저 프로브(browser-probe.mjs·browser-probe.html·browser-probe-page.mjs) · 그리기 탭 실검증(browser-draw-probe.mjs)
```

레이어 의존 방향은 `app → platform → bench → lanes → engine`이며 `engine/`은 외부 import가 0이다(`@toonstudio/*`·react·DOM 전역 금지).

## 레인 상태 표

`src/lanes/registry.ts`의 `LANE_REGISTRY`가 단일 원천이다. 이 표는 `laneStatusTableMarkdown()` 출력과 같아야 하며
`src/lanes/registry.test.ts`가 드리프트를 고정한다. 상태 어휘는 `implemented`(Node에서 검증됨),
`browser-verification-required`(실 GPU 어댑터에서의 픽셀·타이밍 미검증 — 헤드리스 Chromium의 SwiftShader 소프트웨어 렌더러 실측은 아래 "브라우저 검증" 열에 따로 적는다), `reserved`(예약·미구현)다.

| 레인 ID | 종류 | 상태 | Node 검증 | 브라우저 검증 |
| --- | --- | --- | --- | --- |
| cpu-reference | baseline | implemented | 전체(9 fixture 픽셀 해시·결정성·addSamples 분할 = 일괄·dispose 오류) | 선택 |
| platform-baseline | baseline | implemented | 픽셀 해시·결정성·cpu-reference 대비 IoU 범위·even-odd 래스터 오라클 | 선택 |
| canvas2d | baseline | browser-verification-required | probe dom-unavailable 경로·모의 2D 컨텍스트 호출 계약(dab당 arc 1회·globalAlpha = flow) | 헤드리스 Chromium의 실제 CanvasRenderingContext2D에서 실행·결정성 확인(기준선이라 cpu-reference와 픽셀이 다른 것이 정상: ΔE p99 24~100); 실기기 브라우저별 차이는 미검증 |
| webgpu-compute | candidate | browser-verification-required | WGSL 정적 계약(8모듈·습식 가족 바인딩·결정성 규칙)·fake 장치 바인딩/디스패치/제출 계약(습식 물 4패스·유화 5패스·정착 루프·평탄화)·예산(확장 풀·스냅샷·유화 스크래치를 장치가 실제로 받은 한도로 검증, 필요 한도는 requiredLimits로 요청)·오류 표면화 | SwiftShader(소프트웨어 렌더러) 실측: WGSL 11모듈 실컴파일 오류 0·카탈로그 31종(수채·수묵·구아슈·유화 포함) × fixture 3종 93건 전부 cpu-reference와 δ48 0%·ΔE p99 0(픽셀 해시 87건 동일, 채널 오차 ≤ 1/255)·재실행 결정성(128²)·100²·512²·1024²·습식 상태 대조(장면·획 도중 질량 상대 오차 ≤ 1.3e-6)·다획 지속 레이어 8종·합성 지그재그 습식 5종(CPU 해시 명세 일치); 실 GPU(softwareRenderer false)·성능 미검증(scripts/browser-probe.mjs) |
| webgpu-instanced | comparison | browser-verification-required | WGSL 정적 계약·fake 장치로 draw(6,n)·bake/encode 패스·미지원 프로그램 거부 | SwiftShader 실측: 실컴파일 오류 0·건식 12종 cpu-reference 대비 ΔE p99 ≤ 0.96(f16 누적)·결정성, smudge·습식·임파스토는 설계상 not-implemented 거부; 실 GPU 미검증 |
| webgl2-instanced | comparison | browser-verification-required | GLSL 정적 검사·모의 WebGL2로 프레임당 drawArraysInstanced 1회·bake/encode·확장 부재 feature-missing | SwiftShader(ANGLE) 실측: GLSL 실컴파일·EXT_color_buffer_float·결정성, 건식 12종 cpu-reference 대비 ΔE p99 0~4.9(f16 누적, halftone 최대, 비교 레인); 실 GPU 미검증 |
| wasm-cpu | candidate | implemented | INTEGRITY 봉인·변조 거부·재현 빌드·TS 참조 일치(해시·커버리지·CSR·표면 문서; 임파스토·습식 층 포함) | Chromium 실측: WebAssembly 로드·cpu-reference 패리티(스모크·증빙 대상 전부 ΔE p99 0, 습식·임파스토 포함)·결정성; 실 CPU 성능은 측정하지 않음 |
| wasm-gpu-hybrid | candidate | browser-verification-required | wasm 로드·INTEGRITY·모의 장치로 비닝 4패스 생략·CSR 업로드·overflow 절대값 기록 계약 | SwiftShader 실측: 습식 5종 × fixture 3종 15건·스모크 15종(zigzag)·1024²가 cpu-reference와 δ48 0%·ΔE p99 0이고 webgpu-compute와 픽셀 해시 동일(습식 포함); 실 GPU 미검증(scripts/browser-probe.mjs) |
| libmypaint | comparison | implemented | 핀된 wasm 실제 로드·지그재그/곡선 렌더 비어 있지 않음·결정성(같은 입력 두 번 = 같은 해시)·addSamples 분할 = 일괄·abortStroke 문서 보존·dispose 오류·미지원(습식·임파스토·smudge) 거부·매핑 영수증 | 헤드리스 Chromium 141 + Vite dev(2026-10-08, scripts/browser-probe.mjs, CPU wasm이라 GPU와 무관): 프리셋 4종 × fixture 2종 8건 실행·재실행 결정성, Node와 픽셀 해시 8/8 동일; 프로덕션 번들(vite build) 실행·실기기 브라우저는 미검증. 입력 파이프라인·물리·종이 그레인이 없어 Sumi와 같은 브러시가 아니다(유사한 의도의 비교) |
| hokusai | comparison | browser-verification-required | 주입한 wasm 바이트로 실제 실행: 지그재그/곡선 렌더 비어 있지 않음·결정성·addSamples 분할 = 일괄·abortStroke 문서 보존·dispose 오류·미지원 거부·libmypaint와 같은 설정 문서(두 엔진 알파 커버리지 IoU ≥ 0.99: 256² 프리셋 6종 × fixture 2종 12건); Node에서 기본 로드 경로(번들러 URL)는 불가해 probe가 wasm-artifact-missing | 헤드리스 Chromium 141 + Vite dev(2026-10-08, scripts/browser-probe.mjs): pkg 동적 import·기본 wasm URL 초기화로 프리셋 4종 × fixture 2종 8건 실행·재실행 결정성, Node(주입 바이트)와 픽셀 해시 8/8 동일; 프로덕션 번들(vite build) 실행·실기기 브라우저는 미검증. 입력 파이프라인·물리·종이 그레인이 없어 Sumi와 같은 브러시가 아니다(유사한 의도의 비교) |

레인이 unavailable이면 UI 배너와 셀렉터에 사유 코드(`webgpu-api-unavailable`, `dom-unavailable`, `not-implemented` 등)를
표시하고 **다른 레인으로 자동 전환하지 않는다**(ADR-0018, 무음 대체 금지). 소프트웨어 렌더러(swiftshader 등)로 판정된
레인은 배지로 경고하며 성능 증거로 쓰지 않는다.

## 레인 계약: 획 흐름과 abortStroke

모든 레인(`src/lanes/lane.ts`)은 같은 순서로 호출된다: `probe → init → beginStroke → addSamples(프레임당 1회)* → endStroke → readback → dispose`.
획 도중(beginStroke 뒤 endStroke 전)에 오류(장치 손실·입력 오류)나 사용자 취소가 나면 `endStroke` 대신 **`abortStroke(): StrokeAbortReceipt`**
(`{ discardedDabs, documentPreserved, reasonKo? }`)로 끝낸다: 진행 중인 획을 **문서에 합성하지 않고 버리고**, 그 전까지 `endStroke`된 결과(문서)는 되돌릴 수 있는 만큼 보존한다.

- **획 색(`beginStroke(program, seed, options?: StrokeOptions)`, BL-1b)**: 색은 프로그램(브러시 정의)이 아니라 **획의 입력**이다. `StrokeOptions.color`는 sRGB straight RGBA(각 0..1, 길이 4)이며
  범위 밖·NaN·길이 불일치는 `InvalidStateError`로 **획을 열기 전에** 거부한다(무음 보정 없음, 레인은 idle로 남는다). 생략하면 검정 `[0, 0, 0, 1]`이고 결과는 색 인자가 없던 시절과 비트 동일하다(레인별 픽셀 해시 스냅샷 불변).
  적용 방식: cpu-reference·wasm-cpu·canvas2d·webgl2-instanced·webgpu-instanced·webgpu-compute·wasm-gpu-hybrid는 `StrokePipeline`의 `DabEmitter` 기본색(`opts.color`)으로 받아 색 동역학(지터)이 그 위에 얹히고
  dab 인스턴스의 `color`(선형 premultiplied)로 래스터·셰이더에 실린다(**WGSL/GLSL·wasm 커널 변경 없음**). 수채·유화 같은 습식 매체의 안료 혼합은 프로그램 로직 그대로이며 색 인자는 그 획이 침착하는 색이다.
  platform-baseline은 획 색을 외곽선 채움 색으로, libmypaint·Hokusai는 `color_h/s/v`로 매핑한다(영수증 `mapped`에 "획 색 옵션(sRGB) → color_h/s/v"). **Hokusai는 색 설정을 선형 광량으로 읽어** sRGB 값을 그대로 넣으면 같은 색이
  γ만큼 밝고 옅게 나오므로(sRGB 0.7 → 0.855) 레인이 sRGB → 선형 변환 뒤 HSV로 넘긴다(`mapProgramToMypaint`의 `colorSpace: "linear"`, 영수증에 "선형 변환" 표기). 지우개·smudge는 색을 쓰지 않는다.
  `reserved` 레인은 색 옵션을 받되 무시하고 어떤 호출이든 `beginStroke`를 거부한다(그릴 곳이 없다).
- 동기 호출이고 **획 밖에서는 no-op(멱등, `documentPreserved: true`)**이다. 호출 뒤 레인은 다음 `beginStroke`를 받는 idle 상태다(`addSamples`·`endStroke`는 `InvalidStateError`).
  dispose된 레인은 `InvalidStateError`, 예약 레인(`reserved`)은 진행 중인 획이 있을 수 없으므로 no-op이다.
- 레인은 보존하지 못한 것을 보존했다고 말하지 않는다(무음 대체 금지): 복원하지 못하면 `documentPreserved: false`와 한글 사유(`reasonKo`)를 돌려준다.

| 레인 | abortStroke 구현 | `documentPreserved` |
| --- | --- | --- |
| cpu-reference · wasm-cpu | 건식은 획 레이어(스파스 타일)만 비운다(문서는 `endStroke`에서만 바뀐다). 습식(수채·수묵·구아슈)·임파스토(유화)·smudge는 `Surface.abortStroke`가 **타일 단위 copy-on-write 저널**(`TilePool.beginJournal`: 획 도중 `view`로 처음 건드린 타일만 복사)로 습식 풀(코어·확장)·활성 타일 집합·가상 시간·표시 플래그·높이를 `beginStroke` 직전으로 복원한다. 다른 매체의 습식 층을 먼저 굽는 획(수채 → 유화 등)만 문서 전체를 복사해 둔다 | true (`endStroke`의 문서 합성 도중 실패했다면 false + 사유) |
| platform-baseline · canvas2d | 모은 표본(platform) 또는 획 캔버스(canvas2d `clearRect`)만 버린다. 문서는 `endStroke`에서만 바뀐다. platform-baseline은 `endStroke`가 던져도 획 상태를 초기화한다 | true |
| webgpu-compute · wasm-gpu-hybrid | 프레임을 내기 전이면 GPU 제출 0회(JS 플래그·습식 상수만 되돌림). 프레임을 냈다면 획 풀 clear + 표의 획 영역 리셋 + `composite_all` 1회(제출 1회)로 표시를 문서 상태로 되돌린다(`bake_stroke` 없음) | 건식·smudge true. **습식·임파스토가 프레임을 냈다면 false**(풀이 획 도중 직접 갱신돼 GPU에서는 타일 스냅샷 복원을 구현하지 않았다) · 장치 손실 false · 매체 전환으로 이미 구워진 층은 내용 보존 단서(`reasonKo`)와 함께 true |
| libmypaint · hokusai | 엔진은 획마다 격리된 표면에 그리고 문서는 `endStroke`의 합성에서만 바뀐다. 격리 표면·브러시(wasm 핸들)만 해제하므로 문서는 항상 정확히 보존된다. `discardedDabs`는 버려진 공급 표본 수 | true |
| webgpu-instanced · webgl2-instanced | 프레임을 냈다면 획 타깃 clear + `stroke_pass 0`으로 encode·present 1회(bake 없음), 내기 전이면 GPU 작업 0 | true (WebGPU 장치 손실은 false) |
| reserved | no-op | true |

`LiveStrokeSession`은 획 도중 레인 오류가 나면 **먼저 `abortStroke`를 부른다**. `documentPreserved: true`면 레인을 유지하고(그때까지 그린 문서가 남고 `onError`로 사유만 전달),
`false`이거나 `abortStroke` 자체가 던지면 레인을 새로 만들어 교체한다(문서가 비워지며 두 오류와 교체 사실 — `onStrokeAbort`의 `laneReplaced` — 이 모두 드러난다). 포인터 취소(`pointercancel`)는 오류가 아니라
사용자의 중단이라 같은 abort 경로로 획을 버린다(합성하지 않음, 문서 보존 실패 시에만 오류로 드러냄). 픽셀 해시 보존 증명은 CPU 참조·WASM·canvas2d(기능형 모의 2D 컨텍스트)·platform-baseline이 Node에서,
GPU 계열은 모의 장치로 "획 영역 비움·상태 리셋·불필요한 디스패치 없음"만 고정한다(실제 GPU 픽셀은 **브라우저 미검증**).

## 외부 엔진 비교 레인: libmypaint · Hokusai (2026-10-08)

Sumi와 **실제 외부 엔진**을 같은 fixture·같은 입력으로 나란히 보기 위한 비교 레인이다(`kind: comparison`). 저장소가 이미 핀한 두 wasm을 그대로 쓴다:
`libmypaint`는 MyPaint의 브러시 엔진(v1.6.1, ISC, `packages/studio-brush-platform/src/libmypaint`), `hokusai`는 Hokusai 0.3.0 자연 매체 래스터(`packages/studio-hokusai-wasm/pkg`)다.
**같은 브러시가 아니다**: 두 엔진에는 Sumi의 입력 파이프라인·접촉 물리·테이퍼·종이 그레인·습식·임파스토가 없다. 그래서 결과는 "동일"이 아니라 "유사한 의도"로 읽는다.

- **구조**: 엔진은 획마다 격리된 표면(새 브러시·새 표면)에 그리고, `endStroke`에서 sRGB straight RGBA8 프레임을 레인의 선형 premultiplied f32 문서에 Sumi의 `compositeTile`(normal·multiply·erase·max, 획 불투명도 곱)로 합성한다.
  `readback`은 sRGB straight RGBA8, `readbackLinear`는 그 8비트에서 유도한 선형 premultiplied f32(정밀도 8비트)다. 그래서 `abortStroke`는 표면만 해제하면 문서가 항상 정확히 보존되고, 다획 겹침은 레인이 합성한다. 공통 뼈대는 `lanes/isolated-stroke-lane.ts`다.
- **프로그램 → 설정(`lanes/mypaint-settings-map.ts`)**: Sumi 프로그램에서 `.myb` v3 설정을 계산한다. 두 엔진이 같은 설정 어휘를 평가하므로(Hokusai는 libmypaint v3 JSON을 파싱) **같은 프로그램이면 같은 문서**가 두 레인에 들어간다.
  옮기는 것: 지름 → `radius_logarithmic`(ln 반경), 경도 → `hardness`(반투명 반경 일치 등가 경도: 두 엔진의 dab 곡선이 달라 이름이 같은 수치를 그대로 쓰지 않는다), 흐름 → `opaque`, 간격 → `dabs_per_actual_radius`(1/spacing),
  시간 dab → `dabs_per_second`, 크기·흐름의 압력/난수 동역학 → 입력 곡선(`radius_logarithmic`은 배율의 로그 9점, `opaque_multiply`), 색(획 색 옵션 `StrokeOptions.color`, 없으면 레인 기본 검정) → `color_h/s/v`, `opaque_linearize` 0(dab별 흐름이 그대로 누적되는 Sumi 규약),
  불투명도·블렌드 → 엔진 밖 합성(지우개는 destination-out). 속도·기울기·방향·획 진행 입력, 타원 팁, 팁 종류, 접촉 물리, 종이, 테이퍼, 색 지터, 산포, 회전 추종, 이중 팁은 **옮기지 않는다**.
- **무음 손실 없음**: 옮기지 못한 기능·근사 방식은 `mappingReceipt()`(`mapped`·`approximated`·`unmapped`, 한글 사유)로 레인 객체에서 읽을 수 있다(UI 노출은 후속 과제). 엔진에 대응 모델이 없는 매체 —
  습식(`wet-flow`·`program.wet`)·임파스토·smudge(격리 표면이라 문서 색을 집을 수 없다) — 는 근사하지 않고 `beginStroke`에서 `LaneUnavailableError("not-implemented")`로 거부한다(렌더 인스턴싱 레인과 같은 규약, 레인은 idle로 남는다).
- **입력 공급**: Sumi 입력 파이프라인 없이 정본 표본(`predicted` 제외)을 원시 값으로 준다. libmypaint는 플랫폼 세션 계약 그대로 — 첫 표본 dtime 0.0001 s, 이후 tMs 차/1000, 마감 시 16 ms idle 8회로 꼬리를 푼다. Hokusai는 래퍼가 절대 시간에서 dtime을 유도하고
  **첫 표본은 위치만 심고 칠하지 않으며** `finishStroke`가 꼬리를 푼다. 기울기(deg)는 ±90°를 ±1로 정규화한다. 영수증 `dabCount`는 엔진에 공급한 정본 표본 수다(엔진이 dab 수를 노출하지 않고, libmypaint `stroke_to` 반환값은 표본별 dab 수가 아니다).
- **결정성**: 같은 입력·같은 시드의 재생은 같은 해시다(libmypaint는 획마다 libc `rand`를 재시드, Hokusai는 바이트 결정적이라고 래퍼가 명시). Node 테스트가 두 번 재생·`addSamples` 분할(프레임·표본 단위·일괄)·abort 뒤 재생이 같은 해시임을 고정한다.
  libmypaint wasm 인스턴스는 **동시에 획 하나**만 연다(공유 인스턴스를 쓰는 두 레인이 획을 섞으면 두 번째 `beginStroke`가 `invalid-state`; 별도 인스턴스는 `loadRaw`로 주입).
- **로드와 probe**: 둘 다 절대 throw하지 않고 `WebAssembly` 부재·로드 실패를 `wasm-artifact-missing`으로 돌려준다(`init`은 같은 코드의 `LaneUnavailableError`와 원인 메시지). libmypaint는 로더를 한 번 로드해 공유하며 표면 한도(한 변 4096·면적 4,194,304 px)를 넘으면 `limit-exceeded`다.
  Hokusai의 기본 로드는 번들러가 해석하는 pkg 동적 import + 기본 wasm URL(브라우저 경로)이라 **Node에서는 URL fetch가 없어 probe가 `wasm-artifact-missing`**이다 — 그래서 상태가 `browser-verification-required`다(Node 실행 검증은 `loadRuntime`으로 wasm 바이트를 주입).
- **측정(2026-10-08, 소프트웨어 렌더러와 무관한 CPU wasm)**:
  Node 256² 프리셋 6종(pencil-hb·ink-g-pen·marker-alcohol·airbrush·charcoal·crayon) × fixture 2종(zigzag·curve) 12건에서 libmypaint↔hokusai 알파 커버리지 IoU 0.993~1.000(바이트 동일 6건, 나머지도 커버리지는 거의 같다),
  cpu-reference 대비 IoU 0.46~0.79(같은 브러시가 아니라서 정상: Sumi는 입력 파이프라인이 코너를 둥글리고 접촉 물리·종이 그레인·테이퍼가 적용되며, 엔진 둘은 원시 표본이라 코너가 날카롭고 지름이 그대로 나온다).
  눈으로 본 차이: 연필은 Sumi가 종이 결에 따라 옅게 끊기고 엔진은 균일한 검정, G펜은 Sumi가 닙 물리로 가늘고 엔진은 지정 지름, 에어브러시는 등가 경도 덕에 같은 의도의 부드러운 띠(엔진이 더 진하고 폭이 좁다), 마커는 Sumi가 사각 끝·엔진이 둥근 끝.
  헤드리스 Chromium 141 + Vite dev(`scripts/browser-probe.mjs`)에서 프리셋 4종 × fixture 2종 × 2레인 16건이 실행·재실행 결정적이고 **Node와 픽셀 해시가 16/16 동일**하다(wasm 로드 경로 포함). `vite build`는 두 wasm 자산과 Hokusai 지연 청크를 내보내지만 **프로덕션 번들 실행은 검증하지 않았다**.
  실행 시간은 단일 측정이며(예: 256² 에어브러시 지그재그 cpu-reference 715 ms, libmypaint 15 ms, hokusai 16 ms) 성능 증거가 아니다.

## 랩 UI

탭 4개(`role="tablist"`, 화살표·Home·End 키 이동, **"그리기"가 첫 번째·기본 탭**)로 구성되며 공용 상태는 `app/state/lab-store.ts`(`useSyncExternalStore`, 외부 의존성 0), "그리기" 전용 상태는 `app/state/draw-store.ts`에 있다.

| 탭 | 구성 | 상태 흐름 |
| --- | --- | --- |
| 그리기 | 큰 캔버스(`DrawCanvas`: 표시 캔버스 + 궤적 미리보기 + 입력 스테이지) + 접이식 사이드 패널: `DrawBrushPicker`(카탈로그 31종을 가족 칩·검색·최근 사용으로 고름, 항목마다 한글 이름 + 갤러리 Worker로 지연 생성·캐시하는 작은 미리보기), `DrawParamPanel`(크기·불투명도·흐름, 색 16진 입력·H/S/V 슬라이더·최근 색 8칸 — 고른 색은 다음 획부터 `beginStroke` 색 옵션으로 레인에 전달된다, 입력 보정 방식(Sumi 1€ 필터 / 끈 당김 lazy-brush)과 안정화 0~100, 종이 켜기/끄기·종이 종류, 마우스 압력 시뮬레이션), `DrawLaneSelect`(레지스트리 기반 엔진 선택, 미지원 레인 비활성 + 한글 사유, 소프트웨어 렌더러·`browser-verification-required` 배지), `DrawHud`(레인·브러시, 획당 addSamples p50/p95·endStroke·readback ms, dab 수, 소프트웨어 렌더러 경고, 습식 건조 상태). 캔버스 크기 1024×640(기본)·512²·1024²·화면 맞춤, `지우기`·`PNG 저장` | `draw-store`(브러시·파라미터·색·최근 목록·미리보기 캐시·HUD) + `LiveStrokeSession`(레인 하나, 프로그램은 파라미터 변경 시 `setProgram`, 색은 `setColor`로 다음 획부터 반영); 레인·크기를 바꾸거나 지우면 새 세션(캔버스가 빈다) |
| 갤러리 | `FamilyGallery` → `PresetCard` × 31(스펙 30종 + 수묵 `sumi-ink-wet`): 같은 fixture(zigzag 256²)를 모든 프리셋으로 **Worker**(`cpu-reference` 경로)에서 렌더. 결정성 해시(fnv1a64, 리포트 `pixelHash`와 동일 함수)·렌더 시간·dab 수·가족 지표 PASS/FAIL/UNAVAILABLE | `gallery.entries[presetId]`; Worker 실패는 오류 카드(메인 스레드 대체 렌더 없음) |
| A/B 비교 | `LaneSelector`(A/B, 레지스트리 기반, 미지원 레인 비활성 + 사유), `FixturePicker`(fixture 9종·캡처 획·캔버스 256/512/1024·시드·실시간 입력·결정성 재실행·캡처 JSON 저장/불러오기), `BrushParamPanel`(크기·경도·간격·불투명도·흐름·산포·안정화·팁 텍스처·샘플링 필터·그레인·습식 베타·KM 베타, configHash 즉시 표시), `LaneCanvas` A \| B \| `DiffHeatmap`(ΔE 램프), `MetricsTable`(지표·임계값·판정), `ReportPanel`(JSON/PNG 다운로드) | `runCompare`: A → B 순차 실행 → `compareLanes` → 리포트 2개(B는 A를 참조 레인으로 ΔE·IoU·퍼지 비교, 결정성 재실행 시 해시 동일 판정) → `results`·`reports` |
| 리포트 | 세션 리포트 목록·정규 직렬화 원문·JSON 다운로드 | `reports[]`(세션 메모리에만) |

실시간 입력(레인 A 캔버스)은 `platform/pointer-capture.ts`가 `getCoalescedEvents()`를 정본으로, `getPredictedEvents()`를
**미리보기 레이어 전용**으로 태깅하고, `platform/raf-scheduler.ts`가 프레임당 `addSamples` 1회 계약을 보장한다. 획이 끝나면
정본 표본이 캡처 획으로 저장돼 바로 A/B 리플레이로 이어진다. 포인터가 취소되면(`pointercancel`) 그 획은 저장·합성하지 않고 레인의 `abortStroke`로 버린다. 다운로드는 `URL.revokeObjectURL`을 보장한다.
접근성: 44 px 이상 터치 타깃, `:focus-visible`, `prefers-contrast: more`, `forced-colors`, `prefers-reduced-motion`, 한글 UI 문구.

### 그리기 탭 사용법(손맛 시험용 샌드박스)

실행: `pnpm dev:brush-lab` → http://localhost:4178 (첫 화면이 "그리기"). **undo·레이어·문서 저장·서버 연동은 없다.** 결과를 가져가는 방법은 `PNG 저장`(현재 문서의 readback을 흰 종이 위에 평탄화한 PNG로(레인 readback은 투명 RGBA))뿐이다.

- **입력**: 펜(압력·기울기)·마우스·터치. 캔버스는 `touch-action: none`·포인터 캡처를 쓰므로 캔버스 밖으로 나가도 획이 이어지고, 우클릭 메뉴는 막으며 마우스 우클릭·가운데 버튼은 획을 만들지 않는다.
  마우스는 압력이 없어 **`마우스 압력 시뮬레이션(속도 기반)`**(기본 켬: 천천히 = 꾹, 빠르게 = 가볍게)을 둔다. 펜·터치 표본은 그대로 통과한다. `pointercancel`·`lostpointercapture`는 획을 합성하지 않고 레인의 `abortStroke`로 버린다(그림은 그대로, 알림으로 표시).
- **레인(엔진) 선택**: 시작 레인은 능력 탐지로 한 번만 정한다(webgpu-compute 가능 → 그것, 아니면 wasm-cpu, 아니면 cpu-reference). **사용자가 고른 뒤에는 자동으로 바꾸지 않는다**(ADR-0018). 실패는 사유 코드와 한글 설명으로 드러난다.
  레인을 바꾸면 문서가 레인 안에 있으므로 캔버스가 비워진다(화면 안내 문구). 소프트웨어 렌더러(SwiftShader 등)로 판정된 레인은 배지로 경고한다(속도는 성능 증거가 아님).
- **브러시·파라미터**: 변경은 `apply-overrides`의 프로그램 오버라이드로 다음 획부터 반영된다(그리는 도중 바꾸지 않는다). 종이 질감은 켜기/끄기와 종이 종류(브러시 기본·매끈한·보통·거친·수채화지)로 고르며, 종류는 종이 규모·거칠기·흡수성 오버라이드다. 안정화는 Sumi 1€ 필터(엔진 입력 파이프라인)와 lazy-brush(끈 당김, `platform/lazy-brush.ts`) 중 고른다.
  서비스 `applyStabilizer`는 경계 규칙(`@toonstudio/*`는 `platform-baseline-lane.ts`에서만)상 이 화면에서 쓰지 않는다.
- **HUD**: 마지막 획의 addSamples 프레임별 p50/p95(ms)·endStroke·readback·dab 수. 습식 매체(수채·수묵·구아슈·유화)의 "마르는 중/건조" 상태는 **레인이 제공하지 않아 표시를 생략하고** 안내 문구만 둔다(레인 계약에 건조 상태 조회가 생기면 연결한다).
- **한계(후속 과제)**:
  ① (해결, 2026-10-08 BL-1b) 획 색: 레인 계약이 `beginStroke(program, seed, { color })`를 받아 모든 레인이 그림에 색을 적용한다(위 "레인 계약" 참고). 지우개·smudge 가족은 색을 쓰지 않는다. 색 알파 < 1은 dab 색의 알파로 들어가 획 안에서 겹친 곳이 더 진해진다.
  ② (해결, 2026-10-08 BL-1b) 빠른 획: `StrokePipeline.emitSamples`의 dab 배치 용량 추정이 직전 프레임 마지막 위치에서 이번 프레임 첫 표본까지의 구간과 적응 간격(반경 10 % 초과 변화 시 간격 0.5배)을 세지 않아 프레임당 16 px 이상 움직이는 획이 `stroke-budget-exceeded`로 버려지던 문제를 고쳤다
  (용량 추정만 바뀌며 dab 목록·출력 픽셀은 같다 — 레인별 해시 스냅샷 불변). 남은 거부는 한 프레임에 약 32,000 px 이상 건너뛰는 **비정상 입력**(용량 상한 `MAX_FRAME_DAB_CAPACITY` 262,144 dab 초과 추정)뿐이며,
  dab를 만들기 전에 `StrokeBudgetExceededError`(`details.reasonKo`에 한글 사유)로 거부한다. 앱은 레인을 바꾸거나 입력을 보정하지 않고 사유와 함께 획을 버린다(문서 보존).
  ③ 실 GPU·실기기 펜 압력은 검증하지 못했다(헤드리스 Chromium + SwiftShader, CDP 합성 펜 이벤트).

브라우저 실검증(2026-10-08, `BRUSH_LAB_BROWSER_PROBE=1 TMPDIR=/tmp node apps/brush-lab/scripts/browser-draw-probe.mjs [--lane <id>] [--presets a,b] [--skip-extras] [--verbose]`): Vite dev 서버와 헤드리스 Chromium 141(둘 다 detached 프로세스 그룹, 종료 시 그룹 kill)에서 마우스 곡선(속도 압력 시뮬레이션 켬)과 CDP 펜 지그재그(pointerType=pen, 압력 0.1→1→0.1·기울기)를 실제로 그리고 스크린샷·잉크 픽셀·HUD를 기록한다.
`wasm-cpu`에서 가족 9종(연필·목탄·G펜·수채·유화·에어브러시·수묵·마커·해칭)이 모두 그려지고, 우클릭 메뉴 차단·touch-action none·우클릭이 획을 만들지 않음·캔버스 밖 드래그가 한 획으로 끝남·합성 `pointercancel` 뒤 문서 잉크 픽셀 불변(33007→33007)·`PNG 저장`(1024×640, 흰 종이 평탄화)·모바일 세로(390 px) 가로 스크롤 0과 사이드 패널이 캔버스 아래로 내려옴을 확인했다.
`webgl2-instanced`(연필·목탄·에어브러시)·`libmypaint`(연필·에어브러시)·`cpu-reference`(연필·G펜·해칭)도 그려진다. 레인별 HUD 수치는 SwiftShader·공유 CPU에서의 단일 측정이라 성능 증거가 아니다.
**미검증**: `webgpu-compute`(능력 탐지가 고르는 시작 레인)는 이 환경(헤드리스 Chromium의 SwiftShader)에서 WebGPU 캔버스 표시(swap chain)용 SharedImage 백킹이 없어 첫 획에서 `device-lost`가 난다(앱은 사유 코드와 한글 설명을 보이고 문서를 보존하며 다른 레인으로 바꾸지 않는다). WebGPU 레인으로 그리는 경로는 실 GPU 브라우저에서 확인해야 한다.

## 경계

- `apps/web`, `apps/admin-web`, `apps/api`, `apps/character-lab` source를 import하지 않는다(`scripts/validate-app-boundaries.mjs`의
  `brushLabToApps`·`appsToLabs` ratchet = 0).
- `@toonstudio/studio-brush-platform`·`@toonstudio/studio-project-model`은 `src/lanes/platform-baseline-lane.ts`에서만,
  `@toonstudio/studio-engine-registry`는 `bench/metrics/render-metrics.test.ts`(δ48 교차 검증)에서만 쓴다.
  예외(외부 엔진 비교 레인, 해당 파일과 그 테스트만): `src/lanes/libmypaint-lane.ts`는 `@toonstudio/studio-brush-platform/libmypaint`(세션 API만, zod·레지스트리 import 경로 없음)를 쓰고,
  핀된 libmypaint 로더(패키지 exports에 없음)는 `apps/web` 네이티브 프로브 워커와 같은 상대 경로(`packages/studio-brush-platform/src/libmypaint/index`)로 가져온다.
  `src/lanes/hokusai-lane.ts`는 `packages/studio-hokusai-wasm/pkg/studio_hokusai_wasm.js`를 상대 경로 동적 import한다(pkg에 package.json 의존 선언이 없는 web-target 산출물; `apps/web` 워커와 같은 방식).
  `src/boundary.test.ts`가 `packages/`로 나가는 상대 import를 이 지정 파일·모듈로만 허용하고, `registry.test.ts`가 서비스 패키지 import를 위 파일로만 허용한다.
  `src/engine/**`은 어떤 경우에도 `@toonstudio/*`·`packages/` 경로를 import하지 않는다.
- `src/engine/**`은 `@toonstudio/*`·react·DOM 전역·`Math.random`·`Date.now`를 참조하지 않는다. zod는 `presets/program-schema.ts`·`wet/params.ts`만.
- `@/` alias 금지(상대 경로만). mixbox(CC BY-NC)·Krita 등 GPL 코드·canvaskit 유입 금지. `src/boundary.test.ts`가 거부한다.

## 의존성·라이선스

| 패키지 | 버전 | 라이선스 | 용도 |
| --- | --- | --- | --- |
| react / react-dom | ^19.2.7 | MIT | 랩 UI |
| zod | 4.4.3(exact) | MIT | 브러시 프로그램·fixture·인증 리포트 스키마 |
| @toonstudio/studio-brush-platform / studio-project-model / studio-engine-registry | workspace:* | 저장소 내부 | 현행 서비스 기준선 레인·δ48 교차 검증 |
| libmypaint v1.6.1(wasm, 핀된 빌드) | 2768251d | ISC | 외부 엔진 비교 레인 `libmypaint`. 고지: `packages/studio-brush-platform/src/libmypaint/COPYING`(라이선스 원문)·`NOTICE`·`THIRD_PARTY_INVENTORY.json`·`INTEGRITY.sha256`, 빌드 소스 `bridge/` |
| Hokusai 0.3.0(wasm, `studio-hokusai-wasm` 래퍼 pkg) | 0.3.0 | MIT OR Apache-2.0 (+ 전이 `unicode-ident` 데이터표 Unicode-3.0) | 외부 엔진 비교 레인 `hokusai`. 고지: `packages/studio-hokusai-wasm/pkg/LICENSE-APACHE`·`LICENSE-MIT`·`LICENSE-UNICODE`(저장소 루트 패키지 디렉터리에도 같은 3개)·`README.md`·`INTEGRITY.sha256`. 래퍼는 Hokusai 업스트림의 `hokusai-wasm`을 쓰지 않는다 |
| vite / @vitejs/plugin-react | ^8.0.16 / ^6.0.2 | MIT | 정적 빌드·ES module worker |
| vitest / jsdom / @testing-library/react | 4.1.11 / ^29 / ^16.3.2 | MIT | Node·jsdom 테스트 |
| typescript | ~6.0.3 | Apache-2.0 | typecheck(WebGPU 타입은 DOM lib 제공, `@webgpu/types` 미사용) |

참고 코드는 개념·수식만 재구현했고 외부 비트맵·재질 에셋은 0개다. 라이선스 판정 원장은
[brush-lab 참고 문헌 원장](../../docs/engines/labs-brush-engine-references-2026-10-01.md)이다.

## 알려진 한계·브라우저 미검증

- 이 컨테이너에는 하드웨어 GPU가 없다. 대신 헤드리스 Chromium 141의 **SwiftShader(소프트웨어 WebGPU·WebGL2)** 로 `scripts/browser-probe.mjs`를 실제로 돌려
  WGSL 11모듈·GLSL 실컴파일(오류 0), cpu-reference 패리티, 재실행 결정성을 측정했다(2026-10-02, 습식 GPU 미러·종이/각도 정밀도 수정 반영 코드 기준). 결과: `webgpu-compute`는 카탈로그 31종(스펙 30종 + 수묵 `sumi-ink-wet`)
  × fixture 3종(curve·spiral·fast-flick, 128²) 93건이 전부 δ48 0%·**ΔE p99 0**(최대 ΔE 0.33, 8비트 채널 오차 ≤ 1/255, 픽셀 해시 87건이 CPU와 동일)이고 재실행 결정성 93/93이다.
  타일 경계에 맞지 않는 100²(습식 5종·건식 2종 7건 전부 CPU와 픽셀 해시 동일)·512²(수채·유화 합성 지그재그)·1024²(건식 4종 + 수채·수묵·유화)도 통과했다. `wasm-gpu-hybrid`는 `webgpu-compute`와 픽셀 해시가 같다(습식 5종 15건·스모크 15종·1024² 4종 포함).
  렌더 인스턴싱 비교 레인은 f16 누적이라 ΔE p99가 다르다(WebGPU 인스턴싱 스모크 12종 0~0.95, 2026-10-02; WebGL2 인스턴싱은 2026-10-01 측정 0~4.9; 습식·smudge·임파스토는 설계상 거부). **이 값은 소프트웨어 렌더러 결과라 성능 증거도 승격 증거도 아니다**
  (승격에는 `softwareRenderer: false` 리포트가 필요하다). 실제 GPU 드라이버·타이밍(`timestamp-query` 값; SwiftShader의 값은 성능이 아니다)·f32 연산 순서 차이는 검증하지 못했다. Node 테스트의 모의 `GPUDevice`·
  모의 WebGL2는 바인딩·호출 계약 검증용이고 픽셀을 만들지 않는다. 2026-10-01·02 SwiftShader 실측 리포트(JSON)는 재생성 가능한 산출물이라 커밋하지 않았다(`--reports`로 재생성; WebGPU·WebGL2 레인은 `softwareRenderer: true`·SwiftShader 어댑터, `canvas2d`·`wasm-cpu`는 GPU를 쓰지 않아 어댑터 필드가 null).
- **습식(수채·수묵·구아슈·유화) GPU 미러 — 구현·SwiftShader 실측 완료(2026-10-02)**: CPU 참조의 습식 구조(LBM D2Q9 흐름층·Curtis 3층 물 교환·섬유 차단(수묵 갈라짐·번짐 이방성)·재습윤·백런·에지 다크닝·그래뉼레이션·확장 풀 23채널·
  표시 시점 층 합성(획 끝에 굽지 않는 지속 레이어)·유화 물감 층(점도 의존 전단·KM 혼색·Bingham 레벨링·건조))을 `docs/drafts/brush-wet-gpu-mirror-spec.md`대로 WebGPU compute로 옮겼다. 1·2차로 나누지 않고 한 번에 완성했다.
  - 구조: 습식 가족 전용 바인드 레이아웃(group 3 신설, 가족마다 storage 버퍼 ≤ 8) · WGSL `wet-water`(스냅샷·에지 Δ·물 스텝(gather 전용, 결과 경로에 원자 없음)·활성 타일 확장·목록 확정·정착 검사)·`wet-oil`(dab 순차 처리: 셰이드 → 고정 순서 트리 리덕션 → 밀기 × 패스 → 붓 색 → 침착 → 되쓰기, 레벨링·건조)·`wet-composite`(표시 시점 합성·`bake_wet`·`flatten_oil`)
    · 결정성 수학(`det_sin`/`det_cos`, `pow` 없음, 종이 파생 필드는 전역 셀 좌표의 순수 함수) · `endStroke`는 습식 층을 굽지 않고 매체 종류가 바뀔 때만 평탄화(`flattenWet`).
  - 예산·한도: 확장 풀 23채널·스냅샷 20채널·f32 종이(`paper_wet`)·유화 스크래치를 **장치가 실제로 받은 한도**(`device.limits`)로 검증하고 초과는 `StrokeBudgetExceededError`(버퍼 이름 포함)로 init·획 시작에서 던진다(무음 축소·무음 검증 오류 없음). 필요한 한도가 기본을 넘으면 레인이 어댑터 한도 범위에서 `requiredLimits`로 요청한다(2048²·6000타일 → 확장 풀 141 MB를 SwiftShader에서 실제 장치가 받아 획이 그려짐을 확인).
    기본 습식 풀 용량은 2048타일(110 MiB; 720² 이하 캔버스는 45×45 = 2025타일이라 전 타일이고, 721²부터는 46×46 = 2116타일이라 기본 용량으로 잘린다)이며 더 큰 캔버스는 `LaneInit.wetCapacityTiles`로 올린다. 유화 스크래치·선형 표시 버퍼는 지연 생성이라 쓰지 않는 세션은 영향이 없다.
  - 실측(SwiftShader, CPU 참조 대비): ① 습식 장면 단일 서브스텝 max|Δ| ≤ 2.4e-7(명세 허용 1e-5)·20·60프레임 max|Δ| ≤ 1.4e-6(허용 5e-4)·상대 L2 ≤ 2e-5(허용 1e-3)·물·안료 질량 상대 오차 ≤ 1.3e-6(허용 1e-4)·활성 타일 집합 일치 — 수채·수묵·구아슈, 에지·물막·그래뉼레이션, 프리셋 실제 파라미터·종이 포함 10장면;
    ② 실제 획 도중 상태(128² 나선, CPU·GPU가 받는 dab 배치는 값까지 동일, 질량 상대 오차 ≤ 4.4e-7): 유화 189 dab 뒤 높이·색 max|Δ| 2.2e-6(명세의 단일 dab 허용 2e-6 수준), 수채 건조 184 dab 뒤 7.6e-7, 구아슈 430 dab 뒤 1.8e-5, 수묵 136 dab 뒤 9.6e-5(모세관 1셀) — 수채 126 dab 획 꼬리 프레임에서 속도장 1셀(전체의 0.0062%)이 문턱 분기로 0.17 어긋난 것이 유일한 예외이며 질량·안료·물은 일치;
    ③ 다획 지속 레이어(수채→수채, 수채→건식, 유화→건식, 수채→유화, 유화→유화, 수묵→수채, 건식→수채, 구아슈→수채 건조) 8종 ΔE p99 0·채널 오차 ≤ 1/255; ④ 합성 지그재그 `zigzagStroke(size, 600 ms)` 256² 습식 5종·512² 2종: CPU 해시가 명세 §9.3 기준값과 일치하고 GPU는 δ48 0%·ΔE p99 0(최대 ΔE 0.37; 구아슈 3.54는 검정 위 알파 1/255 양자화 한 칸).
  - 이 측정이 드러낸 **원래 래스터 미러의 어긋남 2건을 고쳤다**: (a) 래스터·유화 그레인이 8비트 `paperTex`(요철 양자화 ≤ 1/510 + 하드웨어 필터 가중치)를 읽던 것을 f32(`rgba32float`) 텍스처 + `textureLoad` 4탭 직접 쌍선형 보간으로 바꿨다(CPU `samplePaper`와 같은 식);
    (b) dab 각도·종이 회전이 WebGPU가 2^-11 절대 오차를 허용하는 내장 `sin/cos`를 쓰던 것을 `rot_cs`(`det_sin/det_cos`, 각도 0은 정확히 (1, 0))로 바꿨다 — SwiftShader에서 dab 각도 0.3의 커버리지 오차가 4.2e-4였고 수묵·구아슈 상태 어긋남(셀당 최대 0.13)의 원인이었다. 수정 후 단일 dab 24개 스윕이 전부 ≤ 9e-7이다.
    효과: 카탈로그 93건 ΔE p99 최대 0.69 → 0, 유화 189 dab 상태 5.3e-3 → 2.2e-6. 렌더 인스턴싱 레인도 같은 WGSL 헬퍼를 쓴다.
  - 한계: 실 GPU에서의 `sin/cos` 외 내장 함수(`exp`·`pow`·`log2`) 정밀도, f32 합산 순서, 타이밍은 검증하지 못했다. 문턱 분기(방향 선택·경화·핀닝)는 f32/f64 차이로 드물게 뒤집힐 수 있다(위 속도장 1셀 예외). `wasm-cpu` 커널은 습식 스탬프가 CPU와 같도록(안료 질량 × 그레인 응답, 임파스토 dab는 획 레이어에 쓰지 않음) 재빌드했다(`wasm/sumi-kernel/build.sh`, INTEGRITY·`kernel-*.ts` 재생성).
  - CPU 습식 해시는 의도적으로 바뀌었다: watercolor-wet 256² `e2eeedfaad6bccd9`·512² `21d19d4a9bb0d714`, oil-impasto 256² `1d1437eb6d4ebc42`·512² `b4f8ae7943dbd81f`(새 스냅샷은 `raster/wet-presets*.snapshot.test.ts`), 비습식 프리셋 해시는 변하지 않았다.
- 표시용 릴리프 조명을 거치지 않은 `readbackLinear()`는 GPU 표시 합성(`composite_linear`)으로 같은 조명·층 합성을 적용해 돌려준다. `wasm-cpu`는 `Surface`를 상속해 임파스토를 TS 유화 층 패스 그대로 지원하고(CPU와 비트 동일),
  렌더 인스턴싱 레인(WebGPU·WebGL2)은 습식·smudge·임파스토를 `not-implemented`로 거부한다.
- 외부 엔진 비교 레인(libmypaint·hokusai): 입력 파이프라인·접촉 물리·테이퍼·종이 그레인·습식·임파스토·smudge가 없고(위 절), `readbackLinear`는 8비트에서 유도한 값이다. 인증 리포트의 가족 지표(질감·손맛)는 이 레인들에 대해 해석하지 않는다.
  영수증 `dabCount`·`submitCount`는 엔진 내부 dab·제출이 아니라 공급 표본 수·프레임 수 + 1이다. UI 셀렉터에서 매핑 영수증을 보여 주는 화면은 아직 없다.
- `wasm-gpu-hybrid`는 wasm이 CSR(counts·offsets·refs)만 만들고 GPU가 래스터를 한다. 스펙의 "wasm이 StrokePipeline 동역학까지 수행"은 구현하지 않았다.
- 캔버스 상한 2048²(타일 16 384개), 대형 dab(타일 4096개 초과)은 fail-visible overflow로 기록된다.
- 갤러리 가족 지표의 임계값은 자체 정의 목표이며 브라우저 실측 전까지 "달성"으로 보고하지 않는다.
- 안정화 강도 0.6 초과 구간의 spring 팔로워 백엔드는 이 랩에 없고 같은 1€ 매핑을 쓴다(패널에 표시).
- 세션 리포트·캡처 획은 메모리에만 있다(서버·저장 없음). 필요하면 JSON으로 내려받는다. "그리기" 탭의 문서도 메모리에만 있고 PNG 스냅샷만 내려받는다(undo·레이어 없음).

## 승격 프로세스 요약

랩 실험 → 가족 지표 임계값 통과 → 인증 리포트(`<presetId>-<laneId>-<YYYYMMDD>.json`, 실 GPU `softwareRenderer:false` 최소 1개)를
`docs/evidence/brush-lab/`에 커밋 → `src/engine` → `packages/studio-brush-engine-sumi` 추출(경계 테스트·서비스 패키지 미의존) →
`apps/web` 레인 연결 PR(엔진 레지스트리 descriptor·라이선스 게이트·ADR-0018 단일 선택) → 회귀 게이트(픽셀 해시·δ48·성능 p95).
상세는 [승격 프로세스 초안](docs/drafts/brush-lab-promotion-process.md), 설계는
[Sumi 엔진 아키텍처 초안](docs/drafts/brush-lab-sumi-engine-architecture-2026-10-01.md), 증거 디렉터리 규약은
[증거 README 초안](docs/drafts/evidence-brush-lab-README.md), 결정 기록은
[ADR-0026](../../docs/adr/0026-labs-experimental-apps-engine-selection-and-promotion.md)이다.

## 소유권

```text
index.html, vite.config.ts, tsconfig.json, package.json   통합 담당
src/engine, src/lanes/{lane,registry,cpu-reference-lane}  core 작업자
src/engine/gpu, src/lanes/{webgpu,canvas2d,webgl2,wasm}   engine-gpu 작업자
src/bench, src/lanes/platform-baseline-lane               bench 작업자
src/platform, src/app, README.md, AGENTS.md, docs/drafts  ui 작업자
```
