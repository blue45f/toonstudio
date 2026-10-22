/**
 * Studio 마네킹 포저 — 포즈 섹션(실루엣 미니어처·프리셋 카드·포즈 적용 UI).
 *
 * `StudioMannequinPoserPanel.tsx`에서 분리한 표시 섹션이다. 상태는 패널이 소유하고
 * props로 받는다 — 이 파일은 포즈 프리셋 탐색·미리보기·적용 호출만 책임진다.
 */

import { FlipHorizontal2, PersonStanding, Pin, RotateCcw } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import { StudioSectionHeader, StudioToggleChip } from "../studio-panel-ui";
import type { StudioMannequinJointId, StudioMannequinVec3 } from "./studio-mannequin-model";
import {
  STUDIO_MANNEQUIN_POSE_CATEGORIES,
  STUDIO_MANNEQUIN_POSE_PRESETS,
  countStudioMannequinPosePresetsByCategory,
  filterStudioMannequinPosePresets,
  studioMannequinPosePresetScope,
  type StudioMannequinPose,
  type StudioMannequinPoseCategory,
  type StudioMannequinPosePreset,
  type StudioMannequinPoseScope,
} from "./studio-mannequin-poses";
import {
  clearMannequinPosePresetRecent,
  readMannequinPosePresetFavorites,
  readMannequinPosePresetRecent,
  recordMannequinPosePresetRecent,
  toggleMannequinPosePresetFavorite,
} from "./studio-mannequin-pose-preset-storage";
import { StudioPoseFirstRunGuide } from "./StudioPoseFirstRunGuide";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

const POSE_SILHOUETTE_RAD_TO_DEG = 180 / Math.PI;

interface PoseSilhouettePoint {
  readonly x: number;
  readonly y: number;
}

/** 측면 뷰(왼쪽이 정면). forwardDeg>0 이면 정면(왼쪽)으로 기울어진다. */
function poseSilhouetteMovePoint(
  from: PoseSilhouettePoint,
  forwardDeg: number,
  length: number,
): PoseSilhouettePoint {
  const rad = (forwardDeg * Math.PI) / 180;
  return {
    x: from.x - length * Math.sin(rad),
    y: from.y + length * Math.cos(rad),
  };
}

