// 방 만들기(studio-bg3d-room-builder.ts)가 쓰는 가구 카탈로그 — 종류·이름표·파츠 팩토리.
// 룸 빌더 본체가 800줄 한도에 가까워져 가구만 따로 뺐다. 룸 빌더가 같은 이름으로 다시 내보내므로
// 기존 가져오기 경로는 그대로 쓸 수 있다.
//
// 좌표 계약: 각 가구는 자기 중심(바닥 위)을 원점으로, 앞면이 +z, 위가 +y 다. 파츠는 모두 yaw(월드 Y)
// 회전만 쓰므로 배치할 때 오프셋을 yaw 만큼 돌리고 rotation[1] 에 yaw 를 더하면 정확하다.

import type { BgPrimitiveKind } from "../studio-background-3d-metadata";

export const STUDIO_BG3D_ROOM_FURNITURE_KINDS = [
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
] as const;
export type StudioBg3dRoomFurnitureKind = (typeof STUDIO_BG3D_ROOM_FURNITURE_KINDS)[number];

export const STUDIO_BG3D_ROOM_FURNITURE_LABELS: Record<StudioBg3dRoomFurnitureKind, string> = {
  table: "테이블",
  chair: "의자",
  bed: "침대",
  bookshelf: "책장",
  column: "기둥",
  stairs: "계단",
  sofa: "소파",
  plant: "화분",
  lamp: "스탠드 조명",
  deskSet: "책걸상",
  blackboard: "칠판",
  podium: "교탁",
  locker: "사물함",
};

// ── 가구 파츠 팩토리(yaw-only) ───────────────────────────────────────────────

export interface StudioBg3dRoomFurniturePart {
  readonly kind: BgPrimitiveKind;
  readonly name: string;
  readonly offset: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly color: string;
}

