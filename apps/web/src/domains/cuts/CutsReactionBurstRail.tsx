/**
 * CutsReactionBurstRail.tsx — 컷츠 피드 1탭 감정 리액션 마이크로 버스트 바.
 *
 * 게스트도 로그인 장벽 없이 소름·심쿵·명대사·작화최고 감상 리액션을 즉시 누르고
 * OKLCH 파티클 마이크로 버스트와 로컬 저장 카운트로 생동감 있게 반응한다.
 */

import { Flame, Heart, Palette, Quote } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  CUTS_REACTION_OPTIONS,
  incrementClipReaction,
  loadClipReactions,
  type CutsClipReactionCounts,
  type CutsReactionId,
} from "./cuts-rhythm-director";

import "./cuts-rhythm-fx.css";

const REACTION_ICONS = {
  chills: Flame,
  heart: Heart,
  quote: Quote,
  art: Palette,
} as const;

const TONE_VAR: Record<"accent" | "accent-2" | "cool" | "good", string> = {
  accent: "var(--color-accent)",
  "accent-2": "var(--color-accent-2)",
  cool: "var(--color-cool)",
  good: "var(--color-good)",
};

const SPARK_OFFSETS: readonly { readonly sx: string; readonly sy: string }[] = [
  { sx: "-22px", sy: "-24px" },
  { sx: "-6px", sy: "-30px" },
  { sx: "14px", sy: "-28px" },
  { sx: "26px", sy: "-16px" },
  { sx: "-24px", sy: "-6px" },
  { sx: "22px", sy: "8px" },
];

export function CutsReactionBurstRail({ clipId }: Readonly<{ clipId: string }>) {
  const t = useBilingual("cuts");
  const [counts, setCounts] = useState<CutsClipReactionCounts>(() => loadClipReactions(clipId));
  const [burst, setBurst] = useState<{ readonly id: CutsReactionId; readonly nonce: number } | null>(null);
  const [lastReaction, setLastReaction] = useState<{ readonly id: CutsReactionId; readonly count: number } | null>(null);

  useEffect(() => {
    setCounts(loadClipReactions(clipId));
    setBurst(null);
    setLastReaction(null);
  }, [clipId]);

  const handleReact = (reactionId: CutsReactionId) => {
    const next = incrementClipReaction(clipId, reactionId);
    setCounts(next);
    setBurst((prev) => ({ id: reactionId, nonce: (prev?.nonce ?? 0) + 1 }));
    setLastReaction({ id: reactionId, count: next[reactionId] });
  };

  const lastOption = lastReaction
    ? CUTS_REACTION_OPTIONS.find((item) => item.id === lastReaction.id) ?? null
    : null;
  const announcement =
    lastReaction && lastOption
      ? t(
          `${lastOption.labelKo} 반응을 남겼어요 (${lastReaction.count}회)`,
          `Added ${lastOption.labelEn} reaction (${lastReaction.count})`,
        )
      : "";

  return (
    <div
      className="cuts-reaction-rail"
      role="group"
      aria-label={t("감상 리액션 남기기", "Send a quick reaction")}
      data-testid={`cuts-reaction-rail-${clipId}`}
    >
      {CUTS_REACTION_OPTIONS.map((option) => {
        const Icon = REACTION_ICONS[option.id];
        const label = t(option.labelKo, option.labelEn);
        const count = counts[option.id];
        const isBursting = burst?.id === option.id;
        return (
          <button
            key={option.id}
            type="button"
            data-testid={`cuts-reaction-${clipId}-${option.id}`}
            onClick={() => handleReact(option.id)}
            style={{ "--rx-tone": TONE_VAR[option.accentToken] } as CSSProperties}
            className="cuts-reaction-btn"
            aria-label={count > 0 ? `${label} ${count}` : label}
          >
            <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
            <span>{label}</span>
            {count > 0 ? <span className="tabular-nums">{count}</span> : null}
            {isBursting ? (
              <span key={burst.nonce} className="cuts-reaction-burst" aria-hidden="true">
                {SPARK_OFFSETS.map((spark, index) => (
                  <span
                    key={index}
                    className="cuts-reaction-spark"
                    style={{ "--sx": spark.sx, "--sy": spark.sy } as CSSProperties}
                  />
                ))}
              </span>
            ) : null}
          </button>
        );
      })}
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
