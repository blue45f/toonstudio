import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";

import { CiQualityBoard } from "../../domains/operations/ci-quality/CiQualityBoard";
import { loadAdminIdentity, type AdminIdentity } from "../../platform/http/admin-identity";

type Access = { phase: "checking" | "ready" | "denied"; actor: AdminIdentity | null; error: string };
const CloudWorkBoard = lazy(() => import("../../domains/operations/cloud-work/CloudWorkBoard").then(module => ({ default: module.CloudWorkBoard })));

export function CiQualityAccess({ view = "quality" }: { view?: "quality" | "cloud-work" }) {
  const [access, setAccess] = useState<Access>({ phase: "checking", actor: null, error: "" });
  const [attempt, setAttempt] = useState(0);
  const sequence = useRef(0);

  useEffect(() => {
    let active = true;
    let controller: AbortController | undefined;
    const check = () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const current = ++sequence.current;
      setAccess((previous) => ({ ...previous, phase: "checking", error: "" }));
      void loadAdminIdentity(signal).then((actor) => {
        if (active && current === sequence.current && !signal.aborted) {
          setAccess(view === "cloud-work" && actor.role !== "admin"
            ? { phase: "denied", actor: null, error: "클라우드 작업 보드는 관리자 권한이 필요합니다. 운영자 권한으로는 열 수 없습니다." }
            : { phase: "ready", actor, error: "" });
        }
      }).catch((cause: unknown) => {
        if (active && current === sequence.current && !signal.aborted) {
          setAccess({ phase: "denied", actor: null, error: cause instanceof Error ? cause.message : "관리자 권한 확인에 실패했습니다." });
        }
      });
    };
    const visibilityChanged = () => {
      if (document.visibilityState === "visible") check();
      else {
        controller?.abort();
        sequence.current += 1;
        setAccess((previous) => ({ ...previous, phase: "checking", error: "" }));
      }
    };
    check();
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    window.addEventListener("toonstudio:auth-session-changed", check);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      active = false;
      controller?.abort();
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      window.removeEventListener("toonstudio:auth-session-changed", check);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [attempt, view]);

  const denyCloudAccess = useCallback((error: string) => {
    sequence.current += 1;
    setAccess({ phase: "denied", actor: null, error });
  }, []);

  return <section className="admin-quality-access" aria-label={view === "cloud-work" ? "클라우드 작업 관리자 권한 확인" : "CI·QA 관리자 권한 확인"}>
    {access.phase === "checking" && <p role="status">서버에서 관리자 권한을 확인하고 있습니다.</p>}
    {access.phase === "denied" && <div className="policy-alert" role="alert">
      <p>{access.error}</p>
      <p>권한 확인 전에는 작업 보드와 저장된 기록을 표시하지 않습니다.</p>
      <button type="button" onClick={() => setAttempt((value) => value + 1)}>관리자 권한 다시 확인</button>
    </div>}
    {access.actor && <div hidden={access.phase !== "ready"}>
      {view === "cloud-work" ? access.actor.role === "admin" && <Suspense fallback={<p role="status">클라우드 작업 화면을 불러오고 있습니다.</p>}>
        <CloudWorkBoard key={access.actor.id} onAccessDenied={denyCloudAccess} />
      </Suspense> : <CiQualityBoard key={access.actor.id} userIdentity={access.actor.id} />}
    </div>}
  </section>;
}
