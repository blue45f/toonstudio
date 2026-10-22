import { Suspense, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";

import { lazyRetry } from "../lib/lazy-retry";
import {
  getPwaInstallServerSnapshot,
  getPwaInstallSnapshot,
  subscribePwaInstall,
} from "../lib/pwa-install-store";
import { supportsPwaInstallPrompts } from "./site-public-routes";

const InstallNudge = lazyRetry(
  () => import("./pwa-install-nudge").then((module) => ({ default: module.PwaInstallNudge })),
  "PwaInstallNudge",
);

/** Keep the install-event subscription eager, but download the UI only when it is usable. */
export function PwaInstallNudgeHost() {
  const { pathname } = useLocation();
  const install = useSyncExternalStore(
    subscribePwaInstall,
    getPwaInstallSnapshot,
    getPwaInstallServerSnapshot,
  );
  // 발표·영상 화면에서는 AppShell 게이트와 이중으로 자체 차단한다.
  if (!supportsPwaInstallPrompts(pathname)) return null;
  if (install.status !== "available") return null;
  return <Suspense fallback={null}><InstallNudge /></Suspense>;
}
