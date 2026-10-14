import { ArrowLeft, Store } from "lucide-react";
import { useLocation } from "react-router-dom";
import Link from "@/shared/navigation/router-link";
import { useI18n } from "@/shared/lib/i18n";
import { parseReturnContext } from "@/shared/navigation/return-context";
import { readStudioMarketplaceReturnHref } from "../studio-marketplace-deep-link";

/** A public-path-only return affordance that survives the Market → Studio document reload. */
export function StudioMarketplaceReturnNotice() {
  const { search } = useLocation();
  const locale = useI18n((state) => state.lang.startsWith("ko") ? "ko" : "en");
  const href = readStudioMarketplaceReturnHref(search);
  if (!href) return null;
  // 복귀 맥락 계약(S2-8)이 함께 실린 진입에서는 ReturnContextBanner가 맥락 한 줄과
  // 복귀 행동을 맡는다. 레거시 marketReturn만 있는 진입에서만 이 알림이 뜬다 —
  // 복귀 행동이 둘이 되지 않게 하기 위해서다.
  if (parseReturnContext(search)) return null;

  return (
    <aside
      data-studio-market-return
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] right-[calc(env(safe-area-inset-right)+0.75rem)] z-[90] md:bottom-[calc(env(safe-area-inset-bottom)+1rem)]"
    >
      <Link
        href={href}
        aria-label={locale === "ko" ? "소재 거리의 원래 리소스로 돌아가기" : "Return to the original marketplace resource"}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-card/95 px-3.5 py-2 text-xs font-bold text-fg shadow-lg backdrop-blur-md transition hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        <Store className="size-4 text-accent" aria-hidden="true" />
        <span>{locale === "ko" ? "소재 거리로 돌아가기" : "Back to materials"}</span>
      </Link>
    </aside>
  );
}
