/**
 * 키트 프리뷰 세션(브라우저 전용): GLB를 받아 **앱의 실제 엔진**(`BabylonCharacterEngine`: 툰/PBR 재질·조명·IBL·외곽선·후처리)에 올려
 * 뷰×셰이딩마다 PNG를 만든다. 렌더 로직을 복제하지 않고 엔진의 공개 메서드(`loadSource`·`applyPlan`·`setShading`·`setCamera`·`renderFrame`·
 * `readBone`·`inspectRig`)만 쓴다. 엔진이 노출하지 않는 것은 장면의 활성 카메라(손·발 근접 뷰)와 배경색뿐이며 이는 Babylon 공개 API
 * (`scene.activeCamera`)로만 만진다.
 *
 * 소스 경로는 둘이다(`kit-plan-adapter.decideSourceKind`가 자동 감지, `--legacy-merge`가 강제):
 * - kit: 베이스에 키트 이름 메시(`TS_Body`·`TS_Head`)가 있으면 `kit.json` 없이 GLB에서 `KitPlan`을 즉석 생성해 `loadSource({ kind: "kit" })`로 올린다.
 *   앱의 키트 정책(눈·머리 외곽선 제외, 키트 틴트, 정점색 AO, 알파 컷오프, 증분 교체, 얼굴 SDF 끔)과 키트 기본 셰이딩(램프 2단·림 끔)이 그대로 걸린다.
 * - package: 키트 규약 밖 GLB(제작 패키지 Orion 등)는 기존대로 `prepare.ts`가 한 GLB로 병합해 `loadSource({ kind: "package" })`로 올린다.
 * 두 경로 모두 바이트는 엔진의 `fetchBytes` 주입점으로 넘기며(URL → 이미 받은 바이트), **엔진의 SHA-256·바이트 수 검증을 끄지 않는다**:
 * kit는 CLI가 디스크 원본에서 계산한 값이 플랜에 들어가고, package는 원본 그대로면 CLI 값을, 병합 결과면 병합 바이트의 해시를 쓴다.
 */
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";

import { DEFAULT_FRAMING, ENGINE_INIT_TIMEOUT_MS, describeDetail, failVisible, isLabFailure } from "../../contracts";
import { sha256Hex } from "../../shared/hash";
import { fromVector3, toVector3 } from "../babylon/convert";
import { readRigMeshMetadata } from "../babylon/mesh-binding";
import { createBabylonCharacterEngineForPreview } from "../babylon-character-engine";
import { waitUntilReady } from "../material-readiness";
import { unionAabb } from "../synthetic-projection";

import { buildKitPlan, decideSourceKind } from "./kit-plan-adapter";
import { resolveViewerShading } from "./kit-shading";
import { PREVIEW_GLB_URL, buildApplyPlan, buildKitApplyPlan, buildPackagePlan, expandMorphAssignments } from "./plan";
import { resolvePose } from "./poses";
import { prepareKitGlbs } from "./prepare";
import { EMPTY_FRAME_COVERAGE, measureRaster } from "./raster-stats";
import { buildInputRows, buildStaticReport } from "./summary";
import { resolveTintColors } from "./tint";
import { VIEW_SPECS, framingForView, resolveAnchorCamera } from "./views";
import { makeWarning, sortWarnings } from "./warnings";

import type { BabylonCharacterEngine } from "../babylon-character-engine";
import type { KitPreviewQuality, KitPreviewShading, KitPreviewToonOverrides } from "./cli-args";
import type { KitPlanFile, PreviewSourceKind } from "./kit-plan-adapter";
import type { ResolvedPose } from "./poses";
import type { PrepareResult } from "./prepare";
import type { KitPreviewFileRef, KitPreviewLoadRequest, KitPreviewLoadResult, KitPreviewRenderRequest, KitPreviewRenderResult, KitPreviewRuntimeReport, KitPreviewSourceInfo } from "./protocol";
import type { PreviewWarning } from "./warnings";
import type { KitPlan, LabFailure, Vec3 } from "../../contracts";
import type { WorldBounds } from "../camera-framing";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import type { Scene } from "@babylonjs/core/scene.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function asFailure(error: unknown, code: string, reasonKo: string): LabFailure {
  return isLabFailure(error) ? error : failVisible(code, `${reasonKo} (${describeDetail(error)?.split("\n")[0] ?? "원인 미상"})`, error);
}

