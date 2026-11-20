import { describe, expect, it } from "vitest";

import {
  analyzeNarrativeCausality,
  exportToJsonCanvas,
  filterWorldMapPinsByEra,
  importFromJsonCanvas,
  layoutDualSubwayTimeline,
  upsertWorldMapPin,
  type DualSubwayTimelineDocument,
} from "./studio-dual-subway-timeline";

function createSampleTimeline(): DualSubwayTimelineDocument {
  return {
    id: "tl-crownfall",
    title: "왕관의 낙하 — 이중 연표",
    tracks: [
      {
        id: "tr-hero",
        label: "주인공 시우",
        kind: "character",
        toneToken: "oklch(0.62 0.16 250)",
        canvasColorPreset: "5",
      },
      {
        id: "tr-rival",
        label: "황태자 카엘",
        kind: "character",
        toneToken: "oklch(0.61 0.18 25)",
        canvasColorPreset: "1",
      },
      {
        id: "tr-relic",
        label: "성검 복선",
        kind: "foreshadow",
        toneToken: "oklch(0.72 0.14 85)",
        canvasColorPreset: "3",
      },
    ],
    events: [
      {
        id: "ev-oath",
        title: "어린 시절의 서약 (회상)",
        chronologicalOrder: 10,
        eraLabel: "제국력 401년",
        calendarDateLabel: "401-03-12",
        narrativeEpisodeOrder: 4,
        narrativeSceneIndex: 1,
        participantTrackIds: ["tr-hero", "tr-rival"],
        locationPinId: "pin-palace",
        revealsFactIds: ["fact-secret-oath"],
      },
      {
        id: "ev-duel",
        title: "수도 광장 첫 대치",
        chronologicalOrder: 50,
        eraLabel: "제국력 412년",
        calendarDateLabel: "412-09-01",
        narrativeEpisodeOrder: 1,
        narrativeSceneIndex: 2,
        participantTrackIds: ["tr-hero", "tr-rival", "tr-relic"],
        locationPinId: "pin-plaza",
        requiresFactIds: ["fact-secret-oath"],
        revealsFactIds: ["fact-sword-cracked"],
      },
      {
        id: "ev-exile",
        title: "북부 국경 유배",
        chronologicalOrder: 70,
        eraLabel: "제국력 413년",
        calendarDateLabel: "413-01-15",
        narrativeEpisodeOrder: 5,
        narrativeSceneIndex: 1,
        participantTrackIds: ["tr-hero", "tr-relic"],
        requiresFactIds: ["fact-sword-cracked"],
      },
    ],
    mapPins: [
      {
        id: "pin-palace",
        mapId: "empire-map",
        label: "황궁 발코니",
        u: 0.42,
        v: 0.35,
        category: "bg3d-scene",
        activeFromOrder: 0,
        activeUntilOrder: 60,
        linkedBg3dSceneId: "hero-v1-palace-hall",
        linkedEventIds: ["ev-oath"],
      },
      {
        id: "pin-plaza",
        mapId: "empire-map",
        label: "수도 중앙 광장",
        u: 0.55,
        v: 0.48,
        category: "landmark",
        activeFromOrder: 40,
        activeUntilOrder: null,
        linkedEventIds: ["ev-duel"],
      },
    ],
  };
}

