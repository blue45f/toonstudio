import { Compass, Gamepad2, KeyRound, ShieldAlert, ShieldCheck, Sparkles, Sun } from "lucide-react";

import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("MySpaceVaultAndRestBar", ko, en);

/**
 * 작업 복구·연결 설정과 쉬어가기 목적을 구분하는 개인 공간 카드.
 */
export function MySpaceVaultAndRestBar() {
  useBilingualI18nRevision();

  return (
    <section
      aria-label={bi("작업 복구와 쉬어가기", "Work recovery and a break")}
      data-testid="my-space-vault-rest-bar"
      className="mt-4 grid gap-3.5 lg:grid-cols-2"
    >
      <div className="relative overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/10 via-panel/90 to-card p-4 shadow-sm sm:p-5">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-accent via-cool to-good" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 font-display text-[11px] font-extrabold uppercase tracking-[0.08em] text-accent">
            <ShieldCheck size={13} aria-hidden="true" />
            <span>{bi("기기 보관과 복구", "Device storage and recovery")}</span>
          </span>
        </div>
        <p className="mt-2 text-sm font-bold text-fg">
          {bi("원고 복구와 연결 설정", "Recover work and manage connections")}
        </p>
        <p className="mt-0.5 text-xs text-fg-2">
          {bi(
            "작업 복구 자료와 외부 서비스 연결 설정을 확인하세요.",
            "Find recovery data for your work and manage connections to other services.",
          )}
        </p>
        <div className="mt-3.5 flex flex-wrap gap-2">
          <Link
            href="/studio/recovery"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-accent/45 bg-accent px-3.5 text-xs font-bold text-on-accent shadow-xs transition-colors hover:bg-accent/90"
          >
            <ShieldAlert size={14} aria-hidden="true" />
            {bi("작업 복구 자료", "Work recovery data")}
          </Link>
          <Link
            href="/settings/api-keys"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong/75 bg-card/90 px-3.5 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-fg"
          >
            <KeyRound size={14} aria-hidden="true" />
            {bi("외부 서비스 연결 설정", "Service connection settings")}
          </Link>
          <Link
            href="/sitemap"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong/75 bg-card/90 px-3.5 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-fg"
          >
            <Compass size={14} aria-hidden="true" />
            {bi("전체 기능", "All tools")}
          </Link>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-line-strong/75 bg-gradient-to-br from-cool/8 via-panel/85 to-card p-4 shadow-sm sm:p-5">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cool via-accent to-accent-2" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 font-display text-[11px] font-extrabold uppercase tracking-[0.08em] text-fg-2">
            <Sparkles size={13} className="text-accent" aria-hidden="true" />
            <span>{bi("창작 영감", "Creative inspiration")}</span>
          </span>
        </div>
        <p className="mt-2 text-sm font-bold text-fg">
          {bi("잠깐 쉬어가기", "Take a break")}
        </p>
        <p className="mt-0.5 text-xs text-fg-2">
          {bi(
            "작업에서 잠시 벗어나 새로운 아이디어를 찾아보세요.",
            "Step away from your work for a moment and explore new ideas.",
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
            {bi("영감 둘러보기", "Explore inspiration")}
          </Link>
        </div>
      </div>
    </section>
  );
}
