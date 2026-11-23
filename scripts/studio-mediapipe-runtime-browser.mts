/** 앱의 실제 CSP에서 원래 SDK·모델·추론을 실행한다. 모델과 추론을 모의 구현으로 바꾸지 않는다. */
import { createMediaPipeLoaders } from "../apps/character-lab/src/domains/vision/mediapipe-loader.browser";
import { createStudioLocalForegroundConfidenceProvider } from "../apps/web/src/domains/creator/studio-bg-remove";
import {
  resolveStudioMediaPipeVisionWasmFileset,
  type StudioMediaPipeVisionWasmVariant,
} from "../apps/web/src/domains/creator/studio-mediapipe-vision-assets";
import {
  disposeStudioMannequinHandLandmarker,
  initStudioMannequinHandLandmarker,
} from "../apps/web/src/domains/creator/scene-3d/studio-mannequin-hand-tracking";
import {
  disposeStudioMannequinPoseLandmarker,
  initStudioMannequinPoseLandmarker,
} from "../apps/web/src/domains/creator/scene-3d/studio-mannequin-webcam-tracking";
import { analyzeStudioVrmAvatarReferenceImage } from "../apps/web/src/domains/creator/vrm/studio-vrm-avatar-reference-inference";
import {
  admitStudioVrmAvatarReferenceCatalogueEnvelope,
  STUDIO_VRM_AVATAR_REFERENCE_CATALOGUE_URL,
} from "../apps/web/src/domains/creator/vrm/studio-vrm-avatar-reference-product";
import {
  disposeFaceLandmarker,
  disposeHandLandmarker,
  disposePhotoHandLandmarker,
  disposePhotoPoseLandmarker,
  disposePoseLandmarker,
  initFaceLandmarker,
  initHandLandmarker,
  initPhotoHandLandmarker,
  initPhotoPoseLandmarker,
  initPoseLandmarker,
} from "../apps/web/src/domains/creator/vrm/studio-vrm-webcam-tracking";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function raster() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  check(context, "MediaPipe 검사에 필요한 Canvas2D를 만들지 못했습니다.");
  const gradient = context.createLinearGradient(0, 0, 128, 128);
  gradient.addColorStop(0, "#2358a0");
  gradient.addColorStop(1, "#f2bc5a");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return { canvas, pixels: context.getImageData(0, 0, 128, 128) };
}

function observeFailures() {
  const rejections: string[] = [];
  const blockedMetrics: string[] = [];
  const policyViolations: Array<{ origin: string; directive: string; disposition: string }> = [];
  const rejection = (event: PromiseRejectionEvent) => rejections.push(String(event.reason));
  const violation = (event: SecurityPolicyViolationEvent) => {
    if (event.effectiveDirective === "connect-src" && /^https?:\/\//u.test(event.blockedURI)) {
      const origin = new URL(event.blockedURI).origin;
      policyViolations.push({ origin, directive: event.effectiveDirective, disposition: event.disposition });
      if (origin === "https://odml.pa.googleapis.com") blockedMetrics.push(origin);
    }
  };
  window.addEventListener("unhandledrejection", rejection);
  document.addEventListener("securitypolicyviolation", violation);
  return {
    async finish(requireMetricsBlock: boolean) {
      // close()의 비동기 metrics flush가 처리한 fetch 거절과 CSP 이벤트를 기다린다.
      await new Promise((resolve) => setTimeout(resolve, 200));
      window.removeEventListener("unhandledrejection", rejection);
      document.removeEventListener("securitypolicyviolation", violation);
      check(rejections.length === 0, `MediaPipe unhandled rejection: ${rejections.join("; ")}`);
      check(!requireMetricsBlock || blockedMetrics.length > 0,
        "새 SDK의 사용량 전송을 실제 connect-src 정책이 차단한 증거가 없습니다.");
      return { unhandledRejections: rejections, blockedMetrics, policyViolations };
    },
  };
}

function landmarkCount(
  groups: readonly (readonly { readonly x: number; readonly y: number; readonly z: number }[])[],
  maximum: number,
) {
  check(groups.length <= maximum, "검출 개수가 선택한 모델 한도를 넘었습니다.");
  for (const group of groups) {
    check(group.every((point) => [point.x, point.y, point.z].every(Number.isFinite)),
      "실제 모델이 유한하지 않은 랜드마크를 반환했습니다.");
  }
  return groups.length;
}