/** 마지막 프레임 읽기를 시도하는 최대 횟수(셰이더·IBL이 늦게 준비돼 빈 프레임이 나올 때 다시 그린다) */
const MAX_RENDER_ATTEMPTS = 6;

export class KitPreviewSession {
  private engine: BabylonCharacterEngine | null = null;
  private scene: Scene | null = null;
  /** 엔진 `fetchBytes`가 돌려줄 바이트(URL → 이미 받은 GLB). kit는 파츠마다, package는 병합 GLB 하나. */
  private bytesByUrl = new Map<string, Uint8Array>();
  private sourceKind: PreviewSourceKind = "package";
  private toon: KitPreviewToonOverrides = {};
  private pose: ResolvedPose = { id: "none", pose: {}, framingScale: 1 };
  private shading: KitPreviewShading | null = null;
  private quality: KitPreviewQuality | null = null;
  private size = 0;
  private readonly overlay: HTMLCanvasElement;
  private readonly engineWarnings: PreviewWarning[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly log: (message: string) => void,
  ) {
    this.overlay = document.createElement("canvas");
  }

  // ---------------------------------------------------------------- 로드

  async load(request: KitPreviewLoadRequest): Promise<KitPreviewLoadResult> {
    const warnings: PreviewWarning[] = [];

    let files: KitPlanFile[];
    try {
      files = await Promise.all(request.files.map((file) => this.fetchFile(file)));
    } catch (error) {
      return { ok: false, stage: "fetch", failure: asFailure(error, "kit-file-fetch-failed", "GLB를 받지 못했습니다"), source: null, report: null, warnings };
    }
    const first = files[0];
    if (!first) return { ok: false, stage: "fetch", failure: failVisible("kit-file-fetch-failed", "올릴 GLB가 없습니다."), source: null, report: null, warnings };

    const colors = resolveTintColors(request.colors);

    // 소스 경로 판정(kit = 엔진 키트 소스, package = 기존 병합)
    let source: KitPreviewSourceInfo;
    try {
      const decision = decideSourceKind(first.bytes, first.label, request.legacyMerge);
      source = { kind: decision.kind, reasonKo: decision.reasonKo, forced: decision.forced };
    } catch (error) {
      return this.prepareFailure(files, error, null, warnings);
    }
    this.sourceKind = source.kind;
    this.toon = request.toon;
    this.log(`소스 경로: ${source.kind} — ${source.reasonKo}`);

    const prepareStart = performance.now();
    let prepared: PrepareResult;
    let kitPlan: KitPlan | null = null;
    try {
      if (source.kind === "kit") {
        const built = buildKitPlan(files, { colors, roleOverrides: request.roleOverrides, hairLod: request.hairLod });
        prepared = built.prepared;
        kitPlan = built.plan;
      } else {
        prepared = prepareKitGlbs(
          files.map(({ label, bytes }) => ({ label, bytes })),
          { colors, roleOverrides: request.roleOverrides },
        );
      }
    } catch (error) {
      return this.prepareFailure(files, error, source, warnings);
    }
    const prepareMs = performance.now() - prepareStart;
    const staticReport = buildStaticReport(prepared, source.kind, kitPlan);
    const preparedWarnings = sortWarnings([...prepared.warnings, makeWarning("source", "source-kind", `소스 경로 ${source.kind}: ${source.reasonKo}`, "info")]);
    this.log(
      kitPlan
        ? `준비 완료(키트 플랜): 파츠 ${kitPlan.parts.length}개 · 메시 ${staticReport.totals.meshes}개 · ${staticReport.totals.triangles} 삼각형 · 경고 ${prepared.warnings.length}건`
        : `준비 완료: 메시 ${staticReport.totals.meshes}개 · ${staticReport.totals.triangles} 삼각형 · 경고 ${prepared.warnings.length}건${prepared.passthrough ? " · 원본 GLB 그대로" : " · 병합 GLB"}`,
    );
    if (request.inspectOnly) return { ok: true, source, report: staticReport, runtime: null, warnings: preparedWarnings };

    // 엔진
    const engineStart = performance.now();
    try {
      await this.ensureEngine(request.timeoutMs);
    } catch (error) {
      return { ok: false, stage: "engine", failure: asFailure(error, "kit-engine-failed", "엔진을 만들지 못했습니다"), source, report: staticReport, warnings: preparedWarnings };
    }
    const engineMs = performance.now() - engineStart;
    const engine = this.engine;
    if (!engine) return { ok: false, stage: "engine", failure: failVisible("kit-engine-failed", "엔진이 만들어지지 않았습니다."), source, report: staticReport, warnings: preparedWarnings };

    // 소스 로드
    const loadStart = performance.now();
    try {
      if (kitPlan) {
        // 키트 경로: 플랜의 파츠 url마다 이미 받은 바이트를 돌려준다. 엔진이 플랜의 bytes·sha256(CLI가 디스크에서 계산)으로 검증한다.
        this.bytesByUrl = new Map(files.map((file) => [file.url, file.bytes] as const));
        await engine.loadSource({ kind: "kit", plan: kitPlan });
      } else {
        // 병합 경로: 원본 그대로면 CLI가 계산한 해시, 병합했으면 병합 바이트의 해시를 플랜에 넣어 엔진 검증을 그대로 켜 둔다.
        const sha256 = prepared.passthrough ? first.sha256 : await sha256Hex(prepared.bytes);
        this.bytesByUrl = new Map([[PREVIEW_GLB_URL, prepared.bytes]]);
        await engine.loadSource({ kind: "package", plan: buildPackagePlan(prepared, request.hairLod, first.label, sha256) });
      }
    } catch (error) {
      // 엔진의 LabFailure(코드·한글 사유)를 그대로 돌려준다. 키트 경로로 갔는데 규약 밖 입력이라면 우회 방법만 덧붙인다(대체 렌더는 하지 않는다).
      const hint = kitPlan ? [makeWarning("source", "kit-path-hint", "키트 소스 경로에서 거부됐습니다. 키트 규약 밖 GLB라면 --legacy-merge로 기존 병합 경로를 쓸 수 있습니다(키트 입력이면 위 사유를 Blender 산출물에서 고치세요).", "info")] : [];
      return { ok: false, stage: "load", failure: asFailure(error, "kit-source-load-failed", "엔진에 소스를 올리지 못했습니다"), source, report: staticReport, warnings: sortWarnings([...preparedWarnings, ...hint, ...this.engineWarnings]) };
    }
    const loadMs = performance.now() - loadStart;
    this.shading = null;
    this.quality = null;
    this.size = 0;

    // 플랜 적용(morph·포즈·틴트)
    const applyStart = performance.now();
    const rig = engine.inspectRig();
    if (!rig) return { ok: false, stage: "load", failure: failVisible("kit-source-load-failed", "소스를 올렸지만 리그 점검 결과가 없습니다."), source, report: staticReport, warnings: preparedWarnings };
    const expansion = expandMorphAssignments(request.morphs, rig.morphNames);
    for (const entry of expansion.unknown) {
      const hint = entry.candidates.length > 0 ? ` 비슷한 이름: ${entry.candidates.join(", ")}` : rig.morphNames.length === 0 ? " 로드된 GLB에 morph 타깃이 없습니다." : " 이름은 `facs:jawOpen`·`param:height:+`처럼 GLB의 morph 이름과 정확히 같아야 합니다.";
      warnings.push(makeWarning("morph", "morph-unknown", `--morph '${entry.name}'은(는) 로드된 GLB의 morph 이름이 아니라 적용하지 못했습니다.${hint}`));
    }
    this.pose = resolvePose(request.pose);
    if (request.pose.kind !== "none" && rig.skeletonBoneCount === 0) warnings.push(makeWarning("pose", "pose-no-skeleton", "GLB에 스켈레톤이 없어 --pose를 적용할 수 없습니다.", "warn"));
    // 키트 소스는 틴트(recolor/fixed)를 엔진이 정하므로 파츠 색 없이 레시피 색만 준다. 병합 소스는 뷰어가 결정한 파츠 색을 준다.
    const applyInput = { parts: rig.parts, colors, morphWeights: expansion.weights, pose: this.pose.pose };
    const plan = kitPlan ? buildKitApplyPlan(applyInput) : buildApplyPlan({ ...applyInput, meshes: prepared.meshes });
    const receipt = engine.applyPlan(plan);
    if (receipt.skippedBones.length > 0) {
      warnings.push(makeWarning("pose", "pose-bone-skipped", `포즈의 본 ${receipt.skippedBones.length}개가 리그의 휴머노이드 매핑에 없어 건너뛰었습니다: ${receipt.skippedBones.slice(0, 8).join(", ")}${receipt.skippedBones.length > 8 ? " …" : ""}.`));
    }
    const applyMs = performance.now() - applyStart;
    warnings.push(...(await this.auditTextures(request.timeoutMs)));

    const after = engine.inspectRig() ?? rig;
    for (const note of engine.sourceNotes()) warnings.push(makeWarning("engine", "engine-note", note, "info"));
    warnings.push(...this.engineWarnings);
    const toon = resolveViewerShading({ sourceKind: source.kind, mode: "toon", quality: request.quality, toon: request.toon }).toon;
    const runtime: KitPreviewRuntimeReport = {
      source: { ...source, integrityVerified: true },
      toon: { rampSteps: toon.rampSteps, rim: toon.rim, outline: toon.outline, faceSdfShadow: toon.faceSdfShadow },
      engine: { backend: engine.backend, engineVersion: engine.diagnostics.engineVersion, renderer: engine.diagnostics.renderer ?? null },
      rig: {
        poseConvention: after.poseConvention,
        boneCount: after.boneCount,
        humanoidBoneCount: after.humanoidBoneCount,
        auxiliaryBoneCount: after.auxiliaryBoneCount,
        skeletonBoneCount: after.skeletonBoneCount,
        morphNameCount: after.morphNameCount,
        notes: after.notes,
      },
      parts: after.parts.map((part) => ({
        id: part.id,
        partId: part.partId,
        role: part.role,
        materialPreset: part.materialPreset,
        materialClass: part.materialClass,
        triangles: part.triangleCount,
        vertices: part.vertexCount,
        morphTargets: part.morphTargetCount,
        skinned: part.skinned,
        hasAlbedoTexture: part.hasAlbedoTexture,
        visible: part.visible,
        forceHidden: part.forceHidden,
        colorHex: part.colorHex,
      })),
      morph: { requested: request.morphs.length, applied: expansion.weights, expanded: expansion.expanded, unknown: expansion.unknown },
      pose: { id: this.pose.id, bonesSet: receipt.appliedBones, skippedBones: receipt.skippedBones, framingScale: this.pose.framingScale },
      features: { ...engine.sceneFeatures() },
      timingsMs: { engineCreate: engineMs, prepare: prepareMs, loadSource: loadMs, apply: applyMs },
    };
    return { ok: true, source, report: staticReport, runtime, warnings: sortWarnings([...preparedWarnings, ...warnings]) };
  }

