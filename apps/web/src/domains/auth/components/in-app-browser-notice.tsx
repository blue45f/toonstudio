import { Check, Copy, ExternalLink } from "lucide-react";
import { useId, useState } from "react";

import { diagnoseStudioInAppBrowserFromGlobals } from "@/platform/browser/in-app-browser";
import {
  formatI18nTemplate,
  translateBilingualPair,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

/**
 * 로그인 화면의 인앱 브라우저 안내.
 *
 * 카카오톡·인스타그램·네이버 같은 앱이 띄운 내장 브라우저(WebView)에서는 구글 같은 소셜 로그인이 막히거나
 * 작업이 저장되기 전에 화면이 닫힐 수 있다. 사용자가 로그인 버튼을 눌러 보기 전에 한 번만 알리고, 실제로
 * 나갈 수 있는 길을 준다: 카카오톡은 기본 브라우저로 여는 링크, 나머지는 메뉴 안내와 주소 복사.
 *
 * 판별과 탈출 링크는 `in-app-browser.ts` 가 순수 함수로 맡는다(이 컴포넌트는 그 결과를 그리기만 한다).
 * 인앱이 아니면 아무것도 그리지 않으므로 일반 브라우저 사용자에게는 화면이 달라지지 않는다.
 * "닫기"는 이 탭의 세션 동안만 기억한다 — 다음 방문에는 다시 보여 주는 편이 안전하다.
 */

const SCOPE = "domains.auth.components.in.app.browser.notice";

export const AUTH_IN_APP_NOTICE_DISMISS_KEY = "toonstudio:auth:in-app-browser-notice-dismissed";

function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(AUTH_IN_APP_NOTICE_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed(): void {
  try {
    window.sessionStorage.setItem(AUTH_IN_APP_NOTICE_DISMISS_KEY, "1");
  } catch {
    // 저장소가 막혀 있어도 이번 화면에서는 닫힌다.
  }
}

const FOCUS_RING =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const ACTION_CLASS = cn(
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg",
  "transition-colors hover:border-line-strong hover:bg-raised",
  FOCUS_RING,
);

export interface AuthInAppBrowserNoticeProps {
  readonly className?: string;
}

export function AuthInAppBrowserNotice({ className }: AuthInAppBrowserNoticeProps) {
  useBilingualI18nRevision();
  const titleId = useId();
  const [diagnosis] = useState(() => diagnoseStudioInAppBrowserFromGlobals());
  const [dismissed, setDismissed] = useState(readDismissed);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  if (!diagnosis.inApp || dismissed) return null;

  const href = window.location.href;
  const title = diagnosis.name
    ? formatI18nTemplate(
        translateBilingualPair(SCOPE, "{app} 안에서는 로그인이 끊길 수 있어요", "Signing in may not work inside {app}"),
        { app: diagnosis.name },
      )
    : translateBilingualPair(
        SCOPE,
        "앱 안의 브라우저에서는 로그인이 끊길 수 있어요",
        "Signing in may not work inside an in-app browser",
      );
  const body = translateBilingualPair(
    SCOPE,
    "구글 같은 소셜 로그인이 막히거나, 작업이 저장되기 전에 화면이 닫힐 수 있어요. 기본 브라우저에서 열면 안전해요.",
    "Social sign-in such as Google can be blocked here, and the page may close before your work is saved. Opening it in your default browser is safer.",
  );
  // 메뉴 위치와 이름은 앱마다 다르고 실기기로 앱별 확인을 하지 못했다 — 위치를 단정하지 않고 비슷한 이름의 항목을 찾게 한다.
  const hint =
    diagnosis.platform === "ios"
      ? translateBilingualPair(
          SCOPE,
          "앱 안의 ⋯(더보기) 메뉴에서 ‘Safari로 열기’나 ‘외부 브라우저에서 열기’ 같은 항목을 눌러 주세요. 메뉴 위치와 이름은 앱마다 달라요.",
          "In the app’s ⋯ (more) menu, tap an item like “Open in Safari” or “Open in external browser”. The menu’s place and name differ by app.",
        )
      : diagnosis.platform === "android"
        ? translateBilingualPair(
            SCOPE,
            "앱 안의 ⋯(더보기) 메뉴에서 ‘다른 브라우저로 열기’나 ‘외부 브라우저에서 열기’ 같은 항목을 눌러 주세요. 메뉴 위치와 이름은 앱마다 달라요.",
            "In the app’s ⋯ (more) menu, tap an item like “Open in another browser” or “Open in external browser”. The menu’s place and name differ by app.",
          )
        : translateBilingualPair(
            SCOPE,
            "브라우저 앱에서 이 주소를 열어 주세요.",
            "Open this address in your browser app.",
          );
  // 한 번에 여는 링크는 전용 스킴이 확실한 카카오톡에서만 둔다. 그 밖의 Android 앱 브라우저는 intent:// 를 받아들이지
  // 않고 오류 화면으로 보낼 수 있어(실기기 미확인) 로그인 도중 길을 잃게 하느니 안내와 주소 복사로 두는 편이 안전하다.
  const escapeHref = diagnosis.id === "kakaotalk" ? diagnosis.escapeHref : null;

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(href);
      setCopyState("copied");
    } catch {
      // 일부 WebView 는 클립보드 쓰기를 막는다 — 주소를 직접 보여 줘 길게 눌러 복사하게 한다.
      setCopyState("failed");
    }
  };

  return (
    <section
      role="note"
      aria-labelledby={titleId}
      data-auth-in-app-browser-notice=""
      className={cn(
        "mb-4 rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs leading-relaxed text-fg-2",
        className,
      )}
    >
      <p id={titleId} className="text-sm font-semibold text-fg">
        {title}
      </p>
      <p className="mt-1 text-fg-3">{body}</p>
      <p className="mt-1 text-fg-3">{hint}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {escapeHref ? (
          <a href={escapeHref} data-auth-in-app-open="" className={ACTION_CLASS}>
            <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
            {translateBilingualPair(SCOPE, "기본 브라우저로 열기", "Open in default browser")}
          </a>
        ) : null}
        <button type="button" onClick={() => void copyAddress()} className={ACTION_CLASS}>
          {copyState === "copied" ? (
            <Check className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <Copy className="size-4 shrink-0" aria-hidden="true" />
          )}
          {translateBilingualPair(SCOPE, "주소 복사", "Copy address")}
        </button>
        <button
          type="button"
          onClick={() => {
            rememberDismissed();
            setDismissed(true);
          }}
          className={cn(ACTION_CLASS, "border-transparent bg-transparent text-fg-3 hover:text-fg-2")}
        >
          {translateBilingualPair(SCOPE, "이 화면에서 계속할게요", "Continue here")}
        </button>
      </div>
      <p role="status" aria-live="polite" className="mt-2 min-h-4 text-fg-3">
        {copyState === "copied"
          ? translateBilingualPair(
              SCOPE,
              "주소를 복사했어요. 브라우저 앱에 붙여 넣어 주세요.",
              "Address copied. Paste it into your browser app.",
            )
          : copyState === "failed"
            ? translateBilingualPair(
                SCOPE,
                "복사하지 못했어요. 아래 주소를 길게 눌러 복사해 주세요.",
                "Could not copy. Select the address below and copy it.",
              )
            : ""}
      </p>
      {copyState === "failed" ? (
        <input
          readOnly
          value={href}
          aria-label={translateBilingualPair(SCOPE, "현재 주소", "Current address")}
          onFocus={(event) => event.currentTarget.select()}
          className={cn(
            "mt-1 min-h-11 w-full rounded-lg border border-line bg-canvas px-2 text-xs text-fg",
            FOCUS_RING,
          )}
        />
      ) : null}
    </section>
  );
}
