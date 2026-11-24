import { useEffect, useRef, useState } from "react";

import { FinalSubmissionBoard } from "../../domains/final-submission/FinalSubmissionBoard";
import { loadAdminIdentity, type AdminIdentity } from "../../platform/http/admin-identity";

type Access = { phase: "checking" | "ready" | "denied"; actor: AdminIdentity | null; error: string };

/** 서버에서 활성 관리자임을 확인한 동안에만 제출 점검 자료를 표시한다. */
export function FinalSubmissionAccess() {
  const [access, setAccess] = useState<Access>({ phase: "checking", actor: null, error: "" });
  const [attempt, setAttempt] = useState(0);
  const sequence = useRef(0);

  useEffect(() => {
    let active = true;
    let deniedByBoard = false;
    let controller: AbortController | undefined;
    const check = () => {
      if (deniedByBoard) return;
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const current = ++sequence.current;
      setAccess((previous) => ({ ...previous, phase: "checking", error: "" }));
      void loadAdminIdentity(signal).then((actor) => {
        if (actor.role !== "admin" && actor.role !== "operator") throw new Error("최종 제출 점검은 활성 관리자·운영자가 본인 계정의 기록만 이용할 수 있습니다.");
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
      if (deniedByBoard) return;
      if (document.visibilityState === "visible") check();
      else {
        controller?.abort();
        sequence.current += 1;
        setAccess((previous) => ({ ...previous, phase: "checking" }));
      }
    };
    const boardDenied = () => {
      deniedByBoard = true;
      controller?.abort();
      sequence.current += 1;
      setAccess({ phase: "denied", actor: null, error: "최종 제출 점검 접근 권한을 확인할 수 없습니다. 로그인 상태와 관리자 권한을 다시 확인해 주세요." });
    };
    check();
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    window.addEventListener("toonstudio:auth-session-changed", check);
    window.addEventListener("toonstudio:final-submission-access-denied", boardDenied);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      active = false;
      controller?.abort();
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      window.removeEventListener("toonstudio:auth-session-changed", check);
      window.removeEventListener("toonstudio:final-submission-access-denied", boardDenied);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [attempt]);

  return <section className="admin-final-submission-access" aria-label="최종 제출 점검 관리자 권한 확인">
    {access.phase === "checking" && <p role="status">서버에서 관리자 권한을 확인하고 있습니다.</p>}
    {access.phase === "denied" && <div className="policy-alert" role="alert">
      <p>{access.error}</p>
      <button type="button" onClick={() => setAttempt((value) => value + 1)}>관리자 권한 다시 확인</button>
    </div>}
    {access.actor && <div hidden={access.phase !== "ready"} inert={access.phase !== "ready"}>
      <FinalSubmissionBoard key={`${access.actor.id}:${access.actor.role}`} userIdentity={access.actor.id} />
    </div>}
  </section>;
}
