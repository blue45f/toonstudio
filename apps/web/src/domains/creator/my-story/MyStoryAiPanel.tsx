import { Check, RotateCcw, Sparkles, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AiRecoveryNotice } from "@/shared/ai/AiRecoveryNotice";
import { LoadingState } from "@/shared/components/LoadingState";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  myStoryAiTargets,
  requestMyStoryAiNarration,
  type MyStoryAiOutcome,
  type MyStoryTextCompleter,
} from "./my-story-ai";
import type { MyStoryDraft } from "./my-story-draft";
import { myStorySensitiveKindNames } from "./my-story-labels";
import type { MyStoryLocale, MyStorySlotId } from "./my-story-model";
import { detectMyStorySensitiveKinds, mergeMyStorySensitiveKinds } from "./my-story-text";

export interface MyStoryAiPanelProps {
  readonly draft: MyStoryDraft;
  readonly locale: MyStoryLocale;
  readonly complete: MyStoryTextCompleter;
  readonly onAdopt: (slot: MyStorySlotId, text: string) => void;
  readonly onClear: (slot: MyStorySlotId) => void;
}

type PanelState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "done"; readonly outcome: Extract<MyStoryAiOutcome, { ok: true }> }
  | { readonly status: "error"; readonly outcome: Extract<MyStoryAiOutcome, { ok: false }> };

/**
 * 선택 기능 — 사용자가 버튼을 누를 때만 기존 무료 우선 클라우드 텍스트 AI로 나레이션 문장 후보를 받는다.
 * 후보는 규칙 기반 초안과 나란히 보여 주고, 채택을 눌러야만 초안에 반영된다. 실패해도 초안은 그대로다.
 */
