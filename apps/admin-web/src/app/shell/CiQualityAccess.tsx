import { useEffect, useRef, useState } from "react";

import { CiQualityBoard } from "../../domains/operations/ci-quality/CiQualityBoard";
import { loadAdminIdentity, type AdminIdentity } from "../../platform/http/admin-identity";

type Access = { phase: "checking" | "ready" | "denied"; actor: AdminIdentity | null; error: string };

export function CiQualityAccess() {
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
          setAccess({ phase: "ready", actor, error: "" });
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
  }, [attempt]);

  return <section className="admin-quality-access" aria-label="CI·QA 관리자 권한 확인">
    {access.phase === "checking" && <p role="status">서버에서 관리자 권한을 확인하고 있습니다.</p>}
    {access.phase === "denied" && <div className="policy-alert" role="alert">
      <p>{access.error}</p>
      <p>권한 확인 전에는 검증 보드와 로컬 기록을 표시하지 않습니다.</p>
      <button type="button" onClick={() => setAttempt((value) => value + 1)}>관리자 권한 다시 확인</button>
    </div>}
    {access.actor && <div hidden={access.phase !== "ready"}>
      <CiQualityBoard key={access.actor.id} userIdentity={access.actor.id} />
    </div>}
  </section>;
}
