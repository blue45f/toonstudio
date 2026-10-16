// 방 파츠의 회전값은 장면 문서의 정규형([-π, π))이어야 한다.
//
// 배경: 의자 방향을 테이블 쪽으로 바로잡으면서(yaw 180°) 파츠 회전이 정확히 π 가 됐다. 장면 문서는
// 각도를 [-π, π) 로 정규화해 저장하므로 π 는 -π 로 바뀐다. 엄격 정규화를 쓰는 captureStudioBg3dShot 은
// "정규화하면 달라지는 문서"를 거부한다 — 그래서 hybrid-dcc 핸드오프가 방 프리셋을 절차 브리지로 풀어
// 파츠 회전을 그대로 복사한 뒤 컷을 만들 때 "Could not capture DCC shot" 으로 실패했다(교실 프리셋 먼저,
// 기준 브랜치의 카페·원룸·옥상·서재에도 잠재해 있던 결함이다).
// 이 시험은 그 경로(방 파츠 → 문서 노드 → 엄격 컷 포착)를 핸드오프 없이 직접 고정한다.

import { describe, expect, it } from "vitest";

import {
  buildStudioBg3dRoomParts,
  canonicalStudioBg3dRoomYaw,
  STUDIO_BG3D_ROOM_FURNITURE_KINDS,
  STUDIO_BG3D_ROOM_PRESETS,
} from "./studio-bg3d-room-builder";
import { captureStudioBg3dShot, DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";

import type { StudioBg3dRoomFurnitureItem, StudioBg3dRoomPart } from "./studio-bg3d-room-builder";

/** 문서 정규화(normalizedRotation)와 같은 식을 시험 안에서 따로 적은 기준 구현. */
function documentWrap(angle: number): number {
  return ((((angle + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}

/** hybrid-dcc 핸드오프가 절차 방 파츠를 문서 노드로 만드는 모양(파츠 값을 그대로 복사)과 같다. */
function rawDocumentFromParts(parts: readonly StudioBg3dRoomPart[]) {
  return {
    ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    nodes: parts.map((part, index) => ({
      id: `room-part-${index}`,
      name: part.name,
      kind: "primitive" as const,
      primitiveKind: part.kind,
      color: part.color,
      transform: {
        position: [...part.position],
        rotation: [...part.rotation],
        scale: [...part.scale],
      },
      parentId: null,
      visible: true,
      locked: false,
      castsShadow: true,
      receivesShadow: true,
    })),
  };
}

const capture = (parts: readonly StudioBg3dRoomPart[]) =>
  captureStudioBg3dShot(rawDocumentFromParts(parts), { id: "cut-a", name: "컷 A" });

const ROOM = { width: 10, depth: 10, wallHeight: 3, wallThickness: 0.15, openings: [] } as const;
const oneOfEachKind = (yawDeg: number): StudioBg3dRoomFurnitureItem[] =>
  STUDIO_BG3D_ROOM_FURNITURE_KINDS.map((kind, index) => ({ kind, x: (index % 5) - 2, z: Math.floor(index / 5) - 1, yawDeg }));

describe("방 파츠 회전의 문서 정규형", () => {
  it("canonicalStudioBg3dRoomYaw: π 는 -π, 270° 는 -90° 로 적고 값이 더 바뀌지 않는 고정점이다", () => {
    expect(canonicalStudioBg3dRoomYaw(Math.PI)).toBe(-Math.PI);
    expect(canonicalStudioBg3dRoomYaw(-Math.PI)).toBe(-Math.PI);
    expect(canonicalStudioBg3dRoomYaw(0)).toBe(0);
    expect(canonicalStudioBg3dRoomYaw((270 * Math.PI) / 180)).toBeCloseTo(-Math.PI / 2, 12);
    expect(canonicalStudioBg3dRoomYaw(Number.NaN)).toBe(0);
    expect(canonicalStudioBg3dRoomYaw(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("정수 도(-360~360) 전체: [-π, π) 안이고, 문서 정규화를 한 번 더 해도 그대로이며, 방향(cos·sin)이 같다", () => {
    for (let degrees = -360; degrees <= 360; degrees += 1) {
      const radians = (degrees * Math.PI) / 180;
      const canonical = canonicalStudioBg3dRoomYaw(radians);
      expect(canonical >= -Math.PI && canonical < Math.PI, `${degrees}°`).toBe(true);
      expect(documentWrap(canonical), `${degrees}° 고정점`).toBe(canonical);
      expect(Math.cos(canonical), `${degrees}° cos`).toBeCloseTo(Math.cos(radians), 9);
      expect(Math.sin(canonical), `${degrees}° sin`).toBeCloseTo(Math.sin(radians), 9);
    }
  });

  it("가구 파츠 회전은 도 단위 yaw 전체에서 문서 정규형이고 위치는 원래 각도로 돌린 값이다", () => {
    const seatAt = (yawDeg: number) =>
      buildStudioBg3dRoomParts({ ...ROOM, furniture: [{ kind: "chair", x: 1, z: 1, yawDeg }] }).find(
        (part) => part.name === "의자 좌판",
      )!;
    const unrotated = seatAt(0);
    const dx = unrotated.position[0] - 1;
    const dz = unrotated.position[2] - 1;
    for (let degrees = -360; degrees <= 360; degrees += 1) {
      const seat = seatAt(degrees);
      expect(documentWrap(seat.rotation[1]), `${degrees}°`).toBe(seat.rotation[1]);
      // 회전값만 정규형으로 바꿨을 뿐 배치는 원래 각도로 돌린 위치와 같다.
      const radians = (degrees * Math.PI) / 180;
      expect(seat.position[0] - 1, `${degrees}° x`).toBeCloseTo(dx * Math.cos(radians) + dz * Math.sin(radians), 9);
      expect(seat.position[2] - 1, `${degrees}° z`).toBeCloseTo(-dx * Math.sin(radians) + dz * Math.cos(radians), 9);
    }
  });
});

describe("방 파츠 → 문서 노드 → 엄격 컷 포착(hybrid-dcc 절차 브리지 경로)", () => {
  it("모든 방 프리셋(6종)의 파츠가 captureStudioBg3dShot 을 통과한다", () => {
    expect(STUDIO_BG3D_ROOM_PRESETS.map((preset) => preset.id)).toEqual([
      "classroom",
      "cafe",
      "studio-flat",
      "corridor",
      "rooftop",
      "study",
    ]);
    for (const preset of STUDIO_BG3D_ROOM_PRESETS) {
      const parts = buildStudioBg3dRoomParts(preset.spec);
      for (const part of parts) {
        expect(documentWrap(part.rotation[1]), `${preset.id} ${part.name}`).toBe(part.rotation[1]);
      }
      const captured = capture(parts);
      expect(captured, `${preset.id} 컷 포착`).not.toBeNull();
      expect(captured!.nodes).toHaveLength(parts.length);
    }
  });

  it("검사기는 정규형이 아닌 회전(정확히 π)을 실제로 거부한다(결함을 되살린 합성 대조군)", () => {
    const classroom = STUDIO_BG3D_ROOM_PRESETS.find((preset) => preset.id === "classroom")!;
    const parts = buildStudioBg3dRoomParts(classroom.spec);
    expect(capture(parts)).not.toBeNull();
    const turnedIndex = parts.findIndex((part) => part.rotation[1] !== 0);
    expect(turnedIndex).toBeGreaterThanOrEqual(0);
    const withRawPi = parts.map((part, index): StudioBg3dRoomPart =>
      index === turnedIndex ? { ...part, rotation: [0, Math.PI, 0] } : part,
    );
    expect(capture(withRawPi)).toBeNull();
  });

  it("가구 13종 × 대표 yaw 에서 모든 파츠가 컷 포착을 통과한다(90° 배수와 15° 배수·음수 포함)", () => {
    const yaws = [0, 90, 180, 270, 360, -90, -180, -270, -360, 15, -15, 45, 135, 195, -195, 225, -225, 345];
    for (const yawDeg of yaws) {
      const parts = buildStudioBg3dRoomParts({ ...ROOM, furniture: oneOfEachKind(yawDeg) });
      expect(capture(parts), `yaw ${yawDeg}°`).not.toBeNull();
    }
  });

  it("정규형으로 적어도 의자가 보는 방향은 그대로다(180° 의자 = 회전 -π, 앞면 +z 가 -z 를 향한다)", () => {
    const [seat] = buildStudioBg3dRoomParts({ ...ROOM, furniture: [{ kind: "chair", x: 0, z: 0, yawDeg: 180 }] }).filter(
      (part) => part.name === "의자 좌판",
    );
    const yaw = seat!.rotation[1];
    expect(yaw).toBe(-Math.PI);
    // 앞면(+z)을 yaw 만큼 돌린 방향 = (sin yaw, cos yaw).
    expect(Math.sin(yaw)).toBeCloseTo(0, 12);
    expect(Math.cos(yaw)).toBeCloseTo(-1, 12);
  });
});