  // ---------------------------------------------------------------- 렌더

  async render(request: KitPreviewRenderRequest): Promise<KitPreviewRenderResult> {
    const engine = this.engine;
    const scene = this.scene;
    const fail = (failure: LabFailure, warnings: PreviewWarning[] = []): KitPreviewRenderResult => ({ ok: false, view: request.view, shading: request.shading, failure, warnings });
    if (!engine || !scene) return fail(failVisible("kit-preview-not-loaded", "먼저 load()로 GLB를 올려야 합니다."));
    const warnings: PreviewWarning[] = [];
    const notes: string[] = [];

    try {
      // 셰이딩·품질
      if (this.shading !== request.shading || this.quality !== request.quality) {
        const profile = resolveViewerShading({ sourceKind: this.sourceKind, mode: request.shading, quality: request.quality, toon: this.toon });
        engine.setShading(profile);
        this.shading = request.shading;
        this.quality = request.quality;
      }
      // 해상도(엔진이 카메라 프레이밍을 다시 계산한다)
      if (this.size !== request.size) {
        engine.resize(request.size, request.size);
        this.size = request.size;
      }
      this.overlay.width = request.size;
      this.overlay.height = request.size;

      // 카메라
      const spec = VIEW_SPECS[request.view];
      const framing = framingForView(request.view, this.pose.framingScale);
      if (framing) {
        engine.setCamera(framing);
      } else if (spec.anchor) {
        engine.setCamera(DEFAULT_FRAMING);
        const points: Vec3[] = [];
        for (const bone of spec.anchor.bones) {
          const reading = engine.readBone(bone);
          if (reading) points.push(reading.position);
        }
        const anchored = resolveAnchorCamera(spec.anchor, points, this.rigBounds(scene), this.pose.framingScale);
        if (!anchored) {
          return fail(failVisible("kit-preview-view-unavailable", `뷰 '${request.view}'를 만들 수 없습니다: 기준 본(${spec.anchor.bones.join(", ")})이 이 리그에 없습니다(스켈레톤 없는 GLB이거나 본 이름이 휴머노이드 매핑에 없음).`), warnings);
        }
        const camera = scene.activeCamera;
        if (!(camera instanceof ArcRotateCamera)) return fail(failVisible("kit-preview-camera", "활성 카메라가 ArcRotateCamera가 아닙니다."), warnings);
        camera.target = toVector3(anchored.target);
        camera.alpha = anchored.alpha;
        camera.beta = anchored.beta;
        camera.radius = anchored.radius;
        camera.fov = anchored.fov;
      }

      // 배경: 엔진 장면은 항상 투명으로 그린다(엔진은 `scene.clearColor` 알파를 0으로 두고 프레임 결과에도 반영하지 않는다 — 실측).
      // 불투명 출력은 아래에서 2D 캔버스에 배경색을 뒤에 깔아 만든다. 커버리지는 배경과 무관하게 알파로 잰다.

      // 준비 대기(셰이더 컴파일·텍스처). 소프트웨어 렌더러는 PBR 변종 하나에 수 초~10초 이상 걸린다.
      const readyStart = performance.now();
      const ready = await waitUntilReady([() => scene.isReady(true)], { timeoutMs: request.timeoutMs, pollMs: 100 });
      const readyMs = performance.now() - readyStart;
      if (!ready.ready) {
        return fail(failVisible("kit-preview-shader-timeout", `셰이더 컴파일·텍스처 준비가 ${Math.round(request.timeoutMs / 1000)}초 안에 끝나지 않았습니다(미준비 ${ready.pending}개). --timeout-sec를 늘리거나 --quality preview로 줄이세요.`), warnings);
      }

      // 마지막 프레임: 그리고 → 같은 동기 구간에서 읽는다(preserveDrawingBuffer=false). 빈 프레임이면 다시 그린다.
      const renderStart = performance.now();
      let png = "";
      let coverage = 0;
      let corners: readonly [number, number, number, number] = [0, 0, 0, 0];
      for (let attempt = 1; attempt <= MAX_RENDER_ATTEMPTS; attempt += 1) {
        engine.renderFrame();
        const out = this.overlay.getContext("2d", { willReadFrequently: true });
        if (!out) return fail(failVisible("kit-preview-2d", "2D 캔버스 컨텍스트를 만들지 못했습니다."), warnings);
        out.globalCompositeOperation = "source-over";
        out.clearRect(0, 0, request.size, request.size);
        out.drawImage(this.canvas, 0, 0);
        const stats = measureRaster(out.getImageData(0, 0, request.size, request.size).data, request.size, request.size, null);
        coverage = stats.coverage;
        corners = stats.cornerAlphas;
        if (coverage >= EMPTY_FRAME_COVERAGE || attempt === MAX_RENDER_ATTEMPTS) {
          if (!request.transparent) {
            out.globalCompositeOperation = "destination-over";
            out.fillStyle = request.background;
            out.fillRect(0, 0, request.size, request.size);
            out.globalCompositeOperation = "source-over";
          }
          png = this.overlay.toDataURL("image/png").split(",")[1] ?? "";
          if (attempt > 1) notes.push(`빈 프레임이라 ${attempt}번째 시도에서 읽었습니다.`);
          break;
        }
        await sleep(250);
        await waitUntilReady([() => scene.isReady(true)], { timeoutMs: request.timeoutMs, pollMs: 100 });
      }
      const renderMs = performance.now() - renderStart;
      if (coverage < EMPTY_FRAME_COVERAGE) {
        warnings.push(makeWarning(`${request.view}/${request.shading}`, "render-empty", `뷰 '${request.view}'(${request.shading})가 거의 비어 있습니다(커버리지 ${(coverage * 100).toFixed(2)}%). 메시가 카메라 밖이거나 재질이 준비되지 않았을 수 있습니다.`, "error"));
      }
      if (request.transparent && corners.every((alpha) => alpha === 255)) {
        warnings.push(makeWarning(`${request.view}/${request.shading}`, "transparent-lost", "투명 배경을 요청했지만 모서리 알파가 모두 불투명입니다(후처리가 알파를 지웠을 수 있습니다).", "warn"));
      }
      const hud = engine.readHud();
      return {
        ok: true,
        view: request.view,
        shading: request.shading,
        width: request.size,
        height: request.size,
        png,
        readyMs,
        renderMs,
        coverage,
        notes,
        warnings,
        hud: { drawCalls: hud.drawCalls, activeMeshes: hud.activeMeshes, triangles: hud.triangles },
      };
    } catch (error) {
      return fail(asFailure(error, "kit-preview-render-failed", `뷰 '${request.view}'(${request.shading}) 렌더에 실패했습니다`), warnings);
    }
  }

