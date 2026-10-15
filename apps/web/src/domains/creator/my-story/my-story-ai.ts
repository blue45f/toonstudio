/**
 * 나레이션 텍스트 AI 보강 — 순수 프롬프트 빌더 · 엄격 파서 · 실패 격리 오케스트레이션.
 *
 * 이 모듈은 네트워크를 모른다. 호출은 주입받은 completer(기본: my-story-ai-client의 기존 무료 우선
 * 클라우드 텍스트 AI 경로)로만 나가고, 사용자가 버튼을 눌렀을 때만 호출된다.
 *
 * 안전 규칙
 * - 보내는 것은 나레이션 후보를 만들 칸의 답변 원문뿐이다(이름·ID·다른 칸은 보내지 않는다).
 * - 응답은 "후보"일 뿐이다. 규칙 기반 초안은 건드리지 않고, 사용자가 컷별로 채택할 때만 바뀐다.
 * - 후보 검증(휴리스틱): 비어 있거나, 상자 한도를 넘거나, 원문에 없던 숫자가 새로 생긴 문장은 버린다.
 *   이는 지어내기를 줄이는 장치일 뿐 보증이 아니다. 채택 여부는 항상 사용자가 정한다.
 * - 어떤 실패(네트워크·로그인·한도·형식 오류)도 throw 하지 않고 값으로 돌려준다.
 */

import type { AiRecoveryCode } from "@/shared/ai/ai-recovery-code";

import type { MyStoryDraft } from "./my-story-draft";
import {
  MY_STORY_TONES,
  pickMyStoryText,
  type MyStoryLocale,
  type MyStorySlotId,
} from "./my-story-model";
import { cleanMyStoryAnswer } from "./my-story-text";

export interface MyStoryTextRequest {
  readonly system: string;
  readonly user: string;
  /** 서버 멱등 키 규격(16자 이상 영숫자·._:-)을 만족하는 요청 식별자. */
  readonly operationId: string;
}

export type MyStoryTextCompletion =
  | { readonly ok: true; readonly data: { readonly content: string } }
  | { readonly ok: false; readonly code: AiRecoveryCode; readonly error: string };

/** 기존 무료 우선 클라우드 텍스트 AI 경로를 감싼 호출자. 테스트에서는 가짜를 주입한다. */
export type MyStoryTextCompleter = (
  request: MyStoryTextRequest,
  signal?: AbortSignal,
) => Promise<MyStoryTextCompletion>;

export interface MyStoryAiTarget {
  readonly cutIndex: number;
  readonly slot: MyStorySlotId;
  readonly roleLabel: string;
  /** 사용자가 쓴 원문(정리만 한 것). */
  readonly source: string;
  readonly maxChars: number;
}

export interface MyStoryAiPrompt {
  readonly system: string;
  readonly user: string;
  readonly targets: readonly MyStoryAiTarget[];
}

export type MyStoryAiRejectReason = "empty" | "too-long" | "new-number" | "unknown-cut";

export interface MyStoryAiCandidate {
  readonly cutIndex: number;
  readonly slot: MyStorySlotId;
  readonly text: string;
}

export type MyStoryAiOutcome =
  | {
    readonly ok: true;
    readonly candidates: readonly MyStoryAiCandidate[];
    readonly rejected: readonly { readonly cutIndex: number; readonly reason: MyStoryAiRejectReason }[];
  }
  | { readonly ok: false; readonly code: AiRecoveryCode; readonly message: string };

/** AI에 보낼 컷: 나레이션 계획이 있고 그 칸에 답이 있는 컷만. 없으면 빈 배열(버튼을 막는다). */
export function myStoryAiTargets(draft: MyStoryDraft, locale: MyStoryLocale): MyStoryAiTarget[] {
  const targets: MyStoryAiTarget[] = [];
  for (const cut of draft.cuts) {
    const narration = cut.narration;
    if (!narration) continue;
    const part = cut.parts.find((entry) => entry.slot === narration.slot);
    if (!part) continue;
    targets.push({
      cutIndex: cut.index,
      slot: narration.slot,
      roleLabel: pickMyStoryText(locale, cut.labelKo, cut.labelEn),
      source: part.text,
      maxChars: narration.maxChars,
    });
  }
  return targets;
}

export function buildMyStoryAiPrompt(draft: MyStoryDraft, locale: MyStoryLocale): MyStoryAiPrompt | null {
  const targets = myStoryAiTargets(draft, locale);
  if (targets.length === 0) return null;
  const tone = MY_STORY_TONES[draft.toneId];
  const system = [
    "당신은 사용자가 직접 쓴 개인 이야기를 웹툰 컷의 나레이션(자막) 한 상자로 다듬는 편집 보조입니다.",
    "반드시 지킬 규칙:",
    "1) 사용자가 쓴 글에 없는 인물, 장소, 시기, 숫자, 사건을 새로 만들지 않습니다.",
    "2) 사용자의 낱말과 말투를 최대한 유지하고, 줄이거나 순서만 다듬습니다. 사용자 글과 같은 언어로 씁니다.",
    "3) 각 나레이션은 그 컷에 적힌 maxChars자 이내로 씁니다.",
    "4) 실명, 연락처, 주소 같은 개인 식별 정보를 쓰지 않습니다.",
    `5) 문체: ${tone.voiceKo}.`,
    '6) JSON 객체 하나만 출력합니다. 형식: {"cuts":[{"index":1,"narration":"..."}]}',
  ].join("\n");
  const user = JSON.stringify({
    cuts: targets.map((target) => ({
      index: target.cutIndex,
      role: target.roleLabel,
      maxChars: target.maxChars,
      source: target.source,
    })),
  });
  return { system, user, targets };
}