function formatPoseSilhouettePoints(points: readonly PoseSilhouettePoint[]): string {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

function poseSilhouetteJointXDeg(
  joints: Readonly<Partial<Record<StudioMannequinJointId, StudioMannequinVec3>>>,
  jointId: StudioMannequinJointId,
): number {
  const rotation = joints[jointId];
  return rotation ? rotation[0] * POSE_SILHOUETTE_RAD_TO_DEG : 0;
}

function MannequinPoseSilhouette({
  label,
  pose,
  className,
}: {
  /** aria-label에 쓸 프리셋 이름. */
  readonly label: string;
  readonly pose: StudioMannequinPose;
  readonly className?: string;
}): ReactElement {
  const joints = pose.joints;
  const hips: PoseSilhouettePoint = {
    x: 32,
    // 골반 오프셋(m)을 픽셀로 소량 반영한다. 등신 대비 36px/m, ±8px로 클램프.
    y: 52 + Math.min(8, Math.max(-8, pose.pelvisOffset[1] * 36)),
  };

  const spineDeg = poseSilhouetteJointXDeg(joints, "spine");
  const chestDeg = poseSilhouetteJointXDeg(joints, "chest");
  const neckDeg = poseSilhouetteJointXDeg(joints, "neck");
  const headDeg = poseSilhouetteJointXDeg(joints, "head");

  const mid = poseSilhouetteMovePoint(hips, spineDeg, 9);
  const neck = poseSilhouetteMovePoint(mid, spineDeg + chestDeg, 9);
  const headCenter = poseSilhouetteMovePoint(neck, spineDeg + chestDeg + neckDeg + headDeg, 7);
  const shoulder: PoseSilhouettePoint = {
    x: hips.x + (neck.x - hips.x) * 0.82,
    y: hips.y + (neck.y - hips.y) * 0.82,
  };

  function limb(
    side: "left" | "right",
    origin: PoseSilhouettePoint,
    upperJointId: StudioMannequinJointId,
    lowerJointId: StudioMannequinJointId,
    upperLength: number,
    lowerLength: number,
    kneeBend: boolean,
  ): readonly [PoseSilhouettePoint, PoseSilhouettePoint, PoseSilhouettePoint] {
    const upperForward = -poseSilhouetteJointXDeg(joints, upperJointId);
    const joint = poseSilhouetteMovePoint(origin, upperForward, upperLength);
    const lowerDelta = poseSilhouetteJointXDeg(joints, lowerJointId);
    const lowerForward = kneeBend ? upperForward + lowerDelta : upperForward - lowerDelta;
    const end = poseSilhouetteMovePoint(joint, lowerForward, lowerLength);
    const depth = side === "left" ? { x: 2.5, y: 0.8 } : { x: 0, y: 0 };
    return [
      { x: origin.x + depth.x, y: origin.y + depth.y },
      { x: joint.x + depth.x, y: joint.y + depth.y },
      { x: end.x + depth.x, y: end.y + depth.y },
    ];
  }

  const leftArm = limb("left", shoulder, "leftUpperArm", "leftLowerArm", 13, 11, false);
  const rightArm = limb("right", shoulder, "rightUpperArm", "rightLowerArm", 13, 11, false);
  const leftLeg = limb("left", hips, "leftUpperLeg", "leftLowerLeg", 16, 15, true);
  const rightLeg = limb("right", hips, "rightUpperLeg", "rightLowerLeg", 16, 15, true);

  return (
    <svg
      viewBox="0 0 64 88"
      className={className ?? "h-16 w-full text-fg-3"}
      role="img"
      aria-label={`${label} 포즈 실루엣`}
    >
      {/* 뒤쪽(왼쪽) 팔다리 — 반투명 */}
      <g stroke="currentColor" strokeLinecap="round" fill="none" opacity={0.35}>
        <polyline points={formatPoseSilhouettePoints(leftArm)} strokeWidth={3} />
        <polyline points={formatPoseSilhouettePoints(leftLeg)} strokeWidth={3.4} />
      </g>
      {/* 몸통·머리 */}
      <g stroke="currentColor" strokeLinecap="round" fill="none">
        <polyline points={formatPoseSilhouettePoints([hips, mid, neck])} strokeWidth={4} />
        <circle cx={headCenter.x} cy={headCenter.y} r={6} strokeWidth={2.4} />
      </g>
      {/* 앞쪽(오른쪽) 팔다리 */}
      <g stroke="currentColor" strokeLinecap="round" fill="none">
        <polyline points={formatPoseSilhouettePoints(rightArm)} strokeWidth={3} />
        <polyline points={formatPoseSilhouettePoints(rightLeg)} strokeWidth={3.4} />
      </g>
    </svg>
  );
}

const MANNEQUIN_POSE_PRESET_BY_ID = new Map(
  STUDIO_MANNEQUIN_POSE_PRESETS.map((preset) => [preset.id, preset]),
);

function getMannequinPosePreset(id: string): StudioMannequinPosePreset | undefined {
  return MANNEQUIN_POSE_PRESET_BY_ID.get(id);
}

function MannequinPosePresetCard({
  preset,
  pinned,
  onApply,
  onTogglePin,
}: {
  preset: StudioMannequinPosePreset;
  pinned: boolean;
  onApply: (preset: StudioMannequinPosePreset) => void;
  onTogglePin: (presetId: string) => void;
}): ReactElement {
  const categoryLabel = STUDIO_MANNEQUIN_POSE_CATEGORIES.find((meta) => meta.id === preset.category)?.label ?? "";
  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border p-1.5 transition-colors",
        pinned
          ? "border-accent/50 bg-accent-soft/25"
          : "border-line bg-card/45 hover:border-accent/40 hover:bg-raised",
      )}
    >
      <button
        type="button"
        onClick={() => onApply(preset)}
        aria-label={preset.label}
        title={`${preset.label} — 클릭하면 3D 데생 인형에 바로 적용`}
        className="flex w-full flex-col rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <MannequinPoseSilhouette label={preset.label} pose={preset.pose} />
        <span className="mt-1 block truncate text-[0.7rem] font-bold text-fg" aria-hidden>
          {preset.label}
        </span>
        <span className="block truncate text-[0.62rem] text-fg-3" aria-hidden>
          {categoryLabel}
          {studioMannequinPosePresetScope(preset) === "hand-only" ? " · 손만 적용" : ""}
          {(preset.figures ?? 1) === 2 ? " · 2인" : ""}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onTogglePin(preset.id)}
        aria-pressed={pinned}
        aria-label={pinned ? `${preset.label} 즐겨찾기 해제` : `${preset.label} 즐겨찾기 고정`}
        title={pinned ? "즐겨찾기 해제" : "즐겨찾기에 고정"}
        className={cn(
          "absolute right-1 top-1 grid size-6 place-items-center rounded-md transition-colors",
          pinned
            ? "text-accent hover:bg-accent-soft"
            : "text-fg-3 opacity-0 hover:bg-raised hover:text-fg focus-visible:opacity-100",
          // 터치 기기에는 hover가 없어 항상 보이게 한다.
          "group-hover:opacity-100 pointer-coarse:opacity-100",
        )}
      >
        <Pin size={13} aria-hidden className={pinned ? "fill-accent" : undefined} />
      </button>
    </div>
  );
}

