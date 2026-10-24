import type { CSSProperties, ReactElement } from "react";

import type {
  StudioVarco3dTwoBoneIkResult,
  evaluateVarco3dMultiViewFramePlan,
} from "./studio-varco3d-decal-ik-turntable-engine";
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
  // Rigging state
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
  // Part state
  readonly selectedPartFaceCount: number;
  readonly onTogglePartFaceCount: () => void;
  readonly partExtractionPreview: {
    readonly part: StudioVarco3dSubmeshExtractionResult;
    readonly normalAudit: StudioVarco3dMeshNormalAuditReport;
  };
  // Animation state
  readonly canEditRig: boolean;
  readonly selectedClipId: string;
  readonly onSelectClipId: (clipId: string) => void;
  readonly isInPlaceAnimation: boolean;
  readonly onInPlaceAnimationChange: (inPlace: boolean) => void;
  readonly ikTargetY: number;
  readonly onIkTargetYChange: (targetY: number) => void;
  readonly ikSolution: StudioVarco3dTwoBoneIkResult;
  // Comparer state
  readonly cameraSyncEnabled: boolean;
  readonly onCameraSyncEnabledChange: (enabled: boolean) => void;
  readonly comparerSplitPercent: number;
  readonly onComparerSplitPercentChange: (percent: number) => void;
  readonly multiViewPlan: ReturnType<typeof evaluateVarco3dMultiViewFramePlan>;
}

export function StudioVarco3dWorkbenchSecondaryPanels(
  props: StudioVarco3dWorkbenchSecondaryPanelsProps,
): ReactElement | null {
  const { baseId, studioMode } = props;

  if (studioMode === "Rigging") {
    return (
      <div
        data-testid="varco3d-workbench-panel-rigging"
        className="grid grid-cols-1 gap-3 rounded-xl border border-line/70 bg-panel/60 p-3 md:grid-cols-2"
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-fg">
              스켈레톤 본 트리 ({props.rigBones.length}개 · 바이너리 {props.binaryRigByteLength}B)
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

            <label htmlFor={`${baseId}-weight-size`} className="flex flex-col gap-1 text-[0.7rem]">
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
    );
  }

  if (studioMode === "Part") {
    return (
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
    );
  }

  if (studioMode === "Animation") {
    return (
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
    );
  }

  if (studioMode === "Comparer") {
    return (
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
    );
  }

  return null;
}
