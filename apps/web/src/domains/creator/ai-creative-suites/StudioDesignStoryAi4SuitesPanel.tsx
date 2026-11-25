import { ArrowDown, ArrowUp, CheckCircle2, Feather, Film, Layers, LayoutGrid, Lock, Wand2 } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import {
  CANVA_BRAND_KIT_PRESETS,
  generateMagicDesignLayout,
  planMagicEraserMask,
  planMagicExpandCanvas,
  planMagicGrabSeparation,
  runMagicSwitchReflow,
  runMagicWriteZeroBill,
  type MagicDesignFormat,
  type MagicWriteKind,
  type MagicWriteResult,
} from "./canva-magic-studio-engine";
import {
  auditDesignSystemAndBubbleContrast,
  exportAutoLayoutBridge,
  generateFirstDraftAutoLayout,
  smartRenameAndOrganizeLayers,
  type FirstDraftMode,
  type RawLayerInput,
  type SpeechBubbleContrastPair,
} from "./figma-ai-layout-engine";
import {
  buildPlotrLayoutAndLineCleanupPlan,
  compilePlotrStoryboardFromScript,
  createCharacterIdentityAnchor,
  createInitialTooningRegistry,
  generateTooningMagicPanels,
  IDENTITY_LOCK_ANGLES,
  importPersonaChatLogToCuts,
  KWEBTOON_EXPRESSION_POSE_CARDS,
  reorderTooningPanels,
  swapExpressionPoseCard,
  verifySixAngleIdentityConsistency,
  type AngleObservationInput,
} from "./tooning-plotr-story-engine";

type SuiteTabId = "canva" | "figma" | "tooning" | "plotr";

const SUITE_TABS: readonly { readonly id: SuiteTabId; readonly labelKo: string; readonly hintKo: string }[] = [
  { id: "canva", labelKo: "캔바 매직 디자인", hintKo: "썸네일·6종 규격 변환·홍보 카피" },
  { id: "figma", labelKo: "피그마 AI 레이아웃", hintKo: "자동 배치·레이어 정리·대비 점검" },
  { id: "tooning", labelKo: "투닝 매직 컷툰", hintKo: "4·8컷 자동 구성·20종 표정 카드" },
  { id: "plotr", labelKo: "플로터 AI 콘티", hintKo: "대본→콘티·영상 흐름·6앵글 유지" },
];

const SAMPLE_RAW_LAYERS: readonly RawLayerInput[] = [
  { id: "raw-1", name: "Rectangle 1", kind: "raster", zIndex: 0 },
  { id: "raw-2", name: "Vector 19", kind: "vector", zIndex: 1 },
  { id: "raw-3", name: "Layer 1 copy", kind: "raster", blendMode: "multiply", zIndex: 2 },
  { id: "raw-4", name: "Text 3", kind: "text", hasText: true, zIndex: 3 },
  { id: "raw-5", name: "Glow Copy 2", kind: "effect", blendMode: "screen", zIndex: 4 },
];

const SAMPLE_BUBBLE_CONTRAST_PAIRS: readonly SpeechBubbleContrastPair[] = [
  { id: "bubble-main", labelKo: "기본 대사 말풍선", foregroundOklch: "oklch(0.24 0.02 255)", backgroundOklch: "oklch(0.97 0.01 90)", fontSizePx: 18 },
  { id: "bubble-whisper", labelKo: "속삭임 연회색 말풍선 (보정 대상)", foregroundOklch: "oklch(0.68 0.03 255)", backgroundOklch: "oklch(0.95 0.01 90)", fontSizePx: 16 },
];

const DEFAULT_CHAT_LOG = [
  "서연: 잠깐, 오늘 왜 이렇게 늦었어? 비까지 오는데 우산도 없이 왔어?!",
  "도진: 미안… 3년 전에 잃어버렸던 시계를 찾다가 마지막 버스를 놓치고 말았어.",
  "서연: 진짜 찾은 거야? 어서 보여 줘!",
].join("\n");

const DEFAULT_EPISODE_SCRIPT = [
  "비가 내리는 서울 옥상 위, 젖은 바닥에 붉은 네온 불빛이 길게 번졌다.",
  "서연은 철조망 너머에서 3년 전 사라진 낡은 손목시계를 발견하고 숨을 멈췄다.",
  "\"잠깐, 이 시계… 분명 그날 밤 강물에 떨어졌을 텐데.\"",
  "바로 그때 등 뒤 철문이 세게 열리며 낯익은 그림자가 한 걸음 다가왔다.",
].join("\n");

