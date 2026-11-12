import {
  Check,
  Download,
  Heart,
  Palette,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useMarketLibrary } from "../hooks/use-market-library";
import { useMarketWishlist } from "../hooks/use-market-wishlist";
import { useMarketGuestLoginNoticeState } from "../hooks/use-market-guest-login-notice";

import { MarketGuestLoginNotice } from "./MarketGuestLoginNotice";
import { marketKindMeta } from "../models/market-kind";
import {
  MARKET_GUEST_LOGIN_NOTICE_STICKY_ID,
  marketGuestLoginNoticeDescribedBy,
} from "../models/market-guest-login-notice";

import type { MarketStudioHandoff } from "../models/market-studio-handoff";
import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";
import { useOverlayClearance } from "@/shared/lib/overlay-clearance";
import Link from "@/shared/navigation/router-link";

interface MarketDetailStickyBarProps {
  record: CreatorMarketplaceResourceRecord;
  studioHandoff: MarketStudioHandoff;
  onOpenAcquisition: () => void;
}

export function MarketDetailStickyBar({
  record,
  studioHandoff,
  onOpenAcquisition,
}: MarketDetailStickyBarProps) {
  const [visible, setVisible] = useState(false);
  const barRef = useRef<HTMLElement>(null);
  useOverlayClearance(barRef, visible);
  const { isWishlisted, toggleWishlist } = useMarketWishlist();
  const { isAcquired } = useMarketLibrary();
  const wishlisted = isWishlisted(record.id);
  const acquired = isAcquired(record.id);
  // 게스트 사전 고지(P-3): 스티키 획득 버튼 옆에도 로그인 필요를 먼저 보인다.
  // 클릭 시 로그인 연결은 부모(상세 아티클)의 onOpenAcquisition이 같은 판정으로 수행한다.
  const guestLoginState = useMarketGuestLoginNoticeState();
  const kind = marketKindMeta(record.kind);
  const StudioActionIcon = studioHandoff.mode === "install-tool-pack"
    ? Download
    : Palette;

  useEffect(() => {
    let scrollFrame: number | null = null;
    const updateVisibility = () => {
      // Show sticky bar when scrolled past 260px
      setVisible(window.scrollY > 260);
    };
    const handleScroll = () => {
      if (scrollFrame !== null) return;
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = null;
        updateVisibility();
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  if (!visible) return null;

  return (
    <aside
      ref={barRef}
      aria-label="에셋 빠른 실행 바"
      data-market-sticky-bar="true"
      style={{ bottom: "max(0px, calc(var(--site-float-base, 1rem) - 1rem))" }}
      className={cn(
        "fixed bottom-0 inset-x-0 z-40 [--site-control-size:48px] border-t border-line/80 bg-card/90 backdrop-blur-md px-4 py-2.5 shadow-xl",
        "animate-fade-up duration-200",
      )}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        {/* Left info */}
        <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-raised text-accent font-bold">
            <kind.icon className="size-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-xs font-bold text-fg sm:text-sm">
                {record.name}
              </span>
              <span className="shrink-0 rounded bg-accent/20 px-1.5 py-0.2 text-[0.62rem] font-bold text-accent">
                v{record.resourceVersion}
              </span>
            </div>
            <p className="text-[0.68rem] text-fg-3">
              {record.publisher.name} · <span className="text-good font-semibold">라이선스 조건 확인</span>
            </p>
          </div>
          {!acquired ? <MarketGuestLoginNotice
            variant="compact"
            id={MARKET_GUEST_LOGIN_NOTICE_STICKY_ID}
          /> : null}
        </div>

        {/* Right actions */}
        <div className="flex w-full min-w-0 flex-nowrap items-center justify-end gap-2 sm:w-auto sm:flex-wrap">
          <button
            type="button"
            onClick={() => toggleWishlist(record)}
            aria-label={wishlisted ? "찜 해제" : "찜하기"}
            className={buttonClass({
              variant: "outline",
              size: "sm",
              className: cn(
                "min-h-12 min-w-12 shrink-0 gap-1 px-2.5",
                wishlisted && "border-warn/40 bg-warn/10 text-warn",
              ),
            })}
          >
            <Heart
              className={cn("size-4", wishlisted && "fill-warn text-warn")}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">{wishlisted ? "찜함" : "찜하기"}</span>
          </button>

          {acquired ? (
            <span className="hidden sm:inline-flex items-center gap-1 rounded-lg bg-good/15 px-3 py-1.5 text-xs font-semibold text-good">
              <Check className="size-3.5" /> 소장 중
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={onOpenAcquisition}
                aria-describedby={marketGuestLoginNoticeDescribedBy(
                  guestLoginState,
                  MARKET_GUEST_LOGIN_NOTICE_STICKY_ID,
                )}
                className={buttonClass({
                  variant: "outline",
                  size: "sm",
                  className: "h-auto min-h-12 min-w-12 flex-1 basis-0 whitespace-normal py-2 pointer-coarse:h-auto sm:flex-none sm:basis-auto gap-1.5 border-accent text-accent hover:bg-accent/10",
                })}
              >
                <Download className="size-3.5 shrink-0" />
                <span className="min-w-0 whitespace-normal text-center leading-5">내 에셋에 추가</span>
              </button>
            </>
          )}

          <Link
            href={studioHandoff.href}
            className={buttonClass({
              variant: "solid",
              size: "sm",
              className: "h-auto min-h-12 min-w-12 flex-[1.4] basis-0 sm:flex-1 sm:basis-auto whitespace-normal py-2 pointer-coarse:h-auto [--site-control-size:48px] gap-1.5 bg-gradient-to-r from-accent to-accent-2 text-on-accent shadow-sm",
            })}
          >
            <StudioActionIcon className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 whitespace-normal text-center leading-5">{studioHandoff.actionLabel}</span>
          </Link>
        </div>
      </div>
    </aside>
  );
}