  // ---------------------------------------------------------------- 해제

  dispose(): void {
    this.engine?.dispose();
    this.engine = null;
    this.scene = null;
  }

  // ---------------------------------------------------------------- 내부

  /** 파일을 받는다. 바이트 수·SHA-256은 CLI가 잰 값을 그대로 싣고, 대조는 엔진이 한다(여기서 다시 계산하지 않는다). */
  private async fetchFile(file: KitPreviewFileRef): Promise<KitPlanFile> {
    const response = await fetch(file.url);
    if (!response.ok) throw failVisible("kit-file-fetch-failed", `GLB를 받지 못했습니다(HTTP ${response.status}): ${file.label}`);
    return { label: file.label, url: file.url, sha256: file.sha256, byteLength: file.bytes, bytes: new Uint8Array(await response.arrayBuffer()) };
  }

  /** 준비(판정·플랜 생성·병합) 단계 실패: 받은 입력을 하나씩 검사해 무엇이 문제인지 함께 보인다. */
  private prepareFailure(files: readonly KitPlanFile[], error: unknown, source: KitPreviewSourceInfo | null, warnings: PreviewWarning[]): KitPreviewLoadResult {
    const inputs = buildInputRows(files.map(({ label, bytes }) => ({ label, bytes })));
    warnings.push(...inputs.warnings);
    for (const failed of inputs.failures) warnings.push(makeWarning(failed.label, "glb-invalid", failed.reasonKo, "error"));
    return { ok: false, stage: "prepare", failure: asFailure(error, "kit-prepare-failed", "GLB를 준비하지 못했습니다"), source, report: null, warnings: sortWarnings(warnings) };
  }

