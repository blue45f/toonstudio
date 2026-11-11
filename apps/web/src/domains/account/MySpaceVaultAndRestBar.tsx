import { Compass, Gamepad2, KeyRound, ShieldAlert, ShieldCheck, Sparkles, Sun } from "lucide-react";

import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("MySpaceVaultAndRestBar", ko, en);

/**
 * 시안 K (My Space Unified Vault & Breather) — 로컬 암호화 키·오프라인 원고 복구 금고 및 쉬어가기 2열 아틀리에 카드.
 */
export function MySpaceVaultAndRestBar() {
  useBilingualI18nRevision();

  return (
    <section
      aria-label={bi("보안 볼트 및 쉬어가기 코너", "Security vault and rest corner")}
      data-testid="my-space-vault-rest-bar"
      className="mt-4 grid gap-3.5 lg:grid-cols-2"
    >
      <div className="relative overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/10 via-panel/90 to-card p-4 shadow-sm sm:p-5">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-accent via-cool to-good" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 font-display text-[11px] font-extrabold uppercase tracking-[0.08em] text-accent">
            <ShieldCheck size={13} aria-hidden="true" />
            <span>ATELIER VAULT · AES-GCM & OPFS</span>
          </span>
          <span className="rounded-full border border-good/35 bg-good/10 px-2.5 py-0.5 text-[10.5px] font-bold text-good">
            {bi("브라우저 격리 보호", "Local Isolated Vault")}
          </span>
        </div>
        <p className="mt-2 text-sm font-bold text-fg">
          {bi("통합 키 볼트 · 오프라인 원고 복구", "Unified Key Vault & Manuscript Recovery")}
        </p>
        <p className="mt-0.5 text-xs text-fg-2">
          {bi(
            "외부 AI API 키와 미동기화 원고 스냅샷을 서버 평문 노출 없이 안전하게 관리합니다.",
            "Manage external AI API keys and unsynced manuscript snapshots with zero plaintext exposure.",
          )}
        </p>
        <div className="mt-3.5 flex flex-wrap gap-2">
          <Link
            href="/settings/api-keys"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-accent/45 bg-accent px-3.5 text-xs font-bold text-on-accent shadow-xs transition-colors hover:bg-accent/90"
          >
            <KeyRound size={14} aria-hidden="true" />
            {bi("통합 API 키 볼트", "API Key Vault")}
          </Link>
          <Link
            href="/studio/recovery"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong/75 bg-card/90 px-3.5 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-fg"
          >
            <ShieldAlert size={14} aria-hidden="true" />
            {bi("원고 복구 금고", "Manuscript Recovery Vault")}
          </Link>
          <Link
            href="/sitemap"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong/75 bg-card/90 px-3.5 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-fg"
          >
            <Compass size={14} aria-hidden="true" />
            {bi("전체 사이트맵", "Full Sitemap")}
          </Link>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-line-strong/75 bg-gradient-to-br from-cool/8 via-panel/85 to-card p-4 shadow-sm sm:p-5">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cool via-accent to-accent-2" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 font-display text-[11px] font-extrabold uppercase tracking-[0.08em] text-fg-2">
            <Sparkles size={13} className="text-accent" aria-hidden="true" />
            <span>CREATOR LOUNGE · DAILY SPARK</span>
          </span>
        </div>
        <p className="mt-2 text-sm font-bold text-fg">
          {bi("쉬어가기 · 오늘의 창작 영감", "Take a Breather & Daily Spark")}
        </p>
        <p className="mt-0.5 text-xs text-fg-2">
          {bi(
            "마감 사이 막힌 콘티 호흡을 환기하는 가벼운 창작 타로·실험실·오늘의 영감 보드입니다.",
            "Refresh your creative rhythm between deadlines with tarot prompts, mini-experiments, and live sparks.",
          )}
        </p>
        <div className="mt-3.5 flex flex-wrap gap-2">
          <Link
            href="/fortune"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft px-3.5 text-xs font-bold text-accent transition-colors hover:border-accent"
          >
            <Sparkles size={14} className="text-accent" aria-hidden="true" />
            {bi("창작 운세", "Creator Fortune")}
          </Link>
          <Link
            href="/play"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong/75 bg-card/90 px-3.5 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-fg"
          >
            <Gamepad2 size={14} aria-hidden="true" />
            {bi("미니 놀이터", "Playground")}
          </Link>
          <Link
            href="/now"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong/75 bg-card/90 px-3.5 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-fg"
          >
            <Sun size={14} aria-hidden="true" />
            {bi("지금 영감 보드", "Now Inspiration")}
          </Link>
        </div>
      </div>
    </section>
  );
}
