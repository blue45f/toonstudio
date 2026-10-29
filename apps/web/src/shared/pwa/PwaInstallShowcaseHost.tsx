import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { useLocation } from "react-router-dom";

import { supportsPwaInstallPrompts } from "@/shared/components/site-public-routes";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { getPwaInstallSnapshot } from "@/shared/lib/pwa-install-store";

import {
  createBrowserPwaShowcaseScheduler,
  PWA_INSTALL_SHOWCASE_OPEN_EVENT,
} from "./pwa-install-showcase-schedule";

interface DialogProps {
  readonly onClose: () => void;
  readonly onInstalled: () => void;
  readonly trigger: "visit-count" | "offline-detected" | "manual" | null;
}

function DeferredShowcase({ open, ...props }: DialogProps & { readonly open: boolean }) {
  const bt = useBilingual("PwaInstallShowcaseHost");
  const [Dialog, setDialog] = useState<ComponentType<DialogProps> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [requested, setRequested] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);

  useEffect(() => {
    const syncConnection = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) setFailed(false);
    };
    window.addEventListener("online", syncConnection);
    window.addEventListener("offline", syncConnection);
    return () => {
      window.removeEventListener("online", syncConnection);
      window.removeEventListener("offline", syncConnection);
    };
  }, []);

  useEffect(() => {
    if (!open || !online || Dialog) return;
    let cancelled = false;
    // 비필수 설치 안내의 청크 실패는 현재 원고의 전역 새로고침으로 전파하지 않는다.
    import("./PwaInstallShowcase").then(
      (module) => {
        if (!cancelled) setDialog(() => module.PwaInstallShowcase);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => { cancelled = true; };
  }, [open, online, Dialog, attempt]);

  const close = () => {
    setRequested(false);
    props.onClose();
  };
  if (!open) return null;
  if (Dialog && (props.trigger !== "offline-detected" || requested)) {
    return <Dialog {...props} onClose={close} onInstalled={() => { setRequested(false); props.onInstalled(); }} />;
  }
  const offline = !online && !Dialog;
  return (
    <aside role={failed ? "alert" : "status"} aria-label={bt("앱 설치 안내", "App installation guide")}
      className="fixed bottom-4 right-4 z-40 w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-line bg-panel p-4 text-sm text-fg shadow-xl">
      <p className="font-bold">{failed
        ? bt("설치 안내를 불러오지 못했어요.", "The installation guide could not be loaded.")
        : offline ? bt("연결이 돌아오면 설치 안내를 불러올게요.", "The installation guide will load when you reconnect.")
          : Dialog ? bt("설치 안내를 열 수 있어요.", "The installation guide is ready.")
            : bt("설치 안내를 불러오는 중…", "Loading the installation guide…")}</p>
      <p className="mt-2 text-xs leading-5 text-fg-2">{bt(
        "현재 작업 화면은 그대로 사용할 수 있어요. 설치 안내는 작업을 마친 뒤 확인해도 됩니다.",
        "Your current work surface remains available. You can check the installation guide after finishing your work.",
      )}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {Dialog ? <button type="button" className={buttonClass({ variant: "outline", className: "min-h-11" })}
          onClick={() => setRequested(true)}>{bt("설치 안내 보기", "Open installation guide")}</button>
          : failed || offline ? <button type="button" disabled={!online}
            className={buttonClass({ variant: "outline", className: "min-h-11" })}
            onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}>
            {bt("다시 시도", "Try again")}
          </button> : null}
        <button type="button" className={buttonClass({ variant: "ghost", className: "min-h-11" })} onClick={close}>
          {bt("설치 안내 닫기", "Close installation guide")}
        </button>
      </div>
    </aside>
  );
}

const AUTO_OPEN_DELAY_MS = 1_800;

/**
 * 설치 쇼케이스를 "적절한 순간"에 보여주는 호스트.
 * - 3번째 방문 이후 (스케줄러 규칙)
 * - 오프라인 감지 시 (별도 쿨다운)
 * - `toonstudio:open-install-showcase` 이벤트 (설정 메뉴 등에서 수동 호출)
 *
 * 이미 설치된 상태(standalone)에서는 절대 열지 않는다.
 * 발표·영상 화면(supportsPwaInstallPrompts 제외 경로)에서는 AppShell 게이트와
 * 이중으로 자체 차단해 자동·수동·오프라인 어떤 경로로도 열지 않는다.
 */
export function PwaInstallShowcaseHost() {
  const { pathname } = useLocation();
  const promptsBlocked = !supportsPwaInstallPrompts(pathname);
  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState<DialogProps["trigger"]>(null);
  const schedulerRef = useRef<ReturnType<typeof createBrowserPwaShowcaseScheduler> | null>(null);

  const scheduler = useCallback(() => {
    if (!schedulerRef.current) schedulerRef.current = createBrowserPwaShowcaseScheduler();
    return schedulerRef.current;
  }, []);

  const close = useCallback(() => {
    scheduler().recordDismissed();
    setOpen(false);
  }, [scheduler]);

  const handleInstalled = useCallback(() => {
    scheduler().recordInstalled();
    setOpen(false);
  }, [scheduler]);

  useEffect(() => {
    if (promptsBlocked) return;
    if (typeof window === "undefined") return;
    const snapshot = getPwaInstallSnapshot();
    if (snapshot.standalone || snapshot.status === "installed") return;

    const visit = scheduler().recordVisit();
    let timer: number | undefined;
    if (visit.shouldPrompt) {
      timer = window.setTimeout(() => {
        setTrigger(visit.trigger);
        setOpen(true);
      }, AUTO_OPEN_DELAY_MS);
    }

    const onManualOpen = () => {
      setTrigger("manual");
      setOpen(true);
    };
    const onOffline = () => {
      if (scheduler().recordOfflineDetected()) {
        setTrigger("offline-detected");
        setOpen(true);
      }
    };
    window.addEventListener(PWA_INSTALL_SHOWCASE_OPEN_EVENT, onManualOpen);
    window.addEventListener("offline", onOffline);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(PWA_INSTALL_SHOWCASE_OPEN_EVENT, onManualOpen);
      window.removeEventListener("offline", onOffline);
    };
  }, [scheduler, promptsBlocked]);

  if (promptsBlocked) return null;
  return <DeferredShowcase open={open} onClose={close} onInstalled={handleInstalled} trigger={trigger} />;
}
