/**
 * Aeon Timeline / World Anvil / Obsidian JSON Canvas형 연대기×서사순 이중 지하철 타임라인,
 * 인터랙티브 세계 지도 핀 레이어 및 JSON Canvas 1.0 양방향 직렬화 엔진.
 *
 * - 하나의 사건에 작중 시간순(`chronologicalOrder`)과 독자 연재 공개순(`narrativeEpisodeOrder`)을
 *   이중 바인딩하고, 참여 트랙들이 사건 역(Station)에서 합류·분기하는 지하철 노선도 SVG 경로를 결정론적으로 계산한다.
 * - 회상·시간역행 구간과 인과·스포일러 위반(미공개 사실 선참조)을 자동 진단한다.
 * - Obsidian JSON Canvas 1.0 공개 규격(`nodes`, `edges`)과 무손실 양방향 직렬화를 지원한다.
 */

export type TimelineAxisMode = "chronological" | "narrative";
export type TimelineTrackKind = "character" | "faction" | "plotline" | "foreshadow";
export type WorldMapPinCategory =
  | "city"
  | "landmark"
  | "faction-hq"
  | "bg3d-scene"
  | "event";

export interface SubwayTimelineTrack {
  readonly id: string;
  readonly label: string;
  readonly kind: TimelineTrackKind;
  /** OKLCH 또는 시맨틱 색상 토큰(예: oklch(0.62 0.16 250)). */
  readonly toneToken: string;
  /** JSON Canvas 1.0 표준 프리셋 색상 번호 ("1".."6"). */
  readonly canvasColorPreset?: "1" | "2" | "3" | "4" | "5" | "6";
}

export interface DualAxisTimelineEvent {
  readonly id: string;
  readonly title: string;
  /** 작중 연대기 순서(숫자 클수록 미래). */
  readonly chronologicalOrder: number;
  readonly eraLabel: string;
  readonly calendarDateLabel: string;
  /** 독자 연재 공개 회차 순서. */
  readonly narrativeEpisodeOrder: number;
  readonly narrativeSceneIndex: number;
  readonly participantTrackIds: readonly string[];
  readonly locationPinId?: string;
  readonly revealsFactIds?: readonly string[];
  readonly requiresFactIds?: readonly string[];
  readonly summary?: string;
}

export interface WorldMapPin {
  readonly id: string;
  readonly mapId: string;
  readonly label: string;
  /** 정규화 지도 좌표 (0..1). */
  readonly u: number;
  readonly v: number;
  readonly category: WorldMapPinCategory;
  readonly activeFromOrder: number;
  readonly activeUntilOrder: number | null;
  readonly linkedBg3dSceneId?: string;
  readonly linkedEventIds: readonly string[];
}

export interface DualSubwayTimelineDocument {
  readonly id: string;
  readonly title: string;
  readonly tracks: readonly SubwayTimelineTrack[];
  readonly events: readonly DualAxisTimelineEvent[];
  readonly mapPins: readonly WorldMapPin[];
}

export interface SubwayStationLayout {
  readonly eventId: string;
  readonly title: string;
  readonly axisIndex: number;
  readonly x: number;
  readonly y: number;
  readonly participantTrackIds: readonly string[];
  readonly isConvergenceHub: boolean;
  readonly chronologicalOrder: number;
  readonly narrativeEpisodeOrder: number;
}

export interface SubwayTrackSegmentLayout {
  readonly trackId: string;
  readonly label: string;
  readonly toneToken: string;
  readonly homeY: number;
  readonly stationIds: readonly string[];
  readonly svgPathD: string;
}

export interface DualSubwayLayoutResult {
  readonly axisMode: TimelineAxisMode;
  readonly width: number;
  readonly height: number;
  readonly stations: readonly SubwayStationLayout[];
  readonly routes: readonly SubwayTrackSegmentLayout[];
  readonly convergenceCount: number;
}

export interface NarrativeCausalityFinding {
  readonly code: "flashback-jump" | "chronological-paradox" | "unprepared-spoiler";
  readonly severity: "info" | "warning" | "error";
  readonly eventId: string;
  readonly factId?: string;
  readonly messageKo: string;
}

