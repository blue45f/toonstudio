import { Box, Camera, CheckCircle2, Cpu, Layers, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import {
  STUDIO_3D_ATTACHMENT_SOLVER_MAX_WORLD_DISTANCE,
  solveStudio3dAttachment,
} from "../scene-3d/studio-3d-attachment-solver";
import {
  CAMERA_LENS_PRESET_UI,
  Studio3DCameraPerspectiveLens,
  type CameraLensPreset,
} from "../scene-3d/studio-3d-camera-perspective-lens";
import { Studio3DCharacterSceneMixer } from "../scene-3d/studio-3d-character-scene-mixer";
import {
  CAMERA_TEMPO_EASING_UI,
  Studio3DCinematographyRail,
  type CameraTempoEasing,
} from "../scene-3d/studio-3d-cinematography-rail";
import { Studio3DClothHairDynamics } from "../scene-3d/studio-3d-cloth-hair-dynamics";
import { Studio3DEditableMesh } from "../scene-3d/studio-3d-editable-mesh";
import {
  CURRENT_TOON3D_FORMAT_VERSION,
  createEmptyToon3DPackage,
  validateToon3DPackage,
} from "../scene-3d/studio-3d-package";
import {
  Studio3DProceduralCityscape,
  type CityscapeTheme,
} from "../scene-3d/studio-3d-procedural-cityscape";
import { Studio3DProceduralHairStrandGenerator } from "../scene-3d/studio-3d-procedural-hair-strand";
import {
  Studio3DPropHandGripSolver,
  type HandGripArchetype,
} from "../scene-3d/studio-3d-prop-hand-grip-solver";
import {
  Studio3DSceneAutoCulling,
  type TimeOfDayPreset,
} from "../scene-3d/studio-3d-scene-auto-culling";
import { Studio3DSpatialHandTrackingEngine } from "../scene-3d/studio-3d-spatial-hand-tracking";
import { Studio3DToonShaderGraph } from "../scene-3d/studio-3d-toon-shader-graph";
import { StudioBg3dArtifactRasterizationError } from "./studio-bg3d-artifact-rasterization";
import { resolveStudioBg3dBundleAssetFallback } from "./studio-bg3d-bundle-asset-fallback";
import {
  STUDIO_BG3D_ENGINE_ADOPTION_POLICY,
  calculateStudioBg3dEngineTimingP95,
} from "./studio-bg3d-engine-benchmark-analysis";
import {
  DEFAULT_STUDIO_BG3D_LINKED_RENDER_GRAPH,
  STUDIO_BG3D_LINKED_RENDER_PASSES,
} from "./studio-bg3d-linked-render-state";
import { buildStudioBg3dLtDepthWidthField } from "./studio-bg3d-lt-depth-width";
import {
  STUDIO_BG3D_LT_USER_PRESET_STORAGE_KEY,
  loadStudioBg3dLtUserPresetsFromStorage,
} from "./studio-bg3d-lt-preset-storage";
import { buildStudioBg3dModelCacheResidencyCandidates } from "./studio-bg3d-model-cache-residency";
import {
  STUDIO_BG3D_PLATE_POC_SPEC,
  computeStudioBg3dPlateEdgeRetention,
} from "./studio-bg3d-plate-poc";
import {
  STUDIO_BG3D_PROFESSIONAL_QUALITY_CORPUS,
  createStudioBg3dProfessionalBenchmarkManifest,
} from "./studio-bg3d-professional-quality-corpus";
import {
  STUDIO_BG3D_REALISTIC_RENDER_PRESETS,
  applyStudioBg3dRealisticRenderPreset,
  resolveStudioBg3dRealisticRenderPreset,
  type StudioBg3dRealisticRenderPresetId,
} from "./studio-bg3d-realistic-render-presets";
import { STUDIO_BG3D_SPECIALIST_WEBTOON_FX_CPU_EXECUTOR } from "./studio-bg3d-specialist-webtoon-fx-coordinator";

const CITYSCAPE_THEMES: readonly { readonly id: CityscapeTheme; readonly labelKo: string }[] = [
  { id: "seoul-commercial", labelKo: "서울 상업지구" },
  { id: "residential-alley", labelKo: "다세대 주택 골목" },
  { id: "school-street", labelKo: "통학로·학원가" },
  { id: "cyber-downtown", labelKo: "사이버 도심" },
];

const HAND_GRIP_TYPES: readonly { readonly id: HandGripArchetype; readonly labelKo: string }[] = [
  { id: "sword-power-grip", labelKo: "도검 파워 그립" },
  { id: "gun-pistol-trigger", labelKo: "권총 방아쇠 그립" },
  { id: "phone-pinch-hold", labelKo: "스마트폰 핀치 홀드" },
  { id: "cup-wrap-grasp", labelKo: "머그컵 손잡이 홀드" },
];

const LENS_PRESET_IDS = Object.keys(CAMERA_LENS_PRESET_UI) as CameraLensPreset[];
const TEMPO_EASING_IDS = Object.keys(CAMERA_TEMPO_EASING_UI) as CameraTempoEasing[];

export interface StudioBg3dDccScenePipelinePanelProps {
  readonly disabled?: boolean;
  readonly onApplyRealisticPreset?: (presetId: StudioBg3dRealisticRenderPresetId) => void;
  readonly onGenerateCityscape?: (theme: CityscapeTheme, buildingCount: number) => void;
  readonly onApplyLensPreset?: (preset: CameraLensPreset, focalLengthMm: number) => void;
  readonly onApplyGripPose?: (grip: HandGripArchetype, indexAngleDeg: number) => void;
}

/**
 * 3D DCC·실사 프리셋·원근 렌즈·절차적 도시·물리/그립·품질 코퍼스 통합 파이프라인 패널.
 */
export function StudioBg3dDccScenePipelinePanel({
  disabled = false,
  onApplyRealisticPreset,
  onGenerateCityscape,
  onApplyLensPreset,
  onApplyGripPose,
}: StudioBg3dDccScenePipelinePanelProps) {
  const [selectedRealisticId, setSelectedRealisticId] =
    useState<StudioBg3dRealisticRenderPresetId>("daylight-real");
  const [cityTheme, setCityTheme] = useState<CityscapeTheme>("seoul-commercial");
  const [lensPreset, setLensPreset] = useState<CameraLensPreset>(
    LENS_PRESET_IDS[0] ?? "standard-50mm",
  );
  const [tempoEasing, setTempoEasing] = useState<CameraTempoEasing>(
    TEMPO_EASING_IDS[0] ?? "ease-in-out",
  );
  const [gripType, setGripType] = useState<HandGripArchetype>("sword-power-grip");
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDayPreset>("golden-hour-sunset");

  const resolvedRealistic = useMemo(
    () => resolveStudioBg3dRealisticRenderPreset(selectedRealisticId),
    [selectedRealisticId],
  );

  const cityscapeStats = useMemo(() => {
    const city = new Studio3DProceduralCityscape({ theme: cityTheme });
    const mesh = city.generateMesh();
    return {
      buildingCount: mesh.buildingCount,
      vertexCount: mesh.positions.length / 3,
      triangleCount: mesh.indices.length / 3,
    };
  }, [cityTheme]);

  const lensAndRailDiag = useMemo(() => {
    const lens = new Studio3DCameraPerspectiveLens(lensPreset);
    const optical = lens.evaluateLensParameters(lensPreset);
    const guides = lens.evaluatePerspectiveGuides(800, 600);
    const rail = new Studio3DCinematographyRail();
    const proposals = rail.generateWebtoonPanelProposals(4);
    const tempoUi = CAMERA_TEMPO_EASING_UI[tempoEasing];
    return {
      focalLengthMm: optical.focalLengthMm,
      fovDeg: Math.round(optical.fovDeg * 10) / 10,
      guideLines: guides.guideLines.length,
      proposalCount: proposals.length,
      tempoLabelKo: tempoUi?.labelKo ?? tempoEasing,
    };
  }, [lensPreset, tempoEasing]);

  const characterDccDiag = useMemo(() => {
    const gripSolver = new Studio3DPropHandGripSolver();
    const gripResult = gripSolver.solveHandGrip(gripType, 0.02, 1.0);

    const mixer = new Studio3DCharacterSceneMixer("scene-dcc-1");
    mixer.addCharacter("hero-1", "주인공", [0, 0, 0]);
    const mixSummary = mixer.generateMixSummary();

    const cloth = new Studio3DClothHairDynamics();
    cloth.initClothGrid(3, 3, 0.1);
    cloth.step();

    const hairGen = new Studio3DProceduralHairStrandGenerator();
    hairGen.addStrand({
      id: "strand-main",
      rootPoint: [0, 1.7, 0],
      midPoint: [0.04, 1.55, 0.03],
      tipPoint: [0.06, 1.38, 0.05],
      baseWidth: 0.035,
      profile: "flat-ribbon",
      taperExponent: 1.4,
      gravitySag: 0.02,
      twistDeg: 15,
    });
    const hairBuf = hairGen.generateMeshBuffers(6);

    const handTracking = new Studio3DSpatialHandTrackingEngine();
    const scaleState = handTracking.evaluateTwoHandScale();
    const cropState = handTracking.evaluateTwoHandFrameCrop();

    const attachProbe = solveStudio3dAttachment({
      document: null,
      constraintId: "probe-grip",
      runtimeNodes: null,
      primarySocketWorld: null,
      propAnchorLocal: null,
    });

    return {
      indexFlexionDeg: Math.round(gripResult.index.proximalAngleDeg),
      characterCount: mixSummary.characterCount,
      clothParticles: cloth.getParticles().length,
      hairTriangles: hairBuf.triangleCount,
      twoHandSpanM: scaleState.currentSpanMeters + cropState.width,
      attachMaxDist: STUDIO_3D_ATTACHMENT_SOLVER_MAX_WORLD_DISTANCE,
      attachProbeStatus: attachProbe.ok ? "ok" : attachProbe.code,
    };
  }, [gripType]);

  const pipelineQualityDiag = useMemo(() => {
    const culling = new Studio3DSceneAutoCulling(timeOfDay);
    const atmo = culling.evaluateAtmosphereLighting(timeOfDay);

    const toonGraph = new Studio3DToonShaderGraph();
    const shade = toonGraph.evaluateShading({
      normal: [0, 0.707, 0.707],
      lightDir: [0.4, 0.8, 0.4],
      viewDir: [0, 0, 1],
    });

    const editMesh = new Studio3DEditableMesh();
    const v0 = editMesh.addVertex([0, 0, 0]);
    const v1 = editMesh.addVertex([1, 0, 0]);
    const v2 = editMesh.addVertex([0, 1, 0]);
    editMesh.addFace([v0.id, v1.id, v2.id]);
    const meshStats = editMesh.getStats();

    const pkg = createEmptyToon3DPackage("스튜디오 DCC 검증 패키지", "ToonStudio");
    const pkgIssues = validateToon3DPackage(pkg);

    const widthField = buildStudioBg3dLtDepthWidthField({
      width: 2,
      height: 2,
      depth: [0.1, 0.3, 0.6, 0.9],
      baseWidthPx: 2.0,
      minWidthPx: 0.75,
      maxWidthPx: 4.0,
    });

    const memStorage = {
      getItem: () => null,
      setItem: () => undefined,
    };
    const presetStorageStatus = loadStudioBg3dLtUserPresetsFromStorage(memStorage).status;

    const residencyCandidates = buildStudioBg3dModelCacheResidencyCandidates({
      cache: new Map(),
      instances: [],
    });

    const edgeRetention = computeStudioBg3dPlateEdgeRetention(
      new Uint8Array([1, 1, 0, 1]),
      new Uint8Array([1, 1, 0, 1]),
      2,
      2,
    );

    const fallbackResolution = resolveStudioBg3dBundleAssetFallback({
      deployAvailable: true,
      assetRoot: "/assets/bg3d",
      sha256: STUDIO_BG3D_PLATE_POC_SPEC.catalogId,
    });

    const corpusManifest = createStudioBg3dProfessionalBenchmarkManifest();
    const p95Ms = calculateStudioBg3dEngineTimingP95([11.2, 13.8, 14.5, 16.0]) ?? 0;
    const rasterErrorSample = new StudioBg3dArtifactRasterizationError("invalid-capture").code;

    return {
      sunAltitudeDeg: atmo.sunAltitudeDeg,
      diffuseIntensity: Math.round(shade.diffuseIntensity * 100),
      editableFaces: meshStats.faces,
      toon3dVersion: CURRENT_TOON3D_FORMAT_VERSION,
      pkgValid: pkgIssues.length === 0,
      ltCenterWidthPx: widthField ? Math.round(widthField[0]! * 100) / 100 : 2,
      presetStorageStatus,
      storageKey: STUDIO_BG3D_LT_USER_PRESET_STORAGE_KEY,
      residencyCount: residencyCandidates.length,
      edgeRetentionPct: Math.round(edgeRetention * 100),
      fallbackStatus: fallbackResolution.status,
      corpusCount: STUDIO_BG3D_PROFESSIONAL_QUALITY_CORPUS.length,
      benchmarkCriticalCount: corpusManifest.length,
      p95Ms,
      maxLatencyBudgetMs: STUDIO_BG3D_ENGINE_ADOPTION_POLICY.maximumInputLatencyP95Ms,
      linkedPasses: STUDIO_BG3D_LINKED_RENDER_PASSES.length,
      combinedDeps: DEFAULT_STUDIO_BG3D_LINKED_RENDER_GRAPH.combined.length,
      fxExecutor: STUDIO_BG3D_SPECIALIST_WEBTOON_FX_CPU_EXECUTOR,
      rasterErrorSample,
    };
  }, [timeOfDay]);

  return (
    <div
      data-testid="bg3d-dcc-scene-pipeline-panel"
      className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3 text-xs text-fg"
    >
      {/* 1. 실사 렌더 프리셋 4종 */}
      <div className="rounded-lg border border-line bg-panel/60 p-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-semibold text-fg">
            <Sparkles className="size-3.5 text-accent" />
            실사 렌더 프리셋 (HDRI · 2K PBR · LT 선화 통합)
          </span>
          <span className="text-[11px] text-fg-2">
            {resolvedRealistic?.hdri.labelKo} · {resolvedRealistic?.pbrMaterial.labelKo}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {STUDIO_BG3D_REALISTIC_RENDER_PRESETS.map((preset) => {
            const active = preset.id === selectedRealisticId;
            return (
              <button
                key={preset.id}
                type="button"
                disabled={disabled}
                data-testid={`bg3d-realistic-preset-${preset.id}`}
                onClick={() => {
                  setSelectedRealisticId(preset.id);
                  applyStudioBg3dRealisticRenderPreset(preset.id);
                  onApplyRealisticPreset?.(preset.id);
                }}
                className={`rounded-md border px-2 py-1.5 text-left transition-colors ${
                  active
                    ? "border-accent bg-accent-soft font-semibold text-accent"
                    : "border-line bg-card text-fg-2 hover:text-fg"
                }`}
              >
                <div className="text-[11px]">{preset.labelKo}</div>
                <div className="truncate text-[10px] opacity-80">{preset.pbrMaterialId}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. 절차적 도시 블록 생성기 & 자동 컬링 */}
      <div className="rounded-lg border border-line bg-panel/60 p-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-semibold text-fg">
            <Box className="size-3.5 text-accent" />
            절차적 웹툰 도시 거리 & 시간대 조명/컬링
          </span>
          <span
            data-testid="bg3d-cityscape-stats-readout"
            className="text-[11px] text-fg-2"
          >
            빌딩 {cityscapeStats.buildingCount}동 · 삼각형 {cityscapeStats.triangleCount}개 · 태양고도{" "}
            {pipelineQualityDiag.sunAltitudeDeg}°
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CITYSCAPE_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              disabled={disabled}
              data-testid={`bg3d-cityscape-theme-${theme.id}`}
              onClick={() => {
                setCityTheme(theme.id);
                onGenerateCityscape?.(theme.id, cityscapeStats.buildingCount);
              }}
              className={`rounded-md border px-2.5 py-1 text-[11px] ${
                cityTheme === theme.id
                  ? "border-accent bg-accent-soft font-semibold text-accent"
                  : "border-line bg-card text-fg-2 hover:text-fg"
              }`}
            >
              {theme.labelKo}
            </button>
          ))}
          {(["noon-clear-sky", "golden-hour-sunset", "cyberpunk-neon-night"] as const).map(
            (tod) => (
              <button
                key={tod}
                type="button"
                disabled={disabled}
                onClick={() => setTimeOfDay(tod)}
                className={`rounded-md border px-2 py-1 text-[10px] ${
                  timeOfDay === tod
                    ? "border-fg/40 bg-fg/10 font-medium text-fg"
                    : "border-line bg-card text-fg-2"
                }`}
              >
                {tod}
              </button>
            ),
          )}
        </div>
      </div>

      {/* 3. 원근 카메라 렌즈 & 시네마토그래피 레일 */}
      <div className="rounded-lg border border-line bg-panel/60 p-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-semibold text-fg">
            <Camera className="size-3.5 text-accent" />
            원근 카메라 렌즈 · 시네마토그래피 레일
          </span>
          <span data-testid="bg3d-lens-rail-readout" className="text-[11px] text-fg-2">
            {lensAndRailDiag.focalLengthMm}mm (FOV {lensAndRailDiag.fovDeg}°) · 소실선{" "}
            {lensAndRailDiag.guideLines}개 · 추천 컷 {lensAndRailDiag.proposalCount}컷 (
            {lensAndRailDiag.tempoLabelKo})
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {LENS_PRESET_IDS.map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={disabled}
              data-testid={`bg3d-lens-preset-${preset}`}
              onClick={() => {
                setLensPreset(preset);
                const optical = new Studio3DCameraPerspectiveLens(preset).evaluateLensParameters(
                  preset,
                );
                onApplyLensPreset?.(preset, optical.focalLengthMm);
              }}
              className={`rounded-md border px-2 py-1 text-[11px] ${
                lensPreset === preset
                  ? "border-accent bg-accent-soft font-semibold text-accent"
                  : "border-line bg-card text-fg-2 hover:text-fg"
              }`}
            >
              {CAMERA_LENS_PRESET_UI[preset]?.labelKo ?? preset}
            </button>
          ))}
          {TEMPO_EASING_IDS.map((easing) => (
            <button
              key={easing}
              type="button"
              disabled={disabled}
              onClick={() => setTempoEasing(easing)}
              className={`rounded-md border px-2 py-1 text-[10px] ${
                tempoEasing === easing
                  ? "border-fg/40 bg-fg/10 font-medium text-fg"
                  : "border-line bg-card text-fg-2"
              }`}
            >
              {CAMERA_TEMPO_EASING_UI[easing]?.labelKo ?? easing}
            </button>
          ))}
        </div>
      </div>

      {/* 4. 소품 핸드 그립 솔버 & 의상/헤어 물리 */}
      <div className="rounded-lg border border-line bg-panel/60 p-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-semibold text-fg">
            <Layers className="size-3.5 text-accent" />
            소품 그립 솔버 · 천/헤어 스트랜드 · 공간 핸드 트래킹
          </span>
          <span data-testid="bg3d-grip-cloth-readout" className="text-[11px] text-fg-2">
            검지 굴곡 {characterDccDiag.indexFlexionDeg}° · 천 파티클 {characterDccDiag.clothParticles}
            개 · 헤어 삼각형 {characterDccDiag.hairTriangles}개
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {HAND_GRIP_TYPES.map((grip) => (
            <button
              key={grip.id}
              type="button"
              disabled={disabled}
              data-testid={`bg3d-grip-type-${grip.id}`}
              onClick={() => {
                setGripType(grip.id);
                onApplyGripPose?.(grip.id, characterDccDiag.indexFlexionDeg);
              }}
              className={`rounded-md border px-2.5 py-1 text-[11px] ${
                gripType === grip.id
                  ? "border-accent bg-accent-soft font-semibold text-accent"
                  : "border-line bg-card text-fg-2 hover:text-fg"
              }`}
            >
              {grip.labelKo}
            </button>
          ))}
        </div>
      </div>

      {/* 5. DCC 코어·품질 코퍼스·링크드 렌더 상태 요약 */}
      <div
        data-testid="bg3d-pipeline-quality-summary"
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card/80 px-2.5 py-2 text-[11px] text-fg-2"
      >
        <span className="flex items-center gap-1.5 font-medium text-fg">
          <Cpu className="size-3.5 text-good" />
          Toon3D v{pipelineQualityDiag.toon3dVersion} ({pipelineQualityDiag.pkgValid ? "정상" : "경고"}) ·
          하프엣지 면 {pipelineQualityDiag.editableFaces}개 · 툰 디퓨즈{" "}
          {pipelineQualityDiag.diffuseIntensity}%
        </span>
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="size-3.5 text-good" />
          품질 코퍼스 {pipelineQualityDiag.corpusCount}종 (핵심{" "}
          {pipelineQualityDiag.benchmarkCriticalCount}종) · P95 {pipelineQualityDiag.p95Ms}ms · LT 선유지율{" "}
          {pipelineQualityDiag.edgeRetentionPct}% · 렌더패스 {pipelineQualityDiag.linkedPasses}종
        </span>
      </div>
    </div>
  );
}