/** 정확한 capability probe만 미지원으로 만든다. 실제 WASM 바이트와 추론은 바꾸지 않는다. */
function selectNegativeProbe(variant: StudioMediaPipeVisionWasmVariant) {
  const validate = WebAssembly.validate;
  const capabilityProbe = [0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3,
    2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11];
  let negativeProbes = 0;
  if (variant === "nosimd") {
    WebAssembly.validate = (source) => {
      const bytes = ArrayBuffer.isView(source)
        ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
        : new Uint8Array(source);
      if (bytes.length === capabilityProbe.length
        && bytes.every((byte, index) => byte === capabilityProbe[index])) {
        negativeProbes += 1;
        return false;
      }
      return validate(source);
    };
  }
  return { restore: () => { WebAssembly.validate = validate; }, count: () => negativeProbes };
}

/** 실시간·사진 모드를 포함한 8개 프로덕션 classic-loader factory를 실행한다. */
export async function runStudioMediaPipeProbe(variant: StudioMediaPipeVisionWasmVariant) {
  const observation = observeFailures();
  const probe = selectNegativeProbe(variant);
  const { canvas } = raster();
  const video = document.createElement("video");
  const stream = canvas.captureStream(30);
  video.srcObject = stream;
  video.muted = true;
  const checks: Array<{ owner: string; detections: number; closed: boolean }> = [];
  try {
    await video.play();
    const selection = await resolveStudioMediaPipeVisionWasmFileset();
    check(selection.variant === variant, "실제 capability 선택이 요청한 검사 경로와 다릅니다.");
    check(selection.providerVersion === (variant === "simd" ? "1.2.3" : "0.10.35"),
      "SDK 버전과 WASM variant가 일치하지 않습니다.");
    async function execute<T>(owner: string, create: () => Promise<T>, infer: (task: T) => number, close: () => void) {
      console.info("[mediapipe-case]", owner, "initializing");
      const task = await create();
      let detections: number;
      try { detections = infer(task); }
      finally { close(); }
      checks.push({ owner, detections, closed: true });
      console.info("[mediapipe-case]", owner, "passed");
    }
    await execute("vrm-video-face", () => initFaceLandmarker(),
      (task) => landmarkCount(task.detectForVideo(video, performance.now()).faceLandmarks, 1), disposeFaceLandmarker);
    await execute("vrm-video-pose", () => initPoseLandmarker(),
      (task) => landmarkCount(task.detectForVideo(video, performance.now()).landmarks, 1), disposePoseLandmarker);
    await execute("vrm-video-hand", () => initHandLandmarker(),
      (task) => landmarkCount(task.detectForVideo(video, performance.now()).landmarks, 2), disposeHandLandmarker);
    await execute("vrm-photo-pose", () => initPhotoPoseLandmarker(),
      (task) => landmarkCount(task.detect(canvas).landmarks, 1), disposePhotoPoseLandmarker);
    await execute("vrm-photo-hand", () => initPhotoHandLandmarker(),
      (task) => landmarkCount(task.detect(canvas).landmarks, 2), disposePhotoHandLandmarker);
    await execute("mannequin-video-pose", () => initStudioMannequinPoseLandmarker(),
      (task) => landmarkCount(task.detectForVideo(video, performance.now()).landmarks ?? [], 1), disposeStudioMannequinPoseLandmarker);
    await execute("mannequin-video-hand", () => initStudioMannequinHandLandmarker(),
      (task) => landmarkCount(task.detectForVideo(video, performance.now()).landmarks ?? [], 2), disposeStudioMannequinHandLandmarker);
    const foreground = await createStudioLocalForegroundConfidenceProvider()
      .getForegroundConfidenceMask(canvas.toDataURL("image/png"));
    check(foreground.receipt.providerVersion === selection.providerVersion,
      "전경 분리 영수증이 실제 선택한 SDK 버전과 다릅니다.");
    check(foreground.receipt.activeDelegate === "GPU", "제품 기본 GPU가 다른 delegate로 바뀌었습니다.");
    check(foreground.confidence.length === foreground.width * foreground.height
      && foreground.confidence.length > 0
      && foreground.confidence.every((value) => Number.isFinite(value) && value >= 0 && value <= 1),
    "실제 전경 분리 마스크가 크기·유한값 계약을 만족하지 않습니다.");
    check(variant !== "nosimd" || probe.count() === 9,
      "공통 선택 검사와 8개 factory가 각각 한 번씩 negative probe를 거치지 않았습니다.");
    return {
      scope: "Studio production factories", selection, selectedDelegate: "GPU", checks,
      foreground: { receipt: foreground.receipt, maskPixels: foreground.confidence.length,
        lifetime: "production singleton; released with page" },
      negativeProbes: probe.count(), ...await observation.finish(variant === "simd"),
    };
  } finally {
    probe.restore();
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }
}

