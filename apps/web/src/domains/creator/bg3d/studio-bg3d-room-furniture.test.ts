import { describe, expect, it } from "vitest";

import { PRIMITIVE_DEFS, type BgPrimitiveKind } from "../studio-background-3d-metadata";

import {
  rotateStudioBg3dRoomYaw,
  STUDIO_BG3D_ROOM_FURNITURE_KINDS,
  STUDIO_BG3D_ROOM_FURNITURE_LABELS,
  studioBg3dRoomFurnitureParts,
} from "./studio-bg3d-room-furniture";
import {
  buildStudioBg3dRoomParts,
  STUDIO_BG3D_ROOM_FURNITURE_KINDS as KINDS_FROM_BUILDER,
  STUDIO_BG3D_ROOM_FURNITURE_LABELS as LABELS_FROM_BUILDER,
} from "./studio-bg3d-room-builder";

const VALID_KINDS = new Set(Object.keys(PRIMITIVE_DEFS) as BgPrimitiveKind[]);

describe("룸 가구 카탈로그", () => {
  it("기존 아홉 종류의 순서를 그대로 두고 새 네 종류를 뒤에 붙인다", () => {
    expect([...STUDIO_BG3D_ROOM_FURNITURE_KINDS]).toEqual([
      "table",
      "chair",
      "bed",
      "bookshelf",
      "column",
      "stairs",
      "sofa",
      "plant",
      "lamp",
      "deskSet",
      "blackboard",
      "podium",
      "locker",
    ]);
  });

  it("룸 빌더가 같은 목록·이름표를 다시 내보내 기존 가져오기가 그대로 동작한다", () => {
    expect(KINDS_FROM_BUILDER).toBe(STUDIO_BG3D_ROOM_FURNITURE_KINDS);
    expect(LABELS_FROM_BUILDER).toBe(STUDIO_BG3D_ROOM_FURNITURE_LABELS);
  });

  it("모든 종류에 이름표가 있고, 파츠는 유효한 프리미티브·양수 크기·바닥 위 중심을 갖는다", () => {
    for (const kind of STUDIO_BG3D_ROOM_FURNITURE_KINDS) {
      expect(STUDIO_BG3D_ROOM_FURNITURE_LABELS[kind], kind).toBeTruthy();
      const parts = studioBg3dRoomFurnitureParts(kind, 3);
      expect(parts.length, kind).toBeGreaterThan(0);
      for (const part of parts) {
        expect(VALID_KINDS.has(part.kind), `${kind}/${part.name}`).toBe(true);
        expect(part.scale.every((value) => Number.isFinite(value) && value > 0), `${kind}/${part.name}`).toBe(true);
        expect(part.offset[1] - part.scale[1] / 2, `${kind}/${part.name} 바닥 아래로 파고듦`).toBeGreaterThanOrEqual(-1e-9);
        expect(part.name).not.toMatch(/벽체|바닥/u);
      }
    }
  });
});

describe("책걸상 deskSet", () => {
  const parts = studioBg3dRoomFurnitureParts("deskSet", 3);
  const find = (name: string) => parts.filter((part) => part.name === name);
  const top = (part: (typeof parts)[number]) => part.offset[1] + part.scale[1] / 2;

  it("상판 윗면 0.72m, 좌판 윗면 0.455m, 등받이 윗끝 0.835m, 파츠 6개", () => {
    expect(parts).toHaveLength(6);
    expect(top(find("책상 상판")[0])).toBeCloseTo(0.72, 10);
    expect(top(find("의자 좌판")[0])).toBeCloseTo(0.455, 10);
    expect(top(find("의자 등받이")[0])).toBeCloseTo(0.835, 10);
  });

  it("의자는 책상 쪽(+z)을 보고, 좌판 앞끝이 상판 아래로 5cm 들어간다", () => {
    const seat = find("의자 좌판")[0];
    const desk = find("책상 상판")[0];
    const back = find("의자 등받이")[0];
    expect(desk.offset[2]).toBeGreaterThan(seat.offset[2]);
    expect(back.offset[2]).toBeLessThan(seat.offset[2]);
    const seatFront = seat.offset[2] + seat.scale[2] / 2;
    const deskNear = desk.offset[2] - desk.scale[2] / 2;
    expect(seatFront - deskNear).toBeCloseTo(0.05, 10);
    // 좌판 아래 공간(옆판과 겹치지 않음).
    for (const side of find("책상 옆판")) expect(Math.abs(side.offset[0]) - side.scale[0] / 2).toBeGreaterThan(seat.scale[0] / 2);
  });

  it("방에서 yaw 180° 로 놓으면 책상이 반대편(-z)으로 가고 같은 지점에서 의자 위치가 대칭이다", () => {
    const baseSpec = { width: 6, depth: 6, wallHeight: 3, wallThickness: 0.15, openings: [] };
    const forward = buildStudioBg3dRoomParts({ ...baseSpec, furniture: [{ kind: "deskSet", x: 1, z: 1, yawDeg: 0 }] });
    const turned = buildStudioBg3dRoomParts({ ...baseSpec, furniture: [{ kind: "deskSet", x: 1, z: 1, yawDeg: 180 }] });
    const deskOf = (list: typeof forward) => list.find((part) => part.name === "책상 상판")!;
    const seatOf = (list: typeof forward) => list.find((part) => part.name === "의자 좌판")!;
    expect(deskOf(forward).position[2]).toBeGreaterThan(seatOf(forward).position[2]);
    expect(deskOf(turned).position[2]).toBeLessThan(seatOf(turned).position[2]);
    expect(deskOf(forward).position[2] - 1).toBeCloseTo(-(deskOf(turned).position[2] - 1), 10);
    // 문서 정규형 [-π, π) 로 적으므로 180° 는 -π 다(방향 cos = -1 은 같다).
    const turnedSeatYaw = turned.find((part) => part.name === "의자 좌판")!.rotation[1];
    expect(turnedSeatYaw).toBeCloseTo(-Math.PI, 10);
    expect(Math.cos(turnedSeatYaw)).toBeCloseTo(-1, 10);
  });
});

