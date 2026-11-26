import {
  ApprovedDialoguePairSchema,
  parseGroundedDialogueReview,
  type ApprovedDialoguePair,
  type ApprovedDialogueReview,
} from "@toonstudio/contracts/studio-approved-dialogue-review";
import { useEffect, useRef, useState } from "react";

import { withCsrfProtection } from "@/shared/lib/csrf";
import { useI18n } from "@/shared/lib/i18n";
import { useApp } from "@/shared/lib/store";

interface Props extends ApprovedDialoguePair { readonly cutId: string }

const labels = {
  ko: {
    ask: "OpenAI로 대사 의미 비교", pending: "두 대사를 비교하고 있어요.", cancel: "비교 취소",
    retry: "의미 비교 다시 시도", failed: "AI 비교 결과를 확인하지 못했어요. 원문은 위에서 볼 수 있어요.",
    auth: "로그인한 뒤 AI 비교를 사용할 수 있어요.", unconfigured: "서버의 OpenAI 연결이 필요해요.",
    empty: "AI가 근거를 제시한 의미 변화가 없습니다.", size: "AI 비교는 한 버전당 2,000자까지 가능해요.",
    approved: "승인본", current: "수정본", missing: "대사 없음", negation: "부정 표현", deadline: "시한",
    actor: "행동 주체", relationship: "인물 관계", other: "의미 변화",
  },
  en: {
    ask: "Compare dialogue with OpenAI", pending: "Comparing both versions…", cancel: "Cancel comparison",
    retry: "Retry comparison", failed: "The AI comparison could not be verified. Both versions are available above.",
    auth: "Sign in to compare dialogue with AI.", unconfigured: "The server needs an OpenAI connection.",
    empty: "AI returned no changes in meaning with supporting quotes.", size: "AI comparison supports up to 2,000 characters per version.",
    approved: "Approved", current: "Current", missing: "No dialogue", negation: "Negation", deadline: "Deadline",
    actor: "Who acts", relationship: "Relationship", other: "Meaning",
  },
} as const;
type Failure = "auth" | "unconfigured" | "failed";

export function StudioApprovedDialogueReview(props: Props) {
  if (props.approvedDialogue.trim() === props.currentDialogue.trim()) return null;
  return <DialogueReviewRequest key={JSON.stringify([props.cutId, props.approvedDialogue, props.currentDialogue])}
    approvedDialogue={props.approvedDialogue} currentDialogue={props.currentDialogue} />;
}

function DialogueReviewRequest(pair: ApprovedDialoguePair) {
  const copy = useI18n((state) => state.lang === "ko" ? labels.ko : labels.en);
  const [review, setReview] = useState<ApprovedDialogueReview | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, setPending] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  if (!ApprovedDialoguePairSchema.safeParse(pair).success) return <p className="text-sm text-fg-2">{copy.size}</p>;

  function cancel() {
    active.current?.abort();
    active.current = null;
    setPending(false);
  }
  async function compare() {
    if (active.current) return;
    const request = new AbortController();
    active.current = request;
    setPending(true);
    setFailure(null);
    try {
      const token = useApp.getState().sessionToken;
      const response = await fetch("/api/studio-ai/openai-assist/approved-dialogue-review", withCsrfProtection({
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json", ...(token ? { "x-user-id": token } : {}) },
        body: JSON.stringify(pair), signal: AbortSignal.any([request.signal, AbortSignal.timeout(35_000)]),
      }));
      if (request.signal.aborted) return;
      if (!response.ok) {
        setFailure(response.status === 401 ? "auth" : response.status === 503 ? "unconfigured" : "failed");
        return;
      }
      const payload: unknown = await response.json();
      if (request.signal.aborted) return;
      const checked = payload && typeof payload === "object" && "provider" in payload && payload.provider === "openai" && "result" in payload
        ? parseGroundedDialogueReview(pair, payload.result) : null;
      if (checked) setReview(checked);
      else setFailure("failed");
    } catch {
      if (!request.signal.aborted) setFailure("failed");
    } finally {
      if (active.current === request && !request.signal.aborted) {
        active.current = null;
        setPending(false);
      }
    }
  }

  return <div className="min-w-0 space-y-1 text-sm text-fg">
    {!review && <button type="button" className="min-h-11 rounded border border-line px-3 focus-visible:outline"
      onClick={pending ? cancel : () => { void compare(); }}>{pending ? copy.cancel : failure ? copy.retry : copy.ask}</button>}
    <div role="status" aria-live="polite">
      {pending && <p>{copy.pending}</p>}
      {failure && <p>{copy[failure]}</p>}
      {review && (review.findings.length === 0 ? <p>{copy.empty}</p> :
        <ul className="space-y-2">{review.findings.map((finding, index) =>
          <li className="break-words border-l-2 border-line pl-2" key={index}>
            <strong>{copy[finding.kind]}</strong>
            <p>{copy.approved} · {finding.approvedQuote || copy.missing}</p>
            <p>{copy.current} · {finding.currentQuote || copy.missing}</p>
            <p>{finding.explanation}</p>
          </li>,
        )}</ul>)}
    </div>
  </div>;
}
