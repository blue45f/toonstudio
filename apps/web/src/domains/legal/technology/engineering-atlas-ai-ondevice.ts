import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 도감 · ai 카테고리 — 기기 안 추론·번역과 외부 GPU Runtime 카드.
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다. 사실은 2026-10-07 기준 코드·테스트로 확인했다.
 */

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

const ONNX_RUNTIME_WEB_INFERENCE: EngineeringAtlasEntry = {
  id: "onnx-runtime-web-inference",
  category: "ai",
  name: "ONNX Runtime Web",
  title: t("기기 안에서 돌리는 AI 모델", "AI models that run on your device"),
  status: "live",
  tagline: t(
    "채색·배경 제거·선 추출·업스케일·애니풍 변환을 기기 안 모델이 맡아, 그림이 서버로 나가지 않습니다.",
    "On-device models colorize, cut out, extract lines, upscale and restyle, so the drawing never leaves your device.",
  ),
  background: [
    t(
      "AI라고 하면 멀리 있는 서버의 똑똑한 컴퓨터를 떠올리기 쉽습니다. 하지만 '그림 한 장을 받아 한 장을 돌려주는' 작은 모델은 사용자의 브라우저 안에서도 돌 수 있습니다. 식당에 주문하는 대신 밀키트를 집에서 데워 먹는 것과 같습니다. 처음에 밀키트(모델 파일)를 한 번 받아 와야 하지만, 그림이 서버로 나가지 않고 키도 한도도 필요 없습니다. ToonStudio는 이 방식으로 채색, 배경 제거, 사진에서 선 추출, 4배 업스케일, 애니풍 변환을 합니다.",
      "When people hear 'AI' they picture a clever computer far away. But a small model that takes one picture and returns one picture can run inside the user's own browser. It is like heating a meal kit at home instead of ordering from a restaurant. You download the kit (the model file) once, but your drawing never goes to a server and no key or quota is needed. ToonStudio uses this approach for colorizing, background removal, line extraction from photos, 4x upscaling and anime-style conversion.",
    ),
    t(
      "ONNX는 AI 모델을 담는 공통 파일 형식이고, ONNX Runtime Web은 그 파일을 브라우저에서 실행하는 엔진입니다. 실행 장치(execution provider)는 둘입니다. WebGPU는 그래픽 칩을 직접 써서 빠르지만 기기·브라우저마다 지원이 다르고, WASM은 어디서나 돌지만 CPU라 느립니다. 흐름은 모델마다 같습니다. 이미지를 모델 크기로 줄이고, 모델을 돌리고, 결과를 원본 해상도에 다시 합성합니다. 받은 모델 바이트의 SHA-256이 등록값과 다르면 거절하고, 추론이 끝난 뒤 문서가 바뀌었으면(에포크 번호가 다르면) 결과를 버립니다.",
      "ONNX is a common file format for AI models, and ONNX Runtime Web is the engine that runs such a file in the browser. It has two execution providers. WebGPU uses the graphics chip directly and is fast, but support varies by device and browser; WASM runs anywhere but on the CPU, so it is slower. The flow is the same for every model: shrink the image to the model's size, run the model, and composite the result back at the original resolution. Downloaded model bytes are rejected if their SHA-256 differs from the registered value, and if the document changed by the time inference ends (a different epoch number), the result is thrown away.",
    ),
    t(
      "서버 GPU로 돌리는 대안은 빠르고 큰 모델도 쓸 수 있지만, 그림이 서버로 가고 GPU 비용이 운영자에게 남습니다. 그래서 이미지 한 장으로 끝나는 작은 모델만 기기에서 돌리고, 큰 언어·확산 모델은 클라우드 경로(내 키)에 맡깁니다. 고른 모델 파일 6개(합계 119,438,571바이트)은 모두 상업 사용이 가능한 허용형 라이선스(MIT·BSD-3-Clause·Apache-2.0)입니다. 코드 주석은 크기·속도·품질의 한계는 받아들여도 라이선스 기준은 양보하지 않는다고 적고 있습니다.",
      "Running on a server GPU is the alternative: fast, and big models are possible, but the drawing goes to a server and the GPU bill stays with the operator. So only small models that finish with a single image run on the device, while large language and diffusion models are left to the cloud route (your own key). The six chosen model files (119,438,571 bytes in total) all carry permissive, commercially usable licenses (MIT, BSD-3-Clause, Apache-2.0). A code comment says size, speed and quality limits are accepted but the license standard is not given up.",
    ),
    t(
      "정직한 한계도 있습니다. 첫 사용 때 모델(채색은 79.3MB)과 실행 엔진을 내려받아야 합니다. 채색 모델(Tag2Pix)은 2019년 모델이라 512×512 고정에 옅은 파스텔 색감이고, 클라우드 키가 있으면 클라우드 채색이 우선인 대체 경로입니다. WebGPU가 실패하면 모델 모듈이 WASM으로 넘어가는데, 이는 ADR-0018 §12의 '실패 뒤 두 번째 provider를 만들지 않는다'와 어긋나며 코드와 테스트는 폴백을 합니다. 브라우저 WebGPU 실측 성능은 확인하지 못했습니다.",
      "There are honest limits. On first use the model (79.3 MB for colorizing) and the runtime engine must be downloaded. The colorizer (Tag2Pix) is a 2019 model fixed at 512x512 with pale pastel tones, and it is a fallback: cloud colorizing wins when a cloud key exists. When WebGPU fails, the model module moves on to WASM, which conflicts with ADR-0018 section 12 ('do not create a second provider after a failure'), while the code and tests do fall back. Real WebGPU performance in browsers was not measured.",
    ),
  ],
  keyPoints: [
    t("그림은 기기를 떠나지 않고, 모델·엔진만 내려받습니다", "Pixels never leave the device; only the model and engine are downloaded"),
    t("모델 파일 6개 합계 119,438,571바이트, 허용형 라이선스만", "Six model files, 119,438,571 bytes in total, permissive licenses only"),
    t("WebGPU가 안 되면 WASM으로, 받은 모델은 SHA-256 검증", "No WebGPU means WASM, and every model is checked by SHA-256"),
    t("추론 중 문서가 바뀌면 에포크 번호로 결과를 버립니다", "If the document changes mid-run, the epoch number discards the result"),
  ],
  diagram: {
    id: "onnx-runtime-web-inference-diagram",
    kind: "graph",
    title: t("버튼을 누른 뒤 모델이 돌기까지", "From the button press to the model run"),
    caption: t(
      "그림은 기기 안에서만 흐르고, 모델은 받은 뒤 해시로 확인한 다음에만 돕니다.",
      "The drawing flows only inside the device, and a model runs only after its hash is verified.",
    ),
    alt: t(
      "실행 버튼을 누르면 모델과 실행 엔진을 처음 한 번 받습니다. 받은 모델의 SHA-256이 등록값과 같아야 통과하고 다르면 거절합니다. 통과하면 WebGPU가 가능한지 보고, 가능하면 WebGPU로 아니면 WASM으로 추론합니다. 결과는 문서가 그대로일 때만 원본 크기로 합성되고, 선택한 레이어 이미지에 승인 단계 없이 바로 반영됩니다.",
      "Pressing the run button downloads the model and engine once. The model passes only if its SHA-256 equals the registered value and is rejected otherwise. If it passes, the app checks WebGPU and runs on WebGPU when possible or on WASM otherwise. The result is composited at full size only if the document is unchanged, and is applied to the selected layer's image at once, without an approval step.",
    ),
    nodes: [
      { id: "btn", label: t("실행 버튼", "Run button"), sub: t("채색·배경 제거 등", "Colorize, cut-out, etc."), tone: "local", shape: "pill", at: [0, 1] },
      { id: "load", label: t("모델·엔진 받기", "Fetch model + engine"), sub: t("버튼을 누를 때 한 번", "Once, on first press"), tone: "local", at: [1, 1] },
      { id: "hash", label: t("SHA-256 대조", "SHA-256 check"), sub: t("등록값과 같아야 통과", "Must equal the registry"), tone: "local", at: [2, 1] },
      { id: "reject", label: t("거절 · 오류 표시", "Reject, show error"), sub: t("원본은 그대로", "Original untouched"), tone: "warn", at: [2, 2] },
      { id: "d-gpu", label: t("WebGPU 가능?", "WebGPU OK?"), tone: "neutral", shape: "diamond", at: [3, 1] },
      { id: "gpu", label: t("WebGPU로 추론", "Run on WebGPU"), sub: t("그래픽 칩 사용", "Uses the GPU"), tone: "ai", at: [4, 1] },
      { id: "wasm", label: t("WASM으로 추론", "Run on WASM"), sub: t("CPU · 느리지만 어디서나", "CPU: slower, works anywhere"), tone: "ai", at: [3, 2] },
      { id: "compose", label: t("원본 크기로 합성", "Full-size composite"), sub: t("에포크가 같을 때만", "Only if the epoch matches"), tone: "local", at: [5, 1] },
      { id: "result", label: t("레이어에 바로 반영", "Applied to layer"), tone: "good", shape: "pill", at: [5, 0] },
    ],
    edges: [
      { from: "btn", to: "load" },
      { from: "load", to: "hash" },
      { from: "hash", to: "d-gpu", label: t("일치", "match") },
      { from: "hash", to: "reject", label: t("불일치", "mismatch") },
      { from: "d-gpu", to: "gpu", label: t("예", "yes") },
      { from: "d-gpu", to: "wasm", label: t("아니오", "no") },
      { from: "gpu", to: "compose" },
      { from: "wasm", to: "compose" },
      { from: "compose", to: "result" },
    ],
  },
  usage: [
    {
      feature: t("이미지 도구 · 기기 채색 (Tag2Pix)", "Image tools · on-device colorizing (Tag2Pix)"),
      role: t(
        "선화와 색 태그(115종)를 받아 색을 칠합니다. 원본 선화의 밝기를 다시 얹어 선이 뭉개지지 않게 합니다. 클라우드 키가 있으면 그쪽이 우선이고 기기 채색은 대체 경로입니다.",
        "Takes line art and color tags (115 kinds) and paints it. The source line art's luminance is laid back on top so lines do not smear. When a cloud key exists that route wins and this one is the fallback.",
      ),
      paths: [
        "apps/web/src/domains/creator/studio-onnx-tag2pix.ts",
        "apps/web/src/domains/creator/ai/StudioOnnxColorizePanel.tsx",
      ],
      route: "/studio",
    },
    {
      feature: t("이미지 도구 · 빠른 배경 제거 (일반 피사체)", "Image tools · quick background removal (general subjects)"),
      role: t(
        "U-2-Netp로 사람이 아닌 피사체도 분리합니다. 이 경로가 실패하면 인물용 MediaPipe 경로로 대신 처리하고 그 사실을 알려 줍니다.",
        "U-2-Netp cuts out subjects other than people. If this route fails, the person-oriented MediaPipe route takes over and the user is told so.",
      ),
      paths: [
        "apps/web/src/domains/creator/studio-onnx-u2netp.ts",
        "apps/web/src/domains/creator/StudioBgRemoveButton.tsx",
      ],
      route: "/studio",
    },
    {
      feature: t("이미지 도구 · 선 추출 · 업스케일 ×4 · 애니풍 변환", "Image tools · line extraction · 4x upscale · anime restyle"),
      role: t(
        "TEED가 사진에서 선만 뽑고, Real-ESRGAN이 256px 타일을 32px 겹쳐 4배로 키우며, AnimeGANv2 두 가지(풍경·컷 / 인물)가 화풍을 바꿉니다.",
        "TEED pulls only the lines from a photo, Real-ESRGAN enlarges 256 px tiles 4x with a 32 px overlap, and two AnimeGANv2 weights (scenery and panels / portraits) restyle the picture.",
      ),
      paths: [
        "apps/web/src/domains/creator/studio-onnx-teed.ts",
        "apps/web/src/domains/creator/studio-onnx-realesrgan.ts",
        "apps/web/src/domains/creator/studio-onnx-animegan.ts",
      ],
      route: "/studio",
    },
    {
      feature: t("추론 엔진 공통부", "Shared inference engine"),
      role: t(
        "모델 레지스트리(크기·SHA-256·텐서 모양), 한 번만 시도하는 제공자, WebGPU 어댑터 프로브, 필요할 때만 불러오는 런타임을 맡습니다.",
        "Holds the model registry (size, SHA-256, tensor shapes), the single-attempt provider, the WebGPU adapter probe and the lazily loaded runtime.",
      ),
      paths: [
        "apps/web/src/domains/creator/studio-onnx-inference-provider.ts",
        "apps/web/src/domains/creator/studio-onnx-model-registry.ts",
        "apps/web/src/domains/creator/studio-onnx-webgpu-probe.ts",
        "apps/web/src/domains/creator/studio-onnx-runtime-assets.ts",
      ],
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("가장 작은 ONNX Runtime Web 추론", "The smallest ONNX Runtime Web inference"),
      language: "ts",
      code: [
        'import * as ort from "onnxruntime-web";',
        "",
        "// 세션 생성 → 텐서 입력 → 첫 출력 읽기. 실행 장치는 목록 순서대로 시도한다.",
        "export async function infer(modelBytes: Uint8Array, size = 320): Promise<Float32Array> {",
        "  const session = await ort.InferenceSession.create(modelBytes, {",
        '    executionProviders: ["wasm"], // WebGPU를 쓸 수 있으면 ["webgpu", "wasm"]',
        '    graphOptimizationLevel: "all",',
        "  });",
        '  const input = new ort.Tensor("float32", new Float32Array(3 * size * size), [1, 3, size, size]);',
        "  const inputName = session.inputNames[0];",
        "  const outputName = session.outputNames[0];",
        '  if (!inputName || !outputName) throw new Error("모델의 입출력 이름이 없습니다");',
        "  const outputs = await session.run({ [inputName]: input });",
        "  const data = outputs[outputName]?.data;",
        "  await session.release();",
        '  if (!(data instanceof Float32Array)) throw new Error("float32 출력이 아닙니다");',
        "  return data;",
        "}",
      ].join("\n"),
      codeEn: [
        'import * as ort from "onnxruntime-web";',
        "",
        "// Create a session -> feed a tensor -> read the first output. Providers are tried in list order.",
        "export async function infer(modelBytes: Uint8Array, size = 320): Promise<Float32Array> {",
        "  const session = await ort.InferenceSession.create(modelBytes, {",
        '    executionProviders: ["wasm"], // with WebGPU available: ["webgpu", "wasm"]',
        '    graphOptimizationLevel: "all",',
        "  });",
        '  const input = new ort.Tensor("float32", new Float32Array(3 * size * size), [1, 3, size, size]);',
        "  const inputName = session.inputNames[0];",
        "  const outputName = session.outputNames[0];",
        '  if (!inputName || !outputName) throw new Error("the model has no input or output names");',
        "  const outputs = await session.run({ [inputName]: input });",
        "  const data = outputs[outputName]?.data;",
        "  await session.release();",
        '  if (!(data instanceof Float32Array)) throw new Error("the output is not float32");',
        "  return data;",
        "}",
      ].join("\n"),
      explain: t(
        "라이브러리가 하는 일의 전부를 보여 주는 교육용 예제입니다. 모델 바이트로 세션을 만들고, 모양이 [1,3,320,320]인 텐서를 넣고, 첫 출력을 읽습니다. 제품 코드는 여기에 SHA-256 대조, 입출력 이름 검사, 에포크, 취소 신호를 더합니다.",
        "A teaching example that shows everything the library does: build a session from model bytes, feed a tensor of shape [1,3,320,320], and read the first output. The product code adds SHA-256 verification, input and output name checks, epochs and abort signals.",
      ),
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("실행 경로 퇴역: 한 번 실패한 길은 다시 쓰지 않는다", "Route retirement: a failed route is not used again"),
      language: "ts",
      code: [
        "// WebGPU → WASM 순서로 시도하고, 한 번 실패한 경로는 이 인스턴스에서 다시 쓰지 않는다.",
        'type Route = "webgpu" | "wasm";',
        "",
        "export function createRunner(run: (route: Route) => Promise<Float32Array>) {",
        "  const retired = new Set<Route>();",
        "  return async (): Promise<Float32Array> => {",
        '    let last: unknown = new Error("사용 가능한 실행 경로 없음");',
        '    for (const route of ["webgpu", "wasm"] as const) {',
        "      if (retired.has(route)) continue;",
        "      try {",
        "        return await run(route);",
        "      } catch (error) {",
        "        retired.add(route); // 알려진 실패 경로를 반복하지 않는다",
        "        last = error;",
        "      }",
        "    }",
        "    throw last;",
        "  };",
        "}",
      ].join("\n"),
      codeEn: [
        "// Try WebGPU, then WASM; a route that failed once is not used again by this instance.",
        'type Route = "webgpu" | "wasm";',
        "",
        "export function createRunner(run: (route: Route) => Promise<Float32Array>) {",
        "  const retired = new Set<Route>();",
        "  return async (): Promise<Float32Array> => {",
        '    let last: unknown = new Error("no usable execution route");',
        '    for (const route of ["webgpu", "wasm"] as const) {',
        "      if (retired.has(route)) continue;",
        "      try {",
        "        return await run(route);",
        "      } catch (error) {",
        "        retired.add(route); // never repeat a route known to fail",
        "        last = error;",
        "      }",
        "    }",
        "    throw last;",
        "  };",
        "}",
      ].join("\n"),
      explain: t(
        "채색 모델 모듈의 경로 퇴역 루프를 줄인 예제입니다. 제공자 한 개는 한 번만 시도하고(fail-closed), 폴백은 이렇게 호출하는 모듈이 맡습니다. 같은 구조가 U-2-Netp·TEED·Real-ESRGAN·AnimeGAN 모듈에도 있고 테스트가 WebGPU 실패 뒤 WASM 폴백을 확인합니다.",
        "A trimmed version of the route-retirement loop in the colorizer module. One provider makes a single attempt (fail-closed), and the calling module owns the fallback like this. The same structure exists in the U-2-Netp, TEED, Real-ESRGAN and AnimeGAN modules, and tests confirm the WASM fallback after a WebGPU failure.",
      ),
      source: "apps/web/src/domains/creator/studio-onnx-tag2pix.ts",
      verify: "types",
    },
  ],
  links: [
    {
      title: "ONNX Runtime · Web tutorial",
      url: "https://onnxruntime.ai/docs/tutorials/web/",
      kind: "docs",
      note: t("브라우저에서 모델을 돌리는 공식 입문", "The official introduction to running models in the browser"),
    },
    {
      title: "ONNX Runtime · WebGPU execution provider",
      url: "https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html",
      kind: "docs",
    },
    {
      title: "ONNX Runtime · Env flags and session options",
      url: "https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html",
      kind: "docs",
    },
    {
      title: "MDN · WebGPU API",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API",
      kind: "docs",
    },
    {
      title: "MDN · GPU.requestAdapter()",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/GPU/requestAdapter",
      kind: "docs",
      note: t("어댑터가 없는 환경을 미리 가려내는 데 쓰는 호출", "The call used to detect environments with no adapter"),
    },
    {
      title: "Real-ESRGAN (GitHub)",
      url: "https://github.com/xinntao/Real-ESRGAN",
      kind: "repo",
      note: t("업스케일 모델의 원 구현과 BSD-3-Clause 라이선스", "The original implementation and BSD-3-Clause license of the upscaler"),
    },
  ],
  chapterIds: ["on-device-inference", "browser-local-compute", "cost-engineering"],
  talk: {
    pitch: t(
      "채색, 배경 제거, 사진에서 선 추출, 4배 업스케일, 애니풍 변환은 사용자의 브라우저 안에서 ONNX 모델이 처리합니다. 그림은 서버로 나가지 않고 키도 한도도 필요 없습니다. 모델 파일 6개는 합쳐서 약 119MB이고 모두 상업 사용이 가능한 허용형 라이선스입니다. 처음 쓸 때 모델과 엔진을 한 번 내려받아야 하고, WebGPU가 안 되는 기기에서는 느린 WASM으로 동작합니다.",
      "Colorizing, background removal, line extraction from photos, 4x upscaling and anime restyling all run as ONNX models inside the user's browser. The drawing never goes to a server, and no key or quota is needed. The six model files total about 119 MB and all carry permissive, commercially usable licenses. The first use downloads the models and engine once, and on devices without WebGPU it falls back to the slower WASM.",
    ),
    analogy: t(
      "식당에 주문하는 대신 밀키트를 집에서 데워 먹는 것과 같습니다. 처음에 밀키트를 받아 와야 하지만, 재료(그림)는 집 밖으로 나가지 않습니다.",
      "It is like heating a meal kit at home instead of ordering from a restaurant. You fetch the kit once, but the ingredients, your drawing, never leave the house.",
    ),
    questions: [
      {
        question: t("서버 GPU로 돌리면 더 좋지 않나요?", "Wouldn't a server GPU be better?"),
        answer: t(
          "빠르고 큰 모델을 쓸 수 있지만 그림이 서버로 가고 GPU 비용이 운영자에게 생깁니다. 그래서 이미지 한 장으로 끝나는 작은 모델만 기기에서 돌리고, 큰 생성 모델은 내 키로 쓰는 클라우드 경로에 맡깁니다.",
          "It is faster and allows big models, but the drawing goes to a server and the GPU bill falls on the operator. So only small single-image models run on the device, and big generative models are left to the cloud route with your own key.",
        ),
      },
      {
        question: t("WebGPU가 없는 기기는요?", "What about devices without WebGPU?"),
        answer: t(
          "어댑터 프로브가 없다고 확인하면 세션 생성을 시도하지 않고 빠르게 실패하고, 모델 모듈이 WASM(CPU)으로 넘어갑니다. 느리지만 동작합니다.",
          "If the adapter probe finds none, it fails fast without trying to create a session, and the model module moves to WASM (CPU). It is slower but works.",
        ),
      },
      {
        question: t("모델 파일이 바뀌어 있으면요?", "What if a model file has been swapped?"),
        answer: t(
          "받은 바이트의 SHA-256이 레지스트리 값과 다르면 거절하고, 세션을 만든 뒤에도 입출력 이름이 다르면 거절합니다.",
          "Bytes whose SHA-256 differs from the registry are rejected, and so is a session whose input or output names differ.",
        ),
      },
      {
        question: t("속도는 얼마나 걸리나요?", "How fast is it?"),
        answer: t(
          "기기와 브라우저에 따라 다릅니다. 저장소에는 2026-10-03 측정(Node + WASM, 2 vCPU 고부하 VM, U-2-Netp 320×320, 중앙값 2,632ms)만 기록돼 있고, 브라우저 WebGPU 실측은 없습니다.",
          "It depends on the device and browser. The repository records only a measurement from 2026-10-03 (Node + WASM, a loaded 2-vCPU VM, U-2-Netp at 320x320, median 2,632 ms); no real browser WebGPU measurement exists.",
        ),
      },
    ],
    pitfall: t(
      "'모든 AI가 기기 안에서 돈다'고 말하면 안 됩니다. 기기 안에서 도는 것은 소형 이미지 모델, MediaPipe, (모델을 배치하면) 번역 모델이고 글·이미지 생성은 클라우드입니다. 채색은 클라우드 키가 있으면 그쪽이 우선이고, 배경 제거는 인물은 MediaPipe·일반 피사체는 ONNX로 나뉩니다. 첫 사용 때 다운로드가 필요하고 WebGPU 실측은 없다는 점도 함께 말하세요.",
      "Do not say 'all AI runs on the device'. What runs there are small image models, MediaPipe and, once its files are placed, the translation model; text and image generation are in the cloud. Colorizing prefers the cloud route when a key exists, and background removal splits into MediaPipe for people and ONNX for other subjects. Also say that the first use needs a download and that no WebGPU measurement exists.",
    ),
  },
  technologies: ["ONNX Runtime Web", "WebGPU", "WASM", "MediaPipe", "SHA-256"],
  facts: [
    {
      value: "6 files / 119,438,571 B",
      label: t("기기 안 ONNX 모델 파일 수와 합계(모델 5종)", "On-device ONNX model files and total size (five models)"),
      source: "apps/web/src/domains/creator/assets",
    },
    {
      value: "79,269,994 B",
      label: t("가장 큰 모델: Tag2Pix 채색", "Largest model: Tag2Pix colorizer"),
      source: "apps/web/src/domains/creator/assets/tag2pix.LICENSE.md",
    },
    {
      value: "1.27.0",
      label: t("제품이 쓰는 onnxruntime-web 버전", "onnxruntime-web version used by the product"),
      source: "apps/web/src/domains/creator/studio-onnx-inference-provider.ts",
    },
    {
      value: "2,632 ms",
      label: t("U-2-Netp 320×320 중앙값(Node+WASM, 2 vCPU 고부하 VM, n=10, 2026-10-03, 브라우저 아님)", "U-2-Netp 320x320 median (Node + WASM, loaded 2-vCPU VM, n=10, 2026-10-03, not a browser)"),
      source: "onnx-poc/README.md",
    },
  ],
  reviewedAt: "2026-10-07",
};

