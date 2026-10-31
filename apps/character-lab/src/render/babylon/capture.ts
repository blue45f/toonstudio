/**
 * 멀티패스 캡처·썸네일: 요청 해상도 RenderTargetTexture(RGBA8, mip 없음, flat/lit는 MSAA, 작은 크기는 장면별 풀 재사용 — capture-targets.ts)에 패스별 재질을
 * `setMaterialForRendering`으로 바꿔 끼워 그린 뒤 readback(WebGL2는 PBO 비동기) → export/raster-convert로 top-down straight sRGB 규약으로
 * 바꾼다(backend별 flipY/premultiplied 상수는 readback.ts). readback이 null인 레인(NullEngine)은 파츠 AABB를 투영한
 * 합성 래스터로 대체하고 provenance.synthetic=true를 표시한다. swap chain은 읽지 않는다.
 *
 * 패스: flat=밑색(clFlat) · lit=현재 재질(PBR/툰) · normal=clNormal · depth=clDepth(RGBA8 패킹 24+8bit, decodeDepth rgba-packed)
 *       · part-id/material-id=clId(R=partId&255, G=partId>>8, B=materialId, A=255).
 *
 * 일시 적용(`around`): 썸네일처럼 주 리그에 플랜을 잠깐 적용해 그릴 때, 셰이더 컴파일 대기(비동기)는 적용 **전에** 끝내고
 * "적용 → 프레이밍 → RTT 렌더 → readPixels 호출 → 복원"을 한 번의 동기 구간으로 묶는다. GPU readback 대기(비동기) 동안
 * 뷰포트 프레임이 썸네일 플랜을 그리지 않도록 하기 위해서다(깜빡임 방지). 복원은 `readPixels()` 호출 직후이므로 렌더 명령은
 * 이미 제출된 뒤다(WebGL·WebGPU 모두 제출 순서대로 실행).
 */
import { Color4 } from "@babylonjs/core/Maths/math.color.js";

import { CAPTURE_PROFILE_ID, estimateCaptureBytes, failVisible } from "../../contracts";
import { decodeDepth, toCapturedRaster } from "../../export/raster-convert";
import { hexToSrgb01 } from "../../shared/color";
import { waitUntilReady } from "../material-readiness";
import { DEPTH_CLEAR_RGBA01, RTT_READBACK_FLIP_Y, RTT_READBACK_PREMULTIPLIED, rasterizeSyntheticDepth, rasterizeSyntheticPass } from "../readback";
import { projectAabb } from "../synthetic-projection";

import { acquireCaptureTarget, readCaptureTarget } from "./capture-targets";
import { computeRigBounds, rigVisibleMeshes } from "./character-rig";
import { fromVector3 } from "./convert";
import { prepareHairOwnership } from "./hair-ownership";
import { restorePendingPressureGarmentStencil } from "./pressure-garment-stencil";

import type { CameraFraming, CaptureProvenance, CaptureRequest, CaptureResult, CapturedDepth, CapturedRaster, HairOwnership, RasterPassId, RenderPassId } from "../../contracts";
import type { ReadbackLane, SyntheticBox } from "../readback";
import type { CharacterRig, RigPart } from "./character-rig";
import type { PreparedHairOwnership } from "./hair-ownership";
import type { CharacterScene } from "./scene-builder";
import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";

/** 캡처 readback 메모리 상한(모든 패스 합계) */
export const CAPTURE_BYTE_BUDGET = 256 * 1024 * 1024;
/**
 * 셰이더 컴파일·텍스처 준비 대기 상한. 소프트웨어 렌더러(SwiftShader)에서 PBR 한 변종이 약 10초 걸리고 변종이 여럿이면 합쳐 수십 초가 되므로
 * 넉넉히 둔다(실 GPU는 보통 1초 안). 넘으면 `capture-shader-timeout`으로 실패한다(투명 결과를 조용히 돌려주지 않는다).
 */
export const CAPTURE_COMPILE_TIMEOUT_MS = 90_000;

export interface PassMaterialSet {
  flat(part: RigPart): ShaderMaterial;
  id(part: RigPart): ShaderMaterial;
  normal(): ShaderMaterial;
  depth(near: number, far: number): ShaderMaterial;
}

