import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addStudioRigChild,
  readStudioRigFile,
  studioRigJoints,
  writeStudioRigFile,
  type StudioRigFile,
} from "./studio-asset3d-rig-file";
import {
  planStudioRigWeightTransfer,
  readStudioRigWeightRegion,
  studioRigWeightRegions,
} from "./studio-asset3d-rig-weights";

const bytes = readFileSync("apps/web/public/models/mannequin/toonstudio_ecorche_mannequin_v3.glb");
function fixture(joints: number[], weights: number[], shared = false, interleaved = false): StudioRigFile {
  const j = [0, 1, 2, 3, 4].map((i) => ({ name: `bone${i}` }));
  const primitive = { attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 } };
  const count = joints.length / 4,
    n = count * 4,
    binary = new Uint8Array(12 * count + n * 2);
  if (interleaved) {
    for (let i = 0; i < count; i++) {
      binary.set(joints.slice(i * 4, i * 4 + 4), 12 * count + i * 8);
      binary.set(weights.slice(i * 4, i * 4 + 4), 12 * count + i * 8 + 4);
    }
  } else {
    binary.set(joints, 12 * count);
    binary.set(weights, 12 * count + n);
  }
  return {
    binary,
    json: {
      asset: { version: "2.0" },
      buffers: [{ byteLength: binary.length }],
      bufferViews: [
        { buffer: 0, byteLength: 12 * count },
        ...(interleaved
          ? [{ buffer: 0, byteOffset: 12 * count, byteLength: n * 2, byteStride: 8 }]
          : [
              { buffer: 0, byteOffset: 12 * count, byteLength: n },
              { buffer: 0, byteOffset: 12 * count + n, byteLength: n },
            ]),
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, type: "VEC3", count },
        { bufferView: 1, componentType: 5121, type: "VEC4", count },
        {
          bufferView: interleaved ? 1 : 2,
          ...(interleaved ? { byteOffset: 4 } : {}),
          componentType: 5121,
          normalized: true,
          type: "VEC4",
          count,
        },
      ],
      nodes: [...j, { name: "skin", mesh: 0, skin: 0 }],
      skins: [{ joints: [0, 1, 2, 3, 4] }],
      meshes: [{ name: "표면", primitives: shared ? [primitive, structuredClone(primitive)] : [primitive] }],
      scenes: [{ nodes: [0, 1, 2, 3, 4, 5] }],
      scene: 0,
    },
  };
}
function first(model: StudioRigFile, index = 0) {
  const region = studioRigWeightRegions(model, 0)[index];
  if (!region) throw new Error("missing region");
  return readStudioRigWeightRegion(model, 0, region);
}
function vertex(model: StudioRigFile, region = 0) {
  const stream = first(model, region).streams[0];
  if (!stream) throw new Error("missing skin");
  return Array.from({ length: 4 }, (_, i) => [stream.j.get(0, i), stream.w.get(0, i)]);
}