const TRANSFORMERS_JS_TRANSLATION: EngineeringAtlasEntry = {
  id: "transformers-js-translation",
  category: "ai",
  name: "Transformers.js translation",
  title: t("한글 검색어를 기기 안에서 영어로", "Translating Korean queries on the device"),
  status: "configured",
  tagline: t(
    "리서치 데스크의 한글 검색어를 사전, 기기 안 번역 모델, 원문 순으로 영어로 바꿉니다.",
    "Research-desk Korean queries become English via a dictionary, an on-device model, then the original text.",
  ),
  background: [
    t(
      "해외 자료 사이트는 대부분 영어 검색어를 받습니다. 한글로 '고양이 지붕'이라고 쓰면 못 찾는 일이 생기죠. 이때 외부 번역 서비스에 검색어를 보내는 대신, 브라우저 안의 작은 번역 모델로 영어로 바꾸는 것이 이 기능입니다. 통역사를 부르는 대신 휴대용 번역기를 가방에 넣어 두는 셈입니다. 다만 번역기 파일(약 123MB)은 처음 한 번 받아야 하고, 이 모델 파일은 아직 배포에 배치되지 않아 지금은 내장 사전 변환이 대신합니다.",
      "Most overseas reference sites accept English queries only, so a Korean search for 'cat on a roof' can come back empty. This feature turns the query into English with a small translation model inside the browser instead of sending it to an outside translation service. It is like carrying a pocket translator instead of calling an interpreter. The translator files (about 123 MB) must be downloaded once, though, and they are not yet placed in the deployment, so the built-in dictionary converter does the work for now.",
    ),
    t(
      "한글이 들어오면 4단 사다리를 오릅니다. ① 영문 입력은 어떤 층도 거치지 않습니다. ② 내장 용어 사전이 즉시·오프라인으로 바꿉니다. ③ 사전이 다 풀지 못했을 때만 Transformers.js를 늦게 불러 OPUS-MT(한→영, 8비트 양자화 q8)로 번역합니다. ④ 모델이 실패하거나 결과가 원문과 같거나 한글이 남아 있으면 사전 부분 결과나 원문으로 검색합니다. 번역기는 던지지 않고 실패하면 null을 돌려주는 계약이라 검색을 막지 않습니다. 코드는 allowRemoteModels를 꺼서 모델을 외부에서 받는 길을 닫고 자체 호스팅 경로(/models/)에서만 읽습니다.",
      "A Korean query climbs a four-step ladder. (1) English input skips every layer. (2) A built-in term dictionary converts instantly and offline. (3) Only when the dictionary cannot resolve everything is Transformers.js loaded late to translate with OPUS-MT (Korean to English, 8-bit quantized q8). (4) If the model fails, returns the original text or leaves Hangul behind, the search uses the partial dictionary result or the original. The translator contract is to return null on failure rather than throw, so search is never blocked. The code turns allowRemoteModels off to close the door to outside model downloads and reads only from the self-hosted path (/models/).",
    ),
    t(
      "대안은 외부 번역 API를 쓰는 것인데, 검색어가 밖으로 나가고 키와 비용이 생깁니다. 검색어는 짧은 문장이라 모델 품질 요구가 낮고, 한 번 받으면 이후 비용이 없어 기기 안 모델을 골랐습니다. 다만 번역된 영어 검색어는 이후 각 자료 제공처 API로 나가므로 '검색어가 아예 밖으로 나가지 않는다'는 뜻은 아닙니다. 번역 과정에서 외부 번역 업체에 보내지 않는다는 뜻입니다. 화면에는 변환 방식(사전·모델·원문)과 다운로드 진행률이 보이고, 변환된 검색어는 사용자가 직접 고칠 수 있습니다.",
      "The alternative is an outside translation API, which sends the query out and adds keys and cost. A query is a short sentence, so the quality bar for the model is low, and once downloaded it costs nothing more; that is why an on-device model was chosen. Note that the translated English query still goes on to each source API, so this does not mean the query never leaves the device; it means translation itself sends nothing to an outside translation vendor. The screen shows the method (dictionary, model, original) and download progress, and the user can edit the converted query.",
    ),
    t(
      "미확인 한계가 있습니다. 모델 파일(약 123.1MB, 인코더 약 52.9MB·디코더 약 60.2MB 등)은 저장소에 없고 배포 때 dist/models/Xenova/opus-mt-ko-en/에 두어야 켜집니다. 또 설치된 Transformers.js는 ONNX 런타임 WASM 주소를 따로 지정하지 않으면 jsDelivr로 잡는데, 운영 CSP의 script-src에는 jsDelivr와 blob:이 없어 모델을 두어도 막힐 가능성이 있습니다. 정적 대조일 뿐 실브라우저·스테이징으로는 확인하지 못했습니다.",
      "Some limits are unverified. The model files (about 123.1 MB: encoder about 52.9 MB, decoder about 60.2 MB and more) are not in the repository and must be placed at deploy time under dist/models/Xenova/opus-mt-ko-en/ to switch the feature on. Also, the installed Transformers.js points the ONNX runtime WASM at jsDelivr unless told otherwise, and the production CSP script-src lists neither jsDelivr nor blob:, so placing the model might still be blocked. This is a static comparison; it was not checked in a real browser or on staging.",
    ),
  ],
  keyPoints: [
    t("사전 → 기기 안 모델 → 원문 순으로, 어느 층이 실패해도 검색은 계속", "Dictionary, then on-device model, then original; search continues if any layer fails"),
    t("모델은 같은 출처 /models/에서만 읽고 외부에서 받는 길은 닫음", "The model loads only from same-origin /models/; outside downloads are closed"),
    t("모델 파일(약 123MB)은 아직 배치 전: '설정 필요'", "The model files (about 123 MB) are not placed yet: 'setup required'"),
  ],
  diagram: {
    id: "transformers-js-translation-diagram",
    kind: "graph",
    title: t("한글 검색어가 오르는 사다리", "The ladder a Korean query climbs"),
    caption: t(
      "빠르고 확실한 층부터 쓰고, 어느 층이 실패해도 검색은 끝까지 이어집니다.",
      "The fast, certain layers go first, and search carries on even if a layer fails.",
    ),
    alt: t(
      "한글 검색어가 들어오면 먼저 한글이 있는지 봅니다. 없으면 그대로 검색합니다. 있으면 내장 사전으로 풀리는지 보고, 풀리면 사전 결과로 검색합니다. 풀리지 않으면 번역 모델을 실행하고, 결과가 쓸 만하면 모델 번역으로, 아니면 부분 사전이나 원문으로 검색합니다.",
      "When a query arrives, the app first checks for Korean text; if there is none, it searches as is. Otherwise it checks whether the built-in dictionary resolves it and, if so, searches with the dictionary result. If not, it runs the translation model and searches with the model's translation when it is usable, or with the partial dictionary result or the original when it is not.",
    ),
    nodes: [
      { id: "in", label: t("한글 검색어", "Korean query"), tone: "local", shape: "pill", at: [0, 1] },
      { id: "d-han", label: t("한글이 있나?", "Korean text?"), tone: "neutral", shape: "diamond", at: [1, 1] },
      { id: "asis", label: t("그대로 검색", "Search as is"), tone: "good", at: [1, 0] },
      { id: "d-dict", label: t("사전으로 풀림?", "Dictionary hit?"), tone: "neutral", shape: "diamond", at: [2, 1] },
      { id: "dict", label: t("사전 결과로 검색", "Search by dictionary"), sub: t("즉시 · 오프라인", "Instant · offline"), tone: "good", at: [2, 0] },
      { id: "model", label: t("번역 모델 실행", "Run translation model"), sub: t("OPUS-MT · 한 번만 받기", "OPUS-MT · downloaded once"), tone: "ai", at: [3, 1] },
      { id: "d-ok", label: t("쓸 만한가?", "Usable?"), tone: "neutral", shape: "diamond", at: [4, 1] },
      { id: "mt", label: t("모델 번역으로 검색", "Search by model"), tone: "good", at: [4, 0] },
      { id: "orig", label: t("검색은 계속", "Search continues"), sub: t("부분 사전·원문 사용", "Partial dictionary / original"), tone: "neutral", at: [4, 2] },
    ],
    edges: [
      { from: "in", to: "d-han" },
      { from: "d-han", to: "asis", label: t("아니오", "no") },
      { from: "d-han", to: "d-dict", label: t("예", "yes") },
      { from: "d-dict", to: "dict", label: t("예", "yes") },
      { from: "d-dict", to: "model", label: t("아니오", "no") },
      { from: "model", to: "d-ok" },
      { from: "d-ok", to: "mt", label: t("예", "yes") },
      { from: "d-ok", to: "orig", label: t("아니오", "no") },
    ],
  },
  usage: [
    {
      feature: t("리서치 데스크 · 자료 검색창 5곳", "Research desk · five search boxes"),
      role: t(
        "참고 자료, 자료 검색, 오픈 창작, 해외 도서, 콘텐츠 팩의 한글 검색어를 영어로 바꿔 제공처에 보냅니다. 변환 방식과 모델 다운로드 진행률을 보여 주고 변환어를 직접 고칠 수 있습니다.",
        "Korean queries in reference assets, resource search, open creation, global books and content packs become English before going to the source. The screen shows the method and model download progress, and the converted query can be edited by hand.",
      ),
      paths: [
        "apps/web/src/domains/creator-resources/TranslatedQueryNotice.tsx",
        "apps/web/src/domains/creator-resources/use-translated-research-query.ts",
        "apps/web/src/domains/creator-resources/ReferenceAssetsPage.tsx",
        "apps/web/src/domains/creator-resources/ResourceSearchPage.tsx",
      ],
      route: "/research/assets",
    },
    {
      feature: t("번역 모델 로더 (Transformers.js)", "Translation model loader (Transformers.js)"),
      role: t(
        "Transformers.js를 늦게 불러 opus-mt-ko-en(q8)을 만들고 세션당 한 번만 시도합니다. 외부에서 모델을 받는 길은 닫고 자체 호스팅 경로에서만 읽습니다.",
        "Loads Transformers.js late, builds opus-mt-ko-en (q8) and tries once per session. The route to download models from outside is closed; it reads only from the self-hosted path.",
      ),
      paths: ["apps/web/src/domains/creator-resources/research-query-mt.ts#loadOpusMtTranslator"],
      route: "/research/assets",
    },
    {
      feature: t("번역 사다리 (사전 → 모델 → 원문)", "Translation ladder (dictionary, model, original)"),
      role: t(
        "층의 순서와 모델 출력 검증(원문과 같지 않고, 한글이 남지 않고, 길이 이내)을 맡습니다. 어떤 실패도 던지지 않고 최악의 경우 원문 검색으로 끝납니다.",
        "Owns the layer order and output validation (not equal to the original, no Hangul left, within the length cap). It never throws and, at worst, ends with a search on the original.",
      ),
      paths: ["apps/web/src/domains/creator-resources/research-query-translation.ts#resolveResearchQueryTranslation"],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("번역 사다리", "The translation ladder"),
      language: "ts",
      code: [
        "// 사전(즉답) → 모델(느림·실패 가능) → 원문. 어떤 실패도 검색을 막지 않는다.",
        "type Translator = (ko: string) => Promise<string | null>; // 계약: 던지지 않고, 실패하면 null",
        "const HANGUL = /[\\u1100-\\u11ff\\u3130-\\u318f\\uac00-\\ud7af]/u;",
        "",
        "export async function toEnglishQuery(",
        "  input: string,",
        "  dict: (text: string) => string | null,",
        "  loadModel: () => Promise<Translator | null>,",
        "): Promise<string> {",
        "  if (!HANGUL.test(input)) return input; // 영문 입력은 어떤 층도 거치지 않는다",
        "  const fromDict = dict(input);",
        "  if (fromDict) return fromDict; // 1층: 사전(즉답·오프라인)",
        "  const translate = await loadModel().catch(() => null); // 2층: 모델",
        "  const out = translate ? await translate(input).catch(() => null) : null;",
        "  return out && out !== input && !HANGUL.test(out) ? out : input; // 검증 실패 → 원문",
        "}",
      ].join("\n"),
      codeEn: [
        "// Dictionary (instant) -> model (slow, may fail) -> original. No failure blocks the search.",
        "type Translator = (ko: string) => Promise<string | null>; // contract: never throws, null on failure",
        "const HANGUL = /[\\u1100-\\u11ff\\u3130-\\u318f\\uac00-\\ud7af]/u;",
        "",
        "export async function toEnglishQuery(",
        "  input: string,",
        "  dict: (text: string) => string | null,",
        "  loadModel: () => Promise<Translator | null>,",
        "): Promise<string> {",
        "  if (!HANGUL.test(input)) return input; // English input skips every layer",
        "  const fromDict = dict(input);",
        "  if (fromDict) return fromDict; // layer 1: dictionary (instant, offline)",
        "  const translate = await loadModel().catch(() => null); // layer 2: model",
        "  const out = translate ? await translate(input).catch(() => null) : null;",
        "  return out && out !== input && !HANGUL.test(out) ? out : input; // failed validation -> original",
        "}",
      ].join("\n"),
      explain: t(
        "resolveResearchQueryTranslation을 줄인 예제입니다. 모델 출력은 원문과 다르고 한글이 남지 않을 때만 채택하고, 아니면 원문으로 돌아갑니다. 실제 코드는 사전이 일부만 푼 경우의 '부분 결과'와 길이 상한, 모델 시도 여부 표시도 다룹니다.",
        "A trimmed resolveResearchQueryTranslation. Model output is accepted only if it differs from the original and has no Hangul left; otherwise the original is used. The real code also handles partial dictionary results, a length cap and a flag saying whether the model was tried.",
      ),
      source: "apps/web/src/domains/creator-resources/research-query-translation.ts",
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("Transformers.js를 로컬 전용으로 쓰기", "Using Transformers.js in local-only mode"),
      language: "ts",
      code: [
        'import { env, pipeline } from "@huggingface/transformers";',
        "",
        "// 모델을 외부(Hugging Face Hub)에서 받지 않고, 같은 출처의 /models/ 에서만 읽는다.",
        "env.allowRemoteModels = false;",
        "env.allowLocalModels = true;",
        '// 배포 때 dist/models/Xenova/opus-mt-ko-en/ 아래에 파일을 둔다',
        'env.localModelPath = "/models/";',
        "",
        "// 한→영 번역 파이프라인(8비트 양자화 q8). 모델 파일이 없으면 여기서 실패한다.",
        'const translate = await pipeline("translation", "Xenova/opus-mt-ko-en", { dtype: "q8" });',
        'const result = await translate("고양이가 지붕 위를 걷는다");',
        'console.log(result); // [{ translation_text: "..." }]',
      ].join("\n"),
      codeEn: [
        'import { env, pipeline } from "@huggingface/transformers";',
        "",
        "// Never download models from outside (Hugging Face Hub); read only from same-origin /models/.",
        "env.allowRemoteModels = false;",
        "env.allowLocalModels = true;",
        "// At deploy time, put the files under dist/models/Xenova/opus-mt-ko-en/",
        'env.localModelPath = "/models/";',
        "",
        "// Korean -> English pipeline (8-bit quantized q8). Fails here if the model files are missing.",
        'const translate = await pipeline("translation", "Xenova/opus-mt-ko-en", { dtype: "q8" });',
        'const result = await translate("고양이가 지붕 위를 걷는다");',
        'console.log(result); // [{ translation_text: "..." }]',
      ].join("\n"),
      explain: t(
        "loadOpusMtTranslator의 환경 설정을 그대로 옮긴 예제입니다. allowRemoteModels를 끄면 외부 허브로 나가는 길이 닫히고, 모델이 없으면 pipeline이 실패해 호출자는 null을 받습니다. 번역할 문장은 예시입니다.",
        "Carries over the environment setup of loadOpusMtTranslator. Turning allowRemoteModels off closes the route to the outside hub, and a missing model makes pipeline fail so the caller receives null. The sentence to translate is just an example.",
      ),
      source: "apps/web/src/domains/creator-resources/research-query-mt.ts",
      verify: "types",
    },
  ],
  links: [
    {
      title: "Transformers.js documentation",
      url: "https://huggingface.co/docs/transformers.js",
      kind: "docs",
      note: t("브라우저에서 모델을 돌리는 Hugging Face 라이브러리", "Hugging Face's library for running models in the browser"),
    },
    {
      title: "Transformers.js · env settings",
      url: "https://huggingface.co/docs/transformers.js/api/env",
      kind: "docs",
      note: t("allowRemoteModels·localModelPath 같은 설정", "Settings such as allowRemoteModels and localModelPath"),
    },
    {
      title: "Xenova/opus-mt-ko-en (Hugging Face)",
      url: "https://huggingface.co/Xenova/opus-mt-ko-en",
      kind: "repo",
    },
    {
      title: "Helsinki-NLP/opus-mt-ko-en (Hugging Face)",
      url: "https://huggingface.co/Helsinki-NLP/opus-mt-ko-en",
      kind: "repo",
      note: t("변환 전 원본 모델과 라이선스", "The original model and its license before conversion"),
    },
    {
      title: "OPUS-MT project (GitHub)",
      url: "https://github.com/Helsinki-NLP/Opus-MT",
      kind: "repo",
    },
    {
      title: "MDN · Cache API",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/Cache",
      kind: "docs",
      note: t("한 번 받은 모델 파일을 브라우저가 보관하는 방법", "How the browser keeps a model file it has downloaded"),
    },
  ],
  chapterIds: ["on-device-translation", "browser-local-compute", "open-api-data"],
  talk: {
    pitch: t(
      "해외 자료 사이트는 영어 검색어를 받습니다. 한글 검색어는 먼저 내장 사전으로 바꾸고, 그래도 안 풀리면 브라우저 안의 번역 모델이 영어로 바꿉니다. 번역 때문에 검색어를 외부 번역 업체에 보내지 않습니다. 다만 모델 파일 약 123MB는 아직 배포에 배치되지 않아, 지금은 사전 변환과 원문 검색이 대신하는 '설정 필요' 상태입니다.",
      "Overseas reference sites take English queries. A Korean query is first converted by the built-in dictionary, and if that fails, a translation model inside the browser turns it into English. Translation never sends the query to an outside translation vendor. The roughly 123 MB of model files are not placed in the deployment yet, so today dictionary conversion and original-text search carry the flow: a 'setup required' state.",
    ),
    analogy: t(
      "통역사를 부르는 대신 휴대용 번역기를 가방에 넣어 두는 것과 같습니다. 번역기를 처음 한 번 사 와야 하지만, 이후에는 어디에도 묻지 않고 번역합니다.",
      "It is like keeping a pocket translator in your bag instead of calling an interpreter. You buy it once, and after that it translates without asking anyone.",
    ),
    questions: [
      {
        question: t("지금 번역 모델이 켜져 있나요?", "Is the translation model on right now?"),
        answer: t(
          "아니요. 코드·화면·테스트는 끝났지만 모델 파일이 저장소와 배포에 없어, 지금은 사전 변환과 원문 검색이 대신합니다. 배치한 뒤 운영 CSP에서 실제로 도는지는 스테이징 검증 항목입니다.",
          "No. The code, screens and tests are done, but the model files are neither in the repository nor in the deployment, so dictionary conversion and original search stand in. Whether it actually runs under the production CSP after placement is a staging check.",
        ),
      },
      {
        question: t("검색어가 밖으로 안 나가나요?", "Does the query stay inside?"),
        answer: t(
          "번역 단계에서는 외부 번역 업체로 나가지 않습니다. 하지만 번역된 영어 검색어는 이후 각 자료 제공처 API로 나갑니다. 둘을 구분해서 말해야 합니다.",
          "The translation step sends nothing to an outside translation vendor. The English query it produces, however, goes on to each source API. The two should be told apart.",
        ),
      },
      {
        question: t("번역이 틀리면요?", "What if the translation is wrong?"),
        answer: t(
          "화면에 변환 방식과 결과가 보이고, 사용자가 변환된 검색어를 직접 고쳐 다시 검색할 수 있습니다. 직접 고친 값이 사전·모델 결과보다 우선합니다.",
          "The screen shows the method and the result, and the user can edit the converted query and search again. A hand edit outranks both the dictionary and the model.",
        ),
      },
    ],
    pitfall: t(
      "'기기 안 번역이 동작한다'고 말하면 과장입니다. 모델 파일이 배치되지 않았고, 배치해도 Transformers.js의 ONNX 런타임 주소(기본 jsDelivr)와 운영 CSP가 충돌할 가능성은 실브라우저로 확인하지 못했습니다(미확인). 한글 검색어가 사전에 있으면 지금도 영어로 바뀌지만 그것은 모델이 아니라 사전 덕분입니다. 이 모델(약 123MB)을 ONNX 이미지 모델 합계(약 119MB)와 혼동하지 마세요.",
      "Saying 'on-device translation works' would overstate it. The model files are not placed, and even once placed, a possible clash between Transformers.js's default ONNX runtime address (jsDelivr) and the production CSP was not checked in a real browser (unverified). Korean queries that are in the dictionary do become English today, but thanks to the dictionary, not the model. Do not confuse this model (about 123 MB) with the ONNX image models' total (about 119 MB).",
    ),
  },
  technologies: ["Transformers.js", "OPUS-MT", "ONNX Runtime Web", "Hugging Face"],
  facts: [
    {
      value: "123,110,000 B",
      label: t("번역 모델 파일 합계(q8, 2026-10-06 Hugging Face API 실측으로 코드에 기록)", "Translation model files in total (q8, recorded in code from the 2026-10-06 Hugging Face API)"),
      source: "apps/web/src/domains/creator-resources/research-query-mt.ts",
    },
    {
      value: "5",
      label: t("한글 검색어를 변환해 쓰는 리서치 화면 수", "Research screens that convert Korean queries"),
      source: "apps/web/src/domains/creator-resources/use-translated-research-query.ts",
    },
    {
      value: "80",
      label: t("변환어를 직접 고칠 때 입력 길이 상한(글자)", "Input length cap when editing the converted query (characters)"),
      source: "apps/web/src/domains/creator-resources/TranslatedQueryNotice.tsx",
    },
  ],
  reviewedAt: "2026-10-07",
};

