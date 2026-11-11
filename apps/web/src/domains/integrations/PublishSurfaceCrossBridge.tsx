import { BookOpenCheck, HeartHandshake, Send, ShieldCheck, Sparkles } from "lucide-react";

import Link from "@/shared/navigation/router-link";

/**
 * 시안 N · P (Publish <-> Studio Export & Engineering Atlas Bridge) — 출고·기술 아틀라스·권리 안내 통합 허브 바.
 */
export function PublishSurfaceCrossBridge({
  ko,
}: {
  readonly ko: boolean;
}) {
  const pick = (koText: string, enText: string) => (ko ? koText : enText);

  return (
    <nav
      aria-label={pick("출고·기술 아틀라스·신뢰 허브 바로가기", "Studio export, engineering atlas, and trust hub links")}
      data-testid="publish-surface-cross-bridge"
      className="mb-5 overflow-hidden rounded-2xl border border-line-strong/75 bg-[linear-gradient(155deg,color-mix(in_oklch,var(--color-accent)_9%,var(--color-panel)),var(--color-card))] p-3.5 shadow-sm sm:p-4"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 font-display text-[11px] font-extrabold uppercase tracking-[0.08em] text-accent">
            <Sparkles size={13} aria-hidden="true" />
            <span>PUBLISH & TRUST ATLAS · RIGHTS BOM READY</span>
          </span>
          <p className="mt-1 text-xs font-semibold text-fg-2 sm:text-sm">
            {pick(
              "원고 내부 검수·출고와 기술 아틀라스·창작자 권리 안내를 한 번에 오갑니다.",
              "Switch seamlessly between internal Studio manuscript export, the engineering atlas, and creator rights.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/studio/publish"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-accent/45 bg-accent-soft px-3.5 text-xs font-bold text-accent transition-colors hover:border-accent"
          >
            <Send size={14} aria-hidden="true" />
            {pick("스튜디오 원고 검수·출고", "Studio Manuscript Export")}
          </Link>
          <Link
            href="/about/technology/architecture"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-fg"
          >
            <BookOpenCheck size={14} aria-hidden="true" />
            {pick("기술·데이터 아틀라스", "Engineering & Data Atlas")}
          </Link>
          <Link
            href="/creator-support"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-fg"
          >
            <HeartHandshake size={14} aria-hidden="true" />
            {pick("창작자 후원·지원", "Creator Support")}
          </Link>
          <Link
            href="/accessibility"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-fg"
          >
            <ShieldCheck size={14} aria-hidden="true" />
            {pick("신뢰·접근성 약속", "Trust & Accessibility")}
          </Link>
        </div>
      </div>
    </nav>
  );
}
