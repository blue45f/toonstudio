/**
 * Wave 59D — 모바일·태블릿(360px~1024px) 엄지존 드로잉 크롬 라이브 시뮬레이터 UI.
 *
 * - 5종 기기 뷰포트 스위치 + 오른손/왼손 완전 미러 토글 + 바텀 시트(닫힘/반높이 44%/확장 64%) + 몰입 모드 토글
 * - 브러시 크기/불투명도 수직 2-슬라이더 시연 및 하단 38% 엄지 아크 핵심 5버튼 인터랙션
 * - 순수 시맨틱 SVG 기기 프레임 목업(실제 Safe-Area 노치·펀치홀·폴드 힌지·홈바 + 3대 도달 호 히트맵 +
 *   좌우 미러 2-슬라이더 + 44px 핸들 반높이 시트 시각화, OKLCH/currentColor 전용, 원시 색·바이올렛 0%)
 * - 반응형 레이아웃 JSON 규격 복사·미리보기 및 좌우 미러 대칭 검증 요약
 */

import {
  CheckCircle2, Code2, Copy, Eye, FlipHorizontal2, Hand, Maximize2, Minimize2,
  PanelBottom, RotateCcw, ShieldCheck, SlidersVertical, Smartphone, Tablet,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  MOBILE_STUDIO_VIEWPORTS, THUMBZONE_SVG_PALETTE, THUMB_ARC_ACTIONS,
  evaluateThumbZoneErgonomics, exportMobileThumbzoneSpecJson, formatOklch,
  getMobileViewportPreset, verifyHandednessMirrorParity,
  type BottomSheetState, type Handedness, type MobileViewportPresetId,
  type ThumbArcActionId, type ThumbZoneErgonomicsInput, type ThumbZoneErgonomicsResult,
} from "./mobile-thumbzone-engine";

