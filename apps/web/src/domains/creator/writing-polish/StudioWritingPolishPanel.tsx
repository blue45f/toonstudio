import { useMemo, useState } from "react";

import {
  applyWritingPolishSuggestion,
  applyWritingPolishSuggestions,
  diffWritingWords,
  suggestWritingPolish,
  summarizeWritingPolish,
  WRITING_POLISH_RULE_LABELS,
  type WritingPolishDocument,
  type WritingPolishSuggestion,
} from "./studio-writing-polish";
import {
  polishWithProvider,
  type WritingPolishProvider,
} from "./studio-writing-polish-provider";

/**
 * 글 고도화 제안 패널 — 시놉시스·대사 문장을 문장 단위로 다듬어 제안한다.
 *
 * 동선: 문서 목록(호스트가 시놉시스/대사 블록을 넘김) → 문장별 원문/제안
 * 비교(뺀 말은 취소선, 넣은 말은 강조) → [이 제안 적용]은 그 문장만,
 * [이 글 모두 적용]은 문서 단위 일괄 → 적용은 전부 onApplyDocument 로
 * 호스트에 새 텍스트를 넘긴다(패널은 저장소를 직접 만지지 않는다).
 * [무시]는 세션 상태로만 제외한다 — 저장 데이터에 흔적을 남기지 않는다.
 * 제안은 선택지라는 안내를 상시 표기하고, 자동 적용은 어디에도 없다.
 * 기본은 로컬 규칙 제공자(동기·비용 없음). 원격 제공자는 호스트가 provider
 * prop 으로 주입하며, 실패하면 폴백 사실을 문구로 드러낸다.
 */

const BUTTON =
  "min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50";

