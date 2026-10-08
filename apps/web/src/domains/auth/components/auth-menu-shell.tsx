import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { Suspense, useEffect, useState, type ComponentType } from "react";

import { safeAuthProfileImageSrc } from "./auth-menu-profile-image";
import { AuthMenuTrigger } from "./auth-menu-trigger";

import { subscribeAuthModalRequests } from "@/domains/auth/public/session/auth-modal-intent";
import { useT } from "@/shared/lib/i18n";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import { useSession } from "@/domains/auth/public/session/auth-session-store";

type AuthMenuProps = {
  defaultOpen?: boolean;
  defaultMenuOpen?: boolean;
  defaultMode?: "login" | "signup";
};
type AuthMenuModule = { default: ComponentType<AuthMenuProps> };

let authMenuPromise: Promise<AuthMenuModule> | null = null;

function loadAuthMenu(): Promise<AuthMenuModule> {
  authMenuPromise ??= import("./auth-menu").then(
    (mod) => ({
      default: mod.AuthMenu,
    }),
    (error: unknown) => {
      // 일시적인 청크 로딩 실패(네트워크 단절·배포 직후 구 청크 등)가 세션 내내
      // 로그인 게이트를 죽이지 않도록, 실패한 약속은 캐시에서 비워 다음 시도에서
      // 다시 불러오게 한다. 실패 자체는 호출자(lazyRetry의 복구 경로)가 처리한다.
      authMenuPromise = null;
      throw error;
    },
  );
  return authMenuPromise;
}

// 인증 모달은 게스트 보호 동작(좋아요·공유·게시 등)의 유일한 로그인 유도 표면이다.
// bare lazy로 두면 청크 1회 실패가 영구 거절로 굳어 클릭이 조용히 사라지므로,
// 다른 라우트 청크와 같은 lazyRetry(실패 시 1회 새로고침 복구)를 쓴다.
const AuthMenu = lazyRetry(loadAuthMenu, "AuthMenu");

function preloadAuthMenu(): void {
  void loadAuthMenu();
}

function AuthMenuFallback({ onClick }: { onClick: () => void }) {
  const { data: session, status } = useSession();
  const t = useT();
  const preloadProps = {
    onClick,
    onMouseEnter: preloadAuthMenu,
    onFocus: preloadAuthMenu,
  };

  if (status === "authenticated") {
    const initial = (session.user.name ?? session.user.email ?? "U")
      .charAt(0)
      .toUpperCase();
    return (
      <AuthMenuTrigger
        {...preloadProps}
        variant="signed-in"
        label={translateCurrentStaticSourceText(
          "domains.auth.components.auth.menu.shell",
          "ko",
          "계정 메뉴"
        )}
        initial={initial}
        imageSrc={safeAuthProfileImageSrc(session.user.image)}
      />
    );
  }

  return (
    <AuthMenuTrigger
      {...preloadProps}
      variant="signed-out"
      label={t("nav.login")}
    />
  );
}

export function AuthMenuShell() {
  const { status } = useSession();
  const [enabled, setEnabled] = useState(false);
  const [defaultOpen, setDefaultOpen] = useState(false);
  const [defaultMenuOpen, setDefaultMenuOpen] = useState(false);
  const [defaultMode, setDefaultMode] = useState<"login" | "signup">("login");

  useEffect(
    () =>
      subscribeAuthModalRequests((detail) => {
        if (status === "authenticated") return;
        setDefaultMode(detail.mode ?? "login");
        setDefaultOpen(true);
        setDefaultMenuOpen(false);
        setEnabled(true);
      }),
    [status]
  );

  const openAuth = () => {
    const authenticated = status === "authenticated";
    setDefaultMode("login");
    setDefaultOpen(!authenticated);
    setDefaultMenuOpen(authenticated);
    setEnabled(true);
  };

  if (!enabled) {
    return <AuthMenuFallback onClick={openAuth} />;
  }

  return (
    <Suspense fallback={<AuthMenuFallback onClick={openAuth} />}>
      <AuthMenu
        defaultOpen={defaultOpen}
        defaultMenuOpen={defaultMenuOpen}
        defaultMode={defaultMode}
      />
    </Suspense>
  );
}
