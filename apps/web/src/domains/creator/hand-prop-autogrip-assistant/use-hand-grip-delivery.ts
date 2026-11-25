import { useEffect, useRef, useState } from "react";

export interface HandGripReceipt { readonly accepted: boolean; readonly message?: string; }
export type HandGripCallbackResult = void | HandGripReceipt | Promise<void | HandGripReceipt>;

/** 콜백 완료만 확인한다. 실제 장면 변경이나 저장의 영수증으로 해석하지 않는다. */
export function useHandGripDelivery() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const run = (deliver: () => unknown, commit: () => void): void => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    const release = (): void => { busy.current = false; if (mounted.current) setPending(false); };
    const fail = (reason: unknown): void => {
      if (mounted.current) setError(reason instanceof Error && reason.message.trim() ? reason.message : "요청을 완료하지 못했습니다. / Request failed.");
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
