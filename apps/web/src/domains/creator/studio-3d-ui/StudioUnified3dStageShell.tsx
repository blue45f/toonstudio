import {
  ArrowLeft,
  Box,
  Camera,
  Check,
  MoreHorizontal,
  PenTool,
  Redo2,
  Undo2,
  UserRound,
} from "lucide-react";
import { useCallback, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/shared/lib/utils";
import {
  UNIFIED_3D_STAGE_SPECS,
  buildUnified3dStageHref,
  resolveUnified3dStageFromDeepLink,
  type Unified3dStageId,
} from "./studio-unified-3d-stage-routing";

export type {
  Unified3dDeepLinkResolution,
  Unified3dStageId,
  Unified3dStageSpec,
} from "./studio-unified-3d-stage-routing";

export interface StudioUnified3dStageShellProps {
  readonly initialPathname?: string;
  readonly initialSearch?: string;
  readonly activeStage?: Unified3dStageId;
  readonly onStageChange?: (stageId: Unified3dStageId, canonicalHref: string) => void;
  readonly canUndo?: boolean;
  readonly canRedo?: boolean;
  readonly onUndo?: () => void;
  readonly onRedo?: () => void;
  readonly canBakeToCut?: boolean;
  readonly bakeUnavailableReason?: string;
  readonly onBakeToCut?: () => void;
  readonly onReturnTo2d?: () => void;
  readonly statusSummaryKo?: string;
  readonly overflowActions?: ReactNode;
  readonly viewport: ReactNode;
  readonly sideInspector?: ReactNode;
}

const STAGE_ICONS: Readonly<Record<Unified3dStageId, typeof Box>> = Object.freeze({
  build: Box,
  pose: UserRound,
  shot: Camera,
  "live-ink": PenTool,
});

/**
 * Calm Chrome 기반 4단계 통합 3D 스테이지 셸.
 * 상단 기본 컨트롤을 9개 이하(4단계 탭 + 실행취소/다시실행 + 2D 컷 굽기 + 더보기 + 2D 복귀)로 제한한다.
 */
export function StudioUnified3dStageShell({
  initialPathname = "/studio/3d/stage",
  initialSearch = "",
  activeStage: controlledStage,
  onStageChange,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  canBakeToCut = true,
  bakeUnavailableReason = "장면에 객체를 배치한 뒤 2D 컷에 구울 수 있습니다.",
  onBakeToCut,
  onReturnTo2d,
  statusSummaryKo,
  overflowActions,
  viewport,
  sideInspector,
}: StudioUnified3dStageShellProps) {
  const deepLink = useMemo(
    () => resolveUnified3dStageFromDeepLink(initialPathname, initialSearch),
    [initialPathname, initialSearch],
  );
  const [internalStage, setInternalStage] = useState<Unified3dStageId>(deepLink.stageId);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [bakedMessage, setBakedMessage] = useState<string | null>(null);
  const overflowId = useId();
  const stagePanelId = useId();

  const currentStage = controlledStage ?? internalStage;
  const activeSpec =
    UNIFIED_3D_STAGE_SPECS.find((item) => item.id === currentStage) ?? UNIFIED_3D_STAGE_SPECS[0]!;
  const currentHref = buildUnified3dStageHref(currentStage, deepLink.preservedParams);

  const selectStage = useCallback(
    (nextStage: Unified3dStageId) => {
      if (controlledStage === undefined) {
        setInternalStage(nextStage);
      }
      onStageChange?.(nextStage, buildUnified3dStageHref(nextStage, deepLink.preservedParams));
    },
    [controlledStage, deepLink.preservedParams, onStageChange],
  );

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % UNIFIED_3D_STAGE_SPECS.length;
    else if (event.key === "ArrowLeft")
      nextIndex = (index - 1 + UNIFIED_3D_STAGE_SPECS.length) % UNIFIED_3D_STAGE_SPECS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = UNIFIED_3D_STAGE_SPECS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const target = UNIFIED_3D_STAGE_SPECS[nextIndex];
    if (!target) return;
    selectStage(target.id);
    document.getElementById(`unified-3d-tab-${target.id}`)?.focus();
  };

  const handleBakeClick = () => {
    if (!canBakeToCut) return;
    onBakeToCut?.();
    setBakedMessage(`${activeSpec.shortLabelKo} 결과를 2D 원고 컷에 반영했습니다.`);
  };

  return (
    <div
      data-testid="studio-unified-3d-stage-shell"
      data-unified-3d-stage={currentStage}
      data-unified-3d-canonical-href={currentHref}
      data-unified-3d-primary-controls="9"
      className="flex min-h-0 flex-1 flex-col bg-canvas text-fg"
    >
      <header
        role="toolbar"
        aria-label="통합 3D 스테이지 제어 바"
        className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-panel px-3 py-1.5"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            data-testid="unified-3d-return-2d"
            onClick={onReturnTo2d}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-accent hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [word-break:keep-all]"
          >
            <ArrowLeft size={14} aria-hidden />
            <span>2D로 복귀</span>
          </button>

          <div
            role="tablist"
            aria-label="통합 3D 제작 4단계"
            className="flex flex-wrap items-center gap-1"
          >
            {UNIFIED_3D_STAGE_SPECS.map((spec, index) => {
              const Icon = STAGE_ICONS[spec.id];
              const selected = spec.id === currentStage;
              return (
                <button
                  key={spec.id}
                  id={`unified-3d-tab-${spec.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={stagePanelId}
                  tabIndex={selected ? 0 : -1}
                  data-testid={`unified-3d-stage-tab-${spec.id}`}
                  onClick={() => selectStage(spec.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [word-break:keep-all]",
                    selected
                      ? "border-accent bg-accent-soft text-accent shadow-[inset_2px_0_0_var(--color-accent)]"
                      : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
                  )}
                >
                  <Icon size={14} aria-hidden />
                  <span>{spec.labelKo}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            data-testid="unified-3d-undo"
            disabled={!canUndo}
            title={canUndo ? "실행 취소" : "되돌릴 3D 편집 이력이 없습니다."}
            onClick={onUndo}
            aria-label="실행 취소"
            className="grid size-11 place-items-center rounded-lg border border-line bg-card text-fg-2 transition-colors hover:border-accent hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Undo2 size={15} aria-hidden />
          </button>
          <button
            type="button"
            data-testid="unified-3d-redo"
            disabled={!canRedo}
            title={canRedo ? "다시 실행" : "다시 실행할 3D 편집 이력이 없습니다."}
            onClick={onRedo}
            aria-label="다시 실행"
            className="grid size-11 place-items-center rounded-lg border border-line bg-card text-fg-2 transition-colors hover:border-accent hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Redo2 size={15} aria-hidden />
          </button>
          <button
            type="button"
            data-testid="unified-3d-bake-cut"
            disabled={!canBakeToCut}
            title={canBakeToCut ? "현재 3D 프레임을 2D 원고 컷에 굽기" : bakeUnavailableReason}
            onClick={handleBakeClick}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 [word-break:keep-all]"
          >
            <Check size={14} aria-hidden />
            <span>2D 컷에 굽기</span>
          </button>
          <button
            type="button"
            data-testid="unified-3d-overflow-toggle"
            aria-expanded={overflowOpen}
            aria-controls={overflowId}
            aria-label="보조 도구 더보기"
            onClick={() => setOverflowOpen((open) => !open)}
            className={cn(
              "grid size-11 place-items-center rounded-lg border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              overflowOpen
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2 hover:border-accent hover:text-fg",
            )}
          >
            <MoreHorizontal size={16} aria-hidden />
          </button>
        </div>
      </header>

      {overflowOpen ? (
        <div
          id={overflowId}
          role="region"
          aria-label="통합 3D 보조 도구"
          data-testid="unified-3d-overflow-drawer"
          className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-card px-3 py-2 text-xs text-fg-2"
        >
          <span className="truncate font-mono text-xs tabular-nums text-fg-3">
            {currentHref}
            {deepLink.legacySurfaceId ? ` · 원본 경로 ${deepLink.legacySurfaceId}` : ""}
          </span>
          {overflowActions ? <div className="flex flex-wrap items-center gap-1.5">{overflowActions}</div> : null}
        </div>
      ) : null}

      <div
        id={stagePanelId}
        role="tabpanel"
        aria-labelledby={`unified-3d-tab-${currentStage}`}
        className="flex min-h-0 flex-1 flex-col lg:flex-row"
      >
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-canvas">
          {viewport}
          {bakedMessage || statusSummaryKo ? (
            <p
              role="status"
              aria-live="polite"
              data-testid="unified-3d-stage-status"
              className="border-t border-line bg-panel px-3 py-1.5 text-xs text-fg-2"
            >
              {bakedMessage ?? statusSummaryKo}
            </p>
          ) : null}
        </div>
        {sideInspector ? (
          <aside
            aria-label={`${activeSpec.shortLabelKo} 세부 설정`}
            className="w-full shrink-0 border-t border-line bg-panel lg:w-80 lg:border-l lg:border-t-0"
          >
            {sideInspector}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