export interface NarrativeCausalityReport {
  readonly flashbackCount: number;
  readonly paradoxCount: number;
  readonly spoilerCount: number;
  readonly findings: readonly NarrativeCausalityFinding[];
}

export type JsonCanvasNodeType = "text" | "file" | "link" | "group";
export type JsonCanvasSide = "top" | "right" | "bottom" | "left";

export interface JsonCanvasNode {
  readonly id: string;
  readonly type: JsonCanvasNodeType;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color?: "1" | "2" | "3" | "4" | "5" | "6";
  readonly text?: string;
  readonly file?: string;
  readonly url?: string;
  readonly label?: string;
}

export interface JsonCanvasEdge {
  readonly id: string;
  readonly fromNode: string;
  readonly fromSide?: JsonCanvasSide;
  readonly toNode: string;
  readonly toSide?: JsonCanvasSide;
  readonly color?: "1" | "2" | "3" | "4" | "5" | "6";
  readonly label?: string;
}

export interface JsonCanvasDocumentV1 {
  readonly nodes: readonly JsonCanvasNode[];
  readonly edges: readonly JsonCanvasEdge[];
}

export interface ImportedCanvasBundle {
  readonly timeline: DualSubwayTimelineDocument;
  readonly freeformNodes: readonly JsonCanvasNode[];
  readonly freeformEdges: readonly JsonCanvasEdge[];
}

const LANE_SPACING_PX = 56;
const STATION_SPACING_PX = 180;
const PADDING_X_PX = 80;
const PADDING_Y_PX = 64;
const META_HEADER_PREFIX = "<!-- toonstudio-dual-timeline-v1:";
const META_HEADER_SUFFIX = " -->";

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function sortEventsByAxis(
  events: readonly DualAxisTimelineEvent[],
  axisMode: TimelineAxisMode,
): readonly DualAxisTimelineEvent[] {
  return Object.freeze(
    [...events].sort((a, b) => {
      if (axisMode === "chronological") {
        return (
          a.chronologicalOrder - b.chronologicalOrder ||
          a.narrativeEpisodeOrder - b.narrativeEpisodeOrder ||
          a.id.localeCompare(b.id)
        );
      }
      return (
        a.narrativeEpisodeOrder - b.narrativeEpisodeOrder ||
        a.narrativeSceneIndex - b.narrativeSceneIndex ||
        a.chronologicalOrder - b.chronologicalOrder ||
        a.id.localeCompare(b.id)
      );
    }),
  );
}

/**
 * 연대기축 또는 서사축 기준으로 지하철 노선도(역 좌표 + 합류/분기 큐빅 베지어 경로)를 계산한다.
 */
