import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { loadAdminIdentity, type AdminIdentity } from "../../platform/http/admin-identity";

type Access = { phase: "checking" | "ready" | "denied"; actor: AdminIdentity | null; error: string };
type AccessControls = { verified: boolean; onUnauthorized: (message: string) => void };

/** 서버가 확인한 계정만 전달하고 계정·역할 변경 시 이전 화면 상태를 분리한다. */
export function AdminAccess({ label, children, adminOnly = false }: {
  label: string;
  adminOnly?: boolean;
  children: (actor: AdminIdentity, controls: AccessControls) => ReactNode;
}) {
  const [access, setAccess] = useState<Access>({ phase: "checking", actor: null, error: "" });
  const [attempt, setAttempt] = useState(0);
  const sequence = useRef(0);
  const identityRequest = useRef<AbortController | null>(null);

  const onUnauthorized = useCallback((message: string) => {
    identityRequest.current?.abort();
    sequence.current += 1;
    setAccess({ phase: "denied", actor: null, error: message });
  }, []);

  useEffect(() => {
    let active = true;
    let controller: AbortController | undefined;
    const check = () => {
      controller?.abort();
      controller = new AbortController();
      identityRequest.current = controller;
      const signal = controller.signal;
      const current = ++sequence.current;
      setAccess((previous) => ({ ...previous, phase: "checking", error: "" }));
      void loadAdminIdentity(signal).then((actor) => {
        if (active && current === sequence.current && !signal.aborted) {
          setAccess(adminOnly && actor.role !== "admin"
            ? { phase: "denied", actor: null, error: "관리자 전용 화면입니다. 운영자 권한으로는 열 수 없습니다." }
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
  }, [adminOnly, attempt]);

  return <section className="admin-quality-access" aria-label={label}>
    {access.phase === "checking" && <p role="status">서버에서 관리자 권한을 확인하고 있습니다.</p>}
    {access.phase === "denied" && <div className="policy-alert" role="alert">
      <p>{access.error}</p>
      <p>권한 확인 전에는 보드와 저장된 기록을 표시하지 않습니다.</p>
      <button type="button" onClick={() => setAttempt((value) => value + 1)}>관리자 권한 다시 확인</button>
    </div>}
    {access.actor && (!adminOnly || access.actor.role === "admin") && <div key={`${access.actor.id}:${access.actor.role}`} hidden={access.phase !== "ready"}>
      {children(access.actor, { verified: access.phase === "ready", onUnauthorized })}
    </div>}
  </section>;
}