export interface StudioMobileThumbzonePanelProps {
  readonly initialViewportId?: MobileViewportPresetId;
  readonly initialHandedness?: Handedness;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onLayoutChange?: (result: ThumbZoneErgonomicsResult) => void;
  readonly onExportJson?: (json: string, result: ThumbZoneErgonomicsResult) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

const SHEET_OPTIONS: readonly { readonly id: BottomSheetState; readonly ko: string; readonly en: string; readonly ratioLabel: string }[] = [
  { id: "closed", ko: "닫힘", en: "Closed", ratioLabel: "0%" },
  { id: "half", ko: "반높이 시트", en: "Half-Sheet", ratioLabel: "44%" },
  { id: "expanded", ko: "도구 확장", en: "Expanded", ratioLabel: "64%" },
];

const BRUSH_PRESETS: readonly { readonly id: string; readonly ko: string; readonly en: string; readonly sizePx: number; readonly opacityPct: number }[] = [
  { id: "fine-ink", ko: "세필 선화", en: "Fine Ink", sizePx: 6, opacityPct: 100 },
  { id: "gpen", ko: "기본 G펜", en: "G-Pen", sizePx: 18, opacityPct: 85 },
  { id: "wash", ko: "채색 워시", en: "Color Wash", sizePx: 64, opacityPct: 45 },
];

const SVG_CHASSIS_BG = formatOklch(THUMBZONE_SVG_PALETTE.chassisBg);
const SVG_CHASSIS_STROKE = formatOklch(THUMBZONE_SVG_PALETTE.chassisStroke);
const SVG_CANVAS_PAPER = formatOklch(THUMBZONE_SVG_PALETTE.canvasPaper);
const SVG_CANVAS_GRID = formatOklch(THUMBZONE_SVG_PALETTE.canvasGrid);
const SVG_SAFE_TINT = formatOklch(THUMBZONE_SVG_PALETTE.safeAreaTint, 0.22);
const SVG_SAFE_STROKE = formatOklch(THUMBZONE_SVG_PALETTE.safeAreaTint, 0.68);
const SVG_CUTOUT = formatOklch(THUMBZONE_SVG_PALETTE.hardwareCutout);
const SVG_HINGE_TINT = formatOklch(THUMBZONE_SVG_PALETTE.foldHingeTint, 0.26);
const SVG_HINGE_STROKE = formatOklch(THUMBZONE_SVG_PALETTE.foldHingeTint, 0.85);
const SVG_HARD_FILL = formatOklch(THUMBZONE_SVG_PALETTE.hardZone, 0.12);
const SVG_STRETCH_FILL = formatOklch(THUMBZONE_SVG_PALETTE.stretchZone, 0.18);
const SVG_STRETCH_STROKE = formatOklch(THUMBZONE_SVG_PALETTE.stretchZone, 0.62);
const SVG_EASY_FILL = formatOklch(THUMBZONE_SVG_PALETTE.easyZone, 0.24);
const SVG_EASY_STROKE = formatOklch(THUMBZONE_SVG_PALETTE.easyZone, 0.82);
const SVG_PALM_FILL = formatOklch(THUMBZONE_SVG_PALETTE.palmGuard, 0.24);
const SVG_PALM_STROKE = formatOklch(THUMBZONE_SVG_PALETTE.palmGuard, 0.78);
const SVG_CHROME_BG = formatOklch(THUMBZONE_SVG_PALETTE.chromeBg, 0.94);
const SVG_CHROME_BORDER = formatOklch(THUMBZONE_SVG_PALETTE.chromeBorder);
const SVG_SLIDER_TRACK = formatOklch(THUMBZONE_SVG_PALETTE.sliderTrack, 0.92);
const SVG_SLIDER_SIZE = formatOklch(THUMBZONE_SVG_PALETTE.sliderSizeFill);
const SVG_SLIDER_OPACITY = formatOklch(THUMBZONE_SVG_PALETTE.sliderOpacityFill);
const SVG_BTN_BG = formatOklch(THUMBZONE_SVG_PALETTE.buttonBg, 0.94);
const SVG_BTN_ACTIVE_BG = formatOklch(THUMBZONE_SVG_PALETTE.buttonActiveBg);
const SVG_BTN_TEXT = formatOklch(THUMBZONE_SVG_PALETTE.buttonText);
const SVG_BTN_ACTIVE_TEXT = formatOklch(THUMBZONE_SVG_PALETTE.buttonActiveText);
const SVG_SHEET_BG = formatOklch(THUMBZONE_SVG_PALETTE.sheetBg, 0.96);
const SVG_SHEET_HANDLE = formatOklch(THUMBZONE_SVG_PALETTE.sheetHandle);
const SVG_STROKE_INK = formatOklch(THUMBZONE_SVG_PALETTE.strokeInk);
const SVG_HUD_TEXT = formatOklch(THUMBZONE_SVG_PALETTE.hudText);
const SVG_HUD_MUTED = formatOklch(THUMBZONE_SVG_PALETTE.hudMuted);

function DeviceThumbzoneMockupSvg(props: {
  readonly result: ThumbZoneErgonomicsResult;
  readonly activeActionId: ThumbArcActionId;
  readonly isEn: boolean;
}): ReactElement {
  const { result, activeActionId, isEn } = props;
  const clipUid = useId();
  const screenClipId = `thumbzone-screen-${clipUid.replace(/[^a-zA-Z0-9_-]/gu, "")}`;
  const { viewport, handedness, thumbPivot, reachZones, verticalSliders, bottomSheet, palmGuard } = result;
  const pad = 20;
  const vbW = viewport.widthPx + pad * 2;
  const vbH = viewport.heightPx + pad * 2;
  const cornerR = viewport.widthPx <= 375 ? 36 : 26;
  const cutout = viewport.hardwareCutout;
  const cutoutX = Math.round(viewport.widthPx * cutout.centerXRatio - cutout.widthPx / 2);
  const homeX = Math.round((viewport.widthPx - viewport.homeIndicator.widthPx) / 2);
  const homeY = viewport.heightPx - viewport.homeIndicator.bottomOffsetPx - viewport.homeIndicator.heightPx;
  const scaleFont = viewport.widthPx >= 712 ? 13 : 10.5;
  const sizeFillH = Math.max(10, Math.round((verticalSliders.sizeSlider.rect.height - 18) * verticalSliders.sizeSlider.normalized01));
  const opacityFillH = Math.max(10, Math.round((verticalSliders.opacitySlider.rect.height - 18) * verticalSliders.opacitySlider.normalized01));
  const previewStrokeW = Math.max(2, Math.min(28, Math.round(result.brushSizePx * 0.24)));
  const previewStrokeAlpha = Math.round((result.brushOpacityPct / 100) * 100) / 100;
  const strokeY = Math.round(viewport.heightPx * 0.34);

  return (
    <svg
      data-testid="thumbzone-device-svg"
      data-viewport-id={viewport.id}
      data-handedness={handedness}
      data-slider-side={result.sliderSide}
      data-thumb-arc-side={result.thumbArcSide}
      data-sheet-state={bottomSheet.effectiveState}
      data-immersive={String(result.immersiveMode)}
      data-safe-collisions={result.metrics.safeAreaCollisionCount}
      data-horizontal-overflow={result.metrics.horizontalOverflowPx}
      data-violet-free="true"
      viewBox={`0 0 ${vbW} ${vbH}`}
      role="img"
      aria-label={
        isEn
          ? `${viewport.nameEn} ${handedness}-handed thumb-zone chrome mockup, sheet ${bottomSheet.effectiveState}, canvas ${result.metrics.canvasUsableAreaPct}%`
          : `${viewport.nameKo} ${handedness === "right" ? "오른손" : "왼손"} 엄지존 크롬 목업(시트 ${bottomSheet.effectiveState}, 캔버스 ${result.metrics.canvasUsableAreaPct}%)`
      }
      className="mx-auto max-h-[540px] w-full rounded-xl border border-line-strong bg-canvas p-2 text-fg"
    >
      <defs>
        <clipPath id={screenClipId}>
          <rect x="0" y="0" width={viewport.widthPx} height={viewport.heightPx} rx={cornerR - 6} />
        </clipPath>
      </defs>

      <rect x="4" y="4" width={vbW - 8} height={vbH - 8} rx={cornerR} fill={SVG_CHASSIS_BG} stroke={SVG_CHASSIS_STROKE} strokeWidth="2.5" />

      <g transform={`translate(${pad} ${pad})`} clipPath={`url(#${screenClipId})`}>
        {/* 드로잉 캔버스 용지 + 웹툰 컷 가이드 */}
        <rect x="0" y="0" width={viewport.widthPx} height={viewport.heightPx} fill={SVG_CANVAS_PAPER} />
        <rect
          x={Math.round(viewport.widthPx * 0.16)} y={viewport.safeAreaInsets.topPx + 66}
          width={Math.round(viewport.widthPx * 0.68)} height={Math.round(viewport.heightPx * 0.36)}
          rx="8" fill="none" stroke={SVG_CANVAS_GRID} strokeWidth="1.5" strokeDasharray="6 4"
        />
        <path
          d={`M ${Math.round(viewport.widthPx * 0.22)} ${strokeY + 34} Q ${Math.round(viewport.widthPx * 0.46)} ${strokeY - 42} ${Math.round(viewport.widthPx * 0.74)} ${strokeY + 18}`}
          fill="none" stroke={SVG_STROKE_INK} strokeWidth={previewStrokeW} strokeOpacity={previewStrokeAlpha} strokeLinecap="round"
        />

        {/* 3대 엄지 도달 호 히트맵 (어려움 / 보통 / 편안 구간) */}
        <g data-testid="thumbzone-heatmap-layer">
          <rect x="0" y="0" width={viewport.widthPx} height={viewport.heightPx} fill={SVG_HARD_FILL} />
          <circle cx={thumbPivot.x} cy={thumbPivot.y} r={reachZones.stretchRadiusPx} fill={SVG_STRETCH_FILL} stroke={SVG_STRETCH_STROKE} strokeWidth="1.4" strokeDasharray="6 4" />
          <circle cx={thumbPivot.x} cy={thumbPivot.y} r={reachZones.easyRadiusPx} fill={SVG_EASY_FILL} stroke={SVG_EASY_STROKE} strokeWidth="2" />
          <line x1="0" y1={result.thumbArcBandTopPx} x2={viewport.widthPx} y2={result.thumbArcBandTopPx} stroke={SVG_EASY_STROKE} strokeWidth="1.2" strokeDasharray="5 4" />
          <circle cx={thumbPivot.x} cy={thumbPivot.y} r="6" fill={SVG_BTN_ACTIVE_BG} />
        </g>

        {/* 손바닥 오터치 보호 구역 (우세손 하단 모서리) */}
        <g data-testid="thumbzone-palm-guard-layer">
          <rect x={palmGuard.rect.x} y={palmGuard.rect.y} width={palmGuard.rect.width} height={palmGuard.rect.height} rx="10" fill={SVG_PALM_FILL} stroke={SVG_PALM_STROKE} strokeWidth="1.5" strokeDasharray="4 3" />
          <text x={palmGuard.rect.x + palmGuard.rect.width / 2} y={palmGuard.rect.y + palmGuard.rect.height / 2 + 3} textAnchor="middle" fill={SVG_STROKE_INK} fontSize={scaleFont - 1.5} fontFamily="monospace" fontWeight="700">
            PALM
          </text>
        </g>

        {/* 폴드 중앙 힌지 회피선 (Galaxy Fold 712 전용) */}
        {viewport.hasFoldHinge ? (
          <g data-testid="thumbzone-fold-hinge-layer">
            <rect x={cutoutX} y="0" width={cutout.widthPx} height={viewport.heightPx} fill={SVG_HINGE_TINT} />
            <line x1={viewport.widthPx / 2} y1="0" x2={viewport.widthPx / 2} y2={viewport.heightPx} stroke={SVG_HINGE_STROKE} strokeWidth="1.4" strokeDasharray="6 4" />
          </g>
        ) : null}

        {/* 상단·하단 Safe-Area 실측 영역 및 하드웨어 컷아웃 */}
        <g data-testid="thumbzone-safe-area-layer">
          <rect x="0" y="0" width={viewport.widthPx} height={viewport.safeAreaInsets.topPx} fill={SVG_SAFE_TINT} />
          <line x1="0" y1={viewport.safeAreaInsets.topPx} x2={viewport.widthPx} y2={viewport.safeAreaInsets.topPx} stroke={SVG_SAFE_STROKE} strokeWidth="1.2" strokeDasharray="4 3" />
          <rect x="0" y={viewport.heightPx - viewport.safeAreaInsets.bottomPx} width={viewport.widthPx} height={viewport.safeAreaInsets.bottomPx} fill={SVG_SAFE_TINT} />
          <line x1="0" y1={viewport.heightPx - viewport.safeAreaInsets.bottomPx} x2={viewport.widthPx} y2={viewport.heightPx - viewport.safeAreaInsets.bottomPx} stroke={SVG_SAFE_STROKE} strokeWidth="1.2" strokeDasharray="4 3" />
          {!viewport.hasFoldHinge ? (
            <rect x={cutoutX} y={cutout.topOffsetPx} width={cutout.widthPx} height={cutout.heightPx} rx={Math.round(cutout.heightPx / 2)} fill={SVG_CUTOUT} />
          ) : null}
          <rect x={homeX} y={homeY} width={viewport.homeIndicator.widthPx} height={viewport.homeIndicator.heightPx} rx="3" fill={SVG_CUTOUT} />
        </g>

        {/* 상단 44px 컨텍스트 바 */}
        {result.topBar.visible ? (
          <g data-testid="thumbzone-topbar-layer">
            <rect x={result.topBar.rect.x} y={result.topBar.rect.y} width={result.topBar.rect.width} height={result.topBar.rect.height} rx="12" fill={SVG_CHROME_BG} stroke={SVG_CHROME_BORDER} strokeWidth="1.2" />
            <text x={result.topBar.rect.x + result.topBar.rect.width / 2} y={result.topBar.rect.y + 26} textAnchor="middle" fill={SVG_HUD_TEXT} fontSize={scaleFont} fontFamily="monospace" fontWeight="700">
              {`${viewport.widthPx}×${viewport.heightPx} · ${handedness === "right" ? "RH" : "LH"} · ${result.metrics.canvasUsableAreaPct}%`}
            </text>
          </g>
        ) : null}

        {/* 좌/우 미러 수직 브러시 크기·불투명도 2-슬라이더 */}
        {verticalSliders.visible ? (
          <g data-testid="thumbzone-vertical-sliders-layer" data-side={verticalSliders.side}>
            {[
              { spec: verticalSliders.sizeSlider, fillH: sizeFillH, fillColor: SVG_SLIDER_SIZE, tag: `${result.brushSizePx}px` },
              { spec: verticalSliders.opacitySlider, fillH: opacityFillH, fillColor: SVG_SLIDER_OPACITY, tag: `${result.brushOpacityPct}%` },
            ].map(({ spec, fillH, fillColor, tag }) => {
              const innerBottom = spec.rect.y + spec.rect.height - 9;
              const fillY = innerBottom - fillH;
              return (
                <g key={spec.id}>
                  <rect x={spec.rect.x} y={spec.rect.y} width={spec.rect.width} height={spec.rect.height} rx="14" fill={SVG_SLIDER_TRACK} stroke={SVG_CHROME_BORDER} strokeWidth="1.2" />
                  <rect x={spec.rect.x + 12} y={fillY} width={spec.rect.width - 24} height={fillH} rx="6" fill={fillColor} />
                  <circle cx={spec.rect.x + spec.rect.width / 2} cy={fillY} r="8" fill={SVG_HUD_TEXT} stroke={fillColor} strokeWidth="2.5" />
                  <text x={spec.rect.x + spec.rect.width / 2} y={spec.rect.y + spec.rect.height - 14} textAnchor="middle" fill={SVG_HUD_TEXT} fontSize={8.5} fontFamily="monospace" fontWeight="700">
                    {tag}
                  </text>
                </g>
              );
            })}
          </g>
        ) : null}

        {/* 반높이(44%) / 확장(64%) 바텀 시트 + 44px 드래그 핸들 */}
        {bottomSheet.visible ? (
          <g data-testid="thumbzone-bottom-sheet-layer">
            <rect x={bottomSheet.rect.x} y={bottomSheet.rect.y} width={bottomSheet.rect.width} height={bottomSheet.rect.height} rx="20" fill={SVG_SHEET_BG} stroke={SVG_CHROME_BORDER} strokeWidth="1.4" />
            <rect x={bottomSheet.dragHandleRect.x} y={bottomSheet.dragHandleRect.y} width={bottomSheet.dragHandleRect.width} height={bottomSheet.dragHandleRect.height} rx="10" fill="none" stroke={SVG_SAFE_STROKE} strokeWidth="1" strokeDasharray="3 3" />
            <rect x={Math.round(viewport.widthPx / 2 - 26)} y={bottomSheet.rect.y + 19} width="52" height="6" rx="3" fill={SVG_SHEET_HANDLE} />
            <text x={viewport.widthPx / 2} y={bottomSheet.rect.y + 64} textAnchor="middle" fill={SVG_HUD_TEXT} fontSize={scaleFont} fontFamily="monospace" fontWeight="700">
              {`${Math.round(bottomSheet.heightRatio * 100)}% SHEET · 44px HANDLE · overscroll: contain`}
            </text>
            <text x={viewport.widthPx / 2} y={bottomSheet.rect.y + 84} textAnchor="middle" fill={SVG_HUD_MUTED} fontSize={scaleFont - 1} fontFamily="monospace">
              {isEn ? "Brush Library · Quick Layers · Symmetry" : "브러시 팩 · 레이어 빠른 전환 · 대칭 자"}
            </text>
          </g>
        ) : null}

        {/* 하단 38% 엄지 아크 핵심 5버튼 (또는 몰입 모드 복귀 버튼) */}
        {result.immersiveMode ? (
          <g data-testid="thumbzone-immersive-restore-layer">
            <rect x={result.immersiveRestoreButton.rect.x} y={result.immersiveRestoreButton.rect.y} width={result.immersiveRestoreButton.rect.width} height={result.immersiveRestoreButton.rect.height} rx={Math.round(result.immersiveRestoreButton.rect.width / 2)} fill={SVG_BTN_ACTIVE_BG} stroke={SVG_HUD_TEXT} strokeWidth="1.6" />
            <text x={result.immersiveRestoreButton.center.x} y={result.immersiveRestoreButton.center.y + 5} textAnchor="middle" fill={SVG_BTN_ACTIVE_TEXT} fontSize={scaleFont + 3} fontWeight="700">
              {result.immersiveRestoreButton.shortGlyph}
            </text>
          </g>
        ) : (
          <g data-testid="thumbzone-arc-buttons-layer" data-side={result.thumbArcSide}>
            {result.thumbArcButtons.map((btn) => {
              const isSelected = btn.id === activeActionId;
              return (
                <g key={btn.id}>
                  <rect x={btn.rect.x} y={btn.rect.y} width={btn.rect.width} height={btn.rect.height} rx={Math.round(btn.rect.width / 2)} fill={isSelected ? SVG_BTN_ACTIVE_BG : SVG_BTN_BG} stroke={isSelected ? SVG_HUD_TEXT : SVG_CHROME_BORDER} strokeWidth={isSelected ? "2" : "1.4"} />
                  <text x={btn.center.x} y={btn.center.y + 5} textAnchor="middle" fill={isSelected ? SVG_BTN_ACTIVE_TEXT : SVG_BTN_TEXT} fontSize={scaleFont + 3} fontWeight="700">
                    {btn.shortGlyph}
                  </text>
                </g>
              );
            })}
          </g>
        )}
      </g>
    </svg>
  );
}

/** 태블릿·모바일(360px~1024px) 한 손 엄지존 드로잉 크롬 & 좌우 미러 시뮬레이터 패널. */
export function StudioMobileThumbzonePanel(props: StudioMobileThumbzonePanelProps): ReactElement {
  const isEn = props.locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);
  const uid = useId();

