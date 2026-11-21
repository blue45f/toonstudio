"use client";

import { useEffect, useMemo, useState } from "react";

import {
  computeDynamicSpriteFrameKinematics,
  getDynamicCreatorPersonaSpec,
  renderDynamicCreatorSpriteSvg,
  type DynamicSpriteDirection,
  type DynamicSpriteExtendedActionId,
  type DynamicSpriteExpressionId,
  type DynamicSpriteVfxId,
  type StudioFullSpritePersonaId,
} from "./studio-virtual-space-dynamic-sprite-engine";

export interface StudioVirtualDynamicSpriteAvatarProps {
  readonly personaId: StudioFullSpritePersonaId;
  readonly actionId: DynamicSpriteExtendedActionId;
  readonly expressionId: DynamicSpriteExpressionId;
  readonly vfxId: DynamicSpriteVfxId;
  readonly facing?: DynamicSpriteDirection;
  readonly headTallUnits?: number;
  readonly fps?: number;
  readonly paused?: boolean;
  readonly sizePx?: number;
  readonly showVfx?: boolean;
  readonly showBadge?: boolean;
  readonly statusBubbleKo?: string;
  readonly comboCount?: number;
  readonly testId?: string;
  readonly className?: string;
}

/**
 * 다채로운 소두(5.5~6.5등신) 8프레임 실시간 애니메이션 캐릭터 스프라이트 렌더러.
 *
 * - 정적인 단일 이미지 대신 8프레임 연속 관절·머리카락·망토·시그니처 도구·표정·특수효과(VFX)를
 *   실시간으로 재생하며, prefers-reduced-motion 환경이나 일시정지 상태에서는 안전하게 고정 프레임을 표시한다.
 * - 애니메이션 이동·잔상(Afterimage)은 compositor-friendly `transform` 및 `opacity`만 사용한다.
 */
export function StudioVirtualDynamicSpriteAvatar({
  personaId,
  actionId,
  expressionId,
  vfxId,
  facing = "down",
  headTallUnits,
  fps = 12,
  paused = false,
  sizePx = 112,
  showVfx = true,
  showBadge = false,
  statusBubbleKo,
  comboCount,
  testId,
  className = "",
}: StudioVirtualDynamicSpriteAvatarProps) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion) return;
    const safeFps = Math.max(4, Math.min(30, fps));
    const intervalMs = Math.round(1000 / safeFps);
    const timer = window.setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % 8);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [fps, paused, reducedMotion]);

  const persona = useMemo(() => getDynamicCreatorPersonaSpec(personaId), [personaId]);
  const kinematics = useMemo(
    () =>
      computeDynamicSpriteFrameKinematics(
        personaId,
        actionId,
        expressionId,
        vfxId,
        frameIndex,
        headTallUnits,
      ),
    [personaId, actionId, expressionId, vfxId, frameIndex, headTallUnits],
  );

  const mainSvgMarkup = useMemo(
    () =>
      renderDynamicCreatorSpriteSvg({
        personaId,
        actionId,
        expressionId,
        vfxId,
        frameIndex,
        headTallUnits,
        showVfx,
        facing,
      }),
    [personaId, actionId, expressionId, vfxId, frameIndex, headTallUnits, showVfx, facing],
  );

  const afterimagePrevSvgMarkup = useMemo(() => {
    if (kinematics.afterimageCount <= 0 || reducedMotion) return null;
    return renderDynamicCreatorSpriteSvg({
      personaId,
      actionId,
      expressionId,
      vfxId,
      frameIndex: (frameIndex + 7) % 8,
      headTallUnits,
      showVfx: false,
      facing,
    });
  }, [
    kinematics.afterimageCount,
    reducedMotion,
    personaId,
    actionId,
    expressionId,
    vfxId,
    frameIndex,
    headTallUnits,
    facing,
  ]);

  const afterimageTrail2SvgMarkup = useMemo(() => {
    if (kinematics.afterimageCount < 2 || reducedMotion) return null;
    return renderDynamicCreatorSpriteSvg({
      personaId,
      actionId,
      expressionId,
      vfxId,
      frameIndex: (frameIndex + 6) % 8,
      headTallUnits,
      showVfx: false,
      facing,
    });
  }, [
    kinematics.afterimageCount,
    reducedMotion,
    personaId,
    actionId,
    expressionId,
    vfxId,
    frameIndex,
    headTallUnits,
    facing,
  ]);

  return (
    <div
      data-testid={testId ?? `dynamic-sprite-avatar-${personaId}`}
      data-persona-id={personaId}
      data-action-id={actionId}
      data-expression-id={expressionId}
      data-vfx-id={vfxId}
      data-facing={facing}
      data-frame-index={frameIndex}
      data-head-ratio={kinematics.headToBodyRatio}
      className={`relative inline-flex flex-col items-center select-none ${className}`}
    >
      {statusBubbleKo ? (
        <div
          data-testid={`dynamic-sprite-bubble-${personaId}`}
          className="mb-1 max-w-44 truncate rounded-full border border-accent bg-panel/95 px-2.5 py-0.5 text-xs font-semibold text-fg shadow-xs backdrop-blur-xs"
        >
          {statusBubbleKo}
        </div>
      ) : null}

      <div
        className="relative flex items-center justify-center"
        style={{ width: `${sizePx}px`, height: `${sizePx}px` }}
      >
        {/* 역동적 2단 잔상 (Afterimage Motion Trail) — compositor transform & opacity 전용 */}
        {afterimageTrail2SvgMarkup ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              transform: "translate3d(-18px, 4px, 0) scale(0.92)",
              opacity: 0.18,
            }}
            dangerouslySetInnerHTML={{ __html: afterimageTrail2SvgMarkup }}
          />
        ) : null}
        {afterimagePrevSvgMarkup ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              transform: "translate3d(-10px, 2px, 0) scale(0.96)",
              opacity: 0.34,
            }}
            dangerouslySetInnerHTML={{ __html: afterimagePrevSvgMarkup }}
          />
        ) : null}

        {/* 메인 다중프레임 소두 캐릭터 스프라이트 SVG */}
        <div
          role="img"
          aria-label={`${persona.characterNameKo} · 표정 ${expressionId} · 동작 ${actionId} · 특수효과 ${vfxId} (프레임 ${frameIndex + 1}/8)`}
          className="relative h-full w-full"
          style={{
            transform: "translate3d(0, 0, 0)",
          }}
          dangerouslySetInnerHTML={{ __html: mainSvgMarkup }}
        />

        {typeof comboCount === "number" && comboCount > 0 ? (
          <span
            data-testid={`dynamic-sprite-combo-${personaId}`}
            className="absolute -top-1 -right-1 rounded-full border border-accent bg-accent-soft px-1.5 py-0.5 font-mono text-xs font-bold text-accent shadow-xs"
          >
            ×{comboCount}
          </span>
        ) : null}
      </div>

      {showBadge ? (
        <div className="mt-1 flex flex-col items-center text-center">
          <span className="rounded bg-panel/95 px-1.5 py-0.5 text-xs font-semibold text-fg">
            {persona.characterNameKo.split(" (")[0]}
          </span>
          <span className="text-xs text-fg-2">
            {(headTallUnits ?? persona.headTallUnits).toFixed(1)}등신 · F{frameIndex + 1}/8
          </span>
        </div>
      ) : null}
    </div>
  );
}

