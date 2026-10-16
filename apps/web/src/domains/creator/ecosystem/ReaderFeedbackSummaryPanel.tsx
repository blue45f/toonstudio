import { AlertTriangle, ClipboardPaste, FileUp, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useId, useMemo, useReducer, useRef, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";

import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { ReaderFeedbackGroupView } from "./ReaderFeedbackGroupView";
import { RF_BUTTON, RF_CONTROL, RF_PRIMARY } from "./reader-feedback-copy";
import { createExampleReaderFeedback } from "./reader-feedback-example";
import { countText, cutRangeText, groupLabel, meanText, scrollRangeText, type Localize } from "./reader-feedback-format";
import { loadHiddenResponseIds, saveHiddenResponseIds, toggleHiddenResponseId } from "./reader-feedback-hidden";
import {
  INITIAL_PANEL_STATE,
  importReaderFeedbackSources,
  limitSources,
  panelReducer,
  pastedSource,
  type ImportReport,
  type ImportSource,
} from "./reader-feedback-import";
import { READER_FEEDBACK_LIMITS } from "./reader-feedback-schema";
import { SAMPLE_LEVEL_THRESHOLDS, peakBins, showsPercent, summarizeReaderFeedback } from "./reader-feedback-summary";

const LIMITS = READER_FEEDBACK_LIMITS;

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function failureText(bt: Localize, report: ImportReport): string {
  switch (report.code) {
    case "empty": return bt("빈 파일이에요.", "The file is empty.");
    case "too-large": return formatI18nTemplate(bt("파일이 너무 커요. 한 파일은 {kb}KB까지 가져올 수 있어요.", "The file is too large. One file can be up to {kb} KB."), { kb: Math.round(LIMITS.maxFileBytes / 1024) });
    case "read-failed": return bt("파일을 읽지 못했어요. 다시 시도해 보세요.", "Couldn't read the file. Try again.");
    case "not-json": return bt("JSON 형식이 아니에요.", "This isn't valid JSON.");
    case "too-deep":
    case "too-many-nodes": return bt("구조가 너무 복잡해서 열지 않았어요.", "The structure is too complex, so it wasn't opened.");
    case "forbidden-key": return bt("허용되지 않는 항목이 들어 있어 열지 않았어요.", "It contains a disallowed key, so it wasn't opened.");
    case "legacy-beta-feedback": return bt("이전 '검토 응답' 형식이에요. 위쪽 '응답 가져오기'로 가져와 주세요.", "This is the older 'review response' format. Import it with 'Import responses' above.");
    case "newer-version":
    case "unsupported-version": return bt("이 화면이 모르는 버전의 파일이에요.", "This file version isn't supported here.");
    case "invalid": return report.path
      ? formatI18nTemplate(bt("파일 내용이 형식에 맞지 않아요. 확인할 곳: {path}", "The file content doesn't match the format. Check: {path}"), { path: report.path })
      : bt("파일 내용이 형식에 맞지 않아요.", "The file content doesn't match the format.");
    default: return bt("독자 피드백 파일이 아니에요.", "This isn't a reader feedback file.");
  }
}

/** 작가용 요약. 응답 파일을 여러 개 합쳐 회차별로 보여 주며, 가져온 내용은 이 화면의 메모리에만 둔다. */
export function ReaderFeedbackSummaryPanel() {
  const bt = useBilingual("ReaderFeedback");
  const uid = useId();
  const [state, dispatch] = useReducer(panelReducer, INITIAL_PANEL_STATE);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => loadHiddenResponseIds(browserStorage()));
  const [hiddenNotSaved, setHiddenNotSaved] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const nextReportId = useRef(1);
  const retryFiles = useRef(new Map<number, File>());

  const groups = useMemo(() => summarizeReaderFeedback(state.responses, hidden), [state.responses, hidden]);
  const selected = groups.find((group) => group.key === state.selectedKey) ?? groups[0] ?? null;
  const loading = state.pending > 0;
  const failedReports = state.reports.filter((report) => report.status === "failed");

  const runImport = async (sources: readonly ImportSource[], files: readonly (File | null)[], skippedFiles: number) => {
    const firstId = nextReportId.current;
    nextReportId.current += sources.length;
    files.forEach((file, index) => { if (file) retryFiles.current.set(firstId + index, file); });
    dispatch({ type: "loading" });
    const outcome = await importReaderFeedbackSources(sources, firstId);
    dispatch({ type: "imported", outcome, skippedFiles });
  };

  const onFilesChosen = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (picked.length === 0) return;
    const { kept, skipped } = limitSources(picked);
    void runImport(kept.map((file) => ({ name: file.name, size: file.size, source: "file" as const, text: () => file.text() })), kept, skipped);
  };

  const retry = async (report: ImportReport) => {
    const file = retryFiles.current.get(report.id);
    if (!file) return;
    dispatch({ type: "loading" });
    const outcome = await importReaderFeedbackSources([{ name: file.name, size: file.size, source: "file", text: () => file.text() }], report.id);
    dispatch({ type: "retried", outcome });
  };

  const importPasted = () => {
    void runImport([pastedSource(pasteText, bt("붙여넣은 내용", "Pasted text"))], [null], 0);
  };

  const loadExample = () => {
    const responses = createExampleReaderFeedback();
    const id = nextReportId.current;
    nextReportId.current += 1;
    dispatch({ type: "loading" });
    dispatch({
      type: "imported",
      skippedFiles: 0,
      outcome: { reports: [{ id, name: bt("체험용 예시 응답", "Example responses"), source: "example", status: "ok", code: null, path: null, accepted: responses.length, retryable: false }], incoming: responses },
    });
  };

  const toggleHidden = (id: string) => {
    const next = toggleHiddenResponseId(hidden, id);
    setHidden(next);
    setHiddenNotSaved(!saveHiddenResponseIds(browserStorage(), next));
  };

  const merge = state.lastMerge;
  const statusParts = [
    merge ? formatI18nTemplate(bt("응답 {added}개 추가 · {updated}개 갱신 · 중복 {duplicates}개 제외", "{added} added · {updated} updated · {duplicates} duplicates skipped"), { added: merge.added, updated: merge.updated, duplicates: merge.duplicates }) : "",
    merge && merge.overflow > 0 ? formatI18nTemplate(bt("총 {max}개 상한 때문에 {n}개는 받지 못했어요.", "{n} not added because of the {max}-response limit."), { max: LIMITS.maxTotalResponses, n: merge.overflow }) : "",
    state.skippedFiles > 0 ? formatI18nTemplate(bt("한 번에 {max}개 파일까지만 읽어 {n}개는 건너뛰었어요.", "Only {max} files are read at once; {n} were skipped."), { max: LIMITS.maxFiles, n: state.skippedFiles }) : "",
    failedReports.length > 0 ? formatI18nTemplate(bt("열지 못한 파일 {n}개", "{n} files couldn't be opened"), { n: failedReports.length }) : "",
  ].filter(Boolean);

  return (
    <section aria-labelledby={`${uid}-heading`} className="mt-8 border-t border-line pt-8">
      <h3 id={`${uid}-heading`} className="text-xl font-black text-fg">{bt("회차별 독자 피드백 요약", "Reader feedback summary by episode")}</h3>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">
        {bt(
          "독자가 내보낸 응답 파일을 여러 개 한꺼번에 가져와 합칩니다. 같은 응답은 한 번만 세요. 가져온 내용은 이 화면에서만 쓰고 서버로 보내거나 저장하지 않아요.",
          "Import response files from many readers at once. The same response is counted only once. Imported data stays on this screen — it is neither uploaded nor stored.",
        )}
      </p>

      <aside aria-label={bt("해석할 때 주의할 점", "Cautions when reading the results")} className="mt-4 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm leading-6 text-fg">
        <p className="flex items-center gap-2 font-black"><AlertTriangle size={16} aria-hidden /> {bt("읽기 전에", "Before you read")}</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>{bt("파일을 보내 준 독자만의 응답이에요(자체 선택). 읽은 사람 전체를 대표하지 않아요.", "These are only readers who chose to send a file (self-selected). They don't represent everyone who read it.")}</li>
          <li>{bt("끝까지 읽지 않은 독자는 응답하지 않았을 수 있어서, 멈춘 곳이 실제보다 적게 보일 수 있어요.", "Readers who didn't finish may not have responded, so drop-off can look smaller than it is.")}</li>
          <li>{formatI18nTemplate(bt("응답이 적으면 평균과 분포는 한두 명에 좌우돼요. 비율(%)은 그 질문에 답한 사람이 {n}명 이상일 때만 보여 줘요.", "With few responses, averages hinge on one or two readers. A percentage appears only when at least {n} readers answered that question."), { n: SAMPLE_LEVEL_THRESHOLDS.percentFrom })}</li>
          <li>{bt("파일은 누구나 만들거나 고칠 수 있고 닉네임은 신원 확인이 아니에요.", "Anyone can create or edit a file, and a nickname doesn't verify identity.")}</li>
        </ul>
      </aside>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className={`${RF_PRIMARY} cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent`}>
          <FileUp size={16} aria-hidden /> {bt("응답 파일 선택 (여러 개 가능)", "Choose response files (multiple)")}
          <input className="sr-only" type="file" multiple accept="application/json,.json" onChange={onFilesChosen} />
        </label>
        <button type="button" className={RF_BUTTON} aria-expanded={pasteOpen} aria-controls={`${uid}-paste`} onClick={() => setPasteOpen((open) => !open)}>
          <ClipboardPaste size={16} aria-hidden /> {bt("붙여넣어 가져오기", "Paste to import")}
        </button>
        {state.responses.length === 0 ? (
          <button type="button" className={RF_BUTTON} onClick={loadExample}><Sparkles size={16} aria-hidden /> {bt("예시 응답으로 체험하기", "Try with example responses")}</button>
        ) : (
          <button type="button" className={RF_BUTTON} onClick={() => dispatch({ type: "clear" })}><Trash2 size={16} aria-hidden /> {bt("가져온 응답 비우기", "Clear imported responses")}</button>
        )}
      </div>
      <p className="mt-1 text-xs text-fg-3">
        {formatI18nTemplate(bt("파일 하나는 {kb}KB, 한 번에 {files}개까지, 합쳐서 {total}개 응답까지 가져와요.", "Up to {kb} KB per file, {files} files at a time, {total} responses in total."), { kb: Math.round(LIMITS.maxFileBytes / 1024), files: LIMITS.maxFiles, total: LIMITS.maxTotalResponses })}
      </p>

      {pasteOpen ? (
        <div id={`${uid}-paste`} className="mt-3">
          <label htmlFor={`${uid}-paste-text`} className="text-sm font-bold text-fg">{bt("독자가 복사해 보낸 응답 내용", "Response text a reader copied to you")}</label>
          <textarea id={`${uid}-paste-text`} className={`${RF_CONTROL} mt-1 font-mono text-xs`} rows={6} value={pasteText} spellCheck={false} onChange={(event) => setPasteText(event.target.value)} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={RF_BUTTON} disabled={pasteText.trim() === "" || loading} onClick={importPasted}>{bt("붙여넣은 내용 가져오기", "Import pasted text")}</button>
            <button type="button" className={RF_BUTTON} disabled={pasteText === ""} onClick={() => setPasteText("")}>{bt("입력 지우기", "Clear input")}</button>
          </div>
        </div>
      ) : null}

      <p role="status" aria-live="polite" className="mt-3 min-h-6 text-sm text-fg-2">{statusParts.join(" · ")}</p>

      {loading ? (
        <div role="status" aria-busy="true" className="mt-3 space-y-2" aria-label={bt("파일을 읽는 중", "Reading files")}>
          <p className="text-sm font-bold text-fg-2">{bt("파일을 읽는 중…", "Reading files…")}</p>
          {[0, 1, 2].map((row) => <div key={row} className="h-4 animate-pulse rounded bg-raised motion-reduce:animate-none" style={{ width: `${90 - row * 18}%` }} />)}
        </div>
      ) : null}

      {state.reports.length > 0 ? (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-black text-fg">{bt("가져오기 결과", "Import results")}</h4>
            <button type="button" className={RF_BUTTON} onClick={() => dispatch({ type: "dismiss-reports" })}>{bt("결과 닫기", "Dismiss")}</button>
          </div>
          <ul className="mt-2 space-y-2">
            {state.reports.map((report) => (
              <li key={report.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-sm first:border-t-0 first:pt-0">
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <strong className="text-fg">{report.name}</strong>{" "}
                  {report.status === "ok"
                    ? <span className="text-fg-2">{formatI18nTemplate(bt("응답 {n}개를 읽었어요.", "Read {n} responses."), { n: report.accepted })}</span>
                    : <span className="font-bold text-bad">{failureText(bt, report)}</span>}
                </span>
                {report.retryable ? (
                  <button type="button" className={RF_BUTTON} disabled={loading} onClick={() => void retry(report)}><RefreshCw size={15} aria-hidden /> {bt("다시 시도", "Retry")}</button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.responses.length === 0 && !loading ? (
        <div className="mt-6 border-t border-line pt-6">
          <h4 className="text-sm font-black text-fg">{bt("아직 가져온 응답이 없어요", "No responses imported yet")}</h4>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-fg-2">
            <li>
              {bt("독자에게 패키지 파일을 보내고 독자용 화면(/studio/ecosystem/viewer)을 알려 주세요.", "Send readers the package file and point them to the reader screen (/studio/ecosystem/viewer).")}{" "}
              <Link to="/studio/ecosystem/viewer" className="font-bold text-accent underline underline-offset-2">{bt("독자용 화면 열기", "Open the reader screen")}</Link>
            </li>
            <li>{bt("독자가 폼을 작성하고 저장한 .json 파일(또는 복사한 내용)을 보내 줘요.", "Readers fill in the form and send you the saved .json file (or the copied text).")}</li>
            <li>{bt("여기서 파일을 여러 개 한꺼번에 고르면 합쳐서 회차별로 보여 드려요.", "Pick many files here at once and they are merged and shown per episode.")}</li>
          </ol>
          <p className="mt-2 text-sm text-fg-3">{bt("먼저 어떻게 보이는지 궁금하면 '예시 응답으로 체험하기'를 눌러 보세요. 예시는 실제 독자 응답이 아니에요.", "Curious how it looks? Press 'Try with example responses'. The examples aren't real reader responses.")}</p>
        </div>
      ) : null}

      {selected ? (
        <div className="mt-6 space-y-6">
          {groups.length > 1 ? (
            <div>
              <h4 className="text-sm font-black text-fg">{bt("회차 비교", "Compare episodes")}</h4>
              <div className="mt-2 max-h-72 overflow-auto">
                <table className="w-full min-w-[34rem] text-left text-sm">
                  <caption className="sr-only">{bt("회차별 응답 수와 평균. 회차 이름을 누르면 아래에 자세한 요약이 나와요.", "Responses and averages per episode. Select an episode name to see its details below.")}</caption>
                  <thead>
                    <tr className="text-xs text-fg-3">
                      <th scope="col" className="py-1 pr-3 font-bold">{bt("회차", "Episode")}</th>
                      <th scope="col" className="py-1 pr-3 text-right font-bold">{bt("응답", "Responses")}</th>
                      <th scope="col" className="py-1 pr-3 text-right font-bold">{bt("재미", "Fun")}</th>
                      <th scope="col" className="py-1 pr-3 text-right font-bold">{bt("이해", "Clarity")}</th>
                      <th scope="col" className="py-1 pr-3 text-right font-bold">{bt("끝까지", "Finished")}</th>
                      <th scope="col" className="py-1 font-bold">{bt("가장 많이 멈춘 곳", "Most common stop")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((group) => {
                      const isCut = group.dropOff.cut.total >= group.dropOff.scroll.total;
                      const peak = peakBins(isCut ? group.dropOff.cut.bins : group.dropOff.scroll.bins)[0];
                      const marked = group.reading.finished + group.reading.left;
                      return (
                        <tr key={group.key} className={`border-t border-line ${group.key === selected.key ? "bg-accent-soft" : ""}`}>
                          <th scope="row" className="py-1 pr-3 font-normal">
                            <button
                              type="button"
                              aria-current={group.key === selected.key ? "true" : undefined}
                              className="min-h-11 rounded-lg px-1 text-left font-bold text-fg underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [overflow-wrap:anywhere]"
                              onClick={() => dispatch({ type: "select", key: group.key })}
                            >
                              {groupLabel(bt, group)}
                            </button>
                          </th>
                          <td className="py-1 pr-3 text-right tabular-nums">{group.count}</td>
                          <td className="py-1 pr-3 text-right tabular-nums">{meanText(group.fun.mean)}</td>
                          <td className="py-1 pr-3 text-right tabular-nums">{meanText(group.understanding.mean)}</td>
                          <td className="py-1 pr-3 text-right tabular-nums">{group.reading.finishedShare === null ? "—" : showsPercent(marked) ? `${Math.round(group.reading.finishedShare * 100)}%` : `${group.reading.finished}/${marked}`}</td>
                          <td className="py-1 text-fg-2">
                            {peak ? `${isCut ? cutRangeText(bt, peak) : scrollRangeText(bt, peak)} (${countText(bt, peak.count)})` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          <ReaderFeedbackGroupView key={selected.key} group={selected} onToggleHidden={toggleHidden} />
          {hiddenNotSaved ? <p role="status" className="text-xs text-fg-3">{bt("이 브라우저가 저장을 막고 있어 숨김 표시는 이 화면을 닫으면 사라져요.", "This browser blocks storage, so hidden marks disappear when you leave this screen.")}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