describe("실제 GLB 스킨 웨이트 옮기기", () => {
  it("데생인형 왼손 바닥의 일부를 방금 만든 52번째 관절에 연결해 내보내고 다른 표면·정점·재질을 보존한다", () => {
    const original = readStudioRigFile(bytes),
      left = studioRigJoints(original, 0).find((j) => j.name === "leftHand")!;
    const model = addStudioRigChild(original, 0, left.id),
      child = studioRigJoints(model, 0).at(-1)!;
    const region = studioRigWeightRegions(model, 0).find((r) => r.name.includes("Hand_Palm_L"))!;
    const before = readStudioRigWeightRegion(model, 0, region),
      plan = planStudioRigWeightTransfer(before, left.id, child.id, 40);
    expect(plan.affected).toBeGreaterThan(0);
    expect(plan.blocked).toBe(0);
    const edited = plan.apply(),
      reopened = readStudioRigFile(writeStudioRigFile(edited)),
      after = readStudioRigWeightRegion(reopened, 0, region);
    const d = before.joints.findIndex((j) => j.id === left.id),
      t = before.joints.findIndex((j) => j.id === child.id);
    const b = before.streams[0]!,
      a = after.streams[0]!;
    expect(before.influenced[t]).toBe(0);
    expect(after.influenced[t]).toBe(plan.affected);
    let max = 0;
    for (let v = 0; v < after.count; v++) {
      const weights = (s: typeof a, slot: number) =>
        [0, 1, 2, 3].reduce((n, l) => n + (s.j.get(v, l) === slot ? s.w.get(v, l) : 0), 0);
      max = Math.max(
        max,
        Math.abs(weights(a, t) - weights(b, d) * 0.4),
        Math.abs(weights(a, d) - weights(b, d) * 0.6),
      );
    }
    expect(max).toBeLessThan(1e-6);
    expect(reopened.json.meshes).toEqual(model.json.meshes);
    expect(reopened.json.materials).toEqual(model.json.materials);
    expect(reopened.json.skins).toEqual(model.json.skins);
    const allowed = (i: number) => [b.j, b.w].some((s) => i >= s.start && i < s.start + s.count * s.stride);
    let other = 0;
    for (let i = 0; i < edited.binary.length; i++) if (edited.binary[i] !== model.binary[i] && !allowed(i)) other++;
    expect(other).toBe(0);
    expect(edited.binary.length).toBe(model.binary.length);
  });
  it("공유·인터리브 접근자는 별도 사본에 기록하고 정수 웨이트의 합 255와 이웃 표면을 보존한다", () => {
    const model = fixture([0, 1, 0, 0], [150, 105, 0, 0], true, true);
    const result = planStudioRigWeightTransfer(first(model), 0, 4, 50).apply();
    expect(vertex(result)).toEqual([
      [0, 75],
      [1, 105],
      [4, 75],
      [0, 0],
    ]);
    expect(vertex(result, 1)).toEqual(vertex(model, 1));
    expect(Buffer.compare(result.binary.subarray(0, model.binary.length), model.binary)).toBe(0);
  });
  it("빈 슬롯이 없는 정점에 대한 일부 이전은 원본을 보존하고 100% 이전과 이미 있는 대상은 허용한다", () => {
    const m = fixture([0, 1, 2, 3], [140, 50, 40, 25]);
    const blocked = planStudioRigWeightTransfer(first(m), 0, 4, 50);
    expect(blocked.blocked).toBe(1);
    expect(() => blocked.apply()).toThrow("빈 본 슬롯");
    expect(vertex(planStudioRigWeightTransfer(first(m), 0, 4, 100).apply())).toEqual([
      [4, 140],
      [1, 50],
      [2, 40],
      [3, 25],
    ]);
    expect(vertex(planStudioRigWeightTransfer(first(m), 0, 1, 50).apply())).toEqual([
      [0, 70],
      [1, 120],
      [2, 40],
      [3, 25],
    ]);
  });
  it("8개 영향 중 두 번째 세트의 대상도 찾아 이웃 슬롯을 유지한다", () => {
    const m = fixture([0, 1, 0, 0], [128, 0, 0, 0]);
    const g = m.json;
    const expanded = {
      ...m,
      json: {
        ...g,
        buffers: [{ byteLength: 28 }],
        bufferViews: [
          ...(g.bufferViews as object[]),
          { buffer: 0, byteOffset: 20, byteLength: 4 },
          { buffer: 0, byteOffset: 24, byteLength: 4 },
        ],
        accessors: [
          ...(g.accessors as object[]),
          { bufferView: 3, componentType: 5121, type: "VEC4", count: 1 },
          { bufferView: 4, componentType: 5121, normalized: true, type: "VEC4", count: 1 },
        ],
        meshes: [
          { primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2, JOINTS_1: 3, WEIGHTS_1: 4 } }] },
        ],
      },
      binary: new Uint8Array(28),
    };
    expanded.binary.set(m.binary);
    expanded.binary.set([4, 0, 0, 0, 127, 0, 0, 0], 20);
    const out = first(planStudioRigWeightTransfer(first(expanded), 0, 4, 50).apply());
    expect(out.streams[0]?.w.get(0, 0)).toBe(64);
    expect(out.streams[1]?.w.get(0, 0)).toBe(191);
  });
  it("비율·본 참조·정규화·버퍼 범위와 다른 스킨 인스턴스는 적용 전에 진단한다", () => {
    const m = fixture([0, 1, 0, 0], [105, 150, 0, 0]);
    for (const percent of [0, 101, NaN, 1.5])
      expect(() => planStudioRigWeightTransfer(first(m), 0, 4, percent)).toThrow("1~100");
    expect(() => planStudioRigWeightTransfer(first(m), 0, 0, 50)).toThrow("두 관절");
    expect(() => first(fixture([0, 1, 0, 0], [25, 30, 0, 0]))).toThrow("정규화");
    expect(() => first(fixture([8, 1, 0, 0], [105, 150, 0, 0]))).toThrow("본 번호");
    expect(() => first({ ...m, binary: m.binary.slice(0, -1) })).toThrow("범위");
    expect(() =>
      first({ ...m, json: { ...m.json, nodes: [...(m.json.nodes as object[]), { skin: 1, mesh: 0 }] } }),
    ).toThrow("공유");
  });
  it("256을 넘는 보조 본은 선택한 조인트 스트림만 16비트로 확장한다", () => {
    const f = fixture([0, 1, 0, 0], [200, 55, 0, 0]);
    const nodes = Array.from({ length: 257 }, (_, i) => ({ name: `bone-${i}` }));
    const m = {
      ...f,
      json: { ...f.json, nodes: [...nodes, { skin: 0, mesh: 0 }], skins: [{ joints: nodes.map((_, i) => i) }] },
    };
    const updated = planStudioRigWeightTransfer(first(m), 0, 256, 25).apply();
    expect(first(updated).streams[0]?.j.bytes).toBe(2);
    expect(vertex(updated)).toEqual([
      [0, 150],
      [1, 55],
      [256, 50],
      [0, 0],
    ]);
    expect(vertex(m)).toEqual([
      [0, 200],
      [1, 55],
      [0, 0],
      [0, 0],
    ]);
  });
});