export function layoutDualSubwayTimeline(
  doc: DualSubwayTimelineDocument,
  axisMode: TimelineAxisMode,
): DualSubwayLayoutResult {
  const ordered = sortEventsByAxis(doc.events, axisMode);
  const trackHomeY = new Map<string, number>();
  doc.tracks.forEach((track, idx) => {
    trackHomeY.set(track.id, PADDING_Y_PX + idx * LANE_SPACING_PX);
  });

  const stations: SubwayStationLayout[] = [];
  const stationById = new Map<string, SubwayStationLayout>();
  let convergenceCount = 0;

  ordered.forEach((ev, idx) => {
    const x = PADDING_X_PX + idx * STATION_SPACING_PX;
    const participantYs = ev.participantTrackIds
      .map((id) => trackHomeY.get(id))
      .filter((val): val is number => val !== undefined);
    const y =
      participantYs.length > 0
        ? round1(participantYs.reduce((acc, v) => acc + v, 0) / participantYs.length)
        : PADDING_Y_PX;
    const isConvergenceHub = participantYs.length >= 2;
    if (isConvergenceHub) convergenceCount += 1;

    const layout: SubwayStationLayout = Object.freeze({
      eventId: ev.id,
      title: ev.title,
      axisIndex: idx,
      x,
      y,
      participantTrackIds: Object.freeze([...ev.participantTrackIds]),
      isConvergenceHub,
      chronologicalOrder: ev.chronologicalOrder,
      narrativeEpisodeOrder: ev.narrativeEpisodeOrder,
    });
    stations.push(layout);
    stationById.set(ev.id, layout);
  });

  const routes: SubwayTrackSegmentLayout[] = doc.tracks.map((track) => {
    const homeY = trackHomeY.get(track.id) ?? PADDING_Y_PX;
    const visitedStations = ordered
      .filter((ev) => ev.participantTrackIds.includes(track.id))
      .map((ev) => stationById.get(ev.id))
      .filter((st): st is SubwayStationLayout => st !== undefined);

    const pathParts: string[] = [];
    if (visitedStations.length > 0) {
      const first = visitedStations[0]!;
      pathParts.push(`M ${round1(first.x)} ${round1(first.y)}`);
      for (let i = 1; i < visitedStations.length; i += 1) {
        const prev = visitedStations[i - 1]!;
        const curr = visitedStations[i]!;
        const midX = round1((prev.x + curr.x) / 2);
        // 두 역 사이에 다른 역이 끼어 있으면 홈 레인으로 잠깐 복귀한 뒤 합류한다.
        if (curr.axisIndex - prev.axisIndex > 1 && (prev.y !== homeY || curr.y !== homeY)) {
          const outX = round1(prev.x + STATION_SPACING_PX * 0.45);
          const inX = round1(curr.x - STATION_SPACING_PX * 0.45);
          pathParts.push(
            `C ${round1((prev.x + outX) / 2)} ${round1(prev.y)} ${round1((prev.x + outX) / 2)} ${round1(homeY)} ${outX} ${round1(homeY)}`,
          );
          pathParts.push(`L ${inX} ${round1(homeY)}`);
          pathParts.push(
            `C ${round1((inX + curr.x) / 2)} ${round1(homeY)} ${round1((inX + curr.x) / 2)} ${round1(curr.y)} ${round1(curr.x)} ${round1(curr.y)}`,
          );
        } else {
          pathParts.push(
            `C ${midX} ${round1(prev.y)} ${midX} ${round1(curr.y)} ${round1(curr.x)} ${round1(curr.y)}`,
          );
        }
      }
    }

    return Object.freeze({
      trackId: track.id,
      label: track.label,
      toneToken: track.toneToken,
      homeY,
      stationIds: Object.freeze(visitedStations.map((st) => st.eventId)),
      svgPathD: pathParts.join(" "),
    });
  });

  const width = Math.max(
    360,
    PADDING_X_PX * 2 + Math.max(0, ordered.length - 1) * STATION_SPACING_PX,
  );
  const height = Math.max(
    220,
    PADDING_Y_PX * 2 + Math.max(0, doc.tracks.length - 1) * LANE_SPACING_PX,
  );

  return Object.freeze({
    axisMode,
    width,
    height,
    stations: Object.freeze(stations),
    routes: Object.freeze(routes),
    convergenceCount,
  });
}

/**
 * 연대기순과 서사순을 교차 검사해 회상/시간역행 점프, 연대기 인과 모순, 미복선 스포일러를 검출한다.
 */
export function analyzeNarrativeCausality(
  doc: DualSubwayTimelineDocument,
): NarrativeCausalityReport {
  const findings: NarrativeCausalityFinding[] = [];
  const byNarrative = sortEventsByAxis(doc.events, "narrative");
  const byChrono = sortEventsByAxis(doc.events, "chronological");

  let flashbackCount = 0;
  let paradoxCount = 0;
  let spoilerCount = 0;

  let prevChronoOrder: number | null = null;
  const revealedInNarrative = new Set<string>();
  for (const ev of byNarrative) {
    if (prevChronoOrder !== null && ev.chronologicalOrder < prevChronoOrder) {
      flashbackCount += 1;
      findings.push({
        code: "flashback-jump",
        severity: "info",
        eventId: ev.id,
        messageKo: `'${ev.title}'은(는) 직전 서사 장면보다 과거 시점(회상/역행)으로 이동합니다.`,
      });
    }
    prevChronoOrder = ev.chronologicalOrder;

    for (const reqFact of ev.requiresFactIds ?? []) {
      if (!revealedInNarrative.has(reqFact)) {
        spoilerCount += 1;
        findings.push({
          code: "unprepared-spoiler",
          severity: "warning",
          eventId: ev.id,
          factId: reqFact,
          messageKo: `서사순 기준 '${ev.title}'에서 독자에게 아직 공개되지 않은 사실(${reqFact})을 참조합니다.`,
        });
      }
    }
    for (const revFact of ev.revealsFactIds ?? []) {
      revealedInNarrative.add(revFact);
    }
  }

  const revealedInChrono = new Set<string>();
  for (const ev of byChrono) {
    for (const reqFact of ev.requiresFactIds ?? []) {
      if (!revealedInChrono.has(reqFact)) {
        paradoxCount += 1;
        findings.push({
          code: "chronological-paradox",
          severity: "error",
          eventId: ev.id,
          factId: reqFact,
          messageKo: `작중 연대기 기준 '${ev.title}'이(가) 원인 사실(${reqFact}) 발생보다 앞서 배치되어 인과 모순입니다.`,
        });
      }
    }
    for (const revFact of ev.revealsFactIds ?? []) {
      revealedInChrono.add(revFact);
    }
  }

  return Object.freeze({
    flashbackCount,
    paradoxCount,
    spoilerCount,
    findings: Object.freeze(findings),
  });
}

