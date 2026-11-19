import { useEffect, useId, useRef, useState } from "react";
import { getLang } from "@/shared/lib/i18n";

import {
  blankDrawingStyle, describeDrawingStyle, drawingStyleLooks, getDrawingStyleLibrary, STYLE_TRAITS,
  type DrawingStyleRecipe, type SavedDrawingStyle,
} from "./studio-drawing-style-library";

const messages = {
  ko: {
    title: "그림체 설정", imageHint: "이미지 보정과 대비가 선택 레이어에 적용됩니다. 아래 다섯 항목은 대본과 3D 구도의 생성 지시에 쓰입니다.", treatment: "이미지 보정", asIs: "지정하지 않음", contrast: "대비 미세 조정", imageApply: "선택한 이미지에 보정 적용", library: "이 기기의 그림체", fresh: "새 그림체",
    name: "그림체 이름", fields: ["선", "인물 비례", "채색과 명암", "질감", "배경과 효과"],
    examples: ["가늘고 끝이 뾰족한 선", "어깨는 좁게, 손은 크게", "낮은 채도와 두 단계 그림자", "마른 종이의 거친 결", "먼 배경은 윤곽을 생략"],
    save: "새 그림체 저장", update: "변경 저장", apply: "현재 작업에 적용", clear: "적용 해제", none: "저장한 그림체가 없습니다.",
    loading: "그림체를 불러오는 중…", retry: "다시 불러오기", failed: "기기 저장소를 열 수 없습니다.", conflict: "저장본이 바뀌었습니다. 다시 불러온 뒤 변경 내용을 확인해 주세요.",
    reloadOriginal: "최신 저장본 열기", keepCopy: "사본으로 편집", duplicate: "같은 이름의 그림체가 있습니다. 이름을 바꾸거나 저장본을 선택하세요.", saved: "이 기기에 저장했습니다.", applied: "현재 작업에 적용했습니다.",
    writeError: "그림체를 저장하지 못했습니다. 입력한 내용은 남아 있습니다.",
  },
  en: {
    title: "Art direction", imageHint: "Image treatment and contrast affect the selected layer. The five fields below guide script and 3D composition prompts.", treatment: "Image treatment", asIs: "Unspecified", contrast: "Fine contrast", imageApply: "Apply treatment to selected image", library: "Styles on this device", fresh: "New style",
    name: "Style name", fields: ["Line", "Figure proportions", "Color and shading", "Texture", "Background and effects"],
    examples: ["Fine, tapered strokes", "Narrow shoulders, larger hands", "Muted colors and two shadow tones", "Toothy dry paper", "Omit distant outlines"],
    save: "Save new style", update: "Save changes", apply: "Apply to this work", clear: "Clear applied style", none: "No saved styles yet.",
    loading: "Loading styles…", retry: "Reload styles", failed: "Device storage is unavailable.", conflict: "The saved style changed. Reload it and review your edits.",
    reloadOriginal: "Open latest saved version", keepCopy: "Edit as a copy", duplicate: "This name is in use. Choose the saved style or use another name.", saved: "Saved on this device.", applied: "Applied to this work.",
    writeError: "Could not save this style. Your edits are still here.",
  },
} as const;

const fieldClass = "min-h-11 w-full min-w-0 rounded-lg border border-line bg-card px-2 text-xs text-fg focus-visible:outline-accent";
const actionClass = "min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg hover:bg-raised disabled:opacity-45";