  const initialPreset = getMobileViewportPreset(props.initialViewportId);
  const initialHand: Handedness = props.initialHandedness === "left" ? "left" : "right";

  const [viewportId, setViewportId] = useState<MobileViewportPresetId>(initialPreset.id);
  const [handedness, setHandedness] = useState<Handedness>(initialHand);
  const [bottomSheetState, setBottomSheetState] = useState<BottomSheetState>("closed");
  const [immersiveMode, setImmersiveMode] = useState<boolean>(false);
  const [brushSizePx, setBrushSizePx] = useState<number>(18);
  const [brushOpacityPct, setBrushOpacityPct] = useState<number>(85);
  const [activeActionId, setActiveActionId] = useState<ThumbArcActionId>("brush-eraser");
  const [showJsonPreview, setShowJsonPreview] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const evaluation = useMemo(
    () => evaluateThumbZoneErgonomics({ viewportId, handedness, bottomSheetState, immersiveMode, brushSizePx, brushOpacityPct }),
    [viewportId, handedness, bottomSheetState, immersiveMode, brushSizePx, brushOpacityPct],
  );
  const mirrorParity = useMemo(
    () => verifyHandednessMirrorParity(viewportId, bottomSheetState, immersiveMode),
    [viewportId, bottomSheetState, immersiveMode],
  );
  const exportedJson = useMemo(() => exportMobileThumbzoneSpecJson(evaluation), [evaluation]);

