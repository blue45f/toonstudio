import { useEffect, useRef, useState } from "react";

/** void 콜백과 호환되며 Promise 완료·명시적 거절만 확인한다. 외부 저장 확인은 아니다. */
export function useFocusHapticDelivery() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const run = (deliver: () => unknown, commit: () => void): void => {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    const release = (): void => { busy.current = false; if (mounted.current) setPending(false); };
    const fail = (reason: unknown): void => {
      if (mounted.current) setError(reason instanceof Error && reason.message.trim() ? reason.message : "전달을 완료하지 못했습니다. / Delivery failed.");
      release();
    };
    const finish = (receipt: unknown): void => {
      if (typeof receipt === "object" && receipt !== null && "accepted" in receipt && receipt.accepted === false) {
        fail(new Error("message" in receipt && typeof receipt.message === "string" ? receipt.message : "전달이 거절됐습니다. / Delivery declined.")); return;
      }
      if (mounted.current) commit();
      release();
    };
    try {
      const result = deliver();
      if (typeof result === "object" && result !== null && "then" in result && typeof result.then === "function") void Promise.resolve(result).then(finish).catch(fail);
      else finish(result);
    } catch (reason) { fail(reason); }
  };
  return { pending, error, run };
}
