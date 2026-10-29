import { describe, expect, it } from "vitest";

import {
  contentAddressStudioMeshRenderCacheSurface,
  createStudioMeshRenderCacheSurface,
  validateStudioMeshRenderCacheSurface,
  type StudioRenderMeshCacheSurface,
  type StudioRenderMeshCacheSurfaceBinding,
} from "./studio-mesh-render-cache-surface";

const binding: StudioRenderMeshCacheSurfaceBinding = {
  derivedMeshHash: `mesh:sha256:${"a".repeat(64)}`,
  geometryContentHash: `sha256:${"b".repeat(64)}`,
  indexCount: 3,
};
function attributes() {
  return {
    cornerNormals: new Float32Array([0, 0, 1, 0, 1, 0, 1, 0, 0]),
    cornerUvs: new Float32Array([-0.25, 0.2, 1.5, -3, 0, 0]),
    triangleMaterialSlots: new Float64Array([2 ** 40 + 1]),
  };
}
function rehash(surface: StudioRenderMeshCacheSurface): StudioRenderMeshCacheSurface {
  return { ...surface, contentHash: contentAddressStudioMeshRenderCacheSurface(surface) };
}

describe("폐기 가능한 표시 캐시의 코너 속성 무결성", () => {
  it("원본 V-up·타일 밖 UV와 큰 safe-integer 슬롯을 손실 없이 독립 복사하고 정확히 hash한다", () => {
    const source = attributes(); const surface = createStudioMeshRenderCacheSurface(binding, source);
    expect(validateStudioMeshRenderCacheSurface(surface, binding)).toBe(true);
    expect(surface.cornerNormals).toEqual(source.cornerNormals); expect(surface.cornerNormals).not.toBe(source.cornerNormals);
    expect(surface.cornerUvs).toEqual(source.cornerUvs); expect(surface.cornerUvs).not.toBe(source.cornerUvs);
    expect(surface.triangleMaterialSlots).toEqual(source.triangleMaterialSlots); expect(surface.triangleMaterialSlots).not.toBe(source.triangleMaterialSlots);
    expect(surface.cornerUvs?.[1]).toBe(Math.fround(0.2)); expect(surface.triangleMaterialSlots[0]).toBe(2 ** 40 + 1);
    const before = surface.contentHash;
    source.cornerNormals[0] = 1; source.cornerUvs[0] = 99; source.triangleMaterialSlots[0] = 0;
    expect(surface.contentHash).toBe(before); expect(validateStudioMeshRenderCacheSurface(surface, binding)).toBe(true);
  });

  it("같은 기하에서도 정상 범위의 법선·UV·슬롯 바이트가 변조되면 각각 거부한다", () => {
    const surface = createStudioMeshRenderCacheSurface(binding, attributes());
    const normal = new Float32Array(surface.cornerNormals); normal.set([0, 1, 0]);
    if (!surface.cornerUvs) throw new Error("검증할 UV가 없습니다.");
    const uv = new Float32Array(surface.cornerUvs); uv[0] = 0.5;
    const slot = new Float64Array(surface.triangleMaterialSlots); slot[0] = 17;
    for (const changed of [{ ...surface, cornerNormals: normal }, { ...surface, cornerUvs: uv }, { ...surface, triangleMaterialSlots: slot }]) {
      expect(changed.geometryContentHash).toBe(surface.geometryContentHash);
      expect(contentAddressStudioMeshRenderCacheSurface(changed)).not.toBe(surface.contentHash);
      expect(validateStudioMeshRenderCacheSurface(changed, binding)).toBe(false);
    }
  });

  it("기하와 평가 메시 provenance를 자체 hash에 포함하고 다른 캐시로 복사한 payload를 거부한다", () => {
    const surface = createStudioMeshRenderCacheSurface(binding, attributes());
    const otherGeometry = { ...binding, geometryContentHash: `sha256:${"c".repeat(64)}` as const };
    const otherMesh = { ...binding, derivedMeshHash: `mesh:sha256:${"d".repeat(64)}` };
    expect(validateStudioMeshRenderCacheSurface(surface, otherGeometry)).toBe(false);
    expect(validateStudioMeshRenderCacheSurface(surface, otherMesh)).toBe(false);
    expect(contentAddressStudioMeshRenderCacheSurface({ ...surface, ...otherGeometry })).not.toBe(surface.contentHash);
    expect(contentAddressStudioMeshRenderCacheSurface({ ...surface, ...otherMesh })).not.toBe(surface.contentHash);
    expect(validateStudioMeshRenderCacheSurface(rehash({ ...surface, derivedMeshHash: otherMesh.derivedMeshHash }), binding)).toBe(false);
  });

  it("hash를 다시 만들어도 길이·finite·단위 법선·slot 계약을 위반하면 거부한다", () => {
    const surface = createStudioMeshRenderCacheSurface(binding, attributes());
    const cases: StudioRenderMeshCacheSurface[] = [
      { ...surface, cornerNormals: new Float32Array(6) },
      { ...surface, cornerNormals: new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0]) },
      { ...surface, cornerNormals: new Float32Array([0, 0, 2, 0, 1, 0, 1, 0, 0]) },
      { ...surface, cornerNormals: new Float32Array([NaN, 0, 1, 0, 1, 0, 1, 0, 0]) },
      { ...surface, cornerNormals: new Float32Array([Infinity, 0, 1, 0, 1, 0, 1, 0, 0]) },
      { ...surface, cornerUvs: new Float32Array(4) },
      { ...surface, cornerUvs: new Float32Array([0, NaN, 0, 0, 0, 0]) },
      { ...surface, cornerUvs: new Float32Array([0, Infinity, 0, 0, 0, 0]) },
      ...[-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity].map((slot) => ({ ...surface, triangleMaterialSlots: new Float64Array([slot]) })),
      { ...surface, triangleMaterialSlots: new Float64Array(2) },
    ];
    for (const value of cases) expect(validateStudioMeshRenderCacheSurface(rehash(value), binding)).toBe(false);
    expect(() => createStudioMeshRenderCacheSurface(binding, cases[1] ?? attributes())).toThrow("표시 속성");
  });

  it("UV 부재와 typed-array 종류·revision·잘못된 바인딩을 명확히 구분한다", () => {
    const source = attributes(); const noUv = { cornerNormals: source.cornerNormals, triangleMaterialSlots: source.triangleMaterialSlots };
    const surface = createStudioMeshRenderCacheSurface(binding, noUv);
    expect(surface.cornerUvs).toBeUndefined(); expect(validateStudioMeshRenderCacheSurface(surface, binding)).toBe(true);
    expect(surface.contentHash).not.toBe(createStudioMeshRenderCacheSurface(binding, source).contentHash);
    for (const invalid of [undefined, null, {}, { ...surface, revision: 2 }, { ...surface, contentHash: "broken" },
      { ...surface, cornerNormals: Array.from(source.cornerNormals) }, { ...surface, cornerUvs: null },
      { ...surface, cornerUvs: new Float64Array(6) }, { ...surface, triangleMaterialSlots: new Uint32Array([0]) }]) {
      expect(validateStudioMeshRenderCacheSurface(invalid, binding)).toBe(false);
    }
    for (const invalid of [{ ...binding, indexCount: 0 }, { ...binding, indexCount: 4 }, { ...binding, indexCount: NaN }, { ...binding, derivedMeshHash: "fake" }]) {
      expect(validateStudioMeshRenderCacheSurface(surface, invalid)).toBe(false);
      expect(() => createStudioMeshRenderCacheSurface(invalid, noUv)).toThrow();
    }
  });

  it("subarray 앞뒤의 무관한 바이트를 제외하고 같은 속성에는 같은 hash를 만든다", () => {
    const source = attributes();
    const padded = new Float32Array(source.cornerNormals.length + 5); padded.fill(42); padded.set(source.cornerNormals, 2);
    const slot = new Float64Array([999, ...source.triangleMaterialSlots, 777]);
    const first = createStudioMeshRenderCacheSurface(binding, source);
    const second = createStudioMeshRenderCacheSurface(binding, { ...source, cornerNormals: padded.subarray(2, 2 + source.cornerNormals.length), triangleMaterialSlots: slot.subarray(1, 2) });
    expect(second.contentHash).toBe(first.contentHash);
    expect(contentAddressStudioMeshRenderCacheSurface({ ...first, cornerNormals: padded.subarray(2, 2 + source.cornerNormals.length), triangleMaterialSlots: slot.subarray(1, 2) })).toBe(first.contentHash);
  });
});