export function StudioWritingPolishPanel({
  documents,
  provider,
  onApplyDocument,
}: {
  readonly documents: readonly WritingPolishDocument[];
  /** 미지정 시 로컬 규칙으로 즉시 제안한다. 지정 시 [표현 제안 받기]로 비동기 조회. */
  readonly provider?: WritingPolishProvider;
  /** 제안 적용 결과 — 호스트가 해당 문서 텍스트를 이 값으로 교체·저장한다. */
  readonly onApplyDocument: (documentId: string, nextText: string) => void;
}) {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [remote, setRemote] = useState<{
    readonly key: string;
    readonly suggestions: readonly WritingPolishSuggestion[];
    readonly usedFallback: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const docKey = useMemo(
    () => documents.map((doc) => `${doc.id}:${doc.text.length}:${doc.text.slice(0, 24)}`).join("|"),
    [documents],
  );
  const localSuggestions = useMemo(() => suggestWritingPolish(documents), [documents]);
  const effective =
    provider && remote && remote.key === docKey ? remote.suggestions : provider ? null : localSuggestions;
  const visible = (effective ?? []).filter((suggestion) => !dismissed.has(suggestion.id));
  const summary = useMemo(() => summarizeWritingPolish(documents, visible), [documents, visible]);

  const fetchRemote = async () => {
    if (!provider || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const outcome = await polishWithProvider(provider, { documents });
      setRemote({ key: docKey, suggestions: outcome.suggestions, usedFallback: outcome.usedFallback });
      if (outcome.usedFallback) setNotice("기본 다듬기(규칙 기반)로 제안했어요.");
    } finally {
      setBusy(false);
    }
  };

  const applyOne = (suggestion: WritingPolishSuggestion) => {
    const doc = documents.find((candidate) => candidate.id === suggestion.documentId);
    if (!doc) return;
    const next = applyWritingPolishSuggestion(doc.text, suggestion);
    if (next === doc.text) {
      setNotice("원문이 바뀌어 이 제안을 적용할 수 없어요. 제안을 새로 받아 주세요.");
      return;
    }
    onApplyDocument(doc.id, next);
    // 적용된 제안이 원격 목록에 남아 있으면 같은 id 를 무시 목록에도 넣어 숨긴다.
    setDismissed((prev) => new Set(prev).add(suggestion.id));
  };

  const applyAllForDocument = (doc: WritingPolishDocument) => {
    const mine = visible.filter((suggestion) => suggestion.documentId === doc.id);
    if (mine.length === 0) return;
    const next = applyWritingPolishSuggestions(doc.text, mine);
    if (next !== doc.text) onApplyDocument(doc.id, next);
    setDismissed((prev) => {
      const nextSet = new Set(prev);
      for (const suggestion of mine) nextSet.add(suggestion.id);
      return nextSet;
    });
  };

  return (
    <section aria-label="글 고도화 제안" className="flex flex-col gap-3">
      <header className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-fg">글 다듬기 제안</h2>
        <p className="text-xs text-fg-3">
          맞춤법이 아니라 표현을 다듬는 제안이에요. 제안은 선택지예요 — 적용을 눌러야만 글이 바뀝니다.
        </p>
      </header>

      {provider && (
        <div>
          <button type="button" className={BUTTON} disabled={busy} onClick={() => void fetchRemote()}>
            {busy ? "제안을 받는 중…" : "표현 제안 받기"}
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="text-xs text-fg-3">
          {notice}
        </p>
      )}

      {effective === null && !busy && (
        <p className="text-xs text-fg-3">[표현 제안 받기]를 누르면 문장별 제안을 보여 드려요.</p>
      )}
      {effective !== null && visible.length === 0 && (
        <p className="text-xs text-fg-3">지금 글에서는 다듬을 곳을 찾지 못했어요. 잘 쓰인 글이에요.</p>
      )}
      {visible.length > 0 && (
        <p className="text-xs text-fg-3">
          제안 {summary.suggestionCount}개 · 모두 적용하면 {summary.totalCharsSaved}자 줄어요.
        </p>
      )}

      {documents.map((doc) => {
        const mine = visible.filter((suggestion) => suggestion.documentId === doc.id);
        if (mine.length === 0) return null;
        return (
          <section key={doc.id} aria-label={doc.label} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-fg-2">{doc.label}</h3>
              {mine.length > 1 && (
                <button type="button" className={BUTTON} onClick={() => applyAllForDocument(doc)}>
                  이 글 모두 적용
                </button>
              )}
            </div>
            <ul className="flex flex-col gap-2">
              {mine.map((suggestion) => (
                <li
                  key={suggestion.id}
                  className="flex flex-col gap-2 rounded-lg border border-line bg-panel/50 p-3"
                >
                  <p className="flex flex-wrap gap-1">
                    {suggestion.ruleIds.map((ruleId) => (
                      <span
                        key={ruleId}
                        className="rounded-full border border-line px-2 py-0.5 text-[0.65rem] text-fg-3"
                      >
                        {WRITING_POLISH_RULE_LABELS[ruleId]}
                      </span>
                    ))}
                    <span className="text-[0.65rem] text-fg-3">
                      {suggestion.sentenceIndex + 1}번째 문장
                      {suggestion.charDelta < 0 ? ` · ${-suggestion.charDelta}자 줄어요` : ""}
                    </span>
                  </p>
                  <div className="flex flex-col gap-1 text-sm leading-relaxed">
                    <p aria-label="원문" className="text-fg-3">
                      <span className="mr-1 font-semibold">원문</span>
                      {suggestion.original || "(빈 문장)"}
                    </p>
                    <p aria-label="제안" className="text-fg">
                      <span className="mr-1 font-semibold">제안</span>
                      {suggestion.suggested === "" ? (
                        "(이 문장 빼기)"
                      ) : (
                        <DiffLine original={suggestion.original} suggested={suggestion.suggested} />
                      )}
                    </p>
                  </div>
                  <p className="text-xs text-fg-3">{suggestion.reason}</p>
                  <div className="flex gap-2">
                    <button type="button" className={BUTTON} onClick={() => applyOne(suggestion)}>
                      이 제안 적용
                    </button>
                    <button
                      type="button"
                      className={BUTTON}
                      onClick={() => setDismissed((prev) => new Set(prev).add(suggestion.id))}
                    >
                      무시
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </section>
  );
}

function DiffLine({ original, suggested }: { readonly original: string; readonly suggested: string }) {
  const segments = diffWritingWords(original, suggested);
  return (
    <>
      {segments.map((segment, index) =>
        segment.type === "same" ? (
          <span key={index}>{segment.text}</span>
        ) : segment.type === "added" ? (
          <mark key={index} className="bg-accent/20 text-fg">
            {segment.text}
          </mark>
        ) : null,
      )}
    </>
  );
}

/** 원문 쪽에서 빠지는 말을 보여 주는 보조 줄 — 패널 테스트·접근성용으로 분리. */
export function WritingPolishRemovedLine({
  original,
  suggested,
}: {
  readonly original: string;
  readonly suggested: string;
}) {
  const segments = diffWritingWords(original, suggested);
  return (
    <p aria-label="빠지는 말">
      {segments
        .filter((segment) => segment.type === "removed")
        .map((segment, index) => (
          <del key={index}>{segment.text}</del>
        ))}
    </p>
  );
}