  const emitLayoutChange = (next: ThumbZoneErgonomicsInput): void => {
    if (!props.onLayoutChange) return;
    props.onLayoutChange(
      evaluateThumbZoneErgonomics({
        viewportId: next.viewportId ?? viewportId,
        handedness: next.handedness ?? handedness,
        bottomSheetState: next.bottomSheetState ?? bottomSheetState,
        immersiveMode: next.immersiveMode ?? immersiveMode,
        brushSizePx: next.brushSizePx ?? brushSizePx,
        brushOpacityPct: next.brushOpacityPct ?? brushOpacityPct,
      }),
    );
  };

  const handleViewportChange = (nextId: MobileViewportPresetId): void => {
    const preset = getMobileViewportPreset(nextId);
    setViewportId(preset.id);
    emitLayoutChange({ viewportId: preset.id });
    setStatusMessage(pick(`${preset.nameKo}(${preset.widthPx}×${preset.heightPx}) 규격으로 전환했습니다.`, `Switched viewport to ${preset.nameEn} (${preset.widthPx}×${preset.heightPx}).`));
  };

  const handleHandednessChange = (nextHand: Handedness): void => {
    setHandedness(nextHand);
    emitLayoutChange({ handedness: nextHand });
    setStatusMessage(
      nextHand === "left"
        ? pick("왼손잡이 완전 미러로 전환했습니다(우측 2-슬라이더 · 좌측 하단 엄지 아크).", "Mirrored to left-handed layout (right dual sliders · left lower thumb arc).")
        : pick("오른손잡이 레이아웃으로 전환했습니다(좌측 2-슬라이더 · 우측 하단 엄지 아크).", "Switched to right-handed layout (left dual sliders · right lower thumb arc)."),
    );
  };

