import { useMemo } from "react";
import {
  Brush,
  CheckCircle2,
  CloudUpload,
  Command,
  FlipHorizontal2,
  HelpCircle,
  Layers3,
  Maximize2,
  Minus,
  PanelLeft,
  PanelRight,
  Palette,
  Plus,
  Redo2,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Undo2,
} from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { ToonStudioWordmark } from "@/shared/components/toonstudio-brand";
import { ToonStudioMark } from "@/shared/components/toonstudio-mark";
import { cn } from "@/shared/lib/utils";
import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import {
  evaluateStudioCspBenchmarkScorecard,
  resolveStudioDeviceFormFactor,
} from "../drawing/studio-csp-benchmark-scorecard";

import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

const QUICK_STROKE_WIDTHS = [2, 5, 12, 28, 64] as const;
const QUICK_OPACITIES = [1, 0.75, 0.5, 0.25] as const;
const QUICK_STABILIZER_LEVELS = [0, 3, 7, 12, 15] as const;
const SYMMETRY_CYCLE_ORDER = ["off", "vertical", "horizontal", "quadrant", "radial"] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function percent(value: unknown): string {
  const number = typeof value === "number" && Number.isFinite(value) ? value : 1;
  return `${Math.round(clamp(number, 0, 1) * 100)}%`;
}

function resolveSymmetryShortLabel(symmetryType: unknown): string {
  switch (symmetryType) {
    case "vertical":
      return "수직 대칭";
    case "horizontal":
      return "수평 대칭";
    case "quadrant":
      return "4분할 대칭";
    case "radial":
      return "방사 대칭";
    default:
      return "대칭 끔";
  }
}

function resolveNextSymmetryType(current: unknown): string {
  const normalized = typeof current === "string" ? current : "off";
  const index = SYMMETRY_CYCLE_ORDER.indexOf(normalized as (typeof SYMMETRY_CYCLE_ORDER)[number]);
  if (index < 0) return "vertical";
  return SYMMETRY_CYCLE_ORDER[(index + 1) % SYMMETRY_CYCLE_ORDER.length] ?? "off";
}

function nextInCycle<T extends number>(list: readonly T[], current: number): T {
  const idx = list.findIndex((item) => Math.abs(item - current) < 0.01);
  if (idx < 0) return list[0];
  return list[(idx + 1) % list.length];
}

/**
 * Compact application chrome for the drawing-focused presentation.
 *
 * This intentionally calls the exact same Studio session handlers used by the embedded editor.
 * It is a projection of the shared runtime, not a second drawing implementation.
 */