export interface CaptureDeps {
  readonly scene: Scene;
  readonly character: CharacterScene;
  readonly lane: ReadbackLane;
  readonly rig: CharacterRig;
  readonly passMaterials: PassMaterialSet;
  readonly shadow: ShadowGenerator | null;
  /** toon·hull일 때 outline 셸 포함 */
  readonly includeOutlines: boolean;
  /** 런타임 역방향 hull. lit에만 포함하고 밑색·ID·법선·깊이에는 넣지 않는다. */
  readonly pressureOutlines?: () => readonly Mesh[];
  /** 패스 셰이더 컴파일 완료를 기다릴지(GPU 레인 true, NullEngine은 컴파일하지 않으므로 false) */
  readonly waitForShaders: boolean;
  /** 컴파일 대기 상한(ms) 덮어쓰기. 기본 `CAPTURE_COMPILE_TIMEOUT_MS`. 테스트가 시간 초과 경로를 짧게 검증한다. */
  readonly compileTimeoutMs?: number;
  readonly provenance: Omit<CaptureProvenance, "synthetic" | "backend">;
  readonly now: number;
}

function validateRequest(deps: CaptureDeps, width: number, height: number, passes: readonly RenderPassId[], includeHairOwnership = false): void {
  const maxSize = deps.scene.getEngine().getCaps().maxTextureSize;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw failVisible("capture-size-invalid", `캡처 크기는 1 이상 정수여야 합니다(${width}×${height}).`, undefined, deps.now);
  }
  if (width > maxSize || height > maxSize) {
    throw failVisible("capture-size-exceeds-texture", `캡처 크기 ${width}×${height}가 엔진 최대 텍스처 ${maxSize}px를 넘습니다.`, undefined, deps.now);
  }
  const bytes = estimateCaptureBytes({ width, height, passes, includeHairOwnership });
  if (bytes > CAPTURE_BYTE_BUDGET) {
    throw failVisible("capture-too-large", `캡처 readback ${Math.round(bytes / 1048576)}MiB가 예산 ${CAPTURE_BYTE_BUDGET / 1048576}MiB를 넘습니다. 해상도나 패스 수를 줄이세요.`, undefined, deps.now);
  }
}

/**
 * SSS(PrePass SubSurface) 재질을 **동기 구간 동안만** 일반 PBR로 바꿔 `fn`을 실행하고 되돌린다. 피부 SSS는 PrePass 렌더 타깃이 확산광을 합성할 때만
 * 보이는 화면 공간 효과라 캡처용 RTT(PrePass 없음)에서 그리면 피부가 **검게** 나온다(브라우저 실측). 캡처·썸네일 lit 패스는 SSS 없이 그린다 —
 * 뷰포트(씬 렌더)는 SSS를 그대로 쓴다. 동기 구간이라 뷰포트 프레임이 중간 상태를 그리지 않는다.
 */
export function withScatteringOff<T>(rig: CharacterRig, enabled: boolean, fn: () => T): T {
  if (!enabled) return fn();
  const restore: Array<() => void> = [];
  for (const part of rig.parts) {
    const material = part.meshes[0]?.material;
    if (!material) continue;
    if (material === part.pbr) {
      const subSurface = part.pbr.subSurface;
      if (subSurface.isScatteringEnabled) {
        subSurface.isScatteringEnabled = false;
        restore.push(() => {
          subSurface.isScatteringEnabled = true;
        });
      }
      continue;
    }
    // OpenPBR(베타)는 subsurfaceWeight가 SSS 가중치다.
    const openPbr = material as unknown as { subsurfaceWeight?: unknown };
    if (typeof openPbr.subsurfaceWeight === "number" && openPbr.subsurfaceWeight > 0) {
      const previous = openPbr.subsurfaceWeight;
      (openPbr as { subsurfaceWeight: number }).subsurfaceWeight = 0;
      restore.push(() => {
        (openPbr as { subsurfaceWeight: number }).subsurfaceWeight = previous;
      });
    }
  }
  try {
    return fn();
  } finally {
    for (const undo of restore) undo();
  }
}

