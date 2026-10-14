import { ArrowLeft } from "lucide-react";

import {
  useBilingual,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

/**
 * 개인 모듈 상단 공통 크롬 (BLUEPRINT §1.2 개인 정본 선언).
 *
 * 개인 허브(정본)는 /my 하나다. 모듈 표면(/library·/market/library·/me)은
 * 모두 이 컴포넌트 하나로 같은 모양·같은 문구로 허브에 돌아간다.
 * 모듈마다 복귀 링크를 따로 만들지 않는다 — 모양이 갈라지면 정본 선언이 무너진다.
 */
export function MySpaceModuleChrome({ className }: { className?: string }) {
  useBilingualI18nRevision();
  const t = useBilingual("MySpaceModuleChrome");

  return (
    <nav
      aria-label={t("내 공간으로 돌아가기", "Back to my space")}
      data-my-space-module-chrome="true"
      className={cn("mb-4", className)}
    >
      <Link
        href="/my"
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-card/60 px-3 text-xs font-bold text-fg-2 transition-colors hover:border-accent/45 hover:text-fg"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        {t("내 공간", "My space")}
      </Link>
    </nav>
  );
}