  private async ensureEngine(timeoutMs: number): Promise<void> {
    if (this.engine) return;
    const { engine, scene } = await createBabylonCharacterEngineForPreview(
      {
        canvas: this.canvas,
        backend: "webgl2",
        initTimeoutMs: Math.max(ENGINE_INIT_TIMEOUT_MS, timeoutMs),
        onLost: (failure) => this.log(`엔진 손실: ${failure.code} ${failure.reasonKo}`),
        // 프리뷰는 물리를 쓰지 않는다(체인·충돌체가 없어 호출되지 않는다).
        physicsProviders: async () => {
          throw failVisible("kit-preview-no-physics", "프리뷰는 물리를 쓰지 않습니다.");
        },
        onFailure: (failure) => this.engineWarnings.push(makeWarning("engine", failure.code, failure.reasonKo, "warn")),
      },
      {
        fetchBytes: (url) => {
          const bytes = this.bytesByUrl.get(url);
          return bytes ? Promise.resolve(bytes) : Promise.reject(failVisible("kit-preview-no-bytes", `엔진이 요청한 GLB 바이트가 없습니다: ${url}`));
        },
        // 엔진의 바이트 수·SHA-256 검증은 기본(켬)을 그대로 쓴다.
        runRenderLoop: false,
      },
    );
    if (!scene) {
      engine.dispose();
      throw failVisible("kit-preview-no-scene", "엔진 장면을 찾지 못했습니다.");
    }
    this.engine = engine;
    this.scene = scene;
    this.log(`엔진 준비: ${engine.diagnostics.backend} · ${engine.diagnostics.renderer ?? "렌더러 미상"}`);
  }