export function StudioDrawingAppBar({ session }: { readonly session: StudioCuttoonEditorViewSession }) {
  const s = session;
  const brushName = s.activeCatalogBrush?.name ?? s.brush ?? "Brush";
  const strokeWidth = clamp(Math.round(Number(s.strokeWidth) || 8), 1, 200);
  const currentWidth = Math.round(Number(s.strokeWidth) || 0);
  const opacityRatio = clamp(
    typeof s.brushOpacity === "number" && Number.isFinite(s.brushOpacity) ? s.brushOpacity : 1,
    0.05,
    1,
  );
  const currentOpacity = typeof s.brushOpacity === "number" && Number.isFinite(s.brushOpacity) ? s.brushOpacity : 1;
  const stabilizer = clamp(typeof s.stabilizer === "number" && Number.isFinite(s.stabilizer) ? Math.round(s.stabilizer) : 0, 0, 100);
  const symmetryType = typeof s.symmetryType === "string" ? s.symmetryType : "off";
  const symmetryActive = symmetryType !== "off";
  const canvasFlipH = Boolean(s.canvasFlipH);
  const quickShapeActive = Boolean(s.quickShapeActive);
  const zoomRatio = clamp(typeof s.zoom === "number" && Number.isFinite(s.zoom) ? s.zoom : 1, 0.1, 16);
  const zoomPercent = Math.round(zoomRatio * 100);
  const tx = (source: string) => translateCurrentStaticSourceText("StudioDrawingAppBar", "ko", source);

  const isSyncBusy = Boolean(s.saving || s.collaborationOperationSyncPending);
  const hasSyncError = Boolean(s.serverRevisionError);
  const isOfflineProtected = Boolean(s.offlineSceneNotice);

  const syncLabel = hasSyncError
    ? tx("동기화 확인 필요")
    : isOfflineProtected
      ? tx("오프라인 보호 중")
      : isSyncBusy
        ? tx("실시간 저장 중…")
        : tx("실시간 동기화됨");

  const cspScorecard = useMemo(
    () =>
      evaluateStudioCspBenchmarkScorecard({
        deviceFormFactor: resolveStudioDeviceFormFactor(s.isMobile ? 390 : 1440, Boolean(s.isMobile)),
        strokeWidthPx: strokeWidth,
        brushOpacity: opacityRatio,
        stabilizerLevel: stabilizer,
      }),
    [opacityRatio, s.isMobile, stabilizer, strokeWidth],
  );

  const stepStrokeWidth = (delta: number) => {
    const next = clamp(strokeWidth + delta, 1, 200);
    s.setStrokeWidth?.(next);
  };

  const stepBrushOpacity = (deltaRatio: number) => {
    const next = Math.round(clamp(opacityRatio + deltaRatio, 0.05, 1) * 100) / 100;
    s.setBrushOpacity?.(next);
  };

  const stepStabilizer = (delta: number) => {
    const next = clamp(stabilizer + delta, 0, 100);
    s.setStabilizer?.(next);
  };

  const handleCycleSymmetry = () => {
    const next = resolveNextSymmetryType(symmetryType);
    if (typeof s.changeStudioSymmetryType === "function") {
      s.changeStudioSymmetryType(next);
      return;
    }
    s.setSymmetryType?.(next);
  };

  const handleResetZoom = () => {
    s.setZoom?.(1);
  };

  const handleToggleQuickShape = () => {
    s.setQuickShapeActive?.(!quickShapeActive);
  };

  return (
    <header
      data-studio-drawing-app-bar="true"
      data-studio-form-factor={cspScorecard.deviceFormFactor}
      data-studio-csp-two-x-verified={String(cspScorecard.meetsTwoXTarget)}
      style={{ containerType: "inline-size" }}
      className="@container flex flex-col border-b border-line bg-panel/95 shadow-sm backdrop-blur-xl"
    >
      <div className="flex min-h-12 shrink-0 items-center gap-2 px-2.5 sm:px-3">
        <div className="flex min-w-0 items-center gap-2 pr-1">
          <ToonStudioMark className="size-8 rounded-xl shadow-sm" />
          <div className="hidden min-w-0 sm:block">
            <div className="flex items-center gap-1.5">
              <strong className="block truncate text-xs font-black tracking-[-0.02em] text-fg">
                <ToonStudioWordmark /> Draw
              </strong>
              <span
                data-studio-appbar-csp-badge="true"
                className="hidden rounded-full border border-good/35 bg-good/10 px-1.5 py-0.5 text-[0.58rem] font-extrabold tracking-tight text-good xl:inline-flex"
                title={tx("클립스튜디오(CSP) 대비 종합 성능·품질·기능 우위 배율")}
              >
                CSP {cspScorecard.compositeRatio}×
              </span>
            </div>
            <span className="block max-w-48 truncate text-[0.65rem] text-fg-3">{s.name || "Untitled"}</span>
          </div>
        </div>

        <div className="hidden min-w-0 flex-1 items-center gap-1.5 md:flex" aria-label={tx("현재 드로잉 설정")}>
          <button
            type="button"
            className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-line bg-card px-2.5 min-h-9 py-1.5 text-[0.68rem] font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label={`${tx("브러시 라이브러리 열기, 현재")} ${brushName}`}
            title={tx("브러시 라이브러리")}
            onClick={(event) => {
              if (s.isMobile) {
                s.setMobileSheet?.("draw");
                return;
              }
              s.studioBrushCatalogHandlers?.toggle?.("desktop-dock", event.currentTarget);
            }}
          >
            <Brush size={13} aria-hidden="true" />
            <span className="max-w-28 truncate">{brushName}</span>
          </button>

          {/* 브러시 크기 빠른 스텝 컨트롤 */}
          <div
            data-studio-quick-size-control="true"
            className="inline-flex min-h-8 items-center rounded-full border border-line bg-card px-1 text-[0.68rem] font-semibold tabular-nums text-fg-2"
            role="group"
            aria-label={tx("브러시 크기 빠른 조절")}
          >
            <button
              type="button"
              className="inline-flex size-6 items-center justify-center rounded-full text-fg-3 transition-colors hover:bg-raised hover:text-fg"
              aria-label={tx("브러시 크기 줄이기")}
              title={tx("브러시 크기 줄이기 ([)")}
              onClick={() => stepStrokeWidth(strokeWidth <= 10 ? -1 : -4)}
            >
              <Minus size={11} aria-hidden="true" />
            </button>
            <button
              type="button"
              data-testid="drawing-appbar-size-cycle"
              className="min-w-11 px-1 text-center transition-colors hover:text-fg"
              aria-label={`${tx("브러시 크기 빠른 전환, 현재")} ${currentWidth} px`}
              title={tx("클릭하여 자주 쓰는 브러시 크기(2·5·12·28·64px) 전환 · 단축키 [ / ]")}
              onClick={() => s.setStrokeWidth?.(nextInCycle(QUICK_STROKE_WIDTHS, currentWidth))}
            >
              <span data-testid="studio-appbar-stroke-width">{strokeWidth} px</span>
            </button>
            <button
              type="button"
              className="inline-flex size-6 items-center justify-center rounded-full text-fg-3 transition-colors hover:bg-raised hover:text-fg"
              aria-label={tx("브러시 크기 키우기")}
              title={tx("브러시 크기 키우기 (])")}
              onClick={() => stepStrokeWidth(strokeWidth < 10 ? 1 : 4)}
            >
              <Plus size={11} aria-hidden="true" />
            </button>
          </div>

          {/* 브러시 불투명도 빠른 스텝 컨트롤 */}
          <div
            data-studio-quick-opacity-control="true"
            className="inline-flex min-h-8 items-center rounded-full border border-line bg-card px-1 text-[0.68rem] font-semibold tabular-nums text-fg-2"
            role="group"
            aria-label={tx("브러시 불투명도 빠른 조절")}
          >
            <button
              type="button"
              className="inline-flex size-6 items-center justify-center rounded-full text-fg-3 transition-colors hover:bg-raised hover:text-fg"
              aria-label={tx("불투명도 낮추기")}
              title={tx("불투명도 10% 낮추기")}
              onClick={() => stepBrushOpacity(-0.1)}
            >
              <Minus size={11} aria-hidden="true" />
            </button>
            <button
              type="button"
              data-testid="drawing-appbar-opacity-cycle"
              className="min-w-10 px-1 text-center transition-colors hover:text-fg"
              aria-label={`${tx("브러시 불투명도 빠른 전환, 현재")} ${percent(currentOpacity)}`}
              title={tx("클릭하여 불투명도(100%·75%·50%·25%) 빠른 전환")}
              onClick={() => s.setBrushOpacity?.(nextInCycle(QUICK_OPACITIES, currentOpacity))}
            >
              <span data-testid="studio-appbar-opacity">{percent(opacityRatio)}</span>
            </button>
            <button
              type="button"
              className="inline-flex size-6 items-center justify-center rounded-full text-fg-3 transition-colors hover:bg-raised hover:text-fg"
              aria-label={tx("불투명도 높이기")}
              title={tx("불투명도 10% 높이기")}
              onClick={() => stepBrushOpacity(0.1)}
            >
              <Plus size={11} aria-hidden="true" />
            </button>
          </div>

          {/* 손떨림 보정(Stabilizer) 빠른 스텝 컨트롤 */}
          <div
            data-studio-quick-stabilizer-control="true"
            className="inline-flex min-h-8 items-center rounded-full border border-line bg-card px-1 text-[0.68rem] font-semibold tabular-nums text-fg-2"
            role="group"
            aria-label={tx("손떨림 보정 빠른 조절")}
          >
            <button
              type="button"
              className="inline-flex size-6 items-center justify-center rounded-full text-fg-3 transition-colors hover:bg-raised hover:text-fg"
              aria-label={tx("손떨림 보정 줄이기")}
              title={tx("손떨림 보정 줄이기")}
              onClick={() => stepStabilizer(-5)}
            >
              <Minus size={11} aria-hidden="true" />
            </button>
            <button
              type="button"
              data-testid="drawing-appbar-stabilizer-cycle"
              className="px-1 text-center transition-colors hover:text-fg"
              aria-label={`${tx("손떨림 보정 강도 빠른 전환, 현재")} Stabilizer ${stabilizer}`}
              title={tx("클릭하여 손떨림 보정 단계(0·3·7·12·15) 빠른 전환")}
              onClick={() => s.setStabilizer?.(nextInCycle(QUICK_STABILIZER_LEVELS, stabilizer))}
            >
              <span data-testid="studio-appbar-stabilizer">Stabilizer {stabilizer}</span>
            </button>
            <button
              type="button"
              className="inline-flex size-6 items-center justify-center rounded-full text-fg-3 transition-colors hover:bg-raised hover:text-fg"
              aria-label={tx("손떨림 보정 높이기")}
              title={tx("손떨림 보정 높이기")}
              onClick={() => stepStabilizer(5)}
            >
              <Plus size={11} aria-hidden="true" />
            </button>
          </div>

          {/* 현재 색상 스와치 버튼 */}
          <button
            type="button"
            data-studio-color-swatch="true"
            className="size-6 shrink-0 rounded-full border-2 border-card shadow ring-1 ring-line transition-transform [forced-color-adjust:none] hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            style={{ backgroundColor: typeof s.color === "string" ? s.color : "#000000" }}
            aria-label={`${tx("현재 색상")} ${String(s.color ?? "")}`}
            title={`${tx("컬러 휠 열기")} (${String(s.color ?? "#000000")})`}
            onClick={() => s.setColorWheelOpen?.((value: boolean) => !value)}
          />

          {/* 대칭 자 빠른 순환 토글 */}
          <button
            type="button"
            data-studio-quick-symmetry-toggle="true"
            aria-pressed={symmetryActive}
            aria-label={tx("대칭 그리기 모드 전환")}
            title={`${tx("대칭 그리기 모드 전환")} · ${resolveSymmetryShortLabel(symmetryType)}`}
            onClick={handleCycleSymmetry}
            className={cn(
              "hidden min-h-8 items-center gap-1 rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold transition-colors lg:inline-flex",
              symmetryActive
                ? "border-accent/50 bg-accent/15 text-fg"
                : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            <Sparkles size={12} aria-hidden="true" />
            <span>{resolveSymmetryShortLabel(symmetryType)}</span>
          </button>

          {/* 캔버스 좌우 반전 점검 토글 */}
          <button
            type="button"
            data-studio-quick-flip-toggle="true"
            aria-pressed={canvasFlipH}
            aria-label={tx("캔버스 좌우 반전 보기")}
            title={tx("캔버스 좌우 반전 보기 (데생 균형 점검)")}
            onClick={() => s.studioOptionsBarsHandlers?.flipCanvasHorizontal?.()}
            className={cn(
              "hidden min-h-8 items-center gap-1 rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold transition-colors xl:inline-flex",
              canvasFlipH
                ? "border-accent/50 bg-accent/15 text-fg"
                : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            <FlipHorizontal2 size={12} aria-hidden="true" />
            <span>{canvasFlipH ? tx("반전 켜짐") : tx("좌우 반전")}</span>
          </button>

          {/* 브러시 랩(Brush Studio V6) 빠른 열기 */}
          <button
            type="button"
            data-studio-open-brush-lab="true"
            aria-label={tx("브러시 랩 열기")}
            title={tx("브러시 랩 (물리 안료·질감·다이내믹스 스튜디오)")}
            onClick={(event) => {
              if (typeof s.studioOptionsBarsHandlers?.openBrushStudio === "function") {
                s.studioOptionsBarsHandlers.openBrushStudio(event.currentTarget);
                return;
              }
              s.studioBrushCatalogHandlers?.toggle?.("desktop-dock", event.currentTarget);
            }}
            className="hidden min-h-8 items-center gap-1 rounded-full border border-line bg-card px-2.5 py-1 text-[0.66rem] font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg lg:inline-flex"
          >
            <SlidersHorizontal size={12} aria-hidden="true" />
            <span>{tx("브러시 랩")}</span>
          </button>

          {/* 빠른 도형 보정(QuickShape) 토글 */}
          <button
            type="button"
            data-studio-quick-shape-toggle="true"
            aria-pressed={quickShapeActive}
            aria-label={tx("빠른 도형 보정 전환")}
            title={tx("빠른 도형 보정 (직선·원·다각형 자동 스냅)")}
            onClick={handleToggleQuickShape}
            className={cn(
              "hidden min-h-8 items-center gap-1 rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold transition-colors xl:inline-flex",
              quickShapeActive
                ? "border-accent/50 bg-accent/15 text-fg"
                : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            <span>{quickShapeActive ? tx("도형 보정 켜짐") : tx("도형 보정")}</span>
          </button>

          {/* 캔버스 배율 표시 & 100% 원탭 리셋 */}
          <button
            type="button"
            data-studio-quick-zoom-reset="true"
            aria-label={tx("캔버스 배율 100% 초기화")}
            title={tx("캔버스 배율 100%로 즉시 초기화")}
            onClick={handleResetZoom}
            className="hidden min-h-8 items-center gap-1 rounded-full border border-line bg-card px-2.5 py-1 text-[0.66rem] font-semibold tabular-nums text-fg-2 transition-colors hover:bg-raised hover:text-fg xl:inline-flex"
          >
            <span data-testid="studio-appbar-zoom-percent">{zoomPercent}%</span>
          </button>

          {/* 원고 동기화 상태 버튼 */}
          <button
            type="button"
            data-testid="drawing-appbar-sync-status"
            aria-live="polite"
            aria-label={`${tx("원고 동기화 상태")}: ${syncLabel}`}
            title={tx("클릭하여 즉시 원고 저장·서버 동기화 플러시")}
            onClick={() => s.requestSaveFlush?.()}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.65rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              hasSyncError
                ? "border-warn/45 bg-warn/10 text-warn"
                : isOfflineProtected
                  ? "border-cool/45 bg-cool/10 text-cool"
                  : isSyncBusy
                    ? "border-accent/45 bg-accent/10 text-accent"
                    : "border-good/35 bg-good/10 text-good",
            )}
          >
            {hasSyncError || isOfflineProtected ? (
              <ShieldAlert size={12} aria-hidden="true" />
            ) : isSyncBusy ? (
              <CloudUpload size={12} aria-hidden="true" />
            ) : (
              <CheckCircle2 size={12} aria-hidden="true" />
            )}
            <span>{syncLabel}</span>
          </button>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1" aria-label={tx("드로잉 빠른 도구")}>
          <button
            type="button"
            className={buttonClass({ variant: "quiet", size: "icon" })}
            disabled={Boolean(s.menuEditUndoDisabled)}
            aria-label={tx("실행 취소")}
            title={`${tx("실행 취소")} · Ctrl/⌘ Z`}
            onClick={() => s.undo?.()}
          >
            <Undo2 size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={buttonClass({ variant: "quiet", size: "icon" })}
            disabled={Boolean(s.menuEditRedoDisabled)}
            aria-label={tx("다시 실행")}
            title={`${tx("다시 실행")} · Ctrl/⌘ Shift Z`}
            onClick={() => s.redo?.()}
          >
            <Redo2 size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={cn(buttonClass({ variant: s.colorWheelOpen ? "solid" : "quiet", size: "icon" }))}
            aria-pressed={Boolean(s.colorWheelOpen)}
            aria-label={tx("컬러 휠")}
            title={tx("컬러 휠")}
            onClick={() => s.setColorWheelOpen?.((value: boolean) => !value)}
          >
            <Palette size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={cn(buttonClass({ variant: s.quickAccessPaletteOpen ? "solid" : "quiet", size: "icon" }))}
            aria-pressed={Boolean(s.quickAccessPaletteOpen)}
            aria-label={tx("퀵 액세스")}
            title={`${tx("퀵 액세스")} · ${tx("자주 쓰는 명령")}`}
            onClick={() => s.setQuickAccessPaletteOpen?.((value: boolean) => !value)}
          >
            <Command size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            data-testid="drawing-appbar-help-button"
            className={cn(buttonClass({ variant: s.shortcutsOpen ? "solid" : "quiet", size: "icon" }))}
            aria-pressed={Boolean(s.shortcutsOpen)}
            aria-label={tx("단축키 및 입문 가이드")}
            title={`${tx("단축키 및 클립스튜디오·프로크리에이트 이주 가이드")} · ?`}
            onClick={() => s.setShortcutsOpen?.((value: boolean) => !value)}
          >
            <HelpCircle size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={cn(buttonClass({ variant: s.visibleLeftPanelOpen ? "solid" : "quiet", size: "icon" }), "hidden sm:inline-flex")}
            aria-pressed={Boolean(s.visibleLeftPanelOpen)}
            aria-label={tx("페이지 패널")}
            title={tx("페이지 패널")}
            onClick={() => s.setLeftPanelOpenWithOverride?.(!s.visibleLeftPanelOpen)}
          >
            <PanelLeft size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={cn(buttonClass({ variant: s.visibleRightPanelOpen ? "solid" : "quiet", size: "icon" }), "hidden sm:inline-flex")}
            aria-pressed={Boolean(s.visibleRightPanelOpen)}
            aria-label={tx("레이어·속성 패널")}
            title={tx("레이어·속성 패널")}
            onClick={() => s.setRightPanelOpenWithOverride?.(!s.visibleRightPanelOpen)}
          >
            <Layers3 size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={buttonClass({ variant: s.canvasOnlyMode ? "solid" : "quiet", size: "icon" })}
            aria-pressed={Boolean(s.canvasOnlyMode)}
            aria-label={tx("캔버스만 보기")}
            title={`${tx("캔버스만 보기")} · ${tx("4손가락 탭")}`}
            onClick={() => s.setCanvasOnlyMode?.((value: boolean) => !value)}
          >
            <Maximize2 size={17} aria-hidden="true" />
          </button>
          <Link
            href="/studio?drawingShell=integrated"
            className={cn(buttonClass({ variant: "outline", size: "sm" }), "ml-1 hidden min-h-9 gap-1.5 px-2.5 text-[0.7rem] font-bold lg:inline-flex")}
          >
            <PanelRight size={15} aria-hidden="true" />
            {tx("전체 스튜디오")}
          </Link>
        </div>
      </div>

      {/* 컴팩트/태블릿 다기종 1-탭 빠른 드로잉 스트립 */}
      <div
        data-studio-mobile-quick-strip="true"
        className="flex items-center justify-between gap-1.5 border-t border-line/60 px-2.5 py-1 md:hidden"
        aria-label={tx("모바일 빠른 드로잉 스트립")}
      >
        <button
          type="button"
          className="inline-flex min-h-8 min-w-0 items-center gap-1 rounded-full border border-line bg-card px-2.5 py-1 text-[0.65rem] font-semibold text-fg-2"
          aria-label={tx("모바일 브러시 시트 열기")}
          onClick={(event) => {
            if (s.isMobile) {
              s.setMobileSheet?.("draw");
              return;
            }
            s.studioBrushCatalogHandlers?.toggle?.("desktop-dock", event.currentTarget);
          }}
        >
          <Brush size={12} aria-hidden="true" />
          <span className="max-w-24 truncate">{brushName}</span>
        </button>

        <div className="inline-flex items-center gap-1 text-[0.65rem] font-semibold tabular-nums text-fg-2">
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-full border border-line bg-card"
            aria-label={tx("모바일 브러시 크기 줄이기")}
            onClick={() => stepStrokeWidth(-2)}
          >
            <Minus size={11} aria-hidden="true" />
          </button>
          <span className="min-w-10 text-center">{strokeWidth}px</span>
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-full border border-line bg-card"
            aria-label={tx("모바일 브러시 크기 키우기")}
            onClick={() => stepStrokeWidth(2)}
          >
            <Plus size={11} aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          className="inline-flex min-h-7 items-center gap-1 rounded-full border border-line bg-card px-2 py-0.5 text-[0.62rem] font-semibold text-fg-2"
          aria-label={tx("모바일 대칭 전환")}
          onClick={handleCycleSymmetry}
        >
          <Sparkles size={11} aria-hidden="true" />
          <span>{resolveSymmetryShortLabel(symmetryType)}</span>
        </button>
      </div>
    </header>
  );
}
