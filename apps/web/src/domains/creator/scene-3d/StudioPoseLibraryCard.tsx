/**
 * 통합 포즈 라이브러리 카드 — 데생 인형 포즈·웹툰 포즈 프리셋을 같은 모양의 카드로 그린다.
 *
 * 실루엣은 각 라이브러리의 실제 관절 각도에서 그린 측면 스틱 피규어다. 데생 인형 포즈는
 * 이 파일의 MannequinPoseSilhouette(관절 오일러 rad)를, 웹툰 프리셋은 웹툰 그리드의
 * StudioWebtoonPoseSilhouette(휴머노이드 오일러 deg)를 그대로 쓴다 — 같은 포즈가 두 화면에서
 * 다르게 그려지지 않도록 실루엣 정본은 하나씩만 둔다.
 *
 * 좌표 감각(studio-mannequin-poses.ts): 몸통 X+ = 앞으로 숙임, 팔다리 X− = 앞으로 스윙,
 * 팔꿈치 X− = 앞굽힘, 무릎 X+ = 뒤굽힘. 이미지 에셋 없이 동작하는 순수 SVG라
 * 다크/라이트·모바일·reduced-motion 대응이 자동으로 된다.
 */

import { Pin } from "lucide-react";
import type { ReactElement } from "react";

import type { StudioMannequinJointId, StudioMannequinVec3 } from "./studio-mannequin-model";
import type { StudioMannequinPose } from "./studio-mannequin-poses";
import {
  studioPoseLibraryCategoryLabel,
  type StudioPoseLibraryEntry,
} from "./studio-pose-library-search";
import { StudioPoseDuoThumbnail } from "./StudioPoseDuoThumbnail";
import { StudioWebtoonPoseSilhouette } from "./StudioWebtoonPosePresetGrid";

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

/** 위쪽 기준 이동(몸통·머리). forwardDeg>0 이면 정면(왼쪽)으로 숙는다. */
function poseSilhouetteMoveUp(
  from: PoseSilhouettePoint,
  forwardDeg: number,
  length: number,
): PoseSilhouettePoint {
  const rad = (forwardDeg * Math.PI) / 180;
  return {
    x: from.x - length * Math.sin(rad),
    y: from.y - length * Math.cos(rad),
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

export function MannequinPoseSilhouette({
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

  // 몸통·머리는 골반에서 위로 올라간다(팔다리만 아래로) — 아래로 그리면 머리가 발치에 그려졌다.
  const mid = poseSilhouetteMoveUp(hips, spineDeg, 9);
  const neck = poseSilhouetteMoveUp(mid, spineDeg + chestDeg, 9);
  const headCenter = poseSilhouetteMoveUp(neck, spineDeg + chestDeg + neckDeg + headDeg, 7);
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

/** 카드 아래 줄: 분류 · 출처 · 인원 · 적용 범위. 화면 읽기 프로그램에는 카드 이름만 읽힌다. */
function entryMetaText(entry: StudioPoseLibraryEntry): string {
  const parts = [studioPoseLibraryCategoryLabel(entry.category)];
  if (entry.source === "webtoon") parts.push("웹툰 프리셋");
  if (entry.source === "hand") parts.push("손만 적용");
  if (entry.figures === 2) parts.push("2인");
  return parts.join(" · ");
}

export function StudioPoseLibraryCard({
  entry,
  pinned,
  disabled = false,
  onApply,
  onTogglePin,
}: {
  readonly entry: StudioPoseLibraryEntry;
  readonly pinned: boolean;
  readonly disabled?: boolean;
  readonly onApply: (entry: StudioPoseLibraryEntry) => void;
  readonly onTogglePin: (entry: StudioPoseLibraryEntry) => void;
}): ReactElement {
  const mergedHint = entry.mergedNames.length > 0 ? ` · 웹툰판: ${entry.mergedNames.join(", ")}` : "";
  const silhouette = entry.kind === "mannequin"
    ? <MannequinPoseSilhouette label={entry.label} pose={entry.mannequinPreset.pose} />
    : <StudioWebtoonPoseSilhouette preset={entry.webtoonPreset} />;
  return (
    <div
      data-studio-pose-library-entry={entry.key}
      className={cn(
        "group relative flex flex-col rounded-xl border p-1.5 transition-colors",
        pinned
          ? "border-accent/50 bg-accent-soft/25"
          : "border-line bg-card/45 hover:border-accent/40 hover:bg-raised",
      )}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onApply(entry)}
        aria-label={entry.label}
        title={`${entry.fullName} — 클릭하면 3D 데생 인형에 바로 적용${mergedHint}`}
        className="flex w-full flex-col rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
      >
        {entry.figures === 2 ? <StudioPoseDuoThumbnail>{silhouette}</StudioPoseDuoThumbnail> : silhouette}
        <span className="mt-1 block truncate text-[0.7rem] font-bold text-fg" aria-hidden>
          {entry.label}
        </span>
        <span className="block truncate text-[0.62rem] text-fg-3" aria-hidden>
          {entryMetaText(entry)}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onTogglePin(entry)}
        aria-pressed={pinned}
        aria-label={pinned ? `${entry.label} 즐겨찾기 해제` : `${entry.label} 즐겨찾기 고정`}
        title={pinned ? "즐겨찾기 해제" : "즐겨찾기에 고정"}
        className={cn(
          // 터치에서는 44px 누름 영역을 준다.
          "absolute right-1 top-1 grid size-7 place-items-center rounded-md transition-colors pointer-coarse:size-11",
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