/** 9번째 Studio factory는 기존부터 공식 SIMD module-worker loader를 사용한다. */
export async function runStudioMediaPipeWorkerProbe() {
  const observation = observeFailures();
  const response = await fetch(STUDIO_VRM_AVATAR_REFERENCE_CATALOGUE_URL);
  check(response.ok, "기존 아바타 참조 catalogue를 읽지 못했습니다.");
  const input: unknown = await response.json();
  const envelope = admitStudioVrmAvatarReferenceCatalogueEnvelope(input);
  check(envelope, "기존 catalogue 생성 영수증이 달라졌습니다.");
  const { canvas } = raster();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("검사 PNG 생성 실패")), "image/png");
  });
  const receipt = await analyzeStudioVrmAvatarReferenceImage(
    new File([blob], "mediapipe-local-fixture.png", { type: "image/png" }), envelope.catalogue,
  );
  check(receipt.recommendations.length === 3
    && receipt.recommendations.every((entry) => Number.isFinite(entry.similarity)),
  "실제 module Worker의 임베딩·추천 결과가 유효하지 않습니다.");
  check(/^[a-f0-9]{64}$/u.test(receipt.queryEmbeddingSha256), "실제 query embedding 해시가 없습니다.");
  return { scope: "Studio SIMD module Worker", providerVersion: "1.2.3", receipt,
    historicalCatalogueVersion: envelope.authority.packages.mediaPipeTasksVision,
    ...await observation.finish(false) };
}

/** Character Lab의 기존 3개 명시적 SIMD factory와 CPU 기본값을 검증한다. */
export async function runCharacterLabMediaPipeProbe() {
  const observation = observeFailures();
  const { pixels } = raster();
  const loaders = createMediaPipeLoaders();
  const checks: Array<{ key: string; pinned: boolean; bytes: number; sha256: string; closed: boolean }> = [];
  const embedder = await loaders.imageEmbedder();
  try {
    const embedding = await embedder.port.embed(pixels);
    check(embedding.length === 1024 && embedding.every(Number.isFinite), "Character Lab 실제 임베딩 계약 불일치");
    check(embedder.pinned && embedder.delegate === "CPU", "Character Lab 모델 고정·CPU 기본값이 바뀌었습니다.");
  } finally { embedder.dispose(); }
  checks.push({ key: embedder.key, pinned: embedder.pinned, bytes: embedder.bytes, sha256: embedder.observedSha256, closed: true });
  const pose = await loaders.poseLandmarker();
  try {
    const result = await pose.port.detect(pixels);
    check(result === null || result.landmarks.length === 33, "Character Lab 실제 포즈 결과 불일치");
    check(pose.pinned && pose.delegate === "CPU", "Character Lab 포즈 모델 고정·delegate 불일치");
  } finally { pose.dispose(); }
  checks.push({ key: pose.key, pinned: pose.pinned, bytes: pose.bytes, sha256: pose.observedSha256, closed: true });
  const hand = await loaders.handLandmarker();
  try {
    const result = await hand.port.detect(pixels);
    check(result.length <= 2 && result.every((entry) => entry.landmarks.length === 21), "Character Lab 실제 손 결과 불일치");
    check(hand.pinned && hand.delegate === "CPU", "Character Lab 손 모델 고정·delegate 불일치");
  } finally { hand.dispose(); }
  checks.push({ key: hand.key, pinned: hand.pinned, bytes: hand.bytes, sha256: hand.observedSha256, closed: true });
  return { scope: "Character Lab production factories", providerVersion: "1.2.3", checks,
    ...await observation.finish(true) };
}
