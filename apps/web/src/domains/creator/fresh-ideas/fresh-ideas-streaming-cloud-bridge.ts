/**
 * Fresh Ideas v2.2 Streaming Cloud AI & Deterministic Fallback Bridge.
 * Supports progressive chunk streaming with AbortController cancellation and live @unslop sanitization.
 */

import {
  expandLensToChannelDraft,
  localizeKoreanEditorialCopy,
  type ExpandedChannelDraftV2,
} from "./fresh-ideas-channels-localization";
import type { KoreanSpeechRegister, TargetChannelId } from "./fresh-ideas-contracts";
import type { FreshIdeaLensCardV2 } from "./fresh-ideas-lenses-engine";

export type StreamStageId = "deconstruct" | "hook" | "body" | "objection" | "cta" | "complete";

export interface FreshIdeasStreamChunk {
  readonly stage: StreamStageId;
  readonly deltaText: string;
  readonly accumulatedText: string;
  readonly progressPct: number;
  readonly source: "cloud-sse" | "local-deterministic";
}

export interface FreshIdeasStreamRequest {
  readonly lens: FreshIdeaLensCardV2;
  readonly channelId: TargetChannelId;
  readonly registerOverride?: KoreanSpeechRegister;
  readonly cloudEndpointUrl?: string;
  readonly signal?: AbortSignal;
  readonly chunkDelayMs?: number;
}

export interface FreshIdeasStreamSummary {
  readonly completed: boolean;
  readonly cancelled: boolean;
  readonly source: "cloud-sse" | "local-deterministic";
  readonly finalText: string;
  readonly chunkCount: number;
  readonly draft: ExpandedChannelDraftV2;
}

function sanitizeStreamToken(raw: string, register: KoreanSpeechRegister): string {
  const withoutEmoji = raw.replace(/[🔥📖📊✅🎯💡✨🚀🎉]/gu, "");
  return localizeKoreanEditorialCopy(withoutEmoji, { register });
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function* streamFreshIdeasRemixDraft(
  request: FreshIdeasStreamRequest,
): AsyncGenerator<FreshIdeasStreamChunk, FreshIdeasStreamSummary, void> {
  const draft = expandLensToChannelDraft(request.lens, request.channelId, {
    registerOverride: request.registerOverride,
  });
  const register = draft.register;
  let accumulated = "";
  let chunkCount = 0;

  if (request.signal?.aborted) {
    return {
      completed: false,
      cancelled: true,
      source: "local-deterministic",
      finalText: "",
      chunkCount: 0,
      draft,
    };
  }

  if (request.cloudEndpointUrl && typeof fetch === "function") {
    try {
      const response = await fetch(request.cloudEndpointUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({
          lensId: request.lens.id,
          channelId: request.channelId,
          headlineKo: request.lens.headlineKo,
          angleKo: request.lens.angleKo,
        }),
        signal: request.signal,
      });

      if (response.ok && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;
              const cleaned = sanitizeStreamToken(payload, register);
              accumulated = accumulated ? `${accumulated}\n${cleaned}` : cleaned;
              chunkCount += 1;
              yield {
                stage: "body",
                deltaText: cleaned,
                accumulatedText: accumulated,
                progressPct: Math.min(95, 15 + chunkCount * 15),
                source: "cloud-sse",
              };
            }
          }
          if (accumulated.length > 0) {
            return {
              completed: true,
              cancelled: false,
              source: "cloud-sse",
              finalText: accumulated,
              chunkCount,
              draft,
            };
          }
        } finally {
          reader.releaseLock();
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return {
          completed: false,
          cancelled: true,
          source: "cloud-sse",
          finalText: accumulated,
          chunkCount,
          draft,
        };
      }
    }
  }

  const stages: readonly { readonly stage: StreamStageId; readonly text: string; readonly pct: number }[] = [
    { stage: "hook", text: `[제목] ${draft.headlineVariants.directThesisKo}`, pct: 25 },
    { stage: "body", text: draft.bodySectionsKo.join("\n\n"), pct: 65 },
    { stage: "objection", text: `[예상 반박 대응] ${draft.preemptiveObjectionKo}`, pct: 85 },
    { stage: "cta", text: `[마무리 제안] ${draft.closingCtaKo}`, pct: 100 },
  ];

  const delayMs = request.chunkDelayMs ?? 0;
  for (const item of stages) {
    try {
      await sleepWithAbort(delayMs, request.signal);
    } catch {
      return {
        completed: false,
        cancelled: true,
        source: "local-deterministic",
        finalText: accumulated,
        chunkCount,
        draft,
      };
    }
    const cleaned = sanitizeStreamToken(item.text, register);
    accumulated = accumulated ? `${accumulated}\n\n${cleaned}` : cleaned;
    chunkCount += 1;
    yield {
      stage: item.stage,
      deltaText: cleaned,
      accumulatedText: accumulated,
      progressPct: item.pct,
      source: "local-deterministic",
    };
  }

  return {
    completed: true,
    cancelled: false,
    source: "local-deterministic",
    finalText: accumulated,
    chunkCount,
    draft,
  };
}
