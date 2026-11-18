import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { loadAdminIdentity, type AdminIdentity } from "../../platform/http/admin-identity";

type Access = { phase: "checking" | "ready" | "denied"; actor: AdminIdentity | null; error: string };

/** 서버가 확인한 계정만 전달하고 계정·역할 변경 시 이전 화면 상태를 분리한다. */
export function AdminAccess({ label, authorize, children }: {
  label: string;
  authorize?: (actor: AdminIdentity) => string | null;
  children: (actor: AdminIdentity, access: { verified: boolean; deny: (error: string) => void }) => ReactNode;
}) {
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
          const error = authorize?.(actor);
          setAccess(error ? { phase: "denied", actor: null, error } : { phase: "ready", actor, error: "" });
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
  }, [attempt, authorize]);

  const deny = useCallback((error: string) => {
    sequence.current += 1;
    setAccess({ phase: "denied", actor: null, error });
  }, []);

  return <section className="admin-quality-access" aria-label={label}>
    {access.phase === "checking" && <p role="status">서버에서 관리자 권한을 확인하고 있습니다.</p>}
    {access.phase === "denied" && <div className="policy-alert" role="alert">
      <p>{access.error}</p>
      <p>권한 확인 전에는 보드와 저장된 기록을 표시하지 않습니다.</p>
      <button type="button" onClick={() => setAttempt((value) => value + 1)}>관리자 권한 다시 확인</button>
    </div>}
    {access.actor && <div key={`${access.actor.id}:${access.actor.role}`} hidden={access.phase !== "ready"}>
      {children(access.actor, { verified: access.phase === "ready", deny })}
    </div>}
  </section>;
}
