import { useState, type CSSProperties, type ReactElement } from "react";

import type {
  StudioVarco3dTwoBoneIkResult,
  evaluateVarco3dMultiViewFramePlan,
} from "./studio-varco3d-decal-ik-turntable-engine";
import {
  STUDIO_VARCO3D_DCC_BRIDGE_PORTS,
  STUDIO_VARCO3D_REMESH_UNWRAP_METRICS,
  STUDIO_VARCO3D_SLICER_SPECS,
  buildVarco3dSlicerDeepLinkUrl,
  buildVarco3dUnitOctahedralBoneGeometry,
  computeVarco3dDagEdgeBezierGeometry,
  evaluateVarco3dAiUnwrapPlan,
  evaluateVarco3dRemeshConfig,
  resolveVarco3dPivotToBottom,
  scheduleVarco3dDagTopologicalWave,
  selectVarco3dBestTrackingBone,
  type StudioVarco3dAssetOutputType,
  type StudioVarco3dSlicerName,
} from "./studio-varco3d-map-adjust-bridge-dag-engine";
import {
  STUDIO_VARCO3D_SKIN_WEIGHT_BRUSH_METRICS,
  detectVarco3dMultiviewPosition,
  sanitizeVarco3dDisplayBoneName,
  type StudioVarco3dDraftBoneNode,
  type StudioVarco3dMeshNormalAuditReport,
  type StudioVarco3dSkeletonAuditReport,
  type StudioVarco3dSubmeshExtractionResult,
  type StudioVarco3dWeightBrushMode,
} from "./studio-varco3d-weight-paint-pbr-engine";
import type {
  StudioVarco3dRigToolMode,
  StudioVarco3dWorkbenchMode,
} from "./StudioVarco3dInspectorWorkbench";

const WEIGHT_BRUSH_MODES: ReadonlyArray<{
  readonly id: StudioVarco3dWeightBrushMode;
  readonly labelKo: string;
}> = Object.freeze([
  { id: "add", labelKo: "더하기 (Add)" },
  { id: "subtract", labelKo: "빼기 (Sub)" },
  { id: "smooth", labelKo: "스무스 (Smooth)" },
  { id: "set", labelKo: "고정값 (Set)" },
]);

const ANIMATION_CLIPS = Object.freeze([
  { id: "idle_breath", labelKo: "기본 호흡 (Idle Breath)", family: "locomotion" },
  { id: "webtoon_run", labelKo: "질주 액션 (Sprint)", family: "action" },
  { id: "sword_slash", labelKo: "검술 베기 (Sword Slash)", family: "combat" },
  { id: "dramatic_turn", labelKo: "드라마틱 뒤돌아보기", family: "drama" },
]);

const MULTIVIEW_SAMPLE_FILES = Object.freeze([
  "hero_front_ortho.png",
  "hero_left_side.png",
  "hero_right_side.png",
  "hero_back_cape.png",
]);

const OCTAHEDRAL_BONE_METRICS = buildVarco3dUnitOctahedralBoneGeometry(1);

const DEFAULT_TRACKING_CANDIDATES = Object.freeze([
  { boneName: "mixamorig:Hips", hierarchyDepth: 1, values: [0, 1, 0, 0, 1, 1.4, 0, 1, 2.8] },
  { boneName: "mixamorig:Spine", hierarchyDepth: 2, values: [0, 1.2, 0, 0, 1.2, 2.5] },
  { boneName: "mixamorig:Head", hierarchyDepth: 4, values: [0, 1.7, 0, 0, 1.7, 4.0] },
]);

const DAG_SAMPLE_NODES = Object.freeze([
  { id: "concept_img", x: 12, y: 18, width: 108, height: 44 },
  { id: "varco_mesh", x: 164, y: 18, width: 108, height: 44 },
  { id: "auto_rig", x: 316, y: 18, width: 108, height: 44 },
]);

const DAG_SAMPLE_EDGES = Object.freeze([
  { from: "concept_img", to: "varco_mesh" },
  { from: "varco_mesh", to: "auto_rig" },
]);

function createRangeTrackStyle(min: number, max: number, extra?: CSSProperties): CSSProperties {
  return {
    "--attr-min": String(min),
    "--attr-max": String(max),
    ...extra,
  } as CSSProperties;
}