const CREATOR_INFERENCE_SERVICE: EngineeringAtlasEntry = {
  id: "creator-inference-service",
  category: "ai",
  name: "Creator inference runtime",
  title: t("영상·3D를 만드는 내 GPU 서버", "A GPU server of your own for video and 3D"),
  status: "experimental",
  tagline: t(
    "영상·3D 추론은 운영 서버가 아니라 내가 연결한 GPU 서버에서 돌리고, 연결이 없으면 직접 만드는 도구를 안내합니다.",
    "Video and 3D inference run on a GPU server you connect, not on ours; without one, the app points to tools you drive by hand.",
  ),
  background: [
    t(
      "영상 생성이나 그림 한 장에서 3D 형상을 뽑아내는 일은 고성능 그래픽 카드(GPU)가 필요합니다. 서비스가 이걸 대신 해 주면 GPU 임대료가 사용자 수만큼 운영자에게 쌓입니다. 그래서 ToonStudio는 운영 서버에서 이 추론을 돌리지 않고, 쓰고 싶은 사람이 자기 GPU 서버(Creator Runtime)의 주소와 토큰을 설정에 등록하면 브라우저가 직접 연결하게 했습니다. 가게가 주방을 갖는 대신 손님이 자기 주방을 가져와 연결하는 방식입니다.",
      "Making video, or pulling a 3D shape out of a single picture, needs a powerful graphics card (GPU). If the service did that for everyone, GPU rent would pile up on the operator in proportion to users. So ToonStudio does not run this inference on its own servers; a user who wants it registers the address and token of their own GPU server (Creator Runtime) in settings, and the browser connects directly. It is like a restaurant that lets guests bring and plug in their own kitchen instead of owning one.",
    ),
    t(
      "저장소의 services/creator-inference는 그 서버의 참조 구현(FastAPI)입니다. Wan2.1(그림→영상), TripoSR(그림 한 장→3D 형상), SDXL+ControlNet(3D→웹툰 일러스트)을 돌리고, 작업은 SQLite에 저장하며 GPU 작업은 한 번에 하나만 실행합니다. 업로드는 1MiB 조각과 SHA-256으로 검증하고 결과 파일도 SHA-256을 대조합니다. 사용자당 동시 2건·전체 대기 12건·하루 12건이 기본 한도이고, 모델이 설정되지 않으면 가짜 결과 대신 503을 돌려줍니다.",
      "services/creator-inference in the repository is the reference build (FastAPI) of that server. It runs Wan2.1 (picture to video), TripoSR (one picture to a 3D shape) and SDXL + ControlNet (3D to webtoon illustration), stores jobs in SQLite and runs one GPU job at a time. Uploads are verified in 1 MiB chunks with SHA-256, and result files are checked against SHA-256 too. The defaults are 2 concurrent jobs per user, 12 queued overall and 12 per day, and an unconfigured model returns 503 instead of a fake result.",
    ),
    t(
      "운영 서버에서 GPU를 직접 돌리는 길은 2026-09-16 클라우드 전용 계약으로 대체되었습니다. 지금 API의 studio-ai/inference와 studio-ai/media 경로 가운데 업로드·작업·결과 경로는 모두 503 PERSONAL_CREATOR_RUNTIME_REQUIRED를 돌려주는 스텁이고, 상태 조회는 200으로 꺼져 있음(enabled·configured: false)을 알려 줍니다. 생성 실험실(/studio/generate)은 이 상태를 읽어 가짜 결과 대신 이유와 '추론 서버 없이도 같은 결과를 직접 만드는 도구'(모션 웹툰, 캐릭터 3D 셰이퍼, 3D 배경 스튜디오)를 안내하고, AI Runtime 화면(/studio/ai-lab)은 등록한 내 Runtime에 직접 연결합니다. 모델 파일은 저장소에 넣지 않고, 설치 스크립트는 40자리 revision과 라이선스 수락 없이는 받지 않으며 파일별 SHA-256 목록을 남깁니다.",
      "Running GPUs directly on the production server was superseded by a cloud-only contract on 2026-09-16. Of the API's studio-ai/inference and studio-ai/media routes today, the upload, job and result routes are stubs that all return 503 PERSONAL_CREATOR_RUNTIME_REQUIRED, while the status check answers 200 and reports that it is off (enabled and configured: false). The generative lab (/studio/generate) reads that status and, instead of a fake result, shows the reason and tools that make the same result by hand without an inference server (Motion Webtoon, Character Shaper, 3D Background Studio), and the AI Runtime screen (/studio/ai-lab) connects straight to the Runtime you registered. Model files stay out of the repository, and the install script refuses to download without a 40-character revision and a license acknowledgement, leaving a per-file SHA-256 list.",
    ),
    t(
      "정직한 상태: 이 서비스는 CPU 테스트(test-only runner)만 통과했고 CUDA GPU에서의 생성 품질·운영 검증은 하지 않았습니다. README가 말하는 CREATOR_INFERENCE_URL을 읽는 코드는 저장소에 없고, 브라우저가 등록된 Runtime에 직접 연결하는 클라이언트만 있습니다. 상태 보드에서는 '개발자 미리보기'입니다. 모델 라이선스(Wan Apache-2.0, TripoSR MIT, SDXL·ControlNet은 사용 제한이 있는 OpenRAIL++-M)는 공개 전에 검토해야 합니다.",
      "Honest state: this service has passed only CPU tests (a test-only runner); generation quality and operation on CUDA GPUs have not been verified. No code in the repository reads the CREATOR_INFERENCE_URL that the README mentions; there is only the client by which the browser connects straight to a registered Runtime. The status board shows it as a developer preview. The model licenses (Wan Apache-2.0, TripoSR MIT, and SDXL and ControlNet under the use-restricted OpenRAIL++-M) must be reviewed before release.",
    ),
  ],
  keyPoints: [
    t("운영 서버의 GPU 작업 경로는 꺼져 있고 503을 돌려줍니다", "The server-side GPU job routes are off and answer 503"),
    t("내 GPU 서버 주소·토큰을 등록하면 브라우저가 직접 연결합니다", "Register your own GPU server's address and token and the browser connects directly"),
    t("가짜 결과 대신 이유와 '직접 만드는 대안'을 보여 줍니다", "Instead of a fake result it shows the reason and a hands-on alternative"),
    t("참조 구현은 CPU 테스트만 통과, GPU 검증은 아직입니다", "The reference build passed CPU tests only; GPU validation is still pending"),
  ],
  diagram: {
    id: "creator-inference-service-diagram",
    kind: "graph",
    title: t("영상·3D 요청이 가는 길", "Where a video or 3D request goes"),
    caption: t(
      "운영 API의 작업 경로는 꺼져 있고, 내 Runtime이 연결돼 준비됐을 때만 작업이 돕니다. 아니면 이유와 안내만 보입니다.",
      "The production API's job routes are off; a job runs only when your Runtime is connected and ready. Otherwise only the reason and guidance are shown.",
    ),
    alt: t(
      "생성 실험실(/studio/generate)은 ToonStudio API에 상태를 물어 200 응답으로 꺼져 있다는 답을 받고, 가짜 결과 대신 이유와 직접 만드는 도구를 안내합니다. AI Runtime 화면(/studio/ai-lab)은 API가 아니라 사용자가 등록한 Runtime에 직접 연결합니다. 등록이 없으면 연결이 필요하다고 안내하고, 등록했다면 엔진이 준비됐는지 보고, 준비됐으면 작업 큐에서 모델이 돌고 결과의 SHA-256을 대조합니다.",
      "The generative lab (/studio/generate) asks the ToonStudio API for status, gets a 200 reply saying it is off, and shows the reason and hands-on tools instead of a fake result. The AI Runtime screen (/studio/ai-lab) connects straight to the Runtime the user registered, not to the API. Without one it says a connection is needed; with one, it checks whether the engine is ready and, when it is, a model runs from the job queue and the result's SHA-256 is verified.",
    ),
    nodes: [
      { id: "lab", label: t("AI Runtime 화면", "AI Runtime screen"), sub: t("/studio/ai-lab", "/studio/ai-lab"), tone: "local", shape: "pill", at: [0, 1] },
      { id: "api", label: t("ToonStudio API", "ToonStudio API"), sub: t("상태 200 · 작업 경로 503", "Status 200 · job routes 503"), tone: "warn", at: [0, 0] },
      { id: "d-cfg", label: t("Runtime 등록?", "Runtime linked?"), tone: "neutral", shape: "diamond", at: [1, 1] },
      { id: "help", label: t("이유와 대안 안내", "Reason + alternatives"), sub: t("연결 필요 · 직접 만드는 도구", "Connect a Runtime · hands-on tools"), tone: "neutral", at: [1, 0] },
      { id: "rt", label: t("내 Creator Runtime", "Your Creator Runtime"), sub: t("주소 + 토큰 · 직접 연결", "Address + token · direct"), tone: "external", at: [2, 1] },
      { id: "d-ready", label: t("엔진 준비됨?", "Engine ready?"), tone: "neutral", shape: "diamond", at: [3, 1] },
      { id: "fail", label: t("503 응답", "503 reply"), sub: t("내 Runtime · 가짜 결과 없음", "Your Runtime · no fake result"), tone: "warn", at: [3, 0] },
      { id: "job", label: t("작업 큐 → 모델 추론", "Job queue → model run"), sub: t("GPU 작업은 한 번에 1개", "One GPU job at a time"), tone: "ai", at: [4, 1] },
      { id: "check", label: t("SHA-256 대조", "Verify SHA-256"), sub: t("결과 파일 확인", "Result file check"), tone: "good", at: [5, 1] },
    ],
    edges: [
      { from: "api", to: "help", label: t("실험실 조회", "lab asks"), style: "dashed" },
      { from: "lab", to: "d-cfg" },
      { from: "d-cfg", to: "help", label: t("아니오", "no") },
      { from: "d-cfg", to: "rt", label: t("예", "yes") },
      { from: "rt", to: "d-ready" },
      { from: "d-ready", to: "fail", label: t("아니오", "no") },
      { from: "d-ready", to: "job", label: t("예", "yes") },
      { from: "job", to: "check" },
    ],
  },
  usage: [
    {
      feature: t("외부 AI Runtime 화면 (/studio/ai-lab)", "External AI runtime screen (/studio/ai-lab)"),
      role: t(
        "내가 등록한 Runtime 주소·토큰으로 브라우저가 직접 연결해 업로드(1MiB 조각, SHA-256), 작업 제출, 결과 내려받기를 합니다. 쿠키 없이, 자동 재시도 없이 보냅니다.",
        "Over the address and token you registered, the browser connects directly to upload (1 MiB chunks, SHA-256), submit a job and download the result, without cookies and without automatic retries.",
      ),
      paths: [
        "apps/web/src/domains/creator/ai/PersonalRuntimeWorkspace.tsx",
        "apps/web/src/domains/creator/ai/personal-inference-client.ts",
      ],
      route: "/studio/ai-lab",
    },
    {
      feature: t("생성 실험실 (/studio/generate)", "Generative lab (/studio/generate)"),
      role: t(
        "운영 서버의 상태를 물어 준비되지 않았으면 가짜 결과 대신 이유와, 추론 서버 없이 같은 결과를 직접 만드는 도구를 안내합니다.",
        "Asks the production server for status and, if it is not ready, shows the reason and tools that make the same result by hand instead of a fake one.",
      ),
      paths: [
        "apps/web/src/domains/creator/generative/generative-modes.ts",
        "apps/web/src/domains/creator/generative/StudioGenerativePage.tsx",
        "apps/web/src/domains/creator/generative/media-inference-client.ts",
      ],
      route: "/studio/generate",
    },
    {
      feature: t("ToonStudio API의 추론 경로 (꺼짐)", "Inference routes of the ToonStudio API (off)"),
      role: t(
        "studio-ai/inference/*와 studio-ai/media/* 의 업로드·작업·결과 경로는 모두 503 PERSONAL_CREATOR_RUNTIME_REQUIRED를 돌려주고, 상태 조회(…/status)는 200으로 꺼져 있음을 알려 줍니다. 운영자 비용으로 돌리지 않는다는 뜻(operatorFunded: false)입니다.",
        "The upload, job and result routes of studio-ai/inference/* and studio-ai/media/* all return 503 PERSONAL_CREATOR_RUNTIME_REQUIRED, while the status check (…/status) answers 200 and reports that it is off. Nothing runs on operator money (operatorFunded: false).",
      ),
      paths: [
        "apps/api/src/modules/studio-ai/creator-inference.controller.ts",
        "apps/api/src/modules/studio-ai/studio-media-inference.controller.ts",
      ],
    },
    {
      feature: t("참조 구현 서버 (Python)", "Reference server (Python)"),
      role: t(
        "Wan2.1·TripoSR·SDXL ControlNet 작업 큐와 한도, 모델 설치 스크립트를 담은 별도 서비스입니다. 성공처럼 보이는 가짜 추론은 만들지 않습니다.",
        "A separate service with the job queue and limits for Wan2.1, TripoSR and SDXL ControlNet, plus the model install script. It never produces a success-looking fake inference.",
      ),
      paths: [
        "services/creator-inference/README.md",
        "services/creator-inference/app.py",
        "services/creator-inference/install-models.py",
      ],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("작업 접수 규칙", "Job admission rules"),
      language: "python",
      code: [
        "# 작업 접수 규칙(단순화): 모델이 없으면 503, 큐가 차면 429. 가짜 결과는 만들지 않는다.",
        "from fastapi import HTTPException",
        "",
        "def admit(engine_ready: bool, active: int, queued: int, today: int, daily_limit: int = 12) -> None:",
        "    if not engine_ready:",
        '        raise HTTPException(503, "Inference engine is not configured and enabled")',
        "    if active >= 2 or queued >= 12 or today >= daily_limit:",
        '        raise HTTPException(429, "Inference queue or daily limit reached")',
      ].join("\n"),
      codeEn: [
        "# Job admission rules (simplified): 503 without a model, 429 when the queue is full. No fake results.",
        "from fastapi import HTTPException",
        "",
        "def admit(engine_ready: bool, active: int, queued: int, today: int, daily_limit: int = 12) -> None:",
        "    if not engine_ready:",
        '        raise HTTPException(503, "Inference engine is not configured and enabled")',
        "    if active >= 2 or queued >= 12 or today >= daily_limit:",
        '        raise HTTPException(429, "Inference queue or daily limit reached")',
      ].join("\n"),
      explain: t(
        "app.py의 작업 접수 부분을 줄인 예제입니다. active는 사용자 한 명의 진행 중 작업 수, queued는 전체 대기·실행 수, today는 최근 24시간 접수 수입니다. 기본 한도 2·12·12는 환경변수(CREATOR_DAILY_JOB_LIMIT)로 하루 접수만 바꿀 수 있습니다.",
        "A trimmed version of the admission part of app.py. active is one user's running jobs, queued is all queued and running jobs, and today is submissions in the last 24 hours. Of the defaults 2, 12 and 12, only the daily one can be changed, via the CREATOR_DAILY_JOB_LIMIT environment variable.",
      ),
      source: "services/creator-inference/app.py",
      verify: "none",
    },
    {
      kind: "simplified",
      title: t("내 Runtime으로 보내는 요청", "A request to your own Runtime"),
      language: "ts",
      code: [
        "// 내 Runtime 에 보내는 요청(단순화): 토큰은 헤더로만, 쿠키·리다이렉트는 끄고, 실패는 다시 보내지 않는다.",
        "export async function runtimeRequest(base: string, token: string, owner: string, path: string, init: RequestInit = {}): Promise<Response> {",
        "  if (!/^\\/[A-Za-z0-9._-]+(?:\\/[A-Za-z0-9._-]+)*$/u.test(path) || path.includes(\"..\")) {",
        '    throw new Error("경로가 올바르지 않습니다");',
        "  }",
        "  const headers = new Headers(init.headers);",
        '  headers.set("Authorization", `Bearer ${token}`);',
        '  headers.set("X-Creator-Owner", owner);',
        "  const response = await fetch(`${base}${path}`, {",
        '    ...init, headers, credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", cache: "no-store",',
        "  });",
        "  if (!response.ok) throw new Error(`Runtime 요청 실패 (HTTP ${response.status}). 자동 재시도하지 않았습니다.`);",
        "  return response;",
        "}",
      ].join("\n"),
      codeEn: [
        "// A request to your own Runtime (simplified): token in a header only, cookies and redirects off, failures are not resent.",
        "export async function runtimeRequest(base: string, token: string, owner: string, path: string, init: RequestInit = {}): Promise<Response> {",
        "  if (!/^\\/[A-Za-z0-9._-]+(?:\\/[A-Za-z0-9._-]+)*$/u.test(path) || path.includes(\"..\")) {",
        '    throw new Error("invalid path");',
        "  }",
        "  const headers = new Headers(init.headers);",
        '  headers.set("Authorization", `Bearer ${token}`);',
        '  headers.set("X-Creator-Owner", owner);',
        "  const response = await fetch(`${base}${path}`, {",
        '    ...init, headers, credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", cache: "no-store",',
        "  });",
        "  if (!response.ok) throw new Error(`Runtime request failed (HTTP ${response.status}). Not retried automatically.`);",
        "  return response;",
        "}",
      ].join("\n"),
      explain: t(
        "personal-inference-client.ts의 request 함수를 줄인 예제입니다. 경로는 영숫자·점·밑줄·하이픈 조각만 허용하고, 토큰은 Authorization 헤더로만 보내며, 실패해도 자동으로 다시 보내지 않습니다. 실제 코드는 응답 크기 상한과 결과 파일 SHA-256 대조도 합니다.",
        "A trimmed request function from personal-inference-client.ts. The path allows only segments of letters, digits, dot, underscore and hyphen, the token goes only in the Authorization header, and a failure is never resent automatically. The real code also caps response size and checks result-file SHA-256.",
      ),
      source: "apps/web/src/domains/creator/ai/personal-inference-client.ts",
      verify: "types",
    },
  ],
  links: [
    {
      title: "FastAPI documentation",
      url: "https://fastapi.tiangolo.com/",
      kind: "docs",
      note: t("참조 서버가 쓰는 파이썬 웹 프레임워크", "The Python web framework used by the reference server"),
    },
    {
      title: "Wan2.1 (GitHub)",
      url: "https://github.com/Wan-Video/Wan2.1",
      kind: "repo",
    },
    {
      title: "TripoSR (GitHub)",
      url: "https://github.com/VAST-AI-Research/TripoSR",
      kind: "repo",
    },
    {
      title: "Stable Diffusion XL base 1.0 (Hugging Face)",
      url: "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0",
      kind: "repo",
      note: t("사용 제한이 있는 OpenRAIL++-M 라이선스를 이 페이지에서 확인", "Check the use-restricted OpenRAIL++-M license on this page"),
    },
    {
      title: "Hugging Face Hub · Download files",
      url: "https://huggingface.co/docs/huggingface_hub/guides/download",
      kind: "docs",
      note: t("revision을 고정해 모델을 받는 방법", "How to download a model at a pinned revision"),
    },
  ],
  chapterIds: ["ai-routing", "cost-engineering", "infrastructure"],
  talk: {
    pitch: t(
      "영상이나 3D를 AI로 만드는 일은 GPU가 필요합니다. 운영 서버가 대신 해 주면 비용이 사용자 수만큼 운영자에게 쌓이므로 그 경로는 꺼 두었고 작업 요청에는 503을 돌려줍니다. 대신 쓰고 싶은 사람이 자기 GPU 서버의 주소와 토큰을 등록하면 브라우저가 직접 연결합니다. 저장소의 Python 서비스는 그 서버의 참조 구현이며, CPU 테스트만 통과했고 GPU 검증은 아직입니다.",
      "Making video or 3D with AI needs a GPU. If the production server did it, cost would pile up on the operator in proportion to users, so that route is off and job requests answer 503. Instead, anyone who wants it registers their own GPU server's address and token, and the browser connects directly. The Python service in the repository is the reference build of that server; it has passed CPU tests only, and GPU validation is still to come.",
    ),
    analogy: t(
      "가게가 주방을 직접 운영하는 대신, 손님이 자기 주방을 가져와 연결하는 방식입니다. 가게는 주문서(작업 요청)만 정확히 주고받습니다.",
      "Instead of the shop running its own kitchen, the guest brings and plugs in their own. The shop only passes order slips (job requests) back and forth accurately.",
    ),
    questions: [
      {
        question: t("영상·3D 기능은 지금 쓸 수 없나요?", "Can't I use the video and 3D features right now?"),
        answer: t(
          "운영 서버 경로로는 쓸 수 없습니다. 내 Runtime을 연결하면 /studio/ai-lab에서 쓸 수 있고, 생성 실험실(/studio/generate)은 모션 웹툰·캐릭터 3D 셰이퍼·3D 배경 스튜디오 같은 직접 만드는 도구를 안내합니다.",
          "Not through the production server. With your own Runtime connected you can use it at /studio/ai-lab, and the generative lab (/studio/generate) points to hands-on tools such as Motion Webtoon, Character Shaper and 3D Background Studio.",
        ),
      },
      {
        question: t("왜 서버에서 GPU를 안 돌리나요?", "Why not run GPUs on the server?"),
        answer: t(
          "GPU 호스팅 비용이 운영자에게 남기 때문입니다. 자체 호스팅 GPU 경로는 2026-09-16 클라우드 전용 계약으로 대체되었고, 운영자 비용으로 돌리는 AI는 기본 비활성입니다.",
          "Because hosting GPUs leaves the cost with the operator. The self-hosted GPU route was superseded by a cloud-only contract on 2026-09-16, and AI paid for by the operator is off by default.",
        ),
      },
      {
        question: t("모델 라이선스는요?", "What about model licenses?"),
        answer: t(
          "README에 Wan은 Apache-2.0, TripoSR은 MIT, SDXL·ControlNet은 사용 제한이 있는 OpenRAIL++-M으로 적혀 있습니다. 모델 파일은 저장소에 넣지 않고, 공개 전에 라이선스와 사용 제한을 검토해야 한다고 명시합니다.",
          "The README lists Wan as Apache-2.0, TripoSR as MIT, and SDXL and ControlNet as the use-restricted OpenRAIL++-M. Model files stay out of the repository, and it states that licenses and use restrictions must be reviewed before release.",
        ),
      },
    ],
    pitfall: t(
      "'영상·3D 생성이 된다'고 말하면 안 됩니다. 운영 API의 작업 경로는 503이고 Python 서비스는 GPU 검증 전입니다. README의 CREATOR_INFERENCE_URL을 읽는 코드도 저장소에 없습니다. 지금 보여 줄 수 있는 것은 '정직하게 꺼 둔 상태'와 직접 연결 규약뿐입니다.",
      "Do not say 'video and 3D generation work'. The production API's job routes answer 503 and the Python service has not been validated on a GPU. No code in the repository reads the README's CREATOR_INFERENCE_URL either. What can honestly be shown today is the deliberately-off state and the direct-connection contract.",
    ),
  },
  technologies: ["FastAPI", "Wan2.1", "TripoSR", "SDXL ControlNet"],
  facts: [
    {
      value: "2 / 12 / 12",
      label: t("사용자당 동시 작업 / 전체 대기·실행 / 하루 접수 기본 한도", "Per-user concurrent / total queued+running / daily submissions (defaults)"),
      source: "services/creator-inference/app.py",
    },
    {
      value: "3,600 s",
      label: t("작업 제한 시간 기본값(CREATOR_JOB_TIMEOUT_SECONDS)", "Default job timeout (CREATOR_JOB_TIMEOUT_SECONDS)"),
      source: "services/creator-inference/app.py",
    },
    {
      value: "503",
      label: t("운영 API 추론 작업 경로의 응답 코드(PERSONAL_CREATOR_RUNTIME_REQUIRED, 상태 조회는 200)", "Response code of the production API inference job routes (PERSONAL_CREATOR_RUNTIME_REQUIRED; the status check is 200)"),
      source: "apps/api/src/modules/studio-ai/creator-inference.controller.ts",
    },
  ],
  reviewedAt: "2026-10-07",
};

export const ENGINEERING_ATLAS_AI_ONDEVICE: readonly EngineeringAtlasEntry[] = [
  ONNX_RUNTIME_WEB_INFERENCE,
  TRANSFORMERS_JS_TRANSLATION,
  CREATOR_INFERENCE_SERVICE,
];