export interface StudioVirtualDynamicSpriteSheetStripProps {
  readonly personaId: StudioFullSpritePersonaId;
  readonly actionId: DynamicSpriteExtendedActionId;
  readonly expressionId: DynamicSpriteExpressionId;
  readonly vfxId: DynamicSpriteVfxId;
  readonly facing?: DynamicSpriteDirection;
  readonly headTallUnits?: number;
  readonly activeFrameIndex?: number;
  readonly onSelectFrame?: (frameIndex: number) => void;
}

/**
 * 선택한 캐릭터의 8프레임 연속 동작 스프라이트 시트(Frame 1 ~ Frame 8) 전체를 한눈에 보여주는 아틀라스 스트립 뷰어.
 */
export function StudioVirtualDynamicSpriteSheetStrip({
  personaId,
  actionId,
  expressionId,
  vfxId,
  facing = "down",
  headTallUnits,
  activeFrameIndex = 0,
  onSelectFrame,
}: StudioVirtualDynamicSpriteSheetStripProps) {
  const frames = useMemo(
    () =>
      Array.from({ length: 8 }, (_, idx) => ({
        frameIndex: idx,
        svg: renderDynamicCreatorSpriteSvg({
          personaId,
          actionId,
          expressionId,
          vfxId,
          frameIndex: idx,
          headTallUnits,
          showVfx: true,
          facing,
        }),
        kinematics: computeDynamicSpriteFrameKinematics(
          personaId,
          actionId,
          expressionId,
          vfxId,
          idx,
          headTallUnits,
        ),
      })),
    [personaId, actionId, expressionId, vfxId, headTallUnits, facing],
  );

  return (
    <div
      data-testid="dynamic-sprite-sheet-strip"
      className="grid grid-cols-4 gap-1.5 sm:grid-cols-8"
    >
      {frames.map((frame) => {
        const isCurrent = frame.frameIndex === activeFrameIndex % 8;
        return (
          <button
            key={frame.frameIndex}
            type="button"
            data-testid={`dynamic-sprite-sheet-frame-${frame.frameIndex}`}
            onClick={() => onSelectFrame?.(frame.frameIndex)}
            className={`flex min-h-11 flex-col items-center rounded-lg border p-1.5 transition-colors ${
              isCurrent
                ? "border-accent bg-accent-soft/50 text-accent font-semibold shadow-xs"
                : "border-line bg-card text-fg-2 hover:border-accent"
            }`}
          >
            <span className="font-mono text-xs">F{frame.frameIndex + 1}</span>
            <div
              className="h-14 w-14"
              dangerouslySetInnerHTML={{ __html: frame.svg }}
            />
            <span className="mt-0.5 truncate text-xs text-fg-3">
              {frame.kinematics.isBlinkFrame ? "깜빡임" : `${frame.kinematics.bodyOffsetY}px`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
