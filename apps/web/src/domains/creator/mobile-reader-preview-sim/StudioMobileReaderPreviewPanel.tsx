/**
 * Wave 44C — 모바일 독자 뷰어 9:16 라이브 시뮬레이터 패널 (네이버·카카오·글로벌 × 4대 실기기).
 *
 * - 실기기 4종(`iphone-se-375` · `galaxy-s25-390` · `iphone-16-promax-430` · `ipad-mini-744`) 즉시 전환
 * - 플랫폼 크롬 3종(`naver-webtoon` · `kakao-page` · `global-vertical`) × 다크/라이트 뷰어 토글
 * - 원고 폭(690/800/1080px) 기준 말풍선 축소 가독성(< 11.5px 경고), 다크모드 눈부심, 하단 댓글바 간섭, 추정 완독 시간 실시간 감사
 * - Calm Atelier 시맨틱 토큰 전용(원시 색 · 광범위 트랜지션 · 기본 빈 객체 props · Web Storage · private Map store · BigInt 리터럴 0건)
 */

import {
  AlertTriangle, CheckCircle2, Clock, Code2, Copy, Eye, EyeOff,
  Moon, Plus, RotateCcw, SlidersHorizontal, Smartphone, Sun, Trash2, Wand2,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  MANUSCRIPT_WIDTH_PRESETS, MOBILE_DEVICE_PROFILES, READABILITY_MIN_EFFECTIVE_FONT_PX,
  READER_PLATFORM_PROFILES, auditMobileReaderCuts, autoFixMobileReaderCuts,
  buildMobilePreviewSvg, createDefaultReaderCuts, exportMobileReaderAuditJson,
  getMobileDeviceProfile, getReaderPlatformProfile,
  type AutoFixMobileReaderCutsResult, type CaptionPlacementZone, type CutBackgroundTone,
  type CutEdgeTreatment, type ManuscriptWidthPresetPx, type MobileAuditWarningSeverity,
  type MobileDeviceProfileId, type MobileReaderAuditResult, type MobileReaderCutInput,
  type ReaderPlatformId, type ViewerThemeMode,
} from "./mobile-reader-sim-engine";

import { MAX_READER_CUTS } from "./mobile-reader-input-contract";
import { useExampleCopy, useExampleNotification } from "./use-example-delivery";

export interface StudioMobileReaderPreviewPanelProps {
  readonly initialDeviceId?: MobileDeviceProfileId;
  readonly initialPlatformId?: ReaderPlatformId;
  readonly initialTheme?: ViewerThemeMode;
  readonly initialManuscriptWidthPx?: ManuscriptWidthPresetPx;
  readonly initialChromeVisible?: boolean;
  readonly initialCuts?: readonly MobileReaderCutInput[];
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onAuditChange?: (audit: MobileReaderAuditResult) => void | Promise<void>;
  readonly onExportJson?: (json: string, audit: MobileReaderAuditResult) => void | Promise<void>;
  readonly onExportSvg?: (svg: string, audit: MobileReaderAuditResult) => void | Promise<void>;
}

type ExportPreviewTab = "json" | "svg" | "hidden";

const CUT_LOOK_PRESETS: readonly {
  readonly id: string; readonly labelKo: string; readonly labelEn: string;
  readonly backgroundTone: CutBackgroundTone; readonly edgeTreatment: CutEdgeTreatment;
}[] = [
  { id: "white-hard", labelKo: "흰 배경·직각", labelEn: "White Hard", backgroundTone: "white-paper", edgeTreatment: "hard-white-border" },
  { id: "tinted-vignette", labelKo: "미색·비네팅", labelEn: "Soft Vignette", backgroundTone: "tinted", edgeTreatment: "soft-vignette" },
  { id: "noir-bleed", labelKo: "다크 누아르", labelEn: "Dark Noir", backgroundTone: "dark-noir", edgeTreatment: "full-bleed-dark" },
];

const CAPTION_ZONES: readonly { readonly id: CaptionPlacementZone; readonly labelKo: string; readonly labelEn: string }[] = [
  { id: "top", labelKo: "상단", labelEn: "Top" },
  { id: "middle", labelKo: "중앙", labelEn: "Mid" },
  { id: "bottom-edge", labelKo: "하단 경계", labelEn: "Bottom" },
];

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

function scoreTone(score: number): string {
  return score >= 85 ? "text-good" : score >= 65 ? "text-warn" : "text-bad";
}

function warningTone(severity: MobileAuditWarningSeverity): string {
  if (severity === "critical") return "border-bad bg-bad-soft text-bad";
  return severity === "warn" ? "border-warn bg-warning-soft text-warn" : "border-cool bg-info-soft text-cool";
}

