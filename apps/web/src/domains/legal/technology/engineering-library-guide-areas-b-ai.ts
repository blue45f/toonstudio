import { t } from "./engineering-library-guide-kit";
import type { LibraryGuideArea } from "./engineering-library-guide-types";

/**
 * 라이브러리 해설 · 영역 6 "기기 안의 AI".
 * 사실의 정본은 오픈소스 지도(onnxruntime-web·mediapipe·opencv-js·transformers-js 행), docs/operations/free-ai-runtime.md,
 * 모델 자산 옆 *.LICENSE.md 와 코드 머리 주석이다. 기준일 2026-10-08.
 */

const CREATOR = "apps/web/src/domains/creator";
const RESOURCES = "apps/web/src/domains/creator-resources";

export const LIBRARY_AREA_AI_ON_DEVICE: LibraryGuideArea = {
  id: "ai-on-device",
  number: 6,
  title: t("기기 안의 AI", "AI on your device"),
  question: t("서버 없이 AI를 돌리는 부품과 고르는 기준은?", "Which parts run AI without a server, and how do we choose?"),
  oneLine: t(
    "그림 한 장으로 끝나는 작은 모델은 기기에서, 글을 쓰는 큰 모델은 무료 공급자 길로 보냅니다.",
    "Small models that finish with one image run on the device; large text models go through the free-provider route.",
  ),
  easy: t(
    "밀키트를 집에서 데워 먹는 것과 같습니다. 처음에 재료(모델 파일)를 한 번 받아 와야 하지만, 그림이 식당(서버)으로 나가지 않고 키도 한도도 필요 없습니다. 큰 요리는 식당에 맡기되, 무료 시식 코너부터 들릅니다.",
    "It is like heating a meal kit at home. You fetch the ingredients (model files) once, but your drawing never goes out to the restaurant (a server) and no key or quota is needed. Big dishes still go to the restaurant, and the free-sample corner comes first.",
  ),
  designWhy: [
    {
      title: t("기기에서 끝낼 수 있는 일은 기기에서", "Do on the device what the device can finish"),
      body: t(
        "그림 한 장을 받아 한 장을 돌려주는 작은 모델(채색·배경 제거·선 추출·업스케일·애니풍)과 웹캠 자세·윤곽선 같은 가벼운 일은 기기에서 돌립니다. 서버 GPU 비용과 업로드가 사라지고, 큰 언어·확산 모델은 클라우드 경로(내 키·무료 공급자)에 맡깁니다.",
        "Small models that take one image and return one (colorizing, cutout, line extraction, upscaling, anime style) and light jobs such as webcam pose or contour tracing run on the device. That removes server GPU cost and uploads, while large language and diffusion models go to cloud routes (your own key or free providers).",
      ),
    },
    {
      title: t("런타임은 같은 출처 파일로, 모델은 해시로 확인", "Same-origin runtimes, hash-checked models"),
      body: t(
        "운영 CSP가 외부 스크립트·WASM 실행을 막아서, ONNX·MediaPipe 런타임은 Vite가 해시를 붙인 같은 출처 파일로 둡니다. ONNX 모델은 SHA-256이 등록값과 다르면 거절하고, 모두 쓰는 순간에 지연 로드합니다.",
        "The production CSP blocks external script and WASM execution, so the ONNX and MediaPipe runtimes are same-origin files hashed by Vite. An ONNX model is rejected if its SHA-256 differs from the registered value, and everything loads lazily at the moment of use.",
      ),
    },
    {
      title: t("무료 AI는 허용 목록과 하루 예산으로 닫는다", "Free AI is fenced by an allowlist and a budget"),
      body: t(
        "무료로 검토된 공급자 주소·모델만 자동 경로에 넣고, 호출 직전에 하루(UTC) 예산을 예약합니다. 유료 키는 사용자가 허락해야 순서에 들어오고, 무료가 소진돼도 몰래 유료로 넘어가지 않습니다.",
        "Only provider addresses and models reviewed as free join the automatic route, and the daily (UTC) budget is reserved right before each call. A paid key joins the order only when the user allows it, and nothing slips into paid use when the free allowance runs out.",
      ),
    },
    {
      title: t("애매한 실패는 다른 공급자로 다시 보내지 않는다", "An unclear failure is not resent elsewhere"),
      body: t(
        "402·429처럼 호출 전에 분명히 거절된 경우만 다음 키·모델로 넘어갑니다. 네트워크 오류·타임아웃·5xx는 그대로 알립니다. 첫 공급자가 이미 요청을 받았을 수 있어 같은 요청을 두 번 보내지 않습니다.",
        "Only a clear refusal before the call, such as 402 or 429, moves on to the next key or model. Network errors, timeouts and 5xx are reported as they are. The first provider may already have accepted the request, so the same request is never sent twice.",
      ),
    },
  ],
  diagram: {
    id: "ai-on-device-diagram",
    kind: "graph",
    title: t("AI 요청이 갈라지는 길", "Where an AI request goes"),
    caption: t(
      "작은 이미지 모델은 기기 안에서 끝내고, 글을 쓰는 큰 모델은 허용 목록과 예산을 거쳐 무료 공급자로 보냅니다.",
      "Small image models finish on the device, while large text models pass an allowlist and a budget on the way to free providers.",
    ),
    alt: t(
      "AI 기능마다 정해진 길로 갑니다. 사용자가 기기 안 패널(채색·배경 제거 등)을 고르면 ONNX Runtime Web, MediaPipe, OpenCV.js, Transformers.js 중 하나가 이 기기에서 계산해 서버 비용이 들지 않습니다(채색은 클라우드 경로가 있으면 그쪽이 우선). 글이나 대사 같은 요청은 무료 AI 공급자 길로 가며, 허용 목록과 하루 예산을 거치고, 유료 키는 사용자가 허락한 뒤에만 이 길에 들어옵니다.",
      "Each AI feature goes down a fixed route. When the user picks an on-device panel (colorizing, cutout and so on), ONNX Runtime Web, MediaPipe, OpenCV.js or Transformers.js computes on this device with no server cost (colorizing prefers a cloud route when one is available). Requests such as text or dialogue take the free-provider route through an allowlist and a daily budget, and a paid key joins this route only after the user allows it.",
    ),
    nodes: [
      { id: "request", label: t("AI 기능 요청", "AI request"), sub: t("채색·번역·대사 도움 등", "Colorize, translate, dialogue"), tone: "neutral", shape: "pill", at: [0, 2] },
      { id: "decide", label: t("기기 안 기능?", "On-device feature?"), tone: "warn", shape: "diamond", at: [1, 2] },
      { id: "onnx", label: t("ONNX Runtime", "ONNX Runtime"), sub: t("채색·배경·선·업스케일", "Color, cutout, upscale"), tone: "ai", at: [2, 0] },
      { id: "mediapipe", label: t("MediaPipe", "MediaPipe"), sub: t("웹캠 자세·배경 분리", "Webcam pose, cutout"), tone: "ai", at: [2, 1] },
      { id: "opencv", label: t("OpenCV.js", "OpenCV.js"), sub: t("윤곽선 → 벡터 변환", "Contours to vectors"), tone: "ai", at: [2, 2] },
      { id: "transformers", label: t("Transformers.js", "Transformers.js"), sub: t("검색어 번역(모델 필요)", "Search translation"), tone: "ai", at: [2, 3] },
      { id: "local", label: t("이 기기에서 계산", "Computed here"), sub: t("서버 AI 비용 0", "No server AI cost"), tone: "good", at: [4, 2] },
      { id: "approval", label: t("유료 키 승인", "Paid-key consent"), sub: t("허락한 뒤에만", "Only if allowed"), tone: "warn", at: [0, 4] },
      { id: "route", label: t("무료 AI 공급자 길", "Free provider route"), sub: t("허용 목록 → 하루 예산", "Allowlist, then budget"), tone: "server", at: [1, 4] },
      { id: "providers", label: t("공급자 무료 한도", "Provider free tiers"), sub: t("Gemini · Groq 등", "Gemini, Groq and more"), tone: "external", shape: "cloud", at: [2, 4] },
    ],
    edges: [
      { from: "request", to: "decide" },
      { from: "decide", to: "onnx", label: t("작은 모델", "small model") },
      { from: "decide", to: "mediapipe" },
      { from: "decide", to: "opencv" },
      { from: "decide", to: "transformers" },
      { from: "onnx", to: "local" },
      { from: "mediapipe", to: "local" },
      { from: "opencv", to: "local" },
      { from: "transformers", to: "local" },
      { from: "decide", to: "route", label: t("글·대사", "text") },
      { from: "approval", to: "route", style: "dashed", label: t("허락하면", "if allowed") },
      { from: "route", to: "providers", label: t("무료만", "free only") },
    ],
  },
  libraries: [
    {
      id: "onnx-runtime-web",
      name: "ONNX Runtime Web",
      kind: "engine",
      package: "onnxruntime-web",
      oneLine: t("AI 모델 파일을 서버 없이 내 기기에서 실행하는 엔진", "An engine that runs AI model files on your own device, no server needed"),
      usedFor: t(
        "채색, 배경 제거, 사진에서 선 추출, 4배 업스케일, 애니풍 변환을 기기 안 모델 6개로 처리합니다. 그림은 서버로 나가지 않습니다.",
        "Handles colorizing, cutout, line extraction from photos, 4x upscaling and anime-style conversion with six on-device models. The drawing never goes to a server.",
      ),
      why: t(
        "그림 한 장을 받아 한 장을 돌려주는 작은 모델은 기기에서 돌려 서버 GPU 비용과 업로드를 없앴습니다. 배포본 라이선스가 MIT·BSD-3-Clause·Apache-2.0인 모델을 골랐고(학습 데이터 출처는 모델별 LICENSE.md에 기록), 크기·속도·품질 한계는 받아들였습니다.",
        "Small models that take one picture and return one run on the device, which removes server GPU cost and uploads. We chose models whose published license is MIT, BSD-3-Clause or Apache-2.0 (training-data provenance is recorded per model in its LICENSE.md); size, speed and quality limits are accepted.",
      ),
      alternatives: t(
        "서버 GPU 추론은 그림이 서버로 가고 GPU 비용이 운영자에게 남습니다(속도는 이 저장소에서 비교하지 않았습니다). 그래서 큰 언어·확산 모델은 클라우드 경로(내 키)에 맡깁니다.",
        "Server GPU inference sends the drawing to a server and leaves the GPU bill with the operator (speed was not compared in this repository). So large language and diffusion models are left to the cloud route (your own key).",
      ),
      cost: t(
        "첫 사용 때 런타임 WASM 약 26.8MB와 모델(채색은 79.3MB)을 내려받습니다. WebGPU가 안 되면 느린 WASM(CPU)으로 넘어가고, 채색은 512×512 고정에 색이 옅어 클라우드 채색이 있으면 그쪽이 우선입니다.",
        "On first use it downloads about 26.8 MB of runtime WASM and the model (79.3 MB for colorizing). Without WebGPU it falls back to slower WASM on the CPU, and colorizing is fixed at 512x512 with pale color, so cloud colorizing wins when it is available.",
      ),
      paths: [
        `${CREATOR}/studio-onnx-inference-provider.ts`,
        `${CREATOR}/studio-onnx-runtime-assets.ts`,
        `${CREATOR}/studio-onnx-model-registry.ts`,
      ],
      license: "MIT",
      status: "live",
      mapRowId: "onnxruntime-web",
      atlasIds: ["onnx-runtime-web-inference"],
    },
    {
      id: "mediapipe-tasks-vision",
      name: "MediaPipe Tasks Vision",
      kind: "library",
      package: "@mediapipe/tasks-vision",
      oneLine: t("웹캠 영상에서 얼굴·손·몸 자세를 읽는 구글의 비전 도구", "Google's vision toolkit that reads face, hands and body pose from a webcam"),
      usedFor: t(
        "웹캠이나 사진의 자세로 VRM 마네킹을 움직이고, 인물 배경을 분리하고, 아바타 참고 이미지를 비슷한 순서로 추천합니다.",
        "Moves a VRM mannequin from the pose in a webcam or photo, separates a person from the background, and ranks avatar reference images by similarity.",
      ),
      why: t(
        "웹캠 영상과 사진을 서버에 올리지 않고 기기 안에서 읽으려는 요구에 맞습니다. 운영 CSP가 외부 WASM 실행을 막아서, SIMD 지원을 확인한 뒤 같은 출처의 해시 파일을 한 번만 불러옵니다.",
        "It meets the need to read webcam video and photos on the device without uploading them. The production CSP blocks external WASM, so after checking SIMD support it loads a same-origin hashed file exactly once.",
      ),
      cost: t(
        "WASM 약 11.2MB는 같은 출처에서 받고, 모델 파일은 실행할 때 구글 저장소에서 받습니다(SHA-256 고정은 임베더 1개뿐). '전부 로컬'이 아니며 대안과 비교한 문서는 찾지 못했습니다.",
        "About 11.2 MB of WASM comes from our origin, while model files are downloaded from Google storage at run time (only the embedder is pinned by SHA-256). It is not fully local, and we found no document comparing alternatives.",
      ),
      paths: [
        `${CREATOR}/studio-mediapipe-vision-assets.ts`,
        `${CREATOR}/vrm/studio-vrm-webcam-tracking.ts`,
        `${CREATOR}/studio-bg-remove.ts`,
      ],
      license: "Apache-2.0",
      status: "live",
      mapRowId: "mediapipe",
      atlasIds: ["mediapipe-webcam-pose"],
    },
    {
      id: "opencv-js",
      name: "OpenCV.js",
      kind: "library",
      package: "@techstark/opencv-js",
      oneLine: t("널리 쓰이는 컴퓨터 비전 도구(OpenCV)를 브라우저용으로 옮긴 것", "The widely used computer-vision toolkit (OpenCV) ported to the browser"),
      usedFor: t(
        "이미지→벡터 변환에서 색으로 나눈 마스크의 윤곽선을 찾아 경로로 바꿉니다. 새 트레이싱 라이브러리 없이 이 커널을 재사용합니다.",
        "In image-to-vector conversion it finds contours in color-split masks and turns them into paths, reusing this kernel instead of a new tracing library.",
      ),
      why: t(
        "마스크→경로 커널이 이미 있어 새 트레이싱 라이브러리를 들이지 않았습니다. 크기와 메모리 회수 때문에 동적 import로만 불러와 번들 크기를 통제합니다(후보 문서: Worker 격리·지연 로드).",
        "A mask-to-path kernel already existed, so no new tracing library was added. Because of its size and memory reclaim it is reached only through dynamic import to control bundle size (the candidate document: Worker isolation and lazy loading).",
      ),
      alternatives: t(
        "Potrace 계열 JS 포트는 GPL이라 상용 안전성에서 제외하고, VTracer(WASM·MIT)는 번들·락파일 비용이 커서 1차 구현에서 미뤘습니다(코드 주석).",
        "Potrace-family JS ports are GPL and were excluded for commercial safety, and VTracer (WASM, MIT) was postponed from the first version for its bundle and lockfile cost (code comment).",
      ),
      cost: t(
        "설치본 opencv.js가 약 13.3MB라 지연 로드합니다. OpenCV 객체는 만든 역순으로 지워 메모리 누수를 막고 입력은 한 변 8,192px로 제한합니다. 스마트 선택 Worker 경로는 화면에 연결되지 않았습니다.",
        "The installed opencv.js is about 13.3 MB, so it loads lazily. Every OpenCV object is deleted in reverse creation order to prevent leaks, and input is capped at 8,192 px per side. The smart-selection Worker path is not wired into a screen.",
      ),
      paths: [
        `${CREATOR}/studio-image-trace.ts`,
        `${CREATOR}/studio-opencv-selection.ts`,
        `${CREATOR}/StudioRasterVectorizeButton.tsx`,
      ],
      license: "Apache-2.0",
      status: "live",
      mapRowId: "opencv-js",
      atlasIds: ["selection-tools-grabcut"],
    },
    {
      id: "transformers-js",
      name: "Transformers.js",
      kind: "library",
      package: "@huggingface/transformers",
      oneLine: t("작은 AI 모델을 브라우저에서 돌리는 허깅페이스의 JavaScript 라이브러리", "Hugging Face's JavaScript library for running small AI models in the browser"),
      usedFor: t(
        "리서치 데스크에서 한글 검색어를 영어로 옮기는 번역 모델(OPUS-MT)을 기기 안에서 돌립니다. 모델이 없으면 사전과 원문으로 검색합니다.",
        "Runs the translation model (OPUS-MT) that turns Korean search terms into English on the device in the research desk. Without the model, search falls back to a dictionary and the original text.",
      ),
      why: t(
        "번역 API에 검색어를 보내지 않고 서버 AI 비용도 쓰지 않으려는 요구에 맞습니다. 모델은 8비트 양자화본(약 123MB)을 우리 서버에서만 받게 하고, 운영 CSP 때문에 원격 모델 다운로드는 껐습니다.",
        "It meets the need to avoid sending search terms to a translation API and to spend no server AI cost. The 8-bit quantized model (about 123 MB) is fetched only from our own server, and remote model downloads are off because of the production CSP.",
      ),
      cost: t(
        "모델 파일은 저장소에 없어 배포 때 따로 두어야 켜집니다. 배치 스크립트를 찾지 못해 실제 배포에서 켜졌는지 확인하지 못했고, 운영 CSP가 번역 런타임을 막을 수 있어 스테이징 확인이 남았습니다.",
        "The model files are not in the repository and must be placed at deploy time to switch it on. We found no placement script, so whether it is on in the real deployment is unverified, and a staging check remains for a possible CSP block.",
      ),
      paths: [`${RESOURCES}/research-query-mt.ts`, `${RESOURCES}/research-query-translation.ts`],
      license: "Apache-2.0",
      status: "configured",
      mapRowId: "transformers-js",
      atlasIds: ["transformers-js-translation"],
    },
    {
      id: "free-first-ai-routing",
      name: "Free-first AI routing",
      kind: "service",
      oneLine: t("돈이 드는 길은 닫고 무료로 확인된 공급자만 순서대로 부르는 길 안내", "A route guide that keeps paid paths closed and calls only providers verified as free, in order"),
      usedFor: t(
        "글·대사·번역·콘티 도움 요청을 서버 공유 풀 또는 사용자 무료 키로 보냅니다. 호출 전에 하루 예산을 예약하고 결과는 '제안'으로만 보여 줍니다.",
        "Sends text, dialogue, translation and storyboard help requests to the shared server pool or the user's free key. The daily budget is reserved before the call and the result is shown only as a proposal.",
      ),
      why: t(
        "AI는 호출마다 요금이 붙을 수 있어 무료로 확인된 주소·모델만 자동 경로에 넣고, 유료 키는 사용자가 허락해야 쓰입니다. 무료가 소진돼도 몰래 유료로 가지 않습니다.",
        "An AI call can carry a fee, so only addresses and models verified as free join the automatic route, and a paid key is used only when the user allows it. Nothing slips into paid use when the free allowance runs out.",
      ),
      alternatives: t(
        "유료 모델 하나로 통일하면 사용량만큼 비용이 늘고, AI 게이트웨이 한 곳에 맡기면 그 서비스가 멈출 때 같이 멈춥니다. 그래서 공급자 직접 키와 서버 공유 풀을 함께 둡니다.",
        "One paid model makes cost grow with usage, and a single AI gateway means we stop when it stops. So direct provider keys sit alongside the shared server pool.",
      ),
      cost: t(
        "서버 공유 풀은 운영자 확인 전이라 '설정 필요'입니다. 허용 목록은 공급자 정책이 바뀔 수 있어 검토일(2026-09-16)을 남기고, 운영 CSP가 허용한 AI 주소는 4곳뿐이라 나머지는 막힐 수 있습니다.",
        "The shared server pool awaits operator confirmation, so it is marked setup required. The allowlist records its review date (2026-09-16) because provider policies change, and the production CSP allows only four AI hosts, so others may be blocked.",
      ),
      paths: [
        "apps/web/src/shared/ai/free-ai-policy.ts",
        "apps/web/src/shared/ai/free-ai-runtime-budget.ts",
        "apps/api/src/modules/studio-ai/studio-ai-provider.ts",
      ],
      license: "Service terms",
      status: "configured",
      atlasIds: ["free-first-ai-routing", "quota-ledger-budget", "free-ai-provider-allowlist"],
    },
  ],
  pitfall: t(
    "'전부 기기 안'은 아닙니다. MediaPipe 모델은 실행할 때 구글 저장소에서 받고, 번역 모델(약 123MB)은 배포 때 따로 두어야 켜지며, 글·대사 AI는 클라우드 경로(무료 공급자·내 키)입니다.",
    "'All on the device' is not true. MediaPipe models are fetched from Google storage at run time, the translation model (about 123 MB) must be placed at deploy time to switch on, and text and dialogue AI use the cloud route (free providers or your own key).",
  ),
  status: "live",
  atlasIds: [
    "onnx-runtime-web-inference",
    "mediapipe-webcam-pose",
    "transformers-js-translation",
    "free-first-ai-routing",
    "quota-ledger-budget",
    "webgpu-tier-budget-recovery",
  ],
  chapterIds: ["on-device-inference", "on-device-translation", "ai-routing", "free-ai-routing", "browser-local-compute"],
  glossaryIds: [
    "onnx",
    "mediapipe",
    "transformers-js",
    "execution-provider",
    "quantization-q8",
    "embedding",
    "local-ai",
    "ai-inference",
    "ai-routing",
    "ai-provider-allowlist",
    "byok",
    "quota-ledger",
    "webgpu",
    "wasm",
  ],
};