export function StudioMannequinPoseSection({
  selectedCategory,
  onCategorySelect,
  onApplyPreset,
  onMirror,
  onResetJoints,
}: {
  selectedCategory: StudioMannequinPoseCategory | "all";
  onCategorySelect: (category: StudioMannequinPoseCategory | "all") => void;
  onApplyPreset: (presetId: string) => void;
  onMirror: () => void;
  onResetJoints: () => void;
}): ReactElement {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<StudioMannequinPoseScope | "all">("all");
  const [favorites, setFavorites] = useState<string[]>(() =>
    readMannequinPosePresetFavorites(),
  );
  const [recent, setRecent] = useState<string[]>(() =>
    readMannequinPosePresetRecent(),
  );
  const [lastAppliedId, setLastAppliedId] = useState<string | null>(null);

  const isDefaultFilter =
    selectedCategory === "all" && scope === "all" && query.trim() === "";

  const categoryCounts = useMemo(
    () => countStudioMannequinPosePresetsByCategory(),
    [],
  );

  const filteredPresets = useMemo(
    () =>
      filterStudioMannequinPosePresets({
        category: selectedCategory,
        scope,
        query: query.trim() ? query : undefined,
      }),
    [selectedCategory, scope, query],
  );

  const favoritePresets = useMemo(
    () =>
      favorites
        .map(getMannequinPosePreset)
        .filter((preset): preset is StudioMannequinPosePreset => preset !== undefined),
    [favorites],
  );

  const recentPresets = useMemo(
    () =>
      recent
        .map(getMannequinPosePreset)
        .filter((preset): preset is StudioMannequinPosePreset => preset !== undefined),
    [recent],
  );

  const pinnedSet = useMemo(() => new Set(favorites), [favorites]);

  function handleApply(preset: StudioMannequinPosePreset): void {
    setLastAppliedId(preset.id);
    setRecent(recordMannequinPosePresetRecent(preset.id));
    onApplyPreset(preset.id);
  }

  function handleTogglePin(presetId: string): void {
    setFavorites(toggleMannequinPosePresetFavorite(presetId));
  }

  function handleClearRecent(): void {
    if (clearMannequinPosePresetRecent()) setRecent([]);
  }

  const lastAppliedLabel = lastAppliedId
    ? getMannequinPosePreset(lastAppliedId)?.label ?? lastAppliedId
    : null;

  return (
    <div className="space-y-3">
      <StudioPoseFirstRunGuide
        scope="mannequin-poser-pose"
        icon={PersonStanding}
        title="포즈 라이브러리 — 10초 가이드"
        steps={[
          { ko: "포즈 카드를 클릭하면 3D 데생 인형에 바로 적용됩니다 (실시간 미리보기).", en: "Click a pose card to apply it to the 3D mannequin instantly." },
          { ko: "핀으로 즐겨찾기를 고정하면 위에서 바로 꺼내 쓸 수 있습니다.", en: "Pin favorites to reach them quickly at the top." },
          { ko: "관절 탭에서 핸들을 드래그해 포즈를 다듬을 수 있습니다.", en: "Refine the pose by dragging handles in the Joint tab." },
        ]}
      />
      <StudioSectionHeader
        title="포즈 라이브러리"
        description="포즈 카드를 누르면 3D 데생 인형에 바로 적용됩니다. 실루엣은 실제 관절 각도에서 그린 미리보기입니다."
        action={
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onMirror}
              className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1 text-[0.7rem]" })}
              title="포즈 좌우 반전"
            >
              <FlipHorizontal2 size={13} aria-hidden /> 미러
            </button>
            <button
              type="button"
              onClick={onResetJoints}
              className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1 text-[0.7rem]" })}
              title="모든 관절 초기화"
            >
              <RotateCcw size={13} aria-hidden /> 초기화
            </button>
          </div>
        }
      />
      <div className="flex flex-wrap gap-1" role="group" aria-label="데생 인형 포즈 카테고리">
        <StudioToggleChip
          active={selectedCategory === "all"}
          onClick={() => onCategorySelect("all")}
        >
          전체
        </StudioToggleChip>
        {STUDIO_MANNEQUIN_POSE_CATEGORIES.map((cat) => (
          <StudioToggleChip
            key={cat.id}
            active={selectedCategory === cat.id}
            onClick={() => onCategorySelect(cat.id)}
          >
            {cat.label} {categoryCounts[cat.id]}
          </StudioToggleChip>
        ))}
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="포즈 적용 범위">
        <StudioToggleChip active={scope === "all"} onClick={() => setScope("all")}>
          전체
        </StudioToggleChip>
        <StudioToggleChip
          active={scope === "full-body"}
          onClick={() => setScope("full-body")}
        >
          전신만
        </StudioToggleChip>
        <StudioToggleChip
          active={scope === "hand-only"}
          onClick={() => setScope("hand-only")}
        >
          손만 (몸 포즈 유지)
        </StudioToggleChip>
      </div>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="포즈 검색 — 예: 대화, 포옹, 앉기, 주먹"
        aria-label="데생 인형 포즈 프리셋 검색"
        className="w-full rounded-lg border px-3 py-2 text-sm"
      />

      {isDefaultFilter && recentPresets.length > 0 ? (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <h4 className="text-[0.68rem] font-bold text-fg-2">최근 사용</h4>
            <button
              type="button"
              onClick={handleClearRecent}
              className="rounded px-1.5 py-0.5 text-[0.64rem] text-fg-3 hover:bg-raised hover:text-fg"
              title="최근 사용 목록 비우기"
            >
              지우기
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {recentPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApply(preset)}
                aria-label={`${preset.label} 포즈 적용`}
                title={`${preset.label} — 클릭하면 바로 적용`}
                className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-accent/40 bg-accent-soft/30 px-2.5 py-1 text-[0.68rem] font-semibold text-fg-2 transition-colors hover:bg-accent-soft/60"
              >
                <span className="truncate">{preset.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {isDefaultFilter && favoritePresets.length > 0 ? (
        <div>
          <h4 className="mb-1 flex items-center gap-1 text-[0.68rem] font-bold text-fg-2">
            <Pin size={11} aria-hidden className="text-accent" /> 즐겨찾기
          </h4>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {favoritePresets.map((preset) => (
              <MannequinPosePresetCard
                key={preset.id}
                preset={preset}
                pinned
                onApply={handleApply}
                onTogglePin={handleTogglePin}
              />
            ))}
          </div>
        </div>
      ) : null}

      <p className="text-[0.66rem] text-fg-3" role="status">
        프리셋 {filteredPresets.length}개
        {scope === "hand-only"
          ? " — 손 전용 프리셋은 클릭해도 지금 몸 포즈는 그대로 유지됩니다."
          : ""}
      </p>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4" role="group" aria-label="데생 인형 포즈 프리셋">
        {filteredPresets.map((preset) => (
          <MannequinPosePresetCard
            key={preset.id}
            preset={preset}
            pinned={pinnedSet.has(preset.id)}
            onApply={handleApply}
            onTogglePin={handleTogglePin}
          />
        ))}
      </div>
      {filteredPresets.length === 0 ? (
        <p className="text-xs text-fg-3">검색 결과가 없습니다. 다른 단어로 검색해 보세요.</p>
      ) : null}
      <p className="text-[0.66rem] text-fg-3">
        {lastAppliedLabel
          ? `적용된 포즈: ${lastAppliedLabel} — 위 되돌리기 버튼으로 이전 포즈로 돌아갈 수 있습니다.`
          : "아직 적용된 포즈가 없습니다. 카드를 클릭해 보세요."}
      </p>
    </div>
  );
}

