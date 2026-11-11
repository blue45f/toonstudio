import { Compass, Gamepad2, KeyRound, ShieldAlert, Sparkles, Sun } from "lucide-react";

import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("MySpaceVaultAndRestBar", ko, en);

export function MySpaceVaultAndRestBar() {
  useBilingualI18nRevision();

  return (
    <section
      aria-label={bi("보안 볼트 및 쉬어가기 코너", "Security vault and rest corner")}
      data-testid="my-space-vault-rest-bar"
      className="mt-4 grid gap-3 lg:grid-cols-2"
    >
      <div className="rounded-2xl border border-line bg-card/75 p-3.5">
        <p className="text-xs font-bold text-fg">
          {bi("통합 키 볼트 · 오프라인 원고 복구", "Unified Key Vault & Manuscript Recovery")}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            href="/settings/api-keys"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-accent/40 bg-accent-soft px-3 text-xs font-bold text-accent"
          >
            <KeyRound size={14} aria-hidden="true" />
            {bi("통합 API 키 볼트", "API Key Vault")}
          </Link>
          <Link
            href="/studio/recovery"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-panel px-3 text-xs font-semibold text-fg-2 hover:text-fg"
          >
            <ShieldAlert size={14} aria-hidden="true" />
            {bi("원고 복구 금고", "Manuscript Recovery Vault")}
          </Link>
          <Link
            href="/sitemap"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-panel px-3 text-xs font-semibold text-fg-2 hover:text-fg"
          >
            <Compass size={14} aria-hidden="true" />
            {bi("전체 사이트맵", "Full Sitemap")}
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-panel/55 p-3.5">
        <p className="text-xs font-bold text-fg">
          {bi("쉬어가기 · 오늘의 창작 영감", "Take a Breather & Daily Spark")}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            href="/fortune"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:text-fg"
          >
            <Sparkles size={14} aria-hidden="true" />
            {bi("창작 운세", "Creator Fortune")}
          </Link>
          <Link
            href="/play"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:text-fg"
          >
            <Gamepad2 size={14} aria-hidden="true" />
            {bi("미니 놀이터", "Playground")}
          </Link>
          <Link
            href="/now"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:text-fg"
          >
            <Sun size={14} aria-hidden="true" />
            {bi("지금 영감 보드", "Now Inspiration")}
          </Link>
        </div>
      </div>
    </section>
  );
}