export function upsertWorldMapPin(
  doc: DualSubwayTimelineDocument,
  pin: WorldMapPin,
): DualSubwayTimelineDocument {
  const normalized: WorldMapPin = Object.freeze({
    ...pin,
    u: round1(clamp01(pin.u) * 1000) / 1000,
    v: round1(clamp01(pin.v) * 1000) / 1000,
    linkedEventIds: Object.freeze([...pin.linkedEventIds]),
  });
  const rest = doc.mapPins.filter((p) => p.id !== normalized.id);
  return Object.freeze({
    ...doc,
    mapPins: Object.freeze([...rest, normalized]),
  });
}

export function filterWorldMapPinsByEra(
  pins: readonly WorldMapPin[],
  chronologicalOrder: number,
  mapId?: string,
): readonly WorldMapPin[] {
  return Object.freeze(
    pins.filter((pin) => {
      if (mapId && pin.mapId !== mapId) return false;
      if (chronologicalOrder < pin.activeFromOrder) return false;
      if (pin.activeUntilOrder !== null && chronologicalOrder > pin.activeUntilOrder) return false;
      return true;
    }),
  );
}

/**
 * 이중 타임라인과 세계 지도 핀을 Obsidian JSON Canvas 1.0 표준 문서로 직렬화한다.
 */
export function exportToJsonCanvas(
  doc: DualSubwayTimelineDocument,
  axisMode: TimelineAxisMode = "narrative",
): JsonCanvasDocumentV1 {
  const layout = layoutDualSubwayTimeline(doc, axisMode);
  const nodes: JsonCanvasNode[] = [];
  const edges: JsonCanvasEdge[] = [];

  const metaNodeText = `${META_HEADER_PREFIX}${JSON.stringify({
    id: doc.id,
    title: doc.title,
    tracks: doc.tracks,
    mapPins: doc.mapPins,
  })}${META_HEADER_SUFFIX}\n# ${doc.title}`;

  nodes.push({
    id: `meta-${doc.id}`,
    type: "text",
    x: 0,
    y: -180,
    width: 340,
    height: 110,
    color: "5",
    text: metaNodeText,
  });

  const eventMap = new Map(doc.events.map((ev) => [ev.id, ev]));
  for (const station of layout.stations) {
    const ev = eventMap.get(station.eventId);
    if (!ev) continue;
    const primaryTrack = doc.tracks.find((t) => t.id === ev.participantTrackIds[0]);
    const payload = JSON.stringify(ev);
    nodes.push({
      id: `event-${ev.id}`,
      type: "text",
      x: Math.round(station.x * 1.4),
      y: Math.round(station.y * 2),
      width: 240,
      height: 120,
      color: primaryTrack?.canvasColorPreset ?? "4",
      text: `${META_HEADER_PREFIX}${payload}${META_HEADER_SUFFIX}\n## ${ev.title}\n${ev.eraLabel} · ${ev.narrativeEpisodeOrder}화`,
    });
  }

  for (const route of layout.routes) {
    const track = doc.tracks.find((t) => t.id === route.trackId);
    for (let i = 1; i < route.stationIds.length; i += 1) {
      const prevId = route.stationIds[i - 1]!;
      const currId = route.stationIds[i]!;
      edges.push({
        id: `edge-${route.trackId}-${i}`,
        fromNode: `event-${prevId}`,
        fromSide: "right",
        toNode: `event-${currId}`,
        toSide: "left",
        color: track?.canvasColorPreset ?? "4",
        label: route.label,
      });
    }
  }

  if (doc.mapPins.length > 0) {
    nodes.push({
      id: `group-pins-${doc.id}`,
      type: "group",
      x: 0,
      y: Math.round(layout.height * 2 + 120),
      width: Math.max(420, doc.mapPins.length * 220 + 60),
      height: 180,
      label: "세계 지도 핀",
    });
    doc.mapPins.forEach((pin, idx) => {
      const pinNodeId = `pin-${pin.id}`;
      nodes.push({
        id: pinNodeId,
        type: "text",
        x: 30 + idx * 220,
        y: Math.round(layout.height * 2 + 150),
        width: 190,
        height: 110,
        color: "2",
        text: `**${pin.label}**\n(${pin.u}, ${pin.v})${pin.linkedBg3dSceneId ? `\nBG3D: ${pin.linkedBg3dSceneId}` : ""}`,
      });
      for (const linkedEventId of pin.linkedEventIds) {
        edges.push({
          id: `edge-pin-${pin.id}-${linkedEventId}`,
          fromNode: pinNodeId,
          fromSide: "top",
          toNode: `event-${linkedEventId}`,
          toSide: "bottom",
          label: "장소",
        });
      }
    });
  }

  return Object.freeze({
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
  });
}

