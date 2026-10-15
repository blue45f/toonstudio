import { Search, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MATERIAL_INTENT_MAX_LENGTH, planMaterialIntent } from "@toonstudio/core/material-intent-plan";

import {
  clearRecentMaterialSearches,
  getRecentMaterialSearches,
  MATERIAL_SEARCH_EXAMPLES,
  saveRecentMaterialSearch,
  storeMaterialDrop,
} from "../material-discovery/material-search-ux";
import { RESOURCE_BUTTON, RESOURCE_INPUT } from "../navigation";
import { ProviderStatus } from "../ProviderStatus";
import { downloadText } from "../workspace";
import {
  buildHubBrief,
  EMPTY_HUB_OVERRIDES,
  HUB_LIBRARY_PATH,
  hubInitialSlots,
  hubLensSlots,
  hubLensViews,
  hubMarketHref,
  hubSignature,
  matchSavedResources,
  normalizeHubQuery,
  summarizeSlots,
} from "./material-hub-model";
import { HUB_CHIP_STATIC, HUB_PRIMARY_BUTTON } from "./material-hub-styles";
import { MaterialHubResults } from "./MaterialHubResults";
import { MaterialHubUnderstanding } from "./MaterialHubUnderstanding";
import { useMaterialHubSearch } from "./useMaterialHubSearch";

import type { ChangeEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent, SyntheticEvent } from "react";
import type { MaterialAsset } from "../material-atlas/model";
import type { HubOverrides } from "./material-hub-model";
import type { MaterialIntentPlan, MaterialLensId } from "@toonstudio/core/material-intent-plan";
import type { CreatorResource } from "@/shared/lib/creator-resources";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/** 문장 예시(제품 문서의 대표 문장). 짧은 구 예시는 소재 도감의 MATERIAL_SEARCH_EXAMPLES 를 그대로 쓴다. */
const SENTENCE_EXAMPLES: readonly string[] = ["비 오는 골목 야경", "조선시대 한복 입은 인물 포즈", "1980년대 서울 시장 사진"];

interface Committed {
  readonly plan: MaterialIntentPlan;
  readonly overrides: HubOverrides;
  readonly signature: string;
}

export interface MaterialSentencePanelProps {
  /** 장면 보드에 담긴 자료 */
  readonly saved: readonly CreatorResource[];
  readonly onToggleSaved: (item: CreatorResource) => void;
  readonly saveDisabled: boolean;
  /**
   * 선택: 사용자가 "AI로 다듬기"를 눌렀을 때만 문장을 계획기 어휘로 풀어쓴다. 없으면 버튼을 그리지 않는다.
   * 풀어쓸 수 없으면 null 을 돌려주고, 그러면 규칙 기반 해석을 그대로 둔다.
   */
  readonly refineSentence?: (sentence: string, signal: AbortSignal) => Promise<string | null>;
}

/**
 * 문장으로 소재 찾기 — /research 의 허브 패널.
 *
 * 제공처 호출 정책: 입력 중에는 계획기(순수 함수)만 돌려 미리보기를 보여 준다. 제공처(/api/creator-resources/search)는
 * 사용자가 찾기를 제출하거나(Enter·버튼), 다시 시도·더 보기·다른 제공처 찾기·도시 고르기를 누를 때만 부른다.
 * 칩을 켜고 끄거나 검색어를 고치는 것은 다음 검색에 쓸 "이해"만 바꾸고, 반영은 "다시 찾기"를 눌러야 한다.
 */
