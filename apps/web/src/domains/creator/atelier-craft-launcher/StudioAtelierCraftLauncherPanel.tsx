/**
 * Wave 43D — 아틀리에 프로 도구 퀵 런처 (Atelier Craft Quick-Jump Showcase) 패널.
 *
 * - 정적 설명 목록과 사전 제작 참고 이미지를 8대 관련 경로로 정리한다.
 *   장치 지원·원고 적용·저장·출력의 실행 결과를 검증하지 않는다.
 * - Calm Atelier 시맨틱 토큰 전용(원시 색상 0건 · 전역 전환 미사용 · Web Storage 0건 · 빈 객체 기본 props 미사용).
 * - 5~9개 핵심 액션 예산: 상단 단계 필터 탭(전체·콘티·작화·3D·협업·출고·핀) + 검색바 + 2/4열 카드 그리드 + 라우트 프리뷰.
 */

import {
  ArrowUpRight,
  Compass,
  Pin,
  PinOff,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
} from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  ATELIER_TOTAL_BAKED_WEBP_COUNT,
  ATELIER_TOTAL_EXPERT_ENGINE_COUNT,
  CRAFT_STATION_CATALOG,
  CRAFT_WORKFLOW_STAGES,
  computeCraftCatalogCounts,
  createInitialPinState,
  filterCraftStations,
  getCraftStageById,
  getCraftStationById,
  isCraftStationPinned,
  orderStationsWithPins,
  recommendNextCraftStations,
  searchCraftStations,
  togglePinnedCraftStation,
  type CraftLauncherPinState,
  type CraftStageFilterId,
  type CraftStationId,
  type CraftStationSpec,
  type CraftWorkflowStageId,
} from "./atelier-craft-launcher-engine";
import { useLauncherNotification } from "./use-launcher-notification";

export interface StudioAtelierCraftLauncherPanelProps {
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialStage?: CraftStageFilterId;
  readonly initialCurrentWorkflowStage?: CraftWorkflowStageId;
  readonly initialSelectedStationId?: CraftStationId;
  readonly initialPinnedIds?: readonly CraftStationId[];
  readonly maxPinned?: number;
  readonly onSelectStation?: (station: CraftStationSpec) => void | Promise<void>;
  readonly onLaunchStation?: (station: CraftStationSpec) => void | Promise<void>;
  readonly onPinnedChange?: (pinState: CraftLauncherPinState) => void | Promise<void>;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const TAB_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold [word-break:keep-all] transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const ACTIVE_TAB = "border-accent bg-accent-soft text-accent";
const IDLE_TAB = "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";
const PRIMARY_CTA = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-4 py-2 text-xs font-semibold text-on-accent [word-break:keep-all] transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING}`;
const SECONDARY_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg [word-break:keep-all] transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised ${FOCUS_RING}`;
const THUMB_FINISH = "outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10";

function stageBadgeTone(stageId: CraftWorkflowStageId): string {
  switch (stageId) {
    case "conti":
      return "border-line bg-info-soft text-cool";
    case "drawing":
      return "border-accent/40 bg-accent-soft text-accent";
    case "3d":
      return "border-line bg-warning-soft text-warn";
    case "collab":
      return "border-good/40 bg-good-soft text-good";
    case "delivery":
      return "border-line bg-raised text-fg";
  }
}

interface StationCardProps {
  readonly station: CraftStationSpec;
  readonly isSelected: boolean;
  readonly isPinned: boolean;
  readonly isEn: boolean;
  readonly pending: boolean;
  readonly onSelect: (station: CraftStationSpec) => void | Promise<void>;
  readonly onTogglePin: (stationId: CraftStationId) => void;
}

