/**
 * 올인원 웹 디자인 에디터 워크벤치 패널
 *
 * - 16종 실전 편집 가능 템플릿 갤러리 + 14종 원클릭 매직 리사이즈
 * - Figma Auto-Layout 제약 솔버 + 컴포넌트 마스터→인스턴스 오버라이드 전파
 * - 브랜드 키트 8종 + 한영 폰트 페어링 6종 + 포토 마스크 프레임 8종 + 한글 타이포 효과 6종
 * - Excalidraw 손그림 스케치 모드 + 3mm 인쇄 재단선/도련 + SVG/JSON 다운로드
 */

import "./design-editor-workbench.css";

import {
  Download,
  FileJson,
  Frame,
  LayoutGrid,
  Palette,
  PenTool,
  Printer,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useId, useMemo, useState, type KeyboardEvent } from "react";

import { useI18n } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { DesignArtboardPreview } from "./DesignArtboardPreview";
import { DesignAutoLayoutTab } from "./DesignAutoLayoutTab";
import { DesignBrandKitTab, DesignFramesEffectsTab } from "./DesignStyleTabs";
import {
  DESIGN_EDITOR_TEMPLATES,
  KOREAN_TYPO_EFFECTS,
  PHOTO_MASK_FRAMES,
  applyBrandKitToArtboard,
  createArtboardFromTemplate,
  getBrandKitPreset,
  type BrandKitId,
  type DesignTemplateCategory,
  type DesignTemplateId,
  type FontPairingId,
  type KoreanTypoEffectId,
  type PhotoMaskFrameId,
} from "./brand-kit-templates-catalog";
import {
  serializeArtboardToJson,
  serializeArtboardToSvg,
  triggerTextFileDownload,
} from "./design-artboard-export";
import {
  computeAutoLayout,
  createUniformPadding,
  flattenAutoLayoutNodes,
  resetInstanceOverride,
  setInstanceOverride,
  syncComponentInstances,
  type AutoLayoutAlignItems,
  type AutoLayoutDirection,
  type AutoLayoutFrameNode,
  type AutoLayoutJustifyContent,
  type AutoLayoutSizingMode,
  type ComponentInstance,
  type ComponentMaster,
} from "./figma-autolayout-engine";
import {
  MAGIC_RESIZE_FORMATS,
  applyMagicResize,
  getMagicResizeFormat,
  verifyArtboardBounds,
  type DesignArtboardDocument,
  type MagicResizeFormatId,
  type MagicResizeReport,
} from "./magic-resize-engine";

export type DesignWorkbenchTabId = "templates" | "autolayout" | "brand" | "effects";

export interface DesignEditorWorkbenchPanelProps {
  readonly projectId?: string;
  readonly initialTemplateId?: DesignTemplateId;
  readonly initialTab?: DesignWorkbenchTabId;
}

type TemplateCategoryFilter = "all" | DesignTemplateCategory;

const INITIAL_MASTER: ComponentMaster = {
  id: "master-cta-card",
  name: "CTA Button",
  version: 1,
  props: {
    labelKo: "1화 바로 읽기",
    labelEn: "Read Episode 1",
    borderRadius: 12,
    fontSize: 15,
    paddingX: 20,
    paddingY: 12,
    elevation: "soft",
  },
};

const INITIAL_INSTANCES: readonly ComponentInstance[] = [
  {
    id: "inst-primary",
    masterId: "master-cta-card",
    name: "Card CTA #1",
    overrides: {},
    resolvedProps: { ...INITIAL_MASTER.props },
    syncedMasterVersion: 1,
  },
  {
    id: "inst-override",
    masterId: "master-cta-card",
    name: "Custom CTA #2",
    overrides: { labelKo: "한정 굿즈 보기", labelEn: "Shop Merch" },
    resolvedProps: { ...INITIAL_MASTER.props, labelKo: "한정 굿즈 보기", labelEn: "Shop Merch" },
    syncedMasterVersion: 1,
  },
];