export function MaterialSentencePanel({ saved, onToggleSaved, saveDisabled, refineSentence }: MaterialSentencePanelProps) {
  const bt = useBilingual("MaterialSentencePanel");
  const [params] = useSearchParams();
  const titleId = useId();
  const inputId = useId();
  const helpId = useId();
  const statusId = useId();
  const [draft, setDraft] = useState(() => normalizeHubQuery(params.get("mq") ?? ""));
  const [overrides, setOverrides] = useState<HubOverrides>(EMPTY_HUB_OVERRIDES);
  const [committed, setCommitted] = useState<Committed | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [recents, setRecents] = useState<string[]>(() => getRecentMaterialSearches());
  const [notice, setNotice] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const [providerStatusOpen, setProviderStatusOpen] = useState(false);
  const [refine, setRefine] = useState<{ running: boolean; original: string | null }>({ running: false, original: null });
  const refineController = useRef<AbortController | null>(null);
  const sessionSaved = useRef(new Set<string>());
  const { slots, search, retry, loadMore } = useMaterialHubSearch();

  useEffect(() => {
    const holder = refineController;
    return () => { holder.current?.abort(); };
  }, []);

  // 입력 중 미리보기: 계획기만 돌린다(순수·결정적). 어떤 네트워크 요청도 만들지 않는다.
  const plan = useMemo(() => planMaterialIntent(draft, { exclude: overrides.excluded }), [draft, overrides.excluded]);
  const views = useMemo(() => hubLensViews(plan, overrides), [plan, overrides]);
  const signature = useMemo(() => hubSignature(plan, overrides), [plan, overrides]);
  const dirty = committed !== null && committed.signature !== signature;

  const committedViews = useMemo(
    () => (committed ? hubLensViews(committed.plan, committed.overrides).filter((view) => view.on) : []),
    [committed],
  );
  const committedSlots = useMemo(
    () => (committed ? committedViews.flatMap((view) => hubLensSlots(view.lens, committed.overrides).slots) : []),
    [committed, committedViews],
  );
  const summary = summarizeSlots(committedSlots.map((slot) => slots[slot.key]));

  const commit = useCallback((nextOverrides: HubOverrides) => {
    const nextPlan = planMaterialIntent(draft, { exclude: nextOverrides.excluded });
    if (nextPlan.status === "empty") {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setNotice(null);
    search(hubInitialSlots(nextPlan, nextOverrides));
    setCommitted({ plan: nextPlan, overrides: nextOverrides, signature: hubSignature(nextPlan, nextOverrides) });
    setRecents(saveRecentMaterialSearch(nextPlan.input));
  }, [draft, search]);

  const changeDraft = (value: string) => {
    setDraft(value);
    setInvalid(false);
    // 문장이 바뀌면 이전 문장에 맞춘 칩 조정은 버리고 새로 읽는다.
    setOverrides((current) => (current === EMPTY_HUB_OVERRIDES ? current : EMPTY_HUB_OVERRIDES));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    commit(overrides);
  };

  const toggleCue = (id: string) => {
    setOverrides((current) => ({
      ...current,
      excluded: current.excluded.includes(id) ? current.excluded.filter((value) => value !== id) : [...current.excluded, id],
    }));
  };
  const toggleLens = (id: MaterialLensId) => {
    const view = views.find((candidate) => candidate.lens.id === id);
    if (!view) return;
    setOverrides((current) => ({ ...current, lensOn: { ...current.lensOn, [id]: !view.on } }));
  };
  const editQuery = (id: MaterialLensId, value: string | null) => {
    setOverrides((current) => {
      const queries = { ...current.queries };
      if (value === null) delete queries[id];
      else queries[id] = value;
      return { ...current, queries };
    });
  };
  const pickCity = (city: string) => {
    if (!committed) return;
    const next: HubOverrides = { ...committed.overrides, queries: { ...committed.overrides.queries, "weather-light": city } };
    const weather = hubLensViews(committed.plan, next).find((view) => view.lens.id === "weather-light");
    setOverrides((current) => ({ ...current, queries: { ...current.queries, "weather-light": city } }));
    setCommitted({ plan: committed.plan, overrides: next, signature: hubSignature(committed.plan, next) });
    // 도시를 고르는 것이 예보를 보겠다는 명시적 행동이다.
    if (weather) search(hubLensSlots(weather.lens, next).slots);
  };

  const toggleSaved = (item: CreatorResource) => {
    const removing = saved.some((entry) => entry.id === item.id);
    if (!removing) sessionSaved.current.add(item.id);
    onToggleSaved(item);
    setNotice({ text: removing ? bt(`장면 보드에서 뺐어요: ${item.title}`, `Removed from the scene board: ${item.title}`) : bt(`장면 보드에 담았어요: ${item.title}`, `Added to the scene board: ${item.title}`), tone: "info" });
  };

  const sendToStudio = (asset: MaterialAsset) => {
    if (storeMaterialDrop(asset)) {
      // 스튜디오 쪽에서 전달함을 읽는 화면은 아직 연결되지 않았다. 불러올 수 있다고 약속하지 않는다.
      setNotice({ text: bt(`스튜디오 전달함에 담았어요: ${asset.title}. 스튜디오에서 이 전달함을 불러오는 기능은 아직 연결되지 않았어요.`, `Placed in the Studio hand-off: ${asset.title}. Loading this hand-off from Studio is not connected yet.`), tone: "info" });
    } else {
      setNotice({ text: bt("전달 정보를 저장하지 못했어요. 브라우저 저장소 설정을 확인하세요.", "The hand-off could not be saved. Check your browser storage settings."), tone: "error" });
    }
  };

  const resultIds = new Set(committedSlots.flatMap((slot) => slots[slot.key]?.items.map((item) => item.id) ?? []));
  const briefItems = saved.filter((item) => resultIds.has(item.id) || sessionSaved.current.has(item.id));
  const exportBrief = () => {
    if (!committed) return;
    downloadText("toonstudio-scene-brief.md", buildHubBrief({ plan: committed.plan, overrides: committed.overrides, items: briefItems }));
    setNotice({ text: bt("장면 브리프를 내보냈어요. 다운로드 목록을 확인하세요.", "Scene brief exported. Check your downloads."), tone: "info" });
  };

  const runRefine = async () => {
    if (!refineSentence || refine.running || !draft.trim()) return;
    const original = draft;
    const controller = new AbortController();
    refineController.current = controller;
    setRefine({ running: true, original: refine.original });
    setNotice({ text: bt("AI로 문장을 다듬는 중이에요… 끝나도 자동으로 찾지는 않아요.", "Refining the sentence with AI… it will not search automatically."), tone: "info" });
    try {
      const refined = await refineSentence(original, controller.signal);
      const text = refined ? normalizeHubQuery(refined) : "";
      if (controller.signal.aborted) return;
      if (text && text !== normalizeHubQuery(original)) {
        changeDraft(text);
        setRefine({ running: false, original });
        setNotice({ text: bt("문장을 다듬었어요. 마음에 들면 찾기를 눌러 주세요.", "Sentence refined. Press Find if it looks right."), tone: "info" });
        return;
      }
    } catch {
      // 조용히 규칙 기반 해석을 유지한다.
    }
    if (controller.signal.aborted) return;
    setRefine({ running: false, original: refine.original });
    setNotice({ text: bt("AI 보조를 쓰지 못해 규칙 기반 해석을 그대로 두었어요. 로그인이 필요하거나 무료 한도가 찼을 수 있어요.", "AI help was not available, so the rule-based reading stays. You may need to sign in, or the free quota may be used up."), tone: "info" });
  };

  const liveMessage = !committed
    ? ""
    : summary.loading > 0
      ? bt(`‘${committed.plan.input}’ — ${summary.requested}곳에서 찾는 중이에요…`, `“${committed.plan.input}” — searching ${summary.requested} source${summary.requested === 1 ? "" : "s"}…`)
      : summary.requested === 0
        ? bt(`‘${committed.plan.input}’ — 제공처를 부르지 않는 종류만 켜져 있어요.`, `“${committed.plan.input}” — only kinds that need no provider call are on.`)
        : bt(
          `‘${committed.plan.input}’ 찾기를 마쳤어요 — 자료 ${summary.items}개 · 비어 있음 ${summary.empty}곳 · 오류 ${summary.failed}곳`,
          `Finished “${committed.plan.input}” — ${summary.items} items · ${summary.empty} empty · ${summary.failed} failed`,
        );

  const shortcutPlan = committed?.plan ?? plan;
  const localMatches = matchSavedResources(saved, shortcutPlan.myLibrary.keywords).length;
  const showShortcuts = shortcutPlan.status !== "empty";

  return (
    <section id="material-sentence" aria-labelledby={titleId} className="scroll-mt-24 space-y-6">
      {/* 카드는 이 하나뿐이다(DESIGN.md: 중첩 카드 금지). 이해 칩은 카드 안의 평면 구역이고, 결과 카드는 아래에서 페이지 위에 놓인다. */}
      <div className="space-y-4 rounded-2xl border border-line bg-panel p-4 sm:p-5">
        <header className="space-y-1">
          <p className="eyebrow text-accent">SENTENCE SEARCH</p>
          <h2 id={titleId} className="text-xl font-bold sm:text-2xl">{bt("문장으로 소재 찾기", "Find materials from a sentence")}</h2>
          <p className="max-w-3xl text-sm leading-6 text-fg-2 break-keep">
            {bt("장면을 문장 하나로 적으면 필요한 종류의 자료를 권리·출처와 함께 모아 보여 줘요. 한글 낱말은 내장 사전으로 영어 검색어에 연결하고, 사전에 없는 낱말은 지우지 않아요.", "Describe a scene in one sentence and get the kinds of material you need, with rights and sources. Korean words are mapped with a built-in vocabulary, and words outside it are never dropped.")}
          </p>
        </header>

        <form role="search" aria-label={bt("문장으로 소재 찾기", "Find materials from a sentence")} className="space-y-3" onSubmit={onSubmit} noValidate>
          <label htmlFor={inputId} className="block text-sm font-semibold">{bt("찾고 싶은 장면이나 소재를 문장으로", "The scene or material, as a sentence")}</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-accent" />
              <input
                id={inputId}
                type="search"
                className={`${RESOURCE_INPUT} min-h-12 pl-10`}
                value={draft}
                maxLength={MATERIAL_INTENT_MAX_LENGTH}
                autoComplete="off"
                enterKeyHint="search"
                placeholder={bt("예: 비 오는 골목 야경", "e.g. rainy alley at night")}
                aria-describedby={`${helpId} ${statusId}`}
                aria-invalid={invalid || undefined}
                onChange={(event: ChangeEvent<HTMLInputElement>) => changeDraft(event.target.value)}
                onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
                  if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
                }}
              />
            </div>
            <button type="submit" className={`${HUB_PRIMARY_BUTTON} min-h-12`}>{committed ? bt("다시 찾기", "Search again") : bt("소재 찾기", "Find")}</button>
            {refineSentence ? (
              <button type="button" className={`${RESOURCE_BUTTON} min-h-12`} disabled={refine.running || !draft.trim()} onClick={() => void runRefine()}>
                {refine.running ? bt("다듬는 중…", "Refining…") : bt("AI로 다듬기", "Refine with AI")}
              </button>
            ) : null}
          </div>
          <p id={helpId} className="text-xs leading-5 text-fg-2">
            {bt(`${MATERIAL_INTENT_MAX_LENGTH}자까지 · Enter나 버튼으로 제출할 때만 제공처를 불러요. 입력하는 동안에는 아래 ‘이렇게 이해했어요’만 바뀌어요.`, `Up to ${MATERIAL_INTENT_MAX_LENGTH} characters. Providers are called only when you submit with Enter or the button; while you type, only the reading below changes.`)}
            {refineSentence ? bt(" ‘AI로 다듬기’를 누르면 이 문장만 AI(무료 공유 풀 또는 내가 연결한 AI)로 보내요.", " Pressing ‘Refine with AI’ sends only this sentence to AI (the shared free pool or the AI you connected).") : null}
          </p>
          {invalid ? <p role="alert" className="text-sm font-semibold text-fg">{bt("찾을 수 있는 단서가 없어요. 장면이나 소재를 한두 낱말 더 적어 주세요.", "No searchable cue was found. Add a word or two about the scene or material.")}</p> : null}
          {refine.original ? (
            <p className="text-xs text-fg-2">
              <button type="button" className="inline-flex min-h-11 items-center underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" onClick={() => { changeDraft(refine.original ?? ""); setRefine({ running: false, original: null }); }}>
                {bt("원래 문장으로 되돌리기", "Restore my original sentence")}
              </button>
            </p>
          ) : null}

          <div className="space-y-2">
            <div role="group" aria-label={bt("예시 문장", "Example sentences")} className="-mx-1 flex flex-wrap items-center gap-2 px-1">
              <span className="text-xs font-semibold text-fg-2">{bt("예시", "Try")}</span>
              {[...SENTENCE_EXAMPLES, ...MATERIAL_SEARCH_EXAMPLES.slice(0, 3)].map((example) => (
                <button key={example} type="button" className={`${RESOURCE_BUTTON} bg-canvas`} onClick={() => { changeDraft(example); }}>{example}</button>
              ))}
            </div>
            {recents.length > 0 ? (
              <div role="group" aria-label={bt("최근 검색", "Recent searches")} className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-fg-2">{bt("최근", "Recent")}</span>
                {recents.map((recent) => (
                  <button key={recent} type="button" className={`${RESOURCE_BUTTON} bg-canvas`} onClick={() => changeDraft(recent)}>{recent}</button>
                ))}
                <button type="button" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-fg-2 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" onClick={() => { clearRecentMaterialSearches(); setRecents([]); }}>
                  <X size={14} aria-hidden="true" />{bt("기록 지우기", "Clear")}
                </button>
              </div>
            ) : null}
          </div>
        </form>

        <div id={statusId} role="status" aria-live="polite" aria-atomic="true" className="sr-only">{liveMessage}</div>
        <div role="status" aria-live="polite" aria-atomic="true" className={notice ? "text-sm leading-6" : "sr-only"}>
          {notice && notice.tone === "info" ? (
            <p className="text-fg-2">{notice.text}</p>
          ) : null}
        </div>
        {notice && notice.tone === "error" ? <p role="alert" className="text-sm font-semibold text-fg">{notice.text}</p> : null}

        {plan.status !== "empty"
          ? (
            <MaterialHubUnderstanding
              plan={plan}
              overrides={overrides}
              views={views}
              searched={committed !== null}
              dirty={dirty}
              onToggleCue={toggleCue}
              onToggleLens={toggleLens}
              onEditQuery={editQuery}
              onApply={() => commit(overrides)}
            />
          )
          : draft.trim()
            ? <p className="text-sm leading-6 text-fg-2">{bt("아직 읽을 수 있는 단서가 없어요. 장면이나 소재를 한두 낱말 더 적어 보세요.", "No cue to read yet. Add a word or two about the scene or material.")}</p>
            : null}
      </div>

      {committed ? (
        <MaterialHubResults
          plan={committed.plan}
          overrides={committed.overrides}
          views={committedViews}
          slots={slots}
          saved={saved}
          saveDisabled={saveDisabled}
          onSearchSlots={search}
          onRetry={retry}
          onLoadMore={loadMore}
          onToggleSaved={toggleSaved}
          onSendToStudio={sendToStudio}
          onPickCity={pickCity}
        />
      ) : null}

      {showShortcuts ? (
        <div className={`space-y-3 ${committed ? "border-t border-line pt-4" : ""}`}>
          <h3 className="text-base font-bold">{bt("다른 곳에서도 찾기", "Look elsewhere")}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Link className={RESOURCE_BUTTON} to={hubMarketHref(shortcutPlan)}>{bt("마켓에서 찾기 →", "Open in the market →")}</Link>
            <Link className={RESOURCE_BUTTON} to={HUB_LIBRARY_PATH}>{bt("내 소재장(3D 포함) 열기 →", "Open my materials (incl. 3D) →")}</Link>
            <button type="button" className={RESOURCE_BUTTON} disabled={!committed || briefItems.length === 0} aria-describedby={`${helpId}-brief`} onClick={exportBrief}>
              {bt(`브리프 내보내기 · 담은 자료 ${briefItems.length}개`, `Export brief · ${briefItems.length} on the board`)}
            </button>
            {localMatches > 0 ? <span className={HUB_CHIP_STATIC}>{bt(`내 저장 보드에 겹치는 자료 ${localMatches}개`, `${localMatches} saved items match`)}</span> : null}
          </div>
          <p id={`${helpId}-brief`} className="text-xs leading-5 text-fg-2">
            {bt("브리프는 문장과 이해, 담은 자료의 출처·이용조건을 Markdown 으로 내보내요. 먼저 마음에 드는 자료를 장면 보드에 담으세요. 권리 허가서나 법률 검토를 대신하지 않아요.", "The brief exports your sentence, how it was read, and the sources and terms of the items you added, as Markdown. Add items to the scene board first. It is not a rights clearance or legal review.")}
          </p>
        </div>
      ) : null}

      <details className="border-t border-line pt-3" onToggle={(event: SyntheticEvent<HTMLDetailsElement>) => setProviderStatusOpen(event.currentTarget.open)}>
        <summary className="min-h-11 cursor-pointer py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{bt("제공처 연결 상태 확인", "Check provider connection status")}</summary>
        <p className="mt-1 text-xs leading-5 text-fg-2">{bt("펼칠 때만 서버의 인증키 설정 여부를 확인해요. 실제 연결 성공이나 이용 권한을 보증하지 않아요.", "Server key settings are checked only when you open this. It does not guarantee a working connection or usage rights.")}</p>
        {providerStatusOpen ? <div className="mt-3"><ProviderStatus /></div> : null}
      </details>
    </section>
  );
}
