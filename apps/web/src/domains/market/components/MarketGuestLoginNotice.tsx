import { LoaderCircle, LogIn } from "lucide-react";

import { MarketAccountEntryActions } from "./MarketAccountEntryActions";

import { useMarketGuestLoginNoticeState } from "../hooks/use-market-guest-login-notice";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

interface MarketGuestLoginNoticeProps {
  /** detail: 상세 사이드바용 전문+로그인 행동 / compact: 스티키 바용 한 줄 힌트 */
  readonly variant?: "detail" | "compact";
  /** 획득 버튼의 aria-describedby가 참조할 고정 id */
  readonly id?: string;
}

/**
 * 마켓 게스트 획득 사전 고지(personal P-3).
 *
 * 게스트에게는 획득 버튼을 누르기 전에 "받으려면 로그인이 필요하다"를
 * 버튼 근처에서 먼저 보여주고, 그 자리에서 로그인·가입을 시작할 수 있게 한다.
 * 세션 확인 중(checking)에는 로그인 필요를 단정하지 않는 중립 안내만 detail에
 * 표시하고(compact는 레이아웃 흔들림 방지를 위해 아무것도 그리지 않는다),
 * 로그인한 사용자에게는 어떤 변형도 렌더하지 않는다.
 */
export function MarketGuestLoginNotice({
  variant = "detail",
  id,
}: MarketGuestLoginNoticeProps) {
  const bt = useBilingual("MarketGuestLoginNotice");
  const state = useMarketGuestLoginNoticeState();

  if (state === "signed-in") return null;

  if (state === "checking") {
    if (variant === "compact") return null;
    return (
      <div
        id={id}
        role="status"
        data-market-guest-login-notice="checking"
        className="rounded-lg border border-line bg-panel px-3 py-2.5 text-xs text-fg-2"
      >
        <LoaderCircle
          className="mr-1.5 inline h-3.5 w-3.5 animate-spin"
          aria-hidden="true"
        />
        {bt(
          "로그인 상태를 확인하고 있어요",
          "Checking your sign-in status…",
        )}
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <span
        id={id}
        role="note"
        data-market-guest-login-notice="guest"
        className="inline-flex shrink-0 items-center gap-1 text-[0.68rem] font-semibold text-accent"
      >
        <LogIn className="size-3.5" aria-hidden="true" />
        {bt("로그인 필요", "Sign-in required")}
      </span>
    );
  }

  return (
    <div
      id={id}
      role="note"
      data-market-guest-login-notice="guest"
      className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2.5 text-left"
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold text-fg">
        <LogIn className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
        {bt(
          "이 에셋을 받으려면 로그인이 필요해요",
          "You need to sign in to get this asset",
        )}
      </p>
      <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
        {bt(
          "내 에셋에 추가한 에셋은 로그인한 계정에 보관돼요. 먼저 로그인하면 지금 보고 있는 이 에셋을 그대로 추가할 수 있어요.",
          "Assets you add are kept in your signed-in account. Sign in first, and you can add the asset you are viewing right away.",
        )}
      </p>
      <MarketAccountEntryActions source="market-resource-library" />
    </div>
  );
}