export interface StudioVarco3dWorkbenchSecondaryPanelsProps {
  readonly baseId: string;
  readonly studioMode: StudioVarco3dWorkbenchMode;
  readonly rigTool: StudioVarco3dRigToolMode;
  readonly onRigToolChange: (mode: StudioVarco3dRigToolMode) => void;
  readonly rigBones: readonly StudioVarco3dDraftBoneNode[];
  readonly selectedBoneName: string;
  readonly onSelectBone: (boneName: string, cleanName: string) => void;
  readonly renameDraft: string;
  readonly onRenameDraftChange: (value: string) => void;
  readonly onRenameSelectedBone: () => void;
  readonly onAddChildBone: () => void;
  readonly binaryRigByteLength: number;
  readonly skeletonAudit: StudioVarco3dSkeletonAuditReport;
  readonly weightBrushMode: StudioVarco3dWeightBrushMode;
  readonly onWeightBrushModeChange: (mode: StudioVarco3dWeightBrushMode) => void;
  readonly weightBrushSizePx: number;
  readonly onWeightBrushSizePxChange: (sizePx: number) => void;
  readonly weightBrushStrength: number;
  readonly onWeightBrushStrengthChange: (strength: number) => void;
  readonly weightBrushTarget: number;
  readonly onWeightBrushTargetChange: (target: number) => void;
  readonly weightRampGradientCss: string;
  readonly selectedPartFaceCount: number;
  readonly onTogglePartFaceCount: () => void;
  readonly partExtractionPreview: {
    readonly part: StudioVarco3dSubmeshExtractionResult;
    readonly normalAudit: StudioVarco3dMeshNormalAuditReport;
  };
  readonly canEditRig: boolean;
  readonly selectedClipId: string;
  readonly onSelectClipId: (clipId: string) => void;
  readonly isInPlaceAnimation: boolean;
  readonly onInPlaceAnimationChange: (inPlace: boolean) => void;
  readonly ikTargetY: number;
  readonly onIkTargetYChange: (targetY: number) => void;
  readonly ikSolution: StudioVarco3dTwoBoneIkResult;
  readonly cameraSyncEnabled: boolean;
  readonly onCameraSyncEnabledChange: (enabled: boolean) => void;
  readonly comparerSplitPercent: number;
  readonly onComparerSplitPercentChange: (percent: number) => void;
  readonly multiViewPlan: ReturnType<typeof evaluateVarco3dMultiViewFramePlan>;
}

