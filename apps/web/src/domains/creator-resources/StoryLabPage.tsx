import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { RESOURCE_BUTTON, RESOURCE_INPUT } from "./navigation";
import { LocalSaveNotice, ResourceLayout } from "./ResourceLayout";
import { downloadText, useCreatorWorkspace } from "./workspace";

import type { StoryDraft } from "@/shared/lib/creator-workspace-persistence";

import { STORY_FIELDS, STORY_LABELS, storyMarkdown, type StoryField } from "@/shared/lib/creator-resources";
import { useMediaQuery } from "@/shared/hooks/use-media-query";
import { cn } from "@/shared/lib/utils";
import { safeDecodeRouteText } from "@/shared/lib/safe-route-text";
import {
  changedStoryFields, creatorStoryDraftStorageKey, editStoryDraft, parseStoryDraft,
  resolveStoryConflict, storyDraftConflicts, storyDraftView,
} from "@/shared/lib/creator-workspace-persistence";
import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
  useBilingual,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { MotionIllustration } from "@/shared/motion-assets";
import Link from "@/shared/navigation/router-link";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { SiteArtSurfaceSpotlight } from "@/shared/components/site-experience/SiteArtSurfaceSpotlight";
import { STORY_TO_WEBTOON_PIPELINE_MODES } from "@/shared/navigation/webtoon-platform-router-ux-model";

const SCOPE = "domains.creator.resources.StoryLabPage";
const tx = (source: string): string => translateCurrentStaticSourceText(SCOPE, "ko", source);

interface StoryWorksheetStep {
  readonly id: "character" | "conflict" | "ending";
  readonly label: readonly [string, string];
  readonly hint: readonly [string, string];
  readonly heading: readonly [string, string];
  readonly fields: readonly StoryField[];
}

const STORY_STEPS: readonly StoryWorksheetStep[] = [
  { id: "character", label: ["인물·목표", "Character & goal"], hint: ["가제 · 주인공 · 욕망", "Title · character · desire"], heading: ["누가 무엇을 원하나요?", "Who wants what?"], fields: ["title", "protagonist", "desire"] },
  { id: "conflict", label: ["갈등·세계", "Conflict & world"], hint: ["장애물 · 대가 · 규칙", "Obstacle · stakes · rules"], heading: ["무엇이 선택을 어렵게 하나요?", "What makes the choice difficult?"], fields: ["obstacle", "stakes", "world"] },
  { id: "ending", label: ["전환·결말", "Turn & ending"], hint: ["첫 화 · 변화 · 검토", "First episode · change · review"], heading: ["처음과 끝은 어떻게 달라지나요?", "What changes between the beginning and end?"], fields: ["turn", "ending"] },
];

function focusStoryElement(id: string) {
  const element = document.getElementById(id);
  element?.focus();
  element?.scrollIntoView?.({ block: "nearest", behavior: "auto" });
}

function isNativeStoryHistoryReturn(): boolean {
  return globalThis.performance?.getEntriesByType?.("navigation").some((entry) => "type" in entry && entry.type === "back_forward") ?? false;
}

const STORY_PIPELINE_ART_MAP: Readonly<Record<string, string>> = {
  "worldbuilding-synopsis": "/assets/site-experience/site-art-v1/cards/nb-planning-storylab-640.webp",
  "novel-to-script": "/assets/site-experience/site-art-v1/cards/nb-workflow-bridge-640.webp",
  "storyboard-3d-blocking": "/assets/site-experience/site-art-v1/cards/nb-create-canvas-640.webp",
  "ink-render-publish": "/assets/site-experience/site-art-v1/cards/nb-production-control-640.webp",
};

const STORY_PIPELINE_DESTINATIONS: Readonly<Record<string, {
  readonly title: readonly [string, string]; readonly action: readonly [string, string];
}>> = {
  "worldbuilding-synopsis": { title: ["기획서 작성", "Write a story plan"], action: ["기획 워크시트 열기", "Open story worksheet"] },
  "novel-to-script": { title: ["새 작업 준비", "Prepare a new work"], action: ["새 작업 설정 열기", "Open new work settings"] },
  "storyboard-3d-blocking": { title: ["웹툰 원고 편집", "Edit a webtoon"], action: ["웹툰 편집기 열기", "Open webtoon editor"] },
  "ink-render-publish": { title: ["게시 전 확인", "Prepare to publish"], action: ["게시 준비 열기", "Open publishing preparation"] },
};