function SimMetricCard(props: {
  readonly label: string; readonly value: string; readonly subtext: string;
  readonly testId: string; readonly valueTone?: string;
}): ReactElement {
  const { label, value, subtext, testId, valueTone = "text-fg" } = props;
  return (
    <div className="rounded-lg border border-line bg-raised px-3 py-2.5">
      <div className="text-[11px] font-medium text-fg-3 [word-break:keep-all]">{label}</div>
      <div data-testid={testId} className={`mt-0.5 text-base font-bold tabular-nums ${valueTone}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-fg-3 tabular-nums [word-break:keep-all]">{subtext}</div>
    </div>
  );
}

function MobilePhoneFramePreview(props: {
  readonly audit: MobileReaderAuditResult; readonly scrollOffsetCssPx: number; readonly isEn: boolean;
}): ReactElement {
  const { audit, scrollOffsetCssPx, isEn } = props;
  const clipUid = useId().replaceAll(":", "");
  const isDark = audit.viewerTheme === "dark";
  const frameScale = audit.device.formFactor === "tablet" ? 0.34 : 0.6;
  const screenW = Math.round(audit.device.cssWidthPx * frameScale);
  const screenH = Math.round(audit.device.cssHeightPx * frameScale);
  const bezel = 12;
  const svgW = screenW + bezel * 2;
  const svgH = screenH + bezel * 2 + 12;
  const sx = bezel;
  const sy = bezel + 6;
  const radius = Math.max(10, Math.round(audit.device.cornerRadiusPx * frameScale));

  const topSafeH = Math.round(audit.viewport.topSafeAreaPx * frameScale);
  const topChromeH = Math.round(audit.viewport.topChromeHeightPx * frameScale);
  const bottomChromeH = Math.round(audit.viewport.bottomChromeHeightPx * frameScale);
  const homeIndH = Math.round(audit.viewport.bottomHomeIndicatorPx * frameScale);
  const vpTopY = sy + topSafeH + topChromeH;
  const vpH = Math.max(80, screenH - topSafeH - topChromeH - bottomChromeH - homeIndH);
  const thumbBandH = Math.round(audit.viewport.thumbInterferenceBandPx * frameScale);
  const bottomChromeY = sy + screenH - homeIndH - bottomChromeH;

  return (
    <svg
      data-testid="reader-sim-phone-svg"
      data-device={audit.device.id}
      data-platform={audit.platform.id}
      data-theme={audit.viewerTheme}
      data-chrome-visible={String(audit.chromeVisible)}
      data-visible-viewport-px={audit.viewport.visibleViewportHeightPx}
      data-manuscript-width={audit.manuscriptWidthPx}
      viewBox={`0 0 ${svgW} ${svgH}`}
      className="mx-auto w-full max-w-[292px] text-fg"
      role="img"
      aria-label={isEn ? `${audit.device.shortLabelEn} ${audit.platform.shortLabelEn} ${audit.viewerTheme} mockup` : `${audit.device.shortLabelKo} ${audit.platform.shortLabelKo} ${isDark ? "다크" : "라이트"} 프리뷰`}
    >
      <defs>
        <clipPath id={`vp-${clipUid}`}><rect x={sx} y={vpTopY} width={screenW} height={vpH} /></clipPath>
      </defs>

      <rect x="2" y="2" width={svgW - 4} height={svgH - 4} rx={radius + 6} className="text-raised" fill="currentColor" />
      <rect x="2" y="2" width={svgW - 4} height={svgH - 4} rx={radius + 6} className="text-line-strong" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x={sx} y={sy} width={screenW} height={screenH} rx={radius} className={isDark ? "text-fg" : "text-canvas"} fill="currentColor" fillOpacity={isDark ? 0.92 : 1} />
      <rect x={sx} y={sy} width={screenW} height={screenH} rx={radius} className="text-line-strong" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x={sx} y={sy} width={screenW} height={topSafeH} className={isDark ? "text-fg" : "text-raised"} fill="currentColor" fillOpacity={isDark ? 0.85 : 0.9} />

      {audit.device.notchKind === "dynamic-island" ? (
        <rect data-testid="reader-sim-notch" data-notch-kind="dynamic-island" x={Math.round(sx + screenW * 0.35)} y={sy + 4} width={Math.round(screenW * 0.3)} height="11" rx="5.5" className="text-canvas" fill="currentColor" fillOpacity={0.35} />
      ) : audit.device.notchKind === "punch-hole" ? (
        <circle data-testid="reader-sim-notch" data-notch-kind="punch-hole" cx={Math.round(sx + screenW * 0.5)} cy={sy + Math.max(7, Math.round(topSafeH * 0.5))} r="4" className="text-canvas" fill="currentColor" fillOpacity={0.4} />
      ) : (
        <text data-testid="reader-sim-notch" data-notch-kind={audit.device.notchKind} x={sx + 10} y={sy + Math.max(9, topSafeH - 4)} className={isDark ? "text-canvas" : "text-fg-3"} fill="currentColor" fontSize="8" fontWeight="600">9:41</text>
      )}

      {audit.chromeVisible && topChromeH > 0 ? (
        <g data-testid="reader-sim-top-chrome">
          <rect x={sx} y={sy + topSafeH} width={screenW} height={topChromeH} className={isDark ? "text-fg-2" : "text-card"} fill="currentColor" fillOpacity={isDark ? 0.32 : 0.96} />
          <line x1={sx} y1={sy + topSafeH + topChromeH} x2={sx + screenW} y2={sy + topSafeH + topChromeH} className="text-line-strong" stroke="currentColor" strokeWidth="0.7" />
          <text x={sx + 10} y={sy + topSafeH + Math.round(topChromeH * 0.64)} className={isDark ? "text-canvas" : "text-fg"} fill="currentColor" fontSize="8.5" fontWeight="700">
            {isEn ? audit.platform.topBarTitleEn : audit.platform.topBarTitleKo}
          </text>
        </g>
      ) : null}

      <g clipPath={`url(#vp-${clipUid})`}>
        {audit.cuts.map((cut) => {
          const cutY = Math.round((vpTopY + (cut.scaledTopY - scrollOffsetCssPx) * frameScale) * 10) / 10;
          const cutH = Math.max(24, Math.round(cut.scaledCutHeightPx * frameScale * 10) / 10);
          if (cutY + cutH < vpTopY - 24 || cutY > vpTopY + vpH + 24) return null;

          const cutFillCls = cut.backgroundTone === "dark-noir" ? "text-fg-2" : cut.backgroundTone === "tinted" ? "text-raised" : "text-canvas";
          const cutStrokeCls = cut.whiteEdgeBleedRisk ? "text-warn" : cut.readabilityStatus === "danger" ? "text-bad" : "text-line-strong";
          const bubbleY = cut.captionPlacement === "bottom-edge" ? cutY + Math.max(16, cutH - 21) : cut.captionPlacement === "middle" ? cutY + Math.max(16, cutH * 0.44) : cutY + 17;
          const statusCls = cut.readabilityStatus === "danger" ? "text-bad" : "text-good";

          return (
            <g key={cut.id} data-preview-cut={cut.id}>
              <rect x={sx + 4} y={cutY} width={screenW - 8} height={cutH} rx="3" className={cutFillCls} fill="currentColor" fillOpacity={cut.backgroundTone === "dark-noir" ? 0.35 : 0.96} />
              <rect x={sx + 4} y={cutY} width={screenW - 8} height={cutH} rx="3" className={cutStrokeCls} fill="none" stroke="currentColor" strokeWidth={cut.whiteEdgeBleedRisk || cut.readabilityStatus === "danger" ? 1.8 : 0.9} />
              <text x={sx + 10} y={cutY + 12} className={cut.backgroundTone === "dark-noir" ? "text-canvas" : "text-fg"} fill="currentColor" fontSize="8" fontWeight="600">
                {isEn ? `C${cut.index + 1} · ${cut.labelEn}` : `${cut.index + 1}컷 · ${cut.labelKo}`}
              </text>
              <rect x={sx + 9} y={bubbleY} width={Math.max(82, screenW - 22)} height="16" rx="7" className="text-card" fill="currentColor" fillOpacity={0.94} />
              <rect x={sx + 9} y={bubbleY} width={Math.max(82, screenW - 22)} height="16" rx="7" className={statusCls} fill="none" stroke="currentColor" strokeWidth="1" />
              <text x={sx + 15} y={bubbleY + 10.5} className={statusCls} fill="currentColor" fontSize="7.5" fontWeight="700">
                {isEn ? `Eff ${cut.effectiveFontPx}px · ${cut.readabilityStatus}` : `실효 ${cut.effectiveFontPx}px · ${cut.readabilityStatus === "danger" ? "가독성 위험" : "적합"}`}
              </text>
            </g>
          );
        })}

        <rect data-testid="reader-sim-thumb-zone" x={sx} y={vpTopY + vpH - thumbBandH} width={screenW} height={thumbBandH} className="text-warn" fill="currentColor" fillOpacity={0.16} />
        <line x1={sx} y1={vpTopY + vpH - thumbBandH} x2={sx + screenW} y2={vpTopY + vpH - thumbBandH} className="text-warn" stroke="currentColor" strokeWidth="1" strokeDasharray="4 3" />
        <text x={sx + 8} y={vpTopY + vpH - thumbBandH + 10} className="text-warn" fill="currentColor" fontSize="7.5" fontWeight="700">
          {isEn ? "Thumb / Comment Zone" : "엄지 · 댓글바 간섭 주의"}
        </text>
      </g>

      {audit.chromeVisible && bottomChromeH > 0 ? (
        <g data-testid="reader-sim-bottom-chrome">
          <rect x={sx} y={bottomChromeY} width={screenW} height={bottomChromeH} className={isDark ? "text-fg-2" : "text-card"} fill="currentColor" fillOpacity={isDark ? 0.34 : 0.96} />
          <line x1={sx} y1={bottomChromeY} x2={sx + screenW} y2={bottomChromeY} className="text-line-strong" stroke="currentColor" strokeWidth="0.7" />
          <text x={sx + 10} y={bottomChromeY + Math.round(bottomChromeH * 0.6)} className={isDark ? "text-canvas" : "text-fg-2"} fill="currentColor" fontSize="7.5" fontWeight="600">
            {isEn ? audit.platform.bottomBarHintEn : audit.platform.bottomBarHintKo}
          </text>
        </g>
      ) : null}

      {homeIndH > 0 ? (
        <rect x={Math.round(sx + screenW * 0.33)} y={sy + screenH - Math.max(5, Math.round(homeIndH * 0.5))} width={Math.round(screenW * 0.34)} height="3.5" rx="2" className={isDark ? "text-canvas" : "text-fg-3"} fill="currentColor" fillOpacity={0.6} />
      ) : null}
    </svg>
  );
}

/** 웹툰 출고 전 모바일 독자 뷰어 9:16 라이브 시뮬레이터 패널. */
export function StudioMobileReaderPreviewPanel(props: StudioMobileReaderPreviewPanelProps): ReactElement {
  const {
    initialDeviceId = "iphone-se-375", initialPlatformId = "naver-webtoon", initialTheme = "dark",
    initialManuscriptWidthPx, initialChromeVisible = true, initialCuts,
    locale = "ko", className, onAuditChange, onExportJson, onExportSvg,
  } = props;

  const uid = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [deviceId, setDeviceId] = useState<MobileDeviceProfileId>(initialDeviceId);
  const [platformId, setPlatformId] = useState<ReaderPlatformId>(initialPlatformId);
  const [viewerTheme, setViewerTheme] = useState<ViewerThemeMode>(initialTheme);
  const [chromeVisible, setChromeVisible] = useState<boolean>(initialChromeVisible);
  const [manuscriptWidthPx, setManuscriptWidthPx] = useState<ManuscriptWidthPresetPx>(
    () => initialManuscriptWidthPx ?? getReaderPlatformProfile(initialPlatformId).recommendedManuscriptWidthPx,
  );
  const [cuts, setCuts] = useState<readonly MobileReaderCutInput[]>(
    () => (initialCuts && initialCuts.length > 0 ? initialCuts.map((c) => ({ ...c })) : createDefaultReaderCuts()),
  );
  const [scrollOffsetCssPx, setScrollOffsetCssPx] = useState<number>(0);
  const [exportTab, setExportTab] = useState<ExportPreviewTab>("json");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [lastAutoFix, setLastAutoFix] = useState<AutoFixMobileReaderCutsResult | null>(null);
  const [customCutSeq, setCustomCutSeq] = useState<number>(1);

  const audit = useMemo<MobileReaderAuditResult>(
    () => auditMobileReaderCuts({ cuts, deviceId, platformId, viewerTheme, manuscriptWidthPx, chromeVisible }),
    [cuts, deviceId, platformId, viewerTheme, manuscriptWidthPx, chromeVisible],
  );
  const maxScrollCssPx = Math.max(0, Math.round(audit.summary.totalScaledHeightCssPx - audit.viewport.visibleViewportHeightPx));
  const clampedScrollCssPx = Math.min(scrollOffsetCssPx, maxScrollCssPx);
  const previewSvg = useMemo<string>(() => buildMobilePreviewSvg(audit, { scrollOffsetCssPx: clampedScrollCssPx, locale }), [audit, clampedScrollCssPx, locale]);
  const reportJson = useMemo<string>(() => exportMobileReaderAuditJson(audit), [audit]);

  const notification = useExampleNotification(audit, onAuditChange);
  const delivery = useExampleCopy<MobileReaderAuditResult, "json" | "svg">({ json: onExportJson, svg: onExportSvg });

  const handleSelectDevice = (nextId: MobileDeviceProfileId): void => {
    setDeviceId(nextId);
    setScrollOffsetCssPx(0);
    setLastAutoFix(null);
    const spec = getMobileDeviceProfile(nextId);
    setStatusMessage(pick(`${spec.labelKo} 고정 치수 프로필로 전환했습니다.`, `Switched to ${spec.labelEn}.`));
  };

  const handleSelectPlatform = (nextId: ReaderPlatformId): void => {
    const spec = getReaderPlatformProfile(nextId);
    setPlatformId(nextId);
    setManuscriptWidthPx(spec.recommendedManuscriptWidthPx);
    setLastAutoFix(null);
    setStatusMessage(pick(`${spec.shortLabelKo} 크롬과 표준 원고 폭(${spec.recommendedManuscriptWidthPx}px)을 적용했습니다.`, `Loaded ${spec.shortLabelEn} chrome and ${spec.recommendedManuscriptWidthPx}px width.`));
  };

  const handleUpdateCut = (
    index: number,
    patch: Partial<Pick<MobileReaderCutInput, "bubbleFontPx" | "gutterAfterPx" | "cutHeightPx" | "backgroundTone" | "edgeTreatment" | "captionPlacement">>,
  ): void => {
    setCuts((prev) => prev.map((cut, idx) => (idx === index ? { ...cut, ...patch } : cut)));
    setLastAutoFix(null);
  };

  const handleAddCut = (): void => {
    if (cuts.length >= MAX_READER_CUTS) return;
    let seq = customCutSeq;
    const ids = new Set(cuts.map((cut) => cut.id));
    while (ids.has(`custom-cut-${seq}`)) seq += 1;
    setCustomCutSeq(seq + 1);
    setCuts((prev) => [
      ...prev,
      {
        id: `custom-cut-${seq}`, labelKo: `추가 컷 ${prev.length + 1}`, labelEn: `Extra Cut ${prev.length + 1}`,
        cutHeightPx: 580, gutterAfterPx: 180, bubbleFontPx: Math.max(24, audit.summary.minRecommendedManuscriptFontPx),
        dialogueCharCount: 20, backgroundTone: "tinted", edgeTreatment: "soft-vignette", captionPlacement: "middle",
      },
    ]);
    setLastAutoFix(null);
    setStatusMessage(pick("새 검증 컷을 회차 끝에 추가했습니다.", "Added a new cut to the episode sequence."));
  };

  const handleRemoveCut = (index: number): void => {
    if (cuts.length <= 2) return;
    setCuts((prev) => prev.filter((_, idx) => idx !== index));
    setLastAutoFix(null);
    setStatusMessage(pick(`${index + 1}번 컷을 목록에서 제거했습니다.`, `Removed cut ${index + 1}.`));
  };

  const handleAutoFix = (): void => {
    const fixed = autoFixMobileReaderCuts({ cuts, deviceId, platformId, viewerTheme, manuscriptWidthPx, chromeVisible });
    setCuts(fixed.cuts);
    setLastAutoFix(fixed);
    setStatusMessage(
      fixed.fixes.length > 0
        ? pick(`${fixed.fixes.length}개 컷을 자동 보정했습니다 (적합도 ${fixed.beforeAudit.summary.overallReadinessScore} → ${fixed.afterAudit.summary.overallReadinessScore}).`, `Auto-fixed ${fixed.fixes.length} cuts (score ${fixed.beforeAudit.summary.overallReadinessScore} -> ${fixed.afterAudit.summary.overallReadinessScore}).`)
        : pick("현재 모든 컷이 이 계산 예제의 가독성·여백 가정을 충족합니다.", "All cuts meet this example’s readability, glare, and clearance assumptions."),
    );
  };

  const handleReset = (): void => {
    const defPlatform = getReaderPlatformProfile(initialPlatformId);
    setDeviceId(initialDeviceId);
    setPlatformId(initialPlatformId);
    setViewerTheme(initialTheme);
    setChromeVisible(initialChromeVisible);
    setManuscriptWidthPx(initialManuscriptWidthPx ?? defPlatform.recommendedManuscriptWidthPx);
    setCuts(initialCuts && initialCuts.length > 0 ? initialCuts.map((c) => ({ ...c })) : createDefaultReaderCuts());
    setScrollOffsetCssPx(0);
    setLastAutoFix(null);
    setStatusMessage(pick("시뮬레이터 기기·플랫폼·샘플 컷을 기본값으로 복원했습니다.", "Restored simulator defaults."));
  };

  const handleCopyJson = (): void => {
    setExportTab("json");
    delivery.copy("json", reportJson, audit);
  };
  const handleCopySvg = (): void => {
    setExportTab("svg");
    delivery.copy("svg", previewSvg, audit);
  };

  const scrollSliderId = `${uid}-scroll-offset`;

  return (
    <section
      data-testid="studio-mobile-reader-preview-panel"
      aria-label={pick("모바일 독자 뷰어 9:16 라이브 시뮬레이터", "Mobile Reader 9:16 Live Preview Simulator")}
      className={`space-y-5 rounded-2xl border border-line bg-card p-5 text-fg ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">
              <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("고정 치수 계산 예제", "Fixed-Dimension Example")}
            </span>
            <span data-testid="reader-sim-estimate-badge" data-source-kind={audit.dataSourceKind} className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-raised px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("추정 시뮬레이션 (estimate)", "Estimated Simulation")}
            </span>
          </div>
          <h2 className="text-lg font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("모바일 독자 뷰어 9:16 라이브 시뮬레이터", "Mobile Reader 9:16 Live Preview Simulator")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick("합성 컷 메타데이터와 고정 치수로 축소 가독성·뷰어 영역을 추정합니다. 실제 기기·플랫폼·원고 픽셀 검증, 원고 반영 및 저장은 수행하지 않습니다.", "Estimate readability and viewer areas from synthetic cut metadata and fixed dimensions. No physical-device, live-platform, or artwork-pixel checks, manuscript changes, or persistence.")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="reader-sim-autofix-btn" onClick={handleAutoFix} className={BTN_SOLID}>
            <Wand2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("원클릭 보정", "Auto-Fix Issues")}
          </button>
          <button type="button" data-testid="reader-sim-reset-btn" onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("초기화", "Reset")}
          </button>
          <button type="button" data-testid="reader-sim-copy-json-btn" disabled={delivery.state === "pending"} onClick={handleCopyJson} className={BTN_OUTLINE}>
            <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("JSON 복사", "Copy JSON")}
          </button>
          <button type="button" data-testid="reader-sim-copy-svg-btn" disabled={delivery.state === "pending"} onClick={handleCopySvg} className={BTN_OUTLINE}>
            <Code2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("SVG 복사", "Copy SVG")}
          </button>
        </div>
      </header>

      <div role="status" aria-live="polite" className="space-y-2 text-xs [word-break:keep-all]">
        {notification.pending ? <p>{pick("예제 감사 전달 중", "Sending example audit")}</p> : null}
        {notification.error ? <div>{pick("감사 전달 실패. 원고 저장은 수행하지 않습니다.", "Audit delivery failed. No manuscript is saved.")} <button type="button" data-testid="reader-sim-notify-retry" disabled={notification.pending} onClick={notification.retry} className={BTN_OUTLINE}>{pick("전달 재시도", "Retry delivery")}</button></div> : null}
        {delivery.state === "pending" ? <p>{pick("클립보드 복사·예제 전달 중", "Copying and delivering example")}</p> : null}
        {delivery.state === "error" ? <div>{pick("복사 또는 예제 전달 실패. 완료된 복사는 반복하지 않습니다.", "Copy or example delivery failed. Completed copies are not repeated.")} <button type="button" data-testid="reader-sim-export-retry" onClick={delivery.retry} className={BTN_OUTLINE}>{pick("내보내기 재시도", "Retry export")}</button></div> : null}
        {delivery.state === "copied" ? <p>{pick("클립보드에 복사했습니다. 원고·서버에는 저장하지 않았습니다.", "Copied to clipboard. No manuscript or server save was performed.")}</p> : null}
      </div>
      {statusMessage ? (
        <div data-testid="reader-sim-status-banner" role="status" aria-live="polite" className="rounded-lg border border-accent bg-accent-soft px-3.5 py-2 text-xs font-medium text-accent [word-break:keep-all]">
          {statusMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SimMetricCard
          testId="reader-sim-readiness-score" label={pick("출고 적합도 점수", "Release Readiness")}
          value={`${audit.summary.overallReadinessScore} / 100`}
          subtext={audit.warnings.length === 0 ? pick("가독성·눈부심·간섭 경고 0건", "0 layout & readability warnings") : pick(`경고 ${audit.warnings.length}건 감지`, `${audit.warnings.length} warnings detected`)}
          valueTone={scoreTone(audit.summary.overallReadinessScore)}
        />
        <SimMetricCard
          testId="reader-sim-visible-viewport" label={pick("실제 컷 가시 뷰포트", "Visible Cut Viewport")}
          value={`${audit.viewport.visibleViewportHeightPx}px`}
          subtext={pick(`전체 ${audit.device.cssHeightPx}px 중 ${audit.viewport.usableViewportRatioPct}% · 한 화면 ${audit.summary.averageCutsPerScreen}컷`, `${audit.viewport.usableViewportRatioPct}% of ${audit.device.cssHeightPx}px · ${audit.summary.averageCutsPerScreen} cuts/screen`)}
        />
        <SimMetricCard
          testId="reader-sim-min-effective-font" label={pick("최소 실효 말풍선 폰트", "Min Effective Font")}
          value={`${audit.summary.minEffectiveFontPx}px`}
          subtext={pick(`${audit.summary.downscalePct}% 축소 · 권장 원고 ${audit.summary.minRecommendedManuscriptFontPx}px+`, `${audit.summary.downscalePct}% scale · Rec ${audit.summary.minRecommendedManuscriptFontPx}px+`)}
          valueTone={audit.summary.minEffectiveFontPx < READABILITY_MIN_EFFECTIVE_FONT_PX ? "text-bad" : "text-good"}
        />
        <SimMetricCard
          testId="reader-sim-read-time" label={pick("예상 완독 시간 (추정)", "Est. Read Time")}
          value={isEn ? audit.readTimeEstimate.projectedDurationLabelEn : audit.readTimeEstimate.projectedDurationLabelKo}
          subtext={pick(`현재 ${audit.summary.cutCount}컷 ${audit.readTimeEstimate.sequenceDurationLabelKo} · ${audit.readTimeEstimate.projectedEpisodeCutCount}컷 환산 추정`, `${audit.summary.cutCount} cuts ${audit.readTimeEstimate.sequenceDurationLabelEn} · ${audit.readTimeEstimate.projectedEpisodeCutCount}-cut est.`)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2.5 rounded-xl border border-line bg-canvas p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-fg [word-break:keep-all]">{pick("1. 독자 실기기 4종", "1. Target Devices (4 Profiles)")}</h3>
            <span className="text-[11px] font-medium text-fg-3 tabular-nums">{`${audit.device.cssWidthPx}×${audit.device.cssHeightPx} · ${audit.device.aspectRatioLabel}`}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {MOBILE_DEVICE_PROFILES.map((dev) => (
              <button key={dev.id} type="button" data-testid={`reader-sim-device-${dev.id}`} aria-pressed={dev.id === deviceId} onClick={() => handleSelectDevice(dev.id)} className={dev.id === deviceId ? BTN_ACTIVE : BTN_OUTLINE}>
                <span className="tabular-nums">{isEn ? dev.shortLabelEn : dev.shortLabelKo}</span>
                <span className="text-[10px] opacity-75 tabular-nums">{`${dev.cssWidthPx}w`}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2.5 rounded-xl border border-line bg-canvas p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-fg [word-break:keep-all]">{pick("2. 플랫폼 크롬 · 뷰어 모드 · 원고 폭", "2. Platform, Theme & Manuscript Width")}</h3>
            <span className="text-[11px] text-fg-3 tabular-nums">
              {pick(`상단 ${audit.viewport.topObstructedPx}px · 하단 ${audit.viewport.bottomObstructedPx}px`, `Top ${audit.viewport.topObstructedPx}px · Bot ${audit.viewport.bottomObstructedPx}px`)}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {READER_PLATFORM_PROFILES.map((pf) => (
              <button key={pf.id} type="button" data-testid={`reader-sim-platform-${pf.id}`} aria-pressed={pf.id === platformId} onClick={() => handleSelectPlatform(pf.id)} className={pf.id === platformId ? BTN_ACTIVE : BTN_OUTLINE}>
                <span>{isEn ? pf.shortLabelEn : pf.shortLabelKo}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" data-testid="reader-sim-theme-dark" aria-pressed={viewerTheme === "dark"} onClick={() => setViewerTheme("dark")} className={viewerTheme === "dark" ? BTN_ACTIVE : BTN_OUTLINE}>
                <Moon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {pick("다크 모드", "Dark")}
              </button>
              <button type="button" data-testid="reader-sim-theme-light" aria-pressed={viewerTheme === "light"} onClick={() => setViewerTheme("light")} className={viewerTheme === "light" ? BTN_ACTIVE : BTN_OUTLINE}>
                <Sun className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {pick("라이트 모드", "Light")}
              </button>
              <button type="button" data-testid="reader-sim-chrome-toggle" aria-pressed={chromeVisible} onClick={() => setChromeVisible((prev) => !prev)} className={chromeVisible ? BTN_ACTIVE : BTN_OUTLINE}>
                {chromeVisible ? <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                {chromeVisible ? pick("댓글바 표시", "Chrome On") : pick("몰입 모드", "Chrome Off")}
              </button>
            </div>
            <div className="flex items-center gap-1">
              {MANUSCRIPT_WIDTH_PRESETS.map((widthPx) => (
                <button key={widthPx} type="button" data-testid={`reader-sim-width-${widthPx}`} aria-pressed={manuscriptWidthPx === widthPx} onClick={() => setManuscriptWidthPx(widthPx)} className={manuscriptWidthPx === widthPx ? BTN_ACTIVE : BTN_OUTLINE}>
                  <span className="tabular-nums">{`${widthPx}px`}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-fg-3 [word-break:keep-all]">{isEn ? audit.platform.chromeNoteEn : audit.platform.chromeNoteKo}</p>
        </div>
      </div>

      <div data-testid="reader-sim-warnings-panel" className="space-y-2 rounded-xl border border-line bg-canvas p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
            {audit.warnings.length === 0 ? <CheckCircle2 className="h-4 w-4 text-good" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4 text-warn" aria-hidden="true" />}
            <span className="[word-break:keep-all]">
              {audit.warnings.length === 0
                ? pick("출고 전 모바일 독자 검수 통과 · 경고 0건", "Mobile Reader Audit Passed · 0 Warnings")
                : pick(`실시간 뷰어 경고 ${audit.warnings.length}건 — 아래 컷 설정 또는 원클릭 보정으로 해소`, `${audit.warnings.length} Live Reader Warnings`)}
            </span>
          </div>
          <span className="text-[11px] text-fg-3 tabular-nums">
            {pick(`최대 동시 노출 ${audit.summary.maxSimultaneousCutsInViewport}컷 · 총 ${audit.summary.viewportScreenCount}화면`, `Peak ${audit.summary.maxSimultaneousCutsInViewport} cuts/view · ${audit.summary.viewportScreenCount} screens`)}
          </span>
        </div>

        {audit.warnings.length > 0 ? (
          <ul className="space-y-1.5">
            {audit.warnings.map((warning) => (
              <li key={warning.code} data-testid={`reader-sim-warning-${warning.code}`} className={`rounded-lg border px-3 py-2 text-xs [word-break:keep-all] ${warningTone(warning.severity)}`}>
                <div className="font-bold">{isEn ? warning.titleEn : warning.titleKo}</div>
                <div className="mt-0.5 opacity-90">{isEn ? warning.detailEn : warning.detailKo}</div>
                <div className="mt-0.5 text-[11px] font-medium opacity-85">{isEn ? warning.recommendationEn : warning.recommendationKo}</div>
              </li>
            ))}
          </ul>
        ) : null}

        {lastAutoFix && lastAutoFix.fixes.length > 0 ? (
          <div data-testid="reader-sim-autofix-summary" className="rounded-lg border border-good bg-good-soft px-3 py-2 text-xs text-good [word-break:keep-all]">
            {lastAutoFix.fixes.map((item) => (isEn ? `C${item.index + 1}: ${item.changesEn.join(", ")}` : `${item.index + 1}컷: ${item.changesKo.join(", ")}`)).join(" · ")}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(296px,0.85fr)]">
        <div className="space-y-2.5 rounded-xl border border-line bg-canvas p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden="true" />
              <span className="[word-break:keep-all]">{pick("3. 컷별 말풍선 폰트 · 하단 여백 · 경계 편집", "3. Per-Cut Bubble Font, Gutter & Edge Editor")}</span>
            </div>
            <button type="button" data-testid="reader-sim-add-cut-btn" disabled={cuts.length >= MAX_READER_CUTS} onClick={handleAddCut} className={BTN_OUTLINE}>
              <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("컷 추가", "Add Cut")}
            </button>
          </div>

          <div className="space-y-2.5">
            {audit.cuts.map((cut) => {
              const fontId = `${uid}-font-${cut.id}`;
              const gutterId = `${uid}-gutter-${cut.id}`;
              const heightId = `${uid}-height-${cut.id}`;
              const hasIssue = cut.readabilityStatus === "danger" || cut.whiteEdgeBleedRisk || cut.thumbOverlapRisk;

              return (
                <div key={cut.id} data-testid={`reader-sim-cut-row-${cut.index}`} className={`space-y-2.5 rounded-xl border p-3 ${hasIssue ? "border-warn bg-warning-soft" : "border-line bg-card"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-raised px-1.5 py-0.5 text-[11px] font-bold text-fg tabular-nums">{isEn ? `C${cut.index + 1}` : `${cut.index + 1}컷`}</span>
                      <span className="text-xs font-bold text-fg [word-break:keep-all]">{isEn ? cut.labelEn : cut.labelKo}</span>
                      <span data-testid={`cut-effective-font-${cut.index}`} className={`rounded border px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${cut.readabilityStatus === "danger" ? "border-bad bg-bad-soft text-bad" : "border-good bg-good-soft text-good"}`}>
                        {pick(`실효 ${cut.effectiveFontPx}px`, `Eff ${cut.effectiveFontPx}px`)}
                      </span>
                      {cut.whiteEdgeBleedRisk ? <span data-testid={`cut-bleed-badge-${cut.index}`} className="rounded border border-warn bg-warning-soft px-1.5 py-0.5 text-[10px] font-bold text-warn">{pick("눈부심 위험", "Glare Risk")}</span> : null}
                      {cut.thumbOverlapRisk ? <span data-testid={`cut-thumb-badge-${cut.index}`} className="rounded border border-warn bg-warning-soft px-1.5 py-0.5 text-[10px] font-bold text-warn">{pick("댓글바 간섭", "Thumb Overlap")}</span> : null}
                    </div>
                    <button
                      type="button" data-testid={`cut-remove-${cut.index}`} disabled={audit.cuts.length <= 2}
                      aria-label={pick(`${cut.index + 1}번 컷 삭제`, `Remove cut ${cut.index + 1}`)}
                      onClick={() => handleRemoveCut(cut.index)}
                      className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border border-line bg-canvas text-fg-3 transition-colors motion-reduce:transition-none hover:border-bad hover:text-bad disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <label htmlFor={fontId} className="font-medium text-fg-2">{pick("말풍선 폰트", "Bubble Font")}</label>
                        <span className="font-semibold text-fg tabular-nums">{`${cut.bubbleFontPx}px`}</span>
                      </div>
                      <input id={fontId} data-testid={`cut-font-${cut.index}`} type="range" min={14} max={46} step={1} value={cut.bubbleFontPx} onChange={(e) => handleUpdateCut(cut.index, { bubbleFontPx: Number(e.target.value) })} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <label htmlFor={gutterId} className="font-medium text-fg-2">{pick("하단 여백", "Bottom Gutter")}</label>
                        <span className="font-semibold text-fg tabular-nums">{`${cut.gutterAfterPx}px`}</span>
                      </div>
                      <input id={gutterId} data-testid={`cut-gutter-${cut.index}`} type="range" min={20} max={520} step={10} value={cut.gutterAfterPx} onChange={(e) => handleUpdateCut(cut.index, { gutterAfterPx: Number(e.target.value) })} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <label htmlFor={heightId} className="font-medium text-fg-2">{pick("컷 높이", "Cut Height")}</label>
                        <span className="font-semibold text-fg tabular-nums">{`${cut.cutHeightPx}px`}</span>
                      </div>
                      <input id={heightId} data-testid={`cut-height-${cut.index}`} type="range" min={240} max={1800} step={20} value={cut.cutHeightPx} onChange={(e) => handleUpdateCut(cut.index, { cutHeightPx: Number(e.target.value) })} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {CUT_LOOK_PRESETS.map((preset) => {
                        const active = cut.backgroundTone === preset.backgroundTone && cut.edgeTreatment === preset.edgeTreatment;
                        return (
                          <button key={preset.id} type="button" data-testid={`cut-look-${cut.index}-${preset.id}`} aria-pressed={active} onClick={() => handleUpdateCut(cut.index, { backgroundTone: preset.backgroundTone, edgeTreatment: preset.edgeTreatment })} className={`min-h-11 cursor-pointer rounded-md border px-2 text-[11px] font-medium transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${active ? "border-accent bg-accent-soft text-accent" : "border-line bg-canvas text-fg-2 hover:bg-raised"}`}>
                            {isEn ? preset.labelEn : preset.labelKo}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {CAPTION_ZONES.map((zone) => {
                        const active = cut.captionPlacement === zone.id;
                        return (
                          <button key={zone.id} type="button" data-testid={`cut-caption-${cut.index}-${zone.id}`} aria-pressed={active} onClick={() => handleUpdateCut(cut.index, { captionPlacement: zone.id })} className={`min-h-11 cursor-pointer rounded-md border px-2 text-[11px] font-medium transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${active ? "border-accent bg-accent-soft text-accent" : "border-line bg-canvas text-fg-2 hover:bg-raised"}`}>
                            {isEn ? zone.labelEn : zone.labelKo}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="space-y-3 rounded-xl border border-line bg-canvas p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-fg [word-break:keep-all]">{pick("기기 치수 목업 예제", "Device-Dimension Mockup")}</h3>
            <span className="text-[11px] text-fg-3 tabular-nums">{`${audit.device.cssWidthPx}×${audit.device.cssHeightPx}`}</span>
          </div>
          <div className="rounded-lg border border-line bg-raised p-3">
            <MobilePhoneFramePreview audit={audit} scrollOffsetCssPx={clampedScrollCssPx} isEn={isEn} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <label htmlFor={scrollSliderId} className="font-medium text-fg-2 [word-break:keep-all]">{pick("뷰어 세로 스크롤 위치", "Viewer Vertical Scroll")}</label>
              <span data-testid="reader-sim-scroll-readout" className="font-semibold text-fg tabular-nums">{`${clampedScrollCssPx} / ${maxScrollCssPx}px`}</span>
            </div>
            <input id={scrollSliderId} data-testid="reader-sim-scroll-slider" type="range" min={0} max={Math.max(1, maxScrollCssPx)} step={10} value={clampedScrollCssPx} disabled={maxScrollCssPx === 0} onChange={(e) => setScrollOffsetCssPx(Number(e.target.value))} className={`h-2 w-full cursor-pointer accent-accent disabled:opacity-40 ${FOCUS_RING}`} />
          </div>
          <p className="text-[11px] text-fg-3 [word-break:keep-all]">{isEn ? audit.provenance.noticeEn : audit.provenance.noticeKo}</p>
        </aside>
      </div>

      <div className="space-y-2 rounded-xl border border-line bg-canvas p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-fg [word-break:keep-all]">{pick("감사 리포트 내보내기 미리보기", "Audit Report Export Preview")}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" data-testid="reader-sim-tab-json" aria-pressed={exportTab === "json"} onClick={() => setExportTab("json")} className={exportTab === "json" ? BTN_ACTIVE : BTN_OUTLINE}>JSON</button>
            <button type="button" data-testid="reader-sim-tab-svg" aria-pressed={exportTab === "svg"} onClick={() => setExportTab("svg")} className={exportTab === "svg" ? BTN_ACTIVE : BTN_OUTLINE}>SVG</button>
            <button type="button" data-testid="reader-sim-tab-hidden" aria-pressed={exportTab === "hidden"} onClick={() => setExportTab("hidden")} className={exportTab === "hidden" ? BTN_ACTIVE : BTN_OUTLINE}>{pick("접기", "Hide")}</button>
          </div>
        </div>
        {exportTab !== "hidden" ? (
          <pre data-testid="reader-sim-export-preview" className="max-h-52 overflow-auto rounded-lg border border-line bg-raised p-3 font-mono text-[11px] leading-relaxed text-fg-2">
            {exportTab === "json" ? reportJson : previewSvg}
          </pre>
        ) : null}
      </div>
    </section>
  );
}