/** 캡처 lit는 카메라 후처리 없이 직접 색을 쓴다. 준비와 draw를 같은 변종으로 맞추고 뷰포트 설정은 동기 구간 뒤 복원한다. */
function withCaptureProcessing<T>(deps: CaptureDeps, lit: boolean, fn: () => T): T {
  if (!lit) return fn();
  const configuration = deps.scene.imageProcessingConfiguration;
  const previous = configuration.applyByPostProcess;
  configuration.applyByPostProcess = false;
  try { return withScatteringOff(deps.rig, true, fn); }
  finally { configuration.applyByPostProcess = previous; }
}

/**
 * 준비 검사 한 번(동기 구간)에 쓰는 시간 상한(ms). 새 셰이더 변종을 만드는 `isReady`는 JS 전처리가 무거워(개발 서버에서 변종 하나 20~60 ms)
 * 여러 재질을 한 태스크에 몰면 수백 ms long task가 된다(실측 2026-10-23: 카드 1회 620~811 ms). 상한을 넘으면 나머지는 다음 폴링에서 검사한다.
 */
export const READINESS_SLICE_MS = 24;

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function materialReady(mesh: Mesh, material: Material, nativeOutlines: boolean): boolean {
  // 이전 셰이더로 그릴 수 있다는 hot-swap 성공은 현재 캡처 변종의 준비 완료가 아니다.
  const hotSwapping = material.allowShaderHotSwapping;
  material.allowShaderHotSwapping = false;
  try {
    const instances = mesh.hasThinInstances || mesh.instances.length > 0;
    // Babylon 9.31의 실제 Mesh.render와 같은 저장 위치를 검사한다. material.isReady만 호출하면 기본 wrapper만 준비되고 RTT 서브메시는 빠진다.
    const ready = material._storeEffectOnSubMeshes
      ? (mesh.subMeshes ?? []).every((subMesh) => material.isReadyForSubMesh(mesh, subMesh, instances))
      : material.isReady(mesh, instances);
    if (!ready) return false;
    if (nativeOutlines && (mesh.renderOutline || mesh.renderOverlay)) {
      const renderer = mesh.getScene().getOutlineRenderer();
      if (!(mesh.subMeshes ?? []).every((subMesh) => renderer.isReady(subMesh, instances))) return false;
    }
    return true;
  } finally { material.allowShaderHotSwapping = hotSwapping; }
}

async function ensureReady(deps: CaptureDeps, rtt: RenderTargetTexture, pairs: ReadonlyArray<readonly [Mesh, Material]>, scatteringOff: boolean, shadow?: RenderTargetTexture | null): Promise<void> {
  if (!deps.waitForShaders) return;
  // forceCompilationAsync는 임시 서브메시로 컴파일해 실제 렌더 변종과 어긋날 수 있다 → 실제 isReady를 폴링한다(material-readiness.ts).
  // lit 패스는 SSS 없는 변종으로 그리므로 그 변종의 준비 여부를 본다(검사 호출이 변종 컴파일을 시작시킨다).
  // SSS 토글은 재질을 dirty로 표시하므로(장면 메시를 훑는다) 폴링 한 번에 **한 번만** 끄고 검사한다 — 쌍마다 토글하면
  // 폴링 1회 비용이 쌍 수 × 파츠 수가 된다(실측: 헤어 카드 1회에 5초).
  const timeoutMs = deps.compileTimeoutMs ?? CAPTURE_COMPILE_TIMEOUT_MS;
  // 리그 바인딩·플랜 적용(호출자와 같은 태스크)과 셰이더 준비 검사를 다른 태스크로 나눈다(입력·뷰포트 프레임이 끼어들게).
  await yieldToMainThread();
  const ready = pairs.map(() => false);
  let cursor = 0;
  let pending = pairs.length;
  const sweep = (): boolean => {
    const engine = deps.scene.getEngine();
    const previousPass = engine.currentRenderPassId;
    engine.currentRenderPassId = rtt.renderPassId;
    try { return withCaptureProcessing(deps, scatteringOff, () => {
      // 첫 장면 프레임 전에도 CSM의 실제 패스·투명도 변종을 준비한다. 준비 검사는 그림자 draw를 제출하지 않는다.
      const shadowReady = !shadow || shadow.isReadyForRendering();
      const started = performance.now();
      // 1) 아직 준비되지 않은 쌍을 시간 상한 안에서 차례로 검사한다(상한을 넘으면 다음 폴링이 이어서 본다).
      for (let step = 0; step < pairs.length; step += 1) {
        const index = (cursor + step) % pairs.length;
        const pair = pairs[index];
        if (ready[index] || !pair) continue;
        ready[index] = materialReady(pair[0], pair[1], scatteringOff);
        if (performance.now() - started > READINESS_SLICE_MS) {
          cursor = (index + 1) % pairs.length;
          break;
        }
      }
      pending = ready.reduce((count, value) => count + (value ? 0 : 1), shadowReady ? 0 : 1);
      if (pending > 0) return false;
      // 2) 모두 한 번씩 준비됐으면 같은 동기 구간에서 전체를 다시 확인한다(그사이 dirty가 된 재질을 놓치지 않는다).
      for (let index = 0; index < pairs.length; index += 1) {
        const pair = pairs[index];
        if (pair && !materialReady(pair[0], pair[1], scatteringOff)) {
          ready[index] = false;
          pending += 1;
        }
      }
      return pending === 0;
    }); } finally { engine.currentRenderPassId = previousPass; }
  };
  const result = await waitUntilReady([sweep], { timeoutMs });
  if (!result.ready) {
    throw failVisible(
      "capture-shader-timeout",
      `캡처 셰이더 컴파일·텍스처 준비가 ${timeoutMs >= 1000 ? `${Math.round(timeoutMs / 1000)}초` : `${timeoutMs}ms`} 안에 끝나지 않았습니다(미준비 ${pending}개). 소프트웨어 렌더러에서는 오래 걸릴 수 있습니다.`,
      undefined,
      deps.now,
    );
  }
}