export interface StudioDesignStoryAi4SuitesPanelProps {
  readonly projectTitle?: string;
  readonly fetchImpl?: typeof fetch;
}

export function StudioDesignStoryAi4SuitesPanel({ projectTitle, fetchImpl }: StudioDesignStoryAi4SuitesPanelProps) {
  const [activeTab, setActiveTab] = useState<SuiteTabId>("canva");

  const [canvaPrompt, setCanvaPrompt] = useState("비 오는 날 편의점 처마 밑에서 노란 우산을 건네는 감성 로맨스 1화 프로모");
  const [canvaFormat, setCanvaFormat] = useState<MagicDesignFormat>("promo-poster");
  const [selectedBrandId, setSelectedBrandId] = useState(CANVA_BRAND_KIT_PRESETS[0].id);
  const [brandLocked, setBrandLocked] = useState(true);
  const [showAllSixSwitch, setShowAllSixSwitch] = useState(false);
  const [writeKind, setWriteKind] = useState<MagicWriteKind>("promo-copy");
  const [magicWriteResult, setMagicWriteResult] = useState<MagicWriteResult | null>(null);
  const [writingCopy, setWritingCopy] = useState<"local" | "cloud" | null>(null);
  const cloudCopyNoticeId = useId();

  const [figmaPrompt, setFigmaPrompt] = useState("4컷 세로 웹툰 대치 장면과 상단 말풍선 구성");
  const [figmaMode, setFigmaMode] = useState<FirstDraftMode>("webtoon-panel-grid");
  const [renameApplied, setRenameApplied] = useState(false);
  const [contrastAutoFixed, setContrastAutoFixed] = useState(false);

  const [tooningStory, setTooningStory] = useState("지각 직전 비 오는 편의점 앞에서 전학 온 동창과 마주쳤다.");
  const [tooningCutCount, setTooningCutCount] = useState<4 | 8>(4);
  const [tooningPanels, setTooningPanels] = useState(() =>
    generateTooningMagicPanels({ oneSentenceStoryKo: "지각 직전 비 오는 편의점 앞에서 전학 온 동창과 마주쳤다.", cutCount: 4 }),
  );
  const [selectedPanelId, setSelectedPanelId] = useState("tooning-cut-1");
  const [chatLogInput, setChatLogInput] = useState(DEFAULT_CHAT_LOG);
  const tooningRegistry = useMemo(() => createInitialTooningRegistry(), []);

  const [plotrScript, setPlotrScript] = useState(DEFAULT_EPISODE_SCRIPT);
  const [readingMode, setReadingMode] = useState<"vertical-scroll" | "page-z-flow">("vertical-scroll");
  const [simulateAngleDrift, setSimulateAngleDrift] = useState(false);

  const activeBrandKit = useMemo(() => {
    const preset = CANVA_BRAND_KIT_PRESETS.find((item) => item.id === selectedBrandId) ?? CANVA_BRAND_KIT_PRESETS[0];
    return { ...preset, locked: brandLocked };
  }, [selectedBrandId, brandLocked]);

  const canvaDoc = useMemo(
    () => generateMagicDesignLayout({ promptKo: canvaPrompt, format: canvaFormat, brandKit: activeBrandKit, titleKo: projectTitle }),
    [canvaPrompt, canvaFormat, activeBrandKit, projectTitle],
  );
  const magicSwitchResults = useMemo(() => runMagicSwitchReflow(canvaDoc), [canvaDoc]);
  const magicGrabPlan = useMemo(() => planMagicGrabSeparation(canvaDoc, "주인공 인물 레이어"), [canvaDoc]);
  const magicEraserPlan = useMemo(
    () => planMagicEraserMask(canvaDoc.canvas.width, canvaDoc.canvas.height, [{ x: 520, y: 180, width: 140, height: 110, labelKo: "배경 행인" }]),
    [canvaDoc.canvas.width, canvaDoc.canvas.height],
  );
  const magicExpandPlan = useMemo(
    () => planMagicExpandCanvas({ sourceWidth: canvaDoc.canvas.width, sourceHeight: canvaDoc.canvas.height, targetWidth: Math.max(canvaDoc.canvas.width, 1920), targetHeight: Math.max(canvaDoc.canvas.height, 1350) }),
    [canvaDoc.canvas.width, canvaDoc.canvas.height],
  );

  const figmaDraft = useMemo(() => generateFirstDraftAutoLayout({ promptKo: figmaPrompt, mode: figmaMode }), [figmaPrompt, figmaMode]);
  const renameReport = useMemo(() => smartRenameAndOrganizeLayers(SAMPLE_RAW_LAYERS), []);
  const contrastPairs = useMemo(
    () => (contrastAutoFixed ? SAMPLE_BUBBLE_CONTRAST_PAIRS.map((p) => (p.id === "bubble-whisper" ? { ...p, foregroundOklch: "oklch(0.45 0.02 255)" } : p)) : SAMPLE_BUBBLE_CONTRAST_PAIRS),
    [contrastAutoFixed],
  );
  const designAudit = useMemo(() => auditDesignSystemAndBubbleContrast(figmaDraft, contrastPairs), [figmaDraft, contrastPairs]);
  const figmaBridge = useMemo(() => exportAutoLayoutBridge(figmaDraft), [figmaDraft]);

  const personaCuts = useMemo(() => importPersonaChatLogToCuts(chatLogInput), [chatLogInput]);
  const selectedPanel = tooningPanels.find((panel) => panel.panelId === selectedPanelId) ?? tooningPanels[0];

  const plotrStoryboard = useMemo(() => compilePlotrStoryboardFromScript(plotrScript, projectTitle || "1화 콘티 초안"), [plotrScript, projectTitle]);
  const plotrLayoutPlan = useMemo(() => buildPlotrLayoutAndLineCleanupPlan(plotrStoryboard, readingMode), [plotrStoryboard, readingMode]);
  const identityReport = useMemo(() => {
    const anchor = createCharacterIdentityAnchor({ characterId: "lead-seoyeon", nameKo: "한서연" });
    const observations: AngleObservationInput[] = IDENTITY_LOCK_ANGLES.map((spec) => ({
      angle: spec.angle,
      observedFaceRatio: simulateAngleDrift && spec.angle === "low-angle" ? { eyeSpacingRatio: 0.56, jawRatio: 0.74, headToBodyRatio: 6.4 } : anchor.faceRatio,
      observedHairSilhouetteToken: anchor.hairSilhouetteToken,
      observedOutfitTokens: simulateAngleDrift && spec.angle === "back" ? ["beige-trench"] : anchor.outfitTokens,
      observedPaletteOklch: anchor.paletteOklch,
    }));
    return verifySixAngleIdentityConsistency(anchor, observations);
  }, [simulateAngleDrift]);

  const handleRunMagicWrite = async (target: "local" | "cloud") => {
    if (writingCopy) return;
    setWritingCopy(target);
    try {
      const response = await runMagicWriteZeroBill({
        kind: writeKind,
        promptKo: canvaPrompt,
        projectTitle,
        toneKo: activeBrandKit.toneKo,
        offlineOnly: target === "local",
      }, { fetchImpl });
      setMagicWriteResult(response);
    } finally {
      setWritingCopy(null);
    }
  };

  const handleRegenerateTooning = (nextCount: 4 | 8) => {
    setTooningCutCount(nextCount);
    const created = generateTooningMagicPanels({ oneSentenceStoryKo: tooningStory, cutCount: nextCount, characters: tooningRegistry.characters });
    setTooningPanels(created);
    if (created[0]) setSelectedPanelId(created[0].panelId);
  };

  return (
    <section
      data-testid="studio-design-story-4suites-panel"
      aria-labelledby="studio-design-story-4suites-heading"
      className="mt-3 rounded-2xl border border-line bg-canvas p-4 [word-break:keep-all]"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3">
        <div>
          <p className="inline-flex items-center gap-1.5 text-xs font-bold text-accent">
            <Feather size={14} aria-hidden="true" />
            무과금 로컬 디자인·스토리 창작 도구 (₩0)
          </p>
          <h4 id="studio-design-story-4suites-heading" className="mt-1 text-base font-extrabold text-fg">
            디자인·스토리 AI 4대 스튜디오
          </h4>
          <p className="mt-0.5 text-xs leading-5 text-fg-2">
            썸네일·자동 레이아웃·컷툰·웹소설 콘티까지 유료 결제 없이 바로 초안을 만들고 편집해 보세요.
          </p>
        </div>
        <span className="inline-flex min-h-9 items-center rounded-full border border-success/35 bg-success-soft/20 px-3 text-xs font-bold text-success tabular-nums">
          유료 호출 0건 · ₩0 보장
        </span>
      </div>

      <div role="tablist" aria-label="디자인·스토리 AI 4대 스튜디오 탭" className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {SUITE_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`suite-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`suite-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex min-h-11 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                active ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-2 hover:border-accent/50 hover:text-fg",
              )}
            >
              <span className="text-xs font-extrabold">{tab.labelKo}</span>
              <span className={cn("mt-0.5 text-[0.7rem]", active ? "text-on-accent/90" : "text-fg-3")}>{tab.hintKo}</span>
            </button>
          );
        })}
      </div>

      {activeTab === "canva" ? (
        <div id="suite-panel-canva" role="tabpanel" aria-labelledby="suite-tab-canva" className="mt-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="md:col-span-2">
              <label htmlFor="canva-prompt-input" className="block text-xs font-bold text-fg">한 줄로 원하는 디자인 설명하기</label>
              <input id="canva-prompt-input" type="text" value={canvaPrompt} onChange={(e) => setCanvaPrompt(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/25" />
            </div>
            <div>
              <label htmlFor="canva-format-select" className="block text-xs font-bold text-fg">기본 제작 용도</label>
              <select id="canva-format-select" value={canvaFormat} onChange={(e) => setCanvaFormat(e.target.value as MagicDesignFormat)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg outline-none transition-colors focus:border-accent">
                <option value="episode-thumbnail">회차 썸네일 (800×1280)</option>
                <option value="promo-poster">프로모 포스터 (1080×1350)</option>
                <option value="sns-card">SNS 홍보 카드 (1080×1350)</option>
                <option value="episode-banner">에피소드 배너 (1920×1080)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel/70 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="canva-brand-select" className="text-xs font-bold text-fg">브랜드 색상·글꼴 세트</label>
              <select id="canva-brand-select" value={selectedBrandId} onChange={(e) => setSelectedBrandId(e.target.value)} className="min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg">
                {CANVA_BRAND_KIT_PRESETS.map((kit) => (
                  <option key={kit.id} value={kit.id}>{kit.nameKo} ({kit.headingFontKo})</option>
                ))}
              </select>
              <button type="button" aria-pressed={brandLocked} onClick={() => setBrandLocked((prev) => !prev)} className={buttonClass({ variant: brandLocked ? "solid" : "outline", size: "sm", className: "min-h-11 gap-1.5" })}>
                <Lock size={14} aria-hidden="true" />
                {brandLocked ? "브랜드 잠금 켜짐" : "브랜드 잠금 꺼짐"}
              </button>
            </div>
            <button type="button" onClick={() => setShowAllSixSwitch((prev) => !prev)} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })}>
              <LayoutGrid size={14} aria-hidden="true" />
              {showAllSixSwitch ? "6종 규격 미리보기 접기" : "원클릭 6종 규격 자동 변환"}
            </button>
          </div>

          <div className="rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm font-extrabold text-fg">{canvaDoc.copyDraft.headlineKo}</strong>
              <span className="text-xs font-semibold text-fg-2 tabular-nums">
                {canvaDoc.canvas.width}×{canvaDoc.canvas.height} · {canvaDoc.moodLabelKo} · 레이어 {canvaDoc.layers.length}개
              </span>
            </div>
            <p className="mt-1 text-xs text-fg-3">
              글꼴: {canvaDoc.brandKit.headingFontKo} / {canvaDoc.brandKit.bodyFontKo} · 상단 배지 “{canvaDoc.copyDraft.badgeKo}” · 버튼 “{canvaDoc.copyDraft.ctaKo}”
            </p>
          </div>

          {showAllSixSwitch ? (
            <div data-testid="canva-magic-switch-grid" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {magicSwitchResults.map((item) => (
                <article key={item.targetId} className="rounded-xl border border-line bg-card p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="font-extrabold text-fg">{item.labelKo}</strong>
                    <span className="font-semibold text-accent tabular-nums">{item.width}×{item.height}</span>
                  </div>
                  <p className="mt-1 text-fg-2">{item.layoutStrategyKo}</p>
                  <p className="mt-1.5 text-[0.7rem] text-success tabular-nums">
                    안전 여백 유지 {item.safeZonePreserved ? "완료" : "점검 필요"} · 글자 배율 {item.fontScaleRatio}x
                  </p>
                </article>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel/60 p-3">
            <label htmlFor="canva-write-kind" className="text-xs font-bold text-fg">무과금 글쓰기 종류</label>
            <select id="canva-write-kind" value={writeKind} onChange={(e) => setWriteKind(e.target.value as MagicWriteKind)} className="min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg">
              <option value="promo-copy">홍보 카피</option>
              <option value="episode-synopsis">회차 시놉시스</option>
              <option value="sns-post">SNS 홍보글</option>
              <option value="title-ab">제목 A/B 후보</option>
            </select>
            <button
              type="button"
              disabled={writingCopy !== null}
              onClick={() => void handleRunMagicWrite("local")}
              className={buttonClass({ variant: "solid", size: "sm", className: "min-h-11 gap-1.5" })}
            >
              <Wand2 size={14} aria-hidden="true" />
              {writingCopy === "local" ? "이 기기에서 만드는 중…" : "이 기기에서 ₩0 홍보 카피 만들기"}
            </button>
            <button
              type="button"
              disabled={writingCopy !== null}
              aria-describedby={cloudCopyNoticeId}
              onClick={() => void handleRunMagicWrite("cloud")}
              className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
            >
              {writingCopy === "cloud" ? "무료 클라우드에 요청 중…" : "무료 클라우드로 초안 만들기"}
            </button>
            <p id={cloudCopyNoticeId} className="basis-full text-xs leading-5 text-fg-3">
              무료 클라우드를 고르면 문구, 작품 제목, 브랜드 말투를 서버에 보냅니다. 무료 AI를 이용할 수 없으면 이 기기에서 만듭니다.
            </p>
          </div>

          {magicWriteResult ? (
            <div data-testid="canva-magic-write-result" className="rounded-xl border border-accent/35 bg-card p-3 text-xs">
              <p className="font-extrabold text-fg">{magicWriteResult.headlineKo}</p>
              <ul className="mt-1.5 space-y-1 text-fg-2">
                {magicWriteResult.variantsKo.map((line, idx) => <li key={`mw-${idx}`}>• {line}</li>)}
              </ul>
              <p className="mt-1.5 text-[0.7rem] text-fg-3 tabular-nums">
                {magicWriteResult.hashtagsKo.join(" ")} · 총 {magicWriteResult.characterCount}자 · 비용 ₩0
              </p>
              <p role="status" className="mt-1.5 text-xs leading-5 text-fg-2">
                {magicWriteResult.providerTier === "cloud-free" ? "무료 클라우드에서 생성" : "이 기기에서 생성"}
                {magicWriteResult.noticeKo ? ` · ${magicWriteResult.noticeKo}` : null}
              </p>
            </div>
          ) : null}

          <details className="rounded-xl border border-line bg-panel/50 p-3 text-xs">
            <summary className="cursor-pointer font-bold text-fg">고급 편집 도구 보기 (피사체 분리 · 불필요 요소 지우개 · 캔버스 확장)</summary>
            <div className="mt-2.5 grid gap-2 md:grid-cols-3">
              <div className="rounded-lg border border-line bg-card p-2.5">
                <strong className="text-fg">전경·배경 자동 분리</strong>
                <p className="mt-1 text-fg-2 tabular-nums">{magicGrabPlan.foregroundLayer.labelKo} (경계 {magicGrabPlan.foregroundLayer.featherRadiusPx}px)</p>
                <p className="mt-1 text-fg-3">{magicGrabPlan.backgroundInpaintLayer.continuityStrategyKo}</p>
              </div>
              <div className="rounded-lg border border-line bg-card p-2.5">
                <strong className="text-fg">불필요 요소 지우개</strong>
                <p className="mt-1 text-fg-2 tabular-nums">{magicEraserPlan.summaryKo}</p>
              </div>
              <div className="rounded-lg border border-line bg-card p-2.5">
                <strong className="text-fg">배경 캔버스 확장</strong>
                <p className="mt-1 text-fg-2 tabular-nums">{magicExpandPlan.strategyKo}</p>
              </div>
            </div>
          </details>
        </div>
      ) : null}

      {activeTab === "figma" ? (
        <div id="suite-panel-figma" role="tabpanel" aria-labelledby="suite-tab-figma" className="mt-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="md:col-span-2">
              <label htmlFor="figma-prompt-input" className="block text-xs font-bold text-fg">만들고 싶은 컷 배치나 화면 설명</label>
              <input id="figma-prompt-input" type="text" value={figmaPrompt} onChange={(e) => setFigmaPrompt(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg outline-none transition-colors focus:border-accent" />
            </div>
            <div>
              <label htmlFor="figma-mode-select" className="block text-xs font-bold text-fg">초안 형태</label>
              <select id="figma-mode-select" value={figmaMode} onChange={(e) => setFigmaMode(e.target.value as FirstDraftMode)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg">
                <option value="webtoon-panel-grid">웹툰 컷 그리드</option>
                <option value="dialogue-overlay">말풍선·대사 구성</option>
                <option value="game-app-hud">게임·앱 HUD 화면</option>
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-card p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm font-extrabold text-fg">{figmaDraft.root.nameKo}</strong>
              <span className="text-fg-2 tabular-nums">{figmaDraft.root.widthPx}×{figmaDraft.root.heightPx} · 구성 요소 {figmaDraft.totalNodeCount}개</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {figmaDraft.root.children.map((child) => (
                <span key={child.id} className="rounded-lg border border-line bg-panel px-2.5 py-1 font-semibold text-fg-2 tabular-nums">
                  {child.nameKo} ({child.widthPx}×{child.heightPx})
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-line bg-card p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="flex items-center gap-1.5 font-extrabold text-fg"><Layers size={14} aria-hidden="true" />레이어 자동 이름 정리</strong>
                <button type="button" onClick={() => setRenameApplied((prev) => !prev)} className={buttonClass({ variant: renameApplied ? "solid" : "outline", size: "sm", className: "min-h-11" })}>
                  {renameApplied ? "정리 결과 적용됨" : "스튜디오 표준으로 정리"}
                </button>
              </div>
              <p className="mt-1.5 text-fg-2">{renameReport.summaryKo}</p>
              <ul className="mt-2 space-y-1 text-fg-2">
                {renameReport.renamedLayers.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between rounded-lg bg-panel/70 px-2.5 py-1.5">
                    <span className="text-fg-3">{entry.originalName}</span>
                    <span className="font-bold text-fg">{renameApplied ? entry.newNameKo : `→ ${entry.newNameKo}`}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-line bg-card p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="flex items-center gap-1.5 font-extrabold text-fg"><CheckCircle2 size={14} aria-hidden="true" />말풍선 가독성 대비 점검 (4.5:1)</strong>
                <button type="button" onClick={() => setContrastAutoFixed((prev) => !prev)} className={buttonClass({ variant: contrastAutoFixed ? "solid" : "outline", size: "sm", className: "min-h-11" })}>
                  {contrastAutoFixed ? "대비 보정 적용됨" : "부족한 대비 자동 보정"}
                </button>
              </div>
              <p className="mt-1.5 text-fg-2 tabular-nums">{designAudit.summaryKo}</p>
              <ul className="mt-2 space-y-1.5">
                {designAudit.contrastFindings.map((finding) => (
                  <li key={finding.id} className={cn("rounded-lg border px-2.5 py-2", finding.passesAa ? "border-success/35 bg-success-soft/15 text-fg" : "border-warning/40 bg-warning-soft/20 text-fg")}>
                    <div className="flex items-center justify-between font-bold tabular-nums">
                      <span>{finding.labelKo}</span>
                      <span>{finding.contrastRatio}:1 ({finding.passesAa ? "통과" : "보정 필요"})</span>
                    </div>
                    <p className="mt-0.5 text-[0.7rem] text-fg-2">{finding.adviceKo}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <details className="rounded-xl border border-line bg-panel/50 p-3 text-xs">
            <summary className="cursor-pointer font-bold text-fg">고급 내보내기 보기 (스타일 시트 · 구조 데이터 · 자동화 실행 단계)</summary>
            <div className="mt-2.5 space-y-2">
              <div className="rounded-lg border border-line bg-card p-2.5">
                <strong className="text-fg">자동화 실행 단계 ({figmaBridge.mcpToolChain.length}단계)</strong>
                <ol className="mt-1 space-y-1 text-fg-2 tabular-nums">
                  {figmaBridge.mcpToolChain.map((step) => <li key={step.step}>{step.step}. {step.purposeKo}</li>)}
                </ol>
              </div>
              <pre className="max-h-40 overflow-auto rounded-lg border border-line bg-card p-2.5 text-[0.7rem] text-fg-2">{figmaBridge.cssCode}</pre>
            </div>
          </details>
        </div>
      ) : null}

      {activeTab === "tooning" ? (
        <div id="suite-panel-tooning" role="tabpanel" aria-labelledby="suite-tab-tooning" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-60 flex-1">
              <label htmlFor="tooning-story-input" className="block text-xs font-bold text-fg">한 문장으로 컷툰 줄거리 쓰기</label>
              <input id="tooning-story-input" type="text" value={tooningStory} onChange={(e) => setTooningStory(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg outline-none transition-colors focus:border-accent" />
            </div>
            <button type="button" onClick={() => handleRegenerateTooning(4)} className={buttonClass({ variant: tooningCutCount === 4 ? "solid" : "outline", size: "sm", className: "min-h-11" })}>4컷 만들기</button>
            <button type="button" onClick={() => handleRegenerateTooning(8)} className={buttonClass({ variant: tooningCutCount === 8 ? "solid" : "outline", size: "sm", className: "min-h-11" })}>8컷 만들기</button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {tooningPanels.map((panel, index) => {
              const card = KWEBTOON_EXPRESSION_POSE_CARDS.find((item) => item.id === panel.expressionPoseCardId);
              const selected = selectedPanel?.panelId === panel.panelId;
              return (
                <article key={panel.panelId} className={cn("rounded-xl border p-3 text-xs transition-colors", selected ? "border-accent bg-accent-soft/25" : "border-line bg-card")}>
                  <div className="flex items-center justify-between gap-2">
                    <button type="button" onClick={() => setSelectedPanelId(panel.panelId)} className="min-h-11 text-left font-extrabold text-fg hover:underline">
                      <span className="tabular-nums">{index + 1}컷</span> · {panel.beatLabelKo}
                    </button>
                    <div className="flex items-center gap-1">
                      <button type="button" aria-label={`${index + 1}컷 위로 이동`} disabled={index === 0} onClick={() => setTooningPanels((prev) => reorderTooningPanels(prev, index, index - 1))} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 px-2" })}>
                        <ArrowUp size={13} aria-hidden="true" />
                      </button>
                      <button type="button" aria-label={`${index + 1}컷 아래로 이동`} disabled={index === tooningPanels.length - 1} onClick={() => setTooningPanels((prev) => reorderTooningPanels(prev, index, index + 1))} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 px-2" })}>
                        <ArrowDown size={13} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 font-semibold text-accent">{panel.characterNameKo} · 표정·포즈: {card?.labelKo ?? "기본 표정"}</p>
                  <p className="mt-1 text-fg">“{panel.dialogueKo}”</p>
                  <p className="mt-0.5 text-[0.7rem] text-fg-3">{panel.narrationKo}</p>
                </article>
              );
            })}
          </div>

          <div className="rounded-xl border border-line bg-panel/60 p-3 text-xs">
            <strong className="text-fg">20종 한국 웹툰 표정·포즈 카드 즉시 교체 ({selectedPanel?.beatLabelKo})</strong>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {KWEBTOON_EXPRESSION_POSE_CARDS.map((card) => {
                const active = selectedPanel?.expressionPoseCardId === card.id;
                return (
                  <button
                    key={card.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => { if (selectedPanel) setTooningPanels((prev) => swapExpressionPoseCard(prev, selectedPanel.panelId, card.id)); }}
                    className={cn("min-h-11 rounded-lg border px-2.5 text-xs font-semibold transition-colors", active ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-2 hover:border-accent/50 hover:text-fg")}
                  >
                    {card.labelKo}
                  </button>
                );
              })}
            </div>
          </div>

          <details className="rounded-xl border border-line bg-panel/50 p-3 text-xs">
            <summary className="cursor-pointer font-bold text-fg">대화 로그 말풍선 변환 & 단계별 캐릭터 분류 보기</summary>
            <div className="mt-2.5 grid gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="tooning-chat-input" className="block font-bold text-fg">캐릭터 대화 로그 (이름: 대사 형식)</label>
                <textarea id="tooning-chat-input" rows={3} value={chatLogInput} onChange={(e) => setChatLogInput(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-card p-2 text-xs text-fg" />
                <ul className="mt-1.5 space-y-1 text-fg-2">
                  {personaCuts.map((cut) => <li key={`pchat-${cut.cutIndex}`} className="rounded bg-card px-2 py-1 tabular-nums">{cut.cutIndex}컷 [{cut.speakerKo}] “{cut.bubbleTextKo}”</li>)}
                </ul>
              </div>
              <div className="rounded-lg border border-line bg-card p-2.5">
                <strong className="text-fg">등록된 단계별 캐릭터 분류</strong>
                <ul className="mt-1.5 space-y-1 text-fg-2 tabular-nums">
                  {tooningRegistry.categories.map((cat) => (
                    <li key={cat.id}>{cat.order + 1}. {cat.nameKo} (단계 {Object.values(cat.enabledSteps).filter(Boolean).length}/6 활성)</li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
        </div>
      ) : null}

      {activeTab === "plotr" ? (
        <div id="suite-panel-plotr" role="tabpanel" aria-labelledby="suite-tab-plotr" className="mt-4 space-y-3">
          <div>
            <label htmlFor="plotr-script-input" className="block text-xs font-bold text-fg">웹소설 1화 원문이나 대본 붙여넣기</label>
            <textarea id="plotr-script-input" rows={3} value={plotrScript} onChange={(e) => setPlotrScript(e.target.value)} className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-2 text-sm leading-6 text-fg outline-none transition-colors focus:border-accent" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel/70 p-3 text-xs">
            <span className="font-bold text-fg tabular-nums">{plotrStoryboard.scriptInsight.summaryKo}</span>
            <div className="flex items-center gap-1.5">
              <button type="button" aria-pressed={readingMode === "vertical-scroll"} onClick={() => setReadingMode("vertical-scroll")} className={buttonClass({ variant: readingMode === "vertical-scroll" ? "solid" : "outline", size: "sm", className: "min-h-11" })}>세로 스크롤</button>
              <button type="button" aria-pressed={readingMode === "page-z-flow"} onClick={() => setReadingMode("page-z-flow")} className={buttonClass({ variant: readingMode === "page-z-flow" ? "solid" : "outline", size: "sm", className: "min-h-11" })}>페이지 Z-동선</button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {plotrStoryboard.cuts.map((cut, idx) => {
              const box = plotrLayoutPlan.panelBoxes[idx];
              return (
                <article key={`plotr-cut-${cut.cutNumber}`} className="rounded-xl border border-line bg-card p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="font-extrabold text-fg tabular-nums">{cut.cutNumber}컷 · {cut.lensMm}mm ({cut.shotSize})</strong>
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 font-bold text-accent tabular-nums">긴장도 {cut.tensionScore}점</span>
                  </div>
                  <p className="mt-1 text-fg-2">{cut.visualBeatKo}</p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-panel">
                    <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${cut.tensionScore}%` }} />
                  </div>
                  <p className="mt-1.5 flex items-center gap-1 text-[0.7rem] text-fg-3 tabular-nums">
                    <Film size={12} aria-hidden="true" />
                    영상 전환: {cut.videoTransition.motionCueKo} · 다음 여백 {box?.gutterAfterPx ?? 180}px
                  </p>
                </article>
              );
            })}
          </div>

          <details className="rounded-xl border border-line bg-panel/50 p-3 text-xs">
            <summary className="cursor-pointer font-bold text-fg">6앵글 캐릭터 일관성 검증 & 3D 카메라·선화 정리 상세 보기</summary>
            <div className="mt-2.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-fg tabular-nums">{identityReport.nameKo} 6앵글 평균 일치도 {identityReport.overallConsistencyScore}%</span>
                <button type="button" onClick={() => setSimulateAngleDrift((prev) => !prev)} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}>
                  {simulateAngleDrift ? "정상 앵커 상태로 복구" : "작화 흔들림 감지 테스트"}
                </button>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-3">
                {identityReport.angleResults.map((item) => (
                  <div key={item.angle} className={cn("rounded-lg border p-2 tabular-nums", item.passed ? "border-success/35 bg-success-soft/15" : "border-warning/45 bg-warning-soft/20")}>
                    <div className="flex items-center justify-between font-bold text-fg">
                      <span>{item.labelKo}</span>
                      <span>{item.consistencyScore}%</span>
                    </div>
                    <p className={cn("mt-0.5 text-[0.68rem]", item.fixHintsKo[0] ? "text-fg-2" : "text-success")}>
                      {item.fixHintsKo[0] ?? "비율·의상·색감 고정 완료"}
                    </p>
                  </div>
                ))}
              </div>
              <p className="rounded-lg border border-line bg-card p-2 text-fg-2 tabular-nums">
                선화 정리 도우미: {plotrLayoutPlan.lineCleanup.summaryKo} (총 높이 {plotrLayoutPlan.totalHeightPx}px)
              </p>
            </div>
          </details>
        </div>
      ) : null}
    </section>
  );
}

export default StudioDesignStoryAi4SuitesPanel;
