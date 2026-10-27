import { describe, expect, it } from "vitest";

import { studioWorldCanOccupy, findStudioWorldPath } from "../../studio-virtual-space-world-pathfinding";
import { studioWorldInteractions, studioWorldRoomAt, validateStudioWorldManifest } from "../../studio-virtual-space-world-manifest";
import { studioVirtualWorldPresentation } from "../../studio-virtual-space-world-presentation";
import {
  TOON_HQ_FURNITURE,
  TOON_HQ_PHYSICS_PROPS,
  TOON_HQ_ROOMS,
  TOON_HQ_WALL_DECOR,
  toonHqPipelineRooms,
} from "./toon-hq-blueprint";
import { isToonHqManifest, studioVirtualToonHqManifest, toonHqFootprintRect, toonHqSeats, toonHqWallSegments } from "./toon-hq-manifest";

describe("toon-hq manifest", () => {
  it.each([false, true])("공용 월드 검증을 오류 없이 통과한다 (personal=%s)", (personal) => {
    const manifest = studioVirtualToonHqManifest(personal);
    expect(validateStudioWorldManifest(manifest)).toEqual([]);
    expect(isToonHqManifest(manifest)).toBe(true);
    expect(studioVirtualToonHqManifest(personal)).toBe(manifest);
    expect(studioVirtualWorldPresentation(manifest)?.camera).toBe("follow");
  });

  it("같은 id의 복제본은 본사 manifest로 인정하지 않는다", () => {
    const copy = { ...studioVirtualToonHqManifest(false) };
    expect(isToonHqManifest(copy)).toBe(false);
  });

  it("방들이 겹치지 않고 월드 테두리 안을 빈틈없이 채운다", () => {
    let area = 0;
    for (const [index, room] of TOON_HQ_ROOMS.entries()) {
      area += room.width * room.height;
      for (const other of TOON_HQ_ROOMS.slice(index + 1)) {
        const overlap = Math.max(room.x, other.x) < Math.min(room.x + room.width, other.x + other.width)
          && Math.max(room.y, other.y) < Math.min(room.y + room.height, other.y + other.height);
        expect(overlap, `${room.id} ↔ ${other.id}`).toBe(false);
      }
    }
    expect(area).toBe((2400 - 96) * (1632 - 96));
  });

  it("로비에서 모든 방의 스폰과 모든 좌석까지 걸어갈 수 있다", () => {
    const manifest = studioVirtualToonHqManifest(false);
    const lobby = TOON_HQ_ROOMS.find((room) => room.id === "hq-lobby");
    expect(lobby).toBeDefined();
    if (!lobby) return;
    for (const room of TOON_HQ_ROOMS) {
      expect(studioWorldCanOccupy(manifest, room.spawn), room.id).toBe(true);
      expect(studioWorldRoomAt(manifest, room.spawn)).toBe(room.id);
      expect(findStudioWorldPath(manifest, lobby.spawn, room.spawn).length, room.id).toBeGreaterThan(0);
    }
    for (const seat of toonHqSeats()) {
      expect(findStudioWorldPath(manifest, lobby.spawn, seat.approach).length, seat.id).toBeGreaterThan(0);
      expect(studioWorldRoomAt(manifest, seat.anchor)).toBe(seat.roomId);
    }
  });

  it("웹툰 공정 레일은 시나리오부터 연재까지 순서대로 이어진다", () => {
    expect(toonHqPipelineRooms().map((room) => room.pipelineStep)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(toonHqPipelineRooms()[0]?.id).toBe("hq-story-room");
    expect(toonHqPipelineRooms().at(-1)?.id).toBe("hq-publish-desk");
  });

  it("작업 좌석이 충분하고(작화 8석 포함) 모든 좌석이 방 안에 있다", () => {
    const seats = toonHqSeats();
    expect(seats.filter((seat) => seat.roomId === "hq-ink-bay")).toHaveLength(8);
    expect(seats.length).toBeGreaterThanOrEqual(30);
    expect(new Set(seats.map((seat) => seat.id)).size).toBe(seats.length);
  });

  it("상호작용은 방마다 웹툰 업무 행동으로 이어진다", () => {
    const manifest = studioVirtualToonHqManifest(false);
    const interactions = studioWorldInteractions(manifest);
    const actionsByRoom = new Map<string, Set<string>>();
    for (const interaction of interactions) {
      const set = actionsByRoom.get(interaction.zoneId) ?? new Set<string>();
      set.add(interaction.action);
      actionsByRoom.set(interaction.zoneId, set);
    }
    expect(actionsByRoom.get("hq-ink-bay")?.has("canvas")).toBe(true);
    expect(actionsByRoom.get("hq-story-room")?.has("comic")).toBe(true);
    expect(actionsByRoom.get("hq-review-room")?.has("review")).toBe(true);
    expect(actionsByRoom.get("hq-reference-library")?.has("assets")).toBe(true);
    expect(actionsByRoom.get("hq-meeting-room")?.has("live")).toBe(true);
  });

  it("집중 부스와 자료실은 사일런트, 리뷰·회의실은 비공개 음향이다", () => {
    const manifest = studioVirtualToonHqManifest(false);
    const zone = (roomId: string) => manifest.zones?.find((candidate) => candidate.roomId === roomId);
    expect(zone("hq-focus-booths")?.silent).toBe(true);
    expect(zone("hq-reference-library")?.suggestMuteOnEnter).toBe(true);
    expect(zone("hq-review-room")?.privateAudio).toBe(true);
    expect(manifest.acousticZones?.find((candidate) => candidate.roomId === "hq-meeting-room")?.policy).toBe("private");
    expect(studioVirtualToonHqManifest(true).acousticZones?.every((candidate) => candidate.policy === "public")).toBe(true);
  });

  it("물리 소품은 시작 위치가 벽·가구와 겹치지 않는다", () => {
    const manifest = studioVirtualToonHqManifest(false);
    for (const prop of TOON_HQ_PHYSICS_PROPS) {
      const radius = prop.shape.type === "circle" ? prop.shape.radius : Math.max(prop.shape.halfWidth, prop.shape.halfHeight);
      expect(studioWorldCanOccupy(manifest, prop, radius), prop.id).toBe(true);
    }
  });

  it("가구 접지면과 벽 장식이 자기 방 안에 있다", () => {
    for (const item of TOON_HQ_FURNITURE) {
      const room = TOON_HQ_ROOMS.find((candidate) => candidate.id === item.roomId);
      expect(room, item.id).toBeDefined();
      const footprint = toonHqFootprintRect(item);
      if (!room || !footprint) continue;
      expect(footprint.x >= room.x && footprint.x + footprint.width <= room.x + room.width, item.id).toBe(true);
      expect(footprint.y >= room.y && footprint.y + footprint.height <= room.y + room.height, item.id).toBe(true);
    }
    for (const decor of TOON_HQ_WALL_DECOR) {
      const room = TOON_HQ_ROOMS.find((candidate) => candidate.id === decor.wallRoomId);
      expect(room && decor.x - decor.width / 2 >= room.x && decor.x + decor.width / 2 <= room.x + room.width, decor.id).toBe(true);
    }
  });

  it("문 틈은 2타일 폭으로 열려 있다", () => {
    const walls = toonHqWallSegments();
    const inkSouth = walls.filter((wall) => wall.roomId === "hq-ink-bay" && wall.side === "south");
    expect(inkSouth).toHaveLength(2);
    const [left, right] = inkSouth;
    expect(left && right ? right.x - (left.x + left.width) : 0).toBe(96);
    expect(walls.some((wall) => wall.roomId === "hq-main-hall")).toBe(false);
  });
});