function syntheticBoxes(deps: CaptureDeps, camera: ArcRotateCamera, width: number, height: number): SyntheticBox[] {
  const view = camera.getViewMatrix(true).m;
  const projection = camera.getProjectionMatrix(true).m;
  const boxes: SyntheticBox[] = [];
  for (const part of deps.rig.parts) {
    if (!part.visible || part.forceHidden) continue;
    const srgb = hexToSrgb01(part.colorHex) ?? [0.5, 0.5, 0.5];
    const color: readonly [number, number, number] = [Math.round(srgb[0] * 255), Math.round(srgb[1] * 255), Math.round(srgb[2] * 255)];
    for (const mesh of part.meshes) {
      if (mesh.getTotalVertices() === 0) continue;
      mesh.computeWorldMatrix(true);
      const box = mesh.getBoundingInfo().boundingBox;
      const projected = projectAabb(fromVector3(box.minimumWorld), fromVector3(box.maximumWorld), view, projection, width, height, camera.minZ, camera.maxZ);
      if (!projected) continue;
      boxes.push({ partId: part.partId, materialId: part.materialId, ...projected, color, normal: [0, 0, 1] });
    }
  }
  return boxes;
}

/** 이 패스가 메시에 쓰는 재질(패스 재질 또는 현재 재질) */
function passMaterialFor(deps: CaptureDeps, camera: ArcRotateCamera, pass: RenderPassId, part: RigPart | undefined, mesh: Mesh): Material | null {
  let material: Material | null = null;
  if (pass === "flat" && part) material = deps.passMaterials.flat(part);
  else if ((pass === "part-id" || pass === "material-id") && part) material = deps.passMaterials.id(part);
  else if (pass === "normal") material = deps.passMaterials.normal();
  else if (pass === "depth") material = deps.passMaterials.depth(camera.minZ, camera.maxZ);
  return material ?? mesh.material;
}

function partOfMesh(deps: CaptureDeps, mesh: Mesh): RigPart | undefined {
  return deps.rig.parts.find((candidate) => candidate.meshes.includes(mesh) || candidate.outlineMeshes.includes(mesh));
}

/** 캡처 한 패스가 만든 결과(readback이 없으면 합성 상자 스냅샷) */
interface PassRenderResult {
  readonly bytes: Uint8Array | Uint8ClampedArray | null;
  /** readback이 없을 때(NullEngine) 일시 적용 구간 안에서 만든 합성 상자 */
  readonly boxes: SyntheticBox[] | null;
  readonly hairOwnership?: HairOwnership;
}