  /**
   * 리그 메시 재질이 쓰는 텍스처가 모두 준비되거나 실패할 때까지 기다린 뒤 실패·미준비를 경고로 돌려준다.
   * 디코딩 실패(손상된 PNG/JPEG)는 Babylon이 콘솔 경고만 남기고 흰 텍스처로 그리므로, 어느 텍스처인지 명시해 눈에 띄게 한다.
   */
  private async auditTextures(timeoutMs: number): Promise<PreviewWarning[]> {
    const scene = this.scene;
    if (!scene) return [];
    const textures = new Set<BaseTexture>();
    for (const mesh of scene.meshes) {
      if (!readRigMeshMetadata(mesh.metadata)) continue;
      for (const texture of mesh.material?.getActiveTextures() ?? []) textures.add(texture);
    }
    const settled = (texture: BaseTexture): boolean => texture.isReady() || texture.loadingError;
    const deadline = performance.now() + Math.min(timeoutMs, 30_000);
    while ([...textures].some((texture) => !settled(texture)) && performance.now() < deadline) await sleep(50);
    const warnings: PreviewWarning[] = [];
    for (const texture of textures) {
      const label = texture.name || "(이름 없음)";
      if (texture.loadingError) warnings.push(makeWarning(label, "texture-load-failed", `텍스처 '${label}' 로드에 실패했습니다(디코딩 오류 등). 해당 재질은 텍스처 없이(흰색·기본값) 그려집니다. GLB에 임베드된 이미지가 손상됐는지 확인하세요.`, "error"));
      else if (!texture.isReady()) warnings.push(makeWarning(label, "texture-not-ready", `텍스처 '${label}'가 제한 시간 안에 준비되지 않았습니다.`, "warn"));
    }
    return warnings;
  }

  /** 보이는 리그 메시의 월드 박스 합집합(앵커 뷰 폴백용) */
  private rigBounds(scene: Scene): WorldBounds | null {
    const boxes: Array<{ min: Vec3; max: Vec3 }> = [];
    for (const mesh of scene.meshes) {
      if (!readRigMeshMetadata(mesh.metadata) || !mesh.isVisible || mesh.getTotalVertices() === 0) continue;
      mesh.computeWorldMatrix(true);
      const box = mesh.getBoundingInfo().boundingBox;
      boxes.push({ min: fromVector3(box.minimumWorld), max: fromVector3(box.maximumWorld) });
    }
    return unionAabb(boxes);
  }
}
