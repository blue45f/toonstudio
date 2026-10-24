import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";

import type { ShaperBodySliderValues } from "./studio-shaper-model";
import {
  SHAPER_WEBTOON_UNIVERSE_PROFILES,
  blendShaperWebtoonUniverseProfiles,
  type ShaperWebtoonUniverseId,
} from "./studio-shaper-webtoon-customizer";
import {
  STUDIO_VARCO3D_TURNTABLE_MULTIVIEW_METRICS,
  computeVarco3dTransparentCameraFit,
  evaluateVarco3dMultiViewFramePlan,
  solveVarco3dTwoBoneIk,
} from "./studio-varco3d-decal-ik-turntable-engine";
import {
  createStudioVarco3dViewportHudState,
  type StudioVarco3dViewportHudState,
} from "./studio-varco3d-preview-inspector";
import {
  STUDIO_VARCO3D_SKIN_WEIGHT_BRUSH_METRICS,
  auditVarco3dMeshNormalsAndWinding,
  auditVarco3dSkeletonDraft,
  buildVarco3dWeightRampGradientCss,
  computeVarco3dJfaStepSchedule,
  evaluateVarco3dBrushStrokeInfluence,
  evaluateVarco3dHeightToNormalWhiteout,
  evaluateVarco3dRigCapabilities,
  evaluateVarco3dVoxelGridPreviewState,
  evaluateVarco3dWaveRevealState,
  extractVarco3dSubmeshPart,
  packVarco3dBinaryRigPayload,
  sanitizeVarco3dDisplayBoneName,
  stepVarco3dWeightBrushSizeByKey,
  type StudioVarco3dDraftBoneNode,
  type StudioVarco3dPbrPaintChannel,
  type StudioVarco3dWeightBrushMode,
} from "./studio-varco3d-weight-paint-pbr-engine";
import { StudioVarco3dViewportHud } from "./StudioVarco3dViewportHud";
import { StudioVarco3dWorkbenchSecondaryPanels } from "./StudioVarco3dWorkbenchSecondaryPanels";

export type StudioVarco3dRigToolMode = "skeleton" | "weight" | "pose";

export type StudioVarco3dWorkbenchMode =
  | "Normal"
  | "TextureEdit"
  | "Rigging"
  | "Part"
  | "Animation"
  | "Comparer";

const WORKBENCH_MODES: ReadonlyArray<{
  readonly id: StudioVarco3dWorkbenchMode;
  readonly labelKo: string;
}> = Object.freeze([
  { id: "Normal", labelKo: "일반 / 셰이퍼 (Normal)" },
  { id: "TextureEdit", labelKo: "PBR 브러시 (TextureEdit)" },
  { id: "Rigging", labelKo: "리깅 / 웨이트 (Rigging)" },
  { id: "Part", labelKo: "서브메시 분리 (Part)" },
  { id: "Animation", labelKo: "모션 / IK (Animation)" },
  { id: "Comparer", labelKo: "멀티뷰 비교 (Comparer)" },
]);

export interface StudioVarco3dInspectorWorkbenchProps {
  readonly initialHudState?: Partial<StudioVarco3dViewportHudState>;
  readonly initialWorkbenchMode?: StudioVarco3dWorkbenchMode;
  readonly initialUniverseId?: ShaperWebtoonUniverseId;
  readonly onApplyMannequinBodySliders?: (sliders: ShaperBodySliderValues) => void;
  readonly onHudStateChange?: (state: StudioVarco3dViewportHudState) => void;
  readonly className?: string;
}

