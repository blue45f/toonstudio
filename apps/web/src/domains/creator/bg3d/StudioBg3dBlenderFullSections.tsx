import { Aperture, Box, Camera, Cpu, Layers, PenTool, Sparkles, Waves } from "lucide-react";
import React, { useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import {
  buildBlenderPresetScenePrimitives,
  evaluateBlenderCameraRig,
  evaluateBlenderCompositorPipeline,
  evaluateBlenderEditSculptSession,
  evaluateBlenderGp3AndFreestylePipeline,
  evaluateBlenderModifierStack,
  evaluateBlenderPhysicsSuite,
  type BlenderEditMeshOperatorId,
  type BlenderFreestyleEdgeType,
  type BlenderGp3ModifierType,
  type BlenderModifierStackItem,
  type BlenderScenePresetThemeId,
  type BlenderSculptToolId,
} from "./studio-bg3d-blender-full-engine";
import { StudioBg3dKitbashCharacterModelerPanel } from "./StudioBg3dKitbashCharacterModelerPanel";
import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document-types";

export interface StudioBg3dBlenderFullSectionsProps {
  readonly disabled?: boolean;
  readonly onStatusChange?: (summaryKo: string) => void;
  readonly onInsertScenePrimitives?: (primitives: readonly BgPrimitive[], labelKo: string) => void;
  readonly onApplySceneCamera?: (camera: StudioBg3dCameraSettings, labelKo: string) => void;
  readonly onSyncSceneLineArt?: (enabled: boolean, summaryKo: string) => void;
}

const EDIT_MESH_OPS: readonly { readonly id: BlenderEditMeshOperatorId; readonly labelKo: string }[] =
  Object.freeze([
    { id: "extrude_manifold", labelKo: "Extrude Manifold (수밀 돌출)" },
    { id: "inset", labelKo: "Inset Faces (면 내부 오프셋)" },
    { id: "bevel", labelKo: "Bevel (모서리 챔퍼·세그먼트)" },
    { id: "loopcut_slide", labelKo: "Loop Cut & Slide (루프 컷)" },
    { id: "knife", labelKo: "Knife Topology Cut (나이프 절단)" },
    { id: "bisect", labelKo: "Bisect Plane (평면 이등분)" },
    { id: "spin", labelKo: "Spin Lathe (축 회전체)" },
    { id: "shrink_fatten", labelKo: "Shrink/Fatten (법선 팽창)" },
    { id: "tosphere", labelKo: "To Sphere (구형화 보간)" },
  ]);

const SCULPT_TOOLS: readonly { readonly id: BlenderSculptToolId; readonly labelKo: string }[] =
  Object.freeze([
    { id: "dyntopo_density", labelKo: "Dyntopo 동적 토폴로지" },
    { id: "cloth_filter", labelKo: "Cloth Filter (주름 스컬프팅)" },
    { id: "mesh_filter", labelKo: "Mesh Filter (Inflate/Smooth)" },
    { id: "trim_lasso", labelKo: "Trim Lasso (올가미 불리언 절삭)" },
    { id: "face_set_edit", labelKo: "Face Set 그룹 분할" },
  ]);

const FREESTYLE_EDGE_TYPES: readonly { readonly id: BlenderFreestyleEdgeType; readonly labelKo: string }[] =
  Object.freeze([
    { id: "silhouette", labelKo: "Silhouette (외곽 실루엣)" },
    { id: "crease", labelKo: "Crease (주름 각도)" },
    { id: "border", labelKo: "Border (개방 경계)" },
    { id: "edge_mark", labelKo: "Edge Mark (수동 마크)" },
    { id: "contour", labelKo: "Contour (윤곽선)" },
    { id: "external_contour", labelKo: "External Contour (외부 윤곽)" },
    { id: "material_boundary", labelKo: "Material Boundary (재질 경계)" },
    { id: "suggestive_contour", labelKo: "Suggestive Contour (암시 윤곽)" },
    { id: "ridge_valley", labelKo: "Ridge & Valley (능선·계곡)" },
  ]);

const SCENE_PRESET_THEMES: readonly { readonly id: BlenderScenePresetThemeId; readonly labelKo: string }[] =
  Object.freeze([
    { id: "fantasy-citadel", labelKo: "왕국 대성채 알현실" },
    { id: "cyberpunk-neon-alley", labelKo: "네온 사이버펑크 뒷골목" },
    { id: "arcane-astronomy-tower", labelKo: "아스트랄 마법 천문대" },
    { id: "boss-raid-altar", labelKo: "심연 보스 레이드 투기장" },
  ]);

export function StudioBg3dBlenderFullSections({
  disabled = false,
  onStatusChange,
  onInsertScenePrimitives,
  onApplySceneCamera,
  onSyncSceneLineArt,
}: StudioBg3dBlenderFullSectionsProps): React.JSX.Element {
  const bt = useBilingual("StudioBg3dBlenderFullSections");
  // 6. Modifier Stack state
  const [arrayCount, setArrayCount] = useState<number>(4);
  const [subsurfLevels, setSubsurfLevels] = useState<number>(2);
  const [enableCurveTube, setEnableCurveTube] = useState<boolean>(true);
  const [enableScatter, setEnableScatter] = useState<boolean>(true);

  // 7. Edit Mesh & Sculpt state
  const [editOp, setEditOp] = useState<BlenderEditMeshOperatorId>("extrude_manifold");
  const [sculptTool, setSculptTool] = useState<BlenderSculptToolId>("dyntopo_density");
  const [dyntopoPx, setDyntopoPx] = useState<number>(4);

  // 8. Grease Pencil v3 & Freestyle 9-Edge state
  const [gp3LayerCount, setGp3LayerCount] = useState<number>(5);
  const [useLayerMasks, setUseLayerMasks] = useState<boolean>(true);
  const [enabledEdges, setEnabledEdges] = useState<readonly BlenderFreestyleEdgeType[]>([
    "silhouette",
    "crease",
    "border",
    "material_boundary",
    "suggestive_contour",
  ]);
  const [qiEnd, setQiEnd] = useState<number>(2);

  // 9. Compositor & Physics state
  const [glareType, setGlareType] = useState<"FOG_GLOW" | "STREAKS" | "GHOSTS" | "SUN_BEAMS">("FOG_GLOW");
  const [chromaticDispersion, setChromaticDispersion] = useState<number>(0.12);
  const [fluidDomainType, setFluidDomainType] = useState<"GAS" | "LIQUID">("GAS");
  const [fluidDivisions, setFluidDivisions] = useState<number>(64);
  const [clothUsePressure, setClothUsePressure] = useState<boolean>(true);

  // 10. Camera Rig & Scene Theme state
  const [cameraType, setCameraType] = useState<"PERSP" | "ORTHO" | "PANO">("PERSP");
  const [focalLengthMm, setFocalLengthMm] = useState<number>(35);
  const [shiftY, setShiftY] = useState<number>(0.12);
  const [fstop, setFstop] = useState<number>(2.8);
  const [selectedThemeId, setSelectedThemeId] = useState<BlenderScenePresetThemeId>("fantasy-citadel");

  const modifierStack = useMemo<readonly BlenderModifierStackItem[]>(
    () => [
      { type: "ARRAY", category: "Generate", enabled: true, primaryValue: arrayCount },
      { type: "BEVEL", category: "Generate", enabled: true, primaryValue: 3 },
      { type: "SUBSURF", category: "Generate", enabled: true, primaryValue: subsurfLevels },
      { type: "MOD_CURVE_TO_TUBE", category: "Generate", enabled: enableCurveTube, primaryValue: 1 },
      { type: "MOD_SCATTER_ON_SURFACE", category: "Generate", enabled: enableScatter, primaryValue: 12 },
      { type: "WEIGHTED_NORMAL", category: "Normals", enabled: true, primaryValue: 50 },
      { type: "LINEART", category: "Generate", enabled: true, primaryValue: 1 },
    ],
    [arrayCount, enableCurveTube, enableScatter, subsurfLevels],
  );

  const modEval = useMemo(() => evaluateBlenderModifierStack(modifierStack), [modifierStack]);

  const editSculptEval = useMemo(
    () =>
      evaluateBlenderEditSculptSession({
        editOperator: editOp,
        editIntensity: 1.2,
        sculptTool,
        dyntopoDetailSizePx: dyntopoPx,
        symmetryAxes: ["X"],
      }),
    [dyntopoPx, editOp, sculptTool],
  );

  const gp3Modifiers: readonly BlenderGp3ModifierType[] = useMemo(
    () => ["GREASE_PENCIL_NOISE", "GREASE_PENCIL_THICKNESS", "GREASE_PENCIL_OUTLINE"],
    [],
  );

  const gp3FreestyleEval = useMemo(
    () =>
      evaluateBlenderGp3AndFreestylePipeline({
        layerCount: gp3LayerCount,
        useLayerMasks,
        onionSkinFramesBefore: 2,
        onionSkinFramesAfter: 2,
        radiusOffsetPx: 0.6,
        tintFactor: 0.35,
        activeGp3Modifiers: gp3Modifiers,
        enabledFreestyleEdgeTypes: enabledEdges,
        creaseAngleDeg: 134,
        qiStart: 0,
        qiEnd,
        krDerivativeEpsilon: 0.001,
      }),
    [enabledEdges, gp3LayerCount, gp3Modifiers, qiEnd, useLayerMasks],
  );

  const compositorEval = useMemo(
    () =>
      evaluateBlenderCompositorPipeline({
        glareType,
        glareMix: 0.45,
        lensDistortion: -0.04,
        lensDispersionChromatic: chromaticDispersion,
        colorBalanceLiftGammaGain: [1.0, 1.05, 1.12],
        enableCryptomatteV2: true,
        enableOpenImageDenoise: true,
        enableMaskToSdfInpaint: true,
      }),
    [chromaticDispersion, glareType],
  );

  const physicsEval = useMemo(
    () =>
      evaluateBlenderPhysicsSuite({
        rigidBodyType: "ACTIVE",
        rigidBodyShape: "COMPOUND",
        massKg: 12.5,
        friction: 0.5,
        restitution: 0.25,
        clothBendingModel: "ANGULAR",
        clothTensionStiffness: 18,
        clothUsePressure,
        clothPressureForce: 2.5,
        clothUseSewingSprings: true,
        fluidDomainType,
        fluidResolutionDivisions: fluidDivisions,
        fluidUseNoiseOrFlipParticles: true,
      }),
    [clothUsePressure, fluidDivisions, fluidDomainType],
  );

  const cameraEval = useMemo(
    () =>
      evaluateBlenderCameraRig({
        type: cameraType,
        panoramaType: "FISHEYE_LENS_POLYNOMIAL",
        focalLengthMm,
        sensorWidthMm: 36,
        sensorHeightMm: 24,
        shiftX: 0,
        shiftY,
        apertureFstop: fstop,
        apertureBlades: 7,
        apertureRatioAnamorphic: 1.33,
        fisheyePolynomialK: [0, -0.52, -0.02, 0.004, -0.0005],
        passepartoutAlpha: 0.85,
      }),
    [cameraType, focalLengthMm, fstop, shiftY],
  );

  const themeScene = useMemo(
    () => buildBlenderPresetScenePrimitives(selectedThemeId),
    [selectedThemeId],
  );

  const toggleFreestyleEdge = (edge: BlenderFreestyleEdgeType) => {
    setEnabledEdges((prev) =>
      prev.includes(edge) ? prev.filter((item) => item !== edge) : [...prev, edge],
    );
  };

  return (
    <div className="space-y-2.5 border-t border-line pt-2.5">
      <section className="space-y-2 rounded-lg border border-line bg-panel p-3" aria-label={bt("웹 모델링 작업대", "Web modeling workbench")}>
        <p className="text-xs leading-6 text-fg-2">
          {bt(
            "점·모서리·면 편집과 비파괴 모디파이어는 웹 3D 모델링 작업대에서 사용합니다. 아래 패널은 설정 검토와 배경 프리셋 생성에 사용합니다.",
            "Use the web 3D modeling workbench to edit vertices, edges and faces and apply non-destructive modifiers. The panels below review settings and generate background presets.",
          )}
        </p>
        <a
          href="/studio/3d/dcc/model"
          aria-disabled={disabled || undefined}
          onClick={(event) => { if (disabled) event.preventDefault(); }}
          className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent aria-disabled:opacity-50"
        >
          {bt("3D 모델링 작업대로 이동", "Open the 3D modeling workbench")}
        </a>
      </section>
      {/* 6. Blender 5.2 6-Category Modifier Stack & GN Essentials */}
      <section
        data-testid="bg3d-blender-modifier-stack-section"
        className="flex flex-col gap-2 rounded-lg border border-line bg-panel/50 p-2.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1 font-semibold text-fg">
            <Layers className="size-3.5 text-accent" aria-hidden />
            6. 모디파이어 설정·절차형 배경 프리셋
          </span>
          <span data-testid="bg3d-blender-modifier-readout" className="font-mono text-[0.62rem] text-accent">
            {modEval.summaryKo}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded border border-line bg-card p-2">
            <div className="flex items-center justify-between font-semibold">
              <span>Array 복제 수 (`MOD_ARRAY`)</span>
              <span className="font-mono text-accent">{arrayCount}개</span>
            </div>
            <input
              type="range"
              min={1}
              max={12}
              step={1}
              disabled={disabled}
              aria-label="배열 복제 수"
              data-testid="bg3d-blender-mod-array-slider"
              value={arrayCount}
              onChange={(e) => setArrayCount(Number(e.target.value))}
              className="mt-1 w-full accent-accent"
            />
          </div>

          <div className="rounded border border-line bg-card p-2">
            <div className="flex items-center justify-between font-semibold">
              <span>Subdivision 레벨 (`SUBSURF`)</span>
              <span className="font-mono text-accent">Lv.{subsurfLevels}</span>
            </div>
            <input
              type="range"
              min={1}
              max={4}
              step={1}
              disabled={disabled}
              aria-label="세분화 레벨"
              value={subsurfLevels}
              onChange={(e) => setSubsurfLevels(Number(e.target.value))}
              className="mt-1 w-full accent-accent"
            />
          </div>

          <div className="flex flex-col justify-between rounded border border-line bg-card p-2 text-[0.63rem]">
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={enableCurveTube}
                disabled={disabled}
                onChange={(e) => setEnableCurveTube(e.target.checked)}
                className="accent-accent"
              />
              <span>GN `Curve to Tube` 활성</span>
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={enableScatter}
                disabled={disabled}
                onChange={(e) => setEnableScatter(e.target.checked)}
                className="accent-accent"
              />
              <span>GN `Scatter on Surface` 활성</span>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-[0.6rem] text-fg-3">
            에셋 노드 경로: {modEval.assetNodePathsUsed.join(" · ")}
          </span>
          <button
            type="button"
            disabled={disabled}
            data-testid="bg3d-blender-modifier-insert-btn"
            onClick={() => {
              onStatusChange?.(modEval.summaryKo);
              onInsertScenePrimitives?.(modEval.primitives, modEval.summaryKo);
            }}
            className="inline-flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-[0.65rem] font-bold text-on-accent"
          >
            <Sparkles className="size-3" aria-hidden />
            <span>현재 3D 장면에 모디파이어 생성물 배치</span>
          </button>
        </div>
      </section>

      {/* 7. Edit Mesh 22 Operators & Sculpt Mode */}
      <section
        data-testid="bg3d-blender-edit-sculpt-section"
        className="flex flex-col gap-2 rounded-lg border border-line bg-panel/50 p-2.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1 font-semibold text-fg">
            <Box className="size-3.5 text-accent" aria-hidden />
            7. 메시 편집·조형 설정
          </span>
          <span className="font-mono text-[0.62rem] text-fg-2">{editSculptEval.summaryKo}</span>
        </div>

        <div className="flex flex-wrap gap-1">
          {EDIT_MESH_OPS.map((op) => (
            <button
              key={op.id}
              type="button"
              disabled={disabled}
              data-testid={`bg3d-blender-editop-${op.id}`}
              onClick={() => {
                setEditOp(op.id);
                onStatusChange?.(`메시 편집 설정: ${op.labelKo}`);
              }}
              className={`rounded border px-2 py-0.5 text-[0.62rem] ${
                editOp === op.id
                  ? "border-accent bg-accent/15 font-bold text-accent"
                  : "border-line bg-card text-fg-2"
              }`}
            >
              {op.labelKo}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-card px-2.5 py-1.5">
          <div className="flex flex-wrap gap-1">
            {SCULPT_TOOLS.map((tool) => (
              <button
                key={tool.id}
                type="button"
                disabled={disabled}
                data-testid={`bg3d-blender-sculpt-${tool.id}`}
                onClick={() => setSculptTool(tool.id)}
                className={`rounded border px-2 py-0.5 text-[0.6rem] ${
                  sculptTool === tool.id
                    ? "border-accent bg-accent/20 font-semibold text-accent"
                    : "border-line bg-panel text-fg-2"
                }`}
              >
                {tool.labelKo}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[0.62rem]">
            <span>Dyntopo 디테일: {dyntopoPx}px</span>
            <input
              type="range"
              min={1}
              max={12}
              step={1}
              disabled={disabled}
              aria-label="Sculpt Dyntopo 디테일 픽셀"
              value={dyntopoPx}
              onChange={(e) => setDyntopoPx(Number(e.target.value))}
              className="w-20 accent-accent"
            />
            <button
              type="button"
              disabled={disabled}
              data-testid="bg3d-blender-edit-sculpt-insert-btn"
              onClick={() => {
                onStatusChange?.(editSculptEval.summaryKo);
                onInsertScenePrimitives?.(editSculptEval.primitives, editSculptEval.summaryKo);
              }}
              className="inline-flex items-center gap-1 rounded bg-accent px-2 py-1 text-[0.62rem] font-bold text-on-accent"
            >
              <Sparkles className="size-3" aria-hidden />
              <span>현재 3D 장면에 조형 메시 배치 ({editSculptEval.primitives.length})</span>
            </button>
          </div>
        </div>
      </section>

      <StudioBg3dKitbashCharacterModelerPanel
        disabled={disabled}
        defaultMode="background"
        onStatusChange={onStatusChange}
        onInsertScenePrimitives={onInsertScenePrimitives}
      />

      {/* 8. Grease Pencil v3 (GPv3) & Freestyle 9 Edge Types */}
      <section
        data-testid="bg3d-blender-gp3-freestyle-section"
        className="flex flex-col gap-2 rounded-lg border border-line bg-panel/50 p-2.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1 font-semibold text-fg">
            <PenTool className="size-3.5 text-accent" aria-hidden />
            8. 3D 선화 레이어·마스크·어니언 스킨 설정
          </span>
          <span data-testid="bg3d-blender-gp3-readout" className="font-mono text-[0.62rem] text-accent">
            {gp3FreestyleEval.summaryKo}
          </span>
        </div>

        <div className="flex flex-wrap gap-1">
          {FREESTYLE_EDGE_TYPES.map((edge) => {
            const active = enabledEdges.includes(edge.id);
            return (
              <button
                key={edge.id}
                type="button"
                disabled={disabled}
                data-testid={`bg3d-blender-fs-edge-${edge.id}`}
                onClick={() => toggleFreestyleEdge(edge.id)}
                className={`rounded border px-2 py-0.5 text-[0.6rem] ${
                  active
                    ? "border-accent bg-accent/15 font-bold text-accent"
                    : "border-line bg-card text-fg-3"
                }`}
              >
                {edge.labelKo}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-card px-2.5 py-1.5 text-[0.63rem]">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1">
              <span>선화 레이어: {gp3LayerCount}</span>
              <input
                type="range"
                min={1}
                max={12}
                step={1}
                disabled={disabled}
                aria-label="선화 레이어 수"
                value={gp3LayerCount}
                onChange={(e) => setGp3LayerCount(Number(e.target.value))}
                className="w-20 accent-accent"
              />
            </label>
            <label className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={useLayerMasks}
                disabled={disabled}
                onChange={(e) => setUseLayerMasks(e.target.checked)}
                className="accent-accent"
              />
              <span>`GREASE_PENCIL_UL_masks` 클리핑 마스크 활성</span>
            </label>
            <label className="inline-flex items-center gap-1">
              <span>QI 은선 범위(0~{qiEnd}):</span>
              <input
                type="range"
                min={0}
                max={6}
                step={1}
                disabled={disabled}
                aria-label="선화 가림 단계 범위"
                value={qiEnd}
                onChange={(e) => setQiEnd(Number(e.target.value))}
                className="w-16 accent-accent"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={disabled}
            data-testid="bg3d-blender-gp3-sync-lineart-btn"
            onClick={() => {
              onStatusChange?.(gp3FreestyleEval.summaryKo);
              onSyncSceneLineArt?.(true, gp3FreestyleEval.summaryKo);
            }}
            className="inline-flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-[0.65rem] font-bold text-on-accent"
          >
            <Sparkles className="size-3" aria-hidden />
            <span>3D 뷰포트 선화 미리보기(LineArt) 즉시 동기화</span>
          </button>
        </div>
      </section>

      {/* 9. Compositor 17-Category Node Graph & Physics Suite (RigidBody / Cloth / Mantaflow) */}
      <section
        data-testid="bg3d-blender-compositor-physics-section"
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
      >
        <div className="flex flex-col justify-between gap-2 rounded-lg border border-line bg-panel/50 p-2.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 font-semibold text-fg">
              <Cpu className="size-3.5 text-accent" aria-hidden />
              9A. Compositor 노드 그래프 (`Glare` · `CryptomatteV2` · `MaskToSDF`)
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {(["FOG_GLOW", "STREAKS", "GHOSTS", "SUN_BEAMS"] as const).map((gt) => (
              <button
                key={gt}
                type="button"
                disabled={disabled}
                onClick={() => setGlareType(gt)}
                className={`rounded border px-2 py-0.5 text-[0.6rem] ${
                  glareType === gt ? "border-accent bg-accent/15 font-bold text-accent" : "border-line bg-card text-fg-2"
                }`}
              >
                {gt}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between text-[0.62rem]">
            <span>렌즈 색수차(`CompositorNodeLensdist`): {chromaticDispersion.toFixed(2)}</span>
            <input
              type="range"
              min={0}
              max={0.4}
              step={0.02}
              disabled={disabled}
              aria-label="컴포지터 렌즈 색수차"
              value={chromaticDispersion}
              onChange={(e) => setChromaticDispersion(Number(e.target.value))}
              className="w-24 accent-accent"
            />
          </div>
          <p className="font-mono text-[0.6rem] text-fg-3">{compositorEval.summaryKo}</p>
        </div>

        <div className="flex flex-col justify-between gap-2 rounded-lg border border-line bg-panel/50 p-2.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 font-semibold text-fg">
              <Waves className="size-3.5 text-accent" aria-hidden />
              9B. 강체·천·유체 설정
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[0.62rem]">
            <div className="flex gap-1">
              {(["GAS", "LIQUID"] as const).map((ft) => (
                <button
                  key={ft}
                  type="button"
                  disabled={disabled}
                  onClick={() => setFluidDomainType(ft)}
                  className={`rounded border px-2 py-0.5 text-[0.6rem] ${
                    fluidDomainType === ft
                      ? "border-accent bg-accent/15 font-bold text-accent"
                      : "border-line bg-card text-fg-2"
                  }`}
                >
                  유체 {ft}
                </button>
              ))}
            </div>
            <label className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={clothUsePressure}
                disabled={disabled}
                onChange={(e) => setClothUsePressure(e.target.checked)}
                className="accent-accent"
              />
              <span>Cloth 내부 압력·봉제 스프링</span>
            </label>
          </div>
          <div className="flex items-center justify-between text-[0.62rem]">
            <span>복셀 분할 해상도: {fluidDivisions}³</span>
            <input
              type="range"
              min={32}
              max={128}
              step={16}
              disabled={disabled}
              aria-label="유체 복셀 분할 해상도"
              value={fluidDivisions}
              onChange={(e) => setFluidDivisions(Number(e.target.value))}
              className="w-24 accent-accent"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[0.59rem] text-fg-3">{physicsEval.summaryKo}</span>
            <button
              type="button"
              disabled={disabled}
              data-testid="bg3d-blender-physics-insert-btn"
              onClick={() => {
                onStatusChange?.(physicsEval.summaryKo);
                onInsertScenePrimitives?.(physicsEval.primitives, physicsEval.summaryKo);
              }}
              className="shrink-0 rounded bg-accent px-2 py-1 text-[0.62rem] font-bold text-on-accent"
            >
              물리 도메인 배치
            </button>
          </div>
        </div>
      </section>

      {/* 10. Cinematic Camera Rig & Blender 5.2 Scene Builder */}
      <section
        data-testid="bg3d-blender-camera-scene-section"
        className="flex flex-col gap-2 rounded-lg border border-line bg-panel/50 p-2.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1 font-semibold text-fg">
            <Camera className="size-3.5 text-accent" aria-hidden />
            10. 시네마틱 카메라 설정·배경 세트
          </span>
          <span className="font-mono text-[0.62rem] text-accent">{cameraEval.summaryKo}</span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded border border-line bg-card p-2">
            <div className="flex items-center justify-between font-semibold">
              <span>투영 모드 & 초점거리</span>
              <span className="font-mono text-accent">{focalLengthMm}mm</span>
            </div>
            <div className="mt-1 flex gap-1">
              {(["PERSP", "ORTHO", "PANO"] as const).map((ct) => (
                <button
                  key={ct}
                  type="button"
                  disabled={disabled}
                  onClick={() => setCameraType(ct)}
                  className={`rounded border px-2 py-0.5 text-[0.6rem] ${
                    cameraType === ct ? "border-accent bg-accent/15 font-bold text-accent" : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {ct}
                </button>
              ))}
            </div>
            <input
              type="range"
              min={14}
              max={135}
              step={1}
              disabled={disabled}
              aria-label="카메라 초점거리 mm"
              value={focalLengthMm}
              onChange={(e) => setFocalLengthMm(Number(e.target.value))}
              className="mt-1.5 w-full accent-accent"
            />
          </div>

          <div className="rounded border border-line bg-card p-2">
            <div className="flex items-center justify-between font-semibold">
              <span>2점 투시 수직 렌즈 시프트 (`shift_y`)</span>
              <span className="font-mono text-accent">{shiftY.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={-0.35}
              max={0.35}
              step={0.05}
              disabled={disabled}
              aria-label="렌즈 수직 시프트"
              value={shiftY}
              onChange={(e) => setShiftY(Number(e.target.value))}
              className="mt-2 w-full accent-accent"
            />
            <p className="mt-1 text-[0.6rem] text-fg-3">
              수직선 왜곡 없는 건축·웹툰 2점 투시 보정
            </p>
          </div>

          <div className="rounded border border-line bg-card p-2">
            <div className="flex items-center justify-between font-semibold">
              <span className="inline-flex items-center gap-1">
                <Aperture className="size-3 text-accent" aria-hidden />
                DOF 조리개 (`aperture_fstop`)
              </span>
              <span className="font-mono text-accent">f/{fstop.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min={1.2}
              max={16}
              step={0.2}
              disabled={disabled}
              aria-label="조리개 F-Stop"
              value={fstop}
              onChange={(e) => setFstop(Number(e.target.value))}
              className="mt-2 w-full accent-accent"
            />
            <p className="mt-1 text-[0.6rem] text-fg-3">
              착란원(CoC) {cameraEval.circleOfConfusionMm}mm · 어안 최대각 {cameraEval.fisheyeMaxAngleDeg}°
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-card p-2">
          <div className="flex flex-wrap gap-1">
            {SCENE_PRESET_THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                disabled={disabled}
                data-testid={`bg3d-blender-scene-theme-${theme.id}`}
                onClick={() => setSelectedThemeId(theme.id)}
                className={`rounded border px-2 py-1 text-[0.63rem] ${
                  selectedThemeId === theme.id
                    ? "border-accent bg-accent/15 font-bold text-accent"
                    : "border-line bg-panel text-fg-2"
                }`}
              >
                {theme.labelKo}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={disabled}
              data-testid="bg3d-blender-apply-camera-btn"
              onClick={() => {
                onStatusChange?.(cameraEval.summaryKo);
                onApplySceneCamera?.(cameraEval.cameraSettings, cameraEval.summaryKo);
              }}
              className="inline-flex items-center gap-1 rounded border border-accent bg-accent/15 px-2.5 py-1 text-[0.65rem] font-bold text-accent"
            >
              <Camera className="size-3" aria-hidden />
              <span>현재 3D 뷰포트에 카메라 설정 적용</span>
            </button>

            <button
              type="button"
              disabled={disabled}
              data-testid="bg3d-blender-insert-scene-preset-btn"
              onClick={() => {
                const msg = `배경 세트(${themeScene.labelKo}, ${themeScene.primitives.length}개 요소) 3D 장면 배치 완료`;
                onStatusChange?.(msg);
                onInsertScenePrimitives?.(themeScene.primitives, msg);
              }}
              className="inline-flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-[0.65rem] font-bold text-on-accent"
            >
              <Sparkles className="size-3" aria-hidden />
              <span>현재 3D 장면에 배경 세트 즉시 배치</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