  const handleSheetChange = (nextSheet: BottomSheetState): void => {
    const nextImmersive = nextSheet === "closed" ? immersiveMode : false;
    setBottomSheetState(nextSheet);
    if (nextSheet !== "closed") setImmersiveMode(false);
    emitLayoutChange({ bottomSheetState: nextSheet, immersiveMode: nextImmersive });
    const label =
      nextSheet === "half"
        ? pick("반높이 바텀 시트(44%, 44px 핸들, overscroll: contain)", "Half-Sheet (44%, 44px handle, overscroll: contain)")
        : nextSheet === "expanded"
          ? pick("도구 확장 시트(64%, overscroll: contain)", "Expanded Tool Sheet (64%, overscroll: contain)")
          : pick("바텀 시트 닫힘(캔버스 최대화)", "Bottom sheet closed (canvas maximized)");
    setStatusMessage(pick(`${label} 상태로 바꿨습니다.`, `Updated bottom sheet to ${label}.`));
  };

  const handleToggleImmersive = (): void => {
    const nextImmersive = !immersiveMode;
    setImmersiveMode(nextImmersive);
    emitLayoutChange({ immersiveMode: nextImmersive });
    setStatusMessage(
      nextImmersive
        ? pick("몰입 모드를 켰습니다. 상단 바와 시트를 접고 복귀 버튼만 남깁니다.", "Enabled immersive mode. Collapsed chrome to corner restore control.")
        : pick("몰입 모드를 끄고 엄지존 크롬을 복원했습니다.", "Disabled immersive mode and restored thumb-zone chrome."),
    );
  };

  const handleBrushSizeChange = (nextSize: number): void => {
    setBrushSizePx(nextSize);
    emitLayoutChange({ brushSizePx: nextSize });
  };

  const handleBrushOpacityChange = (nextOpacity: number): void => {
    setBrushOpacityPct(nextOpacity);
    emitLayoutChange({ brushOpacityPct: nextOpacity });
  };