describe("studio-dual-subway-timeline", () => {
  it("연대기축과 서사축 전환에 따라 역 순서와 지하철 합류·분기 SVG 경로를 결정적으로 배치한다", () => {
    const doc = createSampleTimeline();
    const chronoLayout = layoutDualSubwayTimeline(doc, "chronological");
    const narrativeLayout = layoutDualSubwayTimeline(doc, "narrative");

    expect(chronoLayout.stations.map((s) => s.eventId)).toEqual([
      "ev-oath",
      "ev-duel",
      "ev-exile",
    ]);
    expect(narrativeLayout.stations.map((s) => s.eventId)).toEqual([
      "ev-duel",
      "ev-oath",
      "ev-exile",
    ]);
    expect(chronoLayout.convergenceCount).toBe(3);

    const heroRoute = chronoLayout.routes.find((r) => r.trackId === "tr-hero");
    expect(heroRoute?.svgPathD.startsWith("M ")).toBe(true);
    expect(heroRoute?.svgPathD).toContain("C ");
  });

  it("회상 점프, 서사상 미공개 스포일러 참조, 연대기 인과 모순을 정확히 구분 진단한다", () => {
    const doc = createSampleTimeline();
    const report = analyzeNarrativeCausality(doc);
    // 1화(ev-duel, 연대기 50) -> 4화(ev-oath, 연대기 10)가 회상 점프 + 1화에서 fact-secret-oath 선참조(스포일러 경고)
    // 반면 연대기순(10 -> 50 -> 70)에서는 인과 모순 0건!
    expect(report.flashbackCount).toBe(1);
    expect(report.spoilerCount).toBe(1);
    expect(report.paradoxCount).toBe(0);

    // 연대기상 원인보다 먼저 요구하는 모순 사건을 추가하면 paradoxCount 증가
    const paradoxical: DualSubwayTimelineDocument = {
      ...doc,
      events: [
        ...doc.events,
        {
          id: "ev-paradox",
          title: "원인 없는 결과",
          chronologicalOrder: 5,
          eraLabel: "제국력 399년",
          calendarDateLabel: "399-05-01",
          narrativeEpisodeOrder: 6,
          narrativeSceneIndex: 1,
          participantTrackIds: ["tr-hero"],
          requiresFactIds: ["fact-sword-cracked"],
        },
      ],
    };
    const badReport = analyzeNarrativeCausality(paradoxical);
    expect(badReport.paradoxCount).toBe(1);
  });

  it("세계 지도 핀을 시대 슬라이더 기준으로 필터링하고 정규화 좌표를 안전하게 보정한다", () => {
    let doc = createSampleTimeline();
    doc = upsertWorldMapPin(doc, {
      id: "pin-fortress",
      mapId: "empire-map",
      label: "북부 요새",
      u: 1.4,
      v: -0.2,
      category: "faction-hq",
      activeFromOrder: 65,
      activeUntilOrder: null,
      linkedEventIds: ["ev-exile"],
    });

    const added = doc.mapPins.find((p) => p.id === "pin-fortress");
    expect(added?.u).toBe(1);
    expect(added?.v).toBe(0);

    const earlyPins = filterWorldMapPinsByEra(doc.mapPins, 15, "empire-map");
    expect(earlyPins.map((p) => p.id)).toEqual(["pin-palace"]);

    const latePins = filterWorldMapPinsByEra(doc.mapPins, 70, "empire-map");
    expect(latePins.map((p) => p.id).sort()).toEqual(["pin-fortress", "pin-plaza"]);
  });

  it("Obsidian JSON Canvas 1.0 양방향 직렬화 시 타임라인·지도 핀과 외부 자유 노드를 무손실 보존한다", () => {
    const doc = createSampleTimeline();
    const exported = exportToJsonCanvas(doc, "narrative");
    expect(exported.nodes.length).toBeGreaterThanOrEqual(6);
    expect(exported.edges.length).toBeGreaterThanOrEqual(3);

    // 외부 Obsidian 사용자가 자유 텍스트 메모 노드를 추가한 상황을 시뮬레이션한다.
    const augmented = {
      nodes: [
        ...exported.nodes,
        {
          id: "user-note-1",
          type: "text" as const,
          x: 900,
          y: 200,
          width: 220,
          height: 100,
          text: "1화 엔딩 컷 구도 메모",
        },
      ],
      edges: [
        ...exported.edges,
        {
          id: "user-edge-1",
          fromNode: "user-note-1",
          toNode: "event-ev-duel",
          label: "참고",
        },
      ],
    };

    const imported = importFromJsonCanvas(augmented);
    expect(imported.timeline.id).toBe(doc.id);
    expect(imported.timeline.tracks).toHaveLength(doc.tracks.length);
    expect(imported.timeline.events).toHaveLength(doc.events.length);
    expect(imported.timeline.mapPins).toHaveLength(doc.mapPins.length);
    expect(imported.freeformNodes).toHaveLength(1);
    expect(imported.freeformEdges).toHaveLength(1);
  });
});