/** 비주선 패스에는 Babylon의 암묵적인 hull·edge·overlay 드로도 넣지 않는다. 동기 RTT 제출 직후 복원한다. */
export function withNativeOutlinesOff<T>(meshes: readonly Mesh[], off: boolean, draw: () => T): T {
  if (!off) return draw();
  const restore = meshes.map((mesh) => {
    const outline = mesh.renderOutline;
    const overlay = mesh.renderOverlay;
    const edges = mesh.edgesRenderer;
    const edgesEnabled = edges?.isEnabled;
    mesh.renderOutline = false;
    mesh.renderOverlay = false;
    if (edges) edges.isEnabled = false;
    return () => {
      mesh.renderOutline = outline;
      mesh.renderOverlay = overlay;
      if (edges && edgesEnabled !== undefined) edges.isEnabled = edgesEnabled;
    };
  });
  try { return draw(); } finally { restore.forEach((undo) => undo()); }
}

/** 일시 적용 구간(썸네일): before는 렌더 직전, after는 readPixels 호출 직후에 동기 호출된다. */
export interface CaptureAround {
  before(): void;
  after(): void;
}

async function renderPass(deps: CaptureDeps, camera: ArcRotateCamera, pass: RenderPassId, width: number, height: number, frame: (pass: RenderPassId) => readonly Mesh[], around: CaptureAround | undefined, ownership?: PreparedHairOwnership): Promise<PassRenderResult> {
  const multisample = pass === "flat" || pass === "lit";
  const engine = deps.scene.getEngine();
  // 수동 renderFrame의 swapchain 명령은 첫 await 전에 제출한다. 다음 이벤트 루프에서 그리기 표면이 만료될 수 있다.
  if (engine.isWebGPU) engine.flushFramebuffer();
  const samples = multisample ? Math.max(1, Math.min(4, engine.getCaps().maxMSAASamples || 1)) : 1;
  // 작은 타깃(썸네일)은 장면별 풀에서 재사용한다(renderPassId 누적 방지, capture-targets.ts).
  const lease = acquireCaptureTarget(deps.scene, pass, width, height, samples);
  const rtt = lease.rtt;
  const overridden = new Set<Mesh>();
  const setOverride = (mesh: Mesh, material: Material | null): void => {
    const override = material && material !== mesh.material ? material : undefined;
    // setMaterialForRendering은 같은 값으로 불러도 RTT draw cache를 지운다. 준비된 wrapper를 렌더 직전에 지우지 않는다.
    if (mesh.getMaterialForRenderPass(rtt.renderPassId) !== override) rtt.setMaterialForRendering(mesh, override);
    if (override) overridden.add(mesh);
  };
  try {
    rtt.activeCamera = camera;
    rtt.ignoreCameraViewport = true;
    rtt.clearColor = pass === "depth" ? new Color4(...DEPTH_CLEAR_RGBA01) : new Color4(0, 0, 0, 0);

    // (1) 비동기 구간: 셰이더 컴파일 대기. 일시 적용 전 상태로 컴파일한다(플랜이 바꾸는 재질 변종은 첫 드로에서 동기 컴파일).
    const compilePairs: Array<readonly [Mesh, Material]> = [];
    for (const part of deps.rig.parts) {
      if (part.forceHidden) continue;
      for (const mesh of [...part.meshes, ...(deps.includeOutlines ? part.outlineMeshes : [])]) {
        const material = passMaterialFor(deps, camera, pass, part, mesh);
        if (material) compilePairs.push([mesh, material]);
      }
    }
    if (pass === "lit") {
      for (const mesh of deps.pressureOutlines?.() ?? []) if (mesh.material) compilePairs.push([mesh, mesh.material]);
    }
    for (const [mesh, material] of compilePairs) setOverride(mesh, material);
    await ensureReady(deps, rtt, compilePairs, pass === "lit", pass === "lit" && deps.scene.shadowsEnabled && deps.character.keyLight.shadowEnabled ? deps.shadow?.getShadowMap() : undefined);
    // 준비 대기 동안 RAF가 만든 명령도 포함해 제출한다. 캡처 카메라·재질의 버퍼 변경과 같은 제출 묶음에 섞지 않는다.
    if (engine.isWebGPU) engine.flushFramebuffer();

    // (2) 동기 구간: 일시 적용 → 프레이밍·렌더 목록 → 렌더 → readPixels 호출 → 복원
    around?.before();
    let pending: ReturnType<RenderTargetTexture["readPixels"]> = null;
    let pendingOwnership: Promise<HairOwnership> | undefined;
    let boxes: SyntheticBox[] | null = null;
    try {
      const meshes = [...frame(pass), ...(pass === "lit" ? deps.pressureOutlines?.() ?? [] : [])];
      rtt.renderList = [...meshes];
      for (const mesh of meshes) {
        const material = passMaterialFor(deps, camera, pass, partOfMesh(deps, mesh), mesh);
        setOverride(mesh, material);
      }
      if (pass === "lit" && deps.shadow) {
        try {
          deps.shadow.getShadowMap()?.render(false, false);
        } catch {
          // 그림자 맵 갱신 실패는 lit 캡처를 막지 않는다(이전 프레임 그림자 사용).
        }
      }
      withNativeOutlinesOff(meshes, pass !== "lit", () => withCaptureProcessing(deps, pass === "lit", () => rtt.render(false, false)));
      // WebGL2는 PBO 비동기 readback으로 읽기 명령만 제출한다(GPU 완료를 메인 스레드에서 기다리지 않는다, capture-targets.ts).
      pending = readCaptureTarget(engine, rtt, width, height);
      // readPixels는 WebGPU 명령도 실제 제출한다. 원래 native outline UBO를 제출한 뒤 같은 포즈·동기 구간에서 owner 색을 쓴다.
      pendingOwnership = ownership?.submit();
      if (pending === null) boxes = syntheticBoxes(deps, camera, width, height);
    } finally {
      try { restorePendingPressureGarmentStencil(deps.scene); } finally { around?.after(); }
    }

    // (3) 비동기 구간: GPU readback 대기(이 동안 뷰포트는 복원된 상태를 그린다)
    const [readback, ownershipReadback] = await Promise.allSettled([pending, pendingOwnership] as const);
    if (readback.status === "rejected") throw readback.reason;
    if (ownershipReadback.status === "rejected") throw ownershipReadback.reason;
    const buffer = readback.value;
    const extra = ownershipReadback.value ? { hairOwnership: ownershipReadback.value } : {};
    if (buffer === null) return { bytes: null, boxes, ...extra };
    if (buffer instanceof Uint8Array || buffer instanceof Uint8ClampedArray) return { bytes: buffer, boxes: null, ...extra };
    throw failVisible("capture-readback-type", `RTT readback 타입이 RGBA8이 아닙니다(${buffer.constructor.name}).`, undefined, deps.now);
  } finally {
    for (const mesh of overridden) rtt.setMaterialForRendering(mesh, undefined);
    lease.release();
  }
}

