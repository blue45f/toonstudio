/**
 * Character Shaper — 포즈 다듬기 + 0..100 모션 프레임 스크러버 + 2인/군상 상호작용 씬 스테이징.
 */
import { ArrowLeftRight, Check, RotateCcw, Users } from "lucide-react";
import { useRef, useState } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import { computeShaperBodyMetrics } from "./character-shaper-custom-quality";
import {
  applyDuoPosePackToPrimaryHost,
  CHARACTER_SHAPER_DUO_POSE_PACKS,
  createDefaultDuoSceneState,
  DUO_PARTNER_MODEL_OPTIONS,
  getDuoPosePackById,
  resolveDuoSceneActors,
  type CharacterShaperDuoSceneState,
} from "./character-shaper-duo-scene";
import { InspectorSection as Section } from "./CharacterShaperInspectorParts";

import type { CharacterShaperInspectorProps } from "./character-shaper-ui-contract";

import { cn } from "@/shared/lib/utils";

const ROW_BUTTON = cn(
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3 text-[0.7rem] font-semibold text-fg-2 [word-break:keep-all]",
  "transition-colors duration-150 hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
  STUDIO_FOCUS_RING,
);

type BoneMap = Record<string, { readonly rotation?: readonly [number, number, number] }>;

function blendPoseBones(source: BoneMap, factor: number): BoneMap {
  const scaled: BoneMap = {};
  for (const [bone, entry] of Object.entries(source)) {
    const rot = entry?.rotation;
    if (!Array.isArray(rot) || rot.length < 3) continue;
    scaled[bone] = {
      rotation: [
        Number((rot[0] * factor).toFixed(4)),
        Number((rot[1] * factor).toFixed(4)),
        Number((rot[2] * factor).toFixed(4)),
      ],
    };
  }
  return scaled;
}

