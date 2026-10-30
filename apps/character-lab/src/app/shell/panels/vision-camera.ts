import { useCallback, useEffect, useRef, useState } from "react";

import { failVisible, isLabFailure } from "../../../contracts";

import type { LabFailure } from "../../../contracts";

/** 사용자 클릭으로만 권한을 요청한다. 늦게 열린 스트림도 소유권을 잃었으면 즉시 닫는다. */
export function useVisionCamera(open: (() => Promise<MediaStream>) | undefined, report: (failure: LabFailure) => void, beforeClose: () => void) {
  const [state, setState] = useState<{ stream: MediaStream | null; failure: LabFailure | null; opening: boolean }>({ stream: null, failure: null, opening: false });
  const stream = useRef<MediaStream | null>(null);
  const epoch = useRef(0);
  const mounted = useRef(true);
  const detach = useRef<() => void>(() => undefined);
  const reportRef = useRef(report); reportRef.current = report;
  const beforeCloseRef = useRef(beforeClose); beforeCloseRef.current = beforeClose;
  const close = useCallback(() => {
    beforeCloseRef.current();
    epoch.current += 1;
    detach.current(); detach.current = () => undefined;
    const current = stream.current; stream.current = null;
    current?.getTracks().forEach((track) => track.stop());
    if (mounted.current) setState({ stream: null, failure: null, opening: false });
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; close(); };
  }, [close]);
  const start = useCallback(async () => {
    if (!open || stream.current) return;
    const generation = ++epoch.current;
    setState({ stream: null, failure: null, opening: true });
    try {
      const next = await open();
      if (!mounted.current || generation !== epoch.current) { next.getTracks().forEach((track) => track.stop()); return; }
      stream.current = next;
      const ended = () => close();
      next.getTracks().forEach((track) => track.addEventListener?.("ended", ended));
      detach.current = () => next.getTracks().forEach((track) => track.removeEventListener?.("ended", ended));
      setState({ stream: next, failure: null, opening: false });
    } catch (error) {
      if (!mounted.current || generation !== epoch.current) return;
      const failure = isLabFailure(error) ? error : failVisible("vision-camera-failed", "카메라를 열지 못했습니다(권한 거부 또는 장치 없음).", error);
      setState({ stream: null, failure, opening: false });
      reportRef.current(failure);
    }
  }, [close, open]);
  const fail = useCallback((failure: LabFailure, expected: MediaStream) => {
    if (stream.current !== expected || !mounted.current) return;
    close();
    setState({ stream: null, failure, opening: false });
    reportRef.current(failure);
  }, [close]);
  return { ...state, open: start, close, fail };
}
