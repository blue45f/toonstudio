import { useLayoutEffect, useRef, useState } from "react";
import { playDryMediaFoleyPreview, type DryMediaAudioContextLike, type FoleyPreviewPlayResult } from "./drymedia-audio-preview";
import type { DryMediaFoleyFrame } from "./drymedia-crayon-audio-engine";

/** 입력 변경·닫기 시 이전 원샷을 취소하며 실패한 현재 입력만 다시 시연한다. */
export function useDryMediaPreview(frame: DryMediaFoleyFrame, factory: (() => DryMediaAudioContextLike | null) | undefined, onResult: (value: FoleyPreviewPlayResult) => void) {
  const [phase, setPhase] = useState<"idle" | "preparing" | "playing" | "ended" | "error">("idle");
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const previous = useRef<DryMediaFoleyFrame | null>(null);
  const latest = useRef({ frame, factory, onResult });
  const mounted = useRef(false);
  useLayoutEffect(() => { latest.current = { frame, factory, onResult }; }, [frame, factory, onResult]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);
  useLayoutEffect(() => {
    previous.current = null; controller.current?.abort(); setPhase("idle");
  }, [frame]);
  async function play(value: DryMediaFoleyFrame): Promise<void> {
    if (pending.current) return;
    pending.current = true; previous.current = value;
    const request = new AbortController(); controller.current = request;
    setPhase("preparing");
    try {
      const result = await playDryMediaFoleyPreview(value, { audioContextFactory: latest.current.factory, signal: request.signal,
        onStarted: () => { if (mounted.current && !request.signal.aborted) setPhase("playing"); } });
      if (!mounted.current || request.signal.aborted || latest.current.frame !== value) return;
      setPhase(result.played ? "ended" : result.reason === "muted" ? "idle" : "error");
      latest.current.onResult(result);
    } finally { pending.current = false; if (controller.current === request) controller.current = null; }
  }
  return { phase, isPending: () => pending.current, canRetry: phase === "error" && previous.current === frame,
    play: () => { void play(frame); }, retry: () => { if (previous.current === frame) void play(frame); },
    stop: () => { previous.current = null; controller.current?.abort(); setPhase("idle"); } };
}