export interface CaptureFrameOptions {
  readonly width: number;
  readonly height: number;
  readonly passes: readonly RenderPassId[];
  readonly framing: CameraFraming;
  /** 일시 적용 구간(단일 패스 전용: 썸네일). 주면 passes는 정확히 1개여야 한다. */
  readonly around?: CaptureAround;
  readonly ownership?: PreparedHairOwnership;
}

export interface CaptureFrameResult {
  readonly passes: Partial<Record<RasterPassId, CapturedRaster>>;
  readonly depth?: CapturedDepth;
  readonly synthetic: boolean;
  readonly hairOwnership?: HairOwnership;
}

/** 패스 집합을 한 번에 그려 규약 래스터로 돌려준다(엔진 renderPasses·renderThumbnail 공용). */
export async function captureFrame(deps: CaptureDeps, options: CaptureFrameOptions): Promise<CaptureFrameResult> {
  const { width, height } = options;
  validateRequest(deps, width, height, options.passes);
  if (options.around && options.passes.length !== 1) {
    throw failVisible("capture-around-single-pass", "일시 적용 구간은 단일 패스 캡처에서만 쓸 수 있습니다.", undefined, deps.now);
  }
  const camera = deps.character.captureCamera;
  /** 프레이밍은 렌더 직전(일시 적용 뒤)에 계산한다: 플랜의 가시성·포즈가 bounds에 반영되도록. */
  const frame = (pass: RenderPassId): readonly Mesh[] => {
    deps.character.applyFraming(camera, options.framing, computeRigBounds(deps.rig), width / height);
    camera.getViewMatrix(true);
    camera.getProjectionMatrix(true);
    return rigVisibleMeshes(deps.rig, { includeOutlines: deps.includeOutlines && pass === "lit" });
  };
  const passes: Partial<Record<RasterPassId, CapturedRaster>> = {};
  let depth: CapturedDepth | undefined;
  let hairOwnership: HairOwnership | undefined;
  let synthetic = false;
  let lateBoxes: SyntheticBox[] | null = null;
  const flipY = RTT_READBACK_FLIP_Y[deps.lane];
  const premultiplied = RTT_READBACK_PREMULTIPLIED[deps.lane];
  for (const pass of options.passes) {
    const rendered = await renderPass(deps, camera, pass, width, height, frame, options.around, pass === "lit" ? options.ownership : undefined);
    if (rendered.hairOwnership) hairOwnership = rendered.hairOwnership;
    if (rendered.bytes === null) {
      synthetic = true;
      // 일시 적용 구간 안에서 만든 상자가 있으면 그것을, 없으면(비동기 readback이 뒤늦게 null) 현재 상태로 만든다.
      const boxes = rendered.boxes ?? (lateBoxes ??= syntheticBoxes(deps, camera, width, height));
      if (pass === "depth") depth = rasterizeSyntheticDepth(width, height, boxes, camera.minZ, camera.maxZ);
      else passes[pass] = rasterizeSyntheticPass(pass, width, height, boxes);
      continue;
    }
    if (pass === "depth") {
      depth = decodeDepth(rendered.bytes, width, height, { near: camera.minZ, far: camera.maxZ, flipY, encoding: "rgba-packed" });
    } else {
      // ID·법선 패스는 알파 255 상수라 premultiply 영향이 없고, flat/lit만 투명 clear와 블렌딩 영향을 받는다.
      passes[pass] = toCapturedRaster(rendered.bytes, width, height, { flipY, premultiplied: premultiplied && (pass === "flat" || pass === "lit") });
    }
  }
  return { passes, synthetic, ...(depth ? { depth } : {}), ...(hairOwnership ? { hairOwnership } : {}) };
}