export function StoryLabPage() {
  useBilingualI18nRevision();
  const bt = useBilingual("StoryLabPage");
  const { workspace, saveStory, clearError, error, ready, saving, writable, ownerKey } = useCreatorWorkspace();
  // 임시 초안도 워크스페이스와 같은 소유자 파티션에 둔다 — 같은 탭에서
  // 계정을 바꿔도 이전 계정의 미저장 기획이 새 계정의 화면에 섞이지 않는다.
  const draftKey = creatorStoryDraftStorageKey(ownerKey);
  const [draft, setDraft] = useState<StoryDraft | null>(null);
  const active = useRef(false);
  const latestDraft = useRef<StoryDraft | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [corruptDraft, setCorruptDraft] = useState(false);
  const [notice, setNotice] = useState("");
  const [draftError, setDraftError] = useState("");
  const [inputError, setInputError] = useState<{ readonly field: StoryField; readonly message: string } | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const desktopPreview = useMediaQuery("(min-width: 1024px)");
  const pendingFocus = useRef<string | null>(null);
  const handlingInvalid = useRef(false);
  const nativeReturnPending = useRef<boolean | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const stepId = new URLSearchParams(location.search).get("story-step");
  const stepIndex = Math.max(0, STORY_STEPS.findIndex((step) => step.id === stepId));
  const openStep = (index: number, focusId?: string) => {
    const step = STORY_STEPS[index];
    if (!step) return;
    pendingFocus.current = focusId ?? `story-step-heading-${step.id}`;
    if (index === stepIndex) { focusStoryElement(pendingFocus.current); pendingFocus.current = null; return; }
    const params = new URLSearchParams(location.search);
    params.set("story-step", step.id);
    navigate(`${location.pathname}?${params}${location.hash}`, { replace: true, state: location.state });
  };
  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    focusStoryElement(pendingFocus.current); pendingFocus.current = null;
  }, [stepIndex, previewExpanded, desktopPreview]);
  // Studio 경계의 문서 이동은 유지하고 native Back에서만 현재 입력 묶음의 키보드 문맥을 되돌린다.
  useEffect(() => {
    if (nativeReturnPending.current === null) nativeReturnPending.current = isNativeStoryHistoryReturn();
    let frame = 0;
    const restoreStepContext = () => {
      if (!nativeReturnPending.current || !draftReady) return;
      nativeReturnPending.current = false;
      const anchorId = location.hash.length > 1 ? safeDecodeRouteText(location.hash.slice(1)) : "";
      if (pendingFocus.current || handlingInvalid.current || (anchorId && document.getElementById(anchorId))) return;
      const focused = document.activeElement;
      if (focused && focused !== document.body && focused.id !== "main-content") return;
      const step = STORY_STEPS[stepIndex];
      if (step) focusStoryElement(`story-step-heading-${step.id}`);
    };
    const scheduleRestore = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(restoreStepContext);
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      nativeReturnPending.current = true;
      scheduleRestore();
    };
    window.addEventListener("pageshow", onPageShow);
    if (nativeReturnPending.current && draftReady) scheduleRestore();
    return () => { cancelAnimationFrame(frame); window.removeEventListener("pageshow", onPageShow); };
  }, [draftReady, stepIndex, location.hash]);
  const seedAttempted = useRef(false);
  useEffect(() => {
    active.current = true;
    let raw: string | null = null;
    let storageAvailable = true;
    // 소유자가 바뀌면 이전 소유자의 화면 상태(초안·손상 표시)를 비우고
    // 새 소유자 파티션의 초안으로 갈아끼운다 — 미저장 편집은 넘어가지 않는다.
    setDraft(null); latestDraft.current = null; setCorruptDraft(false); setDraftError(""); setInputError(null);
    try { raw = window.sessionStorage.getItem(draftKey); }
    catch {
      storageAvailable = false;
      setDraftError(tx("브라우저가 임시 보관을 차단했습니다. 편집은 가능하지만 이동 전에 현재 기획서를 파일로 내보내세요."));
    }
    if (storageAvailable) {
      try {
        const recovered = parseStoryDraft(raw);
        setDraft(recovered); latestDraft.current = recovered;
        if (recovered && changedStoryFields(recovered).length) setNotice(tx("이 탭의 미저장 초안을 복구했습니다. 저장된 기획서와 비교한 뒤 저장하세요."));
      } catch {
        setCorruptDraft(true);
        setDraftError(tx("임시 초안을 읽을 수 없습니다. 기존 임시 데이터를 보존했습니다. 편집하려면 아래에서 임시 초안을 명시적으로 지워주세요."));
      }
    }
    setDraftReady(true);
    return () => { active.current = false; };
  }, [draftKey]);
  const dirty = draft ? changedStoryFields(draft).length : 0;
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  // 홈의 아이디어 입력이 ?idea= 로 넘긴 문장: 기존 초안·저장본의 가제를 덮지 않고 빈 가제일 때만 한 번 채운다.
  useEffect(() => {
    if (!draftReady || seedAttempted.current) return;
    seedAttempted.current = true;
    const idea = new URLSearchParams(location.search).get("idea")?.trim();
    if (!idea) return;
    const params = new URLSearchParams(location.search);
    params.delete("idea");
    navigate(`${location.pathname}${params.size ? `?${params}` : ""}${location.hash}`, { replace: true, state: location.state });
    if (corruptDraft) return;
    const current = latestDraft.current;
    if (storyDraftView(workspace.story, current).title?.trim()) return;
    const seeded = editStoryDraft(current, workspace.story, "title", idea.slice(0, 200));
    latestDraft.current = seeded; setDraft(seeded);
    try { window.sessionStorage.setItem(draftKey, JSON.stringify(seeded)); }
    catch { /* 임시 보관 실패 안내는 기존 편집 경로가 담당한다. */ }
    setNotice(tx("홈에서 입력한 아이디어를 작품 가제로 가져왔습니다. 다듬은 뒤 기획서를 저장하세요."));
  }, [draftReady, corruptDraft, location.search, location.pathname, location.hash, location.state, navigate, workspace.story, draftKey]);
  const remember = (next: StoryDraft) => {
    clearError();
    latestDraft.current = next; setDraft(next); setDraftError("");
    try {
      if (changedStoryFields(next).length) window.sessionStorage.setItem(draftKey, JSON.stringify(next));
      else window.sessionStorage.removeItem(draftKey);
      setNotice(changedStoryFields(next).length ? tx("이 탭에 임시 보관했습니다. 기획서 저장을 눌러 보드에 반영하세요.") : tx("저장본과 같은 내용입니다."));
    } catch {
      setDraftError(tx("임시 보관에 실패했습니다. 화면의 입력은 유지했으니 이동하기 전에 현재 기획서를 내보내세요."));
    }
  };
  const discard = () => {
    if (!window.confirm(tx("이 탭의 미저장 초안을 지우고 최신 저장본으로 돌아갈까요? 필요한 내용은 먼저 내보내세요."))) return;
    try {
      window.sessionStorage.removeItem(draftKey);
      clearError(); latestDraft.current = null; setDraft(null); setCorruptDraft(false); setDraftError(""); setInputError(null); setNotice(tx("임시 초안을 지웠습니다. 최신 저장본을 표시합니다."));
    } catch { setDraftError(tx("임시 초안을 지우지 못했습니다. 브라우저 저장소 설정을 확인하세요.")); }
  };
  const submit = async () => {
    if (!draft || !dirty || saving) return;
    setInputError(null);
    const submitted = draft;
    const saved = await saveStory(submitted);
    if (!saved || !active.current || latestDraft.current !== submitted) return;
    latestDraft.current = null; setDraft(null); setNotice(tx("기획서를 저장했습니다. 다른 탭에서 바꾼 별도 항목도 유지했습니다."));
    try { window.sessionStorage.removeItem(draftKey); setDraftError(""); }
    catch { setDraftError(tx("기획서는 저장했지만 임시 보관본을 지우지 못했습니다. 다음 방문에서 같은 초안이 복구될 수 있습니다.")); }
  };
  const story = storyDraftView(workspace.story, draft);
  const conflicts = draft ? storyDraftConflicts(workspace.story, draft) : [];
  const completedCount = STORY_FIELDS.filter((field) => story[field]?.trim()).length;
  const reviewStory = () => {
    if (desktopPreview || previewExpanded || conflicts.length) { focusStoryElement("story-preview-title"); return; }
    pendingFocus.current = "story-preview-title"; setPreviewExpanded(true);
  };
  return <ResourceLayout compact title={tx("스토리 연구실")} intro={tx("인물, 욕망, 장애물과 선택을 차근차근 정리하세요. 외부 AI 호출 없이 직접 작성하는 기획 워크시트입니다.")}>
    <SiteContextualSubNav pathnameOverride="/story-lab" className="mb-5" />
    <nav aria-label={bt("기획 입력 단계", "Story planning steps")} className="grid grid-cols-3 gap-2">
      {STORY_STEPS.map((step, index) => <button key={step.id} type="button" aria-current={stepIndex === index ? "step" : undefined} aria-controls={`story-step-${step.id}`} onClick={() => openStep(index)} className={cn(RESOURCE_BUTTON, "min-w-0 flex-col px-1 text-xs motion-reduce:transition-none sm:px-2 sm:text-sm", stepIndex === index ? "border-accent bg-accent-soft text-accent" : "bg-canvas text-fg-2")}>
        <span>{`${index + 1}. ${bt(...step.label)}`}</span><span className="mt-1 text-[0.6875rem] font-normal text-fg-2">{bt(...step.hint)}</span>
      </button>)}
    </nav>
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,.85fr)]">
      <form id="story-worksheet" aria-label={bt("기획 워크시트", "Story worksheet")} className="min-w-0 space-y-5 rounded-2xl border border-line bg-panel p-4 sm:p-5" onSubmit={(event) => { event.preventDefault(); void submit(); }} onInvalid={(event) => {
        const input = event.target;
        if (!(input instanceof HTMLTextAreaElement)) return;
        event.preventDefault();
        if (pendingFocus.current || handlingInvalid.current) return;
        const field = STORY_FIELDS.find((candidate) => input.id === `story-${candidate}`);
        if (!field) return;
        handlingInvalid.current = true;
        queueMicrotask(() => { handlingInvalid.current = false; });
        setInputError({ field, message: input.validationMessage });
        openStep(STORY_STEPS.findIndex((step) => step.fields.some((candidate) => candidate === field)), input.id);
      }}>
        <p className="text-sm text-fg-2">{formatI18nTemplate(tx("작성한 항목 {v0}/8 · 미저장 변경 {v1}개"), { v0: completedCount, v1: dirty })}</p>
        {STORY_STEPS.map((step, index) => <fieldset key={step.id} id={`story-step-${step.id}`} hidden={stepIndex !== index} disabled={!ready || !draftReady || saving || corruptDraft} className="min-w-0 space-y-5">
          <legend className="sr-only">{bt(...step.label)}</legend>
          <h2 id={`story-step-heading-${step.id}`} tabIndex={-1} className="scroll-mt-4 text-lg font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{bt(...step.heading)}</h2>
          {step.fields.map((field) => <label key={field} htmlFor={`story-${field}`} className="block text-sm font-semibold">{tx(STORY_LABELS[field])}
            <textarea id={`story-${field}`} className={`${RESOURCE_INPUT} mt-2 scroll-mb-48 resize-y`} rows={field === "title" ? 1 : 3} maxLength={2000} aria-invalid={inputError?.field === field || undefined} aria-describedby={inputError?.field === field ? "story-input-error" : undefined} value={story[field] ?? ""} onChange={(event) => { setInputError(null); remember(editStoryDraft(draft, workspace.story, field, event.target.value)); }} />
          </label>)}
        </fieldset>)}
        {inputError && <p id="story-input-error" role="alert" className="text-sm text-fg">{`${tx(STORY_LABELS[inputError.field])}: ${inputError.message}`}</p>}
        {(dirty > 0 || corruptDraft) && <button type="button" className={RESOURCE_BUTTON} disabled={saving} onClick={discard}>{tx("임시 초안 지우기")}</button>}
        <p role="status" className="text-sm leading-6 text-fg-2">{notice}</p>
        {draftError && <p role="alert" className="text-sm leading-6">{draftError}</p>}
        <details className="rounded-xl border border-line px-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{bt("저장·복구 안내", "Saving and recovery")}</summary><p className="pb-3 text-xs leading-6 text-fg-2">{tx("임시 초안은 이 탭의 세션 저장소에 보관합니다. 새로고침·페이지 이동 후 복구할 수 있지만, 탭 종료·브라우저 정책·저장소 삭제 후 복구는 보장하지 않습니다. 중요 작업은 파일로 내보내세요.")}</p></details>
      </form>
      <details open={desktopPreview || previewExpanded || conflicts.length > 0} onToggle={(event) => { if (!desktopPreview && !conflicts.length) setPreviewExpanded(event.currentTarget.open); }} className="min-w-0 self-start rounded-2xl border border-line bg-panel p-4 sm:p-5">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent lg:hidden">{bt("입력 내용 미리보기", "Preview your story")}</summary>
        <section className="space-y-5" aria-labelledby="story-preview-title">
        <div className="flex items-center gap-3">
          <MotionIllustration name="lightbulb" size="md" className="shrink-0 text-accent" title={tx("이야기의 중심 질문 일러스트")} />
          <h2 id="story-preview-title" tabIndex={-1} className="scroll-mt-4 text-xl font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{tx("내 이야기의 중심 질문")}</h2>
        </div>
        <p className="whitespace-pre-wrap break-words rounded-xl bg-accent-soft p-5 text-lg leading-9">{formatI18nTemplate(tx("{v0}은(는) {v1}을 얻으려 하지만, {v2} 때문에 선택을 해야 한다. 실패하면 {v3}이(가) 걸려 있다."), {
          v0: story.protagonist || tx("[주인공]"),
          v1: story.desire || tx("[원하는 것]"),
          v2: story.obstacle || tx("[장애물]"),
          v3: story.stakes || tx("[잃는 것]"),
        })}</p>
        <p className="text-sm leading-7 text-fg-2">{tx("위 문장은 입력한 내용을 배열한 템플릿입니다. 자동 평가나 AI 생성 결과가 아니므로 문장과 조사는 직접 다듬어 주세요.")}</p>
        {draft && conflicts.length > 0 && <section aria-label={tx("다른 탭과의 기획 충돌")} className="space-y-4 rounded-xl border border-line p-4">
          <h3 className="font-bold" role="alert">{tx("같은 항목이 다른 탭에서 변경되었습니다")}</h3>
          <p className="text-sm text-fg-2">{tx("항목별로 내용을 선택한 후 저장하세요. 선택만으로 저장본을 덮어쓰지는 않습니다.")}</p>
          {conflicts.map((field) => <div key={field} className="space-y-2 border-t border-line pt-3">
            <h4 className="font-semibold">{tx(STORY_LABELS[field])}</h4>
            <p className="whitespace-pre-wrap break-words text-sm">{formatI18nTemplate(tx("저장본: {v0}"), { v0: workspace.story[field] || tx("(비어 있음)") })}</p>
            <p className="whitespace-pre-wrap break-words text-sm">{formatI18nTemplate(tx("내 초안: {v0}"), { v0: draft.story[field] || tx("(비어 있음)") })}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={RESOURCE_BUTTON} onClick={() => { setPreviewExpanded(true); remember(resolveStoryConflict(draft, workspace.story, field, "saved")); focusStoryElement("story-preview-title"); }}>{tx("저장본 유지")}</button>
              <button type="button" className={RESOURCE_BUTTON} onClick={() => { setPreviewExpanded(true); remember(resolveStoryConflict(draft, workspace.story, field, "draft")); focusStoryElement("story-preview-title"); }}>{tx("내 초안 선택")}</button>
            </div>
          </div>)}
        </section>}
        <h3 className="font-bold">{tx("첫 화를 점검하는 세 가지 질문")}</h3>
        <p className="leading-8 text-fg-2">{tx("주인공이 지금 무엇을 원하나요?")}<br />{tx("그 선택에 어떤 대가가 따르나요?")}<br />{tx("마지막 장면 뒤에 독자가 궁금해할 것은 무엇인가요?")}</p>
        <button className={RESOURCE_BUTTON} onClick={() => downloadText("webtoon-story-plan.md", storyMarkdown(story))}>{tx("현재 기획서 내보내기")}</button>
        <p className="text-sm leading-7 text-fg-2">{tx("고전·공개 소재를 각색하는 경우에도 사용한 원문, 번역문, 삽화의 권리를 각각 확인하고 창작 보드에 출처를 남기세요.")}</p>
      </section>
      </details>
    </div>
    <div data-story-worksheet-actions="true" className="sticky bottom-[var(--site-float-base,1rem)] z-10 grid grid-cols-3 gap-2 rounded-xl border border-line bg-panel p-2 shadow-lg sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:p-3">
      <p className="mr-auto hidden text-sm text-fg-2 sm:block">{`${stepIndex + 1} / ${STORY_STEPS.length} · ${bt("모든 항목은 위 단계에서 다시 열 수 있어요", "Revisit any field from the steps above")}`}</p>
      <button type="button" className={cn(RESOURCE_BUTTON, "min-w-0 px-1 text-xs sm:px-3 sm:text-sm")} disabled={stepIndex === 0} onClick={() => openStep(stepIndex - 1)}>{bt("이전 단계", "Previous")}</button>
      <button type="submit" form="story-worksheet" className={cn(RESOURCE_BUTTON, "min-w-0 px-1 text-xs sm:px-3 sm:text-sm")} disabled={!ready || !draftReady || !writable || saving || !dirty || conflicts.length > 0 || corruptDraft}>{saving ? bt("저장 중…", "Saving…") : bt("기획서 저장", "Save story plan")}</button>
      <button type="button" className={cn(RESOURCE_BUTTON, "min-w-0 border-accent bg-accent px-1 text-xs text-on-accent hover:bg-accent-2 sm:px-3 sm:text-sm")} onClick={() => stepIndex < STORY_STEPS.length - 1 ? openStep(stepIndex + 1) : reviewStory()}>{stepIndex === 0 ? bt("다음: 갈등 정리", "Next: conflict") : stepIndex === 1 ? bt("다음: 전환과 결말", "Next: ending") : bt("기획 검토하기", "Review plan")}</button>
    </div>
    <LocalSaveNotice error={error} writable={writable} saving={saving} />
    <details className="mt-6 rounded-2xl border border-line bg-panel/70 p-4">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        {bt("다음 작업·제작 도구", "Next steps and creation tools")}
      </summary>
      <section aria-label={bt("관련 제작 도구", "Related creation tools")} data-testid="story-lab-rea-pipeline" className="mt-4">
        <p className="mb-3 text-sm text-fg-2">{bt("기획서를 저장하거나 파일로 내보낸 뒤 필요한 도구를 여세요. 이동한 도구에서 설정과 실행을 선택할 수 있습니다.", "Save or export your story plan, then open the tool you need. Choose its settings and actions after opening it.")}</p>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {STORY_TO_WEBTOON_PIPELINE_MODES.map((mode) => {
            const destination = STORY_PIPELINE_DESTINATIONS[mode.id];
            return (
              <Link key={mode.id} href={mode.targetHref} className="group flex min-h-11 flex-col justify-between overflow-hidden rounded-xl border border-line bg-canvas text-left transition-colors hover:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                <img src={STORY_PIPELINE_ART_MAP[mode.id] ?? "/assets/site-experience/site-art-v1/cards/nb-planning-storylab-640.webp"} alt="" aria-hidden="true" loading="lazy" decoding="async" className="h-24 w-full border-b border-line/60 object-cover" />
                <div className="flex flex-1 flex-col justify-between p-3">
                  <p className="text-xs font-bold text-fg">{destination ? bt(...destination.title) : tx(mode.label)}</p>
                  <span className="mt-2 text-xs font-bold text-accent">{destination ? bt(...destination.action) : tx(mode.ctaLabel)} →</span>
                </div>
              </Link>
            );
          })}
        </div>
        <Link href="/studio/ai-lab" className="mt-4 inline-flex min-h-11 items-center gap-1 rounded-full border border-accent/40 bg-accent-soft/60 px-3 py-2 text-sm font-bold text-accent hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          {bt("AI 도구 열기", "Open AI tools")} →
        </Link>
        <SiteArtSurfaceSpotlight cardId="nb-planning-storylab" compact className="mt-5" />
      </section>
    </details>
  </ResourceLayout>;
}
