import { BookOpenText, Download, FilePlus2, PanelTopOpen, Trash2, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  buildStudioStoryAdaptationPlan,
  buildWriterRoomFromStoryAdaptation,
  createStudioStoryDevelopmentDocument,
  storyDevelopmentStorageKey,
  type StudioStoryChapter,
  type StudioStoryDevelopmentDocument,
} from "../studio-story-adaptation";
import { serializeStudioWriterRoomDocument } from "../studio-writer-room";
import type { StudioStoryBeat } from "../studio-storyboard-planner";
import { formatNumber } from "@toonstudio/core/format";

const FIELD =
  "min-h-11 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

function normalizeStored(value: unknown): StudioStoryDevelopmentDocument | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StudioStoryDevelopmentDocument>;
  if (candidate.version !== 1 || !Array.isArray(candidate.chapters)) return null;
  const chapters: StudioStoryChapter[] = candidate.chapters
    .slice(0, 100)
    .filter((item): item is StudioStoryChapter => Boolean(
      item
      && typeof item.id === "string"
      && typeof item.title === "string"
      && typeof item.body === "string"
      && ["draft", "review", "locked"].includes(item.status),
    ))
    .map((item) => ({
      id: item.id.slice(0, 120),
      title: item.title.slice(0, 240),
      body: item.body.slice(0, 120_000),
      status: item.status,
    }));
  if (chapters.length === 0) return null;
  return {
    version: 1,
    sourceKind: ["web-novel", "webtoon-script", "original"].includes(candidate.sourceKind ?? "")
      ? candidate.sourceKind as StudioStoryDevelopmentDocument["sourceKind"]
      : "web-novel",
    title: String(candidate.title ?? "").slice(0, 240),
    logline: String(candidate.logline ?? "").slice(0, 1_000),
    synopsis: String(candidate.synopsis ?? "").slice(0, 12_000),
    chapters,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date().toISOString(),
  };
}

function loadDevelopment(projectId: string): StudioStoryDevelopmentDocument {
  if (typeof window === "undefined") return createStudioStoryDevelopmentDocument();
  try {
    const raw = window.localStorage.getItem(storyDevelopmentStorageKey(projectId));
    return raw ? normalizeStored(JSON.parse(raw)) ?? createStudioStoryDevelopmentDocument() : createStudioStoryDevelopmentDocument();
  } catch {
    return createStudioStoryDevelopmentDocument();
  }
}

