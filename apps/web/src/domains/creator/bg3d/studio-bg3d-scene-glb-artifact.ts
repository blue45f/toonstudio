import { DirectionalLight, Object3D } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { readStudioVrmExportGlb, writeStudioVrmExportGlb } from "../vrm/studio-vrm-export-glb-container";
import { revalidateStoredBg3dModelForRendering } from "./bg3d-model-library";
import { buildStudioBg3dSceneGlbGraph, type StudioBg3dSceneGlbModelRoot } from "./studio-bg3d-scene-glb-graph";
import { createStudioBg3dSceneGlbCamera, finalizeStudioBg3dSceneGlbCamera } from "./studio-bg3d-scene-glb-camera";
import { StudioBg3dSceneGlbError, type StudioBg3dSceneGlbSource } from "./studio-bg3d-scene-glb-source";
import { assertStudioBg3dPreExportBudgets } from "./studio-bg3d-pre-export-budget";
import { validateStudioBg3dGlbOffMainThread } from "./studio-bg3d-glb-validation-worker-client";
import { STUDIO_BG3D_CANONICAL_REQUIRED_GLTF_EXTENSIONS } from "./studio-bg3d-meshopt";
import { canonicalStudioBg3dGlbFileName } from "./studio-bg3d-canonical-glb-download";
import { createStudioBg3dSceneGlbTextureExport, StudioBg3dSceneGlbTextureExportError,
  type StudioBg3dSceneGlbTextureExportSupport } from "./studio-bg3d-scene-glb-texture-export";
import { createStudioBg3dSceneGlbImageReplacementRegistry, StudioBg3dSceneGlbExactImageError } from "./studio-bg3d-scene-glb-exact-images";
import { prepareStudioBg3dSceneGlbTextureImages, StudioBg3dSceneGlbMetalRoughBridgeError,
  type StudioBg3dSceneGlbPreparedTextureImages } from "./studio-bg3d-scene-glb-texture-image-bridge";
import { prepareStudioBg3dSceneGlbExportProvenance, assertStudioBg3dSceneGlbExportProvenanceSource,
  assertStudioBg3dSceneGlbExportProvenanceCurrent, type StudioBg3dSceneGlbExportProvenance } from "./studio-bg3d-scene-glb-export-provenance";
import type { StudioBg3dLibrariesAuthority } from "./studio-bg3d-libraries-sqlite-opfs-authority";

export interface StudioBg3dSceneGlbArtifact {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly contentHash: `sha256:${string}`;
  readonly exportedNodeCount: number;
  readonly hiddenNodeCount: number;
  readonly exportProvenance?: StudioBg3dSceneGlbExportProvenance;
}
export interface StudioBg3dSceneGlbArtifactOptions {
  readonly name: string;
  readonly signal: AbortSignal;
  readonly assertCurrent: () => void;
  /** 테스트도 같은 엄격한 검증 구현을 쓴다. 제품에서는 Worker를 지정한다. */
  readonly validationBackend?: "worker" | "direct";
  readonly provenanceAuthority?: StudioBg3dLibrariesAuthority;
  readonly exportProvenance?: StudioBg3dSceneGlbExportProvenance;
}