export function CharacterShaperPoseSection({
  h,
  binding,
  locked,
}: Pick<CharacterShaperInspectorProps, "h" | "binding"> & { readonly locked: boolean }) {
  const [motionScrubPct, setMotionScrubPct] = useState(100);
  const basePoseBonesRef = useRef<BoneMap | null>(null);
  const [duoState, setDuoState] = useState<CharacterShaperDuoSceneState>(() => createDefaultDuoSceneState());

  const bodyRotation = typeof h.bodyRotation === "number" ? h.bodyRotation : 0;
  const degrees = Math.round((bodyRotation * 180) / Math.PI);
  const activePack = getDuoPosePackById(duoState.activePackId);
  const resolvedActors = resolveDuoSceneActors(duoState);
  const bodyMetrics = computeShaperBodyMetrics(
    (h.avatarForgeState as { readonly proportions?: Parameters<typeof computeShaperBodyMetrics>[0] } | null | undefined)?.proportions,
  );

  const applyBindPose = (mode: "t-pose" | "a-pose") => {
    basePoseBonesRef.current = null;
    setMotionScrubPct(100);
    if (typeof h.setCustomBones !== "function") {
      h.handleResetActivePose();
      return;
    }
    if (mode === "t-pose") {
      h.setCustomBones({});
    } else {
      // A-포즈(양 팔 36° 자연 하강) — 의상 피팅·실루엣 검수용 표준 바인드 포즈
      h.setCustomBones({
        leftUpperArm: { rotation: [0, 0, -0.63] },
        rightUpperArm: { rotation: [0, 0, 0.63] },
      });
    }
    if (typeof h.invalidateViewport === "function") h.invalidateViewport();
  };

  const handleMotionScrub = (nextPct: number) => {
    const clamped = Math.min(100, Math.max(0, Math.round(nextPct)));
    setMotionScrubPct(clamped);
    const currentBones = (h.customBones ?? null) as BoneMap | null;
    if (currentBones && Object.keys(currentBones).length > 0 && !basePoseBonesRef.current) {
      basePoseBonesRef.current = currentBones;
    }
    const source = basePoseBonesRef.current ?? currentBones;
    if (source && Object.keys(source).length > 0 && typeof h.setCustomBones === "function") {
      h.setCustomBones(blendPoseBones(source, clamped / 100));
    }
  };

  const commitDuoState = (next: CharacterShaperDuoSceneState, applyToHost = true) => {
    setDuoState(next);
    if (next.enabled && applyToHost) {
      applyDuoPosePackToPrimaryHost(h, next);
    }
  };

  return (
    <>
      <Section title="포즈 다듬기" hint="좌우 반전, 초기화, 몸 방향, 그리고 현재 포즈 저장.">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            className={ROW_BUTTON}
            disabled={locked}
            onClick={() => {
              if (binding.mirrorGradePose) binding.mirrorGradePose();
              else h.handleMirrorPose("all");
            }}
          >
            좌우 반전
          </button>
          <button
            type="button"
            className={ROW_BUTTON}
            disabled={locked}
            onClick={() => {
              basePoseBonesRef.current = null;
              setMotionScrubPct(100);
              h.handleResetActivePose();
            }}
          >
            <RotateCcw size={13} aria-hidden />
            포즈 초기화
          </button>
          <button
            type="button"
            className={ROW_BUTTON}
            disabled={locked}
            onClick={() => {
              if (binding.mirrorGradePoseArms) binding.mirrorGradePoseArms();
              else h.handleMirrorPose("arms");
            }}
          >
            팔만 반전
          </button>
          <button type="button" className={ROW_BUTTON} disabled={locked} onClick={() => h.handleMirrorPose("legs")}>
            다리만 반전
          </button>
          <button
            type="button"
            data-testid="shaper-pose-bind-a"
            aria-label="A-포즈 바인드 자세로 맞추기"
            className={ROW_BUTTON}
            disabled={locked}
            onClick={() => applyBindPose("a-pose")}
          >
            A-포즈 맞추기
          </button>
          <button
            type="button"
            data-testid="shaper-pose-bind-t"
            aria-label="T-포즈 바인드 자세로 맞추기"
            className={ROW_BUTTON}
            disabled={locked}
            onClick={() => applyBindPose("t-pose")}
          >
            T-포즈 맞추기
          </button>
        </div>
        <p data-testid="shaper-pose-body-height" className="rounded-lg bg-raised/70 px-2.5 py-1.5 text-[0.68rem] font-semibold tabular-nums text-fg-2">
          현재 체격 기준: {bodyMetrics.summaryKo}
        </p>

        <label className="flex items-center gap-2 rounded-xl border border-line/80 bg-card/70 p-2.5 text-[0.72rem] font-bold text-fg-2">
          <span className="w-16 shrink-0">몸 방향</span>
          <input
            type="range"
            min="-180"
            max="180"
            step="1"
            value={degrees}
            disabled={locked}
            aria-label="몸 방향"
            aria-valuetext={`${degrees}도`}
            className="h-11 min-w-0 flex-1 accent-accent disabled:cursor-not-allowed disabled:opacity-45"
            onChange={h.handleBodyRotationChange}
          />
          <span className="w-10 shrink-0 text-right tabular-nums text-fg-3">{degrees}°</span>
        </label>

        <label
          data-testid="shaper-motion-scrubber"
          className="flex items-center gap-2 rounded-xl border border-line/80 bg-card/70 p-2.5 text-[0.72rem] font-bold text-fg-2"
        >
          <span className="w-16 shrink-0">동작 정지</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={motionScrubPct}
            disabled={locked}
            aria-label="모션 프레임 스크러버"
            aria-valuetext={`${motionScrubPct}%`}
            className="h-11 min-w-0 flex-1 accent-accent disabled:cursor-not-allowed disabled:opacity-45"
            onChange={(event) => handleMotionScrub(Number(event.currentTarget.value))}
          />
          <span className="w-10 shrink-0 text-right tabular-nums text-fg-3">{motionScrubPct}%</span>
        </label>

        <button type="button" className={cn(ROW_BUTTON, "w-full")} disabled={locked} onClick={() => h.handleSavePose()}>
          <Check size={13} aria-hidden />
          현재 포즈 저장
        </button>
      </Section>

      <Section
        title="2인·군상 상호작용 씬 (상황별 포즈 팩)"
        hint="로맨스·액션·학원·오피스 2인 대치와 3인 히어로 구도를 한 번에 배치합니다."
        collapsible
        defaultOpen={false}
      >
        <div
          data-testid="shaper-duo-scene-panel"
          className="space-y-2.5 rounded-xl border border-line/70 bg-card/70 p-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={duoState.enabled}
              disabled={locked}
              onClick={() => commitDuoState({ ...duoState, enabled: !duoState.enabled })}
              className={cn(
                "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors disabled:opacity-45",
                STUDIO_FOCUS_RING,
                duoState.enabled
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-panel text-fg-2 hover:bg-raised",
              )}
            >
              <Users size={14} aria-hidden />
              {duoState.enabled ? `멀티 씬 활성 (${resolvedActors.length}인)` : "2인 상호작용 씬 켜기"}
            </button>
            <button
              type="button"
              disabled={locked || !duoState.enabled}
              aria-label="주연·상대역 좌우 교체"
              onClick={() => commitDuoState({ ...duoState, swapped: !duoState.swapped })}
              className={cn(ROW_BUTTON, "shrink-0 px-2.5")}
            >
              <ArrowLeftRight size={14} aria-hidden />
            </button>
          </div>

          <div role="group" aria-label="2인 상황 포즈 팩" className="grid grid-cols-2 gap-1.5">
            {CHARACTER_SHAPER_DUO_POSE_PACKS.map((pack) => {
              const selected = pack.id === duoState.activePackId;
              return (
                <button
                  key={pack.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={locked}
                  onClick={() =>
                    commitDuoState({
                      ...duoState,
                      enabled: true,
                      activePackId: pack.id,
                      spacingMeters: pack.defaultSpacingMeters,
                      actorCount: pack.actors.length >= 3 ? 3 : 2,
                      partnerModelId: pack.actors[1]?.modelId ?? duoState.partnerModelId,
                    })
                  }
                  className={cn(
                    "flex min-h-11 flex-col items-start justify-center rounded-lg border px-2 py-1.5 text-left transition-colors disabled:opacity-45",
                    STUDIO_FOCUS_RING,
                    selected
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-panel text-fg-2 hover:bg-raised",
                  )}
                >
                  <span className="truncate text-xs font-semibold">{pack.labelKo}</span>
                  <span className="text-[0.68rem] text-fg-3">{pack.actors.length}인 · {pack.genre}</span>
                </button>
              );
            })}
          </div>

          <label className="flex flex-col gap-1 text-xs font-medium text-fg-2">
            <span>상대역 모델</span>
            <select
              aria-label="상대역 캐릭터 모델"
              value={duoState.partnerModelId}
              disabled={locked}
              onChange={(event) => commitDuoState({ ...duoState, partnerModelId: event.currentTarget.value }, false)}
              className={cn("min-h-11 rounded-lg border border-line bg-panel px-2 text-xs text-fg", STUDIO_FOCUS_RING)}
            >
              {DUO_PARTNER_MODEL_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.labelKo}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs font-medium text-fg-2">
            <span className="w-16 shrink-0">인물 간격</span>
            <input
              type="range"
              aria-label="2인 인물 간격"
              min={0.35}
              max={2.0}
              step={0.05}
              value={duoState.spacingMeters}
              disabled={locked}
              onChange={(event) =>
                commitDuoState({ ...duoState, spacingMeters: Number(event.currentTarget.value) }, false)
              }
              className="h-11 min-w-0 flex-1 accent-accent"
            />
            <span className="w-12 text-right font-mono text-xs tabular-nums text-fg-3">
              {duoState.spacingMeters.toFixed(2)}m
            </span>
          </label>

          <p role="status" className="text-xs text-fg-3">
            {activePack.summaryKo} · 배치:{" "}
            {resolvedActors.map((actor) => `${actor.labelKo}(${actor.position[0]}m)`).join(" / ")}
          </p>
        </div>
      </Section>
    </>
  );
}