function extractEmbeddedJson(text: string | undefined): unknown {
  if (!text) return null;
  const startIdx = text.indexOf(META_HEADER_PREFIX);
  if (startIdx < 0) return null;
  const jsonStart = startIdx + META_HEADER_PREFIX.length;
  const endIdx = text.indexOf(META_HEADER_SUFFIX, jsonStart);
  if (endIdx < 0) return null;
  try {
    return JSON.parse(text.slice(jsonStart, endIdx));
  } catch {
    return null;
  }
}

/**
 * Obsidian JSON Canvas 1.0 문서를 읽어 이중 타임라인·지도 핀과 일반 공간 노드로 무손실 복원한다.
 */
export function importFromJsonCanvas(
  canvas: JsonCanvasDocumentV1,
  fallbackId = "imported-timeline",
): ImportedCanvasBundle {
  let docId = fallbackId;
  let docTitle = "가져온 타임라인";
  let tracks: readonly SubwayTimelineTrack[] = [];
  let mapPins: readonly WorldMapPin[] = [];
  const events: DualAxisTimelineEvent[] = [];
  const freeformNodes: JsonCanvasNode[] = [];
  const structuredNodeIds = new Set<string>();

  for (const node of canvas.nodes) {
    if (node.id.startsWith("meta-") && node.type === "text") {
      const parsed = extractEmbeddedJson(node.text);
      if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>;
        if (typeof record.id === "string") docId = record.id;
        if (typeof record.title === "string") docTitle = record.title;
        if (Array.isArray(record.tracks)) tracks = record.tracks as SubwayTimelineTrack[];
        if (Array.isArray(record.mapPins)) mapPins = record.mapPins as WorldMapPin[];
        structuredNodeIds.add(node.id);
        continue;
      }
    }
    if (node.id.startsWith("event-") && node.type === "text") {
      const parsed = extractEmbeddedJson(node.text);
      if (parsed && typeof parsed === "object" && "chronologicalOrder" in parsed) {
        events.push(parsed as DualAxisTimelineEvent);
        structuredNodeIds.add(node.id);
        continue;
      }
    }
    if (node.id.startsWith("pin-") || node.id.startsWith("group-pins-")) {
      structuredNodeIds.add(node.id);
      continue;
    }
    freeformNodes.push(node);
  }

  const freeformEdges = canvas.edges.filter(
    (e) => !(structuredNodeIds.has(e.fromNode) && structuredNodeIds.has(e.toNode)),
  );

  return Object.freeze({
    timeline: Object.freeze({
      id: docId,
      title: docTitle,
      tracks: Object.freeze([...tracks]),
      events: Object.freeze(events),
      mapPins: Object.freeze([...mapPins]),
    }),
    freeformNodes: Object.freeze(freeformNodes),
    freeformEdges: Object.freeze(freeformEdges),
  });
}