const DEFAULT_RIG_BONES: readonly StudioVarco3dDraftBoneNode[] = Object.freeze([
  { name: "mixamorig:Hips", parentName: null, position: { x: 0, y: 1.0, z: 0 } },
  { name: "mixamorig:Spine", parentName: "mixamorig:Hips", position: { x: 0, y: 1.2, z: 0 } },
  { name: "mixamorig:Chest", parentName: "mixamorig:Spine", position: { x: 0, y: 1.4, z: 0 } },
  { name: "mixamorig:Neck", parentName: "mixamorig:Chest", position: { x: 0, y: 1.55, z: 0 } },
  { name: "mixamorig:Head", parentName: "mixamorig:Neck", position: { x: 0, y: 1.7, z: 0 } },
  { name: "mixamorig:LeftUpperArm", parentName: "mixamorig:Chest", position: { x: -0.2, y: 1.45, z: 0 } },
  { name: "mixamorig:LeftForeArm", parentName: "mixamorig:LeftUpperArm", position: { x: -0.45, y: 1.45, z: 0 } },
  { name: "mixamorig:LeftHand", parentName: "mixamorig:LeftForeArm", position: { x: -0.68, y: 1.45, z: 0 } },
  { name: "HandLoRA_LeftThumb1", parentName: "mixamorig:LeftHand", position: { x: -0.72, y: 1.43, z: 0.03 } },
]);

const PBR_PAINT_CHANNELS: ReadonlyArray<{
  readonly id: StudioVarco3dPbrPaintChannel;
  readonly labelKo: string;
}> = Object.freeze([
  { id: "baseColor", labelKo: "베이스 컬러" },
  { id: "normal", labelKo: "노멀" },
  { id: "roughness", labelKo: "러프니스" },
  { id: "metalness", labelKo: "메탈릭" },
  { id: "bump", labelKo: "높이 범프" },
  { id: "flatten", labelKo: "평탄화" },
  { id: "restore", labelKo: "원본 복원" },
  { id: "smudge", labelKo: "스머지" },
]);

function createRangeTrackStyle(min: number, max: number, extra?: CSSProperties): CSSProperties {
  return {
    "--attr-min": String(min),
    "--attr-max": String(max),
    ...extra,
  } as CSSProperties;
}