export function studioBg3dRoomFurnitureParts(
  kind: StudioBg3dRoomFurnitureKind,
  wallHeight: number,
): StudioBg3dRoomFurniturePart[] {
  switch (kind) {
    case "table":
      return [
        { kind: "box", name: "테이블 상판", offset: [0, 0.72, 0], scale: [1.4, 0.06, 0.8], color: "#8a6b4a" },
        { kind: "box", name: "테이블 다리", offset: [-0.6, 0.345, -0.3], scale: [0.08, 0.69, 0.08], color: "#5c4632" },
        { kind: "box", name: "테이블 다리", offset: [0.6, 0.345, -0.3], scale: [0.08, 0.69, 0.08], color: "#5c4632" },
        { kind: "box", name: "테이블 다리", offset: [-0.6, 0.345, 0.3], scale: [0.08, 0.69, 0.08], color: "#5c4632" },
        { kind: "box", name: "테이블 다리", offset: [0.6, 0.345, 0.3], scale: [0.08, 0.69, 0.08], color: "#5c4632" },
      ];
    case "chair":
      return [
        { kind: "box", name: "의자 좌판", offset: [0, 0.44, 0], scale: [0.42, 0.06, 0.42], color: "#6b4a37" },
        { kind: "box", name: "의자 다리", offset: [0, 0.205, 0], scale: [0.34, 0.41, 0.34], color: "#7a5a44" },
        { kind: "box", name: "의자 등받이", offset: [0, 0.72, -0.18], scale: [0.42, 0.5, 0.06], color: "#6b4a37" },
      ];
    case "bed":
      return [
        { kind: "box", name: "침대 프레임", offset: [0, 0.25, 0], scale: [1.2, 0.3, 2.1], color: "#6b4a6a" },
        { kind: "box", name: "침대 매트리스", offset: [0, 0.47, 0.05], scale: [1.1, 0.16, 1.9], color: "#e8dce8" },
        { kind: "box", name: "침대 헤드보드", offset: [0, 0.68, -1.0], scale: [1.2, 0.56, 0.12], color: "#5a3a5a" },
      ];
    case "bookshelf":
      return [
        { kind: "box", name: "책장 몸통", offset: [0, 0.9, 0], scale: [0.9, 1.8, 0.32], color: "#8a6b4a" },
        { kind: "box", name: "책장 선반", offset: [0, 0.62, 0.05], scale: [0.78, 0.05, 0.24], color: "#5c4632" },
        { kind: "box", name: "책장 선반", offset: [0, 1.18, 0.05], scale: [0.78, 0.05, 0.24], color: "#5c4632" },
      ];
    case "column": {
      const height = Math.max(0.5, wallHeight);
      return [
        // cylinder 기본 반지름 0.3(CylinderGeometry(0.3, ...)) → scale.x 0.6이면 실제 반지름 0.18m.
        { kind: "cylinder", name: "기둥", offset: [0, height / 2, 0], scale: [0.6, height, 0.6], color: "#c8c2b4" },
      ];
    }
    case "stairs": {
      const stepCount = 6;
      const stepRise = 0.2;
      const stepRun = 0.3;
      const stepWidth = 1.1;
      const parts: StudioBg3dRoomFurniturePart[] = [];
      for (let index = 0; index < stepCount; index += 1) {
        // 계단은 겹침 없는 "층층 박스": index번째 칸은 바닥부터 (index+1)*rise까지 차오른다 —
        // 옆에서 본 단면이 정확한 계단 모양이고, 섹션 컷과 선화 추출에서도 깨끗한 단이 나온다.
        const height = stepRise * (index + 1);
        parts.push({
          kind: "box",
          name: `계단 ${index + 1}단`,
          offset: [0, height / 2, stepRun * index - (stepRun * (stepCount - 1)) / 2],
          scale: [stepWidth, height, stepRun],
          color: "#b0a894",
        });
      }
      return parts;
    }
    case "sofa":
      return [
        { kind: "box", name: "소파 하부", offset: [0, 0.22, 0], scale: [1.7, 0.24, 0.85], color: "#5a6a7a" },
        { kind: "box", name: "소파 좌석", offset: [-0.4, 0.42, 0], scale: [0.8, 0.16, 0.78], color: "#6b7b8b" },
        { kind: "box", name: "소파 좌석", offset: [0.4, 0.42, 0], scale: [0.8, 0.16, 0.78], color: "#6b7b8b" },
        { kind: "box", name: "소파 등받이", offset: [0, 0.62, -0.32], scale: [1.7, 0.56, 0.2], color: "#5a6a7a" },
        { kind: "box", name: "소파 팔걸이", offset: [-0.79, 0.48, 0], scale: [0.12, 0.34, 0.85], color: "#4e5e6e" },
        { kind: "box", name: "소파 팔걸이", offset: [0.79, 0.48, 0], scale: [0.12, 0.34, 0.85], color: "#4e5e6e" },
      ];
    case "plant":
      return [
        // cylinder 기본 반지름 0.3 → scale.x 0.9면 화분 반지름 ≈0.27m.
        { kind: "cylinder", name: "화분 몸통", offset: [0, 0.19, 0], scale: [0.9, 0.38, 0.9], color: "#a4643f" },
        { kind: "sphere", name: "화분 잎", offset: [0, 0.72, 0], scale: [1.4, 1.2, 1.4], color: "#4a7a3a" },
      ];
    case "lamp":
      return [
        { kind: "cylinder", name: "조명 베이스", offset: [0, 0.02, 0], scale: [1.2, 0.04, 1.2], color: "#3a3a42" },
        { kind: "cylinder", name: "조명 폴", offset: [0, 0.75, 0], scale: [0.16, 1.44, 0.16], color: "#3a3a42" },
        { kind: "cone", name: "조명 갓", offset: [0, 1.56, 0], scale: [1.2, 0.5, 1.2], color: "#e8dcc8" },
      ];
    // ── 학교·복도용 가구(웹툰 배경 교실·복도가 쓴다) ───────────────────────────────
    // 모두 "앞면이 +z" 규약을 따른다: yaw 0 이면 앉은 학생·칠판 앞면이 남쪽(+z)을 본다. 수치는 사람 키 1.6m
    // 기준 눈금(STUDIO_BG3D_SCALE_GUIDE_HEIGHT_M)에 맞춘 값이며, 허용 범위는 웹툰 배경 사람 크기 테스트가 고정한다.
    case "deskSet":
      // 학생 책걸상 한 세트. 의자는 책상 쪽(+z)을 보고 좌판 앞 끝이 상판 아래로 5cm 들어간다.
      // 상판 윗면 0.72m, 좌판 윗면 0.455m(차 0.265m), 등받이 윗끝 0.835m.
      return [
        { kind: "box", name: "책상 상판", offset: [0, 0.7, 0.225], scale: [0.6, 0.04, 0.45], color: "#d9c9a3" },
        { kind: "box", name: "책상 옆판", offset: [-0.28, 0.34, 0.225], scale: [0.04, 0.68, 0.4], color: "#8a7a5a" },
        { kind: "box", name: "책상 옆판", offset: [0.28, 0.34, 0.225], scale: [0.04, 0.68, 0.4], color: "#8a7a5a" },
        { kind: "box", name: "의자 좌판", offset: [0, 0.43, -0.15], scale: [0.4, 0.05, 0.4], color: "#5f7fa8" },
        { kind: "box", name: "의자 다리", offset: [0, 0.2025, -0.15], scale: [0.3, 0.405, 0.3], color: "#4a4a52" },
        { kind: "box", name: "의자 등받이", offset: [0, 0.645, -0.33], scale: [0.4, 0.38, 0.04], color: "#5f7fa8" },
      ];
    case "blackboard": {
      // 벽걸이 칠판: 틀 아래끝 0.95m, 폭 3.6m, 높이 1.2m(낮은 벽에서는 벽 안에 들어오게 줄인다).
      // 뒷면이 벽에 닿도록 z=-0.025 를 벽 안쪽 면에 맞춰 배치하면 된다.
      const boardHeight = Math.max(0.3, Math.min(1.2, wallHeight - 1.1));
      const centerY = 0.95 + boardHeight / 2;
      return [
        { kind: "box", name: "칠판 틀", offset: [0, centerY, 0], scale: [3.6, boardHeight, 0.05], color: "#8a6b4a" },
        { kind: "box", name: "칠판", offset: [0, centerY, 0.03], scale: [3.4, boardHeight - 0.2, 0.02], color: "#25462c" },
        { kind: "box", name: "칠판 턱", offset: [0, 0.97, 0.07], scale: [3.4, 0.04, 0.08], color: "#8a6b4a" },
      ];
    }
    case "podium":
      // 교탁: 상판 윗면 0.90m, 폭 1.25m, 깊이 0.65m.
      return [
        { kind: "box", name: "교탁 몸통", offset: [0, 0.43, 0], scale: [1.1, 0.86, 0.55], color: "#8a6b4a" },
        { kind: "box", name: "교탁 상판", offset: [0, 0.88, 0], scale: [1.25, 0.04, 0.65], color: "#a58660" },
      ];
    case "locker": {
      // 사물함 한 단(폭 1.8m = 4칸, 깊이 0.45m, 높이 1.8m). 칸 사이 문틈은 얇은 어두운 띠로 표현한다.
      const height = Math.max(0.5, Math.min(1.8, wallHeight - 0.2));
      return [
        { kind: "box", name: "사물함 몸통", offset: [0, height / 2, 0], scale: [1.8, height, 0.45], color: "#8aa0b4" },
        ...[-0.45, 0, 0.45].map((x): StudioBg3dRoomFurniturePart => ({
          kind: "box",
          name: "사물함 문틈",
          offset: [x, height / 2, 0.23],
          scale: [0.02, height - 0.1, 0.02],
          color: "#4a5a6a",
        })),
      ];
    }
  }
}

export function rotateStudioBg3dRoomYaw(offset: readonly [number, number, number], yawRad: number): readonly [number, number, number] {
  const cos = Math.cos(yawRad);
  const sin = Math.sin(yawRad);
  return [offset[0] * cos + offset[2] * sin, offset[1], -offset[0] * sin + offset[2] * cos];
}

