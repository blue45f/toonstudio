import { Group } from "three";
import { describe, expect, it, vi } from "vitest";

import { readStudioBg3dSkpSceneSource, writeStudioBg3dSkpSceneSourceToGlb } from "./studio-bg3d-skp-scene-provenance";
import { unavailableStudioBg3dSkpSceneSource } from "./studio-bg3d-skp-scene-source";
import { markStudioBg3dSkpMetricImport, readStudioBg3dSkpMetricImport } from "./studio-bg3d-skp-metric-provenance";
import { createSyntheticGlb, readGlbJson } from "./studio-bg3d-skp.test-fixture";

function isUnknownArray(value: unknown): value is readonly unknown[] { return Array.isArray(value); }
function firstScene(json: Record<string, unknown>): Record<string, unknown> {
  const scenes = json.scenes;
  const scene = isUnknownArray(scenes) ? scenes[0] : undefined;
  if (typeof scene !== "object" || scene === null || Array.isArray(scene)) throw new Error("테스트 GLB 장면이 없습니다.");
  return Object.fromEntries(Object.entries(scene));
}

function binChunk(glb: Uint8Array): Uint8Array {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const offset = 20 + view.getUint32(12, true);
  return glb.slice(offset);
}

describe("장면 출처 GLB 보존과 검증된 reader", () => {
  it("원본 BIN·형상 JSON·다른 extras를 바꾸지 않고 출처와 상태를 자산 바이트에 함께 기록한다", () => {
    const before = createSyntheticGlb({ scenes: [{ nodes: [0], extras: { label: "기존 한글 이름", other: true } }] });
    const source = unavailableStudioBg3dSkpSceneSource("metadata-pass-size-limit");
    const after = writeStudioBg3dSkpSceneSourceToGlb(before, source);
    const oldJson = readGlbJson(before), newJson = readGlbJson(after);
    expect(binChunk(after)).toEqual(binChunk(before));
    expect(newJson.nodes).toEqual(oldJson.nodes);
    expect(firstScene(newJson).extras).toEqual({ label: "기존 한글 이름", other: true, toonstudioSkpSceneSource: source });
    expect(firstScene(oldJson).extras).toEqual({ label: "기존 한글 이름", other: true });
  });

  it("metric 출처와 scene 출처가 같은 root와 내보내기 wrapper에서 공존한다", () => {
    const root = new Group();
    const source = unavailableStudioBg3dSkpSceneSource("manifest-budget-exceeded");
    root.userData.toonstudioSkpSceneSource = source;
    markStudioBg3dSkpMetricImport({ root });
    const wrapper = new Group();
    wrapper.add(root);
    expect(readStudioBg3dSkpMetricImport(wrapper)).toBe("authored-metres");
    expect(readStudioBg3dSkpSceneSource(wrapper)).toEqual({ ok: true, value: source });
    expect(readStudioBg3dSkpSceneSource(wrapper)).not.toBe(readStudioBg3dSkpSceneSource(wrapper));
  });

  it("구 GLB는 legacy이며 여러 자식 중 하나의 표시를 전체 자산에 확대하지 않는다", () => {
    const legacy = new Group();
    expect(readStudioBg3dSkpSceneSource(legacy)).toMatchObject({ ok: true, value: { status: "legacy", manifest: null, geometryTransform: { status: "unknown" } } });
    const one = new Group();
    one.userData.toonstudioSkpSceneSource = unavailableStudioBg3dSkpSceneSource("parser-unavailable");
    legacy.add(one, new Group());
    expect(readStudioBg3dSkpSceneSource(legacy)).toMatchObject({ ok: true, value: { status: "legacy" } });
  });

  it("손상된 표시와 접근자는 legacy나 available로 바꾸지 않고 거부한다", () => {
    const root = new Group();
    root.userData.toonstudioSkpSceneSource = { version: 2, status: "available" };
    expect(readStudioBg3dSkpSceneSource(root)).toMatchObject({ ok: false, code: "invalid-source" });
    const getter = vi.fn();
    Object.defineProperty(root.userData, "toonstudioSkpSceneSource", { enumerable: true, get: getter });
    expect(readStudioBg3dSkpSceneSource(root).ok).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    expect(() => writeStudioBg3dSkpSceneSourceToGlb(createSyntheticGlb(), { version: 2 })).toThrow("invalid-scene-source");
  });

  it("유효 장면이 없는 GLB에 표시를 쓴 척하지 않는다", () => {
    const source = unavailableStudioBg3dSkpSceneSource("parser-unavailable");
    expect(() => writeStudioBg3dSkpSceneSourceToGlb(createSyntheticGlb({ scenes: [] }), source)).toThrow("GLB 장면");
  });
});
