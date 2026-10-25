/**
 * StudioDesignPlatformWorkbench.tsx — Canva · 미리캔버스 · 망고보드 · Polotno · Kittl ·
 * Adobe Express · VistaCreate · Pixlr 8대 플랫폼 역공학(REA) 내재화 통합 워크벤치.
 */

import {
  BookOpen,
  CheckCircle2,
  Layers,
  Maximize2,
  Palette,
  Sparkles,
  Type,
  Wand2,
} from "lucide-react";
import { type KeyboardEvent, useMemo, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  auditDesignPlatformPreflight,
  buildGoodsMockupSpec,
  computeWcagContrastRatio,
  DESIGN_PLATFORM_STYLE_SHUFFLE_PACKS,
  evaluateBrandGuardrailCompliance,
  generateBulkEpisodeArtifacts,
  shuffleSeriesStylePack,
  type BulkEpisodeRow,
  type CollaboratorRole,
  type DesignPlatformStyleShufflePack,
  type GoodsMockupPresetId,
  type StyleShufflePackId,
  type TeamPermissionFlag,
} from "./design-platform-brand-bulk-engine";
import {
  calculateTankobonSpreadSpec,
  computeVerticalScrollSlices,
  DESIGN_PLATFORM_FORMAT_PRESETS,
  executeBatchMagicSwitch,
  executeMagicSwitchResize,
  type DesignPlatformFormatId,
  type MagicSwitchSourceDocument,
  type TankobonPaperStock,
} from "./design-platform-magic-switch";
import {
  buildTitleLogoSvgMarkup,
  DESIGN_PLATFORM_TITLE_PRESETS,
  type TitleWarpCurveType,
  type WebtoonTitleGenreId,
} from "./design-platform-title-typography";
import {
  StudioDesignPlatformBrandTabPanel,
  StudioDesignPlatformBulkMockupTabPanel,
} from "./StudioDesignPlatformTabPanels";

export type DesignPlatformWorkbenchTabId =
  | "magic-switch"
  | "title-warp"
  | "brand-shuffle"
  | "bulk-mockup";

const SAMPLE_SOURCE_DOCUMENT: MagicSwitchSourceDocument = {
  id: "doc-webtoon-master",
  title: "회귀자의 시계탑 대표 키비주얼",
  widthPx: 900,
  heightPx: 1200,
  primaryFocalPoint: { x: 0.5, y: 0.36 },
  layers: [
    { id: "layer-bg", name: "메인 일러스트 배경", role: "background", x: 0, y: 0, width: 900, height: 1200 },
    { id: "layer-hero", name: "주인공 캐릭터 키아트", role: "character", x: 160, y: 180, width: 580, height: 820, focalPoint: { x: 0.5, y: 0.34 } },
    { id: "layer-title", name: "작품 타이틀 워드마크", role: "title-logo", x: 100, y: 920, width: 700, height: 160, fontSizePx: 54, text: "회귀자의 시계탑" },
    { id: "layer-badge", name: "독점 연재·연령 배지", role: "badge", x: 720, y: 48, width: 132, height: 54, fontSizePx: 18, locked: true },
  ],
};

const INITIAL_BULK_ROWS: readonly BulkEpisodeRow[] = [
  { episodeNumber: 1, episodeTitle: "회귀자의 시계탑", hookCopy: "이번 생에는 절대 늦지 않아.", releaseDate: "2026-10-26", featuredCharacter: "카셀", ageRating: "15+" },
  { episodeNumber: 2, episodeTitle: "황금빛 계약서", hookCopy: "네가 원하는 대가를 말해 봐.", releaseDate: "2026-11-02", featuredCharacter: "세르피나", ageRating: "15+" },
  { episodeNumber: 3, episodeTitle: "검붉은 성벽의 결투", hookCopy: "검 끝에서 번개가 갈라졌다!", releaseDate: "2026-11-09", featuredCharacter: "카셀", ageRating: "15+" },
];

