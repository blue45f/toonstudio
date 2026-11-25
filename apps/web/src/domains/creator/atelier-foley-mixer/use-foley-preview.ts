import { useLayoutEffect, useRef, useState } from "react";

import { previewFoleySound, type FoleyDspGraph, type FoleyPreviewKind, type FoleyPreviewResult, type PreviewAudioContextLike } from "./atelier-foley-mixer-engine";

type Phase = "idle" | "preparing" | "playing" | "ended" | "stopped" | "noop" | "error";

/** 한 패널에서는 한 원샷만 재생한다. 닫기·설정 변경은 해당 원샷만 취소한다. */
export function useFoleyPreview(factory: (() => PreviewAudioContextLike | null) | undefined, onResult: (result: FoleyPreviewResult) => void) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<FoleyPreviewResult | null>(null);
  const mounted = useRef(false);
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const previous = useRef<{ graph: FoleyDspGraph; kind: FoleyPreviewKind } | null>(null);
  const latest = useRef({ factory, onResult });
  useLayoutEffect(() => { latest.current = { factory, onResult }; }, [factory, onResult]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);

  async function play(graph: FoleyDspGraph, kind: FoleyPreviewKind): Promise<void> {
    if (pending.current) return;
    pending.current = true; previous.current = { graph, kind };
    const request = new AbortController(); controller.current = request;
    setPhase("preparing"); setResult(null);
    let next: FoleyPreviewResult;
    try {
      next = await previewFoleySound(graph, {
        kind, audioContextFactory: latest.current.factory, signal: request.signal,
        onStarted: () => { if (mounted.current) setPhase("playing"); },
      });
    } catch {
      next = { status: "error-noop", played: false, kind, reason: "audio-error", durationMs: 0, peakDb: -96 };
    } finally {
      pending.current = false; controller.current = null;
    }
    if (!mounted.current) return;
    setResult(next);
    setPhase(next.status === "played" ? "ended" : next.status === "stopped" ? "stopped" : next.status === "muted-noop" ? "noop" : "error");
    latest.current.onResult(next);
  }

  return {
    phase, result, play, isPending: () => pending.current, canRetry: phase === "error" && previous.current !== null,
    stop: () => {
      // 설정·안전장치 변경 뒤 이전 가청 스냅샷을 재생하지 않는다. 결과 알림 재시도와 별개다.
      previous.current = null;
      controller.current?.abort();
      if (!pending.current) { setPhase("idle"); setResult(null); }
    },
    retry: () => { if (previous.current) void play(previous.current.graph, previous.current.kind); },
  };
}