  const handleApplyBrushPreset = (sizePx: number, opacityPct: number, label: string): void => {
    setBrushSizePx(sizePx);
    setBrushOpacityPct(opacityPct);
    emitLayoutChange({ brushSizePx: sizePx, brushOpacityPct: opacityPct });
    setStatusMessage(pick(`${label} 프리셋(${sizePx}px · ${opacityPct}%)을 적용했습니다.`, `Applied ${label} preset (${sizePx}px · ${opacityPct}%).`));
  };

  const handleThumbArcAction = (actionId: ThumbArcActionId, label: string): void => {
    setActiveActionId(actionId);
    if (actionId === "tool-sheet") {
      handleSheetChange(bottomSheetState === "closed" ? "half" : "closed");
      return;
    }
    setStatusMessage(pick(`미리보기에서 '${label}' 도구를 선택했습니다.`, `Selected '${label}' in the layout preview.`));
  };

  const handleExportJson = async (): Promise<void> => {
    setShowJsonPreview(true);
    props.onExportJson?.(exportedJson, evaluation);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(exportedJson);
        setStatusMessage(pick("반응형 엄지존 레이아웃 JSON 규격을 클립보드에 복사했습니다.", "Copied responsive thumb-zone layout JSON spec to clipboard."));
        return;
      }
      setStatusMessage(pick("아래 JSON 규격 미리보기를 열었습니다(이 환경에서는 자동 복사가 제한됩니다).", "Opened JSON spec preview below (clipboard API unavailable here)."));
    } catch {
      setStatusMessage(pick("클립보드 복사에 실패했습니다. 아래 JSON 미리보기에서 직접 복사해 주세요.", "Clipboard write failed. Copy directly from the JSON preview below."));
    }
  };

  const handleReset = (): void => {
    setViewportId(initialPreset.id);
    setHandedness(initialHand);
    setBottomSheetState("closed");
    setImmersiveMode(false);
    setBrushSizePx(18);
    setBrushOpacityPct(85);
    setActiveActionId("brush-eraser");
    setShowJsonPreview(false);
    emitLayoutChange({ viewportId: initialPreset.id, handedness: initialHand, bottomSheetState: "closed", immersiveMode: false, brushSizePx: 18, brushOpacityPct: 85 });
    setStatusMessage(pick("초기 기기와 엄지존 설정으로 되돌렸습니다.", "Reset device and thumb-zone settings to defaults."));
  };

  const { viewport, metrics, palmGuard, bottomSheet } = evaluation;
  const sizeInputId = `${uid}-brush-size`;
  const opacityInputId = `${uid}-brush-opacity`;

  return (
    <section
      data-testid="mobile-thumbzone-panel"
      aria-label={pick("모바일·태블릿 한 손 엄지존 드로잉 크롬 시뮬레이터", "Mobile & Tablet Thumb-Zone Drawing Chrome Simulator")}
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg md:p-5 ${props.className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent [word-break:keep-all]">
              <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("360px~1024px 한 손 엄지존 크롬", "360px–1024px Thumb-Zone Chrome")}
            </span>
            <span data-testid="thumbzone-mirror-badge" className="inline-flex items-center gap-1 rounded-full border border-good bg-good-soft px-2.5 py-0.5 text-[11px] font-semibold text-good tabular-nums [word-break:keep-all]">
              <FlipHorizontal2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick(`좌우 완전 미러 오차 ${mirrorParity.maxMirrorDriftPx}px`, `Exact L/R Mirror Drift ${mirrorParity.maxMirrorDriftPx}px`)}
            </span>
            <span data-testid="thumbzone-safe-badge" className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-card px-2.5 py-0.5 font-mono text-[11px] font-semibold text-fg-2 tabular-nums">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-good" aria-hidden="true" />
              {pick(`Safe 충돌 ${metrics.safeAreaCollisionCount}건 · 오버플로우 ${metrics.horizontalOverflowPx}px`, `Safe Collisions ${metrics.safeAreaCollisionCount} · Overflow ${metrics.horizontalOverflowPx}px`)}
            </span>
          </div>
          <h2 className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("태블릿·모바일 엄지 도달 호 & 좌우 미러 플로팅 독", "Tablet & Mobile Thumb-Zone Arc & Left/Right Mirror Dock")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "비우세손 가장자리에 수직 브러시 2-슬라이더를, 우세손 하단 38% 엄지 호에 핵심 5버튼을 배치해 손바닥 오터치와 시선 이동을 줄입니다.",
              "Places vertical dual brush sliders on the non-dominant edge and 5 core tools inside the lower 38% dominant thumb arc to prevent palm mistouches.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="thumbzone-export-json-btn" onClick={() => { void handleExportJson(); }} className={BTN_SOLID}>
            <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("레이아웃 JSON 복사", "Copy Layout JSON")}
          </button>
          <button type="button" data-testid="thumbzone-toggle-json-btn" aria-expanded={showJsonPreview} onClick={() => setShowJsonPreview((prev) => !prev)} className={showJsonPreview ? BTN_ACTIVE : BTN_OUTLINE}>
            <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("JSON 미리보기", "JSON Preview")}
          </button>
          <button type="button" data-testid="thumbzone-reset-btn" onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("초기화", "Reset")}
          </button>
        </div>
      </header>

      <div role="status" aria-live="polite" data-testid="thumbzone-status-banner" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
        {statusMessage || pick(`${viewport.nameKo} · ${viewport.recommendedGripKo}`, `${viewport.nameEn} · ${viewport.recommendedGripEn}`)}
      </div>

      {/* 5종 모바일·태블릿 뷰포트 스위치 */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Tablet className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("5종 실전 기기 뷰포트 프리셋", "5 Real-Device Viewport Presets")}
          </h3>
          <span className="font-mono text-[11px] text-fg-3 tabular-nums">
            {`Safe Top ${viewport.safeAreaInsets.topPx}px · Bottom ${viewport.safeAreaInsets.bottomPx}px · ${isEn ? viewport.hardwareCutout.labelEn : viewport.hardwareCutout.labelKo}`}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label={pick("기기 뷰포트 선택", "Select device viewport")}>
          {MOBILE_STUDIO_VIEWPORTS.map((vp) => {
            const active = vp.id === viewportId;
            return (
              <button
                key={vp.id} type="button" data-testid={`thumbzone-viewport-${vp.id}`} aria-pressed={active}
                onClick={() => handleViewportChange(vp.id)}
                className={`flex min-h-11 flex-col items-start justify-center gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${
                  active ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"
                }`}
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold">
                  {vp.widthPx >= 712 ? <Tablet className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" /> : <Smartphone className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />}
                  {isEn ? vp.shortLabelEn : vp.shortLabelKo}
                </span>
                <span className="font-mono text-[11px] text-fg-3 tabular-nums">{`${vp.widthPx}×${vp.heightPx} · ${vp.screenDiagonalInches}"`}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 본문 2열: 좌측 라이브 제어판 · 우측 시맨틱 SVG 목업 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-6">
          <div className="space-y-2.5 rounded-xl border border-line bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
                <Hand className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {pick("주 사용 손 미러링 & 몰입 모드", "Handedness Mirror & Immersive Mode")}
              </span>
              <span className="font-mono text-[11px] text-fg-3">
                {evaluation.sliderSide === "left" ? pick("좌 슬라이더 · 우 엄지 아크", "L Sliders · R Arc") : pick("우 슬라이더 · 좌 엄지 아크", "R Sliders · L Arc")}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button type="button" data-testid="thumbzone-hand-right" aria-pressed={handedness === "right"} onClick={() => handleHandednessChange("right")} className={handedness === "right" ? BTN_ACTIVE : BTN_OUTLINE}>
                {pick("오른손잡이 기본", "Right-Handed")}
              </button>
              <button type="button" data-testid="thumbzone-hand-left" aria-pressed={handedness === "left"} onClick={() => handleHandednessChange("left")} className={handedness === "left" ? BTN_ACTIVE : BTN_OUTLINE}>
                {pick("왼손잡이 완전 미러", "Left-Handed Mirror")}
              </button>
              <button type="button" data-testid="thumbzone-immersive-toggle" aria-pressed={immersiveMode} onClick={handleToggleImmersive} className={immersiveMode ? BTN_ACTIVE : BTN_OUTLINE}>
                {immersiveMode ? <Minimize2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Maximize2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                {immersiveMode ? pick("몰입 모드 켜짐", "Immersive On") : pick("몰입 모드 전환", "Immersive Mode")}
              </button>
            </div>
          </div>

          <div className="space-y-2.5 rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
                <PanelBottom className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {pick("바텀 시트 단계 (Half-Sheet)", "Bottom Sheet Detents")}
              </span>
              <span className="font-mono text-[11px] text-fg-3 tabular-nums">{`${bottomSheet.dragHandleHeightPx}px handle · overscroll: ${bottomSheet.overscrollBehavior}`}</span>
            </div>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label={pick("바텀 시트 상태", "Bottom sheet state")}>
              {SHEET_OPTIONS.map((opt) => {
                const active = bottomSheet.effectiveState === opt.id;
                return (
                  <button key={opt.id} type="button" data-testid={`thumbzone-sheet-${opt.id}`} aria-pressed={active} onClick={() => handleSheetChange(opt.id)} className={active ? BTN_ACTIVE : BTN_OUTLINE}>
                    <span>{isEn ? opt.en : opt.ko}</span>
                    <span className="font-mono text-[10px] opacity-80 tabular-nums">{opt.ratioLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
                <SlidersVertical className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {pick("비우세손 수직 2-슬라이더 시연", "Non-Dominant Dual Vertical Sliders")}
              </span>
              <span className="font-mono text-[11px] text-fg-3 tabular-nums">{`${brushSizePx}px · ${brushOpacityPct}%`}</span>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor={sizeInputId} className="flex items-center justify-between text-xs text-fg-2">
                  <span>{pick("브러시 크기", "Brush Size")}</span>
                  <span data-testid="thumbzone-brush-size-value" className="font-mono font-semibold text-fg tabular-nums">{`${brushSizePx}px`}</span>
                </label>
                <input id={sizeInputId} data-testid="thumbzone-brush-size-slider" type="range" min={1} max={200} value={brushSizePx} onChange={(e) => handleBrushSizeChange(Number(e.target.value))} className={`h-11 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
              </div>
              <div className="space-y-1">
                <label htmlFor={opacityInputId} className="flex items-center justify-between text-xs text-fg-2">
                  <span>{pick("불투명도", "Opacity")}</span>
                  <span data-testid="thumbzone-brush-opacity-value" className="font-mono font-semibold text-fg tabular-nums">{`${brushOpacityPct}%`}</span>
                </label>
                <input id={opacityInputId} data-testid="thumbzone-brush-opacity-slider" type="range" min={5} max={100} value={brushOpacityPct} onChange={(e) => handleBrushOpacityChange(Number(e.target.value))} className={`h-11 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {BRUSH_PRESETS.map((preset) => (
                <button key={preset.id} type="button" data-testid={`thumbzone-brush-preset-${preset.id}`} onClick={() => handleApplyBrushPreset(preset.sizePx, preset.opacityPct, isEn ? preset.en : preset.ko)} className={BTN_OUTLINE}>
                  {`${isEn ? preset.en : preset.ko} (${preset.sizePx}px)`}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-line bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-fg [word-break:keep-all]">{pick("하단 38% 엄지 아크 핵심 5버튼", "Lower 38% Thumb-Arc Core 5 Actions")}</span>
              <span className="font-mono text-[11px] text-good tabular-nums">{`${metrics.lower38CompliancePct}% · ${viewport.buttonSizePx}×${viewport.buttonSizePx}px`}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {THUMB_ARC_ACTIONS.map((action) => {
                const active = activeActionId === action.id;
                const label = isEn ? action.labelEn : action.labelKo;
                return (
                  <button key={action.id} type="button" data-testid={`thumbzone-action-${action.id}`} aria-pressed={active} onClick={() => handleThumbArcAction(action.id, label)} className={active ? BTN_ACTIVE : BTN_OUTLINE}>
                    <span aria-hidden="true">{action.shortGlyph}</span>
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2" data-testid="thumbzone-metrics-grid">
            <div className="rounded-xl border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("전체 화면의 캔버스 비율", "Canvas Share of Full Viewport")}</div>
              <div data-testid="thumbzone-metric-canvas" className={`mt-0.5 font-mono text-lg font-bold tabular-nums ${metrics.meetsCanvas82Gate ? "text-good" : "text-warn"}`}>{`${metrics.canvasGrossViewportPct}%`}</div>
              <div className="text-[11px] text-fg-2 [word-break:keep-all]">{metrics.meetsCanvas82Gate ? pick("82% 이상", "At least 82%") : pick("82% 미만", "Below 82%")}</div>
            </div>
            <div className="rounded-xl border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("엄지 편안 구간 적중률", "Easy-Reach Hit Rate")}</div>
              <div data-testid="thumbzone-metric-easy-reach" className="mt-0.5 font-mono text-lg font-bold text-good tabular-nums">{`${metrics.easyReachHitRatePct}%`}</div>
              <div className="font-mono text-[11px] text-fg-2 tabular-nums">{`Easy R≤${evaluation.reachZones.easyRadiusPx}px`}</div>
            </div>
            <div className="rounded-xl border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("44×44px 터치 타깃 준수율", "44×44px Target Compliance")}</div>
              <div data-testid="thumbzone-metric-touch44" className="mt-0.5 font-mono text-lg font-bold text-good tabular-nums">{`${metrics.touchTarget44CompliancePct}%`}</div>
              <div className="font-mono text-[11px] text-fg-2 tabular-nums">{pick(`최소 ${metrics.minTouchTargetPx}px · 겹침 ${metrics.controlOverlapCount}건`, `Min ${metrics.minTouchTargetPx}px · Overlaps ${metrics.controlOverlapCount}`)}</div>
            </div>
            <div className="rounded-xl border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("손바닥 오터치 회피 점수", "Palm Rejection Score")}</div>
              <div data-testid="thumbzone-metric-palm" className="mt-0.5 font-mono text-lg font-bold text-cool tabular-nums">{`${palmGuard.palmRejectionScorePct}%`}</div>
              <div className="font-mono text-[11px] text-fg-2 tabular-nums">
                {palmGuard.foldHingeClearancePx !== null
                  ? pick(`힌지 여유 ${palmGuard.foldHingeClearancePx}px`, `Hinge gap ${palmGuard.foldHingeClearancePx}px`)
                  : pick(`슬라이더 이격 ${palmGuard.sliderPalmClearancePx}px`, `Slider gap ${palmGuard.sliderPalmClearancePx}px`)}
              </div>
            </div>
          </div>
        </div>

        {/* 우측: 순수 시맨틱 SVG 기기 프레임 목업 + 범례 */}
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-card p-3 lg:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <Eye className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("실사 Safe-Area & 3대 엄지 도달 호 목업", "Safe-Area & 3-Zone Thumb Heatmap Mockup")}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-good [word-break:keep-all]">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("OKLCH 전용 · 바이올렛 0%", "OKLCH Only · 0% Violet")}
            </span>
          </div>

          <DeviceThumbzoneMockupSvg result={evaluation} activeActionId={activeActionId} isEn={isEn} />

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-[11px] text-fg-2 [word-break:keep-all]">
            <span>{pick("녹색 원: 편안 구간(Easy) · 황색 원: 보통(Stretch) · 외곽: 어려움(Hard)", "Sage: Easy · Amber: Stretch · Outer: Hard")}</span>
            <span className="font-mono text-fg-3 tabular-nums">{`Pivot (${evaluation.thumbPivot.x}, ${evaluation.thumbPivot.y})`}</span>
          </div>
        </div>
      </div>

      {showJsonPreview ? (
        <div className="space-y-1.5 rounded-xl border border-line bg-canvas p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-fg [word-break:keep-all]">
              {pick("반응형 엄지존 레이아웃 JSON 규격 (toonstudio.mobile-thumbzone.v1)", "Responsive Thumb-Zone Layout Spec JSON")}
            </span>
            <span className="font-mono text-[11px] text-fg-3 tabular-nums">{`${exportedJson.length} chars`}</span>
          </div>
          <pre data-testid="thumbzone-json-preview" className="max-h-64 overflow-auto overscroll-contain rounded-lg border border-line bg-panel p-3 font-mono text-[11px] text-fg-2">
            {exportedJson}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