function DrawingStyleFields({ onApply, english, canClear, imageTarget }: {
  onApply: (description: string, recipe: DrawingStyleRecipe) => void; english: boolean; canClear: boolean; imageTarget: boolean;
}) {
  const t = english ? messages.en : messages.ko;
  const contrastId = useId();
  const [entries, setEntries] = useState<SavedDrawingStyle[]>([]);
  const [original, setOriginal] = useState<SavedDrawingStyle>();
  const [draft, setDraft] = useState<DrawingStyleRecipe>({ ...blankDrawingStyle });
  const [phase, setPhase] = useState<"loading" | "ready" | "failed">("loading");
  const [loadVersion, setLoadVersion] = useState(0);
  const refreshOriginal = useRef<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    getDrawingStyleLibrary(loadVersion > 0).then(lib => lib.list()).then(items => {
      if (!live) return;
      setEntries(items);
      setPhase("ready");
      if (refreshOriginal.current) {
        const latest = items.find(item => item.id === refreshOriginal.current);
        setOriginal(latest);
        if (latest) setDraft(latest.recipe);
        refreshOriginal.current = undefined;
        setNotice("");
      }
    }).catch(() => { if (live) setPhase("failed"); });
    return () => { live = false; };
  }, [loadVersion]);
  const description = describeDrawingStyle(draft, english);
  async function save() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const lib = await getDrawingStyleLibrary();
      const result = await lib.save(draft, original);
      setOriginal(result.entry); setEntries(result.entries); setDraft(result.entry.recipe); setNotice(t.saved);
    } catch (error) {
      setNotice(error instanceof Error && error.message === "style-name-in-use" ? t.duplicate
        : error instanceof Error && error.message === "style-conflict" ? t.conflict : t.writeError);
    } finally { inFlight.current = false; setBusy(false); }
  }
  const choose = (id: string) => {
    const entry = entries.find(item => item.id === id);
    setOriginal(entry); setDraft(entry?.recipe ?? { ...blankDrawingStyle }); setNotice("");
  };
  return <fieldset disabled={busy} className="mt-2 min-w-0 space-y-2">
    <label className="block text-xs">{t.library}
      <select className={fieldClass} value={original?.id ?? ""} onChange={e => choose(e.target.value)}>
        <option value="">{t.fresh}</option>
        {entries.map(entry => <option key={entry.id} value={entry.id}>{entry.recipe.name}</option>)}
      </select>
    </label>
    {phase === "loading" && <p role="status">{t.loading}</p>}
    {phase === "ready" && !entries.length && <p className="text-xs text-fg-3">{t.none}</p>}
    {phase === "failed" && <div role="alert">{t.failed} <button className={actionClass} type="button" onClick={() => { setPhase("loading"); setLoadVersion(n => n + 1); }}>{t.retry}</button></div>}
    {notice === t.conflict && <div className="flex flex-wrap gap-2">
      <button type="button" className={actionClass} disabled={phase === "loading"} onClick={() => {
        refreshOriginal.current = original?.id;
        setPhase("loading");
        setLoadVersion(n => n + 1);
      }}>{t.reloadOriginal}</button>
      <button type="button" className={actionClass} onClick={() => { setOriginal(undefined); setDraft({ ...draft, name: "" }); setNotice(""); }}>{t.keepCopy}</button></div>}
    <label className="block text-xs">{t.name}<input className={fieldClass} value={draft.name} maxLength={48} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label>
    {imageTarget && <p className="text-xs text-fg-2">{t.imageHint}</p>}
    <label className="block text-xs">{t.treatment}<select className={fieldClass} value={draft.lookId ?? ""} onChange={e => setDraft({ ...draft, lookId: e.target.value || undefined })}>
      <option value="">{t.asIs}</option>{drawingStyleLooks.map(({ look, en }) => <option key={look.id} value={look.id}>{english ? en : look.label}</option>)}
    </select></label>
    {draft.lookId && <label className="block text-xs" htmlFor={contrastId}>{t.contrast} <span aria-hidden="true">{draft.contrastOffset ?? 0}</span>
      <input id={contrastId} type="range" className="min-h-11 w-full accent-accent" min={-50} max={50} value={draft.contrastOffset ?? 0}
        onChange={e => setDraft({ ...draft, contrastOffset: e.target.valueAsNumber })}/>
    </label>}
    <div className="grid min-w-0 gap-2 sm:grid-cols-2">{STYLE_TRAITS.map((key, index) =>
      <label key={key} className="min-w-0 text-xs">{t.fields[index]}<input className={fieldClass} maxLength={90} value={draft[key]} placeholder={t.examples[index]} onChange={e => setDraft({ ...draft, [key]: e.target.value })}/></label>,
    )}</div>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={actionClass} disabled={!description || !draft.name.trim() || phase !== "ready"} onClick={() => void save()}>{original ? t.update : t.save}</button>
      <button type="button" className={actionClass} disabled={imageTarget ? !drawingStyleLooks.some(item => item.look.id === draft.lookId) : !description} onClick={() => { onApply(description, draft); setNotice(t.applied); }}>{imageTarget ? t.imageApply : t.apply}</button>
      {canClear && <button type="button" className={actionClass} onClick={() => { onApply("", blankDrawingStyle); setNotice(""); }}>{t.clear}</button>}
    </div>
    <p role="status" className="text-xs text-fg-2">{notice}</p>
  </fieldset>;
}

export function StudioDrawingStyleEditor({ onApply, locale, canClear = false, imageTarget = false }: {
  onApply: (description: string, recipe: DrawingStyleRecipe) => void; locale?: "ko" | "en"; canClear?: boolean; imageTarget?: boolean;
}) {
  const english = (locale ?? getLang()) === "en";
  const [opened, setOpened] = useState(false);
  return <details className="min-w-0 rounded-lg border border-line px-2 pb-1" onToggle={e => { if (e.currentTarget.open) setOpened(true); }}>
    <summary className="min-h-11 cursor-pointer content-center text-xs font-semibold text-fg">{(english ? messages.en : messages.ko).title}</summary>
    {opened && <DrawingStyleFields onApply={onApply} english={english} canClear={canClear} imageTarget={imageTarget}/>}
  </details>;
}
