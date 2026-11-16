import {
  ArrowRight,
  Clapperboard,
  FileText,
  Plus,
  RefreshCw,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { getAuthUserId } from "@/domains/auth/public/session/auth-session-state";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { parseWorkspace, STORY_FIELDS } from "@/shared/lib/creator-resources";
import {
  creatorStoryDraftStorageKey,
  creatorWorkspaceStorageKey,
  editStoryDraft,
  parseStoryDraft,
} from "@/shared/lib/creator-workspace-persistence";
import { useI18n } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

import {
  AI_BLUEPRINT_FORMATS,
  AI_BLUEPRINT_TONES,
  AI_IDEA_SPARK_PRESETS,
  appendBlueprintCut,
  buildAiQuickBlueprint,
  cycleBlueprintTitle,
  openAiQuickBlueprintInStudio,
  polishBlueprintWithCloudAi,
  remixBlueprintCut,
  type AiBlueprintFormatId,
  type AiBlueprintLocale,
  type AiBlueprintRemixStyle,
  type AiBlueprintToneId,
  type AiQuickBlueprint,
} from "./ai-quick-blueprint-engine";

export interface AiQuickBlueprintComposerProps {
  readonly initialIdea?: string;
  readonly className?: string;
}

export function AiQuickBlueprintComposer({
  initialIdea = "",
  className,
}: AiQuickBlueprintComposerProps) {
  const bt = useBilingual("AiQuickBlueprintComposer");
  const lang = useI18n((state) => state.lang);
  const locale: AiBlueprintLocale = lang.startsWith("ko") ? "ko" : "en";
  const navigate = useNavigate();
  const baseId = useId();
  const inputId = `${baseId}-idea-input`;
  const titleInputId = `${baseId}-blueprint-title`;

  const [idea, setIdea] = useState(initialIdea);
  const [formatId, setFormatId] = useState<AiBlueprintFormatId>("instatoon-4");
  const [toneId, setToneId] = useState<AiBlueprintToneId>("romance");
  const [blueprint, setBlueprint] = useState<AiQuickBlueprint | null>(() =>
    initialIdea.trim().length > 0
      ? buildAiQuickBlueprint({
          idea: initialIdea,
          formatId: "instatoon-4",
          toneId: "romance",
          locale,
        })
      : null,
  );
  const [polishing, setPolishing] = useState(false);
  const [openingStudio, setOpeningStudio] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string>("");
  const [errorNotice, setErrorNotice] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // 언어가 전환되면 이미 열려 있는 블루프린트도 새 로케일로 재구성해 한/영 혼종을 막는다.
  useEffect(() => {
    setBlueprint((prev) => {
      if (!prev || prev.locale === locale) return prev;
      return buildAiQuickBlueprint({
        idea: prev.idea,
        formatId: prev.formatId,
        toneId: prev.toneId,
        locale,
      });
    });
    setStatusNotice("");
    setErrorNotice("");
  }, [locale]);

  function generateInstant(
    nextIdea: string,
    nextFormat: AiBlueprintFormatId = formatId,
    nextTone: AiBlueprintToneId = toneId,
  ) {
    setErrorNotice("");
    const created = buildAiQuickBlueprint({
      idea: nextIdea,
      formatId: nextFormat,
      toneId: nextTone,
      locale,
    });
    setBlueprint(created);
    setStatusNotice(
      bt(
        `‘${created.title}’ ${created.cuts.length}컷 콘티와 대사 초안을 바로 짰어요. 문장을 고치거나 바로 스튜디오로 열 수 있어요.`,
        `Generated a ${created.cuts.length}-panel storyboard & dialogue draft for "${created.title}". Edit any line or open it straight in Studio.`,
      ),
    );
  }

  function handleFormSubmit(event: FormEvent) {
    event.preventDefault();
    generateInstant(idea, formatId, toneId);
  }

  function handleSelectSpark(presetId: string) {
    const preset = AI_IDEA_SPARK_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    const sparkText = locale === "ko" ? preset.ideaKo : preset.ideaEn;
    setIdea(sparkText);
    setFormatId(preset.recommendedFormat);
    setToneId(preset.recommendedTone);
    generateInstant(sparkText, preset.recommendedFormat, preset.recommendedTone);
  }

  function handleFormatChange(nextFormat: AiBlueprintFormatId) {
    setFormatId(nextFormat);
    if (blueprint) {
      generateInstant(idea || blueprint.idea, nextFormat, toneId);
    }
  }

  function handleToneChange(nextTone: AiBlueprintToneId) {
    setToneId(nextTone);
    if (blueprint) {
      generateInstant(idea || blueprint.idea, formatId, nextTone);
    }
  }

  async function handleCloudPolish() {
    if (!blueprint || polishing) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPolishing(true);
    setErrorNotice("");
    try {
      const outcome = await polishBlueprintWithCloudAi(blueprint, controller.signal);
      if (controller.signal.aborted) return;
      setBlueprint(outcome.blueprint);
      setStatusNotice(outcome.statusMessage);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatusNotice(
        bt(
          "지금 설계된 스마트 콘티를 그대로 유지했어요. 바로 편집하거나 스튜디오에서 열 수 있어요.",
          "Kept your smart blueprint ready—edit below or open straight in Studio.",
        ),
      );
    } finally {
      if (abortRef.current === controller) {
        setPolishing(false);
      }
    }
  }

  function handleUpdateCutField(
    cutId: string,
    field: "scene" | "dialogue" | "narration",
    value: string,
  ) {
    setBlueprint((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        cuts: prev.cuts.map((cut) =>
          cut.id === cutId ? { ...cut, [field]: value } : cut,
        ),
      };
    });
  }

  function handleRemixCut(cutId: string, style: AiBlueprintRemixStyle) {
    setBlueprint((prev) => (prev ? remixBlueprintCut(prev, cutId, style) : prev));
  }

  function handleOpenInStudio() {
    if (!blueprint || openingStudio) return;
    setOpeningStudio(true);
    setErrorNotice("");
    try {
      const result = openAiQuickBlueprintInStudio(window.localStorage, blueprint, {
        target: window,
      });
      navigate(result.href);
    } catch (error) {
      setOpeningStudio(false);
      setErrorNotice(
        error instanceof Error
          ? error.message
          : bt(
              "스튜디오 작품을 여는 중 문제가 생겼어요. 다시 시도해 주세요.",
              "Could not open the Studio project. Please try again.",
            ),
      );
    }
  }

  function handleSendToStoryLab() {
    if (!blueprint) return;
    const ownerKey = getAuthUserId() ?? "guest";
    const wsKey = creatorWorkspaceStorageKey(ownerKey);
    const draftKey = creatorStoryDraftStorageKey(ownerKey);
    try {
      const savedWorkspace = parseWorkspace(window.localStorage.getItem(wsKey));
      let nextDraft = parseStoryDraft(window.sessionStorage.getItem(draftKey));
      for (const field of STORY_FIELDS) {
        const value = blueprint.storyWorksheet[field];
        if (value) {
          nextDraft = editStoryDraft(nextDraft, savedWorkspace.story, field, value);
        }
      }
      if (nextDraft) {
        window.sessionStorage.setItem(draftKey, JSON.stringify(nextDraft));
      }
    } catch {
      // 세션 저장소가 제한된 환경에서도 ?idea= 폴백으로 연결한다.
    }
    navigate(`/story-lab?idea=${encodeURIComponent(blueprint.title)}`);
  }

  const interviewHref = `/create?intent=my-story&topic=free-story${
    (idea.trim() || blueprint?.idea)
      ? `&idea=${encodeURIComponent((idea.trim() || blueprint?.idea || "").slice(0, 200))}`
      : ""
  }`;

  return (
    <section
      id="ai-composer"
      data-testid="ai-quick-blueprint-composer"
      aria-label={bt("AI 자동 콘티·대사 메이커", "AI Storyboard & Dialogue Auto-Composer")}
      className={cn(
        "mt-6 rounded-2xl border border-accent/40 bg-gradient-to-br from-panel via-card to-panel p-4 shadow-sm sm:p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-accent">
            <Wand2 size={13} aria-hidden="true" />
            {bt("AI 자동 콘티 · 대사 메이커", "AI AUTO STORYBOARD & SCRIPT")}
          </p>
          <h2 className="mt-1 text-base font-bold text-fg [word-break:keep-all] sm:text-lg">
            {bt(
              "한 줄만 적거나 추천 소재를 누르면, 컷 구성·카메라 구도·말풍선 대사를 바로 짜드려요",
              "Type one line or tap a spark to auto-compose panels, camera shots, and dialogue",
            )}
          </h2>
        </div>
        {blueprint ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/35 bg-accent-soft px-3 py-1 text-xs font-bold text-accent">
            <Sparkles size={12} aria-hidden="true" />
            {blueprint.source === "cloud-ai"
              ? bt("클라우드 AI 윤문 적용됨", "Cloud AI Polished")
              : bt("즉시 스마트 콘티 설계됨", "Smart Blueprint Ready")}
          </span>
        ) : null}
      </div>

      <form onSubmit={handleFormSubmit} className="mt-3.5 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor={inputId} className="sr-only">
            {bt("웹툰 아이디어 한 줄 입력", "One-line webtoon idea")}
          </label>
          <input
            id={inputId}
            type="text"
            value={idea}
            maxLength={200}
            onChange={(event) => setIdea(event.target.value)}
            placeholder={bt(
              "예: 비 오는 날 헌책방에서 내일의 일기장을 주웠다 (비워두면 인기 소재로 자동 구성)",
              "e.g. Found tomorrow's diary in a rainy bookshop (leave blank for a trending pick)",
            )}
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-sm font-medium text-fg placeholder:text-fg-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          />
          <button
            type="submit"
            data-testid="ai-blueprint-generate-btn"
            className={buttonClass({
              variant: "solid",
              size: "lg",
              className:
                "min-h-12 shrink-0 gap-2 rounded-xl px-5 font-extrabold transition-[transform,background-color,opacity] duration-150 enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none",
            })}
          >
            <Sparkles size={16} aria-hidden="true" />
            {blueprint
              ? bt("콘티 다시 짜기", "Rebuild Blueprint")
              : bt("AI로 콘티·대사 짜기", "Compose Storyboard")}
          </button>
        </div>

        <div
          role="group"
          aria-label={bt("원탭 인기 아이디어 추천", "One-tap trending story sparks")}
          className="-mx-1 flex flex-nowrap items-center gap-1.5 overflow-x-auto px-1 pb-1 [scroll-snap-type:x_proximity] [scrollbar-width:none]"
        >
          {AI_IDEA_SPARK_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSelectSpark(preset.id)}
              className="inline-flex min-h-11 shrink-0 [scroll-snap-align:start] items-center gap-1.5 rounded-full border border-line bg-canvas/90 px-3.5 py-2 text-xs font-semibold text-fg-2 transition-[transform,border-color,background-color,color] duration-150 hover:border-accent/55 hover:bg-accent-soft/50 hover:text-fg enabled:active:scale-[0.97] motion-reduce:transition-none motion-reduce:transform-none"
            >
              <Sparkles size={12} aria-hidden="true" className="text-accent" />
              <span>{bt(preset.chipKo, preset.chipEn)}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 pt-0.5 lg:flex-row lg:items-center lg:justify-between">
          <div
            role="group"
            aria-label={bt("목표 판형 선택", "Target format")}
            className="-mx-1 flex flex-nowrap items-center gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]"
          >
            {AI_BLUEPRINT_FORMATS.map((fmt) => {
              const selected = fmt.id === formatId;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => handleFormatChange(fmt.id)}
                  className={cn(
                    "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-[transform,border-color,background-color,color] duration-150 enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none",
                    selected
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-canvas/75 text-fg-2 hover:border-accent/45 hover:text-fg",
                  )}
                >
                  <span>{bt(fmt.labelKo, fmt.labelEn)}</span>
                  <span className="hidden text-[11px] font-medium opacity-80 sm:inline">
                    · {bt(fmt.badgeKo, fmt.badgeEn)}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            role="group"
            aria-label={bt("이야기 분위기 선택", "Story tone")}
            className="-mx-1 flex flex-nowrap items-center gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]"
          >
            {AI_BLUEPRINT_TONES.map((tone) => {
              const selected = tone.id === toneId;
              return (
                <button
                  key={tone.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => handleToneChange(tone.id)}
                  className={cn(
                    "inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 py-2 text-xs font-semibold transition-[transform,border-color,background-color,color] duration-150 enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none",
                    selected
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-canvas/75 text-fg-2 hover:border-accent/45 hover:text-fg",
                  )}
                >
                  {bt(tone.labelKo, tone.labelEn)}
                </button>
              );
            })}
          </div>
        </div>
      </form>

      {blueprint ? (
        <div
          data-testid="ai-blueprint-result-panel"
          className="mt-5 space-y-4 border-t border-line/80 pt-4"
        >
          {statusNotice ? (
            <p
              role="status"
              className="rounded-xl border border-accent/30 bg-accent-soft/45 px-3.5 py-2.5 text-xs font-medium leading-5 text-fg"
            >
              {statusNotice}
            </p>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="rounded-xl border border-line bg-canvas/90 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor={titleInputId} className="text-xs font-bold text-fg-2">
                  {bt("자동 제안 작품 제목 (직접 수정 가능)", "Suggested Work Title (Editable)")}
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setBlueprint((prev) => (prev ? cycleBlueprintTitle(prev) : prev))}
                    className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-fg"
                  >
                    <RefreshCw size={12} aria-hidden="true" />
                    {bt("다른 제목 추천", "Try another title")}
                  </button>
                  <button
                    type="button"
                    disabled={polishing}
                    aria-busy={polishing}
                    onClick={() => void handleCloudPolish()}
                    className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-accent/45 bg-accent-soft px-2.5 py-1.5 text-xs font-bold text-accent transition-colors hover:border-accent disabled:opacity-60"
                  >
                    <Wand2 size={12} aria-hidden="true" />
                    {polishing
                      ? bt("클라우드 AI 다듬는 중…", "Polishing with Cloud AI…")
                      : bt("클라우드 AI 문장 윤문", "Polish with Cloud AI")}
                  </button>
                </div>
              </div>
              <input
                id={titleInputId}
                type="text"
                value={blueprint.title}
                maxLength={80}
                onChange={(event) =>
                  setBlueprint((prev) =>
                    prev
                      ? {
                          ...prev,
                          title: event.target.value,
                          storyWorksheet: {
                            ...prev.storyWorksheet,
                            title: event.target.value,
                          },
                        }
                      : prev,
                  )
                }
                className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm font-bold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              />
              <p className="mt-2 text-xs leading-5 text-fg-2">{blueprint.logline}</p>
            </div>

            <div
              aria-label={bt("자동 설계 캐릭터 구성", "Suggested Character Pair")}
              className="grid gap-2 sm:grid-cols-2"
            >
              {blueprint.characters.map((ch) => (
                <div
                  key={ch.id}
                  className="flex flex-col justify-between rounded-xl border border-line bg-canvas/90 p-3"
                >
                  <div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-accent">
                      <Users size={12} aria-hidden="true" />
                      {bt(ch.roleKo, ch.roleEn)}
                    </span>
                    <p className="mt-1 text-xs font-bold text-fg">{ch.name}</p>
                    <p className="mt-1 text-[11px] leading-4 text-fg-2">{ch.traitSummary}</p>
                  </div>
                  <p className="mt-2 rounded-lg bg-panel px-2 py-1 text-[11px] font-medium text-fg-3">
                    {ch.poseHint}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-fg">
                {bt(
                  `컷별 콘티 · 말풍선 설계 (${blueprint.cuts.length}컷 — 모바일에서 좌우로 넘겨 보세요)`,
                  `Panel-by-Panel Blueprint (${blueprint.cuts.length} panels — swipe horizontally on mobile)`,
                )}
              </h3>
              {blueprint.cuts.length < 8 ? (
                <button
                  type="button"
                  onClick={() => setBlueprint((prev) => (prev ? appendBlueprintCut(prev) : prev))}
                  className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-canvas px-3 py-1.5 text-xs font-bold text-fg transition-colors hover:border-accent/55 hover:text-accent"
                >
                  <Plus size={13} aria-hidden="true" />
                  {bt("보너스 컷 추가", "Add bonus panel")}
                </button>
              ) : null}
            </div>

            <ol
              aria-label={bt("생성된 컷 콘티 목록", "Generated storyboard panels")}
              className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 [scroll-snap-type:x_proximity] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-3"
            >
              {blueprint.cuts.map((cut) => (
                <li
                  key={cut.id}
                  className="flex w-[85vw] max-w-[21rem] shrink-0 [scroll-snap-align:start] flex-col justify-between rounded-xl border border-line bg-canvas/95 p-3.5 sm:w-auto sm:max-w-none"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="inline-block rounded-md bg-accent/15 px-2 py-0.5 text-xs font-extrabold text-accent">
                        {cut.beatLabel}
                      </span>
                      <span className="text-[11px] font-semibold text-fg-3">{cut.sfx}</span>
                    </div>
                    <p className="text-[11px] font-semibold text-fg-2">{cut.shotAngle}</p>

                    <label className="block text-[11px] font-bold text-fg-2">
                      {bt("장면 연출", "Scene staging")}
                      <textarea
                        rows={2}
                        value={cut.scene}
                        maxLength={240}
                        onChange={(event) =>
                          handleUpdateCutField(cut.id, "scene", event.target.value)
                        }
                        className="mt-1 w-full resize-y rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-normal leading-5 text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                      />
                    </label>

                    <label className="block text-[11px] font-bold text-fg-2">
                      {bt("말풍선 대사", "Speech balloon")}
                      <input
                        type="text"
                        value={cut.dialogue}
                        maxLength={160}
                        onChange={(event) =>
                          handleUpdateCutField(cut.id, "dialogue", event.target.value)
                        }
                        className="mt-1 min-h-11 w-full rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                      />
                    </label>

                    <p className="rounded-lg bg-panel/75 px-2.5 py-1.5 text-[11px] leading-4 text-fg-3">
                      {bt("3D 무대 힌트", "3D stage")}: {cut.stage3dHint}
                    </p>
                  </div>

                  <div
                    role="group"
                    aria-label={bt(`${cut.beatLabel} 대사 톤 바꾸기`, `Remix ${cut.beatLabel}`)}
                    className="mt-3 flex flex-wrap gap-1.5 border-t border-line/60 pt-2.5"
                  >
                    {(
                      [
                        ["natural", "자연스럽게", "Softer"],
                        ["dramatic", "극적으로", "Dramatic"],
                        ["witty", "유머 한 스푼", "Witty"],
                      ] as const
                    ).map(([style, koLabel, enLabel]) => (
                      <button
                        key={style}
                        type="button"
                        onClick={() => handleRemixCut(cut.id, style)}
                        className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-line bg-panel px-2 py-1.5 text-[11px] font-semibold text-fg-2 transition-colors hover:border-accent/55 hover:text-accent"
                      >
                        {bt(koLabel, enLabel)}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {errorNotice ? (
            <p
              role="alert"
              className="rounded-xl border border-danger/45 bg-danger-soft px-3.5 py-2.5 text-xs font-semibold text-fg"
            >
              {errorNotice}
            </p>
          ) : null}

          <div className="flex flex-col gap-2.5 rounded-xl border border-accent/35 bg-accent-soft/45 p-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <p className="text-xs font-medium leading-5 text-fg-2">
              {bt(
                "이 콘티와 대사를 새 작품에 바로 담아 스튜디오를 열거나, 8항목 기획 워크시트로 넘겨 다듬을 수 있어요.",
                "Open a new Studio project pre-loaded with these panels, or send them to the 8-field Story Lab worksheet.",
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={openingStudio}
                aria-busy={openingStudio}
                data-testid="ai-blueprint-open-studio-btn"
                onClick={handleOpenInStudio}
                className={buttonClass({
                  variant: "solid",
                  size: "md",
                  className: "min-h-12 gap-1.5 rounded-xl px-4 font-extrabold",
                })}
              >
                <Clapperboard size={15} aria-hidden="true" />
                {openingStudio
                  ? bt("스튜디오 여는 중…", "Opening Studio…")
                  : bt("이 콘티로 스튜디오 바로 열기", "Open Blueprint in Studio")}
                <ArrowRight size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                data-testid="ai-blueprint-open-storylab-btn"
                onClick={handleSendToStoryLab}
                className={buttonClass({
                  variant: "outline",
                  size: "md",
                  className: "min-h-12 gap-1.5 rounded-xl bg-canvas px-3.5 font-bold",
                })}
              >
                <FileText size={15} aria-hidden="true" />
                {bt("스토리 연구실 8항목에 채우기", "Fill Story Lab Worksheet")}
              </button>
              <Link
                href={interviewHref}
                className="inline-flex min-h-12 items-center gap-1 rounded-xl border border-line bg-panel px-3.5 py-2 text-xs font-bold text-fg transition-colors hover:border-accent/55 hover:text-accent"
              >
                {bt("질문형 인터뷰로 이어가기", "Continue in Q&A Flow")}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