export function StudioVarco3dWorkbenchSecondaryPanels(
  props: StudioVarco3dWorkbenchSecondaryPanelsProps,
): ReactElement {
  const { baseId, studioMode } = props;
  const accordionGroupName = `${baseId}-pipeline-accordion`;

  const [remeshPolygonCount, setRemeshPolygonCount] = useState<number>(50_000);
  const [remeshTopology, setRemeshTopology] = useState<"tri" | "quad">("quad");
  const [unwrapInputFaces, setUnwrapInputFaces] = useState<number>(75_000);
  const [outputType, setOutputType] = useState<StudioVarco3dAssetOutputType>("rigged-mesh");
  const [selectedSlicer, setSelectedSlicer] = useState<StudioVarco3dSlicerName>("Bambu Studio");

  const remeshEval = evaluateVarco3dRemeshConfig({
    requestedPolygonCount: remeshPolygonCount,
    topology: remeshTopology,
    customMode: false,
  });
  const unwrapPlan = evaluateVarco3dAiUnwrapPlan(unwrapInputFaces);
  const pivotToBottom = resolveVarco3dPivotToBottom(outputType);
  const trackingBone = selectVarco3dBestTrackingBone(DEFAULT_TRACKING_CANDIDATES);
  const dagSchedule = scheduleVarco3dDagTopologicalWave({
    nodes: DAG_SAMPLE_NODES,
    edges: DAG_SAMPLE_EDGES,
    startTimestampMs: 0,
  });
  const firstEdgeGeom = computeVarco3dDagEdgeBezierGeometry(
    DAG_SAMPLE_NODES[0],
    DAG_SAMPLE_NODES[1],
  );
  const slicerDeepLink = buildVarco3dSlicerDeepLinkUrl(
    selectedSlicer,
    "https://3d.varco.ai/assets/character_shaper.3mf",
    true,
  );

  return (
    <div className="flex flex-col gap-3">
      {studioMode === "Rigging" ? (
        <div
          data-testid="varco3d-workbench-panel-rigging"
          className="grid grid-cols-1 gap-3 rounded-xl border border-line/70 bg-panel/60 p-3 md:grid-cols-2"
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-fg">
                스켈레톤 본 트리 ({props.rigBones.length}개 · 바이너리 {props.binaryRigByteLength}B ·
                옥타헤드럴 {OCTAHEDRAL_BONE_METRICS.positions.length / 3}정점/
                {OCTAHEDRAL_BONE_METRICS.triangleIndices.length / 3}면)
              </h3>
              <div role="group" aria-label="리깅 편집 도구" className="flex gap-1">
                {(["skeleton", "weight", "pose"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    data-testid={`varco3d-rig-tool-${mode}`}
                    aria-pressed={props.rigTool === mode}
                    onClick={() => props.onRigToolChange(mode)}
                    className={`rounded-md border px-2 py-0.5 text-[0.68rem] font-medium ${
                      props.rigTool === mode
                        ? "border-accent bg-accent-soft text-fg"
                        : "border-line bg-card text-fg-2"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div
              role="listbox"
              aria-label="리깅 본 목록"
              className="max-h-36 overflow-y-auto rounded-lg border border-line/60 bg-card p-1.5"
            >
              {props.rigBones.map((bone) => {
                const cleanName = sanitizeVarco3dDisplayBoneName(bone.name);
                const selected = bone.name === props.selectedBoneName;
                return (
                  <button
                    key={bone.name}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-testid={`varco3d-bone-item-${cleanName}`}
                    onClick={() => props.onSelectBone(bone.name, cleanName)}
                    className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-[0.72rem] ${
                      selected
                        ? "bg-accent-soft font-semibold text-fg"
                        : "text-fg-2 hover:bg-raised"
                    }`}
                  >
                    <span>{cleanName}</span>
                    <span className="text-[0.64rem] text-fg-3">
                      {bone.parentName ? sanitizeVarco3dDisplayBoneName(bone.parentName) : "ROOT"}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type="text"
                aria-label="선택된 본 이름 변경"
                data-testid="varco3d-bone-rename-input"
                value={props.renameDraft}
                onChange={(e) => props.onRenameDraftChange(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2 py-1 text-xs text-fg"
              />
              <button
                type="button"
                data-testid="varco3d-bone-rename-submit"
                onClick={props.onRenameSelectedBone}
                className="rounded-lg border border-line bg-card px-2.5 py-1 text-xs font-medium text-fg hover:border-accent"
              >
                이름 변경
              </button>
              <button
                type="button"
                data-testid="varco3d-bone-add-child"
                onClick={props.onAddChildBone}
                className="rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-canvas"
              >
                + 자식 본
              </button>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-2 rounded-lg border border-line/60 bg-card p-2.5 text-[0.72rem] text-fg-2">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-fg">
                  스킨 웨이트 브러시 ([ / ] 단축키 지원)
                </span>
                <span
                  data-testid="varco3d-weight-brush-size-readout"
                  className="rounded bg-panel px-1.5 py-0.5 text-[0.68rem] font-semibold text-fg"
                >
                  {props.weightBrushSizePx}px
                </span>
              </div>

              <div
                role="group"
                aria-label="스킨 웨이트 브러시 모드"
                className="grid grid-cols-4 gap-1"
              >
                {WEIGHT_BRUSH_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    data-testid={`varco3d-weight-mode-${m.id}`}
                    aria-pressed={props.weightBrushMode === m.id}
                    onClick={() => props.onWeightBrushModeChange(m.id)}
                    className={`rounded border px-1.5 py-1 text-[0.68rem] font-medium ${
                      props.weightBrushMode === m.id
                        ? "border-accent bg-accent-soft text-fg"
                        : "border-line bg-card text-fg-2"
                    }`}
                  >
                    {m.labelKo}
                  </button>
                ))}
              </div>

              <label
                htmlFor={`${baseId}-weight-size`}
                className="flex flex-col gap-1 text-[0.7rem]"
              >
                <span>브러시 크기 ({props.weightBrushSizePx}px · [ / ] 로 ±2px 조절)</span>
                <input
                  id={`${baseId}-weight-size`}
                  data-testid="varco3d-weight-size-slider"
                  type="range"
                  min={STUDIO_VARCO3D_SKIN_WEIGHT_BRUSH_METRICS.brushMinSizePx}
                  max={STUDIO_VARCO3D_SKIN_WEIGHT_BRUSH_METRICS.brushMaxSizePx}
                  step={1}
                  value={props.weightBrushSizePx}
                  style={createRangeTrackStyle(1, 100)}
                  onChange={(e) => props.onWeightBrushSizePxChange(Number(e.target.value))}
                />
              </label>

              <label
                htmlFor={`${baseId}-weight-strength`}
                className="flex flex-col gap-1 text-[0.7rem]"
              >
                <span>브러시 강도 ({Math.round(props.weightBrushStrength * 100)}%)</span>
                <input
                  id={`${baseId}-weight-strength`}
                  data-testid="varco3d-weight-strength-slider"
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  value={Math.round(props.weightBrushStrength * 100)}
                  style={createRangeTrackStyle(5, 100)}
                  onChange={(e) => props.onWeightBrushStrengthChange(Number(e.target.value) / 100)}
                />
              </label>

              <label
                htmlFor={`${baseId}-weight-target`}
                className="flex flex-col gap-1 text-[0.7rem]"
              >
                <span>목표 웨이트 히트맵 ({Math.round(props.weightBrushTarget * 100)}%)</span>
                <div
                  data-testid="varco3d-weight-heatmap-ramp"
                  className="h-2 w-full rounded-full"
                  style={{ background: props.weightRampGradientCss }}
                />
                <input
                  id={`${baseId}-weight-target`}
                  data-testid="varco3d-weight-target-slider"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(props.weightBrushTarget * 100)}
                  style={createRangeTrackStyle(0, 100)}
                  onChange={(e) => props.onWeightBrushTargetChange(Number(e.target.value) / 100)}
                />
              </label>
            </div>

            <div className="text-[0.66rem] text-fg-3">
              루트 본 수: {props.skeletonAudit.rootNames.length}개 · 사이클 감지:{" "}
              {props.skeletonAudit.cycleBoneNames.length === 0 ? "없음(정상)" : "있음"}
            </div>
          </div>
        </div>
      ) : null}

      {studioMode === "Part" ? (
        <div
          data-testid="varco3d-workbench-panel-part"
          className="flex flex-col gap-2 rounded-xl border border-line/70 bg-panel/60 p-3 text-xs text-fg-2"
        >
          <h3 className="font-semibold text-fg">
            서브메시 파트 분리 & 공유 에지 법선/와인딩 감사
          </h3>
          <p>
            추출된 서브메시 정점:{" "}
            <strong data-testid="varco3d-part-vertex-count">
              {props.partExtractionPreview.part.extractedVertexCount}개
            </strong>{" "}
            · 추출된 삼각형:{" "}
            <strong>{props.partExtractionPreview.part.extractedTriangleCount}개</strong> · 매니폴드
            에지 일관성:{" "}
            <strong>
              {props.partExtractionPreview.normalAudit.shouldFlipWinding ? "반전 권고" : "정상"}
            </strong>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="varco3d-part-toggle-faces"
              onClick={props.onTogglePartFaceCount}
              className="rounded-lg border border-line bg-card px-3 py-1 text-xs font-medium text-fg"
            >
              선택 삼각형 전환 ({props.selectedPartFaceCount}개 선택됨)
            </button>
          </div>
        </div>
      ) : null}

      {studioMode === "Animation" ? (
        <div
          data-testid="varco3d-workbench-panel-animation"
          className="grid grid-cols-1 gap-3 rounded-xl border border-line/70 bg-panel/60 p-3 md:grid-cols-2"
        >
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-fg">
              모션 리타겟팅 & 애니메이션 클립 ({props.canEditRig ? "휴머노이드 호환" : "제한됨"})
            </h3>
            <div className="flex flex-wrap gap-1">
              {ANIMATION_CLIPS.map((clip) => (
                <button
                  key={clip.id}
                  type="button"
                  data-testid={`varco3d-anim-clip-${clip.id}`}
                  aria-pressed={props.selectedClipId === clip.id}
                  onClick={() => props.onSelectClipId(clip.id)}
                  className={`rounded-lg border px-2.5 py-1 text-[0.7rem] font-medium ${
                    props.selectedClipId === clip.id
                      ? "border-accent bg-accent-soft text-fg"
                      : "border-line bg-card text-fg-2"
                  }`}
                >
                  {clip.labelKo}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-fg-2">
              <input
                type="checkbox"
                data-testid="varco3d-anim-inplace-checkbox"
                checked={props.isInPlaceAnimation}
                onChange={(e) => props.onInPlaceAnimationChange(e.target.checked)}
              />
              <span>제자리 재생 (In-Place Root Lock)</span>
            </label>
            <div className="text-[0.68rem] text-fg-3">
              카메라 자동 추적 본 (findBestTrackingBone):{" "}
              <strong data-testid="varco3d-best-tracking-bone" className="text-fg">
                {trackingBone.bestBoneName ?? "없음"}
              </strong>{" "}
              (점수 {trackingBone.bestScore.toFixed(2)})
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-line/60 bg-card p-2.5 text-[0.72rem] text-fg-2">
            <div className="font-semibold text-fg">코사인 제2법칙 2-Bone 해석적 IK 솔버</div>
            <p>
              중간 관절(팔꿈치) 해석 위치:{" "}
              <strong data-testid="varco3d-ik-mid-pos">
                ({props.ikSolution.desiredMidPosition.x.toFixed(2)},{" "}
                {props.ikSolution.desiredMidPosition.y.toFixed(2)},{" "}
                {props.ikSolution.desiredMidPosition.z.toFixed(2)})
              </strong>
            </p>
            <p>
              클램프 도달 거리:{" "}
              <strong>{props.ikSolution.solvedDistance.toFixed(3)}m</strong> · 핸들 반경:{" "}
              <strong>{props.ikSolution.controlScale.toFixed(3)}m</strong>
            </p>
            <label htmlFor={`${baseId}-ik-target-y`} className="flex flex-col gap-1 text-[0.7rem]">
              <span>IK 이펙터 목표 높이 Y ({props.ikTargetY.toFixed(2)}m)</span>
              <input
                id={`${baseId}-ik-target-y`}
                data-testid="varco3d-ik-target-y-slider"
                type="range"
                min={100}
                max={170}
                step={5}
                value={Math.round(props.ikTargetY * 100)}
                style={createRangeTrackStyle(100, 170)}
                onChange={(e) => props.onIkTargetYChange(Number(e.target.value) / 100)}
              />
            </label>
          </div>
        </div>
      ) : null}

      {studioMode === "Comparer" ? (
        <div
          data-testid="varco3d-workbench-panel-comparer"
          className="grid grid-cols-1 gap-3 rounded-xl border border-line/70 bg-panel/60 p-3 md:grid-cols-2"
        >
          <div className="flex flex-col gap-2 text-xs text-fg-2">
            <h3 className="font-semibold text-fg">
              듀얼 비교 뷰포트 & BroadcastChannel 카메라 동기화
            </h3>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                data-testid="varco3d-comparer-camera-sync"
                checked={props.cameraSyncEnabled}
                onChange={(e) => props.onCameraSyncEnabledChange(e.target.checked)}
              />
              <span>CameraSyncService 실시간 시점 동기화 활성</span>
            </label>
            <label
              htmlFor={`${baseId}-comparer-split`}
              className="flex flex-col gap-1 text-[0.72rem]"
            >
              <span>비교 분할선 위치: {props.comparerSplitPercent}%</span>
              <input
                id={`${baseId}-comparer-split`}
                data-testid="varco3d-comparer-split-slider"
                type="range"
                min={10}
                max={90}
                step={5}
                value={props.comparerSplitPercent}
                style={createRangeTrackStyle(10, 90)}
                onChange={(e) => props.onComparerSplitPercentChange(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="flex flex-col gap-1.5 rounded-lg border border-line/60 bg-card p-2.5 text-[0.72rem] text-fg-2">
            <div className="font-semibold text-fg">
              멀티뷰 4방위 자동 감지 & Scissor 렌더 플랜 ({props.multiViewPlan.scissorPasses.length}뷰)
            </div>
            <div className="grid grid-cols-2 gap-1">
              {MULTIVIEW_SAMPLE_FILES.map((filename) => {
                const dir = detectVarco3dMultiviewPosition(filename);
                return (
                  <div
                    key={filename}
                    data-testid={`varco3d-multiview-slot-${dir ?? "unknown"}`}
                    className="flex items-center justify-between rounded border border-line/50 px-2 py-1 text-[0.68rem]"
                  >
                    <span className="truncate">{filename}</span>
                    <span className="font-semibold uppercase text-accent">{dir}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {/* Exclusive <details name="..."> accordion group for Remesh/Unwrap, DCC Bridge/Slicers, and DAG Pipeline */}
      <div
        data-testid="varco3d-pipeline-accordion-group"
        className="flex flex-col gap-1.5 rounded-xl border border-line/70 bg-panel/40 p-2 text-xs"
      >
        <details
          name={accordionGroupName}
          open
          data-testid="varco3d-details-remesh-unwrap"
          className="rounded-lg border border-line/60 bg-card px-3 py-2"
        >
          <summary className="cursor-pointer font-semibold text-fg">
            리메시 (5K~100K · Tri/Quad) & AI 언랩 (50K→20K 자동 감축) & 바닥 피벗
          </summary>
          <div className="mt-2 grid grid-cols-1 gap-2.5 text-[0.72rem] text-fg-2 md:grid-cols-3">
            <div className="flex flex-col gap-1">
              <span className="font-medium text-fg">타깃 폴리곤 프리셋 & 토폴로지</span>
              <div className="flex flex-wrap gap-1">
                {STUDIO_VARCO3D_REMESH_UNWRAP_METRICS.presetPolygonCounts.map((count) => (
                  <button
                    key={count}
                    type="button"
                    data-testid={`varco3d-remesh-preset-${count}`}
                    aria-pressed={remeshPolygonCount === count}
                    onClick={() => setRemeshPolygonCount(count)}
                    className={`rounded border px-2 py-0.5 text-[0.68rem] ${
                      remeshPolygonCount === count
                        ? "border-accent bg-accent-soft font-semibold text-fg"
                        : "border-line bg-panel text-fg-2"
                    }`}
                  >
                    {count / 1000}K
                  </button>
                ))}
                {(["tri", "quad"] as const).map((topo) => (
                  <button
                    key={topo}
                    type="button"
                    data-testid={`varco3d-remesh-topology-${topo}`}
                    aria-pressed={remeshTopology === topo}
                    onClick={() => setRemeshTopology(topo)}
                    className={`rounded border px-2 py-0.5 text-[0.68rem] uppercase ${
                      remeshTopology === topo
                        ? "border-accent bg-accent-soft font-semibold text-fg"
                        : "border-line bg-panel text-fg-2"
                    }`}
                  >
                    {topo}
                  </button>
                ))}
              </div>
              <span data-testid="varco3d-remesh-readout" className="text-[0.68rem] text-fg-3">
                유효 리메시: {remeshEval.effectivePolygonCount.toLocaleString()}면 (
                {remeshEval.effectiveTopology.toUpperCase()})
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={`${baseId}-unwrap-faces`} className="font-medium text-fg">
                AI UV 언랩 입력 면 수 ({unwrapInputFaces.toLocaleString()}면)
              </label>
              <input
                id={`${baseId}-unwrap-faces`}
                data-testid="varco3d-unwrap-faces-slider"
                type="range"
                min={10000}
                max={100000}
                step={5000}
                value={unwrapInputFaces}
                style={createRangeTrackStyle(10000, 100000)}
                onChange={(e) => setUnwrapInputFaces(Number(e.target.value))}
              />
              <span data-testid="varco3d-unwrap-plan-readout" className="text-[0.68rem] text-fg-3">
                실제 언랩 면 수: {unwrapPlan.effectiveUnwrapFaceCount.toLocaleString()}면{" "}
                {unwrapPlan.autoReducedTo20k ? "(50K 초과 → 20K 자동 감축)" : "(원본 유지)"}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="font-medium text-fg">출력 타입별 바닥 피벗 (Pivot to Bottom)</span>
              <div className="flex flex-wrap gap-1">
                {(["mesh", "rigged-mesh", "animated-mesh"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    data-testid={`varco3d-output-type-${type}`}
                    aria-pressed={outputType === type}
                    onClick={() => setOutputType(type)}
                    className={`rounded border px-2 py-0.5 text-[0.68rem] ${
                      outputType === type
                        ? "border-accent bg-accent-soft font-semibold text-fg"
                        : "border-line bg-panel text-fg-2"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <span data-testid="varco3d-pivot-bottom-readout" className="text-[0.68rem] text-fg-3">
                바닥 원점 정렬 기본값: {pivotToBottom ? "ON (true)" : "OFF (false)"}
              </span>
            </div>
          </div>
        </details>

        <details
          name={accordionGroupName}
          data-testid="varco3d-details-dcc-slicers"
          className="rounded-lg border border-line/60 bg-card px-3 py-2"
        >
          <summary className="cursor-pointer font-semibold text-fg">
            로컬호스트 DCC 브리지 (5324~5328) & 3D 프린팅 슬라이서 딥링크
          </summary>
          <div className="mt-2 grid grid-cols-1 gap-2.5 text-[0.72rem] text-fg-2 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="font-medium text-fg">
                DCC 로컬호스트 원클릭 임포트 포트 (GET /status · POST /import)
              </span>
              <div className="flex flex-wrap gap-1">
                {STUDIO_VARCO3D_DCC_BRIDGE_PORTS.map((dcc) => (
                  <span
                    key={dcc.name}
                    data-testid={`varco3d-dcc-port-${dcc.port}`}
                    className="rounded border border-line/70 bg-panel px-2 py-0.5 text-[0.68rem]"
                  >
                    {dcc.name}: <strong>:{dcc.port}</strong>
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="font-medium text-fg">3D 프린터 슬라이서 프로토콜 URI</span>
              <div className="flex flex-wrap gap-1">
                {STUDIO_VARCO3D_SLICER_SPECS.map((slicer) => (
                  <button
                    key={slicer.name}
                    type="button"
                    data-testid={`varco3d-slicer-btn-${slicer.format}-${slicer.name.replace(/\s+/g, "-")}`}
                    aria-pressed={selectedSlicer === slicer.name}
                    onClick={() => setSelectedSlicer(slicer.name)}
                    className={`rounded border px-2 py-0.5 text-[0.68rem] ${
                      selectedSlicer === slicer.name
                        ? "border-accent bg-accent-soft font-semibold text-fg"
                        : "border-line bg-panel text-fg-2"
                    }`}
                  >
                    {slicer.name} (.{slicer.format})
                  </button>
                ))}
              </div>
              <code
                data-testid="varco3d-slicer-uri-readout"
                className="truncate text-[0.65rem] text-fg-3"
              >
                {slicerDeepLink}
              </code>
            </div>
          </div>
        </details>

        <details
          name={accordionGroupName}
          data-testid="varco3d-details-dag-pipeline"
          className="rounded-lg border border-line/60 bg-card px-3 py-2"
        >
          <summary className="cursor-pointer font-semibold text-fg">
            노드 캔버스 DAG 파이프라인 (3차 베지어 포트 라우팅 & Topological Wave 스케줄러)
          </summary>
          <div className="mt-2 flex flex-col gap-1.5 text-[0.72rem] text-fg-2">
            <div className="flex flex-wrap items-center gap-2">
              {dagSchedule.scheduledNodes.map((n) => (
                <span
                  key={n.id}
                  data-testid={`varco3d-dag-node-${n.id}`}
                  className="rounded border border-line bg-panel px-2 py-0.5 text-[0.68rem]"
                >
                  {n.id} (등장: <strong>{n.appearAtMs}ms</strong>)
                </span>
              ))}
            </div>
            <div className="text-[0.66rem] text-fg-3">
              첫 번째 엣지 SVG 경로:{" "}
              <code data-testid="varco3d-dag-first-edge-path">{firstEdgeGeom.pathSvg}</code>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