export function StudioVarco3dInspectorWorkbench({
  initialHudState,
  initialWorkbenchMode = "Normal",
  initialUniverseId = "school-romance",
  onApplyMannequinBodySliders,
  onHudStateChange,
  className = "",
}: StudioVarco3dInspectorWorkbenchProps): ReactElement {
  const baseId = useId();
  const [hudState, setHudState] = useState<StudioVarco3dViewportHudState>(() =>
    createStudioVarco3dViewportHudState(initialHudState),
  );
  const [workbenchMode, setWorkbenchMode] =
    useState<StudioVarco3dWorkbenchMode>(initialWorkbenchMode);

  const [primaryUniverseId, setPrimaryUniverseId] =
    useState<ShaperWebtoonUniverseId>(initialUniverseId);
  const [secondaryUniverseId, setSecondaryUniverseId] =
    useState<ShaperWebtoonUniverseId>("romance-fantasy-noble");
  const [universeBlendRatio, setUniverseBlendRatio] = useState<number>(0);
  const [shaderElapsedMs, setShaderElapsedMs] = useState<number>(1100);

  const [paintChannel, setPaintChannel] = useState<StudioVarco3dPbrPaintChannel>("baseColor");
  const [brushHardness, setBrushHardness] = useState<number>(0.75);
  const [brushStrength, setBrushStrength] = useState<number>(0.65);
  const [decalOpacity, setDecalOpacity] = useState<number>(0.9);

  const [rigTool, setRigTool] = useState<StudioVarco3dRigToolMode>("weight");
  const [rigBones, setRigBones] = useState<readonly StudioVarco3dDraftBoneNode[]>(DEFAULT_RIG_BONES);
  const [selectedBoneName, setSelectedBoneName] = useState<string>("mixamorig:LeftForeArm");
  const [renameDraft, setRenameDraft] = useState<string>("LeftForeArm");
  const [weightBrushMode, setWeightBrushMode] = useState<StudioVarco3dWeightBrushMode>("add");
  const [weightBrushSizePx, setWeightBrushSizePx] = useState<number>(
    STUDIO_VARCO3D_SKIN_WEIGHT_BRUSH_METRICS.brushDefaultSizePx,
  );
  const [weightBrushStrength, setWeightBrushStrength] = useState<number>(
    STUDIO_VARCO3D_SKIN_WEIGHT_BRUSH_METRICS.brushDefaultStrength,
  );
  const [weightBrushTarget, setWeightBrushTarget] = useState<number>(
    STUDIO_VARCO3D_SKIN_WEIGHT_BRUSH_METRICS.brushDefaultTargetWeight,
  );

  const [selectedPartFaceCount, setSelectedPartFaceCount] = useState<number>(1);
  const [selectedClipId, setSelectedClipId] = useState<string>("idle_breath");
  const [isInPlaceAnimation, setIsInPlaceAnimation] = useState<boolean>(true);
  const [ikTargetY, setIkTargetY] = useState<number>(1.25);
  const [cameraSyncEnabled, setCameraSyncEnabled] = useState<boolean>(true);
  const [comparerSplitPercent, setComparerSplitPercent] = useState<number>(50);

  const handleHudStateChange = useCallback(
    (next: StudioVarco3dViewportHudState) => {
      setHudState(next);
      onHudStateChange?.(next);
    },
    [onHudStateChange],
  );

  useEffect(() => {
    if (workbenchMode !== "Rigging") {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const target = event.target as Element | null;
      if (target?.matches?.("input, select, textarea, [contenteditable='true']")) {
        return;
      }
      if (event.key === "[" || event.key === "]") {
        event.preventDefault();
        setWeightBrushSizePx((prev) => stepVarco3dWeightBrushSizeByKey(prev, event.key));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [workbenchMode]);

  const blendedShaper = useMemo(
    () =>
      blendShaperWebtoonUniverseProfiles(
        primaryUniverseId,
        secondaryUniverseId,
        universeBlendRatio,
      ),
    [primaryUniverseId, secondaryUniverseId, universeBlendRatio],
  );

  const turntableFit = useMemo(
    () =>
      computeVarco3dTransparentCameraFit({
        modelSize: {
          x: 0.9,
          y: blendedShaper.sliders.bodyProportion.heightCm / 100,
          z: 0.7,
        },
        aspect: 960 / 720,
      }),
    [blendedShaper.sliders.bodyProportion.heightCm],
  );

  const waveRevealState = useMemo(
    () => evaluateVarco3dWaveRevealState({ elapsedMs: shaderElapsedMs }),
    [shaderElapsedMs],
  );

  const voxelPreviewState = useMemo(
    () => evaluateVarco3dVoxelGridPreviewState({ elapsedMs: shaderElapsedMs }),
    [shaderElapsedMs],
  );

  const jfaSchedule = useMemo(() => computeVarco3dJfaStepSchedule(2048, 2048), []);

  const whiteoutPreview = useMemo(
    () =>
      evaluateVarco3dHeightToNormalWhiteout({
        heightLeft: 0.25,
        heightRight: 0.25 + brushStrength * 0.5,
        heightDown: 0.4,
        heightUp: 0.6,
        texelX: 1 / 2048,
        texelY: 1 / 2048,
      }),
    [brushStrength],
  );

  const brushInfluencePreview = useMemo(
    () =>
      evaluateVarco3dBrushStrokeInfluence({
        sampleWorldPos: { x: 0.05, y: 0, z: 0 },
        sampleWorldNormal: { x: 0, y: 0, z: 1 },
        brushCenterWorld: { x: 0, y: 0, z: 0 },
        brushViewDirWorld: { x: 0, y: 0, z: -1 },
        brushRadiusWorld: 0.25,
        hardness: brushHardness,
        strength: brushStrength,
        restoreBoost: paintChannel === "restore" ? 1 : 0,
      }),
    [brushHardness, brushStrength, paintChannel],
  );

  const skeletonAudit = useMemo(() => auditVarco3dSkeletonDraft(rigBones), [rigBones]);

  const binaryRigByteLength = useMemo(() => {
    const joints = rigBones.map((bone, idx) => ({
      name: bone.name,
      parent: idx === 0 ? null : 0,
      translation: [bone.position.x, bone.position.y, bone.position.z] as const,
      rotation: [0, 0, 0, 1] as const,
      scale: [1, 1, 1] as const,
    }));
    const invBind = new Float32Array(joints.length * 16);
    for (let i = 0; i < joints.length; i += 1) {
      invBind[i * 16] = 1;
      invBind[i * 16 + 5] = 1;
      invBind[i * 16 + 10] = 1;
      invBind[i * 16 + 15] = 1;
    }
    const payload = packVarco3dBinaryRigPayload({
      joints,
      inverseBindMatricesRowMajor: invBind,
      surfaces: [
        {
          surfaceId: "character_body",
          vertexCount: 4,
          joints: new Uint16Array(16),
          weights: new Float32Array([
            1, 0, 0, 0,
            1, 0, 0, 0,
            1, 0, 0, 0,
            1, 0, 0, 0,
          ]),
        },
      ],
    });
    return payload.byteLength;
  }, [rigBones]);

  const partExtractionPreview = useMemo(() => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]);
    const indices = new Uint32Array([0, 1, 2, 2, 1, 3]);
    const selectedFaces = selectedPartFaceCount >= 2 ? [0, 1] : [0];
    const part = extractVarco3dSubmeshPart({
      positions,
      indices,
      selectedFaceIndices: selectedFaces,
    });
    const normalAudit = auditVarco3dMeshNormalsAndWinding({ positions, indices });
    return { part, normalAudit };
  }, [selectedPartFaceCount]);

  const ikSolution = useMemo(
    () =>
      solveVarco3dTwoBoneIk({
        rootPos: { x: -0.2, y: 1.45, z: 0 },
        midPos: { x: -0.45, y: 1.4, z: -0.05 },
        endPos: { x: -0.68, y: 1.45, z: 0 },
        targetPos: { x: -0.52, y: ikTargetY, z: 0.12 },
      }),
    [ikTargetY],
  );

  const rigCapabilityStatus = useMemo(
    () =>
      evaluateVarco3dRigCapabilities({
        type: "AI_RIG",
        status: "COMPLETED",
        humanoidClass: "HUMANOID",
        retargetProfileMatched: true,
      }),
    [],
  );

  const multiViewPlan = useMemo(
    () =>
      evaluateVarco3dMultiViewFramePlan({
        entries: [
          {
            id: "left-primary",
            visible: true,
            released: false,
            lastInvisibleMs: 0,
            cssWidth: 480,
            cssHeight: 640,
          },
          {
            id: "right-compare",
            visible: true,
            released: false,
            lastInvisibleMs: 0,
            cssWidth: 480,
            cssHeight: 640,
          },
        ],
        nowMs: 1000,
        lastLazyCheckMs: 0,
        currentWebglCssWidth: 960,
        currentWebglCssHeight: 640,
      }),
    [],
  );

  const weightRampGradientCss = useMemo(() => buildVarco3dWeightRampGradientCss(), []);

  const handleRenameSelectedBone = useCallback(() => {
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      return;
    }
    const prefixMatch = selectedBoneName.match(/^(?:mixamorig\d*[:_]?|HandLoRA_)/i);
    const prefix = prefixMatch ? prefixMatch[0] : "";
    const nextFullName = `${prefix}${trimmed}`;
    setRigBones((prev) =>
      prev.map((bone) => {
        if (bone.name === selectedBoneName) {
          return { ...bone, name: nextFullName };
        }
        if (bone.parentName === selectedBoneName) {
          return { ...bone, parentName: nextFullName };
        }
        return bone;
      }),
    );
    setSelectedBoneName(nextFullName);
  }, [renameDraft, selectedBoneName]);

  const handleAddChildBone = useCallback(() => {
    const parent = rigBones.find((b) => b.name === selectedBoneName) ?? rigBones[0];
    if (!parent) {
      return;
    }
    const newBoneName = `mixamorig:CustomBone_${rigBones.length + 1}`;
    const nextNode: StudioVarco3dDraftBoneNode = {
      name: newBoneName,
      parentName: parent.name,
      position: {
        x: parent.position.x,
        y: parent.position.y + 0.12,
        z: parent.position.z,
      },
    };
    setRigBones((prev) => [...prev, nextNode]);
    setSelectedBoneName(newBoneName);
    setRenameDraft(sanitizeVarco3dDisplayBoneName(newBoneName));
  }, [rigBones, selectedBoneName]);

  return (
    <section
      aria-label="VARCO 3D 스튜디오 인스펙터 워크벤치"
      data-testid="studio-varco3d-inspector-workbench"
      data-active-studio-mode={workbenchMode}
      className={`flex flex-col gap-3 rounded-2xl border border-line bg-card p-3 text-fg shadow-sm ${className}`}
    >
      <StudioVarco3dViewportHud state={hudState} onChange={handleHudStateChange} />

      <div
        role="group"
        aria-label="VARCO 3D 스튜디오 6-모드 스위처"
        className="flex flex-wrap items-center gap-1 rounded-xl border border-line/70 bg-panel p-1.5"
      >
        {WORKBENCH_MODES.map((mode) => {
          const active = workbenchMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              data-testid={`varco3d-studio-mode-${mode.id}`}
              aria-pressed={active}
              onClick={() => setWorkbenchMode(mode.id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                active
                  ? "bg-accent text-canvas"
                  : "bg-card text-fg-2 hover:bg-raised hover:text-fg"
              }`}
            >
              {mode.labelKo}
            </button>
          );
        })}
      </div>

      {workbenchMode === "Normal" ? (
        <div
          data-testid="varco3d-workbench-panel-normal"
          className="grid grid-cols-1 gap-3 rounded-xl border border-line/70 bg-panel/60 p-3 md:grid-cols-2"
        >
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-fg">
              웹툰 세계관 3D 셰이퍼 (25축 연속 커스터마이징)
            </h3>
            <label
              htmlFor={`${baseId}-primary-universe`}
              className="flex flex-col gap-1 text-[0.72rem] text-fg-2"
            >
              <span>주 세계관 아키타입</span>
              <select
                id={`${baseId}-primary-universe`}
                data-testid="varco3d-primary-universe-select"
                value={primaryUniverseId}
                onChange={(e) => setPrimaryUniverseId(e.target.value as ShaperWebtoonUniverseId)}
                className="rounded-lg border border-line bg-card px-2 py-1.5 text-xs text-fg"
              >
                {SHAPER_WEBTOON_UNIVERSE_PROFILES.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.labelKo} ({profile.genreTagKo})
                  </option>
                ))}
              </select>
            </label>

            <label
              htmlFor={`${baseId}-secondary-universe`}
              className="flex flex-col gap-1 text-[0.72rem] text-fg-2"
            >
              <span>블렌드 대상 세계관</span>
              <select
                id={`${baseId}-secondary-universe`}
                data-testid="varco3d-secondary-universe-select"
                value={secondaryUniverseId}
                onChange={(e) =>
                  setSecondaryUniverseId(e.target.value as ShaperWebtoonUniverseId)
                }
                className="rounded-lg border border-line bg-card px-2 py-1.5 text-xs text-fg"
              >
                {SHAPER_WEBTOON_UNIVERSE_PROFILES.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.labelKo} ({profile.genreTagKo})
                  </option>
                ))}
              </select>
            </label>

            <label
              htmlFor={`${baseId}-universe-blend-range`}
              className="flex flex-col gap-1 text-[0.72rem] text-fg-2"
            >
              <span>세계관 블렌드 비율: {Math.round(universeBlendRatio * 100)}%</span>
              <input
                id={`${baseId}-universe-blend-range`}
                data-testid="varco3d-universe-blend-slider"
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(universeBlendRatio * 100)}
                style={createRangeTrackStyle(0, 100)}
                onChange={(e) => setUniverseBlendRatio(Number(e.target.value) / 100)}
              />
            </label>

            {onApplyMannequinBodySliders ? (
              <button
                type="button"
                data-testid="varco3d-apply-shaper-to-mannequin"
                onClick={() => onApplyMannequinBodySliders(blendedShaper.mannequinBodySliders)}
                className="mt-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-canvas transition-opacity hover:opacity-90"
              >
                인형 체형에 세계관 비율 즉시 적용
              </button>
            ) : null}
          </div>

          <div className="flex flex-col justify-between gap-2 rounded-lg border border-line/60 bg-card p-2.5 text-[0.72rem] text-fg-2">
            <div>
              <div className="font-semibold text-fg">실시간 셰이퍼 & 턴테이블 메트릭</div>
              <p className="mt-1">
                등신비: <strong>{blendedShaper.sliders.bodyProportion.headCount.toFixed(1)}등신</strong>{" "}
                · 신장: <strong>{Math.round(blendedShaper.sliders.bodyProportion.heightCm)}cm</strong>{" "}
                · 외곽선: <strong>{blendedShaper.sliders.celShader.outlineWidthMm.toFixed(1)}mm</strong>
              </p>
              <p>
                투명 턴테이블 Fit 거리: <strong>{turntableFit.fitDistance.toFixed(2)}m</strong> (FOV{" "}
                {STUDIO_VARCO3D_TURNTABLE_MULTIVIEW_METRICS.transparentCameraFovDeg}°)
              </p>
              <p>
                홀로그램 WaveReveal 진행률:{" "}
                <strong>{Math.round(waveRevealState.progress * 100)}%</strong> · 복셀 스윕:{" "}
                <strong>{voxelPreviewState.sweep.toFixed(2)}</strong>
              </p>
            </div>

            <label
              htmlFor={`${baseId}-shader-elapsed`}
              className="flex flex-col gap-1 text-[0.7rem] text-fg-3"
            >
              <span>생성/리빌 셰이더 타임라인 ({shaderElapsedMs}ms)</span>
              <input
                id={`${baseId}-shader-elapsed`}
                data-testid="varco3d-shader-elapsed-slider"
                type="range"
                min={0}
                max={2200}
                step={100}
                value={shaderElapsedMs}
                style={createRangeTrackStyle(0, 2200)}
                onChange={(e) => setShaderElapsedMs(Number(e.target.value))}
              />
            </label>
          </div>
        </div>
      ) : null}

      {workbenchMode === "TextureEdit" ? (
        <div
          data-testid="varco3d-workbench-panel-texture-edit"
          className="grid grid-cols-1 gap-3 rounded-xl border border-line/70 bg-panel/60 p-3 md:grid-cols-2"
        >
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-fg">
              GPU 3D PBR 브러시 & JFA+1 UV 심 패딩
            </h3>
            <div role="group" aria-label="PBR 페인트 채널 선택" className="flex flex-wrap gap-1">
              {PBR_PAINT_CHANNELS.map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  data-testid={`varco3d-pbr-channel-${channel.id}`}
                  aria-pressed={paintChannel === channel.id}
                  onClick={() => setPaintChannel(channel.id)}
                  className={`rounded-lg border px-2 py-1 text-[0.7rem] font-medium transition-colors ${
                    paintChannel === channel.id
                      ? "border-accent bg-accent-soft text-fg"
                      : "border-line bg-card text-fg-2 hover:text-fg"
                  }`}
                >
                  {channel.labelKo}
                </button>
              ))}
            </div>

            <label
              htmlFor={`${baseId}-brush-hardness`}
              className="flex flex-col gap-1 text-[0.72rem] text-fg-2"
            >
              <span>브러시 경도 (Hardness): {Math.round(brushHardness * 100)}%</span>
              <input
                id={`${baseId}-brush-hardness`}
                data-testid="varco3d-brush-hardness-slider"
                type="range"
                min={0}
                max={99}
                step={1}
                value={Math.round(brushHardness * 100)}
                style={createRangeTrackStyle(0, 99)}
                onChange={(e) => setBrushHardness(Number(e.target.value) / 100)}
              />
            </label>

            <label
              htmlFor={`${baseId}-brush-strength`}
              className="flex flex-col gap-1 text-[0.72rem] text-fg-2"
            >
              <span>브러시 강도 (Strength): {Math.round(brushStrength * 100)}%</span>
              <input
                id={`${baseId}-brush-strength`}
                data-testid="varco3d-brush-strength-slider"
                type="range"
                min={1}
                max={100}
                step={1}
                value={Math.round(brushStrength * 100)}
                style={createRangeTrackStyle(1, 100)}
                onChange={(e) => setBrushStrength(Number(e.target.value) / 100)}
              />
            </label>
          </div>

          <div className="flex flex-col justify-between gap-2 rounded-lg border border-line/60 bg-card p-2.5 text-[0.72rem] text-fg-2">
            <div>
              <div className="font-semibold text-fg">
                지오데식 ExpMap 데칼 & Whiteout 노멀 합성
              </div>
              <p className="mt-1">
                활성 채널: <strong data-testid="varco3d-active-pbr-channel">{paintChannel}</strong>{" "}
                · 스트로크 영향도:{" "}
                <strong>{(brushInfluencePreview.effectiveInfluence * 100).toFixed(1)}%</strong>
              </p>
              <p>
                스머지 5-Tap 당김 반경:{" "}
                <strong>{brushInfluencePreview.smudgePullPx.toFixed(1)}px</strong> · Whiteout Z:{" "}
                <strong>{whiteoutPreview.blendedNormal.z.toFixed(3)}</strong>
              </p>
              <p>
                2048px JFA+1 패딩 스텝 ({jfaSchedule.length}패스):{" "}
                <code className="text-[0.66rem]">{jfaSchedule.slice(0, 5).join(" → ")} … 1</code>
              </p>
            </div>

            <label
              htmlFor={`${baseId}-decal-opacity`}
              className="flex flex-col gap-1 text-[0.7rem] text-fg-3"
            >
              <span>지오데식 데칼 불투명도: {Math.round(decalOpacity * 100)}%</span>
              <input
                id={`${baseId}-decal-opacity`}
                data-testid="varco3d-decal-opacity-slider"
                type="range"
                min={5}
                max={100}
                step={5}
                value={Math.round(decalOpacity * 100)}
                style={createRangeTrackStyle(5, 100)}
                onChange={(e) => setDecalOpacity(Number(e.target.value) / 100)}
              />
            </label>
          </div>
        </div>
      ) : null}

      <StudioVarco3dWorkbenchSecondaryPanels
        baseId={baseId}
        studioMode={workbenchMode}
        rigTool={rigTool}
        onRigToolChange={setRigTool}
        rigBones={rigBones}
        selectedBoneName={selectedBoneName}
        onSelectBone={(boneName, cleanName) => {
          setSelectedBoneName(boneName);
          setRenameDraft(cleanName);
        }}
        renameDraft={renameDraft}
        onRenameDraftChange={setRenameDraft}
        onRenameSelectedBone={handleRenameSelectedBone}
        onAddChildBone={handleAddChildBone}
        binaryRigByteLength={binaryRigByteLength}
        skeletonAudit={skeletonAudit}
        weightBrushMode={weightBrushMode}
        onWeightBrushModeChange={setWeightBrushMode}
        weightBrushSizePx={weightBrushSizePx}
        onWeightBrushSizePxChange={setWeightBrushSizePx}
        weightBrushStrength={weightBrushStrength}
        onWeightBrushStrengthChange={setWeightBrushStrength}
        weightBrushTarget={weightBrushTarget}
        onWeightBrushTargetChange={setWeightBrushTarget}
        weightRampGradientCss={weightRampGradientCss}
        selectedPartFaceCount={selectedPartFaceCount}
        onTogglePartFaceCount={() => setSelectedPartFaceCount((prev) => (prev === 1 ? 2 : 1))}
        partExtractionPreview={partExtractionPreview}
        canEditRig={rigCapabilityStatus.canEditRig}
        selectedClipId={selectedClipId}
        onSelectClipId={setSelectedClipId}
        isInPlaceAnimation={isInPlaceAnimation}
        onInPlaceAnimationChange={setIsInPlaceAnimation}
        ikTargetY={ikTargetY}
        onIkTargetYChange={setIkTargetY}
        ikSolution={ikSolution}
        cameraSyncEnabled={cameraSyncEnabled}
        onCameraSyncEnabledChange={setCameraSyncEnabled}
        comparerSplitPercent={comparerSplitPercent}
        onComparerSplitPercentChange={setComparerSplitPercent}
        multiViewPlan={multiViewPlan}
      />
    </section>
  );
}