function CraftStationCard(cardProps: StationCardProps): ReactElement {
  const { station, isSelected, isPinned, isEn, pending, onSelect, onTogglePin } = cardProps;
  const title = isEn ? station.titleEn : station.titleKo;
  const stageLabel = isEn ? station.stageLabelEn : station.stageLabelKo;
  const highlights = isEn ? station.highlightsEn : station.highlightsKo;
  const thumbAlt = isEn ? station.thumbnailAltEn : station.thumbnailAltKo;

  return (
    <article
      data-testid={`craft-station-card-${station.id}`}
      data-selected={isSelected ? "true" : "false"}
      className={`flex flex-col overflow-hidden rounded-xl border transition-colors motion-reduce:transition-none ${
        isSelected
          ? "border-accent bg-panel ring-1 ring-accent"
          : "border-line bg-card hover:border-line-strong"
      }`}
    >
      <button
        type="button"
        data-testid={`craft-station-select-${station.id}`}
        disabled={pending}
        aria-pressed={isSelected}
        onClick={() => onSelect(station)}
        className={`flex flex-1 cursor-pointer flex-col text-left ${FOCUS_RING}`}
      >
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-raised">
          <img
            src={station.thumbnailSrc}
            alt={thumbAlt}
            loading="lazy"
            decoding="async"
            data-testid={`craft-station-thumb-${station.id}`}
            className={`h-full w-full object-cover ${THUMB_FINISH}`}
          />
        </div>

        <div className="flex flex-1 flex-col gap-2 p-3">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold [word-break:keep-all] ${stageBadgeTone(station.stageId)}`}
            >
              {stageLabel}
            </span>
            <div className="flex items-center gap-1.5 text-[11px] text-fg-3 tabular-nums">
              <kbd className="rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[10px] font-semibold text-fg-2">
                {station.shortcutHint}
              </kbd>
            </div>
          </div>

          <h3 className="text-sm font-bold leading-snug text-fg [word-break:keep-all]">
            {title}
          </h3>

          <ul className="space-y-1 text-[11px] leading-relaxed text-fg-2 [word-break:keep-all]">
            {highlights.map((feature) => (
              <li key={feature} className="flex items-start gap-1.5">
                <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-fg-3" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </button>

      <div className="flex items-center justify-between gap-2 border-t border-line bg-panel px-3 py-1.5">
        <code
          data-testid={`craft-station-href-${station.id}`}
          className="truncate font-mono text-[11px] text-fg-3"
        >
          {station.href}
        </code>
        <button
          type="button"
          data-testid={`craft-station-pin-${station.id}`}
          disabled={pending}
          aria-pressed={isPinned}
          aria-label={
            isEn
              ? `${isPinned ? "Unpin" : "Pin"} ${title}`
              : `${title} ${isPinned ? "즐겨찾기 핀 해제" : "즐겨찾기 핀 고정"}`
          }
          onClick={() => onTogglePin(station.id)}
          className={`inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-lg border px-2.5 text-[11px] font-semibold [word-break:keep-all] transition-colors motion-reduce:transition-none ${
            isPinned
              ? "border-accent bg-accent-soft text-accent"
              : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg"
          } ${FOCUS_RING}`}
        >
          {isPinned ? <PinOff size={13} aria-hidden="true" /> : <Pin size={13} aria-hidden="true" />}
          <span>{isEn ? (isPinned ? "Pinned" : "Pin") : isPinned ? "고정됨" : "핀"}</span>
        </button>
      </div>
    </article>
  );
}

/** 웨이브 36~42 아틀리에 프로 도구 8대 스테이션 퀵 런처 패널. */
export function StudioAtelierCraftLauncherPanel(
  props: StudioAtelierCraftLauncherPanelProps,
): ReactElement {
  const {
    locale,
    className,
    initialStage = "all",
    initialCurrentWorkflowStage = "conti",
    initialSelectedStationId = "drawing-physical-ink",
    initialPinnedIds,
    maxPinned,
    onSelectStation,
    onLaunchStation,
    onPinnedChange,
  } = props;

  const notification = useLauncherNotification();
  const { notify, isPending } = notification;
  const recipients = useRef({ onSelectStation, onLaunchStation, onPinnedChange });
  useEffect(() => { recipients.current = { onSelectStation, onLaunchStation, onPinnedChange }; }, [onSelectStation, onLaunchStation, onPinnedChange]);
  const uid = useId();
  const sectionRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const storeLang = useI18n((state) => state.lang);
  const isEn = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "en";
  const pick = useCallback((ko: string, en: string): string => (isEn ? en : ko), [isEn]);

  const [stageFilter, setStageFilter] = useState<CraftStageFilterId>(initialStage);
  const [query, setQuery] = useState<string>("");
  const [selectedStationId, setSelectedStationId] = useState<CraftStationId>(
    initialSelectedStationId,
  );
  const [workflowStage, setWorkflowStage] = useState<CraftWorkflowStageId>(
    initialCurrentWorkflowStage,
  );
  const [pinState, setPinState] = useState<CraftLauncherPinState>(() =>
    createInitialPinState(initialPinnedIds, maxPinned),
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const catalogCounts = useMemo(
    () => computeCraftCatalogCounts(CRAFT_STATION_CATALOG, pinState.pinnedIds),
    [pinState.pinnedIds],
  );

  const visibleStations = useMemo(() => {
    const filtered = filterCraftStations(CRAFT_STATION_CATALOG, stageFilter, {
      pinnedIds: pinState.pinnedIds,
    });
    const searched = searchCraftStations(filtered, query, {
      pinnedIds: pinState.pinnedIds,
    });
    return query.trim().length > 0 ? searched : orderStationsWithPins(searched, pinState.pinnedIds);
  }, [stageFilter, query, pinState.pinnedIds]);

  const selectedStation = useMemo(
    () => getCraftStationById(selectedStationId),
    [selectedStationId],
  );

  const currentStageSpec = useMemo(() => getCraftStageById(workflowStage), [workflowStage]);

  const recommendations = useMemo(
    () =>
      recommendNextCraftStations(workflowStage, {
        activeStationId: selectedStationId,
        pinnedIds: pinState.pinnedIds,
        limit: 3,
      }),
    [workflowStage, selectedStationId, pinState.pinnedIds],
  );

  const handleStageSelect = (nextStage: CraftStageFilterId): void => {
    if (isPending()) return;
    setStageFilter(nextStage);
    if (nextStage !== "all" && nextStage !== "pinned") {
      setWorkflowStage(nextStage);
    }
    setStatusMessage(null);
  };

  const handleSelectStation = useCallback(
    (station: CraftStationSpec): void => {
      if (isPending()) return;
      setSelectedStationId(station.id);
      setWorkflowStage(station.stageId);
      setStatusMessage(
        pick(
          `${station.titleKo} 스테이션 선택됨 · 경로 ${station.href}`,
          `Selected ${station.titleEn} · Route ${station.href}`,
        ),
      );
      notify(() => {
        const recipient = recipients.current.onSelectStation;
        return recipient ? () => recipient(station) : undefined;
      });
    },
    [isPending, notify, pick],
  );

  const handleTogglePin = (stationId: CraftStationId): void => {
    if (isPending()) return;
    const nextPinState = togglePinnedCraftStation(pinState, stationId);
    setPinState(nextPinState);

    const station = getCraftStationById(stationId);
    if (nextPinState.lastAction === "limit-reached") {
      setStatusMessage(
        pick(
          `즐겨찾기 핀은 최대 ${nextPinState.maxPinned}개까지 고정할 수 있습니다.`,
          `You can pin up to ${nextPinState.maxPinned} craft stations.`,
        ),
      );
      return;
    }
    notify(() => {
      const recipient = recipients.current.onPinnedChange;
      return recipient ? () => recipient(nextPinState) : undefined;
    });
    setStatusMessage(
      nextPinState.lastAction === "pinned"
        ? pick(`이 화면의 핀에 추가: ${station.titleKo}`, `Pinned in this view: ${station.titleEn}`)
        : pick(`이 화면의 핀에서 제거: ${station.titleKo}`, `Unpinned in this view: ${station.titleEn}`),
    );
  };

  const handleResetFilters = (): void => {
    if (isPending()) return;
    setStageFilter("all");
    setQuery("");
    setStatusMessage(pick("전체 8대 아틀리에 스테이션을 표시합니다.", "Showing all 8 craft stations."));
  };

  const handleLaunchClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (isPending()) { event.preventDefault(); return; }
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (recipients.current.onLaunchStation) {
      event.preventDefault();
      const station = selectedStation;
      notify(() => {
        const recipient = recipients.current.onLaunchStation;
        return recipient ? () => recipient(station) : undefined;
      });
    }
  };

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;

      if (event.key === "/" && !isTypingTarget && !event.altKey && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (event.altKey && !event.metaKey && !event.ctrlKey) {
        const matched = CRAFT_STATION_CATALOG.find((station) => station.shortcutKey === event.key);
        if (matched) {
          event.preventDefault();
          handleSelectStation(matched);
        }
      }
    };
    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
    };
  }, [handleSelectStation]);

  const filterTabs: readonly {
    readonly id: CraftStageFilterId;
    readonly label: string;
    readonly count: number;
  }[] = [
    { id: "all", label: pick("전체", "All"), count: catalogCounts.all },
    ...CRAFT_WORKFLOW_STAGES.map((stage) => ({
      id: stage.id as CraftStageFilterId,
      label: isEn ? stage.labelEn : stage.labelKo,
      count: catalogCounts[stage.id],
    })),
    { id: "pinned", label: pick("핀", "Pinned"), count: catalogCounts.pinned },
  ];

  const searchInputId = `${uid}-craft-search`;
  const headingId = `${uid}-craft-launcher-heading`;

  return (
    <section
      ref={sectionRef}
      aria-labelledby={headingId}
      data-testid="atelier-craft-launcher-panel"
      aria-busy={notification.pending}
      className={`space-y-4 rounded-2xl border border-line bg-canvas p-4 text-fg ${className ?? ""}`}
    >
      {/* 헤더 */}
      <header className="flex flex-col gap-2 border-b border-line pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 id={headingId} className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("아틀리에 프로 도구 퀵 런처", "Atelier Craft Quick-Jump Launcher")}
          </h2>
          <p data-testid="craft-launcher-scope" className="text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "정적 소개 목록과 사전 제작 참고 그림입니다. 계산 예제·가정값을 포함하며 실제 GPU·OPFS 복구·원고 저장·출력의 완료를 뜻하지 않습니다. 핀은 이 화면의 메모리에만 남습니다. 관련 페이지의 경로를 확인한 뒤 이동하세요.",
              "Static catalog descriptions and prepared reference artwork include calculation examples and assumptions. They do not confirm GPU execution, OPFS repair, manuscript saves or export. Pins remain in this view’s memory. Inspect the related page before navigating.",
            )}
          </p>
        </div>

        <div
          data-testid="craft-launcher-summary-counts"
          className="flex flex-wrap items-center gap-2 text-xs text-fg-2 tabular-nums"
        >
          <span className="rounded-lg border border-line bg-panel px-2.5 py-1 font-semibold text-fg">
            {pick(`${CRAFT_STATION_CATALOG.length}대 스테이션`, `${CRAFT_STATION_CATALOG.length} stations`)}
          </span>
          <span className="rounded-lg border border-line bg-panel px-2.5 py-1">
            {pick(
              `목록 기준 설명 ${ATELIER_TOTAL_EXPERT_ENGINE_COUNT}항목`,
              `${ATELIER_TOTAL_EXPERT_ENGINE_COUNT} catalog descriptions`,
            )}
          </span>
          <span className="rounded-lg border border-line bg-panel px-2.5 py-1">
            {pick(
              `참고 그림 목록 ${ATELIER_TOTAL_BAKED_WEBP_COUNT}종`,
              `${ATELIER_TOTAL_BAKED_WEBP_COUNT} listed reference images`,
            )}
          </span>
        </div>
      </header>

      {notification.status !== "idle" && <div role={notification.status === "failed" ? "alert" : "status"} data-testid="craft-launcher-notification" className="text-xs text-fg-2">
        {notification.pending ? pick("수신자 알림 처리 중", "Recipient notification pending") : notification.status === "failed" ? pick(`수신자 알림 실패: ${notification.error}`, `Recipient notification failed: ${notification.error}`) : pick("수신자 응답을 확인했습니다. 원고 저장·경로 이동 완료는 각 대상 화면에서 확인하세요.", "Recipient responded. Confirm manuscript saves and navigation at their destination.")}
        {notification.status === "failed" && <button type="button" className={SECONDARY_BTN} onClick={notification.retry}>{pick("알림 다시 시도", "Retry notification")}</button>}
      </div>}

      {/* 핵심 액션 바 (7개 단계/핀 필터 탭 + 1개 검색바 = 8개 액션 예산) */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="tablist"
          aria-label={pick("창작 작업 단계 필터", "Workflow stage filter")}
          className="flex flex-wrap items-center gap-1.5"
        >
          {filterTabs.map((tab) => {
            const active = stageFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                data-testid={`craft-stage-tab-${tab.id}`}
                disabled={notification.pending}
                aria-selected={active}
                onClick={() => handleStageSelect(tab.id)}
                className={`${TAB_BTN} ${active ? ACTIVE_TAB : IDLE_TAB}`}
              >
                <span>{tab.label}</span>
                <span className="rounded bg-canvas px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-fg-3">
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full lg:max-w-sm">
          <label htmlFor={searchInputId} className="sr-only">
            {pick("아틀리에 도구 및 초성 검색", "Search atelier tools, routes, or Korean initials")}
          </label>
          <Search
            size={15}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3"
          />
          <input
            ref={searchInputRef}
            id={searchInputId}
            data-testid="craft-launcher-search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={pick(
              "도구·라우트·초성 검색 (예: 드로잉, ㄷㄹㅇ, P3)",
              "Search tool, route, or shortcut (e.g. bg3d, P3, Alt+5)",
            )}
            className={`min-h-11 w-full rounded-lg border border-line bg-card py-2 pr-11 pl-9 text-xs text-fg placeholder:text-fg-3 ${FOCUS_RING}`}
          />
          {query.length > 0 ? (
            <button
              type="button"
              data-testid="craft-launcher-search-clear"
              aria-label={pick("검색어 지우기", "Clear search query")}
              onClick={() => setQuery("")}
              className={`absolute top-1/2 right-1 inline-flex min-h-11 min-w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-fg-3 transition-colors motion-reduce:transition-none hover:text-fg ${FOCUS_RING}`}
            >
              <X size={14} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {/* 현재 작업 단계 기반 다음 추천 스트립 */}
      <div
        data-testid="craft-recommendation-strip"
        className="rounded-xl border border-line bg-panel p-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Compass size={14} aria-hidden="true" className="text-accent" />
            <span>
              {pick(
                `현재 단계(${currentStageSpec.labelKo}) 기준 다음 추천`,
                `Recommended next from ${currentStageSpec.labelEn}`,
              )}
            </span>
          </div>
          <span className="text-[11px] text-fg-3 [word-break:keep-all]">
            {isEn ? currentStageSpec.summaryEn : currentStageSpec.summaryKo}
          </span>
        </div>

        <div className="mt-2.5 grid grid-cols-1 gap-2 md:grid-cols-3">
          {recommendations.map((item) => (
            <button
              key={item.station.id}
              type="button"
              data-testid={`craft-recommend-btn-${item.station.id}`}
              disabled={notification.pending}
              onClick={() => handleSelectStation(item.station)}
              className={`flex min-h-11 cursor-pointer flex-col items-start justify-center gap-0.5 rounded-lg border border-line bg-card px-3 py-2 text-left transition-colors motion-reduce:transition-none hover:border-accent hover:bg-raised ${FOCUS_RING}`}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-xs font-bold text-fg [word-break:keep-all]">
                  {isEn ? item.station.titleEn : item.station.titleKo}
                </span>
                <span className="font-mono text-[10px] text-fg-3 tabular-nums">
                  {item.station.shortcutHint}
                </span>
              </div>
              <span className="text-[11px] leading-snug text-fg-2 [word-break:keep-all]">
                {isEn ? item.reasonEn : item.reasonKo}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 상태 알림 배너 */}
      {statusMessage ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="craft-launcher-status"
          className="rounded-lg border border-line bg-panel px-3 py-2 text-xs text-fg-2 [word-break:keep-all]"
        >
          {statusMessage}
        </div>
      ) : null}

      {/* 4열 / 2열 반응형 아틀리에 카드 그리드 */}
      {visibleStations.length > 0 ? (
        <div
          data-testid="craft-station-grid"
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          {visibleStations.map((station) => (
            <CraftStationCard
              key={station.id}
              station={station}
              isSelected={selectedStationId === station.id}
              isPinned={isCraftStationPinned(pinState, station.id)}
              isEn={isEn}
              pending={notification.pending}
              onSelect={handleSelectStation}
              onTogglePin={handleTogglePin}
            />
          ))}
        </div>
      ) : (
        <div
          data-testid="craft-launcher-empty"
          className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-panel px-4 py-8 text-center"
        >
          <p className="text-sm font-semibold text-fg [word-break:keep-all]">
            {stageFilter === "pinned"
              ? pick("고정된 즐겨찾기 스테이션이 없습니다.", "No pinned stations yet.")
              : pick("조건에 맞는 아틀리에 스테이션이 없습니다.", "No matching craft stations found.")}
          </p>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "단계 필터를 전체로 돌리거나 검색어를 지워 8대 스테이션을 모두 확인하세요.",
              "Reset the stage filter or clear search to inspect all 8 craft stations.",
            )}
          </p>
          <button
            type="button"
            data-testid="craft-launcher-reset-btn"
            disabled={notification.pending}
            onClick={handleResetFilters}
            className={SECONDARY_BTN}
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>{pick("필터·검색 초기화", "Reset filters & search")}</span>
          </button>
        </div>
      )}

      {/* 선택 스테이션 라우트 프리뷰 및 1클릭 실행 바 */}
      <aside
        data-testid="craft-route-preview"
        aria-label={pick("선택 스테이션 경로 미리보기", "Selected station route preview")}
        className="rounded-xl border border-line-strong bg-panel p-4"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex shrink-0 items-center gap-2">
              <img
                src={selectedStation.thumbnailSrc}
                alt={isEn ? selectedStation.thumbnailAltEn : selectedStation.thumbnailAltKo}
                data-testid="craft-preview-primary-img"
                className={`h-16 w-24 rounded-lg object-cover ${THUMB_FINISH}`}
              />
              <img
                src={selectedStation.secondaryPreviewSrc}
                alt={isEn ? selectedStation.secondaryAltEn : selectedStation.secondaryAltKo}
                data-testid="craft-preview-secondary-img"
                className={`h-16 w-24 rounded-lg object-cover ${THUMB_FINISH}`}
              />
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  data-testid="craft-preview-title"
                  className="text-sm font-bold text-fg [word-break:keep-all]"
                >
                  {isEn ? selectedStation.titleEn : selectedStation.titleKo}
                </span>
                <code
                  data-testid="craft-preview-href"
                  className="rounded border border-line bg-card px-2 py-0.5 font-mono text-[11px] font-semibold text-accent"
                >
                  {selectedStation.href}
                </code>
                <span className="text-[11px] text-fg-3 tabular-nums">
                  {selectedStation.waveRange} ·{" "}
                  {pick(`${selectedStation.engineCount}종 엔진`, `${selectedStation.engineCount} engines`)}
                </span>
              </div>
              <p className="text-xs text-fg-2 [word-break:keep-all]">
                {isEn ? selectedStation.subtitleEn : selectedStation.subtitleKo}
                <span className="block text-fg-3">{isEn ? selectedStation.routeMeaningEn : selectedStation.routeMeaningKo}</span>
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="rounded-lg border border-line bg-card px-2.5 py-2 text-[11px] text-fg-2 tabular-nums">
              <kbd className="font-mono font-semibold text-fg">{selectedStation.shortcutHint}</kbd>
            </span>
            <a
              href={selectedStation.href}
              data-testid="craft-preview-launch-link"
              aria-disabled={notification.pending}
              onClick={handleLaunchClick}
              className={PRIMARY_CTA}
            >
              <span>
                {pick(
                  `관련 경로 열기: ${selectedStation.titleKo}`,
                  `Open related page: ${selectedStation.titleEn}`,
                )}
              </span>
              <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </div>
        </div>
      </aside>
    </section>
  );
}
