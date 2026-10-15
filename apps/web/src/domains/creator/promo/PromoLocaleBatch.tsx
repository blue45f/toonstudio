import { useEffect, useId, useMemo, useRef, useState } from "react";

import { isNaturalBrowserSpeechSupported, listNaturalBrowserSpeechVoices, type NaturalBrowserSpeechSession } from "../../../shared/lib/natural-browser-speech";
import { createCanvasBubbleTextMeasurer } from "../lettering/studio-bubble-text-fit";
import { downloadPromoLocaleBatch } from "./promo-locale-downloads";
import {
  planPromoLocale,
  PROMO_LOCALE_DEFAULT_POLICY,
  promoLocaleLabel,
  resolvePromoLocale,
  summarizePromoLocale,
  type PromoLocalePlan,
  type PromoLocalePolicy,
  type PromoLocaleRequest,
  type PromoLocaleSummary,
} from "./promo-locale-batch";
import { pickPromoLocaleVoice, previewPromoLocaleText } from "./promo-locale-voice";
import {
  promoTranslationLocales,
  readPromoEcosystemTranslations,
  readPromoTranslationBundle,
  type PromoEcosystemReadFailure,
  type PromoTranslationBundle,
} from "./promo-translation-drafts";

import type { PromoProject } from "./promo-model";

import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";

type Phase = "idle" | "reading" | "ready" | "error" | "exporting";
/** 읽기 실패는 어디서 읽었는지에 따라 다시 시도 동작이 다르다(파일은 같은 파일, 창작 생태계는 저장소를 다시 읽는다). */
type FailureKind = "read-file" | "read-ecosystem" | "export";
interface LocaleText { title: string; cta: string }
const NO_TEXT: LocaleText = { title: "", cta: "" };

/** 시크릿 모드·사이트 데이터 차단에서는 localStorage에 닿는 것만으로 예외가 난다 — 그때는 저장소가 없는 것으로 본다. */
function browserLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

/** 창작 생태계 작업대(번역 관리 탭)의 경로 — 대사와 번역을 만들고 승인하는 곳이다. */
const ECOSYSTEM_LOCALIZATION_HREF = "/studio/ecosystem#ecosystem-localization";

/**
 * 로케일별 자막·음성 일괄 출력 — 번역 초안에서 로케일을 고르면 컷 자막을 치환해 로케일별 SRT·WebVTT·프로젝트 JSON을 ZIP 하나로 저장한다.
 * 번역 초안은 이 브라우저의 창작 생태계 작업대(원문 개정에 묶인 번역·승인·오래됨)에서 바로 읽거나, 파일로 불러온다.
 * 승인된 번역만 기본으로 쓰고, 오래된(stale)·미승인 초안은 경고하며 명시적으로 켠 경우에만 쓴다.
 * 음성은 이 기기에 해당 로케일 음성이 있을 때 한 줄씩 미리 들려 주기만 한다(오디오 일괄 렌더·외부 TTS 없음).
 */
