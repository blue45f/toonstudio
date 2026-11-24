/**
 * Wave 38B — 캔버스 오비탈 휠 · 일상어 명령 팔레트(⌘K) · 플로팅 미니맵 ·
 * 태블릿 듀얼 휠 / 컨텍스트 매직 바 · 모바일 엄지 도크 / 엣지 스크럽 / 2.5× 루페 통합 스튜디오 패널.
 *
 * - Props 없이 단독 렌더 가능(모든 props optional).
 * - Calm Atelier 시맨틱 토큰 전용(원시 hex/rgb/hsl 0건 · Web Storage 0건 · 번역투 0건).
 */

import {
  Box,
  Command,
  Lasso,
  MessageSquare,
  Monitor,
  PenTool,
  Search,
  Smartphone,
  Tablet,
  type LucideIcon,
} from "lucide-react";
import { useId, useMemo, useRef, useState, type ReactElement } from "react";

import {
  createInitialMinimapInspectionState,
  createInitialUndoFilmstrip,
  recordCommandUsage,
  searchCanvasCommands,
  stepFilmstripUndo,
  toggleMinimapInspectionMode,
  type CanvasCommandItem,
  type CommandUsageRecord,
} from "./command-palette-minimap";
import {
  createInitialTabletDualWheelState,
  resolveContextMagicBar,
  type ErgonomicDeviceMode,
  type MagicBarActionId,
  type MagicBarToolContext,
  type MobileThumbActionId,
  type OrbitalSectorDefinition,
  type OrbitalSectorId,
} from "./orbital-wheel-engine";
import { StudioMinimapFilmstripDock } from "./StudioMinimapFilmstripDock";
import { StudioOrbitalWheelStage } from "./StudioOrbitalWheelStage";

