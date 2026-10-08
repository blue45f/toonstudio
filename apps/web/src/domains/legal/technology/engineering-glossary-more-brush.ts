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
      "스탬프 브러시 한 획의 붓 자국은 STUDIO_STAMP_BRUSH_MAX_DABS = 100,000 개가 상한입니다(brush/studio-brush-stamp-engine.ts). 번짐·혼색 같은 효과도 붓 자국 하나마다 ‘바닥색을 묻히고 얹는’ 모델로 계산합니다(brush/studio-wet-mix.ts). 질감 변형은 붓 자국 번호에서 만든 결정적 해시(studioDabBatchHash)로 골라, 같은 번호는 늘 같은 변형입니다.",
      "A stamp-brush stroke is capped at STUDIO_STAMP_BRUSH_MAX_DABS = 100,000 dabs (brush/studio-brush-stamp-engine.ts). Effects such as smudge and colour mixing are modelled per dab: pick up the colour underneath, then deposit (brush/studio-wet-mix.ts). Texture variants are chosen by a deterministic hash of the dab index (studioDabBatchHash), so the same index always gets the same variant.",
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
      "한 프레임 가까이를 줄이는 대신 페이지와 정확히 같은 순간에 표시된다는 보장이 사라집니다. 그래서 쓰고 곧 버리는 라이브 잉크 오버레이에만 켜고, 되읽기(getImageData)·내보내기를 하는 확정 레이어는 동기 상태로 둡니다(studio-lowlatency-surface-policy.ts). 브라우저가 요청을 실제로 들어줬는지 확인하는 점검도 있고, willReadFrequently 와 함께 쓰는 조합은 거절합니다.",
      "It can remove nearly a frame of latency but loses the guarantee of appearing atomically with the page. So it is enabled only on live ink overlays that are written and discarded, while committed layers that are read back (getImageData) or exported stay synchronized (studio-lowlatency-surface-policy.ts). A probe checks whether the browser actually granted it, and combining it with willReadFrequently is rejected.",
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
      "고비트로 합성해도 화면과 PNG 는 8비트라서, 마지막 양자화 직전에 1 LSB 미만의 결정적 잡음을 더합니다(studio-highbit-dither.ts). 모드는 ordered(Bayer 8×8)·blue-noise·triangular 세 가지이고, 결과는 (seed, x, y, channel) 의 순수 함수입니다. Math.random 을 금지해 같은 문서를 다시 내보내면 바이트까지 같습니다.",
      "Compositing may run at high bit depth, but screen and PNG are 8-bit, so a deterministic sub-1-LSB noise is added just before final quantization (studio-highbit-dither.ts). Modes are ordered (Bayer 8x8), blue-noise and triangular, and the output is a pure function of (seed, x, y, channel). Math.random is banned, so re-exporting the same document gives identical bytes.",
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
];
