import { describe, expect, it } from "vitest";

import { clampStudioBg3dRoomSpec, STUDIO_BG3D_ROOM_FURNITURE_KINDS } from "./studio-bg3d-room-builder";
import {
  captureStudioBg3dShot,
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import { hydrateStudioBg3dDocumentToRuntime, tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";
import { clampStudioBg3dStreetSpec, studioBg3dStreetFootprintWidth } from "./studio-bg3d-street-builder";
import {
  buildStudioBg3dWebtoonBackground,
  getStudioBg3dWebtoonBackground,
  STUDIO_BG3D_WEBTOON_BACKGROUND_IDS,
  STUDIO_BG3D_WEBTOON_BACKGROUNDS,
} from "./studio-bg3d-webtoon-background-templates";

import type { BgPrimitive } from "../studio-background-3d-metadata";

// 편집기 기본 카메라(studio-bg3d-editor-derivations 의 default 프리셋과 같은 값).
const DEFAULT_CAMERA = { position: [4, 3, 6], target: [0, 0.6, 0] } as const;

function sequentialIds(prefix = "wb"): () => string {
  let next = 0;
  return () => `${prefix}-${next++}`;
}

const build = (id: string, existingCount = 0, options: Parameters<typeof buildStudioBg3dWebtoonBackground>[2] = {}) =>
  buildStudioBg3dWebtoonBackground(id, existingCount, { idFactory: sequentialIds(), ...options })!;

describe("웹툰 배경 카탈로그", () => {
  it("교실·복도·거리 세 항목이 이 순서로 있고 id 조회가 동작한다", () => {
    expect(STUDIO_BG3D_WEBTOON_BACKGROUNDS.map((entry) => entry.id)).toEqual(["classroom", "corridor", "street"]);
    expect([...STUDIO_BG3D_WEBTOON_BACKGROUND_IDS]).toEqual(["classroom", "corridor", "street"]);
    expect(STUDIO_BG3D_WEBTOON_BACKGROUNDS.map((entry) => entry.label)).toEqual(["교실", "복도", "거리"]);
    expect(getStudioBg3dWebtoonBackground("street")?.kind).toBe("street");
    expect(getStudioBg3dWebtoonBackground("classroom")?.kind).toBe("room");
    expect(getStudioBg3dWebtoonBackground("cafe")).toBeNull();
    expect(getStudioBg3dWebtoonBackground(7)).toBeNull();
    expect(buildStudioBg3dWebtoonBackground("cafe", 0)).toBeNull();
  });

  it("방 스펙과 거리 스펙은 각자의 clamp 고정점이다(저장된 값이 곧 렌더되는 값)", () => {
    for (const entry of STUDIO_BG3D_WEBTOON_BACKGROUNDS) {
      if (entry.kind === "room") expect(clampStudioBg3dRoomSpec(entry.spec)).toEqual(entry.spec);
      else expect(clampStudioBg3dStreetSpec(entry.spec)).toEqual(entry.spec);
    }
  });

  it("설명 문구의 수치는 스펙에서 계산한 값이다", () => {
    const classroom = getStudioBg3dWebtoonBackground("classroom")!;
    const corridor = getStudioBg3dWebtoonBackground("corridor")!;
    const street = getStudioBg3dWebtoonBackground("street")!;
    expect(classroom.description).toBe("9×7.5m · 천장 3m · 문 2개 · 창 3개 · 책걸상 12세트 · 칠판·교탁·사물함");
    expect(corridor.description).toBe("15×2.6m · 천장 3m · 문 5개 · 창 4개 · 사물함 3단");
    expect(street.description).toBe("길이 36m · 왕복 2차로 · 보도 2.6m · 건물 6채 · 가로등·가로수·차량");
  });

  it("쓰는 가구 종류는 모두 룸 빌더 카탈로그에 있는 종류다", () => {
    for (const entry of STUDIO_BG3D_WEBTOON_BACKGROUNDS) {
      if (entry.kind !== "room") continue;
      for (const item of entry.spec.furniture) expect(STUDIO_BG3D_ROOM_FURNITURE_KINDS).toContain(item.kind);
    }
  });
});

describe("웹툰 배경 생성", () => {
  it("항목마다 파츠 수가 정해져 있고, 같은 학교 장면(교실 + 복도)은 합쳐도 기본 장면 예산(256개)에 들어간다", () => {
    const counts = Object.fromEntries(
      STUDIO_BG3D_WEBTOON_BACKGROUNDS.map((entry) => [entry.id, build(entry.id).primitives.length]),
    );
    // 2026-10-23: 교실·복도가 빈 구멍 대신 미닫이문·미서기 창·유리문·평천장·걸레받이를 쓰면서 늘었다(99 → 134, 39 → 100).
    // 교실 = 99 + 미닫이문 2 × 5 + 미서기 창 3 × 6 + 걸레받이 6토막 + 천장 1, 복도 = 39 + 미닫이문 4 × 5 + 양문 유리문 7
    // + 미서기 창 4 × 6 + 걸레받이 9토막 + 천장 1. 거리는 그대로다.
    expect(counts).toEqual({ classroom: 134, corridor: 100, street: 96 });
    const budget = DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.budgets.complexity.maxNodes;
    expect(counts.classroom! + counts.corridor!).toBeLessThanOrEqual(budget);
    // 한 배경은 구성기 기본 상한(데스크톱 160, 설계 P2 B4)을 넘지 않는다 — 인물·소품을 더할 여유를 남긴다.
    for (const count of Object.values(counts)) expect(count).toBeLessThanOrEqual(160);
    // 세 배경을 한 장면에 모두 넣으면 기본 예산을 넘는다(아래 시험이 넘친 저장을 거절하는지 고정한다).
    expect(counts.classroom! + counts.corridor! + counts.street!).toBeGreaterThan(budget);
  });

  it("컷 여유: 교실·복도 장면도 컷을 28개 이상 담는다(컷마다 모든 노드 가시성을 저장해 노드 수가 컷 수를 줄인다)", () => {
    for (const id of ["classroom", "corridor"] as const) {
      const adapted = tryAdaptStudioBg3dRuntimeToDocument({
        primitives: build(id).primitives,
        customModels: [],
        attachmentByStorageModelId: new Map(),
        baseDocument: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      });
      if (!adapted.ok) throw new Error(adapted.error.message);
      let document = adapted.value.document;
      let shots = 0;
      for (let index = 0; index < 64; index += 1) {
        const next = captureStudioBg3dShot(document, { id: `shot-${index}`, name: `컷 ${index + 1}` });
        if (!next) break;
        document = next;
        shots += 1;
      }
      // 설계 P2 F4 의 데스크톱 컷 여유 목표(≥ 28). 교실은 37컷 안팎(예전 99노드일 때 49컷).
      expect(shots, id).toBeGreaterThanOrEqual(28);
    }
  });

  it("같은 입력은 같은 결과를 만든다(결정성)", () => {
    for (const entry of STUDIO_BG3D_WEBTOON_BACKGROUNDS) {
      expect(build(entry.id).primitives).toEqual(build(entry.id).primitives);
    }
  });

  it("모든 도형은 고유 id 와 이름을 갖고 서로 배열을 공유하지 않는다 — 하나씩 고르고 고칠 수 있다", () => {
    for (const entry of STUDIO_BG3D_WEBTOON_BACKGROUNDS) {
      const { primitives } = build(entry.id);
      expect(new Set(primitives.map((item) => item.id)).size).toBe(primitives.length);
      for (const item of primitives) {
        expect(item.name, `${entry.id}/${item.id}`).toBeTruthy();
        expect(item.scale.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
        expect(item.position.every(Number.isFinite)).toBe(true);
        // 묶음·잠금·부모 연결이 없는 평범한 노드다.
        expect(item.locked).toBeUndefined();
        expect(item.parentId).toBeUndefined();
        expect(item.linkedSourceId).toBeUndefined();
      }
      const arrays = primitives.flatMap((item) => [item.position, item.rotation, item.scale]);
      expect(new Set(arrays).size).toBe(arrays.length);
      // 한 도형의 배열을 바꿔도 다른 도형은 그대로다.
      const before = JSON.stringify(primitives.slice(1));
      primitives[0].scale[0] = 99;
      primitives[0].position[1] = 99;
      expect(JSON.stringify(primitives.slice(1))).toBe(before);
    }
  });

  it("기존 도형이 있으면 룸 빌더·씬 템플릿과 같은 규약으로 옆으로 밀어 겹치지 않게 한다", () => {
    for (const entry of STUDIO_BG3D_WEBTOON_BACKGROUNDS) {
      const base = build(entry.id, 0);
      const shifted = build(entry.id, 12);
      const width = entry.kind === "room" ? entry.spec.width : studioBg3dStreetFootprintWidth(entry.spec);
      expect(base.anchorX).toBe(0);
      expect(shifted.anchorX).toBeCloseTo(12 * (width / 6), 10);
      shifted.primitives.forEach((item, index) => {
        expect(item.position[0] - base.primitives[index].position[0]).toBeCloseTo(shifted.anchorX, 10);
        expect(item.position[1]).toBe(base.primitives[index].position[1]);
        expect(item.position[2]).toBe(base.primitives[index].position[2]);
      });
    }
  });

  it("자동 단면: 기본 카메라에서 교실·복도는 앞벽(남)만 숨기고 거리는 숨길 벽이 없다", () => {
    const classroom = build("classroom", 0, { autoCutawayCamera: DEFAULT_CAMERA });
    const corridor = build("corridor", 0, { autoCutawayCamera: DEFAULT_CAMERA });
    const street = build("street", 0, { autoCutawayCamera: DEFAULT_CAMERA });
    expect(classroom.hiddenWalls).toEqual(["south"]);
    expect(corridor.hiddenWalls).toEqual(["south"]);
    expect(street.hiddenWalls).toEqual([]);
    for (const result of [classroom, corridor]) {
      const hidden = result.primitives.filter((item) => item.visible === false);
      expect(hidden.length).toBeGreaterThan(0);
      // 앞벽 벽체와 함께 그 벽에 붙은 창틀·창짝·걸레받이도 숨는다(벽만 숨기면 창이 허공에 뜬다).
      expect(hidden.some((item) => item.name === "앞벽 벽체")).toBe(true);
      expect(hidden.every((item) => item.name?.startsWith("앞벽 "))).toBe(true);
      // 기본 카메라는 천장 높이(3m)에서 보므로 천장은 남긴다.
      expect(result.primitives.find((item) => item.name === "천장")?.visible).not.toBe(false);
    }
    expect(street.primitives.some((item) => item.visible === false)).toBe(false);
    // 단면을 켜도 파츠 수는 같다 — 숨길 뿐 지우지 않는다.
    expect(classroom.primitives).toHaveLength(build("classroom").primitives.length);
  });

  it("자동 단면을 주지 않으면 어떤 도형도 숨기지 않는다", () => {
    for (const entry of STUDIO_BG3D_WEBTOON_BACKGROUNDS) {
      const result = build(entry.id);
      expect(result.hiddenWalls).toEqual([]);
      expect(result.primitives.some((item) => item.visible === false)).toBe(false);
    }
  });
});

const unsignedZero = (values: readonly number[]): number[] => values.map((value) => value + 0);

describe("웹툰 배경은 일반 도형으로 저장·복원된다", () => {
  function roundTrip(primitives: readonly BgPrimitive[]): BgPrimitive[] {
    const adapted = tryAdaptStudioBg3dRuntimeToDocument({
      primitives,
      customModels: [],
      attachmentByStorageModelId: new Map(),
      baseDocument: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    });
    if (!adapted.ok) throw new Error(`문서 변환 실패: ${adapted.error.message}`);
    const saved = serializeStudioBg3dSceneDocument(adapted.value.document);
    expect(saved).not.toBeNull();
    const reopened = parseStudioBg3dSceneDocument(saved!);
    expect(reopened).not.toBeNull();
    const hydrated = hydrateStudioBg3dDocumentToRuntime({ document: reopened!, storageModelIdByAttachmentId: new Map() });
    expect(hydrated.ok).toBe(true);
    expect(hydrated.counts.droppedPrimitives).toBe(0);
    return hydrated.primitives;
  }

  it.each(STUDIO_BG3D_WEBTOON_BACKGROUND_IDS.map((id) => [id] as const))(
    "%s: 저장 후 다시 열어도 도형 수·id·이름·위치·색이 그대로다",
    (id) => {
      const { primitives } = build(id, 0, { autoCutawayCamera: DEFAULT_CAMERA });
      const reopened = roundTrip(primitives);
      expect(reopened).toHaveLength(primitives.length);
      reopened.forEach((item, index) => {
        const original = primitives[index];
        expect(item.id).toBe(original.id);
        expect(item.name).toBe(original.name);
        expect(item.kind).toBe(original.kind);
        expect(item.color).toBe(original.color);
        // JSON 저장은 -0 을 0 으로 적는다(수치는 같다). 비교는 부호 없는 0 으로 맞춘다.
        expect(unsignedZero(item.position)).toEqual(unsignedZero(original.position));
        expect(unsignedZero(item.scale)).toEqual(unsignedZero(original.scale));
        // 문서는 각도를 (-π, π] 로 정규화한다: 책걸상 yaw 180° 는 π 에서 -π 로 적히지만 같은 방향이다.
        item.rotation.forEach((angle, axis) => {
          expect(Math.abs(Math.sin((angle - original.rotation[axis]) / 2))).toBeLessThan(1e-9);
        });
        // 숨긴 벽은 숨김 그대로, 나머지는 보임 그대로.
        expect(item.visible).toBe(original.visible !== false);
      });
    },
  );

  function buildTogether(ids: readonly string[]): BgPrimitive[] {
    const all: BgPrimitive[] = [];
    for (const id of ids) {
      const result = buildStudioBg3dWebtoonBackground(id, all.length, { idFactory: sequentialIds(id) })!;
      all.push(...result.primitives);
    }
    return all;
  }

  it("같은 학교 장면(교실 + 복도)을 함께 넣어도 문서가 받아들이고 도형 id 가 겹치지 않는다", () => {
    const all = buildTogether(["classroom", "corridor"]);
    expect(new Set(all.map((item) => item.id)).size).toBe(all.length);
    expect(roundTrip(all)).toHaveLength(all.length);
  });

  it("세 배경을 모두 넣어 기본 예산을 넘으면 문서 변환이 일부만 저장하지 않고 예산 초과로 거절한다", () => {
    const all = buildTogether(["classroom", "corridor", "street"]);
    expect(new Set(all.map((item) => item.id)).size).toBe(all.length);
    const adapted = tryAdaptStudioBg3dRuntimeToDocument({
      primitives: all,
      customModels: [],
      attachmentByStorageModelId: new Map(),
      baseDocument: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    });
    expect(adapted.ok).toBe(false);
    if (!adapted.ok) expect(adapted.error.code).toBe("node-budget-exceeded");
  });
});