describe("칠판·교탁·사물함", () => {
  it("칠판: 아래끝 0.95m, 폭 3.6m, 높이 1.2m이고 칠판 면이 틀보다 앞에 있다", () => {
    const parts = studioBg3dRoomFurnitureParts("blackboard", 3);
    const frame = parts.find((part) => part.name === "칠판 틀")!;
    const board = parts.find((part) => part.name === "칠판")!;
    expect(frame.offset[1] - frame.scale[1] / 2).toBeCloseTo(0.95, 10);
    expect(frame.scale[0]).toBe(3.6);
    expect(frame.scale[1]).toBe(1.2);
    expect(board.offset[2] - board.scale[2] / 2).toBeGreaterThan(frame.offset[2]);
  });

  it("칠판은 낮은 벽에서 벽 안에 들어오도록 높이를 줄이고, 줄여도 0.3m 보다 작아지지 않는다", () => {
    for (const wallHeight of [1, 1.5, 2, 2.4, 3, 4]) {
      const frame = studioBg3dRoomFurnitureParts("blackboard", wallHeight).find((part) => part.name === "칠판 틀")!;
      expect(frame.scale[1], `벽 ${wallHeight}`).toBeGreaterThanOrEqual(0.3);
      expect(frame.scale[1]).toBeLessThanOrEqual(1.2);
      if (wallHeight >= 2) expect(frame.offset[1] + frame.scale[1] / 2, `벽 ${wallHeight}`).toBeLessThanOrEqual(wallHeight);
    }
  });

  it("교탁: 상판 윗면 0.90m, 폭 1.25m", () => {
    const parts = studioBg3dRoomFurnitureParts("podium", 3);
    const top = parts.find((part) => part.name === "교탁 상판")!;
    expect(top.offset[1] + top.scale[1] / 2).toBeCloseTo(0.9, 10);
    expect(top.scale[0]).toBe(1.25);
  });

  it("사물함: 높이 1.8m(낮은 벽에서는 벽보다 20cm 낮게), 문틈 3개가 앞면에 선다", () => {
    const parts = studioBg3dRoomFurnitureParts("locker", 3);
    const body = parts.find((part) => part.name === "사물함 몸통")!;
    expect(body.scale).toEqual([1.8, 1.8, 0.45]);
    const slits = parts.filter((part) => part.name === "사물함 문틈");
    expect(slits).toHaveLength(3);
    for (const slit of slits) expect(slit.offset[2] + slit.scale[2] / 2).toBeGreaterThan(body.offset[2] + body.scale[2] / 2);
    expect(studioBg3dRoomFurnitureParts("locker", 1.5).find((part) => part.name === "사물함 몸통")!.scale[1]).toBeCloseTo(1.3, 10);
  });
});

describe("rotateStudioBg3dRoomYaw", () => {
  it("yaw 0 은 그대로, 90° 는 +z 를 +x 로, 180° 는 양쪽 부호를 뒤집는다", () => {
    const close = (a: readonly number[], b: readonly number[]) => a.forEach((value, index) => expect(value).toBeCloseTo(b[index], 10));
    close(rotateStudioBg3dRoomYaw([0.3, 0.5, 0.7], 0), [0.3, 0.5, 0.7]);
    close(rotateStudioBg3dRoomYaw([0, 0.5, 1], Math.PI / 2), [1, 0.5, 0]);
    close(rotateStudioBg3dRoomYaw([0.3, 0.5, 0.7], Math.PI), [-0.3, 0.5, -0.7]);
  });
});