export function PromoLocaleBatch({ project, disabled }: { project: PromoProject; disabled: boolean }) {
  const bt = useBilingual("PromoLocaleBatch");
  const idPrefix = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  // 다시 시도에 쓸 마지막 파일. 화면에 그려지는 값이라 ref가 아니라 state로 둔다.
  const [lastFile, setLastFile] = useState<File | null>(null);
  const session = useRef<NaturalBrowserSpeechSession | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<{ readonly kind: FailureKind; readonly message: string } | null>(null);
  const [notice, setNotice] = useState("");
  // 불러온 곳을 사람이 알아보는 이름(파일 이름 또는 창작 생태계).
  const [sourceName, setSourceName] = useState("");
  const [fromEcosystem, setFromEcosystem] = useState(false);
  const [bundle, setBundle] = useState<PromoTranslationBundle | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [texts, setTexts] = useState<Readonly<Record<string, LocaleText>>>({});
  const [policy, setPolicy] = useState<PromoLocalePolicy>(PROMO_LOCALE_DEFAULT_POLICY);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [previewCut, setPreviewCut] = useState<Readonly<Record<string, number>>>({});
  const [previewNote, setPreviewNote] = useState("");

  const measurer = useMemo(() => createCanvasBubbleTextMeasurer(), []);
  const speechSupported = isNaturalBrowserSpeechSupported();
  const busy = disabled || phase === "reading" || phase === "exporting";

  useEffect(() => {
    if (!speechSupported) return;
    const synthesis = window.speechSynthesis;
    const refreshVoices = () => setVoices(listNaturalBrowserSpeechVoices());
    refreshVoices();
    synthesis.addEventListener("voiceschanged", refreshVoices);
    return () => synthesis.removeEventListener("voiceschanged", refreshVoices);
  }, [speechSupported]);
  useEffect(() => () => { session.current?.cancel(); session.current = null; }, []);

  const locales = useMemo(() => (bundle ? promoTranslationLocales(bundle) : []), [bundle]);
  const summaries = useMemo<Readonly<Record<string, PromoLocaleSummary>>>(() => {
    if (!bundle) return {};
    return Object.fromEntries(locales.map((locale) => [locale, summarizePromoLocale(resolvePromoLocale(project, bundle, locale), locale)]));
  }, [bundle, locales, project]);
  const requests = useMemo<PromoLocaleRequest[]>(
    () => locales.filter((locale) => selected.has(locale)).map((locale) => ({ locale, title: texts[locale]?.title ?? "", cta: texts[locale]?.cta ?? "", policy })),
    [locales, selected, texts, policy],
  );
  const plans = useMemo<Readonly<Record<string, PromoLocalePlan>>>(() => {
    if (!bundle || !project.panels.length) return {};
    return Object.fromEntries(requests.map((request) => [request.locale, planPromoLocale(project, bundle, request, measurer)]));
  }, [bundle, measurer, project, requests]);

  const stopPreview = () => {
    session.current?.cancel();
    session.current = null;
    setPreviewing(null);
  };
  /** 읽은 번역 초안을 화면에 올린다. 승인된 번역만으로 모든 자막이 채워지는 로케일을 기본으로 고르고, 나머지는 사람이 경고를 보고 켠다. */
  const accept = (loaded: PromoTranslationBundle, name: string, ecosystem: boolean) => {
    const found = promoTranslationLocales(loaded);
    if (!found.length) throw new Error(bt("번역 초안이 한 건도 없는 파일이에요.", "This file has no translation drafts."));
    setBundle(loaded);
    setSourceName(name);
    setFromEcosystem(ecosystem);
    setTexts({});
    setPolicy(PROMO_LOCALE_DEFAULT_POLICY);
    setSelected(new Set(found.filter((locale) => summarizePromoLocale(resolvePromoLocale(project, loaded, locale), locale).ready)));
    setPhase("ready");
  };
  const fail = (kind: FailureKind, message: string) => {
    setBundle(null);
    setSelected(new Set());
    setError({ kind, message });
    setPhase("error");
  };
  const load = async (file: File) => {
    setLastFile(file);
    stopPreview();
    setPhase("reading");
    setError(null);
    setNotice("");
    try {
      accept(await readPromoTranslationBundle(file), file.name, false);
    } catch (reason) {
      fail("read-file", reason instanceof Error ? reason.message : bt("번역 초안을 읽지 못했어요.", "Could not read the translation drafts."));
    }
  };
  const ecosystemFailureText = (reason: PromoEcosystemReadFailure): string => {
    if (reason === "unavailable") return bt("이 브라우저의 저장소를 읽을 수 없어요. 시크릿 모드이거나 사이트 데이터가 차단되어 있을 수 있어요. 번역 초안 JSON 파일로 불러오세요.", "This browser's storage is unavailable. Private mode or blocked site data may be the cause. Load a translation drafts JSON file instead.");
    if (reason === "corrupt") return bt("저장된 창작 생태계 기록을 읽을 수 없어요(깨졌거나 너무 커요). 기록은 바꾸지 않았어요. 번역 초안 JSON 파일로 불러오세요.", "The saved creator ecosystem record cannot be read (corrupted or too large). It was not changed. Load a translation drafts JSON file instead.");
    if (reason === "no-translations") return bt("저장된 대사는 있지만 번역이 한 건도 없어요. 창작 생태계 작업대의 「번역 관리」에서 번역을 저장하거나 승인한 뒤 다시 불러오세요.", "Dialogue is saved but there are no translations. Save or approve translations in the workbench's “Localization” tab, then load again.");
    return bt("이 브라우저의 창작 생태계 작업대에 저장된 대사가 없어요. 「번역 관리」에서 대사와 번역을 만든 뒤 다시 불러오세요.", "No dialogue is saved in this browser's creator ecosystem workbench. Create dialogue and translations in the “Localization” tab, then load again.");
  };
  /** 이 브라우저에 저장된 창작 생태계 작업대의 대사 번역을 바로 읽는다(파일 없이). 원문 개정에 묶인 승인·오래됨 판정이 그대로 따라온다. */
  const loadEcosystem = () => {
    setLastFile(null);
    stopPreview();
    setError(null);
    setNotice("");
    const result = readPromoEcosystemTranslations(browserLocalStorage());
    if (!result.ok) {
      fail("read-ecosystem", ecosystemFailureText(result.reason));
      return;
    }
    try {
      accept(result.bundle, bt("창작 생태계 작업대(이 브라우저)", "Creator ecosystem workbench (this browser)"), true);
    } catch (reason) {
      fail("read-ecosystem", reason instanceof Error ? reason.message : bt("번역 초안을 읽지 못했어요.", "Could not read the translation drafts."));
    }
  };

  const toggleLocale = (locale: string, on: boolean) => {
    if (!on && previewing === locale) stopPreview();
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(locale);
      else next.delete(locale);
      return next;
    });
  };
  const setText = (locale: string, patch: Partial<LocaleText>) => setTexts((current) => ({ ...current, [locale]: { ...(current[locale] ?? NO_TEXT), ...patch } }));

  const exportZip = async () => {
    if (!bundle) return;
    stopPreview();
    setPhase("exporting");
    setError(null);
    setNotice("");
    // ZIP을 만드는 동안 화면이 멈추므로, 진행 안내가 먼저 그려지도록 한 틱 양보한다.
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    try {
      const result = downloadPromoLocaleBatch(project, bundle, requests);
      setNotice(formatI18nTemplate(
        bt("로케일 {count}개의 SRT·VTT·프로젝트 JSON을 ZIP 하나로 저장했어요. 경고 {warnings}건은 manifest.json에도 적었어요. 오디오는 만들지 않았어요.", "Saved SRT, VTT and project JSON for {count} locales in one ZIP. {warnings} warnings are listed in manifest.json too. No audio was generated."),
        { count: requests.length, warnings: result.warningCount },
      ));
    } catch (reason) {
      setError({ kind: "export", message: reason instanceof Error ? reason.message : bt("ZIP을 만들지 못했어요. 아무 파일도 저장하지 않았어요.", "Could not build the ZIP. Nothing was saved.") });
    } finally {
      setPhase("ready");
    }
  };
  const preview = (locale: string, text: string, voice: SpeechSynthesisVoice) => {
    if (previewing === locale) { stopPreview(); return; }
    stopPreview();
    setPreviewNote("");
    const started = previewPromoLocaleText(text, voice, {
      onEnd: () => { session.current = null; setPreviewing(null); },
      onError: (failure) => { session.current = null; setPreviewing(null); setPreviewNote(failure.message); },
    });
    if (!started) { setPreviewNote(bt("이 브라우저에서 미리듣기를 시작하지 못했어요.", "This browser could not start the preview.")); return; }
    session.current = started;
    setPreviewing(locale);
  };

  const headingId = `${idPrefix}-title`;
  const fileId = `${idPrefix}-file`;
  const ecosystemNoteId = `${idPrefix}-ecosystem-note`;
  const noPanels = project.panels.length === 0;
  // 컷은 있지만 자막이 하나도 없으면 바꿀 자막이 없다 — 제목과 마지막 안내 문구만 로케일별로 달라진다.
  const noCaptions = !noPanels && project.panels.every((panel) => !panel.caption.trim());
  return (
    <section className="promo-subcard promo-locale-batch" aria-labelledby={headingId} aria-busy={phase === "reading" || phase === "exporting"}>
      <h3 id={headingId}>{bt("로케일별 자막 일괄 출력 · 음성 미리듣기", "Batch captions by locale · voice preview")}</h3>
      <p className="promo-muted">
        {bt(
          "번역 초안에서 로케일을 고르면 컷 자막을 그 언어로 바꿔 로케일별 SRT·WebVTT·프로젝트 JSON을 ZIP 하나로 저장해요. 승인된 번역만 기본으로 쓰고, 오래된 번역과 승인 전 초안은 경고해요. 번역하거나 문장을 고치지는 않아요.",
          "Pick locales from translation drafts to swap cut captions and save per-locale SRT, WebVTT and project JSON in one ZIP. Only approved translations are used by default; stale and unapproved drafts are flagged. Nothing is translated or rewritten here.",
        )}
      </p>
      <fieldset className="promo-subcard-options">
        <legend>{bt("번역 초안 불러오기", "Load translation drafts")}</legend>
        <div className="promo-button-row">
          <button type="button" className="promo-primary" disabled={busy} aria-describedby={ecosystemNoteId} onClick={loadEcosystem}>
            {bt("이 브라우저의 창작 생태계 번역 불러오기", "Load translations from this browser's creator ecosystem")}
          </button>
          <a className="promo-link-button" href={ECOSYSTEM_LOCALIZATION_HREF} target="_blank" rel="noopener noreferrer">
            {bt("번역 관리 열기", "Open Localization")}<span className="promo-sr-only">{bt(" (새 탭)", " (new tab)")}</span>
          </a>
        </div>
        <p id={ecosystemNoteId} className="promo-muted">
          {bt(
            "창작 생태계 작업대에서 만든 대사 번역을 그대로 읽어요. 번역은 원문 개정에 묶여 있어 원문을 고친 뒤의 오래된 번역(stale)과 승인 여부가 함께 따라와요.",
            "Reads the dialogue translations made in the creator ecosystem workbench. Translations are bound to a source revision, so stale ones (source edited since) and approval state come along.",
          )}
        </p>
        <label htmlFor={fileId}>{bt("번역 초안 JSON", "Translation drafts JSON")}</label>
        <input
          id={fileId}
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void load(file);
          }}
        />
        <p className="promo-muted">{bt("Studio 내보내기 메뉴의 「번역 초안 JSON」(문서 대사 번역과 검수 승인)이나 창작 생태계 기록 파일을 불러올 수도 있어요.", "You can also load “Translation drafts JSON” from Studio's export menu (document dialogue translations and review approvals) or a creator ecosystem record file.")}</p>
      </fieldset>
      <div role="status" aria-live="polite">
        {phase === "idle" ? <p className="promo-muted">{bt("아직 불러온 번역 초안이 없어요. 이 화면에서는 초안을 만들지 않아요.", "No translation drafts loaded yet. Drafts are not created on this screen.")}</p> : null}
        {phase === "reading" ? <p className="promo-notice" data-tone="info">{bt("번역 초안을 읽고 검사하는 중이에요…", "Reading and validating translation drafts…")}</p> : null}
        {phase === "exporting" ? <p className="promo-notice" data-tone="info">{bt("로케일별 파일을 만들고 ZIP으로 묶는 중이에요. 이 탭을 유지해 주세요.", "Building locale files and the ZIP. Keep this tab open.")}</p> : null}
        {notice ? <p className="promo-notice" data-tone="good">{notice}</p> : null}
        {bundle && phase !== "error" ? (
          <p className="promo-muted">
            {formatI18nTemplate(bt("{file} · 초안 {drafts}건 · 로케일 {locales}개", "{file} · {drafts} drafts · {locales} locales"), { file: sourceName, drafts: bundle.drafts.length, locales: locales.length })}
            {fromEcosystem ? ` · ${formatI18nTemplate(bt("대사 {rows}개", "{rows} dialogue lines"), { rows: bundle.rows.length })}` : ""}
            {bundle.revision !== null ? ` · revision ${bundle.revision}` : ""}
            {bundle.documentId ? ` · ${bundle.documentId}` : ""}
          </p>
        ) : null}
      </div>
      {error ? (
        <div className="promo-notice" data-tone="error" role="alert">
          <p>{error.message}</p>
          <div className="promo-button-row">
            {error.kind === "export"
              ? <button type="button" disabled={busy} onClick={() => void exportZip()}>{bt("다시 내보내기", "Export again")}</button>
              : error.kind === "read-ecosystem"
                ? <button type="button" disabled={busy} onClick={loadEcosystem}>{bt("다시 불러오기", "Load again")}</button>
                : lastFile ? <button type="button" disabled={busy} onClick={() => { void load(lastFile); }}>{bt("다시 시도", "Try again")}</button> : null}
            {error.kind !== "export" ? <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>{bt("다른 파일 선택", "Choose another file")}</button> : null}
          </div>
        </div>
      ) : null}
      {bundle && phase !== "error" ? (
        <>
          {bundle.rows.length === 0 ? <p className="promo-notice" data-tone="warn">{bt("이 파일에는 문서의 현재 원문(rows)이 없어 오래된 번역(stale)을 판정할 수 없어요. 승인 여부만 구분해요.", "This file has no current document rows, so stale translations cannot be detected. Only approval is distinguished.")}</p> : null}
          {fromEcosystem ? <p className="promo-muted">{bt("컷 자막은 창작 생태계 작업대에 저장한 원문과 글자까지 같을 때 그 대사의 번역으로 이어져요.", "A cut caption is linked to a saved dialogue's translations when it matches the saved source text exactly.")}</p> : null}
          {noPanels ? <p className="promo-notice" data-tone="warn">{bt("컷이 없어요. 컷을 먼저 추가하면 로케일별 자막을 만들 수 있어요.", "There are no cuts yet. Add cuts first to build locale captions.")}</p> : null}
          {noCaptions ? <p className="promo-notice" data-tone="warn">{bt("컷에 자막이 하나도 없어요. 자막을 입력하면 번역으로 바꿀 수 있어요. 지금은 제목과 마지막 2초 안내 문구만 로케일별로 달라져요.", "No cut has a caption yet. Add captions to swap in translations. For now only the title and the ending call-to-action change per locale.")}</p> : null}
          <fieldset className="promo-subcard-options">
            <legend>{bt("번역 사용 기준", "Which translations to use")}</legend>
            <label className="promo-toggle"><input type="checkbox" checked={policy.includeDrafts} disabled={busy} onChange={(event) => setPolicy((current) => ({ ...current, includeDrafts: event.target.checked }))} />{bt("승인 전 초안도 사용 (경고 표시)", "Also use unapproved drafts (flagged)")}</label>
            <label className="promo-toggle"><input type="checkbox" checked={policy.includeStale} disabled={busy} onChange={(event) => setPolicy((current) => ({ ...current, includeStale: event.target.checked }))} />{bt("오래된 번역도 사용 (경고 표시)", "Also use stale translations (flagged)")}</label>
          </fieldset>
          <ul className="promo-locale-list" aria-label={bt("번역 로케일", "Translation locales")}>
            {locales.map((locale) => {
              const summary = summaries[locale];
              const plan = plans[locale];
              const on = selected.has(locale);
              const rowId = `${idPrefix}-${locale}`;
              const voice = on ? pickPromoLocaleVoice(voices, locale) : null;
              const translatedCuts = plan ? plan.captions.map((caption, index) => ({ index, text: caption.text, translated: caption.translated })).filter((caption) => caption.translated) : [];
              const chosenCut = translatedCuts.find((cut) => cut.index === previewCut[locale]) ?? translatedCuts[0];
              const label = promoLocaleLabel(locale);
              const warnings = plan?.warnings.filter((warning) => warning.severity === "warning").length ?? 0;
              return (
                <li key={locale} className="promo-locale-row">
                  <label className="promo-toggle" htmlFor={`${rowId}-on`}>
                    <input id={`${rowId}-on`} type="checkbox" checked={on} disabled={busy} aria-describedby={`${rowId}-chips`} onChange={(event) => toggleLocale(locale, event.target.checked)} />
                    <strong>{label}</strong> <code>{locale}</code>
                  </label>
                  {summary ? (
                    <ul className="promo-chip-row" id={`${rowId}-chips`} aria-label={formatI18nTemplate(bt("{label} 번역 상태", "{label} translation status"), { label })}>
                      <li className="promo-chip" data-tone={summary.ready ? "good" : "warn"}>{formatI18nTemplate(bt("승인 {approved}/{total}컷", "Approved {approved}/{total}"), { approved: summary.counts.approved, total: summary.captioned })}</li>
                      {summary.counts.draft ? <li className="promo-chip" data-tone="warn">{formatI18nTemplate(bt("승인 전 초안 {n}", "Unapproved {n}"), { n: summary.counts.draft })}</li> : null}
                      {summary.counts.stale ? <li className="promo-chip" data-tone="bad">{formatI18nTemplate(bt("오래됨 {n}", "Stale {n}"), { n: summary.counts.stale })}</li> : null}
                      {summary.counts.missing ? <li className="promo-chip" data-tone="bad">{formatI18nTemplate(bt("번역 없음 {n}", "Missing {n}"), { n: summary.counts.missing })}</li> : null}
                      {summary.counts.unlinked ? <li className="promo-chip" data-tone="warn">{formatI18nTemplate(bt("원문과 연결 안 됨 {n}", "Unlinked {n}"), { n: summary.counts.unlinked })}</li> : null}
                    </ul>
                  ) : null}
                  {on && plan ? (
                    <div className="promo-locale-detail">
                      <div className="promo-inline-grid promo-two-columns">
                        <label htmlFor={`${rowId}-title`}>{bt("제목 (비우면 원문)", "Title (blank keeps the source)")}<input id={`${rowId}-title`} value={texts[locale]?.title ?? ""} maxLength={80} disabled={busy} onChange={(event) => setText(locale, { title: event.target.value })} /></label>
                        <label htmlFor={`${rowId}-cta`}>{bt("마지막 2초 안내 (비우면 원문)", "Ending call-to-action (blank keeps the source)")}<input id={`${rowId}-cta`} value={texts[locale]?.cta ?? ""} maxLength={80} disabled={busy} onChange={(event) => setText(locale, { cta: event.target.value })} /></label>
                      </div>
                      <div className="promo-locale-voice">
                        {!speechSupported ? <p className="promo-muted">{bt("이 브라우저는 음성 미리듣기를 지원하지 않아요.", "This browser does not support voice preview.")}</p>
                          : !voice ? <p className="promo-muted">{formatI18nTemplate(bt("이 기기에 {label} 음성이 설치되어 있지 않아 미리듣기를 제공하지 않아요. 오디오 일괄 생성과 외부 음성 합성은 지원하지 않아요.", "No installed {label} voice on this device, so preview is unavailable. Batch audio and external speech synthesis are not supported."), { label })}</p>
                            : !chosenCut ? <p className="promo-muted">{bt("미리 들을 번역 자막이 없어요.", "No translated caption to preview.")}</p>
                              : (
                                <div className="promo-button-row">
                                  <label htmlFor={`${rowId}-cut`}>{bt("미리 들을 컷", "Cut to preview")}
                                    <select id={`${rowId}-cut`} value={chosenCut.index} disabled={busy || previewing === locale} onChange={(event) => setPreviewCut((current) => ({ ...current, [locale]: Number(event.target.value) }))}>
                                      {translatedCuts.map((cut) => <option key={cut.index} value={cut.index}>{formatI18nTemplate(bt("컷 {n} · {text}", "Cut {n} · {text}"), { n: cut.index + 1, text: cut.text })}</option>)}
                                    </select>
                                  </label>
                                  <button type="button" disabled={busy} aria-pressed={previewing === locale} onClick={() => preview(locale, chosenCut.text, voice)}>
                                    {previewing === locale ? bt("미리듣기 정지", "Stop preview") : formatI18nTemplate(bt("미리듣기 · {voice}", "Preview · {voice}"), { voice: voice.name })}
                                  </button>
                                </div>
                              )}
                      </div>
                      {plan.warnings.length ? (
                        <details className="promo-locale-warnings">
                          <summary>{formatI18nTemplate(bt("경고 {warnings}건 · 안내 {info}건", "{warnings} warnings · {info} notes"), { warnings, info: plan.warnings.length - warnings })}</summary>
                          <ul>{plan.warnings.map((warning, index) => <li key={`${warning.code}-${warning.index ?? "all"}-${index}`} data-severity={warning.severity}>{warning.message}</li>)}</ul>
                        </details>
                      ) : <p className="promo-muted">{bt("경고가 없어요.", "No warnings.")}</p>}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {previewNote ? <p className="promo-notice" data-tone="warn" role="status">{previewNote}</p> : null}
          <div className="promo-button-row">
            <button type="button" className="promo-primary" disabled={busy || noPanels || requests.length === 0} onClick={() => void exportZip()}>
              {formatI18nTemplate(bt("로케일 {count}개 ZIP으로 내보내기", "Export {count} locales as ZIP"), { count: requests.length })}
            </button>
          </div>
          <p className="promo-muted">{bt("ZIP에는 로케일 폴더(captions.srt·captions.vtt·project.json), manifest.json, README.txt가 들어 있어요. 한국어 내레이션 음원은 로케일 프로젝트에서 빼요. 프로젝트 JSON에는 컷 이미지가 들어가니 공유 대상을 확인하세요.", "The ZIP holds a folder per locale (captions.srt, captions.vtt, project.json), manifest.json and README.txt. Korean narration audio is left out of locale projects. Project JSON includes the cut images, so check who you share it with.")}</p>
        </>
      ) : null}
    </section>
  );
}