function addDirectionalLight(scene: Object3D, name: string, light: StudioBg3dSceneGlbSource["document"]["lighting"]["key"]): void {
  const result = new DirectionalLight(light.color, light.intensity);
  result.name = name;
  result.position.set(...light.direction);
  result.target.position.set(0, 0, 0);
  result.lookAt(result.target.position);
  // glTF의 광선은 노드의 로컬 -Z를 향한다. exporter가 같은 방향을 기록하는 target 계약을 만든다.
  result.target.position.set(0, 0, -1);
  result.add(result.target);
  result.castShadow = light.castsShadow;
  scene.add(result);
}
async function digest(bytes: Uint8Array): Promise<`sha256:${string}`> {
  const hash = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return `sha256:${Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, "0")).join("")}`;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

/** 원본 Blob을 다시 검증한 개인 사본과 현재 배치로 자립형 GLB를 만든다. 저장소·문서·렌더 캐시는 쓰지 않는다. */
export async function createStudioBg3dSceneGlbArtifact(source: StudioBg3dSceneGlbSource, options: StudioBg3dSceneGlbArtifactOptions): Promise<StudioBg3dSceneGlbArtifact> {
  const check = () => {
    if (options.signal.aborted) throw new StudioBg3dSceneGlbError("aborted", "장면 GLB 저장을 취소했습니다.");
    options.assertCurrent();
  };
  check();
  const exportProvenance = options.exportProvenance ?? await prepareStudioBg3dSceneGlbExportProvenance(source,
    { signal: options.signal, assertCurrent: check, authority: options.provenanceAuthority, executionBackend: options.validationBackend ?? "worker" });
  assertStudioBg3dSceneGlbExportProvenanceSource(exportProvenance, source);
  check();
  const camera = createStudioBg3dSceneGlbCamera({ camera: source.framing.view, aspectRatio: source.framing.viewportAspect,
    orthographicFrustumAtZoomOne: source.framing.orthographicFrustumAtZoomOne, signal: options.signal });
  if (!camera.ok) throw new StudioBg3dSceneGlbError("unsupported-scene", camera.messageKo);
  const modelRoots = new Map<string, StudioBg3dSceneGlbModelRoot>();
  let usedBytes = 0;
  for (const [attachmentId, asset] of source.assets) {
    check();
    const validated = await revalidateStoredBg3dModelForRendering(asset.entry.record, {
      profile: source.policy.profile, budgets: source.policy.budgets, executionBackend: options.validationBackend ?? "worker",
      signal: options.signal, cumulativeUsedBytes: usedBytes,
      maximumCumulativeBytes: source.policy.budgets[source.policy.profile].complexity.maxModelBytes,
    });
    check();
    if (validated.verifiedSha256 !== asset.attachment.hash || validated.verifiedBytes.byteLength !== asset.attachment.byteSize) {
      throw new StudioBg3dSceneGlbError("asset-invalid", "모델 원본의 실제 바이트가 장면의 검증 정보와 다릅니다.");
    }
    usedBytes += validated.verifiedBytes.byteLength;
    modelRoots.set(attachmentId, { root: asset.root, animations: asset.entry.animations, sourceBytes: Uint8Array.from(validated.verifiedBytes) });
  }
  const graph = await buildStudioBg3dSceneGlbGraph({ document: source.document, modelRoots,
    animationTimeSecondsByNodeId: source.animationTimeSecondsByNodeId, signal: options.signal, metalRoughPacking: "deferred-owned" });
  if (!graph.ok) {
    const names = (graph.nodeIds ?? []).slice(0, 5).map((id) => source.document.nodes.find((node) => node.id === id)?.name).filter(Boolean);
    throw new StudioBg3dSceneGlbError(graph.code === "aborted" ? "aborted" : "unsupported-scene", names.length ? `${names.join(", ")} — ${graph.messageKo}` : graph.messageKo);
  }
  let textures: StudioBg3dSceneGlbTextureExportSupport | null = null;
  let preparedImages: StudioBg3dSceneGlbPreparedTextureImages | null = null;
  let disposeImages: (() => void) | undefined;
  let artifact: StudioBg3dSceneGlbArtifact;
  try {
    check();
    const images = createStudioBg3dSceneGlbImageReplacementRegistry({ signal: options.signal,
      maximumBytes: source.policy.budgets[source.policy.profile].complexity.maxModelBytes,
      maximumRgbaBytes: source.policy.budgets[source.policy.profile].textures.maxTotalBytes });
    disposeImages = images.dispose;
    graph.scene.name = options.name.trim() || "ToonStudio 장면";
    graph.scene.add(camera.value.camera);
    addDirectionalLight(graph.scene, "ToonStudio 주광", source.document.lighting.key);
    addDirectionalLight(graph.scene, "ToonStudio 보조광", source.document.lighting.fill);
    graph.scene.userData = { toonstudioSceneExport: {
      format: "toonstudio.bg3d-scene-glb", version: 1, units: "meters", upAxis: "Y",
      geometryScope: "effectively-visible", hiddenNodeIds: [...graph.hiddenNodeIds],
      sectionPlaneMetadataOnly: source.sectionPlane,
      sceneDocument: structuredClone(source.document), sourceMetadata: graph.sourceMetadata,
      animationState: graph.animationState,
      presentationMetadataOnly: ["background", "ambient-and-environment-lighting", "render-and-output-effects", "section-clipping", "shadow-settings"],
    } };
    graph.scene.updateMatrixWorld(true);
    assertStudioBg3dPreExportBudgets({ root: graph.scene, animations: [...graph.animations] }, options.signal,
      source.policy.budgets[source.policy.profile]);
    check();
    textures = await createStudioBg3dSceneGlbTextureExport(graph.scene, { engine: source.rendererEngine, signal: options.signal });
    check();
    preparedImages = await prepareStudioBg3dSceneGlbTextureImages({ root: graph.scene, support: textures, registry: images,
      signal: options.signal, assertCurrent: check, maximumBytes: source.policy.budgets[source.policy.profile].complexity.maxModelBytes,
      maximumRgbaBytes: source.policy.budgets[source.policy.profile].textures.maxTotalBytes });
    check();
    const exporter = new GLTFExporter(); exporter.setTextureUtils(textures.textureUtils);
    exporter.register(() => images.plugin);
    const exported = await exporter.parseAsync(graph.scene, { binary: true, onlyVisible: true,
      animations: [...graph.animations], includeCustomExtensions: true, maxTextureSize: Infinity });
    check();
    if (!(exported instanceof ArrayBuffer)) throw new StudioBg3dSceneGlbError("export-failed", "완전한 GLB 파일을 생성하지 못했습니다.");
    const finalized = finalizeStudioBg3dSceneGlbCamera(images.replaceGlbImages(new Uint8Array(exported)), camera.value, options.signal);
    if (!finalized.ok) throw new StudioBg3dSceneGlbError("export-failed", finalized.messageKo);
    const container = readStudioVrmExportGlb(finalized.value);
    const attribution = [...new Set([...source.assets.values()].map(({ attachment }) => attachment.rights.attribution).filter((value): value is string => Boolean(value)))];
    if (attribution.length > 0 && isRecord(container.json.asset)) {
      container.json.asset.copyright = attribution.join("\n");
    }
    const bytes = writeStudioVrmExportGlb({ json: container.json, binary: container.binary });
    const contentHash = await digest(bytes);
    check();
    const validation = await validateStudioBg3dGlbOffMainThread(bytes, {
      declared: { byteSize: bytes.byteLength, sha256: contentHash, mimeType: "model/gltf-binary" },
      cumulative: { usedBytes: 0, maximumBytes: source.policy.budgets[source.policy.profile].complexity.maxModelBytes },
      profile: source.policy.profile, budgets: source.policy.budgets,
      supportedRequiredExtensions: STUDIO_BG3D_CANONICAL_REQUIRED_GLTF_EXTENSIONS,
    }, { executionBackend: options.validationBackend ?? "worker", signal: options.signal });
    check();
    if (!validation.result.ok) throw new StudioBg3dSceneGlbError("export-failed", "생성한 장면 GLB가 안전·형상·텍스처 예산 검사를 통과하지 못했습니다.");
    artifact = { bytes: Uint8Array.from(validation.result.verifiedBytes), fileName: canonicalStudioBg3dGlbFileName(options.name),
      contentHash, exportedNodeCount: source.document.nodes.length - graph.hiddenNodeIds.length, hiddenNodeCount: graph.hiddenNodeIds.length,
      exportProvenance };
  } catch (error) {
    if (error instanceof StudioBg3dSceneGlbMetalRoughBridgeError) throw new StudioBg3dSceneGlbError(error.code === "aborted" ? "aborted"
      : error.code === "unsupported-feature" ? "unsupported-scene" : "export-failed", error.message);
    if (error instanceof StudioBg3dSceneGlbTextureExportError) throw new StudioBg3dSceneGlbError(error.code === "aborted" ? "aborted" : "export-failed", error.message);
    if (error instanceof StudioBg3dSceneGlbExactImageError) throw new StudioBg3dSceneGlbError(error.code === "aborted" ? "aborted" : "export-failed", error.message);
    throw error;
  } finally {
    try { preparedImages?.dispose(); } finally {
      try { await textures?.dispose(); } finally { try { disposeImages?.(); } finally { graph.dispose(); } }
    }
  }
  await assertStudioBg3dSceneGlbExportProvenanceCurrent(exportProvenance, source);
  check();
  return artifact;
}