export function MyStoryAiPanel({ draft, locale, complete, onAdopt, onClear }: MyStoryAiPanelProps) {
  const bt = useBilingual("MyStoryAiPanel");
  const [state, setState] = useState<PanelState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);
  const targets = myStoryAiTargets(draft, locale);
  // 답변이 기기 밖으로 나가는 유일한 지점이므로, 보내기 전에 개인 정보처럼 보이는 내용을 한 번 더 알린다(막지는 않는다).
  const sensitiveKinds = mergeMyStorySensitiveKinds(targets.map((target) => detectMyStorySensitiveKinds(target.source)));
  const sensitiveNames = myStorySensitiveKindNames(sensitiveKinds);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function run() {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "loading" });
    const outcome = await requestMyStoryAiNarration(draft, { locale, complete, signal: controller.signal });
    // 취소했거나 새 요청이 시작됐다면 늦게 온 결과는 버린다.
    if (controller.signal.aborted || controllerRef.current !== controller) return;
    setState(outcome.ok ? { status: "done", outcome } : { status: "error", outcome });
  }

  function cancel() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState({ status: "idle" });
  }

  const loading = state.status === "loading";

  return (
    <section aria-labelledby="my-story-ai-title" className="rounded-2xl border border-line bg-panel/40 p-4 sm:p-5">
      <h3 id="my-story-ai-title" className="flex items-center gap-2 text-base font-bold text-fg">
        <Sparkles size={16} aria-hidden className="text-accent" />
        {bt("AI로 나레이션 다듬기 (선택)", "Polish the narration with AI (optional)")}
      </h3>
      <p className="mt-1.5 text-sm leading-6 text-fg-2">
        {bt(
          "누르기 전에는 아무것도 전송되지 않아요. 누르면 나레이션이 될 답변이 무료 우선 클라우드 AI로 전송돼 문장 후보를 받아요. 후보는 따로 보여 주고, 마음에 드는 것만 골라 쓸 수 있어요. 실패해도 지금 초안은 그대로예요.",
          "Nothing is sent before you press the button. When you do, the answers that become narration go to the free-first cloud AI and come back as sentence candidates. Candidates appear separately and only the ones you pick are used. If it fails, your draft stays as it is.",
        )}
      </p>

      {sensitiveKinds.length > 0 ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs leading-5 text-fg">
          <TriangleAlert size={14} aria-hidden className="mt-0.5 shrink-0 text-warn" />
          <span>
            {bt(
              `보낼 내용에 개인 정보처럼 보이는 것이 있어요 (${sensitiveNames.ko}). 누르기 전에 질문으로 돌아가 지우거나 호칭으로 바꿔 주세요.`,
              `The content to send looks like it contains personal information (${sensitiveNames.en}). Before you press the button, go back to the questions and remove it or use a title instead.`,
            )}
          </span>
        </p>
      ) : null}

      {targets.length > 0 ? (
        <details className="mt-3 text-xs text-fg-2">
          <summary className="min-h-11 cursor-pointer py-2.5 font-semibold text-fg">
            {bt("보낼 내용 미리 보기", "Preview what will be sent")}
          </summary>
          <ul className="mt-1 space-y-1.5">
            {targets.map((target) => (
              <li key={target.cutIndex} className="rounded-lg bg-raised/60 px-3 py-2 leading-5">
                <span className="font-semibold text-fg">
                  {bt(`컷 ${target.cutIndex} · ${target.roleLabel}`, `Panel ${target.cutIndex} · ${target.roleLabel}`)}
                </span>
                {": "}
                {target.source}
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="mt-3 text-sm text-fg-2">
          {bt(
            "AI로 다듬을 나레이션 답변이 아직 없어요. 질문에 먼저 답해 주세요.",
            "There is no narration answer to polish yet. Answer a question first.",
          )}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading || targets.length === 0}
          className={buttonClass({ variant: "outline", size: "md", className: "min-h-11 gap-1.5" })}
        >
          <Sparkles size={15} aria-hidden />
          {state.status === "done" || state.status === "error"
            ? bt("다시 다듬기", "Polish again")
            : bt("AI로 다듬기", "Polish with AI")}
        </button>
        {loading ? (
          <button
            type="button"
            onClick={cancel}
            className={buttonClass({ variant: "quiet", size: "md", className: "min-h-11 gap-1.5" })}
          >
            <X size={15} aria-hidden />
            {bt("취소", "Cancel")}
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-3">
          <LoadingState
            variant="skeleton"
            label={bt("AI가 나레이션 문장을 다듬는 중이에요…", "The AI is polishing the narration…")}
          />
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="mt-3 space-y-2">
          <AiRecoveryNotice
            code={state.outcome.code}
            message={state.outcome.message}
            onRetry={() => void run()}
          />
          <p className="text-xs text-fg-3">{bt("지금 초안은 그대로예요.", "Your draft is unchanged.")}</p>
        </div>
      ) : null}

      {state.status === "done" ? (
        <div className="mt-3 space-y-3">
          {state.outcome.candidates.length === 0 ? (
            <p role="status" className="rounded-xl border border-line bg-raised/40 p-3 text-sm text-fg-2">
              {bt(
                "쓸 만한 AI 문장이 나오지 않았어요. 지금 초안은 그대로예요.",
                "No usable AI sentences came back. Your draft is unchanged.",
              )}
            </p>
          ) : (
            <ul className="space-y-2" aria-label={bt("AI 문장 후보", "AI sentence candidates")}>
              {state.outcome.candidates.map((candidate) => {
                const cut = draft.cuts.find((entry) => entry.index === candidate.cutIndex);
                const adopted = cut?.narration?.source === "ai" && cut.narration.text === candidate.text;
                const current = adopted
                  ? cut.parts.find((part) => part.slot === candidate.slot)?.text ?? ""
                  : cut?.narration?.text ?? "";
                return (
                  <li key={candidate.cutIndex} className="rounded-xl border border-line bg-panel p-3">
                    <p className="text-xs font-semibold text-fg-3">
                      {cut
                        ? bt(`컷 ${cut.index} · ${cut.labelKo}`, `Panel ${cut.index} · ${cut.labelEn}`)
                        : bt(`컷 ${candidate.cutIndex}`, `Panel ${candidate.cutIndex}`)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-fg-3">
                      {bt("내 답변", "My answer")}: {current}
                    </p>
                    <p className="mt-1 text-sm font-semibold leading-6 text-fg">
                      {bt("AI 후보", "AI candidate")}: {candidate.text}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {adopted ? (
                        <>
                          <span className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-accent">
                            <Check size={14} aria-hidden />
                            {bt("AI 문장 사용 중", "Using the AI sentence")}
                          </span>
                          <button
                            type="button"
                            onClick={() => onClear(candidate.slot)}
                            className={buttonClass({ variant: "quiet", size: "sm", className: "min-h-11 gap-1.5" })}
                          >
                            <RotateCcw size={13} aria-hidden />
                            {bt("내 답변으로 되돌리기", "Back to my answer")}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onAdopt(candidate.slot, candidate.text)}
                          className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })}
                        >
                          <Check size={13} aria-hidden />
                          {bt("이 문장 쓰기", "Use this sentence")}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {state.outcome.rejected.length > 0 ? (
            <p className="text-xs leading-5 text-fg-3">
              {bt(
                `AI 문장 ${state.outcome.rejected.length}개는 원문에 없는 숫자가 생기거나 길이를 넘어 제외했어요.`,
                `${state.outcome.rejected.length} AI sentence(s) were left out because they added numbers not in your text or ran too long.`,
              )}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