const WORKBENCH_TABS: readonly {
  readonly id: DesignWorkbenchTabId;
  readonly ko: string;
  readonly en: string;
}[] = [
  { id: "templates", ko: "템플릿 · 매직 리사이즈", en: "Templates & Resize" },
  { id: "autolayout", ko: "Auto-Layout · 컴포넌트", en: "Auto-Layout & Sync" },
  { id: "brand", ko: "브랜드 키트 · 폰트", en: "Brand Kit & Fonts" },
  { id: "effects", ko: "포토 프레임 · 타이포 효과", en: "Frames & Typo FX" },
];

export function DesignEditorWorkbenchPanel({
  projectId,
  initialTemplateId = "webtoon-launch-card",
  initialTab = "templates",
}: DesignEditorWorkbenchPanelProps) {
  const bt = useBilingual("DesignEditorWorkbenchPanel");
  const lang = useI18n((state) => state.lang);
  const isEnglish = !lang.toLowerCase().startsWith("ko");
  const baseId = useId();

  const [activeTab, setActiveTab] = useState<DesignWorkbenchTabId>(initialTab);
  const [templateFilter, setTemplateFilter] = useState<TemplateCategoryFilter>("all");
  const [artboard, setArtboard] = useState<DesignArtboardDocument>(() =>
    createArtboardFromTemplate(initialTemplateId),
  );
  const [lastResizeReport, setLastResizeReport] = useState<MagicResizeReport | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>("headline-1");

  const [layoutDirection, setLayoutDirection] = useState<AutoLayoutDirection>("row");
  const [layoutGap, setLayoutGap] = useState<number>(12);
  const [layoutPadding, setLayoutPadding] = useState<number>(16);
  const [layoutAlign, setLayoutAlign] = useState<AutoLayoutAlignItems>("center");
  const [layoutJustify, setLayoutJustify] = useState<AutoLayoutJustifyContent>("space-between");
  const [childSizingMode, setChildSizingMode] = useState<AutoLayoutSizingMode>("fill");

  const [componentMaster, setComponentMaster] = useState<ComponentMaster>(INITIAL_MASTER);
  const [componentInstances, setComponentInstances] =
    useState<readonly ComponentInstance[]>(INITIAL_INSTANCES);

  const [statusNotice, setStatusNotice] = useState<{ readonly ko: string; readonly en: string }>({
    ko: "템플릿을 선택하고 매직 리사이즈·브랜드 키트·Auto-Layout을 바로 적용해 보세요.",
    en: "Pick a template and try Magic Resize, Brand Kits, and Auto-Layout live.",
  });

  const activeFormat = useMemo(() => getMagicResizeFormat(artboard.formatId), [artboard.formatId]);
  const activeBrandKit = useMemo(
    () => getBrandKitPreset(artboard.brandKitId),
    [artboard.brandKitId],
  );
  const boundsAudit = useMemo(() => verifyArtboardBounds(artboard), [artboard]);

  const filteredTemplates = useMemo(
    () =>
      templateFilter === "all"
        ? DESIGN_EDITOR_TEMPLATES
        : DESIGN_EDITOR_TEMPLATES.filter((tpl) => tpl.category === templateFilter),
    [templateFilter],
  );

  const autoLayoutFrame = useMemo<AutoLayoutFrameNode>(
    () => ({
      id: "al-root",
      kind: "frame",
      name: "Promo Card Frame",
      x: 0,
      y: 0,
      width: 340,
      height: 184,
      widthMode: "fixed",
      heightMode: layoutDirection === "wrap" ? "hug" : "fixed",
      minHeight: 164,
      direction: layoutDirection,
      padding: createUniformPadding(layoutPadding),
      gap: layoutGap,
      crossAxisGap: layoutGap,
      alignItems: layoutAlign,
      justifyContent: layoutJustify,
      children: [
        { id: "al-badge", kind: "leaf", labelKo: "배지", labelEn: "Badge", width: 78, height: 36, intrinsicWidth: 74, intrinsicHeight: 34, widthMode: childSizingMode, heightMode: "fixed", tokenRole: "badge" },
        { id: "al-title", kind: "leaf", labelKo: "제목 블록", labelEn: "Title Block", width: 112, height: 48, intrinsicWidth: 108, intrinsicHeight: 44, widthMode: childSizingMode, heightMode: "fixed", growWeight: 1.4, tokenRole: "accent" },
        { id: "al-cta", kind: "leaf", labelKo: "버튼 CTA", labelEn: "CTA Action", width: 92, height: 40, intrinsicWidth: 88, intrinsicHeight: 38, widthMode: childSizingMode, heightMode: "fixed", tokenRole: "cta" },
      ],
    }),
    [layoutDirection, layoutPadding, layoutGap, layoutAlign, layoutJustify, childSizingMode],
  );

  const computedAutoLayout = useMemo(() => computeAutoLayout(autoLayoutFrame), [autoLayoutFrame]);
  const layoutLeaves = useMemo(
    () => flattenAutoLayoutNodes(computedAutoLayout).filter((node) => node.kind === "leaf"),
    [computedAutoLayout],
  );

  const headlineElement = artboard.elements.find((el) => el.role === "headline");
  const subcopyElement = artboard.elements.find((el) => el.role === "subcopy");

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (
      event.key !== "ArrowRight" &&
      event.key !== "ArrowLeft" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    event.preventDefault();
    let nextIdx: number;
    if (event.key === "ArrowRight") nextIdx = (index + 1) % WORKBENCH_TABS.length;
    else if (event.key === "ArrowLeft")
      nextIdx = (index - 1 + WORKBENCH_TABS.length) % WORKBENCH_TABS.length;
    else if (event.key === "Home") nextIdx = 0;
    else nextIdx = WORKBENCH_TABS.length - 1;
    setActiveTab(WORKBENCH_TABS[nextIdx].id);
  };

  const handleSelectTemplate = (templateId: DesignTemplateId) => {
    const nextDoc = createArtboardFromTemplate(templateId);
    setArtboard(nextDoc);
    setLastResizeReport(null);
    setStatusNotice({
      ko: `'${nextDoc.titleKo}' 템플릿을 불러왔어요 (${nextDoc.width}×${nextDoc.height}px).`,
      en: `Loaded '${nextDoc.titleEn}' template (${nextDoc.width}×${nextDoc.height}px).`,
    });
  };

  const handleMagicResize = (targetFormatId: MagicResizeFormatId) => {
    const result = applyMagicResize(artboard, targetFormatId);
    const fmt = getMagicResizeFormat(targetFormatId);
    setArtboard(result.artboard);
    setLastResizeReport(result.report);
    setStatusNotice({
      ko: `'${fmt.nameKo}'(${fmt.width}×${fmt.height}px)로 매직 리사이즈 완료 · 클리핑 ${result.report.clippedCount}건.`,
      en: `Resized to '${fmt.nameEn}' (${fmt.width}×${fmt.height}px) · ${result.report.clippedCount} clipped.`,
    });
  };

  const handleApplyBrandKit = (brandKitId: BrandKitId) => {
    const applied = applyBrandKitToArtboard(artboard, brandKitId, { syncFontPairing: true });
    setArtboard(applied.artboard);
    setStatusNotice({
      ko: `'${applied.brandKit.nameKo}' 브랜드 키트와 '${applied.fontPairing.nameKo}' 폰트로 전역 리스킨했어요.`,
      en: `Reskinned with '${applied.brandKit.nameEn}' kit and '${applied.fontPairing.nameEn}' font pairing.`,
    });
  };

  const handleSelectFontPairing = (fontPairingId: FontPairingId) => {
    const applied = applyBrandKitToArtboard(artboard, artboard.brandKitId as BrandKitId, {
      explicitFontPairingId: fontPairingId,
    });
    setArtboard(applied.artboard);
    setStatusNotice({
      ko: `폰트 페어링을 '${applied.fontPairing.nameKo}'으로 전환했어요.`,
      en: `Switched font pairing to '${applied.fontPairing.nameEn}'.`,
    });
  };

  const handleSelectPhotoFrame = (frameId: PhotoMaskFrameId) => {
    setArtboard((prev) => ({ ...prev, photoFrameId: frameId }));
    const preset = PHOTO_MASK_FRAMES.find((item) => item.id === frameId);
    setStatusNotice({
      ko: `포토 마스크 프레임을 '${preset?.nameKo ?? frameId}'으로 바꿨어요.`,
      en: `Applied '${preset?.nameEn ?? frameId}' photo mask frame.`,
    });
  };

  const handleSelectTypoEffect = (effectId: KoreanTypoEffectId) => {
    setArtboard((prev) => ({ ...prev, typoEffectId: effectId }));
    const preset = KOREAN_TYPO_EFFECTS.find((item) => item.id === effectId);
    setStatusNotice({
      ko: `타이포 효과를 '${preset?.nameKo ?? effectId}'으로 적용했어요.`,
      en: `Applied '${preset?.nameEn ?? effectId}' typography effect.`,
    });
  };

  const handleToggleSketchMode = () => {
    setArtboard((prev) => {
      const nextSketch = !prev.sketchMode;
      setStatusNotice({
        ko: nextSketch
          ? "손그림 스케치 모드를 켰어요. 도형과 화살표가 유기적 드로잉 선으로 바뀝니다."
          : "손그림 스케치 모드를 끄고 정밀 벡터 모드로 전환했어요.",
        en: nextSketch
          ? "Hand-drawn sketch mode enabled. Shapes and arrows now render with organic strokes."
          : "Returned to clean vector geometry mode.",
      });
      return { ...prev, sketchMode: nextSketch };
    });
  };

  const handleToggleBleedGuides = () => {
    setArtboard((prev) => {
      const nextBleed = !prev.showBleedGuides;
      setStatusNotice({
        ko: nextBleed
          ? "3mm 인쇄 재단선과 안전 여백 가이드를 표시했어요."
          : "3mm 인쇄 재단선 가이드를 숨겼어요.",
        en: nextBleed
          ? "3mm print trim and safe-zone guides are now visible."
          : "3mm print bleed guides hidden.",
      });
      return { ...prev, showBleedGuides: nextBleed };
    });
  };

  const handleEditRoleCopy = (role: "headline" | "subcopy", nextValue: string) => {
    setArtboard((prev) => ({
      ...prev,
      elements: prev.elements.map((el) =>
        el.role === role
          ? isEnglish
            ? { ...el, textEn: nextValue }
            : { ...el, textKo: nextValue }
          : el,
      ),
    }));
  };

  const handleBumpMasterRadius = (nextRadius: number) => {
    const nextMaster: ComponentMaster = {
      ...componentMaster,
      version: componentMaster.version + 1,
      props: { ...componentMaster.props, borderRadius: nextRadius },
    };
    const synced = syncComponentInstances(nextMaster, componentInstances);
    setComponentMaster(nextMaster);
    setComponentInstances(synced.instances);
    setStatusNotice({
      ko: `마스터 모서리 ${nextRadius}px 변경을 인스턴스 ${synced.updatedCount}개에 전파했어요 (개별 오버라이드 유지).`,
      en: `Propagated master radius ${nextRadius}px to ${synced.updatedCount} instances while preserving overrides.`,
    });
  };

  const handleToggleSecondInstanceOverride = () => {
    const target = componentInstances[1];
    if (!target) return;
    const hasCustomLabel = target.overrides.labelKo !== undefined;
    const updatedTarget = hasCustomLabel
      ? resetInstanceOverride(
          resetInstanceOverride(target, componentMaster, "labelKo"),
          componentMaster,
          "labelEn",
        )
      : setInstanceOverride(
          setInstanceOverride(target, "labelKo", "한정 굿즈 보기"),
          "labelEn",
          "Shop Merch",
        );
    setComponentInstances([componentInstances[0], updatedTarget]);
  };

  const handleDownloadSvg = () => {
    triggerTextFileDownload(
      `${artboard.templateId}-${artboard.formatId}.svg`,
      serializeArtboardToSvg(artboard, isEnglish),
      "image/svg+xml;charset=utf-8",
    );
    setStatusNotice({
      ko: `SVG 파일(${artboard.width}×${artboard.height}px)을 내보냈어요.`,
      en: `Exported SVG artboard (${artboard.width}×${artboard.height}px).`,
    });
  };

  const handleDownloadJson = () => {
    triggerTextFileDownload(
      `${artboard.templateId}-${artboard.formatId}.json`,
      serializeArtboardToJson({ artboard, autoLayout: computedAutoLayout, instances: componentInstances }),
      "application/json;charset=utf-8",
    );
    setStatusNotice({
      ko: "아트보드 · Auto-Layout · 컴포넌트 구조 JSON 파일을 내보냈어요.",
      en: "Exported artboard, Auto-Layout, and component sync JSON.",
    });
  };

  return (
    <section
      className="des-workbench"
      aria-label={bt("올인원 웹 디자인 에디터 워크벤치", "All-in-One Web Design Editor Workbench")}
      data-testid="design-editor-workbench-panel"
    >
      <header className="des-header">
        <div className="des-title-block">
          <span className="des-kicker">
            <Sparkles size={14} aria-hidden="true" />
            {bt("매직 리사이즈 · Auto-Layout · 브랜드 키트 · 손그림", "Magic Resize · Auto-Layout · Brand Kit · Sketch")}
          </span>
          <h2 className="des-title">
            {bt("올인원 웹 디자인 에디터", "All-in-One Web Design Editor")}
            {projectId ? ` · ${projectId}` : ""}
          </h2>
          <p className="des-subtitle">
            {bt(
              "웹툰 홍보 카드뉴스, 유튜브 썸네일, 굿즈 칼선, 포스터, UI 레이아웃과 화이트보드 플로우차트까지 한 곳에서 제작하세요.",
              "Create promo cards, thumbnails, merch sheets, print posters, UI frames, and sketch flowcharts in one studio.",
            )}
          </p>
        </div>
        <div className="des-header-badges">
          <span className="des-pill des-num" data-testid="des-active-dimensions-badge">
            {isEnglish ? activeFormat.nameEn : activeFormat.nameKo} · {artboard.width}×{artboard.height}
          </span>
          <span
            className="des-pill"
            data-tone={boundsAudit.valid ? "good" : "warn"}
            data-testid="des-bounds-integrity-badge"
          >
            {boundsAudit.valid
              ? bt("경계 안전 · 클리핑 0건", "Bounds Safe · 0 Clipped")
              : bt("경계 보정 필요", "Needs Bounds Clamp")}
          </span>
        </div>
      </header>

      <div className="des-quickbar" role="toolbar" aria-label={bt("빠른 에디터 제어", "Quick editor controls")}>
        <button
          type="button"
          className="des-btn"
          aria-pressed={artboard.sketchMode}
          data-active={artboard.sketchMode ? "true" : "false"}
          data-testid="des-toggle-sketch-btn"
          onClick={handleToggleSketchMode}
        >
          <PenTool size={16} aria-hidden="true" />
          <span>{bt("손그림 스케치 모드", "Sketch Mode")}</span>
        </button>
        <button
          type="button"
          className="des-btn"
          aria-pressed={artboard.showBleedGuides}
          data-active={artboard.showBleedGuides ? "true" : "false"}
          data-testid="des-toggle-bleed-btn"
          onClick={handleToggleBleedGuides}
        >
          <Printer size={16} aria-hidden="true" />
          <span>{bt("3mm 인쇄 재단선", "3mm Print Bleed")}</span>
        </button>
        <button type="button" className="des-btn" data-testid="des-download-svg-btn" onClick={handleDownloadSvg}>
          <Download size={16} aria-hidden="true" />
          <span>{bt("SVG 다운로드", "Download SVG")}</span>
        </button>
        <button type="button" className="des-btn" data-testid="des-download-json-btn" onClick={handleDownloadJson}>
          <FileJson size={16} aria-hidden="true" />
          <span>{bt("JSON 다운로드", "Download JSON")}</span>
        </button>
      </div>

      <div className="des-status-banner" role="status" aria-live="polite" data-testid="des-status-banner">
        {isEnglish ? statusNotice.en : statusNotice.ko}
      </div>

      <div className="des-workspace-grid">
        <div className="des-canvas-column">
          <DesignArtboardPreview
            artboard={artboard}
            isEnglish={isEnglish}
            selectedElementId={selectedElementId}
            onSelectElement={setSelectedElementId}
          />

          <div className="des-quick-copy-card">
            <div className="des-field-row">
              <label className="des-field-label" htmlFor={`${baseId}-headline`}>
                {bt("헤드라인 문구", "Headline Copy")}
              </label>
              <input
                id={`${baseId}-headline`}
                type="text"
                className="des-text-input"
                data-testid="des-headline-input"
                value={isEnglish ? (headlineElement?.textEn ?? "") : (headlineElement?.textKo ?? "")}
                onChange={(event) => handleEditRoleCopy("headline", event.target.value)}
              />
            </div>
            <div className="des-field-row">
              <label className="des-field-label" htmlFor={`${baseId}-subcopy`}>
                {bt("보조 설명 문구", "Subcopy")}
              </label>
              <input
                id={`${baseId}-subcopy`}
                type="text"
                className="des-text-input"
                data-testid="des-subcopy-input"
                value={isEnglish ? (subcopyElement?.textEn ?? "") : (subcopyElement?.textKo ?? "")}
                onChange={(event) => handleEditRoleCopy("subcopy", event.target.value)}
              />
            </div>
            {lastResizeReport && (
              <p className="des-meta-line des-num" data-testid="des-resize-report-summary">
                {bt(
                  `최근 리사이즈: ${lastResizeReport.orientation} · 안전 여백 ${lastResizeReport.safeMarginPx.x}px · 배율 ${lastResizeReport.scaleFactor}x`,
                  `Last resize: ${lastResizeReport.orientation} · Safe margin ${lastResizeReport.safeMarginPx.x}px · Scale ${lastResizeReport.scaleFactor}x`,
                )}
              </p>
            )}
          </div>
        </div>

        <div className="des-inspector-column">
          <div
            role="tablist"
            aria-label={bt("디자인 에디터 도구 탭", "Design editor tool tabs")}
            className="des-tablist"
          >
            {WORKBENCH_TABS.map((tab, index) => {
              const selected = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  id={`${baseId}-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`${baseId}-panel-${tab.id}`}
                  tabIndex={selected ? 0 : -1}
                  className="des-tab-btn"
                  data-testid={`des-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                >
                  {tab.id === "templates" && <Wand2 size={15} aria-hidden="true" />}
                  {tab.id === "autolayout" && <LayoutGrid size={15} aria-hidden="true" />}
                  {tab.id === "brand" && <Palette size={15} aria-hidden="true" />}
                  {tab.id === "effects" && <Frame size={15} aria-hidden="true" />}
                  <span>{isEnglish ? tab.en : tab.ko}</span>
                </button>
              );
            })}
          </div>

          {activeTab === "templates" && (
            <div
              id={`${baseId}-panel-templates`}
              role="tabpanel"
              aria-labelledby={`${baseId}-tab-templates`}
              className="des-panel-body"
            >
              <div className="des-subsection">
                <div className="des-subsection-head">
                  <h3 className="des-subsection-title">
                    {bt("원클릭 매직 리사이즈 (14종)", "One-Click Magic Resize (14 Formats)")}
                  </h3>
                </div>
                <div className="des-format-grid" data-testid="des-magic-resize-grid">
                  {MAGIC_RESIZE_FORMATS.map((fmt) => {
                    const active = fmt.id === artboard.formatId;
                    return (
                      <button
                        key={fmt.id}
                        type="button"
                        className="des-format-btn"
                        aria-pressed={active}
                        data-active={active ? "true" : "false"}
                        data-testid={`des-format-${fmt.id}`}
                        onClick={() => handleMagicResize(fmt.id)}
                      >
                        <span className="des-format-name">{isEnglish ? fmt.nameEn : fmt.nameKo}</span>
                        <span className="des-format-dim des-num">
                          {fmt.width}×{fmt.height}
                          {fmt.isPrint ? " · 3mm" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="des-subsection">
                <div className="des-subsection-head">
                  <h3 className="des-subsection-title">
                    {bt("실전 편집 가능 템플릿 (16종)", "Editable Starter Templates (16)")}
                  </h3>
                  <div className="des-filter-row" role="group" aria-label={bt("템플릿 분류 필터", "Template category filter")}>
                    {(
                      [
                        ["all", "전체", "All"],
                        ["webtoon", "웹툰", "Webtoon"],
                        ["social-video", "SNS·영상", "Social"],
                        ["print-goods", "인쇄·굿즈", "Print"],
                        ["plan-ui", "기획·UI", "Plan/UI"],
                      ] as const
                    ).map(([cat, ko, en]) => (
                      <button
                        key={cat}
                        type="button"
                        className="des-chip-btn"
                        aria-pressed={templateFilter === cat}
                        data-active={templateFilter === cat ? "true" : "false"}
                        onClick={() => setTemplateFilter(cat)}
                      >
                        {isEnglish ? en : ko}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="des-template-grid" data-testid="des-template-gallery">
                  {filteredTemplates.map((tpl) => {
                    const active = tpl.id === artboard.templateId;
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        className="des-template-card"
                        aria-pressed={active}
                        data-active={active ? "true" : "false"}
                        data-testid={`des-template-${tpl.id}`}
                        onClick={() => handleSelectTemplate(tpl.id)}
                      >
                        <span className="des-template-title">{isEnglish ? tpl.nameEn : tpl.nameKo}</span>
                        <span className="des-template-summary">
                          {isEnglish ? tpl.summaryEn : tpl.summaryKo}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === "autolayout" && (
            <DesignAutoLayoutTab
              panelId={`${baseId}-panel-autolayout`}
              labelledBy={`${baseId}-tab-autolayout`}
              isEnglish={isEnglish}
              activeBrandKitClass={activeBrandKit.themeClass}
              sketchMode={artboard.sketchMode}
              layoutDirection={layoutDirection}
              layoutGap={layoutGap}
              layoutPadding={layoutPadding}
              layoutAlign={layoutAlign}
              layoutJustify={layoutJustify}
              childSizingMode={childSizingMode}
              computedAutoLayout={computedAutoLayout}
              layoutLeaves={layoutLeaves}
              componentMaster={componentMaster}
              componentInstances={componentInstances}
              onChangeDirection={setLayoutDirection}
              onChangeGap={setLayoutGap}
              onChangePadding={setLayoutPadding}
              onChangeAlign={setLayoutAlign}
              onChangeJustify={setLayoutJustify}
              onChangeChildSizing={setChildSizingMode}
              onBumpMasterRadius={handleBumpMasterRadius}
              onToggleSecondInstanceOverride={handleToggleSecondInstanceOverride}
            />
          )}

          {activeTab === "brand" && (
            <DesignBrandKitTab
              panelId={`${baseId}-panel-brand`}
              labelledBy={`${baseId}-tab-brand`}
              isEnglish={isEnglish}
              activeBrandKitId={artboard.brandKitId}
              activeFontPairingId={artboard.fontPairingId}
              onApplyBrandKit={handleApplyBrandKit}
              onSelectFontPairing={handleSelectFontPairing}
            />
          )}

          {activeTab === "effects" && (
            <DesignFramesEffectsTab
              panelId={`${baseId}-panel-effects`}
              labelledBy={`${baseId}-tab-effects`}
              isEnglish={isEnglish}
              activePhotoFrameId={artboard.photoFrameId}
              activeTypoEffectId={artboard.typoEffectId}
              onSelectPhotoFrame={handleSelectPhotoFrame}
              onSelectTypoEffect={handleSelectTypoEffect}
            />
          )}
        </div>
      </div>
    </section>
  );
}

export default DesignEditorWorkbenchPanel;
