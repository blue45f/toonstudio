import { t } from "./engineering-glossary-more-kit";

import type { GlossaryTerm } from "./engineering-glossary-content";

/** 확장 용어집 · 브러시 · 렌더링. 펜 입력이 선과 색이 되기까지의 말들. */
export const GLOSSARY_MORE_BRUSH: readonly GlossaryTerm[] = [
  {
    id: "coalesced-predicted-events",
    category: "brush",
    term: t("Coalesced · Predicted events (합쳐진·예측 입력)", "Coalesced · predicted events"),
    definition: t(
      "브라우저가 프레임 사이에 모아 둔 실제 펜 점들(coalesced)과, 다음 위치를 미리 짐작한 가짜 점들(predicted)입니다.",
      "The real pen points the browser gathered between frames (coalesced) and the guessed next points it predicts (predicted).",
    ),
    analogy: t(
      "블랙박스 영상 속 차의 실제 궤적과, 내비게이션이 ‘곧 여기로 갈 것’이라고 그려 주는 점선 화살표의 차이입니다. 기록에는 실제 궤적만 남겨야 합니다.",
      "The real trail of a car in dashcam footage versus the dotted arrow a navigator draws for where it will probably go. Only the real trail belongs in the record.",
    ),
    inToonstudio: t(
      "그림 문서에는 하드웨어가 준 샘플만 저장하고 예측 점은 ‘미리보기 전용’으로만 씁니다(canvas/studio-pointer-input.ts, persistence: preview-only). 예측 꼬리(studio-predicted-ink-tail.ts)는 새 예측이 오면 이전 꼬리를 교체하고 되돌리기 기록에 들어가지 않습니다. 모션을 줄이는 설정의 사용자는 예측 없이 하드웨어 점만 씁니다.",
      "Only hardware-provided samples are stored in the drawing document; predicted points are preview-only (canvas/studio-pointer-input.ts, persistence: preview-only). The predicted tail (studio-predicted-ink-tail.ts) replaces the old tail whenever a new prediction arrives and never enters undo history. Users with reduced motion get hardware points only, no prediction.",
    ),
    chapters: ["brush-preview-commit", "brush-engine"],
    atlasIds: ["pointer-input-contract"],
  },
  {
    id: "pressure-tilt",
    category: "brush",
    term: t("필압 · 기울기 · 회전 (pressure · tilt · twist)", "Pressure · tilt · twist"),
    definition: t(
      "펜이 얼마나 세게 눌렸는지, 얼마나 눕혔는지, 펜대가 얼마나 돌아갔는지를 숫자로 알려 주는 입력 채널들입니다.",
      "Input channels that report, as numbers, how hard the pen presses, how far it leans and how much the barrel is rotated.",
    ),
    analogy: t(
      "붓을 쥘 때의 힘, 붓을 눕히는 각도, 손목을 비트는 정도를 센서가 그대로 읽어 주는 것과 같습니다. 같은 붓이라도 세 가지가 다르면 선이 다릅니다.",
      "Like a sensor reading how firmly you hold a brush, how flat you lay it and how you twist your wrist: the same brush draws differently when any of the three changes.",
    ),
    inToonstudio: t(
      "studio-pointer-input.ts 가 pressure·tangentialPressure·tiltX/Y·altitude/azimuth 각도·twist·접촉 크기를 한 규격(V2 채널)으로 다듬고, 값이 이상하면 invalid-pressure 같은 사유와 함께 거절합니다. 스탬프 브러시는 필압을 0~1 로 맞추고 값이 없으면 0.5 로 봅니다(normalizedPressure).",
      "studio-pointer-input.ts normalizes pressure, tangentialPressure, tiltX/Y, altitude/azimuth angles, twist and contact size into one V2 channel shape and rejects odd values with a reason such as invalid-pressure. The stamp brush clamps pressure to 0-1 and treats a missing value as 0.5 (normalizedPressure).",
    ),
    chapters: ["brush-engine", "brush-pipeline"],
    atlasIds: ["pointer-input-contract"],
  },
  {
    id: "one-euro-filter",
    category: "brush",
    term: t("One Euro 필터", "One Euro filter"),
    definition: t(
      "천천히 움직일 때는 떨림을 세게 지우고 빠르게 움직일 때는 거의 거르지 않아, 떨림과 지연 사이의 균형을 스스로 맞추는 필터입니다.",
      "A filter that smooths hard when you move slowly and barely at all when you move fast, balancing jitter against lag automatically.",
    ),
    analogy: t(
      "속도에 따라 감도가 바뀌는 자동 쇼크 업소버와 같습니다. 느린 길에서는 잔진동을 눌러 주고, 빠른 길에서는 핸들을 가볍게 풀어 줍니다.",
      "Like an adaptive shock absorber: on slow ground it damps the buzz, at speed it loosens so the steering stays light.",
    ),
    inToonstudio: t(
      "파인라이너·기술 펜·젤 펜처럼 2~5px 가는 선 펜 별칭에만 적용합니다(studio-thin-line-ink-input-v1.ts). 안정화 값이 0 일 때 모든 미세 떨림이 붓 자국 중심이 되는 문제를 막으려는 것입니다. 최소 컷오프 0.95Hz·beta 0.02, 속도는 CSS px/s 로 재서 확대해도 필터가 달라지지 않습니다(brush/studio-stroke-one-euro-v1.ts).",
      "Applied only to thin-line pen aliases of 2-5 px such as fineliner, technical pen and gel pen (studio-thin-line-ink-input-v1.ts), because with the stabilizer at 0 every tiny wiggle becomes a dab centre. Minimum cutoff 0.95 Hz and beta 0.02, with speed measured in CSS px/s so zooming never retunes the filter (brush/studio-stroke-one-euro-v1.ts).",
    ),
    chapters: ["brush-engine", "brush-pipeline"],
    atlasIds: ["stroke-smoothing-one-euro"],
  },
  {
    id: "dab",
    category: "brush",
    term: t("Dab (붓 자국 스탬프)", "Dab (brush stamp)"),
    definition: t(
      "스탬프 방식 브러시가 선을 긋는 최소 단위입니다. 선 하나는 간격을 두고 찍은 수많은 붓 자국의 줄입니다.",
      "The smallest unit a stamp-style brush draws with: one line is a row of many brush marks stamped at intervals.",
    ),
    analogy: t(
      "도장을 일정한 간격으로 꾹꾹 찍어 줄을 만드는 것과 같습니다. 간격이 좁으면 매끈한 선, 넓으면 점선처럼 보입니다.",
      "Like pressing a rubber stamp at regular spacing to form a line: tight spacing looks smooth, wide spacing looks dotted.",
    ),
    inToonstudio: t(
      "스탬프 브러시 한 획의 붓 자국은 STUDIO_STAMP_BRUSH_MAX_DABS = 100,000 개가 상한입니다(brush/studio-brush-stamp-engine.ts). 번짐·혼색 같은 효과도 붓 자국 하나마다 ‘바닥색을 묻히고 얹는’ 모델로 계산합니다(brush/studio-wet-mix.ts). 질감 지터는 Math.random 이 아니라 씨앗과 붓 자국 번호로 만드는 결정적 해시(stampJitter, studio-brush-stamp-engine.ts)로 정해, 같은 번호는 늘 같은 값입니다.",
      "A stamp-brush stroke is capped at STUDIO_STAMP_BRUSH_MAX_DABS = 100,000 dabs (brush/studio-brush-stamp-engine.ts). Effects such as smudge and colour mixing are modelled per dab: pick up the colour underneath, then deposit (brush/studio-wet-mix.ts). Texture jitter does not use Math.random; it comes from a deterministic hash of the seed and dab index (stampJitter, studio-brush-stamp-engine.ts), so the same index always gets the same value.",
    ),
    chapters: ["brush-engine", "brush-pipeline"],
    atlasIds: ["stroke-replay-deterministic"],
  },
  {
    id: "deterministic-replay",
    category: "brush",
    term: t("결정적 재생 (Deterministic replay)", "Deterministic replay"),
    definition: t(
      "획을 완성된 픽셀이 아니라 ‘입력 점과 설정’으로 저장해 두고, 같은 입력이면 언제 다시 그려도 똑같은 결과가 나오게 하는 방식입니다.",
      "Storing a stroke as input points plus settings instead of finished pixels, so redrawing the same input always gives the same result.",
    ),
    analogy: t(
      "그림을 사진으로 남기는 대신 요리 레시피로 남기는 것과 같습니다. 재료와 순서(입력)가 같으면 언제 다시 만들어도 같은 요리가 나옵니다.",
      "Like keeping a recipe instead of a photo of the dish: same ingredients and steps (input) give the same dish whenever you cook it.",
    ),
    inToonstudio: t(
      "획은 저장된 점과 필압으로 렌더마다 다시 계획되며(studio-element-model.ts 의 DrawEl), 무작위 값은 Math.random 이 아니라 씨앗과 번호로 만드는 해시(stampJitter)라 같은 입력이면 같은 질감입니다. 대가로 종이 모델 같은 보정은 키(paperModel)를 붙여 도입해야 합니다. 키 없이 고치면 기존 페이지가 조용히 다시 칠해지기 때문입니다.",
      "Strokes are re-planned on every render from stored points and pressures (DrawEl in studio-element-model.ts), and randomness is a hash of a seed and an index (stampJitter), not Math.random, so identical input yields identical texture. The cost: corrections such as the paper model must be introduced behind a key (paperModel), because fixing without one would silently repaint every existing page.",
    ),
    chapters: ["brush-preview-commit", "brush-engine"],
    atlasIds: ["stroke-replay-deterministic"],
  },
  {
    id: "stroke-surface-route",
    category: "brush",
    term: t("획 표면 경로 (Stroke surface route)", "Stroke surface route"),
    definition: t(
      "펜을 대는 순간 ‘이 획을 어떤 그리기 방식으로 끝까지 그릴지’를 하나 정해 고정하는 규칙입니다. 중간에 몰래 바꾸지 않습니다.",
      "A rule that picks, the moment the pen touches down, one drawing path for the whole stroke and never swaps it silently midway.",
    ),
    analogy: t(
      "택시를 탈 때 목적지까지 한 대로 가는 것과 같습니다. 중간에 차가 바뀌면 승객(획)이 흔들리고 요금 계산도 꼬입니다.",
      "Like riding one taxi to the destination: switching cars midway jolts the passenger (the stroke) and muddles the fare.",
    ),
    inToonstudio: t(
      "pointer-down 에서 living-ink → hokusai → stamp → gpu → live-ink → wet-ink → dynamic → konva 순으로 첫 가능한 레인을 골라 획 끝까지 고정합니다(brush/studio-stroke-surface-route.ts, ADR-0018). 실패해도 다른 레인으로 넘기지 않고 실패를 드러냅니다. 마지막 konva 레인이 Canvas2D 커밋의 종단 경로입니다.",
      "At pointer-down the first capable lane in the order living-ink, hokusai, stamp, gpu, live-ink, wet-ink, dynamic, konva is chosen and fixed until the stroke ends (brush/studio-stroke-surface-route.ts, ADR-0018). A failure is surfaced rather than handed to another lane. The final konva lane is the Canvas2D commit of last resort.",
    ),
    chapters: ["brush-render-authority", "brush-engine"],
    atlasIds: ["stroke-surface-route-pointerdown"],
  },
  {
    id: "desynchronized-canvas",
    category: "brush",
    term: t("저지연 캔버스 (desynchronized)", "Low-latency canvas (desynchronized)"),
    definition: t(
      "캔버스가 페이지의 평범한 화면 합성 순서를 기다리지 않고 먼저 화면에 올라가게 해, 펜을 댄 순간부터 선이 보이기까지의 시간을 줄이는 옵션입니다.",
      "A canvas option that lets the surface reach the screen without waiting for the page's normal compositing order, shortening the time from pen touch to visible ink.",
    ),
    analogy: t(
      "식당에서 코스 전체가 나올 때까지 기다리지 않고, 완성된 접시부터 바로 내보내는 주방과 같습니다. 대신 상차림이 어긋날 수 있습니다.",
      "Like a kitchen that sends each finished plate straight out instead of waiting for the whole course; the table setting may briefly look out of step.",
    ),
    inToonstudio: t(
      "한 프레임 가까이를 줄이는 대신 페이지와 정확히 같은 순간에 표시된다는 보장이 사라집니다. 그래서 지연을 줄이려고 쓰고 곧 버리는 라이브 잉크 오버레이 캔버스에만 desynchronized 를 요청하고(studio-low-latency-canvas.ts, 실패하면 일반 2D 컨텍스트), 되읽기가 잦은 캔버스는 willReadFrequently 를 씁니다. 역할별 표·점검·모순 거절(studio-lowlatency-surface-policy.ts)은 구현·시험만 있고 아직 제품에 연결되지 않았습니다.",
      "It can remove nearly a frame of latency but loses the guarantee of appearing atomically with the page. So desynchronized is requested only for live-ink overlay canvases that are written and discarded (studio-low-latency-canvas.ts, falling back to a plain 2D context if refused), while canvases that are read back often use willReadFrequently. The per-role table, the probe and the rejection of contradictory combinations (studio-lowlatency-surface-policy.ts) are implemented and tested only, and not yet wired into the product.",
    ),
    chapters: ["brush-render-authority", "performance"],
    atlasIds: ["pointer-input-contract"],
  },
  {
    id: "tile-copy-on-write",
    category: "brush",
    term: t("타일 · 쓸 때 복사 (copy-on-write)", "Tiles · copy-on-write"),
    definition: t(
      "큰 그림을 작은 타일로 쪼개 칠해진 타일만 저장하고, 되돌리기용 복사는 실제로 고칠 때까지 미뤄 두는 저장 방식입니다.",
      "A storage scheme that cuts a big image into tiles, keeps only painted ones and postpones undo copies until something actually changes.",
    ),
    analogy: t(
      "공책 전체를 복사하는 대신 바뀐 쪽만 새로 쓰고 나머지는 같은 쪽을 함께 가리키는 것과 같습니다. 100번 저장해도 바뀐 쪽만 늘어납니다.",
      "Like rewriting only the changed pages of a notebook and pointing at the same unchanged pages: a hundred snapshots add only the edited pages.",
    ),
    inToonstudio: t(
      "studio-tiledoc-store.ts 의 설계 주석 기준입니다. 4000×6000 쪽에 40px 획 하나를 그려도 91.5MiB 레이어 비트맵 대신 1MiB 타일 하나만 할당하고, 스냅샷은 픽셀 복사 없이 타일 지도만 붙잡습니다. 저장이 끝난(markPersisted) 타일만 메모리에서 내릴 수 있게 해 되돌리기 데이터를 지우지 않습니다. WebGPU 타일 문서 엔진(studio-tiledoc-*)의 저장소입니다.",
      "Per the design notes in studio-tiledoc-store.ts: a 40 px stroke on a 4000x6000 page allocates one 1 MiB tile instead of a 91.5 MiB layer bitmap, and a snapshot retains the tile map without copying pixels. Only tiles already persisted (markPersisted) may be evicted from memory, so undo data is never destroyed. It is the store of the WebGPU tiled-document engine (studio-tiledoc-*).",
    ),
    chapters: ["brush-render-authority", "performance-budget"],
    atlasIds: ["tiled-document-copy-on-write"],
  },
  {
    id: "lut",
    category: "brush",
    term: t("LUT (조회표)", "LUT (lookup table)"),
    definition: t(
      "계산 결과를 미리 표로 만들어 두고, 실행 중에는 계산 대신 표에서 값을 찾아 쓰는 방식입니다.",
      "A table of results prepared in advance so that, at run time, values are looked up instead of calculated.",
    ),
    analogy: t(
      "구구단 표와 같습니다. 곱셈을 매번 계산하지 않고 표에서 찾으면 빠르고, 누가 찾아도 같은 답이 나옵니다.",
      "Like a times table: looking the answer up beats recomputing it, and everybody finds the same result.",
    ),
    inToonstudio: t(
      "밝기·레벨·커브 보정은 CPU 가 R·G·B 각 256칸(768칸)의 표를 한 번 만들고 GPU 는 조회만 해서, CPU 결과와 비트까지 같게 맞춥니다(render/studio-gpu-filter-apply.ts, studio-adjustment-layer-runtime.ts). 자격 검사에서 표까지 미리 만들면 슬라이더 한 번에 두 번씩 만드는 낭비가 생겨, 검사는 가볍게 두고 표는 실제 실행 때만 만듭니다(코드 주석).",
      "For brightness, levels and curves the CPU builds a table once (256 entries each for R, G and B, 768 in total) and the GPU only looks values up, matching the CPU result bit for bit (render/studio-gpu-filter-apply.ts, studio-adjustment-layer-runtime.ts). A code comment explains why the eligibility check stays light: building the table there too made it twice per slider tick, so the table is built only at execution.",
    ),
    chapters: ["brush-render-authority", "performance"],
    atlasIds: ["gpu-filter-lut-bit-identical"],
  },
  {
    id: "blend-modes",
    category: "brush",
    term: t("혼합 모드 (Blend mode)", "Blend modes"),
    definition: t(
      "위 레이어의 색을 아래 레이어와 어떻게 섞을지 정하는 규칙입니다. 곱하기·스크린·오버레이 같은 이름이 붙어 있습니다.",
      "Rules for how a layer's colour combines with what lies beneath: multiply, screen, overlay and so on.",
    ),
    analogy: t(
      "투명 필름을 겹치는 방식을 고르는 것과 같습니다. 그냥 얹기, 빛을 더하기, 그림자처럼 어둡게 곱하기가 모두 다른 결과를 냅니다.",
      "Like choosing how to stack transparent film: just lay it on, add light, or multiply like a shadow; each looks different.",
    ),
    inToonstudio: t(
      "붓 한 획은 수십 개의 스탬프라서 혼합 모드를 스탬프마다 적용하면 같은 물리가 반복돼 곱하기는 검정으로, 제외는 정확히 127 로 무너집니다(코드 주석의 실측). 그래서 BlendIsolationGroup 이 획 전체를 비트맵 한 장으로 굽고 나서 혼합 모드를 딱 한 번만 적용합니다. darken·lighten 만 반복해도 멱등이라 우연히 맞았습니다.",
      "A brush stroke is dozens of stamps, so applying a blend mode per stamp repeats the same maths and collapses multiply to black and exclusion to exactly 127 (measured, per a code comment). BlendIsolationGroup therefore bakes the whole stroke into one bitmap and applies the blend mode exactly once. Only darken and lighten had looked right, because they are idempotent.",
    ),
    chapters: ["brush-engine", "brush-pipeline"],
    atlasIds: ["layer-compositing-blend-flatten"],
  },
  {
    id: "spectral-mixing",
    category: "brush",
    term: t("분광 혼색 (Spectral mixing)", "Spectral mixing"),
    definition: t(
      "색을 RGB 숫자로 평균 내지 않고, 물감처럼 빛의 반사 특성(분광)으로 섞는 방식입니다. 파랑과 노랑이 회색이 아니라 초록이 됩니다.",
      "Mixing colour by how pigments reflect light (the spectrum) instead of averaging RGB numbers, so blue and yellow make green rather than grey.",
    ),
    analogy: t(
      "물감 두 색을 팔레트에서 섞는 것과 화면의 빛 두 개를 겹치는 것의 차이입니다. 앞의 것은 빛을 빼며(감산) 섞이고 뒤의 것은 더하며(가산) 섞입니다.",
      "The difference between mixing two paints on a palette and overlapping two lights on a screen: the first subtracts light, the second adds it.",
    ),
    inToonstudio: t(
      "studio-spectral-wgm-mix-v1.ts 는 libmypaint(ISC 라이선스)의 10밴드 가중 기하평균 안료 혼합기를 옮긴 것으로, 밴드 수는 STUDIO_SPECTRAL_WGM_BAND_COUNT = 10 입니다. 혼색 브러시(studio-wet-mix.ts)가 이 혼합기를 씁니다. 코드 주석은 Mixbox 자산을 쓰지 않는다고 적었고, 계산은 JS 엔진마다 결정적이지만 C 원본과 비트까지 같지는 않습니다.",
      "studio-spectral-wgm-mix-v1.ts ports libmypaint's 10-band weighted-geometric-mean pigment mixer (ISC licence), with STUDIO_SPECTRAL_WGM_BAND_COUNT = 10. The colour-mixing brush (studio-wet-mix.ts) uses it. A code comment states no Mixbox assets are involved, and results are deterministic per JS engine but not bit-equal to the C original.",
    ),
    chapters: ["brush-engine", "brush-pipeline"],
    atlasIds: ["spectral-color-mixing-mixbox"],
  },
  {
    id: "dithering",
    category: "brush",
    term: t("디더링 (밴딩 방지)", "Dithering (banding control)"),
    definition: t(
      "색 단계를 줄일 때 아주 작은 잡음을 섞어, 그라데이션의 계단(밴딩)이 눈에 띄지 않게 하는 기법입니다.",
      "A technique that adds a tiny amount of noise when reducing colour levels so gradient steps (banding) become invisible.",
    ),
    analogy: t(
      "계단 가장자리에 모래를 살짝 뿌려 단차를 부드럽게 만드는 것과 같습니다. 정보가 늘지는 않지만 눈에는 매끈한 경사로 보입니다.",
      "Like sprinkling sand on the edge of a stair so the step looks like a gentle slope: no new information, but it reads as smooth.",
    ),
    inToonstudio: t(
      "고비트로 합성해도 화면과 PNG 는 8비트라서, 양자화 직전에 1 LSB 미만의 결정적 디더(ordered Bayer 8×8·blue-noise·triangular, (seed, x, y, channel) 의 순수 함수, Math.random 금지)를 더하도록 구현·시험해 두었지만(studio-highbit-dither.ts), 제품 내보내기 경로에는 아직 연결되지 않았습니다. ‘다시 내보내면 바이트까지 같다’는 코드 주석의 설계 요건이며 제품에서 확인한 사실이 아닙니다.",
      "Compositing may run at high bit depth, but screen and PNG are 8-bit, so a deterministic sub-1-LSB dither (ordered Bayer 8x8, blue-noise and triangular, a pure function of (seed, x, y, channel), Math.random banned) was implemented and tested for use just before quantization (studio-highbit-dither.ts), but it is not yet wired into the product export path. That re-exporting gives identical bytes is a design requirement stated in a code comment, not a fact verified in the product.",
    ),
    chapters: ["brush-engine", "brush-pipeline"],
  },
  {
    id: "icc-profile",
    category: "brush",
    term: t("ICC 프로파일 (색 변환 설명서)", "ICC profile"),
    definition: t(
      "어떤 장치(모니터·프린터)가 색을 어떻게 표현하는지 적은 파일입니다. 이 설명서로 색을 장치에 맞게 바꿔 줍니다.",
      "A file describing how a device (monitor, printer) represents colour, used to convert colours to match that device.",
    ),
    analogy: t(
      "나라마다 다른 콘센트에 맞추는 변환 어댑터의 사용 설명서와 같습니다. 설명서가 있어야 어떤 어댑터가 맞는지 알 수 있습니다.",
      "Like the manual of a travel adapter: you need it to know which adapter fits which country's socket.",
    ),
    inToonstudio: t(
      "studio-canvaskit-icc-profile.ts 는 ICC 프로파일 읽기 전용 코어입니다. 헤더 128바이트와 태그를 길이 검사로 읽고, 행렬/TRC 방식 RGB 프로파일은 RGB→XYZ(D50) 변환으로 쓸 수 있습니다. LUT 방식(실제 CMYK 출력 프로파일 대부분)은 읽기만 하고 ‘변환 불가’ 사유를 돌려주므로, 이 저장소는 ‘ICC 기반 CMYK 교정’을 한다고 말하지 않습니다.",
      "studio-canvaskit-icc-profile.ts is a read-only ICC core. It reads the 128-byte header and tags with length checks, and matrix/TRC RGB profiles become usable RGB-to-XYZ (D50) transforms. LUT-based profiles (most real CMYK output profiles) are parsed but returned with an ‘unsupported’ reason, so this repository does not claim ICC-based CMYK proofing.",
    ),
    chapters: ["brush-render-authority", "quality"],
  },
  {
    id: "paper-tooth",
    category: "brush",
    term: t("종이결 모델 (Paper tooth)", "Paper tooth model"),
    definition: t(
      "종이 표면의 오돌토돌한 결을 계산에 넣어, 필압에 따라 안료가 앉는 자리가 달라지게 하는 모델입니다.",
      "A model that accounts for the bumpy grain of paper so pressure changes where pigment settles.",
    ),
    analogy: t(
      "사포 위에 크레용을 칠할 때와 매끈한 종이에 칠할 때가 다른 이유입니다. 세게 누를수록 오목한 곳까지 색이 들어갑니다.",
      "Why crayon looks different on sandpaper than on smooth paper: press harder and the colour reaches the valleys too.",
    ),
    inToonstudio: t(
      "새 획에는 종이 모델 키 ‘contact-tooth-v2’가 붙고, 레거시 획은 종이 모델 계산을 한 줄도 타지 않아 옛 그림이 바뀌지 않습니다(brush/studio-paper-tip-composition.ts). 유화 붓털 시뮬레이션은 8ms 고정 스텝으로 돌아 같은 입력이면 같은 결과를 냅니다(brush/studio-bristle-physics-oil-v1.ts).",
      "New strokes carry the paper-model key ‘contact-tooth-v2’, while legacy strokes skip paper-model maths entirely so old artwork never changes (brush/studio-paper-tip-composition.ts). The oil bristle simulation runs at a fixed 8 ms step, giving the same result for the same input (brush/studio-bristle-physics-oil-v1.ts).",
    ),
    chapters: ["brush-engine", "brush-pipeline"],
    atlasIds: ["material-physics-paper-tooth"],
  },
  {
    id: "renderer-role-ledger",
    category: "brush",
    term: t("렌더러 역할 원장", "Renderer role ledger"),
    definition: t(
      "그리기 엔진이 여러 개일 때 ‘누가 무엇의 책임자인지’를 한 표에 적어 두고, 어긋나면 테스트가 깨지게 하는 장부입니다.",
      "A single table recording which engine is responsible for what when there are many, with tests that fail if reality drifts from it.",
    ),
    analogy: t(
      "회사 조직도에 담당자 이름과 역할을 적어 두는 것과 같습니다. 같은 일을 두 사람이 맡거나 담당자가 없는 일이 생기면 바로 드러납니다.",
      "Like an org chart naming who owns what: if two people claim the same job or nobody owns one, it shows immediately.",
    ),
    inToonstudio: t(
      "엔진은 primary(권위 단독 소유)·provider(게이트형 선택)·reference(비교 전용)·lab(구현만 있고 제품 호출부 0건) 네 역할이며, lab 엔진은 앱 소스에 0건이어야 하고 import 스캐너가 강제합니다(docs/engines/renderer-roles.md, ADR-0019). 표는 스크립트(scripts/generate-studio-renderer-roles.mts)가 만듭니다.",
      "Engines take one of four roles: primary (sole owner of an authority), provider (gated, explicitly chosen), reference (comparison only) and lab (implemented but zero product call sites); lab engines must have zero references in app source, enforced by an import scanner (docs/engines/renderer-roles.md, ADR-0019). A script (scripts/generate-studio-renderer-roles.mts) generates the table.",
    ),
    chapters: ["brush-render-authority", "architecture"],
    atlasIds: ["renderer-role-ledger"],
  },
  {
    id: "gpu-device-loss",
    category: "brush",
    term: t("GPU 장치 손실 복구 (device lost)", "GPU device loss recovery"),
    definition: t(
      "드라이버 재시작이나 메모리 부족으로 GPU 연결이 갑자기 끊겼을 때 상태를 정리하고 복구를 시도하는 절차입니다.",
      "The procedure for tidying state and trying to recover when the GPU connection suddenly drops from a driver reset or memory pressure.",
    ),
    analogy: t(
      "작업 중 갑자기 정전이 났을 때 비상 발전기를 켜고 하던 일을 이어 가는 것과 같습니다. 같은 정전이 세 번 나면 그날은 수작업으로 전환합니다.",
      "Like switching on the backup generator and carrying on after a blackout; if it happens three times, you switch to manual work for the day.",
    ),
    inToonstudio: t(
      "studio-device-loss-recovery.ts 는 부작용 없는 상태 기계로, 손실이 나면 새 에포크(epoch)를 시작해 이전 GPU 자원을 무효로 보고 CPU 대기열을 새 장치에서 다시 실행합니다. 같은 세션에서 STUDIO_DEVICE_LOSS_PERMANENT_THRESHOLD = 3 번째 손실이 오면 GPU 사용을 포기합니다. 기본으로 다른 공급자를 몰래 고르지 않습니다.",
      "studio-device-loss-recovery.ts is a side-effect-free state machine: on loss it starts a new epoch, treats earlier GPU resources as invalid and replays the CPU queue on the new device. At STUDIO_DEVICE_LOSS_PERMANENT_THRESHOLD = 3 losses in a session it gives up on the GPU. By default it never silently picks a different provider.",
    ),
    chapters: ["brush-render-authority", "performance"],
    atlasIds: ["webgpu-tier-budget-recovery"],
  },
  {
    id: "kinsoku",
    category: "brush",
    term: t("금칙 처리 · 세로쓰기 (Kinsoku)", "Kinsoku and vertical writing"),
    definition: t(
      "문장부호나 닫는 괄호가 줄 맨 앞에 오지 않게 줄바꿈 위치를 고치는 조판 규칙(금칙 처리)과, 위에서 아래·오른쪽에서 왼쪽으로 글을 놓는 세로쓰기입니다.",
      "Typesetting rules that keep punctuation and closing brackets from starting a line (kinsoku), plus vertical writing that runs top to bottom and right to left.",
    ),
    analogy: t(
      "책 편집자가 ‘마침표가 새 줄의 첫 글자가 되면 어색하다’며 앞 단어를 하나 끌고 내려오는 교정과 같습니다.",
      "Like a book editor who, seeing a full stop stranded at the start of a line, drags the previous word down with it.",
    ),
    inToonstudio: t(
      "studio-vertical-text.ts 는 세로쓰기 조판 순수 코어로, 열 첫머리에 올 수 없는 문장부호를 되돌려 보내는 최소 금칙(VERTICAL_KINSOKU_BACKTRACK_LIMIT = 32)을 갖습니다. lettering/studio-kinsoku-line-break.ts 는 isKinsokuBreakAllowed·balanceRaggedLines 를 제공합니다. 다만 가로 말풍선의 줄바꿈에는 아직 연결되지 않았다고 도감 카드가 적습니다(상태: 설정됨).",
      "studio-vertical-text.ts is a pure vertical-typesetting core with minimal kinsoku that pushes punctuation barred from a column start back (VERTICAL_KINSOKU_BACKTRACK_LIMIT = 32). lettering/studio-kinsoku-line-break.ts provides isKinsokuBreakAllowed and balanceRaggedLines. The atlas card notes, however, that it is not yet wired into horizontal speech-bubble line breaking (status: configured).",
    ),
    chapters: ["on-device-translation", "brush-pipeline"],
    atlasIds: ["lettering-kinsoku-vertical", "intl-segmenter-korean-lines"],
  },
  {
    id: "undo-byte-budget",
    category: "brush",
    term: t("되돌리기 바이트 예산", "Undo history byte budget"),
    definition: t(
      "되돌리기 기록을 ‘몇 단계’가 아니라 ‘메모리를 몇 바이트 쓰는가’로 재서, 넘치면 오래된 단계부터 정리하는 방식입니다.",
      "Limiting undo history by how many bytes it holds rather than how many steps, trimming the oldest steps when it overflows.",
    ),
    analogy: t(
      "서랍에 ‘서류 200장까지’라고 정하는 대신 ‘무게 5kg까지’로 정하는 것과 같습니다. 서류 한 장이 종이일 수도, 두꺼운 도면일 수도 있기 때문입니다.",
      "Like capping a drawer at ‘5 kg’ instead of ‘200 sheets’: one sheet might be a slip of paper or a thick blueprint.",
    ),
    inToonstudio: t(
      "STUDIO_PAGES_HISTORY_RETAINED_BYTES_BUDGET = 192MiB 입니다(studio-history-retention-budget.ts). 코드 주석의 Chrome 실측으로 편집 한 번의 비용이 376B 에서 협업 문서의 6.46MiB 까지 갈려, 개수 상한 200 은 작은 편집엔 500배 보수적이고 큰 문서엔 1.29GiB 로 무력했습니다. 히스토리는 메모리 전용이라 버려도 저장된 작업은 잃지 않습니다.",
      "STUDIO_PAGES_HISTORY_RETAINED_BYTES_BUDGET is 192 MiB (studio-history-retention-budget.ts). Chrome measurements in the code comment show one edit costing anywhere from 376 B to 6.46 MiB for a collaborative document, so a count cap of 200 was 500 times too conservative for small edits and useless for large ones at 1.29 GiB. History is memory-only, so trimming never loses saved work.",
    ),
    chapters: ["performance-budget", "performance"],
    atlasIds: ["undo-history-byte-budget"],
  },
  {
    id: "blue-noise-moire-free",
    category: "brush",
    term: t("블루노이즈 무모아레 웹툰 스크린톤", "Blue-noise moire-free webtoon screentone"),
    definition: t(
      "규칙적인 격자 대신 고르게 흩어진 고주파 입자(블루노이즈)와 정수 픽셀 스냅·각도 검사를 써서, 확대·축소나 모바일 화면에서 물결 무늬(모아레)가 깨지지 않게 막는 톤 기법입니다.",
      "A screentone approach pairing evenly scattered high-frequency blue-noise patterns with integer pixel snapping and angle checks to prevent wavy moire interference on zoom or mobile screens.",
    ),
    analogy: t(
      "방충망 두 장을 겹쳐 보면 이상한 물결 무늬(모아레)가 생기지만, 고운 모래를 고르게 뿌린 종이는 겹쳐도 물결이 안 생깁니다. 규칙 간격을 깨뜨려 눈을 편하게 만드는 원리입니다.",
      "Overlapping two window screens creates distracting wavy bands (moire), whereas evenly dusted sand never does. Breaking strict grid alignment keeps tone shading clean at any zoom.",
    ),
    inToonstudio: t(
      "screentone/screentone-moire-guard.ts 가 겹톤 각도 차(권장 30°·위험 15° 미만)와 120%·150% 분수 DPR 의 정수 디바이스 픽셀 스냅을 검사하고, 비주기 모래망점(sand)을 지원합니다. studio-highbit-dither.ts 의 R2 블루노이즈 디더는 구현·시험돼 있으나 내보내기 경로에는 아직 연결 전입니다.",
      "screentone/screentone-moire-guard.ts checks stacked tone angle separation (30 deg ideal, under 15 deg high risk), snaps pitches to integer device pixels at fractional DPR (120%/150%) and pairs with non-periodic sand tones. R2 blue-noise dithering in studio-highbit-dither.ts is implemented and tested but not yet wired into export.",
    ),
    chapters: ["brush-engine", "brush-pipeline"],
    atlasIds: ["drawing-quality-gates"],
  },
  {
    id: "dirty-brush-pigment-pickup",
    category: "brush",
    term: t("더티 브러시 바닥색 픽업 · 연속 리본", "Dirty-brush pigment pickup & continuous ribbon"),
    definition: t(
      "붓이 지나간 자리의 바닥 물감을 붓끝에 묻혀(픽업) 현재 색과 섞어 끌고 가고, 둥근 도장 대신 이어진 리본 메시로 칠해 빠른 획에서도 구슬 끊김을 없애는 회화 브러시 기법입니다.",
      "A painting brush technique that picks up underlying canvas pigment onto the bristles to blend with fresh paint while sweeping a continuous ribbon mesh so fast strokes never bead into dots.",
    ),
    analogy: t(
      "물감이 마르기 전 캔버스 위를 붓으로 문지르면 아랫색이 붓털에 묻어 자연스럽게 꼬리를 끌고, 붓을 빨리 그어도 도장이 뚝뚝 찍히지 않고 리본처럼 매끈하게 이어지는 감각입니다.",
      "Dragging a brush across wet paint pulls the color underneath into a trailing tail, and sweeping fast leaves a smooth ribbon of bristles instead of a dotted chain of stamps.",
    ),
    inToonstudio: t(
      "brush/studio-wet-mix.ts 와 studio-oil-wet-into-wet.ts 가 도장마다 바닥색을 샘플링해 붓 웰(well)에 묻히고(pickup), 붓 로드 소모(loadDepletion)와 38·7·10밴드 쿠벨카-뭉크 분광 혼색을 적용합니다. 유화·수채 캐리어(studio-oil-ribbon-carrier.ts, studio-wet-ribbon-carrier.ts)는 획을 연속 리본 경로로 만듭니다.",
      "brush/studio-wet-mix.ts and studio-oil-wet-into-wet.ts sample canvas pixels into a brush well (pickup), deplete fresh paint along travel (loadDepletion) and blend with 38-, 7- or 10-band Kubelka-Munk spectral math. The oil and wet carriers (studio-oil-ribbon-carrier.ts, studio-wet-ribbon-carrier.ts) turn strokes into continuous ribbon geometry.",
    ),
    chapters: ["brush-engine", "brush-pipeline"],
    atlasIds: ["spectral-color-mixing-mixbox", "material-physics-paper-tooth"],
  },
  {
    id: "soa-shared-render-state-tree",
    category: "brush",
    term: t("SoA (Struct-of-Arrays) 공유 렌더 상태 트리", "SoA (Struct-of-Arrays) shared render-state tree"),
    definition: t(
      "레이어마다 모든 속성을 한 객체에 묶는 대신, 좌표·투명도·블렌드 모드 같은 같은 속성끼리 연속 TypedArray 열로 모아 캐시 적중과 스레드 공유를 높이는 자료구조입니다.",
      "A layout that stores each layer property (bounds, opacity, blend mode) in its own contiguous TypedArray column rather than per-layer objects, improving cache locality and shared-memory reads.",
    ),
    analogy: t(
      "학생마다 키·몸무게·성적을 개인 봉투에 따로 넣는 대신 ‘키 명단’과 ‘성적 명단’을 표 열별로 묶어 두면, 키 평균만 낼 때 다른 종이를 뒤적이지 않고 한 번에 훑을 수 있는 것과 같습니다.",
      "Like keeping separate lists for heights and scores instead of individual folders: when you only need heights, you scan one clean sheet without opening every folder.",
    ),
    inToonstudio: t(
      "wasm64-zero-copy-ipc/wasm64-soa-render-state-tree.ts 가 12개의 64B 정렬 TypedArray 열(layerIds·boundsX/Y/W/H·opacity·dirtyGeneration 등)을 공유 아레나에 직접 배치해 JSON 직렬화 없이 워커와 렌더러가 함께 읽습니다. 단위·통합 테스트로 검증됐습니다.",
      "wasm64-zero-copy-ipc/wasm64-soa-render-state-tree.ts lays out 12 64-byte-aligned TypedArray columns (layerIds, boundsX/Y/W/H, opacity, dirtyGeneration, etc.) inside the shared arena for zero-serialization worker/renderer reads, verified by unit tests.",
    ),
    chapters: ["brush-render-authority", "worker-architecture"],
    atlasIds: ["wasm64-zero-copy-ipc-arena", "renderer-role-ledger"],
  },
  {
    id: "xor-delta-rle-tile-undo",
    category: "brush",
    term: t("XOR-Delta + RLE 무손실 타일 언두 압축", "XOR-Delta + RLE lossless tile undo compression"),
    definition: t(
      "편집 전후 타일 픽셀의 비트 차이(XOR)만 구해 변화가 없는 0 구간을 길이 부호(RLE)로 묶고, 같은 패킷 하나로 Undo·Redo 를 0바이트 오차로 복원하는 압축 기법입니다.",
      "A lossless undo scheme that XORs before/after tile pixels, run-length encodes unchanged zero spans, and reuses the single symmetric packet for zero-diff Undo and Redo.",
    ),
    analogy: t(
      "문서를 고칠 때마다 전체 페이지를 복사해 쌓는 대신, ‘안 바뀐 줄 500칸 건너뛰고 501번째 칸만 이 글자로 뒤집기’라고 메모 한 장만 남기는 것과 같습니다. 같은 메모를 다시 적용하면 원래대로 돌아갑니다.",
      "Like jotting ‘skip 500 unchanged cells, flip cell 501’ instead of photocopying the whole sheet each edit; applying the same note again restores the original.",
    ),
    inToonstudio: t(
      "wasm64-zero-copy-ipc/wasm64-tile-undo-compressor.ts 와 Rust 커널 wasm_xor_tile_delta_bytes 가 256×256 RGBA8(256KiB) 타일을 단일 패스로 압축합니다. 테스트 실측에서 RAM 98.19% 절감(55.17×·0B 오차)을 확인했고 고엔트로피 타일은 raw-xor(+16B)로 보호합니다.",
      "wasm64-zero-copy-ipc/wasm64-tile-undo-compressor.ts and the Rust kernel wasm_xor_tile_delta_bytes compress 256x256 RGBA8 tiles in a single pass. Tests verified 98.19% RAM savings (55.17x, 0-byte diff) with a raw-xor (+16 B) cap on high-entropy tiles.",
    ),
    chapters: ["performance-budget", "storage"],
    atlasIds: ["wasm64-zero-copy-ipc-arena", "undo-history-byte-budget"],
  },
  {
    id: "skyline-texture-atlas-draw-batching",
    category: "brush",
    term: t("Skyline 동적 텍스처 아틀라스 & 드로우 콜 배칭", "Skyline dynamic texture atlas & draw-call batching"),
    definition: t(
      "여러 브러시 스탬프·글자 텍스처를 윗선 높이선(Skyline) 알고리즘으로 큰 텍스처 한 장에 빈틈없이 채우고, 겹치지 않는 같은 재질의 그리기를 한 번의 GPU 호출로 묶는 최적화입니다.",
      "An optimization packing brush stamps and glyphs tightly into one large texture with a Skyline algorithm, then merging non-overlapping draws sharing the same material into one GPU call.",
    ),
    analogy: t(
      "작은 스티커 백 장을 낱장으로 인쇄기에 넣으면 백 번 멈추지만, 큰 용지 한 장에 높이를 맞춰 빼곡히 배치(Skyline)하고 같은 색끼리 한 번에 찍어 내면(배칭) 작업이 훨씬 빨라지는 원리입니다.",
      "Feeding 100 loose stickers into a press stops 100 times, whereas arranging them tightly on one sheet (Skyline) and printing matching inks together (batching) cuts passes drastically.",
    ),
    inToonstudio: t(
      "wasm64-render-batcher/wasm64-texture-atlas-packer.ts 가 Skyline Bottom-Left(2048×2048·1px 거터·LRU 퇴거·더티 사각형 부분 업로드)를 구현하고, wasm64-draw-call-coalescer.ts 가 64B 고정 버퍼로 비겹침 드로우 콜을 병합합니다. 현재 모듈·테스트 검증을 마쳤습니다.",
      "wasm64-render-batcher/wasm64-texture-atlas-packer.ts implements Skyline Bottom-Left packing (2048x2048, 1 px gutter, LRU eviction, dirty-rect uploads) and wasm64-draw-call-coalescer.ts merges non-overlapping calls in a 64-byte buffer. Module tests are verified.",
    ),
    chapters: ["brush-engine", "performance-budget"],
    atlasIds: ["wasm64-drawing-core-extended-suite", "renderer-role-ledger"],
  },
  {
    id: "konva-vello-phase12-bridge",
    category: "brush",
    term: t("Konva 중립 인터페이스 분리 & Vello Phase 1-2 브리지", "Konva neutral decoupling & Vello Phase 1-2 runtime bridge"),
    definition: t(
      "기존 Konva 구체 타입 결합을 중립 계약으로 끊고, 가이드·말풍선·한국어 세로쓰기를 피처 플래그 뒤의 Vello 로 넘기며 오류 시 Konva 로 자동 폴백하는 무중단 전환 구조입니다.",
      "A staged migration decoupling concrete Konva types onto neutral contracts while routing guides, balloons and Korean vertical text to feature-flagged Vello with automatic Konva fallback.",
    ),
    analogy: t(
      "운영 중인 고속도로를 막지 않고 옆에 새 교량(Vello)을 놓은 뒤 시험 개통하고, 이상 신호가 뜨면 즉시 기존 차선(Konva)으로 되돌리는 무중단 교체 방식과 같습니다.",
      "Like building a new bridge (Vello) beside a live highway, opening it behind a switch, and instantly routing traffic back to the original lane (Konva) if any fault appears.",
    ),
    inToonstudio: t(
      "Phase 0 에서 비-JSX Konva 결합을 59→1파일(98.3%)로 줄이고 Wave 1–2 중복 18.88 MiB·opencv-js·pixi.js 를 분리했습니다. studio-vello-viewport-runtime-bridge.ts 가 안전 기본값 false 로 Phase 1-2 를 통합하며 GPU 유실 시 Konva 로 즉시 폴백합니다.",
      "Phase 0 cut non-JSX Konva coupling from 59 to 1 file (98.3%) and decoupled 18.88 MiB plus opencv-js and pixi.js. studio-vello-viewport-runtime-bridge.ts defaults to false and reverts immediately to Konva on GPU loss.",
    ),
    chapters: ["architecture", "brush-render-authority"],
    atlasIds: ["konva-vello-lineage-phase12-bridge", "renderer-role-ledger"],
  },
  {
    id: "rust-wave3-62-c-abi-dylib",
    category: "brush",
    term: t("Wave 2–3 안전 Rust 62 C-ABI WASM64 & ARM64 .dylib", "Wave 2–3 safe Rust 62 C-ABI WASM64 & ARM64 .dylib"),
    definition: t(
      "외부 크레이트 0개·#![deny(unsafe_code)] 안전 Rust 단일 소스로 PSB·SAH BVH·IK·오디오 DSP·벡터·슬라이서·CMYK 62개 C-ABI WASM 과 Apple Silicon 네이티브 .dylib 를 함께 빌드하는 코어입니다.",
      "A zero-crate #![deny(unsafe_code)] Rust core compiling PSB, SAH BVH, IK, Audio DSP, vector, slicer and CMYK kernels into both a 62-export WASM64 binary and an Apple Silicon native .dylib.",
    ),
    analogy: t(
      "한 권의 안전 설계도에서 웹 브라우저용 경량 엔진(301.37 KiB)과 맥 전용 네이티브 엔진(542.72 KiB)을 동시에 찍어 내어 어느 쪽에서 돌려도 똑같은 결과(0-diff)가 나오게 하는 제작 방식입니다.",
      "Like printing both a compact web engine (301.37 KiB) and a native macOS engine (542.72 KiB) from one verified blueprint so both produce identical 0-diff outputs.",
    ),
    inToonstudio: t(
      "crates/studio-wasm64-drawing-core 가 확장 WASM 301.37 KiB(62 exports·SIMD 4,145개)와 ARM64 .dylib 542.72 KiB(61 심볼·NEON 6,332개)를 빌드합니다. M2 Max 실측에서 벡터 15.32×/6.96×·블러 7.98×/4.07×·오디오 DSP 2.41×(0-diff)를 확인했습니다.",
      "crates/studio-wasm64-drawing-core builds a 301.37 KiB WASM (62 exports, 4,145 SIMD) and a 542.72 KiB ARM64 .dylib (61 symbols, 6,332 NEON). M2 Max 0-diff benchmarks hit 15.32x/6.96x vector, 7.98x/4.07x blur and 2.41x Audio DSP.",
    ),
    chapters: ["wasm-fixed-simd", "performance"],
    atlasIds: ["rust-wave23-native-wasm64-kernels", "wasm64-drawing-core-extended-suite"],
  },
  {
    id: "webtoon-smart-slicer-fnv64",
    category: "brush",
    term: t("웹툰 스마트 자동 슬라이서 & 64비트 FNV-1a 타일 중복제거", "Webtoon smart auto-slicer & 64-bit FNV-1a tile dedup"),
    definition: t(
      "세로로 긴 웹툰 원고에서 말풍선과 선화를 피해 빈 여백(gutter)을 찾아 자동 분할하고, 반복되는 256×256 픽셀 타일을 64비트 FNV-1a 해시로 묶어 용량과 처리 시간을 줄이는 커널입니다.",
      "A kernel that slices tall vertical webtoons along ink-free gutters to protect balloons and lineart, then deduplicates repeated 256x256 pixel tiles using 64-bit FNV-1a hashes.",
    ),
    analogy: t(
      "두루마리 만화를 가위로 자를 때 그림 위가 아니라 빈 칸만 골라 자르고, 똑같은 흰 여백 조각 백 장은 한 장만 보관해 번호표만 붙이는 제본 자동화입니다.",
      "Like cutting a long scroll only across blank margins so drawings stay intact, then keeping one copy of 100 identical white patches with index tags.",
    ),
    inToonstudio: t(
      "crates/studio-wasm64-drawing-core/src/webtoon_slicer_dedup_kernel.rs 가 행별 잉크 밀도로 안전 절단선을 계산하고 64비트 FNV-1a 타일 중복제거를 수행합니다. M2 Max 실측에서 Native 24.52×·WASM 19.82×(0-diff) 가속을 검증했습니다.",
      "webtoon_slicer_dedup_kernel.rs scores row ink density for safe cut lines and runs 64-bit FNV-1a tile deduplication, measured on Apple M2 Max at 24.52x Native and 19.82x WASM with 0-diff parity.",
    ),
    chapters: ["wasm-fixed-simd", "performance"],
    atlasIds: ["rust-wave23-native-wasm64-kernels", "export-engine-deterministic-pdf"],
  },
  {
    id: "webgpu-multipass-vram-aliasing",
    category: "brush",
    term: t("WebGPU 멀티패스 DAG & 일시 VRAM 에일리어싱", "WebGPU multi-pass DAG & transient VRAM aliasing"),
    definition: t(
      "렌더 패스 의존성을 DAG 로 위상 정렬해 불필요한 패스를 걷어 내고, 생존 구간이 겹치지 않는 중간 텍스처끼리 같은 VRAM 슬롯을 재사용하는 GPU 메모리 최적화 기법입니다.",
      "A GPU memory optimizer that topologically compiles render passes, prunes dead passes and aliases physical VRAM slots across non-overlapping transient textures.",
    ),
    analogy: t(
      "장면마다 소품 창고를 따로 빌리지 않고 앞 촬영이 끝난 창고를 다음 팀이 이어 쓰며, 초대형 원고는 화면에 보이는 조각(1024px 타일)만 꺼내 놓는 무대 운영 방식입니다.",
      "Like reusing the same prop warehouse across non-overlapping film shoots while loading only visible 1024 px tiles of giant scrolls.",
    ),
    inToonstudio: t(
      "wasm64-multipass-copilot-ledger/webgpu-multipass-render-graph.ts 가 Dead-Pass Culling·RAW/WAR/WAW 배리어와 구간 에일리어싱으로 표준 5단계 VRAM 을 352→144 MiB(59.09%), 8K×16K 가상 타일을 97.76% 절감했습니다.",
      "wasm64-multipass-copilot-ledger/webgpu-multipass-render-graph.ts cuts 5-stage transient VRAM from 352 to 144 MiB (59.09%) and 8K×16K vertical tiled memory by 97.76% with automatic hazard barriers.",
    ),
    chapters: ["brush-render-authority", "performance"],
    atlasIds: ["webgpu-multipass-render-graph-vram-aliasing"],
  },
  {
    id: "wet-paper-lbm-v2-curved-msdf-sfx",
    category: "brush",
    term: t("Wet Paper LBM v2 & 곡선 3중 외곽선 MSDF SFX", "Wet Paper LBM v2 & curved triple-outline MSDF SFX"),
    definition: t(
      "한지·황목·중목 종이 결 위에서 격자 볼츠만(LBM)으로 수채 모세관 번짐·입상화를 계산하고, 가변 폰트 3중 외곽선 효과음을 베지어·방사 곡선에 배치하는 0-토큰 작화 커널입니다.",
      "Zero-token drawing kernels simulating capillary watercolor wicking/granulation across three paper grains via LBM alongside curved triple-outline variable-axis MSDF sound effects.",
    ),
    analogy: t(
      "진짜 한지에 물감이 스며 마르는 물리 법칙과, 휘어진 액션 동선을 따라 굵기가 변하는 만화 효과음 식자를 브라우저 안에서 클라우드 토큰 없이 바로 그리는 작업대입니다.",
      "Like combining real hanji watercolor wicking with curved, three-outline comic sound effects directly inside the browser at zero tokens.",
    ),
    inToonstudio: t(
      "wasm64-supergap-drawing-3d/ 의 wet-paper-lbm-v2.ts·curved-msdf-sfx.ts·wet-paper-msdf-sfx-autoflat.ts 가 3종 종이 WGSL/CPU 파리티, 한글 베지어·영문 방사 SFX, 열린 선화 갭 닫기 오토 플랫팅을 검증했습니다.",
      "wet-paper-lbm-v2.ts, curved-msdf-sfx.ts and wet-paper-msdf-sfx-autoflat.ts verify 3-paper WGSL/CPU parity, Hangul Bezier & EN radial SFX and zero-token vector gap auto-flatting.",
    ),
    chapters: ["brush-engine", "brush-render-authority"],
    atlasIds: ["supergap-wet-paper-msdf-autoflat-tremor-upscaler"],
  },
  {
    id: "lineart-superres-haptic-tremor-fft",
    category: "brush",
    term: t("8Hz 손떨림 FFT 보정 · 링잉 0 선화 초해상도 · 햅틱 마찰", "8 Hz tremor FFT, ringing-free lineart SR & haptic friction"),
    definition: t(
      "초기 스트로크를 FFT 로 분석해 8Hz 손떨림 대역만 One-Euro/칼만으로 눌러 90° 모서리를 살리고, 링잉 0건 2×/4× 선화 확대와 4종 지면 마찰 촉각을 묶은 드로잉 보조입니다.",
      "A drawing suite calibrating 8 Hz hand-tremor FFT cutoffs (>45% RMS drop while keeping 90° corners), ringing-free 2×/4× lineart upscaling and 4-paper haptic friction.",
    ),
    analogy: t(
      "작가 손떨림 주기만 골라 잡아 주는 펜 안정기, 번짐 없이 선을 또렷하게 키우는 확대경, 켄트지·캔버스 결을 손끝에 전하는 촉각 종이판을 함께 쓰는 구성입니다.",
      "Like pairing a personalized pen stabilizer, a halo-free ink magnifier and tactile paper textures on one offline canvas.",
    ),
    inToonstudio: t(
      "tremor-fft-calibrator.ts(RMS >45% 저감), adaptive-brush-dynamics-and-lineart-upscaler.ts(링잉 헤일로 0), HapticBrushFrictionEngine(켄트·세목·중목·캔버스 배럴롤)을 단위 테스트로 검증했습니다.",
      "Verified across tremor-fft-calibrator.ts (>45% RMS drop), adaptive-brush-dynamics-and-lineart-upscaler.ts (0 ringing halos) and HapticBrushFrictionEngine (4 paper substrates).",
    ),
    chapters: ["brush-engine", "browser-local-compute"],
    atlasIds: ["supergap-wet-paper-msdf-autoflat-tremor-upscaler"],
  },
  {
    id: "kubelka-munk-dcel-planar-fill",
    category: "brush",
    term: t("8밴드 Kubelka-Munk 분광 혼색 & 반간선(DCEL) 평면 채색", "8-band Kubelka-Munk pigment mix & half-edge DCEL planar fill"),
    definition: t(
      "400~700nm 8개 파장 대역의 흡수·산란비(K/S)로 탁함 없는 감산 혼색을 계산하고, 교차 선화를 반간선 평면 그래프(DCEL)로 쪼개 1px 흰 틈 없이 면을 채우는 작화 기법입니다.",
      "Computes vibrant subtractive pigment mixtures across 8 spectral bands (400–700 nm) and fills intersecting vector strokes with zero-gap half-edge DCEL planar faces.",
    ),
    analogy: t(
      "빛이 아니라 실제 물감 가루의 반사율을 계산하는 팔레트와, 펜선 교차점을 지도 행정구역처럼 정확히 따라가 테두리 틈새로 색이 남지 않는 채색 도구의 결합입니다.",
      "Like pairing a physical pigment-reflectance palette with a topological map filler that leaves no halo gaps along crisp ink boundaries.",
    ),
    inToonstudio: t(
      "wasm64-wave11-apex/saccade-kubelka-homography.ts(8밴드 K/S 혼색)와 wasm64-wave15-structural/planar-map-diffusion-curves.ts(DCEL 채색·확산 곡선), Wave 6 smin 말풍선 조각기를 단위 테스트로 검증했습니다.",
      "Unit-verified across saccade-kubelka-homography.ts (8-band K/S mix), planar-map-diffusion-curves.ts (DCEL fill & diffusion curves) and Wave 6 smin SDF balloon sculpting.",
    ),
    chapters: ["brush-engine", "brush-render-authority"],
    atlasIds: ["wave11-to-15-spectral-dcel-blue-noise", "wave5-to-8-sdf-kalman-moire-arap"],
  },
  {
    id: "hdr-pq-gainmap-spot-foil-colorscript",
    category: "brush",
    term: t("선택적 PQ HDR 게인맵 · ±0.1mm 별색 박 분판 & 60컷 컬러 스크립트", "Selective PQ HDR gain-map, ±0.1 mm spot-foil plates & 60-cut color-script"),
    definition: t(
      "말풍선 백색은 203 nits에 고정한 채 이펙트만 1,000 nits HDR 게인맵으로 올리고, 단행본 ±0.1mm 금·은박 분판과 60컷 회차 OKLCH 색온도 조화를 함께 다루는 마감 파이프라인입니다.",
      "Anchors diffuse paper white at 203 nits while boosting VFX to 1,000-nit HDR gain-maps, paired with ±0.1 mm spot-foil press plates and 60-cut OKLCH episode color-scripts.",
    ),
    analogy: t(
      "원고지 바탕에는 눈이 편한 독서등을 켜 두면서 마법 광선에만 스포트라이트를 비추고, 단행본 표지에는 정밀 금박 동판과 17³ 색보정 필름을 함께 맞추는 마감 공정입니다.",
      "Like keeping gentle reading light on comic paper while spotlighting magic effects on HDR displays and aligning precision gold-foil dies for print.",
    ),
    inToonstudio: t(
      "hdr-pq-ribbon-brush-lookat.ts(ST.2084·ISO-21496-1·r·κ<0.85 리본 붓), wang-tile-assistant-sheet-spot-foil.ts(±0.1mm 별색 판), episode-oklch-color-script.ts 및 B4/A4 톰보·17³ LUT를 검증했습니다.",
      "Verified across hdr-pq-ribbon-brush-lookat.ts, wang-tile-assistant-sheet-spot-foil.ts (±0.1 mm foil trap), episode-oklch-color-script.ts and Wave 19 B4/A4 crop-marks + 17³ LUT.",
    ),
    chapters: ["brush-engine", "licenses"],
    atlasIds: ["wave21-to-23-spot-foil-hdr-color-script", "wave16-to-19-gpen-print-cropmarks-lut"],
  },
];