function numberRuns(value: string): string[] {
  return value.match(/\d+/gu) ?? [];
}

function extractJsonObject(content: string): unknown {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(content.slice(start, end + 1));
    return parsed;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * 모델 응답 → 검증된 후보. JSON이 아니거나 cuts 배열이 없으면 null(parse_error 처리).
 * 같은 컷 번호가 여러 번 나오면 첫 항목만 쓴다. 원문과 같은 문장은 변화가 없으므로 후보에서 뺀다.
 */
export function parseMyStoryAiResponse(
  content: string,
  targets: readonly MyStoryAiTarget[],
): Extract<MyStoryAiOutcome, { ok: true }> | null {
  const parsed = extractJsonObject(content);
  if (!isRecord(parsed) || !Array.isArray(parsed.cuts)) return null;
  const byIndex = new Map(targets.map((target) => [target.cutIndex, target]));
  const seen = new Set<number>();
  const candidates: MyStoryAiCandidate[] = [];
  const rejected: { cutIndex: number; reason: MyStoryAiRejectReason }[] = [];
  for (const entry of parsed.cuts) {
    if (!isRecord(entry) || typeof entry.index !== "number") continue;
    const cutIndex = entry.index;
    const target = byIndex.get(cutIndex);
    if (!target) {
      rejected.push({ cutIndex, reason: "unknown-cut" });
      continue;
    }
    if (seen.has(cutIndex)) continue;
    seen.add(cutIndex);
    const text = typeof entry.narration === "string" ? cleanMyStoryAnswer(entry.narration) : "";
    if (!text) {
      rejected.push({ cutIndex, reason: "empty" });
      continue;
    }
    if (Array.from(text).length > target.maxChars) {
      rejected.push({ cutIndex, reason: "too-long" });
      continue;
    }
    const knownNumbers = new Set(numberRuns(target.source));
    if (numberRuns(text).some((run) => !knownNumbers.has(run))) {
      rejected.push({ cutIndex, reason: "new-number" });
      continue;
    }
    if (text === cleanMyStoryAnswer(target.source)) continue;
    candidates.push({ cutIndex, slot: target.slot, text });
  }
  return { ok: true, candidates, rejected };
}

/** 서버 멱등 키 규격(영숫자로 시작, 16~128자)을 만족하는 요청 식별자. */
export function createMyStoryOperationId(): string {
  const entropy = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `my-story-${entropy}`.slice(0, 120);
}

export interface RequestMyStoryAiOptions {
  readonly locale: MyStoryLocale;
  readonly complete: MyStoryTextCompleter;
  readonly signal?: AbortSignal;
  readonly createOperationId?: () => string;
}

/** 버튼을 눌렀을 때 한 번 호출한다. 실패해도 예외 없이 결과 값으로 돌려준다. */
export async function requestMyStoryAiNarration(
  draft: MyStoryDraft,
  options: RequestMyStoryAiOptions,
): Promise<MyStoryAiOutcome> {
  const prompt = buildMyStoryAiPrompt(draft, options.locale);
  if (!prompt) {
    return {
      ok: false,
      code: "invalid_input",
      message: pickMyStoryText(
        options.locale,
        "AI로 다듬을 나레이션 답변이 아직 없어요. 질문에 먼저 답해 주세요.",
        "There is no narration answer to polish yet. Answer a question first.",
      ),
    };
  }
  let result: MyStoryTextCompletion;
  try {
    result = await options.complete(
      {
        system: prompt.system,
        user: prompt.user,
        operationId: (options.createOperationId ?? createMyStoryOperationId)(),
      },
      options.signal,
    );
  } catch (error) {
    return {
      ok: false,
      code: "network_error",
      message: error instanceof Error && error.message
        ? error.message
        : pickMyStoryText(options.locale, "AI 요청에 실패했어요.", "The AI request failed."),
    };
  }
  if (!result.ok) return { ok: false, code: result.code, message: result.error };
  const parsed = parseMyStoryAiResponse(result.data.content, prompt.targets);
  if (!parsed) {
    return {
      ok: false,
      code: "parse_error",
      message: pickMyStoryText(
        options.locale,
        "AI 응답 형식을 확인하지 못했어요. 지금 초안은 그대로예요.",
        "The AI response could not be read. Your draft is unchanged.",
      ),
    };
  }
  return parsed;
}
