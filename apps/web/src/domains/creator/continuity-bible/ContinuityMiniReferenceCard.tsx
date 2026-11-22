/**
 * Calm Atelier 미니 참조 카드 — 작화 중 옆에 띄워 두고 눈 색·헤어·복장·상처·소품과
 * 직전 화 대비 누락 경고를 한눈에 체크하는 경량 카드 컴포넌트.
 */
import { AlertTriangle, CheckCircle2, Eye, Package, Shirt } from "lucide-react";

import type {
  CharacterContinuityEvaluation,
  CharacterContinuityProfile,
} from "./continuity-bible-model";

export interface ContinuityMiniReferenceCardProps {
  readonly profile: CharacterContinuityProfile;
  readonly evaluation: CharacterContinuityEvaluation;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onToggleCheckItem: (itemId: string) => void;
}

export function ContinuityMiniReferenceCard({
  profile,
  evaluation,
  selected,
  onSelect,
  onToggleCheckItem,
}: ContinuityMiniReferenceCardProps) {
  const errorWarnings = evaluation.warnings.filter((w) => w.severity === "error");
  const warnWarnings = evaluation.warnings.filter((w) => w.severity === "warn");

  return (
    <article
      aria-label={`${profile.characterName} 작화 참조 카드`}
      data-testid={`continuity-mini-card-${profile.characterId}`}
      className={`flex flex-col gap-3 rounded-xl border p-3.5 transition-colors duration-150 motion-reduce:transition-none ${
        selected
          ? "border-accent bg-accent-soft/35"
          : "border-line bg-card hover:border-line-strong"
      }`}
    >
      <header className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className="min-h-11 min-w-0 flex-1 rounded-lg px-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-bold text-fg">{profile.characterName}</span>
            <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-xs font-medium text-fg-2">
              {profile.roleLabel}
            </span>
          </span>
          <span className="mt-0.5 block text-xs tabular-nums text-fg-3">
            {evaluation.currentEpisodeNumber}화 체크 {evaluation.checkedCount}/
            {evaluation.totalRequiredCount} · 일치율 {evaluation.consistencyScore}%
          </span>
        </button>

        {errorWarnings.length > 0 ? (
          <span
            data-testid={`continuity-card-alert-${profile.characterId}`}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-bad/45 bg-bad/10 px-2.5 text-xs font-bold tabular-nums text-bad"
          >
            <AlertTriangle size={13} aria-hidden="true" />
            누락 {errorWarnings.length}
          </span>
        ) : warnWarnings.length > 0 ? (
          <span className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-warn/45 bg-warn/10 px-2.5 text-xs font-bold tabular-nums text-warn">
            <AlertTriangle size={13} aria-hidden="true" />
            주의 {warnWarnings.length}
          </span>
        ) : (
          <span className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-good/40 bg-good/10 px-2.5 text-xs font-bold text-good">
            <CheckCircle2 size={13} aria-hidden="true" />
            완료
          </span>
        )}
      </header>

      {/* 눈 · 헤어 · 현재 복장 · 소품 요약 */}
      <dl className="space-y-1.5 border-t border-line/70 pt-2.5 text-xs">
        <div className="flex items-start gap-2">
          <dt className="flex shrink-0 items-center gap-1 font-semibold text-fg-3">
            <Eye size={13} aria-hidden="true" />
            외형
          </dt>
          <dd className="min-w-0 text-fg-2 [word-break:keep-all]">
            {profile.eyeColorLabel} · {profile.hairStyleAndColor}
          </dd>
        </div>
        <div className="flex items-start gap-2">
          <dt className="flex shrink-0 items-center gap-1 font-semibold text-fg-3">
            <Shirt size={13} aria-hidden="true" />
            복장
          </dt>
          <dd className="min-w-0 text-fg-2 [word-break:keep-all]">
            {evaluation.activeOutfit?.label ?? "미지정"}
          </dd>
        </div>
        <div className="flex items-start gap-2">
          <dt className="flex shrink-0 items-center gap-1 font-semibold text-fg-3">
            <Package size={13} aria-hidden="true" />
            소품
          </dt>
          <dd className="min-w-0 text-fg-2 [word-break:keep-all]">
            {evaluation.activeProps.length > 0
              ? evaluation.activeProps.map((p) => p.label).join(", ")
              : "고정 소품 없음"}
          </dd>
        </div>
      </dl>

      {/* 이번 화 빠른 작화 체크리스트 */}
      <ul
        aria-label={`${profile.characterName} ${evaluation.currentEpisodeNumber}화 체크항목`}
        className="space-y-1.5 border-t border-line/70 pt-2.5"
      >
        {evaluation.checklist.map((item) => {
          const inputId = `continuity-check-${profile.characterId}-${item.itemId}`;
          return (
            <li
              key={item.itemId}
              className={`flex min-h-11 items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors duration-150 motion-reduce:transition-none ${
                item.checked
                  ? "border-good/35 bg-good/10 text-fg-2 line-through"
                  : item.category === "scar"
                    ? "border-bad/40 bg-bad/10 text-fg"
                    : "border-line bg-panel text-fg"
              }`}
            >
              <input
                id={inputId}
                type="checkbox"
                checked={item.checked}
                data-testid={inputId}
                onChange={() => onToggleCheckItem(item.itemId)}
                className="size-5 shrink-0 cursor-pointer accent-[var(--color-accent)]"
              />
              <label
                htmlFor={inputId}
                className="min-w-0 flex-1 cursor-pointer [word-break:keep-all]"
              >
                <span className="block font-semibold">{item.labelKo}</span>
                <span className="block text-fg-3 no-underline">{item.detailKo}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