export interface StudioCanvasOrbitalUxPanelProps {
  readonly className?: string;
  readonly initialDeviceMode?: ErgonomicDeviceMode;
  readonly initialToolContext?: MagicBarToolContext;
  readonly onSectorSelected?: (sector: OrbitalSectorDefinition) => void;
  readonly onCommandExecuted?: (command: CanvasCommandItem) => void;
}

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BTN_SEG = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none break-keep ${FOCUS_RING}`;
const BTN_ACTION = `inline-flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 py-2 text-left text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised break-keep ${FOCUS_RING}`;
const BTN_ACTION_ACTIVE = `inline-flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-left text-xs font-semibold text-accent transition-colors motion-reduce:transition-none break-keep ${FOCUS_RING}`;

const DEVICE_MODES: readonly {
  readonly id: ErgonomicDeviceMode;
  readonly labelKo: string;
  readonly detailKo: string;
  readonly icon: LucideIcon;
}[] = [
  { id: "desktop", labelKo: "데스크톱", detailKo: "8분할 오비탈 휠", icon: Monitor },
  { id: "tablet", labelKo: "태블릿", detailKo: "플로팅 듀얼 휠", icon: Tablet },
  { id: "mobile", labelKo: "모바일", detailKo: "엄지 도크 · 2.5× 루페", icon: Smartphone },
];

const MAGIC_TOOL_TABS: readonly {
  readonly id: MagicBarToolContext;
  readonly labelKo: string;
  readonly icon: LucideIcon;
}[] = [
  { id: "brush", labelKo: "브러시", icon: PenTool },
  { id: "lasso", labelKo: "올가미", icon: Lasso },
  { id: "3d-model", labelKo: "3D 모델", icon: Box },
  { id: "speech-balloon", labelKo: "말풍선", icon: MessageSquare },
];

const QUICK_PALETTE_QUERIES = [
  "선 떨림 잡기",
  "ㅅㄸ",
  "군중 채우기",
  "좌우 반전",
  "다크모드 검수",
] as const;

const BASE_CLOCK_MS = 1_764_000_000_000;

export function StudioCanvasOrbitalUxPanel({
  className = "",
  initialDeviceMode = "desktop",
  initialToolContext = "brush",
  onSectorSelected,
  onCommandExecuted,
}: StudioCanvasOrbitalUxPanelProps = {}): ReactElement {
  const paletteInputId = useId();

  const [deviceMode, setDeviceMode] = useState<ErgonomicDeviceMode>(initialDeviceMode);
  const [activeSectorId, setActiveSectorId] = useState<OrbitalSectorId>("brush");
  const [toolContext, setToolContext] = useState<MagicBarToolContext>(initialToolContext);
  const [activeMagicFlags, setActiveMagicFlags] = useState<ReadonlySet<MagicBarActionId>>(
    () => new Set<MagicBarActionId>(["stabilize-stroke", "sync-cut-light", "tail-aim-speaker"]),
  );
  const [tabletState, setTabletState] = useState(() => createInitialTabletDualWheelState("right"));
  const [minimapState, setMinimapState] = useState(() => createInitialMinimapInspectionState());
  const [filmstripState, setFilmstripState] = useState(() => createInitialUndoFilmstrip());
  const [paletteQuery, setPaletteQuery] = useState("");
  const [usageHistory, setUsageHistory] = useState<readonly CommandUsageRecord[]>([]);
  const [statusMessage, setStatusMessage] = useState(
    "오비탈 휠 섹터를 고르거나 일상어·초성으로 명령을 바로 찾아 실행해 보세요.",
  );
  const clockStepRef = useRef(1);

  const magicBar = useMemo(
    () => resolveContextMagicBar(toolContext, activeMagicFlags),
    [toolContext, activeMagicFlags],
  );

  const rankedCommands = useMemo(
    () =>
      searchCanvasCommands(paletteQuery, {
        recentUsage: usageHistory,
        nowMs: BASE_CLOCK_MS + usageHistory.length * 60_000,
        limit: 6,
      }),
    [paletteQuery, usageHistory],
  );

  const handleSelectSector = (sector: OrbitalSectorDefinition) => {
    setActiveSectorId(sector.id);
    if (sector.id === "flip-horizontal") {
      setMinimapState((prev) => ({ ...prev, flippedHorizontal: !prev.flippedHorizontal }));
      setStatusMessage("캔버스를 좌우 반전했어요. 인체와 얼굴 균형을 바로 확인해 보세요.");
    } else if (sector.id === "undo") {
      setFilmstripState((prev) => {
        const next = stepFilmstripUndo(prev);
        setStatusMessage(next.lastStatusKo);
        return next;
      });
    } else {
      setStatusMessage(`오비탈 휠 선택: ${sector.labelKo} (${sector.shortcut}) — ${sector.hintKo}`);
    }
    if (sector.id === "brush") setToolContext("brush");
    onSectorSelected?.(sector);
  };

  const handleMagicActionClick = (actionId: MagicBarActionId, labelKo: string, toggleable: boolean) => {
    if (!toggleable) {
      setStatusMessage(`${labelKo} 바로 적용했어요.`);
      return;
    }
    setActiveMagicFlags((prev) => {
      const next = new Set(prev);
      const turningOn = !next.has(actionId);
      if (turningOn) next.add(actionId);
      else next.delete(actionId);
      setStatusMessage(`${labelKo} ${turningOn ? "켜짐" : "꺼짐"}`);
      return next;
    });
  };

  const handleExecuteCommand = (command: CanvasCommandItem) => {
    const step = clockStepRef.current;
    clockStepRef.current += 1;
    setUsageHistory((prev) => recordCommandUsage(prev, command.id, BASE_CLOCK_MS + step * 60_000));

    const inspectionMode = command.relatedInspectionMode;
    if (inspectionMode) {
      setMinimapState((prev) => toggleMinimapInspectionMode(prev, inspectionMode));
    } else if (command.id === "flip-horizontal") {
      setMinimapState((prev) => ({ ...prev, flippedHorizontal: !prev.flippedHorizontal }));
    } else if (command.id === "fit-canvas-view") {
      setMinimapState((prev) => ({ ...prev, panX: 0, panY: 0, zoomPct: 100 }));
    } else if (command.id === "visual-undo-filmstrip") {
      setFilmstripState((prev) => stepFilmstripUndo(prev));
    }

    if (
      command.relatedToolId === "brush" ||
      command.relatedToolId === "lasso" ||
      command.relatedToolId === "3d-model" ||
      command.relatedToolId === "speech-balloon"
    ) {
      setToolContext(command.relatedToolId);
    }

    setStatusMessage(`명령 실행: ${command.titleKo} (${command.shortcut})`);
    onCommandExecuted?.(command);
  };

  const handleMobileAction = (actionId: MobileThumbActionId, labelKo: string) => {
    if (actionId === "undo") {
      setFilmstripState((prev) => {
        const next = stepFilmstripUndo(prev);
        setStatusMessage(`엄지 도크 되돌리기: ${next.lastStatusKo}`);
        return next;
      });
      return;
    }
    if (actionId === "lasso") setToolContext("lasso");
    else if (actionId === "brush") setToolContext("brush");
    setStatusMessage(`모바일 엄지 도크 선택: ${labelKo}`);
  };

  return (
    <section
      data-testid="canvas-orbital-ux-panel"
      aria-label="캔버스 오비탈 휠 및 적응형 제스처 워크벤치"
      className={`rounded-2xl border border-line bg-card p-4 text-fg sm:p-5 ${className}`}
    >
      {/* 상단 헤더 + 데스크톱/태블릿/모바일 3종 인체공학 모드 전환 */}
      <header className="flex flex-col gap-3 border-b border-line/60 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold tracking-tight text-fg break-keep">
            캔버스 오비탈 휠 · 일상어 명령 · 인체공학 작업대
          </h2>
          <p className="text-xs text-fg-2 break-keep">
            시선 이동 없이 커서 주변 8방향 휠, 태블릿 양손 휠, 모바일 엄지 도크와 ⌘K 일상어 명령을 즉시 전환해요.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="기기별 인체공학 모드"
          className="grid grid-cols-3 gap-1.5 rounded-xl bg-panel p-1"
        >
          {DEVICE_MODES.map((mode) => {
            const Icon = mode.icon;
            const selected = deviceMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                role="tab"
                data-testid={`device-mode-${mode.id}`}
                aria-selected={selected}
                onClick={() => {
                  setDeviceMode(mode.id);
                  setStatusMessage(`${mode.labelKo} 모드(${mode.detailKo})로 전환했어요.`);
                }}
                className={`${BTN_SEG} ${
                  selected
                    ? "border-accent bg-accent text-on-accent"
                    : "border-transparent bg-transparent text-fg-2 hover:bg-raised hover:text-fg"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{mode.labelKo}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* 실시간 상태 피드백 줄 */}
      <div
        role="status"
        aria-live="polite"
        data-testid="orbital-status-banner"
        className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-panel px-3 py-2 text-xs text-fg-2"
      >
        <span className="break-keep">{statusMessage}</span>
        <span className="font-semibold text-accent tabular-nums">
          최근 실행 {usageHistory.length}건
        </span>
      </div>

      {/* 본문 2단 구성 */}
      <div className="mt-4 grid grid-cols-1 gap-5 xl:grid-cols-[1.12fr_0.88fr]">
        {/* 좌측 메인 스테이지 + 컨텍스트 매직 바 */}
        <div className="space-y-5">
          <StudioOrbitalWheelStage
            deviceMode={deviceMode}
            activeSectorId={activeSectorId}
            flippedHorizontal={minimapState.flippedHorizontal}
            tabletState={tabletState}
            onSelectSector={handleSelectSector}
            onTabletStateChange={setTabletState}
            onMobileAction={handleMobileAction}
          />

          <div className="space-y-3 border-t border-line/60 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <h3 className="text-sm font-semibold text-fg break-keep">컨텍스트 매직 바</h3>
                <p className="text-xs text-fg-3 break-keep">
                  현재 도구에 꼭 필요한 핵심 4개 액션만 바로 띄워요.
                </p>
              </div>
              <div role="group" aria-label="매직 바 기준 도구 선택" className="flex flex-wrap gap-1.5">
                {MAGIC_TOOL_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const active = toolContext === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      data-testid={`magic-tool-${tab.id}`}
                      aria-pressed={active}
                      onClick={() => {
                        setToolContext(tab.id);
                        setStatusMessage(`${tab.labelKo} 문맥 매직 바로 전환했어요.`);
                      }}
                      className={`${BTN_SEG} ${
                        active
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{tab.labelKo}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div data-testid="context-magic-bar-actions" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {magicBar.actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  data-testid={`magic-action-${action.id}`}
                  aria-pressed={action.toggleable ? action.active : undefined}
                  onClick={() =>
                    handleMagicActionClick(action.id, action.labelKo, action.toggleable)
                  }
                  className={action.active ? BTN_ACTION_ACTIVE : BTN_ACTION}
                >
                  <span className="min-w-0">
                    <span className="block font-semibold break-keep">{action.labelKo}</span>
                    <span className="mt-0.5 block text-xs font-normal text-fg-3 break-keep">
                      {action.summaryKo}
                    </span>
                  </span>
                  <span className="shrink-0 rounded border border-line bg-panel px-1.5 py-0.5 text-xs text-fg-2 tabular-nums">
                    {action.shortcut}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 우측: 일상어·초성 명령 팔레트(⌘K) + 미니맵 검수 + 비주얼 언두 필름스트립 */}
        <div className="space-y-5 xl:border-l xl:border-line/60 xl:pl-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Command className="h-4 w-4 text-accent" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-fg break-keep">
                  일상어 · 초성 명령 팔레트
                </h3>
              </div>
              <span className="rounded-md border border-line bg-panel px-2 py-0.5 text-xs font-semibold text-fg-2 tabular-nums">
                ⌘K
              </span>
            </div>

            <div className="relative">
              <label htmlFor={paletteInputId} className="sr-only">
                일상어, 초성 또는 영문 명령 검색
              </label>
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-3"
                aria-hidden="true"
              />
              <input
                id={paletteInputId}
                data-testid="command-palette-input"
                type="search"
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                placeholder="예: 선 떨림 잡기, ㅅㄸ, 군중 채우기, flip"
                className={`min-h-11 w-full rounded-lg border border-line bg-panel py-2 pr-3 pl-9 text-xs text-fg placeholder:text-fg-3 transition-colors motion-reduce:transition-none hover:border-line-strong ${FOCUS_RING}`}
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {QUICK_PALETTE_QUERIES.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  data-testid={`palette-preset-${preset}`}
                  onClick={() => setPaletteQuery(preset)}
                  className={`min-h-11 cursor-pointer rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-medium text-fg-2 transition-colors motion-reduce:transition-none hover:border-line-strong hover:text-fg break-keep ${FOCUS_RING}`}
                >
                  {preset}
                </button>
              ))}
            </div>

            <ul
              data-testid="command-palette-results"
              aria-label="검색된 명령 목록"
              className="space-y-1.5"
            >
              {rankedCommands.length === 0 ? (
                <li className="rounded-lg bg-panel px-3 py-3 text-xs text-fg-3 break-keep">
                  일치하는 명령이 없어요. &quot;ㅅㄸ&quot;처럼 초성이나 &quot;좌우 반전&quot; 같은 일상어로 입력해 보세요.
                </li>
              ) : (
                rankedCommands.map((ranked) => (
                  <li key={ranked.command.id}>
                    <button
                      type="button"
                      data-testid={`palette-result-${ranked.command.id}`}
                      onClick={() => handleExecuteCommand(ranked.command)}
                      className={`${BTN_ACTION} w-full`}
                    >
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-fg break-keep">
                            {ranked.command.titleKo}
                          </span>
                          <span className="rounded bg-raised px-1.5 py-0.5 text-xs font-medium text-cool">
                            {ranked.matchBadgeKo}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs font-normal text-fg-3 break-keep">
                          {ranked.command.subtitleKo}
                        </span>
                      </span>
                      <span className="shrink-0 rounded border border-line bg-panel px-2 py-0.5 text-xs text-fg-2 tabular-nums">
                        {ranked.command.shortcut}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          <StudioMinimapFilmstripDock
            minimapState={minimapState}
            filmstripState={filmstripState}
            onMinimapStateChange={setMinimapState}
            onFilmstripStateChange={setFilmstripState}
          />
        </div>
      </div>
    </section>
  );
}
