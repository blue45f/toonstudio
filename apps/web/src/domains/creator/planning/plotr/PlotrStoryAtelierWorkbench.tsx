/**
 * Plotr 통합 스토리 아틀리에 워크벤치 (React.lazy 전용).
 *
 * - 기본값은 '간편 모드'로 모바일(<768px)에서도 핵심 행동 3~4개만 보여 복잡도를 0으로 억제한다.
 * - 초보자는 장르 샘플 4종(로판·회귀헌터·학원로맨스·스릴러) 원탭으로
 *   시놉시스 → 대본 → 컷 분해 → 인물·배경·소품 일관성 고정 → 글콘티/2D 원고 인계까지 즉시 체험한다.
 * - '전문가 도구 켜기'를 누르면 연속 대본·스냅샷·설정 탐지 / 이중 지하철 타임라인 / 자유 공간 스토리보드를
 *   한 자리에서 전환해 다룰 수 있다.
 */
import {
  Compass,
  Download,
  FileText,
  GitMerge,
  LayoutGrid,
  Send,
  SlidersHorizontal,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import Link from "@/shared/navigation/router-link";
import type { EpisodePlanWithSynopsis } from "../studio-episode-synopsis";
import {
  buildEpisodePlanPatchFromPlotr,
  exportPlotrTextConti,
} from "./plotr-consistency-and-batch";
import {
  STUDIO_PLOTR_UPDATED_EVENT,
  createPlotrDocumentFromTemplate,
  loadPlotrDocument,
  loadPlotrDocumentSync,
  savePlotrDocument,
} from "./plotr-device-store";
import {
  PLOTR_GENRE_TEMPLATES,
  PLOTR_REWRITE_DIRECTIVES,
  extractConsistencyAssetsFromScript,
  generatePlotrScriptDraft,
  revisePlotrScriptByDirective,
} from "./plotr-genre-templates";
import { parseScriptToPlotrCuts } from "./plotr-script-cut-engine";
import { generateFourCutWebtoonFromIdea } from "./plotr-visual-cut-renderer";
import {
  PLOTR_FORMAT_META,
  type PlotrDocumentState,
  type PlotrGenreTemplateId,
  type PlotrInputMode,
  type PlotrOutputFormat,
} from "./plotr-types";
import { PlotrCutStripAndAssetsPane } from "./PlotrCutStripAndAssetsPane";
import { PlotrIdeaToWebtoonBar } from "./PlotrIdeaToWebtoonBar";
import { PlotrScriptHelperDrawer } from "./PlotrScriptHelperDrawer";
import "./plotr-story-atelier.css";

const LazyScriveningsCodexView = lazy(() =>
  import("./PlotrScriveningsCodexView").then((m) => ({
    default: m.PlotrScriveningsCodexView,
  })),
);
const LazyDualSubwayTimelineView = lazy(() =>
  import("./PlotrDualSubwayTimelineView").then((m) => ({
    default: m.PlotrDualSubwayTimelineView,
  })),
);
const LazySpatialBoardView = lazy(() =>
  import("./PlotrSpatialBoardView").then((m) => ({
    default: m.PlotrSpatialBoardView,
  })),
);

type ExpertSubTab = "cuts" | "scrivenings" | "subway" | "spatial";

export interface PlotrStoryAtelierWorkbenchProps {
  readonly projectId: string;
  readonly activeEpisodePlan?: EpisodePlanWithSynopsis | null;
  readonly onApplyToEpisodePlan?: (plan: EpisodePlanWithSynopsis) => boolean | void;
  readonly storyboardHref?: string | null;
}

const BTN =
  "plotr-btn-tactile inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold [word-break:keep-all] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

function resolveBeginnerGuideStep(doc: PlotrDocumentState): {
  readonly stepLabel: string;
  readonly messageKo: string;
} {
  if (!doc.rawScript.trim()) {
    return {
      stepLabel: "1단계 · 시작하기",
      messageKo: "아래 장르 샘플 4개 중 하나를 누르거나, 대본·줄거리를 붙여 넣어 바로 시작하세요.",
    };
  }
  if (doc.cuts.length === 0) {
    return {
      stepLabel: "2단계 · 컷 나누기",
      messageKo: "‘대본을 컷으로 나누기’를 누르면 장면·대사·카메라가 컷 카드로 자동 정리돼요.",
    };
  }
  const emptyAssets = doc.assets.filter((a) => !a.visualNote.trim()).length;
  if (emptyAssets > 0) {
    return {
      stepLabel: "3단계 · 인물·소품 고정",
      messageKo: `비어 있는 소재(+) ${emptyAssets}개를 채우거나 ‘빈 컷 한꺼번에 조립’을 눌러 일관성을 맞추세요.`,
    };
  }
  const unreadyCuts = doc.cuts.filter((c) => !c.renderReady).length;
  if (unreadyCuts > 0) {
    return {
      stepLabel: "4단계 · 콘티 조립",
      messageKo: `남은 빈 컷 ${unreadyCuts}개를 한꺼번에 조립하고 말풍선을 올려 보세요.`,
    };
  }
  return {
    stepLabel: "5단계 · 원고 인계 준비 완료",
    messageKo: "글콘티(.txt)를 내려받거나 ‘회차 줄거리에 반영하기’로 바로 2D 원고 작업에 넘기세요.",
  };
}

export function PlotrStoryAtelierWorkbench({
  projectId,
  activeEpisodePlan = null,
  onApplyToEpisodePlan,
  storyboardHref = null,
}: PlotrStoryAtelierWorkbenchProps) {
  const [doc, setDoc] = useState<PlotrDocumentState>(() =>
    loadPlotrDocumentSync(projectId),
  );
  const [expertMode, setExpertMode] = useState(false);
  const [activeTab, setActiveTab] = useState<ExpertSubTab>("cuts");
  const [showScriptHelper, setShowScriptHelper] = useState(false);
  const [rewriteDirective, setRewriteDirective] = useState("");
  const [noticeKo, setNoticeKo] = useState<string | null>(null);
  const [exportedContiPreview, setExportedContiPreview] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadPlotrDocument(projectId).then((loaded) => {
      if (alive) setDoc(loaded);
    });
    const onExternalUpdate = (event: Event) => {
      if (!(event instanceof CustomEvent) || !event.detail) return;
      const incoming = event.detail as Partial<PlotrDocumentState>;
      if (incoming.projectId === projectId && incoming.schemaVersion === 1) {
        setDoc(incoming as PlotrDocumentState);
      }
    };
    window.addEventListener(STUDIO_PLOTR_UPDATED_EVENT, onExternalUpdate);
    return () => {
      alive = false;
      window.removeEventListener(STUDIO_PLOTR_UPDATED_EVENT, onExternalUpdate);
    };
  }, [projectId]);

  const commitDocument = useCallback(
    (
      updater: (prev: PlotrDocumentState) => PlotrDocumentState,
      feedback?: string,
    ) => {
      setDoc((prev) => {
        const next = updater(prev);
        void savePlotrDocument(next);
        return next;
      });
      if (feedback) setNoticeKo(feedback);
    },
    [],
  );

  const guide = useMemo(() => resolveBeginnerGuideStep(doc), [doc]);

  const handleApplyGenreTemplate = (templateId: PlotrGenreTemplateId) => {
    const seeded = createPlotrDocumentFromTemplate(projectId, templateId);
    commitDocument(
      () => seeded,
      `‘${seeded.title}’ 샘플로 대본·${seeded.cuts.length}컷·소재·타임라인·공간 보드를 한 번에 채웠어요.`,
    );
    setExportedContiPreview(null);
  };

  const handleGenerateFourCutFromIdea = (idea: string) => {
    commitDocument(
      (prev) =>
        generateFourCutWebtoonFromIdea({
          idea,
          projectId,
          format: prev.format,
          baseDocument: prev,
        }),
      "한 문장 아이디어로 4컷 비주얼 웹툰·인물 바이블·구도·말풍선을 즉시 조립했어요.",
    );
    setExportedContiPreview(null);
  };

  const handleGenerateDraftFromHelper = () => {
    const draft = generatePlotrScriptDraft(doc.helper);
    commitDocument(
      (prev) => ({
        ...prev,
        rawScript: draft,
        title: prev.title === "새 이야기 콘티" ? `${prev.helper.genre} 1화 콘티` : prev.title,
      }),
      "고른 태그와 소재로 대본 초안을 작성했어요. 아래에서 자유롭게 고쳐 보세요.",
    );
  };

  const handleApplyRewrite = (directive: string) => {
    if (!directive.trim() || !doc.rawScript.trim()) return;
    commitDocument(
      (prev) => ({
        ...prev,
        rawScript: revisePlotrScriptByDirective(prev.rawScript, directive),
      }),
      `‘${directive.trim()}’ 방향으로 대본을 다듬었어요.`,
    );
    setRewriteDirective("");
  };

  const handleExtractCharacters = () => {
    const extracted = extractConsistencyAssetsFromScript(doc.rawScript, doc.assets);
    const addedCount = extracted.length - doc.assets.length;
    commitDocument(
      (prev) => ({ ...prev, assets: extracted }),
      addedCount > 0
        ? `대본에서 인물·장소·소품 ${addedCount}건을 찾아 일관성 줄에 올렸어요.`
        : "대본의 주요 인물·장소가 이미 일관성 줄에 등록되어 있어요.",
    );
  };

  const handleSplitScriptToCuts = () => {
    const enrichedAssets = extractConsistencyAssetsFromScript(doc.rawScript, doc.assets);
    const nextCuts = parseScriptToPlotrCuts({
      script: doc.rawScript,
      format: doc.format,
      inputMode: doc.inputMode,
      worldSettingNote: doc.helper.worldSettingNote,
      assets: enrichedAssets,
      panelBorderEnabled: doc.panelBorderEnabled,
      panelBorderWidthPx: doc.panelBorderWidthPx,
    });
    const derivedScenes =
      doc.scenes.length > 0
        ? doc.scenes
        : nextCuts.map((cut, idx) => ({
            id: `scene-from-cut-${idx + 1}`,
            episodeId: activeEpisodePlan?.episodeId ?? "ep-1",
            title: `${cut.sceneTitle} · ${cut.emotionBeat}`,
            body: [
              cut.actionSummary,
              ...cut.dialogues.map((d) =>
                d.kind === "narration" ? `(나레이션) ${d.text}` : `${d.speaker}: "${d.text}"`,
              ),
            ].join("\n"),
            cutNotes: cut.cameraShot,
            orderIndex: idx,
          }));
    commitDocument(
      (prev) => ({
        ...prev,
        assets: enrichedAssets,
        cuts: nextCuts,
        scenes: derivedScenes,
      }),
      `${PLOTR_FORMAT_META[doc.format].labelKo} 형식으로 ${nextCuts.length}컷을 나누고 소재를 연결했어요.`,
    );
  };

  const handleExportTextConti = () => {
    const txt = exportPlotrTextConti(doc);
    setExportedContiPreview(txt);
    setNoticeKo("글콘티(.txt)를 만들었어요. 그림이 없어도 바로 복사·저장할 수 있어요.");
  };

  const handleApplyToEpisode = () => {
    if (!activeEpisodePlan || !onApplyToEpisodePlan) return;
    const patch = buildEpisodePlanPatchFromPlotr(activeEpisodePlan, doc);
    const saved = onApplyToEpisodePlan(patch);
    if (saved !== false) {
      setNoticeKo(
        `${activeEpisodePlan.episodeNumber}화 줄거리·핵심 사건(${patch.turningPoints.length}컷)·마무리 훅에 반영해 저장했어요.`,
      );
    }
  };

  return (
    <section
      aria-label="플로터 스토리 아틀리에"
      data-testid="plotr-story-atelier-workbench"
      data-mode={expertMode ? "expert" : "simple"}
      className="plotr-atelier-root text-fg [word-break:keep-all]"
    >
      <div className="plotr-spectrum-ribbon" aria-hidden="true" />

      <div className="space-y-4 p-4 sm:p-5">
        {/* 상단 헤더: 간편 모드(기본) ↔ 전문가 도구 원탭 전환 */}
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base font-bold tracking-tight text-fg">
              스토리 · 컷 콘티 아틀리에
            </h2>
            <p className="text-xs leading-relaxed text-fg-2">
              한 줄 아이디어와 대본을 컷으로 나누고, 인물·배경 일관성을 고정해 원고로 바로 넘겨요.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="plotr-toggle-expert-mode"
              aria-pressed={expertMode}
              onClick={() => setExpertMode((prev) => !prev)}
              className={`${BTN} ${
                expertMode
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg hover:bg-raised"
              }`}
            >
              <SlidersHorizontal className="size-3.5" aria-hidden="true" />
              <span>{expertMode ? "간편 모드로 접기" : "전문가 도구 열기"}</span>
            </button>
          </div>
        </header>

        {/* 현재 화면 길잡이 (1줄 직관 행동 안내) */}
        <div
          role="region"
          aria-label="지금 할 일 길잡이"
          data-testid="plotr-beginner-guide"
          className="plotr-guide-strip flex flex-wrap items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-xs"
        >
          <div className="flex items-center gap-2">
            <Compass className="size-4 shrink-0 text-accent" aria-hidden="true" />
            <span>
              <strong className="font-bold text-accent">{guide.stepLabel}</strong>
              <span className="ml-2 text-fg">{guide.messageKo}</span>
            </span>
          </div>
          {doc.cuts.length > 0 ? (
            <span className="tabular-nums text-fg-2">
              {doc.cuts.length}컷 · 소재 {doc.assets.length}건
            </span>
          ) : null}
        </div>

        {/* 1문장 아이디어 → 4컷 비주얼 웹툰 즉시 생성 바 */}
        <PlotrIdeaToWebtoonBar
          initialIdea={doc.helper.logline}
          cutCount={doc.cuts.length}
          onGenerateFromIdea={handleGenerateFourCutFromIdea}
        />

        {/* 1클릭 장르 샘플 시작 카드 4종 */}
        <section aria-label="장르 샘플로 바로 시작하기" className="space-y-2">
          <h3 className="text-xs font-bold text-fg-2">
            처음이라면 장르 샘플 1클릭으로 바로 체험해 보세요
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {PLOTR_GENRE_TEMPLATES.map((tpl) => {
              const active = doc.templateId === tpl.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  data-testid={`plotr-template-${tpl.id}`}
                  data-active={active ? "true" : "false"}
                  style={{ ["--tpl-accent" as string]: tpl.accentOklch }}
                  onClick={() => handleApplyGenreTemplate(tpl.id)}
                  className="plotr-template-card flex min-h-11 flex-col items-start gap-1 rounded-xl p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-xs font-bold text-fg">{tpl.labelKo} 시작하기</span>
                    <span className="text-[11px] font-medium text-fg-3">{tpl.badgeKo}</span>
                  </div>
                  <p className="line-clamp-2 text-xs leading-relaxed text-fg-2">
                    {tpl.summaryKo}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* 대본 작성 & 컷 나누기 핵심 카드 */}
        <section
          aria-label="대본 입력과 컷 나누기"
          className="space-y-3 rounded-xl border border-line bg-card p-3.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div role="group" aria-label="출력 형식" className="flex flex-wrap gap-1.5">
              {(Object.keys(PLOTR_FORMAT_META) as PlotrOutputFormat[]).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  aria-pressed={doc.format === fmt}
                  data-testid={`plotr-format-${fmt}`}
                  onClick={() =>
                    commitDocument((prev) => ({ ...prev, format: fmt }))
                  }
                  className={`${BTN} ${
                    doc.format === fmt
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-panel text-fg-2 hover:text-fg"
                  }`}
                >
                  {PLOTR_FORMAT_META[fmt].shortKo}
                </button>
              ))}
            </div>

            <button
              type="button"
              data-testid="plotr-open-script-helper"
              onClick={() => setShowScriptHelper((v) => !v)}
              className={`${BTN} border-line bg-panel text-fg hover:bg-raised`}
            >
              <Wand2 className="size-3.5 text-accent" aria-hidden="true" />
              <span>{showScriptHelper ? "대본 도우미 닫기" : "대본이 없어요 · 초안 만들기"}</span>
            </button>
          </div>

          {showScriptHelper ? (
            <PlotrScriptHelperDrawer
              document={doc}
              onUpdateDocument={commitDocument}
              onGenerateDraft={handleGenerateDraftFromHelper}
              onExtractCharacters={handleExtractCharacters}
            />
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-2">
            <span>{PLOTR_FORMAT_META[doc.format].hintKo}</span>
            <div role="group" aria-label="입력 글 형식" className="inline-flex gap-1">
              {(["script", "webnovel-story"] as PlotrInputMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={doc.inputMode === mode}
                  onClick={() =>
                    commitDocument((prev) => ({ ...prev, inputMode: mode }))
                  }
                  className={`${BTN} ${
                    doc.inputMode === mode
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {mode === "script" ? "대본([컷 1])" : "소설 문장"}
                </button>
              ))}
            </div>
          </div>

          <textarea
            rows={5}
            data-testid="plotr-script-textarea"
            aria-label="대본 또는 줄거리 원고 입력"
            value={doc.rawScript}
            onChange={(e) =>
              commitDocument((prev) => ({ ...prev, rawScript: e.target.value }))
            }
            placeholder="[컷 1] 장면 설명과 대사를 적거나 소설 문장을 그대로 붙여 넣으세요."
            className="w-full rounded-xl border border-line bg-panel p-3 text-xs leading-relaxed text-fg placeholder:text-fg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />

          {/* 핵심 액션 3종 (모바일에서도 한눈에 들어오게 정리) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="plotr-split-cuts-btn"
              disabled={!doc.rawScript.trim()}
              title={!doc.rawScript.trim() ? "대본을 입력하거나 위 샘플을 먼저 선택해 주세요" : undefined}
              onClick={handleSplitScriptToCuts}
              className={`${BTN} border-accent bg-accent text-on-accent disabled:opacity-40`}
            >
              대본을 컷으로 나누기
            </button>

            <button
              type="button"
              data-testid="plotr-export-conti-btn"
              disabled={doc.cuts.length === 0}
              title={doc.cuts.length === 0 ? "먼저 컷을 나눠 주세요" : undefined}
              onClick={handleExportTextConti}
              className={`${BTN} border-line bg-panel text-fg hover:bg-raised disabled:opacity-40`}
            >
              <Download className="size-3.5" aria-hidden="true" />
              <span>글콘티(.txt) 뽑기</span>
            </button>

            {activeEpisodePlan && onApplyToEpisodePlan ? (
              <button
                type="button"
                data-testid="plotr-apply-episode-plan-btn"
                disabled={doc.cuts.length === 0}
                title={doc.cuts.length === 0 ? "먼저 컷을 나눠 주세요" : undefined}
                onClick={handleApplyToEpisode}
                className={`${BTN} border-accent/50 bg-accent-soft text-accent disabled:opacity-40`}
              >
                <Send className="size-3.5" aria-hidden="true" />
                <span>{activeEpisodePlan.episodeNumber}화 줄거리에 반영하기</span>
              </button>
            ) : null}

            {storyboardHref ? (
              <Link
                href={storyboardHref}
                className={`${BTN} border-line bg-panel text-fg hover:bg-raised`}
              >
                2D 원고 컷으로 넘기기
              </Link>
            ) : null}
          </div>

          {expertMode && doc.rawScript.trim() ? (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
              <input
                type="text"
                value={rewriteDirective}
                onChange={(e) => setRewriteDirective(e.target.value)}
                placeholder="지시문으로 대본 다듬기 (예: 주인공을 더 냉소적으로)"
                aria-label="대본 수정 지시문"
                className="min-h-11 min-w-[14rem] flex-1 rounded-lg border border-line bg-panel px-2.5 text-xs text-fg"
              />
              <button
                type="button"
                disabled={!rewriteDirective.trim()}
                title={!rewriteDirective.trim() ? "수정 방향을 입력해 주세요" : undefined}
                onClick={() => handleApplyRewrite(rewriteDirective)}
                className={`${BTN} border-line bg-panel text-fg hover:bg-raised disabled:opacity-40`}
              >
                지시대로 다듬기
              </button>
              {PLOTR_REWRITE_DIRECTIVES.slice(0, 2).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleApplyRewrite(preset)}
                  className={`${BTN} border-line bg-panel text-fg-2 hover:text-fg`}
                >
                  {preset}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        {noticeKo ? (
          <p
            role="status"
            aria-live="polite"
            data-testid="plotr-status-notice"
            className="rounded-xl border border-line bg-card px-3.5 py-2.5 text-xs text-fg"
          >
            {noticeKo}
          </p>
        ) : null}

        {exportedContiPreview ? (
          <div className="space-y-1.5 rounded-xl border border-line bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-fg">글콘티(.txt) 미리보기</span>
              <button
                type="button"
                onClick={() => setExportedContiPreview(null)}
                className={`${BTN} border-line bg-panel text-fg-2`}
              >
                닫기
              </button>
            </div>
            <pre
              data-testid="plotr-text-conti-preview"
              className="max-h-48 overflow-auto overscroll-contain whitespace-pre-wrap rounded-lg border border-line bg-panel p-2.5 font-mono text-xs text-fg"
            >
              {exportedContiPreview}
            </pre>
          </div>
        ) : null}

        {/* 전문가 모드 탭 전환기 */}
        {expertMode ? (
          <div
            role="tablist"
            aria-label="전문가 스토리 도구 전환"
            className="flex flex-wrap gap-1.5"
          >
            {(
              [
                { id: "cuts", label: "컷 · 소재 · 그림체", icon: Sparkles },
                { id: "scrivenings", label: "연속 대본 · 스냅샷 · 설정 탐지", icon: FileText },
                { id: "subway", label: "이중 지하철 타임라인", icon: GitMerge },
                { id: "spatial", label: "자유 공간 스토리보드", icon: LayoutGrid },
              ] as const
            ).map(({ id, label, icon: Icon }) => {
              const selected = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  data-testid={`plotr-expert-tab-${id}`}
                  onClick={() => setActiveTab(id)}
                  className={`${BTN} ${
                    selected
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
                  }`}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {/* 본문 패널: 간편 모드에서는 컷·소재 보드만 깔끔하게 표시 */}
        {!expertMode || activeTab === "cuts" ? (
          <PlotrCutStripAndAssetsPane
            document={doc}
            expertMode={expertMode}
            onUpdateDocument={commitDocument}
          />
        ) : (
          <Suspense
            fallback={
              <p role="status" className="rounded-xl border border-line bg-card p-4 text-xs text-fg-2">
                도구를 여는 중…
              </p>
            }
          >
            {activeTab === "scrivenings" ? (
              <LazyScriveningsCodexView
                scenes={doc.scenes}
                snapshots={doc.sceneSnapshots}
                codexEntries={doc.codexEntries}
                onChange={({ scenes, snapshots }) =>
                  commitDocument((prev) => ({
                    ...prev,
                    scenes,
                    sceneSnapshots: snapshots,
                  }))
                }
              />
            ) : activeTab === "subway" ? (
              <LazyDualSubwayTimelineView
                document={doc.subwayTimeline}
                onChange={(subwayTimeline) =>
                  commitDocument((prev) => ({ ...prev, subwayTimeline }))
                }
              />
            ) : (
              <LazySpatialBoardView
                document={doc.spatialBoard}
                onChange={(spatialBoard) =>
                  commitDocument((prev) => ({ ...prev, spatialBoard }))
                }
              />
            )}
          </Suspense>
        )}
      </div>
    </section>
  );
}

export default PlotrStoryAtelierWorkbench;