export function StudioDesignPlatformWorkbench({
  projectId,
  compact = false,
  onApplyStylePackToSeriesKit,
}: {
  readonly projectId?: string;
  readonly compact?: boolean;
  readonly onApplyStylePackToSeriesKit?: (pack: DesignPlatformStyleShufflePack) => void;
}) {
  const bt = useBilingual("StudioDesignPlatformWorkbench");
  const [activeTab, setActiveTab] = useState<DesignPlatformWorkbenchTabId>("magic-switch");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Tab 1: Magic Switch & Tankobon & Scroll Slicer 상태
  const [targetFormatId, setTargetFormatId] =
    useState<DesignPlatformFormatId>("youtube-pv-16x9");
  const [paperStock, setPaperStock] = useState<TankobonPaperStock>("white-offset-100g");
  const [pageCount, setPageCount] = useState<number>(192);
  const [scrollTotalHeightPx, setScrollTotalHeightPx] = useState<number>(4800);

  // Tab 2: Title & Warp Typography 상태
  const [selectedTitlePresetId, setSelectedTitlePresetId] = useState<WebtoonTitleGenreId>(
    DESIGN_PLATFORM_TITLE_PRESETS[0]!.id,
  );
  const [titleText, setTitleText] = useState<string>("회귀자의 시계탑");
  const [warpModeOverride, setWarpModeOverride] = useState<TitleWarpCurveType | "preset">("preset");
  const [warpIntensityOverride, setWarpIntensityOverride] = useState<number>(36);

  // Tab 3: Brand Shuffle & Guardrails 상태
  const [stylePackId, setStylePackId] = useState<StyleShufflePackId>(
    DESIGN_PLATFORM_STYLE_SHUFFLE_PACKS[0]!.id,
  );
  const [permissionFlag, setPermissionFlag] = useState<TeamPermissionFlag>("774");
  const [collaboratorRole, setCollaboratorRole] = useState<CollaboratorRole>("owner");
  const [titleLogoMoved, setTitleLogoMoved] = useState<boolean>(false);
  const [proposedColorHex, setProposedColorHex] = useState<string>("#F59E0B");

  // Tab 4: Bulk Create, Goods Mockup & Preflight 상태
  const [episodeRows, setEpisodeRows] = useState<readonly BulkEpisodeRow[]>(INITIAL_BULK_ROWS);
  const [selectedGoodsPresetId, setSelectedGoodsPresetId] =
    useState<GoodsMockupPresetId>("acrylic-stand-diorama");
  const [simulatePrintRisk, setSimulatePrintRisk] = useState<boolean>(false);

  // 파생 계산: Tab 1 (Magic Switch)
  const magicSwitchResult = useMemo(
    () => executeMagicSwitchResize(SAMPLE_SOURCE_DOCUMENT, targetFormatId),
    [targetFormatId],
  );

  const batchMagicSwitchResults = useMemo(
    () =>
      executeBatchMagicSwitch(SAMPLE_SOURCE_DOCUMENT, [
        "naver-episode-cut",
        "kakaopage-cover-3x4",
        "insta-cuttoon-4x5",
        "youtube-pv-16x9",
        "print-a5-spread",
      ]),
    [],
  );

  const tankobonSpec = useMemo(
    () =>
      calculateTankobonSpreadSpec({
        trimSize: "A5",
        pageCount,
        paperStock,
        bindingType: "perfect-softcover",
        flapWidthMm: 85,
        bleedMm: 3,
        dpi: 300,
      }),
    [pageCount, paperStock],
  );

  const scrollSlices = useMemo(
    () =>
      computeVerticalScrollSlices({
        documentId: projectId || "webtoon-ep1",
        widthPx: 690,
        totalHeightPx: scrollTotalHeightPx,
        maxSliceHeightPx: 1500,
        layers: SAMPLE_SOURCE_DOCUMENT.layers,
      }),
    [projectId, scrollTotalHeightPx],
  );

  // 파생 계산: Tab 2 (Title & Warp Typography)
  const titleLogoOutput = useMemo(
    () =>
      buildTitleLogoSvgMarkup({
        mainTitle: titleText,
        presetId: selectedTitlePresetId,
        warpType: warpModeOverride === "preset" ? undefined : warpModeOverride,
        warpIntensity: warpModeOverride === "preset" ? undefined : warpIntensityOverride,
        widthPx: 880,
        heightPx: 260,
      }),
    [selectedTitlePresetId, titleText, warpIntensityOverride, warpModeOverride],
  );

  // 파생 계산: Tab 3 (Brand Shuffle & Guardrails)
  const currentStylePack = useMemo(
    () =>
      DESIGN_PLATFORM_STYLE_SHUFFLE_PACKS.find((p) => p.id === stylePackId) ??
      DESIGN_PLATFORM_STYLE_SHUFFLE_PACKS[0]!,
    [stylePackId],
  );

  const contrastRatio = useMemo(
    () =>
      computeWcagContrastRatio(
        currentStylePack.palette.primaryText,
        currentStylePack.palette.canvasBg,
      ),
    [currentStylePack],
  );

  const guardrailEval = useMemo(
    () =>
      evaluateBrandGuardrailCompliance({
        policy: {
          seriesTitle: projectId || "회귀자의 시계탑",
          permissionFlag,
          lockTitleLogoPosition: true,
          requireAgeRatingBadge: true,
          requireCopyrightNotice: true,
          enforceBrandPaletteOnly: true,
          allowedPaletteHexes: Object.values(currentStylePack.palette),
        },
        collaboratorRole,
        titleLogoMoved,
        hasAgeRatingBadge: true,
        hasCopyrightNotice: true,
        usedColorsHex: [proposedColorHex],
      }),
    [collaboratorRole, currentStylePack, permissionFlag, projectId, proposedColorHex, titleLogoMoved],
  );

  // 파생 계산: Tab 4 (Bulk Create, Goods Mockup & Preflight)
  const bulkManifest = useMemo(
    () =>
      generateBulkEpisodeArtifacts(
        {
          seriesTitle: projectId ? `시리즈 (${projectId})` : "회귀자의 시계탑",
          formatId: "insta-cuttoon-4x5",
          stylePackId: currentStylePack.id,
          titlePattern: "{{seriesTitle}} {{episodePad}}화",
          subtitlePattern: "{{episodeTitle}} · {{featuredCharacter}}",
          hookPattern: "{{hookCopy}}",
          copyrightLine: "© 2026 ToonStudio Original Series",
        },
        episodeRows,
      ),
    [currentStylePack.id, episodeRows, projectId],
  );

  const goodsSpec = useMemo(
    () => buildGoodsMockupSpec(selectedGoodsPresetId),
    [selectedGoodsPresetId],
  );

  const preflightReport = useMemo(
    () =>
      auditDesignPlatformPreflight({
        formatId: simulatePrintRisk ? "print-a5-spread" : targetFormatId,
        actualDpi: simulatePrintRisk ? 150 : 300,
        actualColorSpace: simulatePrintRisk ? "sRGB" : "CMYK",
        actualBleedMm: simulatePrintRisk ? 0 : 3,
        hasUnlicensedExternalFont: simulatePrintRisk,
        hasDraftWatermark: simulatePrintRisk,
        foregroundHex: currentStylePack.palette.primaryText,
        backgroundHex: currentStylePack.palette.canvasBg,
        safeZoneClippedLayerCount: simulatePrintRisk ? 2 : 0,
      }),
    [currentStylePack, simulatePrintRisk, targetFormatId],
  );

  const tabs: readonly {
    readonly id: DesignPlatformWorkbenchTabId;
    readonly labelKo: string;
    readonly subtitleKo: string;
    readonly icon: typeof Wand2;
  }[] = [
    { id: "magic-switch", labelKo: "1. 매직 스위치 · 멀티포맷 변환", subtitleKo: "캔바·미리캔버스·픽슬러 12종 규격 자동 재배치·생성형 확장·단행본 책등 계산", icon: Maximize2 },
    { id: "title-warp", labelKo: "2. 웹툰 타이틀 · 워프 타이포", subtitleKo: "키틀(Kittl)·미리캔버스 베지어 곡선 워프·3D 돌출·다중 외곽선 로고 합성", icon: Type },
    { id: "brand-shuffle", labelKo: "3. 스타일 셔플 · 브랜드 가드레일", subtitleKo: "원클릭 팔레트·폰트 페어링 셔플, 망고보드(777/774/770)·어도비 슬롯 잠금", icon: Palette },
    { id: "bulk-mockup", labelKo: "4. 회차 대량 생성 · 굿즈 · 라이선스", subtitleKo: "캔바 Bulk Create·Polotno 다중 페이지·키틀 굿즈 칼선·프리플라이트 감사", icon: Layers },
  ];

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;

    if (nextIndex !== null) {
      event.preventDefault();
      const targetTab = tabs[nextIndex]!;
      setActiveTab(targetTab.id);
      tabRefs.current[targetTab.id]?.focus();
    }
  };

  const handleShuffleNextStylePack = () => {
    const nextPack = shuffleSeriesStylePack(currentStylePack.id);
    setStylePackId(nextPack.id);
    setProposedColorHex(nextPack.palette.accentPrimary);
    setStatusMessage(`스타일 팩을 ‘${nextPack.label}’ 조합으로 전환했습니다.`);
  };

  const handleAddEpisodeRow = () => {
    const nextEpNum = episodeRows.length + 1;
    const newRow: BulkEpisodeRow = {
      episodeNumber: nextEpNum,
      episodeTitle: `새로운 사건의 시작 (${nextEpNum}화)`,
      hookCopy: "운명의 수레바퀴가 다시 움직인다!",
      releaseDate: "2026-11-16",
      featuredCharacter: "카셀",
      ageRating: "15+",
    };
    setEpisodeRows((prev) => [...prev, newRow]);
    setStatusMessage(`${nextEpNum}화 대량 생성(Bulk Create) 행을 추가했습니다.`);
  };

  return (
    <section
      data-testid="studio-design-platform-workbench"
      className={cn(
        "rounded-3xl border border-line bg-card shadow-sm",
        compact ? "p-4 sm:p-5" : "p-5 sm:p-6",
      )}
      aria-labelledby="design-platform-workbench-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            <Sparkles size={14} aria-hidden="true" /> DESIGN PLATFORM INTERNALIZATION SUITE
          </p>
          <h2
            id="design-platform-workbench-heading"
            className="mt-1 text-xl font-black tracking-tight text-fg sm:text-2xl"
          >
            {bt(
              "캔바·미리캔버스·망고보드·키틀 통합 디자인 & 멀티포맷 워크벤치",
              "Canva, MiriCanvas, MangoBoard & Kittl Integrated Design Workbench",
            )}
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-fg-2">
            {bt(
              "웹툰 원고·표지·SNS 카드뉴스·유튜브 썸네일·단행본 표지·IP 굿즈를 단일 작품 자산에서 원클릭으로 리사이즈하고, 워프 타이틀 로고와 회차별 대량 배너를 즉시 합성합니다.",
              "Resize webtoon manuscripts, covers, social cards, thumbnails, print spreads and IP goods from a single source with warp typography and bulk episode generation.",
            )}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/35 bg-accent-soft/50 px-3 py-1 text-xs font-bold text-accent">
          <Wand2 size={13} aria-hidden="true" />
          8대 디자인 플랫폼 클린룸 내재화 엔진
        </span>
      </div>

      {statusMessage ? (
        <p
          role="status"
          className="mt-3 flex items-center gap-2 rounded-xl border border-good/35 bg-good/10 px-3 py-2 text-xs font-semibold text-fg"
        >
          <CheckCircle2 size={14} className="text-good" aria-hidden="true" />
          {statusMessage}
        </p>
      ) : null}

      <div
        role="tablist"
        aria-label="통합 디자인 플랫폼 기능 탭"
        className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
      >
        {tabs.map((tab, idx) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              type="button"
              role="tab"
              id={`design-platform-tab-${tab.id}`}
              aria-selected={active}
              aria-controls={`design-platform-panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, idx)}
              className={cn(
                "flex min-h-14 flex-col items-start rounded-2xl border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                active
                  ? "border-accent bg-accent-soft/45 shadow-sm"
                  : "border-line bg-panel/60 text-fg-2 hover:border-accent/40 hover:text-fg",
              )}
            >
              <span className="flex items-center gap-2 text-xs font-black text-fg">
                <Icon size={15} className="text-accent" aria-hidden="true" />
                {tab.labelKo}
              </span>
              <span className="mt-1 text-[0.68rem] leading-4 text-fg-3">{tab.subtitleKo}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: 매직 스위치 · 멀티포맷 변환 */}
      {activeTab === "magic-switch" ? (
        <div
          role="tabpanel"
          id="design-platform-panel-magic-switch"
          aria-labelledby="design-platform-tab-magic-switch"
          className="mt-4 grid gap-4 lg:grid-cols-2"
        >
          <div className="space-y-3 rounded-2xl border border-line bg-panel/50 p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-fg">
              <Maximize2 size={15} className="text-accent" aria-hidden="true" />
              스마트 멀티포맷 매직 스위치 (12종 웹툰·SNS·단행본 규격)
            </h3>

            <label className="block text-xs font-semibold text-fg-2">
              목표 변환 규격 (원본: 카카오페이지 표지 900×1200)
              <select
                aria-label="목표 변환 규격"
                value={targetFormatId}
                onChange={(e) => setTargetFormatId(e.target.value as DesignPlatformFormatId)}
                className="mt-1 min-h-10 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
              >
                {DESIGN_PLATFORM_FORMAT_PRESETS.map((spec) => (
                  <option key={spec.id} value={spec.id}>
                    {spec.label} ({spec.widthPx}×{spec.heightPx} · {spec.colorSpace})
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-xl border border-line bg-card p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-black text-fg">
                  {magicSwitchResult.formatPreset.label} ({magicSwitchResult.targetSize.widthPx}×
                  {magicSwitchResult.targetSize.heightPx}px)
                </span>
                <span className="rounded-md bg-accent-soft px-2 py-0.5 font-mono text-[0.68rem] font-bold text-accent">
                  품질 점수 {magicSwitchResult.overallQualityScore}점 · 안전 영역{" "}
                  {magicSwitchResult.safeZoneComplianceScore}%
                </span>
              </div>
              <p className="mt-1 text-[0.7rem] text-fg-2">
                생성형 확장(Outpaint): 좌 {magicSwitchResult.outpaintExpansion.leftPx}px / 우{" "}
                {magicSwitchResult.outpaintExpansion.rightPx}px / 상{" "}
                {magicSwitchResult.outpaintExpansion.topPx}px / 하{" "}
                {magicSwitchResult.outpaintExpansion.bottomPx}px
              </p>
              <p className="mt-1 font-mono text-[0.68rem] text-fg-3">
                {magicSwitchResult.outpaintExpansion.promptHint}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1.5 text-[0.68rem]">
                {magicSwitchResult.transformedLayers.map((layer) => (
                  <div key={layer.id} className="rounded-lg border border-line bg-panel p-2">
                    <p className="font-bold text-fg">{layer.name}</p>
                    <p className="font-mono text-fg-3">
                      ({layer.x}, {layer.y}) · {layer.width}×{layer.height}px · {layer.scaleFactor}x
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-line bg-card p-3 text-xs">
              <p className="font-bold text-fg">
                원클릭 5종 동시 일괄 변환 요약 ({batchMagicSwitchResults.length}개 타깃 완료)
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {batchMagicSwitchResults.map((item) => (
                  <span
                    key={item.formatPreset.id}
                    className="rounded-lg border border-line bg-panel px-2 py-1 text-[0.65rem] font-semibold text-fg-2"
                  >
                    {item.formatPreset.label}: {item.targetSize.widthPx}×{item.targetSize.heightPx}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-line bg-panel/50 p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-fg">
              <BookOpen size={15} className="text-accent" aria-hidden="true" />
              단행본 펼침면(Spine+Bleed) 계산기 & 세로 스크롤 무손실 분할기
            </h3>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-semibold text-fg-2">
                단행본 본문 쪽수 (페이지)
                <input
                  type="number"
                  aria-label="단행본 본문 쪽수"
                  min={32}
                  max={800}
                  step={16}
                  value={pageCount}
                  onChange={(e) => setPageCount(Number(e.target.value) || 192)}
                  className="mt-1 min-h-10 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
                />
              </label>

              <label className="text-xs font-semibold text-fg-2">
                내지 용지 평량
                <select
                  aria-label="내지 용지 평량"
                  value={paperStock}
                  onChange={(e) => setPaperStock(e.target.value as TankobonPaperStock)}
                  className="mt-1 min-h-10 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
                >
                  <option value="white-offset-100g">백상지·모조지 100g (0.122mm/장)</option>
                  <option value="snow-art-120g">스노우지 120g (0.115mm/장)</option>
                  <option value="vellum-80g">미색 이라이트 80g (0.105mm/장)</option>
                  <option value="rough-comics-70g">만화 전용 갱지 70g (0.095mm/장)</option>
                </select>
              </label>
            </div>

            <div className="rounded-xl border border-line bg-card p-3 text-xs">
              <p className="font-black text-fg">
                A5 단행본 표지 펼침면: {tankobonSpec.totalSpreadWidthMm}×{tankobonSpec.totalSpreadHeightMm}mm (
                {tankobonSpec.totalSpreadWidthPx}×{tankobonSpec.totalSpreadHeightPx}px @ {tankobonSpec.dpi}DPI)
              </p>
              <p className="mt-1 text-[0.7rem] text-fg-2">
                책등(Spine) 폭: <strong>{tankobonSpec.spineWidthMm}mm</strong> (X=
                {tankobonSpec.guidesPx.spineStartPx}~{tankobonSpec.guidesPx.spineEndPx}px) · 날개{" "}
                {tankobonSpec.flapWidthMm}mm · 도련 {tankobonSpec.bleedMm}mm
              </p>
            </div>

            <div className="border-t border-line pt-3">
              <label className="block text-xs font-semibold text-fg-2">
                웹툰 세로 스크롤 총 원고 높이 (px) — 말풍선·타이틀 보호 분할
                <input
                  type="number"
                  aria-label="웹툰 세로 스크롤 총 원고 높이"
                  min={1600}
                  max={24000}
                  step={800}
                  value={scrollTotalHeightPx}
                  onChange={(e) => setScrollTotalHeightPx(Number(e.target.value) || 4800)}
                  className="mt-1 min-h-9 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
                />
              </label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {scrollSlices.map((slice) => (
                  <span
                    key={slice.sliceIndex}
                    className="rounded-lg border border-line bg-card px-2 py-1 font-mono text-[0.65rem] text-fg-2"
                  >
                    #{slice.sliceIndex}: {slice.startYPx}~{slice.endYPx}px ({slice.heightPx}px)
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* TAB 2: 웹툰 타이틀 · 워프 타이포 */}
      {activeTab === "title-warp" ? (
        <div
          role="tabpanel"
          id="design-platform-panel-title-warp"
          aria-labelledby="design-platform-tab-title-warp"
          className="mt-4 grid gap-4 lg:grid-cols-2"
        >
          <div className="space-y-3 rounded-2xl border border-line bg-panel/50 p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-fg">
              <Type size={15} className="text-accent" aria-hidden="true" />
              키틀(Kittl) · 미리캔버스 웹툰 타이틀 & 의성어 워프(Warp) 스튜디오
            </h3>

            <div className="flex flex-wrap gap-1.5" role="group" aria-label="타이틀 타이포 프리셋">
              {DESIGN_PLATFORM_TITLE_PRESETS.map((preset) => {
                const selected = preset.id === selectedTitlePresetId;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setSelectedTitlePresetId(preset.id);
                      setWarpModeOverride("preset");
                    }}
                    className={cn(
                      "min-h-8 rounded-lg border px-2.5 text-xs font-bold transition-colors",
                      selected
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-card text-fg-2 hover:text-fg",
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-semibold text-fg-2">
                타이틀·효과음 문구
                <input
                  type="text"
                  aria-label="타이틀·효과음 문구"
                  value={titleText}
                  onChange={(e) => setTitleText(e.target.value)}
                  className="mt-1 min-h-10 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
                />
              </label>

              <label className="text-xs font-semibold text-fg-2">
                곡선 워프(Warp) 모드
                <select
                  aria-label="곡선 워프 모드"
                  value={warpModeOverride}
                  onChange={(e) => setWarpModeOverride(e.target.value as TitleWarpCurveType | "preset")}
                  className="mt-1 min-h-10 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
                >
                  <option value="preset">프리셋 기본 워프 ({titleLogoOutput.warpPath.warpType})</option>
                  <option value="arc">아치 곡선 (arc)</option>
                  <option value="arch">돔 아치 (arch)</option>
                  <option value="wave">물결 파동 (wave)</option>
                  <option value="rise">대각선 상승 (rise)</option>
                  <option value="flag">깃발 웨이브 (flag)</option>
                  <option value="slant">사선 기울기 (slant)</option>
                  <option value="none">직선 (none)</option>
                </select>
              </label>
            </div>

            <label className="block text-xs font-semibold text-fg-2">
              곡선 굴곡 강도 ({titleLogoOutput.warpPath.intensity})
              <input
                type="range"
                aria-label="곡선 굴곡 강도"
                min={-90}
                max={90}
                value={
                  warpModeOverride === "preset"
                    ? titleLogoOutput.warpPath.intensity
                    : warpIntensityOverride
                }
                onChange={(e) => {
                  if (warpModeOverride === "preset") {
                    setWarpModeOverride(titleLogoOutput.warpPath.warpType);
                  }
                  setWarpIntensityOverride(Number(e.target.value));
                }}
                className="mt-1 w-full accent-accent"
              />
            </label>

            <div className="rounded-xl border border-line bg-card p-3 text-xs">
              <p className="font-bold text-fg">
                글리프 워프 좌표 샘플 ({titleLogoOutput.glyphTransforms.length}글자 · 3D 돌출{" "}
                {titleLogoOutput.preset.extrusionDepthPx}px)
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {titleLogoOutput.glyphTransforms.slice(0, 8).map((glyph) => (
                  <span
                    key={glyph.charIndex}
                    className="rounded-md border border-line bg-panel px-2 py-0.5 font-mono text-[0.65rem] text-fg-2"
                  >
                    ‘{glyph.char}’ ({glyph.x},{glyph.y}) {glyph.rotationDeg}°
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-line bg-panel/50 p-4">
            <h3 className="text-sm font-bold text-fg">실시간 벡터 워프 타이틀 미리보기 & SVG 코드</h3>
            <div className="flex min-h-44 items-center justify-center overflow-hidden rounded-2xl border border-line bg-reader-canvas p-3">
              <svg
                viewBox="0 0 880 260"
                className="h-auto w-full max-w-full"
                role="img"
                aria-label={`${titleText || "타이틀"} 워프 타이포그래피 미리보기`}
              >
                <defs>
                  <linearGradient id="preview-title-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={titleLogoOutput.preset.fillGradientStops[0]} />
                    <stop offset="50%" stopColor={titleLogoOutput.preset.fillGradientStops[1]} />
                    <stop offset="100%" stopColor={titleLogoOutput.preset.fillGradientStops[2]} />
                  </linearGradient>
                </defs>
                {titleLogoOutput.glyphTransforms.map((g) => (
                  <g
                    key={g.charIndex}
                    transform={`translate(${g.x}, ${g.y}) rotate(${g.rotationDeg}) scale(1, ${g.scaleY})`}
                  >
                    <text
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontFamily={titleLogoOutput.preset.fontFamily}
                      fontSize={64}
                      fontWeight={titleLogoOutput.preset.fontWeight}
                      fill="none"
                      stroke={titleLogoOutput.preset.outerStrokeColor}
                      strokeWidth={titleLogoOutput.preset.outerStrokeWidthPx}
                      strokeLinejoin="round"
                    >
                      {g.char}
                    </text>
                    <text
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontFamily={titleLogoOutput.preset.fontFamily}
                      fontSize={64}
                      fontWeight={titleLogoOutput.preset.fontWeight}
                      fill="url(#preview-title-grad)"
                      stroke={titleLogoOutput.preset.primaryStrokeColor}
                      strokeWidth={titleLogoOutput.preset.primaryStrokeWidthPx}
                      paintOrder="stroke fill"
                    >
                      {g.char}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
            <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap rounded-xl border border-line bg-card p-2.5 font-mono text-[0.65rem] text-fg-3">
              {titleLogoOutput.svgMarkup.slice(0, 420)}…
            </pre>
          </div>
        </div>
      ) : null}

      {/* TAB 3: 스타일 셔플 · 브랜드 가드레일 */}
      {activeTab === "brand-shuffle" ? (
        <StudioDesignPlatformBrandTabPanel
          currentStylePack={currentStylePack}
          contrastRatio={contrastRatio}
          onShuffleNextStylePack={handleShuffleNextStylePack}
          onSelectStylePackId={(id) => {
            setStylePackId(id);
            const found = DESIGN_PLATFORM_STYLE_SHUFFLE_PACKS.find((p) => p.id === id);
            if (found) setProposedColorHex(found.palette.accentPrimary);
          }}
          onApplyStylePackToSeriesKit={onApplyStylePackToSeriesKit}
          permissionFlag={permissionFlag}
          onChangePermissionFlag={setPermissionFlag}
          collaboratorRole={collaboratorRole}
          onChangeCollaboratorRole={setCollaboratorRole}
          titleLogoMoved={titleLogoMoved}
          onToggleTitleLogoMoved={() => setTitleLogoMoved((prev) => !prev)}
          proposedColorHex={proposedColorHex}
          onChangeProposedColorHex={setProposedColorHex}
          guardrailEval={guardrailEval}
        />
      ) : null}

      {/* TAB 4: 회차 대량 생성 · 굿즈 · 라이선스 */}
      {activeTab === "bulk-mockup" ? (
        <StudioDesignPlatformBulkMockupTabPanel
          episodeRows={episodeRows}
          onAddEpisodeRow={handleAddEpisodeRow}
          bulkManifest={bulkManifest}
          selectedGoodsPresetId={selectedGoodsPresetId}
          onChangeGoodsPresetId={setSelectedGoodsPresetId}
          goodsSpec={goodsSpec}
          simulatePrintRisk={simulatePrintRisk}
          onToggleSimulatePrintRisk={() => setSimulatePrintRisk((prev) => !prev)}
          preflightReport={preflightReport}
        />
      ) : null}
    </section>
  );
}