function downloadText(filename: string, text: string, type = "application/json") {
  const blob = new Blob([text], { type });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

function StoryDetails({ collapsed, label, children }: {
  readonly collapsed: boolean;
  readonly label: string;
  readonly children: ReactNode;
}) {
  if (!collapsed) return <>{children}</>;
  return (
    <details className="mt-4 rounded-xl border border-line bg-panel/40">
      <summary className="min-h-12 cursor-pointer px-4 py-3 text-sm font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{label}</summary>
      <div className="border-t border-line p-3 sm:p-4">{children}</div>
    </details>
  );
}

function adaptationWarningText(warning: string, bt: (ko: string, en: string) => string): string {
  const code = warning.split(":")[0];
  switch (code) {
    case "source-empty": return bt("대본을 입력하면 새 컷 구성을 미리 볼 수 있어요.", "Enter a script to preview a new panel plan.");
    case "source-truncated": return bt("분석할 수 있는 글자 수를 넘은 부분은 이번 분석에 포함되지 않았어요.", "Text beyond the analysis limit was not included.");
    case "scene-limit-reached": return bt("한 번에 분석할 수 있는 장면 수에 도달했어요. 대본을 나누어 확인하세요.", "The scene limit was reached. Review the script in smaller sections.");
    case "beat-limit-reached": return bt("한 번에 분석할 수 있는 컷 수에 도달했어요. 대본을 나누어 확인하세요.", "The panel limit was reached. Review the script in smaller sections.");
    case "no-beats": return bt("컷으로 나눌 내용을 찾지 못했어요. 대본 내용을 확인하세요.", "No panel content was found. Check the script.");
    case "long-dialogue": return bt("대사가 긴 장면이 있어요. 말풍선을 나누면 읽기 쉬워져요.", "Some dialogue is long. Splitting the balloons can improve readability.");
    case "character-missing": return bt("등장인물이 지정되지 않은 장면이 있어요. 컷 계획에서 확인하세요.", "Some scenes have no assigned characters. Check the panel plan.");
    case "episode-mixed": return bt("여러 회차의 장면이 섞여 있어요. 회차 순서를 확인하세요.", "Scenes from several episodes are mixed. Check their order.");
    default: return bt("분석한 컷의 순서와 내용을 한 번 더 확인하세요.", "Review the order and content of the analyzed panels.");
  }
}

export function StudioStoryDevelopmentPanel({
  projectId,
  onApplyBeats,
  focused = false,
  currentPanelCount = 0,
}: {
  readonly projectId: string;
  readonly focused?: boolean;
  readonly currentPanelCount?: number;
  readonly onApplyBeats: (beats: readonly StudioStoryBeat[], mode: "replace" | "append") => void;
}) {
  const bt = useBilingual("StudioStoryDevelopmentPanel");
  const [development, setDevelopment] = useState(() => loadDevelopment(projectId));
  const [loadedProjectId, setLoadedProjectId] = useState(projectId);
  const [selectedChapterId, setSelectedChapterId] = useState(() => development.chapters[0]?.id ?? "");
  const [notice, setNotice] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saving" | "saved" | "failed">("saving");
  const [saveRetry, setSaveRetry] = useState(0);
  const [confirmingReplace, setConfirmingReplace] = useState(false);

  useEffect(() => {
    const next = loadDevelopment(projectId);
    setDevelopment(next);
    setLoadedProjectId(projectId);
    setSelectedChapterId(next.chapters[0]?.id ?? "");
    setSaveState("saving");
    setConfirmingReplace(false);
  }, [projectId]);

  useEffect(() => {
    // Never write the previous project state during the scope-change render.
    if (loadedProjectId !== projectId || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storyDevelopmentStorageKey(projectId), JSON.stringify(development));
      setSaveState("saved");
    } catch {
      setSaveState("failed");
    }
  }, [development, projectId, loadedProjectId, saveRetry]);

  const chapter = development.chapters.find((item) => item.id === selectedChapterId)
    ?? development.chapters[0]!;
  const plan = useMemo(() => buildStudioStoryAdaptationPlan(chapter.body), [chapter.body]);

  const patchDevelopment = (patch: Partial<StudioStoryDevelopmentDocument>) => {
    setSaveState("saving");
    setConfirmingReplace(false);
    setDevelopment((current) => ({ ...current, ...patch, updatedAt: new Date().toISOString() }));
    setNotice(null);
  };
  const patchChapter = (patch: Partial<StudioStoryChapter>) => {
    setSaveState("saving");
    setConfirmingReplace(false);
    setDevelopment((current) => ({
      ...current,
      chapters: current.chapters.map((item) => item.id === chapter.id ? { ...item, ...patch } : item),
      updatedAt: new Date().toISOString(),
    }));
    setNotice(null);
  };

  const addChapter = () => {
    const index = development.chapters.length + 1;
    const next: StudioStoryChapter = {
      id: `chapter-${Date.now().toString(36)}`,
      title: bt(`${index}화`, `Chapter ${index}`),
      body: "",
      status: "draft",
    };
    patchDevelopment({ chapters: [...development.chapters, next] });
    setSelectedChapterId(next.id);
  };

  const removeChapter = () => {
    if (development.chapters.length <= 1) return;
    const remaining = development.chapters.filter((item) => item.id !== chapter.id);
    patchDevelopment({ chapters: remaining });
    setSelectedChapterId(remaining[0]?.id ?? "");
  };

  const apply = (mode: "replace" | "append", confirmed = false) => {
    if (plan.beats.length === 0) return;
    if (focused && mode === "replace" && currentPanelCount > 0 && !confirmed) {
      setConfirmingReplace(true);
      return;
    }
    onApplyBeats(plan.beats, mode);
    setConfirmingReplace(false);
    setNotice(mode === "replace"
      ? bt("현재 프로젝트 컷 계획을 이 변환 초안으로 교체했습니다.", "Replaced the project beat plan with this adaptation draft.")
      : bt("현재 프로젝트 컷 계획 뒤에 변환 초안을 추가했습니다.", "Appended the adaptation draft to the project beat plan."));
  };

  const exportWriterRoom = () => {
    if (plan.beats.length === 0) return;
    const writerRoom = buildWriterRoomFromStoryAdaptation({ development, plan });
    downloadText(
      `${(development.title || chapter.title || "story").replace(/[^a-z0-9가-힣_-]+/giu, "-")}-writer-room.json`,
      serializeStudioWriterRoomDocument(writerRoom),
    );
    setNotice(bt("Writer Room 호환 JSON을 내보냈습니다.", "Exported a Writer Room compatible JSON file."));
  };

  return (
    <section className="rounded-3xl border border-accent/25 bg-card p-4 shadow-sm sm:p-6" aria-labelledby="story-development-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          {!focused ? <p className="flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            <BookOpenText size={15} aria-hidden="true" /> STORY / WEB NOVEL LAB
          </p> : null}
          <h2 id="story-development-title" className="mt-2 text-xl font-black text-fg">
            {focused ? bt("내 대본", "My script") : bt("웹소설·시놉시스에서 웹툰 컷 계획까지", "From web novel and synopsis to webtoon panel plan")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-fg-2">
            {focused ? currentPanelCount > 0 ? bt(
              `현재 ${currentPanelCount}컷 계획이 준비되어 있어요. 아래 대본을 고치거나 ‘이어서 그리기’로 원고를 열어 보세요.`,
              `Your current ${currentPanelCount}-panel plan is ready. Edit the script below or open the manuscript with “Continue drawing”.`,
            ) : bt("대본을 적고 아래에서 컷 계획을 만들어 보세요. ‘이어서 그리기’로 원고를 바로 열 수도 있어요.", "Write a script and create a panel plan below, or open the manuscript with “Continue drawing”.") : bt(
              "회차 원문은 프로젝트에 보관하고, 변환 초안은 장면·비트·대사·컷 예상치로 분석합니다. 적용 전까지 기존 스토리 계획은 바뀌지 않습니다.",
              "Keep chapter drafts with the project and analyze an adaptation into scenes, beats, dialogue and panel estimates. Existing story planning stays unchanged until you apply it.",
            )}
          </p>
        </div>
        <span className="inline-flex min-h-9 items-center rounded-full border border-accent/30 bg-accent-soft px-3 text-xs font-bold text-accent">
          {saveState === "saved" ? bt("이 기기에 대본 저장됨", "Script saved on this device") : saveState === "failed" ? bt("이 기기 저장 실패", "Device save failed") : bt("대본 저장 중…", "Saving script…")}
        </span>
      </div>

      {saveState === "failed" ? (
        <div role="alert" className="mt-3 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-fg">
          <p>{bt("대본을 저장하지 못했어요. 이 화면의 내용은 유지됩니다. 브라우저 저장 공간을 확인하고, 이동하기 전 대본을 복사해 두세요.", "The script could not be saved. Your text stays on this screen. Check browser storage and copy the script before leaving.")}</p>
          <button type="button" className={buttonClass({ variant: "outline", className: "mt-2" })} onClick={() => { setSaveState("saving"); setSaveRetry((value) => value + 1); }}>{bt("저장 다시 시도", "Retry saving")}</button>
        </div>
      ) : null}
      <StoryDetails collapsed={focused} label={bt("작품 정보·줄거리 수정", "Edit project details and synopsis")}>
      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <label className="text-xs font-bold text-fg-2">
          {bt("원천 형식", "Source format")}
          <select className={`${FIELD} mt-1`} value={development.sourceKind} onChange={(event) => patchDevelopment({ sourceKind: event.target.value as StudioStoryDevelopmentDocument["sourceKind"] })}>
            <option value="web-novel">{bt("웹소설", "Web novel")}</option>
            <option value="webtoon-script">{bt("웹툰 대본", "Webtoon script")}</option>
            <option value="original">{bt("오리지널 기획", "Original concept")}</option>
          </select>
        </label>
        <label className="text-xs font-bold text-fg-2 lg:col-span-2">
          {bt("작품명", "Project title")}
          <input className={`${FIELD} mt-1`} value={development.title} maxLength={240} onChange={(event) => patchDevelopment({ title: event.target.value })} />
        </label>
        <label className="text-xs font-bold text-fg-2 lg:col-span-3">
          {bt("한 줄 소개", "Logline")}
          <input className={`${FIELD} mt-1`} value={development.logline} maxLength={1000} onChange={(event) => patchDevelopment({ logline: event.target.value })} placeholder={bt("주인공·목표·갈등을 한 문장으로", "One sentence covering protagonist, goal and conflict")} />
        </label>
        <label className="text-xs font-bold text-fg-2 lg:col-span-3">
          {bt("시놉시스", "Synopsis")}
          <textarea className={cn(FIELD, "mt-1 min-h-28 resize-y")} value={development.synopsis} maxLength={12000} onChange={(event) => patchDevelopment({ synopsis: event.target.value })} placeholder={bt("전체 줄거리, 핵심 반전, 결말 방향을 정리하세요.", "Summarize the arc, major turns and ending direction.")} />
        </label>
      </div>

      </StoryDetails>
      <div className={cn("mt-6 grid gap-5", !focused || development.chapters.length > 1 ? "xl:grid-cols-[16rem_minmax(0,1fr)]" : "")}>
        {!focused || development.chapters.length > 1 ? <aside className="rounded-2xl border border-line bg-panel p-3">
          <div className="flex items-center justify-between gap-2">
            <b className="text-sm text-fg">{bt("회차", "Chapters")}</b>
            <button type="button" onClick={addChapter} className={buttonClass({ variant: "quiet", size: "icon" })} aria-label={bt("회차 추가", "Add chapter")}>
              <FilePlus2 size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="mt-3 space-y-1">
            {development.chapters.map((item) => (
              <button key={item.id} type="button" onClick={() => { setSelectedChapterId(item.id); setConfirmingReplace(false); setNotice(null); }} className={cn(
                "min-h-11 w-full rounded-xl border px-3 text-left text-xs font-bold",
                item.id === chapter.id ? "border-accent bg-accent-soft text-accent" : "border-transparent text-fg-2 hover:bg-raised",
              )}>
                <span className="block truncate">{item.title || bt("제목 없음", "Untitled")}</span>
                <span className="mt-0.5 block text-[0.65rem] font-medium">{item.status === "draft" ? bt("초안", "Draft") : item.status === "review" ? bt("검토", "Review") : bt("확정", "Locked")} · {bt(`${formatNumber(item.body.length)}자`, `${formatNumber(item.body.length)} characters`)}</span>
              </button>
            ))}
          </div>
        </aside> : null}

        <div className="min-w-0">
          <div className="grid gap-2 sm:grid-cols-[1fr_9rem_auto]">
            <input className={FIELD} value={chapter.title} maxLength={240} onChange={(event) => patchChapter({ title: event.target.value })} aria-label={bt("회차 제목", "Chapter title")} />
            <select className={FIELD} value={chapter.status} onChange={(event) => patchChapter({ status: event.target.value as StudioStoryChapter["status"] })} aria-label={bt("회차 상태", "Chapter status")}>
              <option value="draft">{bt("초안", "Draft")}</option>
              <option value="review">{bt("검토", "Review")}</option>
              <option value="locked">{bt("확정", "Locked")}</option>
            </select>
            <button type="button" disabled={development.chapters.length <= 1} onClick={removeChapter} className={buttonClass({ variant: "quiet", size: "icon" })} aria-label={bt("회차 삭제", "Delete chapter")}>
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
          <textarea
            className={cn(FIELD, "mt-2 min-h-64 resize-y font-serif leading-7")}
            value={chapter.body}
            aria-label={bt("대본", "Script")}
            maxLength={120000}
            onChange={(event) => patchChapter({ body: event.target.value })}
            placeholder={bt("웹소설 본문 또는 웹툰으로 전환할 대본을 붙여 넣으세요.", "Paste the web-novel chapter or script you want to adapt.")}
          />

          <StoryDetails collapsed={focused} label={bt("대본을 새 컷 계획으로 나누기 (선택)", "Split the script into a new panel plan (optional)")}>
          {focused ? <p className="text-sm leading-6 text-fg-2">{bt(`현재 ${currentPanelCount}컷은 그대로 유지돼요. 아래 ${plan.estimatedPanels}컷은 대본을 다시 분석한 제안이며, 교체를 확인하기 전에는 적용되지 않아요.`, `Your current ${currentPanelCount} panels stay unchanged. The ${plan.estimatedPanels} panels below are a new analysis and are not applied until you confirm replacement.`)}</p> : null}
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            {[
              [bt("원문", "Source"), formatNumber(chapter.body.length)],
              [bt("장면", "Scenes"), plan.scenes.length],
              [bt("스토리 비트", "Story beats"), plan.beats.length],
              [focused ? bt("새 분석의 예상 컷", "New estimated panels") : bt("예상 컷", "Est. panels"), plan.estimatedPanels],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-line bg-panel p-3">
                <p className="text-[0.65rem] font-bold text-fg-3">{label}</p>
                <b className="mt-1 block text-lg text-fg">{value}</b>
              </div>
            ))}
          </div>

          {plan.warnings.length > 0 ? (
            <p className="mt-3 text-xs leading-5 text-warning">
              {bt("자동 변환 확인 항목", "Adaptation review")}: {Array.from(new Set(plan.warnings.map((warning) => adaptationWarningText(warning, bt)))).slice(0, 5).join(" ")}
            </p>
          ) : null}
          {notice ? <p role="status" className="mt-3 rounded-xl border border-success/30 bg-success-soft/15 px-3 py-2 text-xs font-semibold text-success">{notice}</p> : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={plan.beats.length === 0} onClick={() => apply("replace")} className={buttonClass({ className: "gap-2" })}>
              <WandSparkles size={16} aria-hidden="true" /> {focused ? bt("새 컷 계획으로 교체", "Replace with the new plan") : bt("컷 계획으로 적용", "Apply as panel plan")}
            </button>
            <button type="button" disabled={plan.beats.length === 0} onClick={() => apply("append")} className={buttonClass({ variant: "outline", className: "gap-2" })}>
              <PanelTopOpen size={16} aria-hidden="true" /> {bt("기존 계획 뒤에 추가", "Append to current plan")}
            </button>
            <button type="button" disabled={plan.beats.length === 0} onClick={exportWriterRoom} className={buttonClass({ variant: "quiet", className: "gap-2" })}>
              <Download size={16} aria-hidden="true" /> {bt("Writer Room JSON", "Writer Room JSON")}
            </button>
          </div>
          {confirmingReplace ? <div role="group" aria-label={bt("컷 계획 교체 확인", "Confirm panel plan replacement")} className="mt-3 rounded-xl border border-warn/40 bg-warn/10 p-3">
            <p className="text-sm text-fg">{bt(`현재 ${currentPanelCount}컷 계획을 새 분석의 ${plan.beats.length}개 장면으로 교체할까요? 대본 원문은 유지돼요.`, `Replace the current ${currentPanelCount}-panel plan with ${plan.beats.length} newly analyzed beats? The source script stays unchanged.`)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className={buttonClass({ variant: "outline" })} onClick={() => setConfirmingReplace(false)}>{bt("취소", "Cancel")}</button>
              <button type="button" className={buttonClass()} onClick={() => apply("replace", true)}>{bt("확인하고 교체", "Confirm replacement")}</button>
            </div>
          </div> : null}
          </StoryDetails>
        </div>
      </div>
    </section>
  );
}
