import { useId, useRef, useState } from "react";

import {
  buildPromoCutDrafts,
  movePromoCutDraft,
  PROMO_CAPTION_LIMIT,
  promoPanelsFromCutDrafts,
  readPromoDocumentCutBundle,
  selectedPromoCutCount,
  setPromoCutDraftCandidate,
  setPromoCutDraftCaption,
  togglePromoCutDraft,
  type PromoCutApplyMode,
  type PromoCutDraft,
  type PromoDocumentCutBundle,
} from "./promo-document-cuts";
import { promoMaxPanels } from "./promo-model";

import type { PromoPanel, PromoProject } from "./promo-model";

import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";

type Phase = "idle" | "reading" | "ready" | "error";

/**
 * Studio 문서에서 컷 가져오기 — 컷 묶음(JSON)을 읽어 읽기 순서의 샷 초안을 보여 주고, 사용자가 컷 선택·자막 후보·순서를
 * 확인하고 고친 뒤에만 프로젝트에 적용한다. 이미지에서 컷을 찾는 자동 감지는 하지 않는다(문서의 프레임만 쓴다).
 */
export function PromoDocumentCuts({ project, disabled, onApply }: {
  project: PromoProject;
  disabled: boolean;
  /** 적용할 컷 목록과 안내 문구. 호출자가 실행 취소 가능한 한 번의 변경으로 반영한다. */
  onApply: (panels: PromoPanel[], summary: string) => void;
}) {
  const bt = useBilingual("PromoDocumentCuts");
  const idPrefix = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  // 다시 시도에 쓸 마지막 파일. 화면에 그려지는 값이라 ref가 아니라 state로 둔다.
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [bundle, setBundle] = useState<PromoDocumentCutBundle | null>(null);
  const [drafts, setDrafts] = useState<PromoCutDraft[]>([]);
  const [mode, setMode] = useState<PromoCutApplyMode>(project.panels.length ? "append" : "replace");
  const [applyError, setApplyError] = useState("");

  const maxPanels = promoMaxPanels(project.seconds);
  const capacity = mode === "append" ? Math.max(0, maxPanels - project.panels.length) : maxPanels;
  const selected = selectedPromoCutCount(drafts);
  const busy = disabled || phase === "reading";

  const read = async (file: File) => {
    setLastFile(file);
    setPhase("reading");
    setError("");
    setApplyError("");
    try {
      const loaded = await readPromoDocumentCutBundle(file);
      const initialMode: PromoCutApplyMode = project.panels.length ? "append" : "replace";
      const initialCapacity = initialMode === "append" ? Math.max(0, maxPanels - project.panels.length) : maxPanels;
      setBundle(loaded);
      setFileName(file.name);
      setMode(initialMode);
      setDrafts(buildPromoCutDrafts(loaded, initialCapacity));
      setPhase("ready");
    } catch (reason) {
      setBundle(null);
      setDrafts([]);
      setError(reason instanceof Error ? reason.message : bt("컷 묶음을 읽지 못했어요.", "Could not read the cut bundle."));
      setPhase("error");
    }
  };
  const close = () => {
    setLastFile(null);
    setPhase("idle");
    setBundle(null);
    setDrafts([]);
    setError("");
    setApplyError("");
    setFileName("");
  };
  const changeMode = (next: PromoCutApplyMode) => {
    setMode(next);
    setApplyError("");
    // 모드가 바뀌면 담을 수 있는 컷 수가 달라진다. 선택이 넘치면 앞에서부터 상한까지만 남긴다.
    const nextCapacity = next === "append" ? Math.max(0, maxPanels - project.panels.length) : maxPanels;
    setDrafts((current) => {
      let kept = 0;
      return current.map((draft) => {
        if (!draft.include) return draft;
        kept += 1;
        return kept > nextCapacity ? { ...draft, include: false } : draft;
      });
    });
  };
  const apply = () => {
    const result = promoPanelsFromCutDrafts(drafts, project, mode);
    if (!result.ok) {
      setApplyError(result.message);
      return;
    }
    onApply(result.panels, formatI18nTemplate(
      bt(
        "Studio 문서의 컷 {count}개를 읽기 순서대로 {mode}했어요. 자막과 상대 길이는 아래 컷 목록에서 더 고칠 수 있어요. 실행 취소로 되돌릴 수 있어요.",
        "Added {count} document cuts in reading order ({mode}). Fine-tune captions and timing in the cut list below. Undo restores the previous state.",
      ),
      { count: result.added, mode: mode === "append" ? bt("뒤에 추가", "appended") : bt("교체", "replaced") },
    ));
    close();
  };

  const headingId = `${idPrefix}-title`;
  const statusId = `${idPrefix}-status`;
  const fileId = `${idPrefix}-file`;
  return (
    <section className="promo-subcard promo-document-cuts" aria-labelledby={headingId} aria-busy={phase === "reading"}>
      <h3 id={headingId}>{bt("Studio 문서에서 컷 가져오기", "Import cuts from a Studio document")}</h3>
      <p className="promo-muted">
        {bt(
          "Studio 내보내기 메뉴의 「홍보 쇼츠용 컷 묶음」으로 저장한 JSON을 불러오면, 문서의 컷(프레임)을 읽기 순서대로 샷 초안으로 만들고 말풍선 텍스트에서 자막 후보를 뽑아요. 적용하기 전에 컷과 자막을 확인하고 고칠 수 있어요.",
          "Load the JSON saved with “Promo cut bundle” in Studio's export menu. Document frames become shot drafts in reading order, with caption candidates taken from balloon text. You can review and edit them before applying.",
        )}
      </p>
      <label htmlFor={fileId}>{bt("컷 묶음 JSON", "Cut bundle JSON")}</label>
      <input
        id={fileId}
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        disabled={busy}
        aria-describedby={statusId}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void read(file);
        }}
      />
      <div id={statusId} role="status" aria-live="polite">
        {phase === "idle" ? <p className="promo-muted">{bt("아직 불러온 컷 묶음이 없어요. 이미지에서 컷을 찾아 주지는 않고, 문서에 그려 둔 프레임만 가져와요.", "No cut bundle loaded yet. This reads frames drawn in the document; it does not detect panels in images.")}</p> : null}
        {phase === "reading" ? <p className="promo-notice" data-tone="info">{bt("컷 묶음을 읽고 검사하는 중이에요…", "Reading and validating the cut bundle…")}</p> : null}
      </div>
      {phase === "error" ? (
        <div className="promo-notice" data-tone="error" role="alert">
          <p>{error}</p>
          <div className="promo-button-row">
            <button type="button" disabled={busy || !lastFile} onClick={() => { if (lastFile) void read(lastFile); }}>{bt("다시 시도", "Try again")}</button>
            <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>{bt("다른 파일 선택", "Choose another file")}</button>
          </div>
        </div>
      ) : null}
      {phase === "ready" && bundle && !drafts.length ? (
        <div className="promo-notice" data-tone="warn">
          <p>{bt("이 묶음에는 컷이 없어요. Studio에서 프레임(컷)을 만든 페이지를 포함해 다시 내보내 주세요.", "This bundle has no cuts. Export again with pages that contain frames.")}</p>
          <button type="button" disabled={busy} onClick={close}>{bt("닫기", "Close")}</button>
        </div>
      ) : null}
      {phase === "ready" && bundle && drafts.length ? (
        <>
          <p className="promo-muted">
            {formatI18nTemplate(bt("{file} · 컷 {count}개 · 문서 읽기 순서", "{file} · {count} cuts · document reading order"), { file: fileName, count: drafts.length })}
            {bundle.title ? ` · ${bundle.title}` : ""}
          </p>
          <p className="promo-muted">{bt("컷 이미지에는 말풍선이 그려진 채로 들어 있어요. 영상 자막이 말풍선과 겹쳐 보이면 영상 자막을 비워 두세요.", "Balloons are drawn inside each cut image. Leave the video caption empty if it would repeat the balloon.")}</p>
          <fieldset className="promo-subcard-options">
            <legend>{bt("적용 방식", "How to apply")}</legend>
            <label className="promo-toggle">
              <input type="radio" name={`${idPrefix}-mode`} checked={mode === "replace"} disabled={busy} onChange={() => changeMode("replace")} />
              {bt("현재 컷 교체", "Replace current cuts")}
            </label>
            <label className="promo-toggle">
              <input type="radio" name={`${idPrefix}-mode`} checked={mode === "append"} disabled={busy || !project.panels.length} onChange={() => changeMode("append")} />
              {bt("현재 컷 뒤에 추가", "Append after current cuts")}
            </label>
          </fieldset>
          <p className="promo-muted" role="status">
            {formatI18nTemplate(bt("선택 {selected} / 최대 {capacity}컷 · {seconds}초 영상은 컷을 {max}개까지 담아요.", "Selected {selected} / up to {capacity} · a {seconds}s video holds {max} cuts."), { selected, capacity, seconds: project.seconds, max: maxPanels })}
          </p>
          <ol className="promo-cut-drafts" aria-label={bt("샷 초안 목록", "Shot drafts")}>
            {drafts.map((draft, index) => {
              const cutId = `${idPrefix}-cut-${index}`;
              const full = !draft.include && selected >= capacity;
              return (
                <li key={draft.cut.id}>
                  <fieldset className="promo-cut-draft" data-included={draft.include}>
                    <legend>{formatI18nTemplate(bt("읽기 순서 {order} · 페이지 {page}", "Reading order {order} · page {page}"), { order: index + 1, page: draft.cut.pageIndex + 1 })}</legend>
                    <img className="promo-cut-thumb" src={draft.cut.image} alt={formatI18nTemplate(bt("컷 {order} 미리보기 (페이지 {page})", "Cut {order} preview (page {page})"), { order: index + 1, page: draft.cut.pageIndex + 1 })} />
                    <div className="promo-cut-fields">
                      <label className="promo-toggle" htmlFor={`${cutId}-include`}>
                        <input id={`${cutId}-include`} type="checkbox" checked={draft.include} disabled={busy || full} onChange={(event) => setDrafts((current) => togglePromoCutDraft(current, draft.cut.id, event.target.checked, capacity))} />
                        {bt("이 컷을 샷으로 사용", "Use this cut as a shot")}
                      </label>
                      {full ? <p className="promo-muted">{bt("상한에 도달했어요. 다른 컷을 해제하면 선택할 수 있어요.", "Limit reached. Deselect another cut to select this one.")}</p> : null}
                      {draft.candidates.length ? (
                        <>
                          <label htmlFor={`${cutId}-candidate`}>{bt("자막 후보", "Caption candidates")}</label>
                          <select id={`${cutId}-candidate`} value={draft.candidateId ?? ""} disabled={busy || !draft.include} onChange={(event) => { if (event.target.value) setDrafts((current) => setPromoCutDraftCandidate(current, draft.cut.id, event.target.value)); }}>
                            {draft.candidateId === null ? <option value="">{bt("직접 입력한 자막", "Custom caption")}</option> : null}
                            {draft.candidates.map((candidate, candidateIndex) => (
                              <option key={candidate.id} value={candidate.id}>
                                {candidate.kind === "all"
                                  ? formatI18nTemplate(bt("모든 말풍선 이어 붙이기 · {text}", "All balloons joined · {text}"), { text: candidate.text })
                                  : formatI18nTemplate(bt("말풍선 {n} · {text}", "Balloon {n} · {text}"), { n: candidateIndex + 1, text: candidate.text })}
                              </option>
                            ))}
                          </select>
                        </>
                      ) : <p className="promo-muted">{bt("이 컷에는 자막으로 쓸 말풍선 텍스트가 없어요. 자막 없이 보여 주거나 직접 입력하세요.", "No usable balloon text in this cut. Show it without a caption or type one.")}</p>}
                      <label htmlFor={`${cutId}-caption`}>{bt("영상 자막", "Video caption")}</label>
                      <input id={`${cutId}-caption`} value={draft.caption} maxLength={PROMO_CAPTION_LIMIT} disabled={busy || !draft.include} onChange={(event) => setDrafts((current) => setPromoCutDraftCaption(current, draft.cut.id, event.target.value))} />
                      {draft.candidates.some((candidate) => candidate.truncated && candidate.id === draft.candidateId)
                        ? <p className="promo-muted">{formatI18nTemplate(bt("말풍선이 {limit}자를 넘어 줄여 담았어요. 필요하면 고쳐 주세요.", "The balloon exceeded {limit} characters and was shortened. Edit if needed."), { limit: PROMO_CAPTION_LIMIT })}</p> : null}
                      <p className="promo-muted">{formatI18nTemplate(bt("문서 말풍선 {count}개", "{count} document balloons"), { count: draft.cut.dialogues.length })}</p>
                      <div className="promo-shot-actions">
                        <button type="button" aria-label={formatI18nTemplate(bt("컷 {order} 앞으로 이동", "Move cut {order} earlier"), { order: index + 1 })} disabled={busy || index === 0} onClick={() => setDrafts((current) => movePromoCutDraft(current, draft.cut.id, -1))}>{bt("앞으로", "Earlier")}</button>
                        <button type="button" aria-label={formatI18nTemplate(bt("컷 {order} 뒤로 이동", "Move cut {order} later"), { order: index + 1 })} disabled={busy || index === drafts.length - 1} onClick={() => setDrafts((current) => movePromoCutDraft(current, draft.cut.id, 1))}>{bt("뒤로", "Later")}</button>
                      </div>
                    </div>
                  </fieldset>
                </li>
              );
            })}
          </ol>
          {applyError ? <p className="promo-notice" data-tone="error" role="alert">{applyError}</p> : null}
          <div className="promo-button-row">
            <button type="button" className="promo-primary" disabled={busy || selected === 0} onClick={apply}>
              {formatI18nTemplate(bt("선택한 컷 {count}개 적용", "Apply {count} selected cuts"), { count: selected })}
            </button>
            <button type="button" disabled={busy} onClick={close}>{bt("취소", "Cancel")}</button>
          </div>
        </>
      ) : null}
    </section>
  );
}
