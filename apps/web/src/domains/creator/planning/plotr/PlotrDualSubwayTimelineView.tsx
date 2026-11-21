/**
 * 이중 지하철 타임라인 · 세계 지도 핀 · JSON Canvas 양방향 뷰.
 *
 * `studio-dual-subway-timeline.ts` 엔진을 실제 화면에 마운트해
 * 작중 시간순 ↔ 연재 공개순 전환, 인과·회상·스포일러 자동 진단,
 * 시대별 세계 지도 핀 배치, JSON Canvas 1.0 내보내기/복원을 제공한다.
 */
import { AlertTriangle, Download, GitMerge, MapPin, Plus, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import {
  analyzeNarrativeCausality,
  exportToJsonCanvas,
  filterWorldMapPinsByEra,
  importFromJsonCanvas,
  layoutDualSubwayTimeline,
  upsertWorldMapPin,
  type DualAxisTimelineEvent,
  type DualSubwayTimelineDocument,
  type JsonCanvasDocumentV1,
  type TimelineAxisMode,
  type WorldMapPin,
} from "../studio-dual-subway-timeline";
import "./plotr-story-atelier.css";

export interface PlotrDualSubwayTimelineViewProps {
  readonly document: DualSubwayTimelineDocument;
  readonly onChange: (next: DualSubwayTimelineDocument) => void;
  readonly onSelectEpisodeOrder?: (episodeNumber: number) => void;
}

const BTN_BASE =
  "plotr-btn-tactile inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold [word-break:keep-all] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function PlotrDualSubwayTimelineView({
  document,
  onChange,
  onSelectEpisodeOrder,
}: PlotrDualSubwayTimelineViewProps) {
  const [axisMode, setAxisMode] = useState<TimelineAxisMode>("narrative");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    document.events[0]?.id ?? null,
  );
  const [eraCursor, setEraCursor] = useState<number>(() => {
    const orders = document.events.map((e) => e.chronologicalOrder);
    return orders.length > 0 ? Math.max(...orders) : 10;
  });
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newEra, setNewEra] = useState("시즌 1");
  const [newChrono, setNewChrono] = useState("15");
  const [newEpisode, setNewEpisode] = useState("2");
  const [pinLabel, setPinLabel] = useState("");
  const [canvasFeedback, setCanvasFeedback] = useState<string | null>(null);
  const [exportedJson, setExportedJson] = useState<string>("");

  const layout = useMemo(
    () => layoutDualSubwayTimeline(document, axisMode),
    [document, axisMode],
  );
  const causality = useMemo(() => analyzeNarrativeCausality(document), [document]);
  const visiblePins = useMemo(
    () => filterWorldMapPinsByEra(document.mapPins, eraCursor),
    [document.mapPins, eraCursor],
  );

  const selectedEvent =
    document.events.find((ev) => ev.id === selectedEventId) ??
    document.events[0] ??
    null;

  const minEra = useMemo(() => {
    const orders = document.events.map((e) => e.chronologicalOrder);
    return orders.length > 0 ? Math.min(0, ...orders) : 0;
  }, [document.events]);

  const maxEra = useMemo(() => {
    const orders = document.events.map((e) => e.chronologicalOrder);
    return orders.length > 0 ? Math.max(20, ...orders) : 20;
  }, [document.events]);

  const handleAddEvent = () => {
    const title = newTitle.trim();
    if (!title) return;
    const chrono = Number(newChrono) || 10;
    const ep = Math.max(1, Number(newEpisode) || 1);
    const defaultTracks =
      document.tracks.length > 0
        ? document.tracks.slice(0, 2).map((t) => t.id)
        : ["trk-main"];
    const ensuredTracks =
      document.tracks.length > 0
        ? document.tracks
        : [
            {
              id: "trk-main",
              label: "메인 스토리",
              kind: "plotline" as const,
              toneToken: "oklch(0.62 0.19 255)",
              canvasColorPreset: "5" as const,
            },
          ];
    const created: DualAxisTimelineEvent = {
      id: `ev-${Date.now()}-${document.events.length + 1}`,
      title,
      chronologicalOrder: chrono,
      eraLabel: newEra.trim() || "본편",
      calendarDateLabel: `${ep}화 구간`,
      narrativeEpisodeOrder: ep,
      narrativeSceneIndex: document.events.length + 1,
      participantTrackIds: defaultTracks,
    };
    onChange({
      ...document,
      tracks: ensuredTracks,
      events: [...document.events, created],
    });
    setSelectedEventId(created.id);
    setNewTitle("");
    setShowAddEvent(false);
  };

  const handleAddMapPin = () => {
    const label = pinLabel.trim();
    if (!label) return;
    const nextPin: WorldMapPin = {
      id: `pin-${Date.now()}-${document.mapPins.length + 1}`,
      mapId: document.mapPins[0]?.mapId ?? "world",
      label,
      u: 0.25 + ((document.mapPins.length * 0.19) % 0.55),
      v: 0.28 + ((document.mapPins.length * 0.23) % 0.48),
      category: "landmark",
      activeFromOrder: minEra,
      activeUntilOrder: null,
      linkedEventIds: selectedEvent ? [selectedEvent.id] : [],
    };
    onChange(upsertWorldMapPin(document, nextPin));
    setPinLabel("");
  };

  const handleExportCanvas = () => {
    const canvas = exportToJsonCanvas(document, axisMode);
    setExportedJson(JSON.stringify(canvas, null, 2));
    setCanvasFeedback(
      `JSON Canvas 1.0 변환 완료 (노드 ${canvas.nodes.length}개 · 연결선 ${canvas.edges.length}개)`,
    );
  };

  const handleImportRoundtrip = () => {
    if (!exportedJson.trim()) return;
    try {
      const parsed = JSON.parse(exportedJson) as JsonCanvasDocumentV1;
      const imported = importFromJsonCanvas(parsed, document.id);
      if (imported.timeline.events.length > 0) {
        onChange(imported.timeline);
        setCanvasFeedback(
          `JSON Canvas에서 사건 ${imported.timeline.events.length}건과 지도 핀 ${imported.timeline.mapPins.length}건을 복원했어요.`,
        );
      } else {
        setCanvasFeedback("복원할 사건 노드가 JSON에 들어 있지 않아요.");
      }
    } catch {
      setCanvasFeedback("JSON 형식을 읽지 못했어요. 내보낸 JSON을 그대로 넣어 주세요.");
    }
  };

  return (
    <section
      aria-label="이중 지하철 타임라인과 세계 지도"
      data-testid="plotr-dual-subway-timeline"
      className="space-y-4 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all]"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
            <GitMerge className="size-4 text-accent" aria-hidden="true" />
            <span>{document.title || "이중 지하철 타임라인"}</span>
          </h3>
          <p className="mt-0.5 text-xs text-fg-2">
            작중 시간순과 독자 연재순을 원탭으로 전환하고, 회상·인과 모순을 자동 점검해요.
          </p>
        </div>
        <div role="group" aria-label="타임라인 기준 축" className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={axisMode === "narrative"}
            data-testid="subway-axis-narrative"
            onClick={() => setAxisMode("narrative")}
            className={`${BTN_BASE} ${
              axisMode === "narrative"
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
            }`}
          >
            연재 공개순 보기
          </button>
          <button
            type="button"
            aria-pressed={axisMode === "chronological"}
            data-testid="subway-axis-chronological"
            onClick={() => setAxisMode("chronological")}
            className={`${BTN_BASE} ${
              axisMode === "chronological"
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
            }`}
          >
            작중 시간순 보기
          </button>
          <button
            type="button"
            onClick={() => setShowAddEvent((prev) => !prev)}
            className={`${BTN_BASE} border-line bg-card text-fg hover:bg-raised`}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>사건 역 추가</span>
          </button>
        </div>
      </header>

      {showAddEvent ? (
        <div className="grid gap-2.5 rounded-xl border border-line bg-card p-3 sm:grid-cols-4">
          <label className="text-xs font-semibold text-fg-2 sm:col-span-2">
            사건 이름
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="예: 북부 성채 비밀 회동"
              className="mt-1 min-h-11 w-full rounded-lg border border-line bg-panel px-2.5 text-xs text-fg"
            />
          </label>
          <label className="text-xs font-semibold text-fg-2">
            작중 시간 순서
            <input
              type="number"
              value={newChrono}
              onChange={(e) => setNewChrono(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-line bg-panel px-2.5 text-xs tabular-nums text-fg"
            />
          </label>
          <label className="text-xs font-semibold text-fg-2">
            연재 회차
            <input
              type="number"
              min={1}
              value={newEpisode}
              onChange={(e) => setNewEpisode(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-line bg-panel px-2.5 text-xs tabular-nums text-fg"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-4">
            <label className="flex-1 text-xs font-semibold text-fg-2">
              시대·구간 메모
              <input
                type="text"
                value={newEra}
                onChange={(e) => setNewEra(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border border-line bg-panel px-2.5 text-xs text-fg"
              />
            </label>
            <button
              type="button"
              onClick={handleAddEvent}
              disabled={!newTitle.trim()}
              title={!newTitle.trim() ? "사건 이름을 먼저 입력해 주세요" : undefined}
              className={`${BTN_BASE} mt-5 border-accent bg-accent text-on-accent disabled:opacity-40`}
            >
              노선도에 추가
            </button>
          </div>
        </div>
      ) : null}

      {/* 지하철 노선도 SVG 시각화 */}
      {layout.stations.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-card px-4 py-6 text-center text-xs text-fg-2">
          아직 사건 역이 없어요. 위에서 장르 샘플을 고르거나 사건 역을 추가하면 인물 노선도가 자동으로 이어집니다.
        </p>
      ) : (
        <div className="overflow-x-auto overscroll-contain rounded-xl border border-line bg-card p-3">
          <svg
            role="img"
            aria-label={`이중 지하철 타임라인 노선도 (${axisMode === "narrative" ? "연재 공개순" : "작중 시간순"})`}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            className="h-auto min-w-[34rem] w-full"
          >
            {layout.routes.map((route) => (
              <g key={route.trackId}>
                {route.svgPathD ? (
                  <path
                    d={route.svgPathD}
                    fill="none"
                    stroke={route.toneToken}
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.9}
                  />
                ) : null}
              </g>
            ))}
            {layout.stations.map((station) => {
              const isSelected = selectedEvent?.id === station.eventId;
              return (
                <g
                  key={station.eventId}
                  onClick={() => setSelectedEventId(station.eventId)}
                  className="cursor-pointer"
                >
                  <circle
                    cx={station.x}
                    cy={station.y}
                    r={station.isConvergenceHub ? 11 : 8}
                    fill="var(--color-card)"
                    stroke={isSelected ? "var(--color-accent)" : "var(--color-fg)"}
                    strokeWidth={isSelected ? 3.5 : 2.2}
                  />
                  <text
                    x={station.x}
                    y={station.y - 16}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={isSelected ? 700 : 500}
                    fill="var(--color-fg)"
                  >
                    {station.title.slice(0, 14)}
                  </text>
                  <text
                    x={station.x}
                    y={station.y + 24}
                    textAnchor="middle"
                    fontSize={10}
                    fill="var(--color-fg-2)"
                  >
                    {station.narrativeEpisodeOrder}화 · 시점 {station.chronologicalOrder}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-line pt-2 text-xs text-fg-2">
            {document.tracks.map((track) => (
              <span key={track.id} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: track.toneToken }}
                />
                <span>{track.label}</span>
              </span>
            ))}
            <span className="ml-auto tabular-nums text-fg-3">
              합류 역 {layout.convergenceCount}곳 · 총 {layout.stations.length}사건
            </span>
          </div>
        </div>
      )}

      {/* 선택 역 요약 + 인과·회상 진단 */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-line bg-card p-3">
          <h4 className="text-xs font-bold text-fg">
            인과 · 회상 자동 진단
          </h4>
          <p className="mt-1 text-xs tabular-nums text-fg-2">
            회상 점프 {causality.flashbackCount}건 · 연대기 모순 {causality.paradoxCount}건 · 미복선 경고 {causality.spoilerCount}건
          </p>
          {causality.findings.length > 0 ? (
            <ul className="mt-2 space-y-1.5 text-xs">
              {causality.findings.slice(0, 4).map((item, idx) => (
                <li
                  key={`${item.eventId}-${item.code}-${idx}`}
                  className="flex items-start gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-fg-2"
                >
                  <AlertTriangle
                    className={`mt-0.5 size-3.5 shrink-0 ${
                      item.severity === "error"
                        ? "text-bad"
                        : item.severity === "warning"
                          ? "text-warn"
                          : "text-cool"
                    }`}
                    aria-hidden="true"
                  />
                  <span>{item.messageKo}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-good">
              연대기와 서사 순서 사이의 인과 충돌이 없어요.
            </p>
          )}
        </div>

        {/* 시대별 세계 지도 핀 */}
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <MapPin className="size-3.5 text-accent" aria-hidden="true" />
              <span>세계 지도 핀 ({visiblePins.length}곳 표시)</span>
            </h4>
            <label className="inline-flex items-center gap-1.5 text-xs text-fg-2 tabular-nums">
              <span>시점 {eraCursor}</span>
              <input
                type="range"
                min={minEra}
                max={maxEra}
                value={eraCursor}
                onChange={(e) => setEraCursor(Number(e.target.value))}
                aria-label="지도 시대 슬라이더"
                className="w-24 accent-accent"
              />
            </label>
          </div>
          <div className="relative mt-2 h-32 rounded-lg border border-line bg-canvas">
            {visiblePins.map((pin) => (
              <div
                key={pin.id}
                style={{ left: `${Math.round(pin.u * 100)}%`, top: `${Math.round(pin.v * 100)}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/60 bg-panel px-2 py-0.5 text-[11px] font-semibold text-fg"
              >
                {pin.label}
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={pinLabel}
              onChange={(e) => setPinLabel(e.target.value)}
              placeholder="새 장소 핀 이름"
              aria-label="새 세계 지도 핀 이름"
              className="min-h-11 flex-1 rounded-lg border border-line bg-panel px-2.5 text-xs text-fg"
            />
            <button
              type="button"
              onClick={handleAddMapPin}
              disabled={!pinLabel.trim()}
              title={!pinLabel.trim() ? "장소 이름을 입력해 주세요" : undefined}
              className={`${BTN_BASE} border-line bg-panel text-fg hover:bg-raised disabled:opacity-40`}
            >
              핀 추가
            </button>
          </div>
        </div>
      </div>

      {/* 선택 회차 바로가기 + JSON Canvas 호환 내보내기 */}
      <details className="rounded-xl border border-line bg-card p-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-xs font-semibold text-fg">
          <span>JSON Canvas 1.0 내보내기 · 복원 (전문가 도구)</span>
          <span className="text-fg-3">옵시디언·외부 보드 호환</span>
        </summary>
        <div className="mt-2.5 space-y-2 border-t border-line pt-2.5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExportCanvas}
              className={`${BTN_BASE} border-accent/50 bg-accent-soft text-accent`}
            >
              <Download className="size-3.5" aria-hidden="true" />
              <span>JSON Canvas 만들기</span>
            </button>
            <button
              type="button"
              onClick={handleImportRoundtrip}
              disabled={!exportedJson.trim()}
              title={!exportedJson.trim() ? "먼저 JSON을 만들거나 붙여 넣어 주세요" : undefined}
              className={`${BTN_BASE} border-line bg-panel text-fg hover:bg-raised disabled:opacity-40`}
            >
              <Upload className="size-3.5" aria-hidden="true" />
              <span>JSON에서 복원</span>
            </button>
            {selectedEvent && onSelectEpisodeOrder ? (
              <button
                type="button"
                onClick={() => onSelectEpisodeOrder(selectedEvent.narrativeEpisodeOrder)}
                className={`${BTN_BASE} border-line bg-panel text-fg hover:bg-raised`}
              >
                {selectedEvent.narrativeEpisodeOrder}화 줄거리로 이동
              </button>
            ) : null}
          </div>
          {canvasFeedback ? (
            <p role="status" className="text-xs text-fg-2">
              {canvasFeedback}
            </p>
          ) : null}
          {exportedJson ? (
            <textarea
              rows={4}
              value={exportedJson}
              onChange={(e) => setExportedJson(e.target.value)}
              aria-label="JSON Canvas 데이터"
              className="w-full rounded-lg border border-line bg-panel p-2 font-mono text-[11px] text-fg"
            />
          ) : null}
        </div>
      </details>
    </section>
  );
}

export default PlotrDualSubwayTimelineView;
