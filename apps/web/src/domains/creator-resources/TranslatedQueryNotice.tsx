import { useEffect, useState } from "react";

import { RESOURCE_BUTTON, RESOURCE_INPUT } from "./navigation";

import type { TranslatedResearchQuery } from "./use-translated-research-query";

/**
 * 변환 투명성 안내 + 변환어 직접 수정 UI.
 * 변환이 일어나지 않은 검색(영문 입력·한글 네이티브 제공처)에서는 아무것도 그리지 않는다.
 * `onApplyOverride`를 주면 "다시 검색"이 페이지의 재검색까지 이어진다
 * (훅이 fetch를 직접 구동하지 않는 표면용 — 예: OpenCreationPage).
 */
export function TranslatedQueryNotice({
  state,
  onApplyOverride,
}: {
  state: TranslatedResearchQuery;
  onApplyOverride?: (value: string) => void;
}) {
  const { translation, overridden, modelPending } = state;
  const [draft, setDraft] = useState(translation.effectiveQuery);

  useEffect(() => {
    setDraft(translation.effectiveQuery);
  }, [translation.effectiveQuery]);

  if (translation.source === "not-needed" && !overridden) return null;
  if (!translation.original) return null;

  const sourceLabel = translation.source === "model"
    ? "브라우저 번역 모델"
    : translation.source === "dictionary"
      ? "내장 용어 사전"
      : "원문";

  return (
    <section aria-label="검색어 변환 안내" className="space-y-2 rounded-xl border border-line bg-panel p-3">
      <p role="status" className="text-sm leading-6 text-fg-2">
        {translation.source === "original"
          ? <>한글 검색어를 영어로 바꾸지 못해 <strong className="text-fg">‘{translation.original}’</strong> 원문으로 검색합니다. 아래에서 영문 검색어를 직접 입력할 수 있습니다.</>
          : <>‘{translation.original}’ → <strong className="text-fg">‘{translation.effectiveQuery}’</strong>(으)로 검색 중입니다. <span className="text-fg-3">변환 방식: {sourceLabel}</span></>}
        {overridden && <span className="text-fg-3"> · 직접 고친 검색어입니다.</span>}
      </p>
      {translation.unresolved.length > 0 && translation.source === "dictionary" && (
        <p className="text-xs leading-5 text-fg-3">
          사전에 없는 표현 ‘{translation.unresolved.join(", ")}’은(는) 원문 그대로 함께 검색합니다.
        </p>
      )}
      {modelPending && (
        <p className="text-xs leading-5 text-fg-3">번역 모델을 불러와 더 정확한 영문 검색어를 만드는 중입니다…</p>
      )}
      {translation.source === "model" && (
        <p className="text-xs leading-5 text-fg-3">
          번역 모델: Helsinki-NLP opus-mt-ko-en(Apache-2.0) — 브라우저 안에서만 실행되며 검색어를 서버로 보내지 않습니다.
        </p>
      )}
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          state.applyOverride(draft);
          onApplyOverride?.(draft);
        }}
      >
        <label className="flex-1 text-sm text-fg-2">
          검색어 직접 수정
          <input
            className={RESOURCE_INPUT}
            type="text"
            value={draft}
            maxLength={80}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="실제로 검색할 영문 검색어"
          />
        </label>
        <div className="flex gap-2">
          <button type="submit" className={RESOURCE_BUTTON}>이 검색어로 다시 검색</button>
          {overridden && (
            <button type="button" className={RESOURCE_BUTTON} onClick={() => state.clearOverride()}>
              자동 변환으로 되돌리기
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
