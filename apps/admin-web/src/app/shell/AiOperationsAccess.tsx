import { useEffect, useRef, useState } from "react";

import { AiOperationsBoard } from "../../domains/operations/ai-operations/AiOperationsBoard";
import { loadAdminIdentity } from "../../platform/http/admin-identity";

import type { AdminIdentity } from "../../platform/http/admin-identity";

type Access = { phase: "checking" | "ready" | "denied"; actor: AdminIdentity | null; error: string };
export function AiOperationsAccess() {
  const [access, setAccess] = useState<Access>({ phase: "checking", actor: null, error: "" });
  const [retry, setRetry] = useState(0); const sequence = useRef(0);
  useEffect(() => {
    let active = true; let request: AbortController | undefined;
    const check = () => {
      request?.abort(); request = new AbortController(); const signal = request.signal; const current = ++sequence.current;
      setAccess((previous) => ({ ...previous, phase: "checking", error: "" }));
      void loadAdminIdentity(signal).then((actor) => { if (active && !signal.aborted && current === sequence.current) setAccess({ phase: "ready", actor, error: "" }); }).catch((cause: unknown) => { if (active && !signal.aborted && current === sequence.current) setAccess({ phase: "denied", actor: null, error: cause instanceof Error ? cause.message : "관리자 권한을 확인할 수 없습니다." }); });
    };
    const visibility = () => { if (document.visibilityState === "visible") check(); else { request?.abort(); sequence.current += 1; setAccess((previous) => ({ ...previous, phase: "checking", error: "" })); } };
    check(); window.addEventListener("focus", check); window.addEventListener("online", check); window.addEventListener("toonstudio:auth-session-changed", check); document.addEventListener("visibilitychange", visibility);
    return () => { active = false; request?.abort(); sequence.current += 1; window.removeEventListener("focus", check); window.removeEventListener("online", check); window.removeEventListener("toonstudio:auth-session-changed", check); document.removeEventListener("visibilitychange", visibility); };
  }, [retry]);
  return <section className="ai-ops-access" aria-label="AI·무료 운영 관리자 권한 확인">
    {access.phase === "checking" && <p role="status">서버에서 관리자 권한을 확인하고 있습니다.</p>}
    {access.phase === "denied" && <div className="policy-alert" role="alert"><p>{access.error}</p><p>권한 확인에 실패하여 운영 보드와 기록을 표시하지 않습니다.</p><button type="button" onClick={() => setRetry((value) => value + 1)}>관리자 권한 다시 확인</button></div>}
    {access.actor && <AiOperationsBoard key={`${access.actor.id}:${access.actor.role}`} userIdentity={access.actor.id} authorized={access.phase === "ready"} />}
  </section>;
}
