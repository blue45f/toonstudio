import { describe, expect, it } from "vitest";

import {
  clusterSpaceMinimapPeople,
  layoutSpaceMinimapLabels,
  spaceMinimapFallbackShortLabel,
  spaceMinimapGlyphWidthEm,
  spaceMinimapPeerTarget,
  spaceMinimapTextWidth,
} from "./space-minimap-labels";
import { studioVirtualToonHqManifest } from "../office2d/hq/toon-hq-manifest";
import { toonHqRoomShortLabel } from "../office2d/hq/toon-hq-blueprint";

describe("미니맵 방 라벨 정리", () => {
  it("한글은 전각, 영문·문장부호는 그보다 좁게 잰다", () => {
    expect(spaceMinimapGlyphWidthEm("가")).toBe(1);
    expect(spaceMinimapGlyphWidthEm("A")).toBeLessThan(1);
    expect(spaceMinimapGlyphWidthEm("·")).toBeLessThan(0.5);
    expect(spaceMinimapTextWidth("채색 랩", 100, 0)).toBeCloseTo(330, 0);
  });

  it("짧은 이름 대체는 첫 낱말이고, 나눌 수 없으면 null이다", () => {
    expect(spaceMinimapFallbackShortLabel("로비·리셉션")).toBe("로비");
    expect(spaceMinimapFallbackShortLabel("탕비 라운지")).toBe("탕비");
    expect(spaceMinimapFallbackShortLabel("자료실")).toBeNull();
  });

  it("들어가면 전체 이름, 안 들어가면 짧은 이름, 그래도 안 되면 생략한다", () => {
    const placed = layoutSpaceMinimapLabels([
      { id: "wide", x: 0, y: 0, width: 600, height: 300, label: "채색 랩", shortLabel: "채색" },
      { id: "narrow", x: 700, y: 0, width: 300, height: 300, label: "콘티·시나리오 룸", shortLabel: "콘티" },
      { id: "tiny", x: 1100, y: 0, width: 60, height: 300, label: "집중 부스", shortLabel: "부스" },
    ], { fontSize: 100 });
    const byId = new Map(placed.map((label) => [label.id, label]));
    expect(byId.get("wide")?.text).toBe("채색 랩");
    expect(byId.get("narrow")?.text).toBe("콘티");
    expect(byId.has("tiny")).toBe(false);
  });

  it("복도처럼 길쭉한 구역은 지금 있는 곳이 아니면 라벨을 생략한다", () => {
    const corridor = { id: "hall", x: 0, y: 0, width: 2400, height: 140, label: "메인 홀", shortLabel: null };
    expect(layoutSpaceMinimapLabels([corridor], { fontSize: 100 })).toHaveLength(0);
    expect(layoutSpaceMinimapLabels([corridor], { fontSize: 100, currentId: "hall" }).map((label) => label.text)).toEqual(["메인 홀"]);
  });

  it("겹치는 라벨은 지금 있는 방 → 넓은 방 순으로 하나만 남긴다", () => {
    const zones = [
      { id: "big", x: 0, y: 0, width: 800, height: 400, label: "작화 오픈 데스크" },
      { id: "overlap", x: 100, y: 100, width: 600, height: 200, label: "겹치는 방" },
    ];
    expect(layoutSpaceMinimapLabels(zones, { fontSize: 100 }).map((label) => label.id)).toEqual(["big"]);
    expect(layoutSpaceMinimapLabels(zones, { fontSize: 100, currentId: "overlap" }).map((label) => label.id)).toEqual(["overlap"]);
  });

  it("본사 지도(240px 미니맵 기준 글자 크기)에서 공정 방 라벨이 서로 겹치지 않고 모두 보인다", () => {
    const manifest = studioVirtualToonHqManifest(true);
    const fontSize = Math.max(manifest.width, manifest.height) / 20;
    const zones = manifest.rooms.map((room) => {
      const short = toonHqRoomShortLabel(room.id);
      return { id: room.id, x: room.x, y: room.y, width: room.width, height: room.height, label: room.labelKo, shortLabel: short?.ko ?? null };
    });
    const placed = layoutSpaceMinimapLabels(zones, { fontSize });
    const ids = new Set(placed.map((label) => label.id));
    for (const id of ["hq-story-room", "hq-ink-bay", "hq-color-lab", "hq-bg3d-lab", "hq-lettering-desk", "hq-review-room", "hq-publish-desk"]) {
      expect(ids.has(id), id).toBe(true);
    }
    expect(ids.has("hq-main-hall")).toBe(false);
    for (const label of placed) {
      const zone = zones.find((candidate) => candidate.id === label.id);
      expect(zone && spaceMinimapTextWidth(label.text, label.fontSize) <= zone.width).toBe(true);
    }
  });

  it("근접한 동료 핀은 클러스터로 병합하고 도착 목적지는 ±60px 오프셋을 둔다", () => {
    const clusters = clusterSpaceMinimapPeople([
      { id: "p1", name: "민지", point: { x: 400, y: 400 } },
      { id: "p2", name: "현우", point: { x: 420, y: 410 } },
      { id: "p3", name: "서연", point: { x: 900, y: 700 } },
    ], 64);
    expect(clusters).toHaveLength(2);
    expect(clusters[0]?.count).toBe(2);
    expect(clusters[0]?.names).toEqual(["민지", "현우"]);
    expect(clusters[1]?.count).toBe(1);

    const target = spaceMinimapPeerTarget({ x: 400, y: 400 }, "p1", 60);
    expect(Math.hypot(target.x - 400, target.y - 400)).toBeCloseTo(60, 0);
  });
});