export async function capturePasses(deps: CaptureDeps, req: CaptureRequest, framing: CameraFraming): Promise<CaptureResult> {
  validateRequest(deps, req.width, req.height, req.passes, req.includeHairOwnership);
  if (req.includeHairOwnership && !req.passes.includes("lit")) throw failVisible("capture-hair-requires-lit", "헤어 소유권은 같은 포즈의 lit 패스와 함께 요청해야 합니다.", undefined, deps.now);
  const ownership = req.includeHairOwnership ? await prepareHairOwnership(deps, req.width, req.height, (rtt, pairs) => ensureReady(deps, rtt, pairs, true)) : undefined;
  try {
    const frame = await captureFrame(deps, { width: req.width, height: req.height, passes: req.passes, framing, ...(ownership ? { ownership } : {}) });
    const backend: CaptureProvenance["backend"] = deps.lane;
    return {
      profile: CAPTURE_PROFILE_ID,
      width: req.width,
      height: req.height,
      passes: frame.passes,
      ...(frame.depth ? { depth: frame.depth } : {}),
      ...(frame.hairOwnership ? { hairOwnership: frame.hairOwnership } : {}),
      partIdPalette: deps.rig.partIdPalette,
      provenance: { ...deps.provenance, backend, synthetic: frame.synthetic, settleSteps: req.settleSteps },
    };
  } finally { ownership?.dispose(); }
}

export async function captureThumbnail(deps: CaptureDeps, size: number, framing: CameraFraming, around?: CaptureAround): Promise<CapturedRaster> {
  const frame = await captureFrame(deps, { width: size, height: size, passes: ["lit"], framing, ...(around ? { around } : {}) });
  const raster = frame.passes.lit;
  if (!raster) throw failVisible("thumbnail-no-raster", "썸네일 lit 패스가 결과를 돌려주지 않았습니다.", undefined, deps.now);
  return raster;
}
