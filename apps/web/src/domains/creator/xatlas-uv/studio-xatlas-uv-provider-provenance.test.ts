import { describe, expect, it } from "vitest";

import {
  createStudioXAtlasUvProvider,
  type StudioXAtlasUvRequest,
  type StudioXAtlasUvRuntime,
  type StudioXAtlasUvRuntimeAtlas,
  type StudioXAtlasUvRuntimeGeometry,
  type StudioXAtlasUvRuntimeMeshInput,
} from "./studio-xatlas-uv-provider";

function sourceMesh(id = "mesh-a", offset = 0): StudioXAtlasUvRequest["meshes"][number] {
  return {
    id,
    positions: new Float32Array([offset, 0, 0, offset + 1, 0, 0, offset, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
  };
}

function request(meshes: StudioXAtlasUvRequest["meshes"] = [sourceMesh()]): StudioXAtlasUvRequest {
  return { operation: "unwrap-atlas", requestEpoch: 1, documentEpoch: 7, meshes };
}

function atlasFor(inputs: readonly StudioXAtlasUvRuntimeMeshInput[]): StudioXAtlasUvRuntimeAtlas {
  return {
    width: 128, height: 64, atlasCount: 1, meshCount: inputs.length, texelsPerUnit: 16,
    meshes: inputs.map((input) => ({
      id: input.id,
      positions: new Float32Array(input.positions),
      indices: new Uint32Array(input.indices),
      uv: new Float32Array(input.positions.length / 3 * 2),
      originalInputVertexIndices: Uint32Array.from({ length: input.positions.length / 3 }, (_, index) => index),
      atlasSegments: [{ index: 0, count: input.indices.length, atlasIndex: 0 }],
    })),
  };
}

class ProvenanceRuntime implements StudioXAtlasUvRuntime {
  readonly packageVersion = "0.2.0-provenance-fixture";
  readonly inputs: StudioXAtlasUvRuntimeMeshInput[] = [];
  readonly events: string[] = [];
  lastAtlas: StudioXAtlasUvRuntimeAtlas | undefined;

  constructor(
    private readonly makeAtlas: (inputs: readonly StudioXAtlasUvRuntimeMeshInput[]) => StudioXAtlasUvRuntimeAtlas = atlasFor,
    private readonly onCreate?: (input: StudioXAtlasUvRuntimeMeshInput) => void,
  ) {}

  initialize(): Promise<void> { return Promise.resolve(); }

  createGeometry(input: StudioXAtlasUvRuntimeMeshInput): StudioXAtlasUvRuntimeGeometry {
    this.inputs.push(input);
    this.onCreate?.(input);
    return { id: input.id, release: () => { this.events.push(`release:${input.id}`); } };
  }

  pack(): Promise<StudioXAtlasUvRuntimeAtlas> {
    const result = this.makeAtlas(this.inputs);
    this.lastAtlas = result;
    return Promise.resolve(result);
  }

  cleanupAtlas(): Promise<boolean> { this.events.push("cleanup"); return Promise.resolve(true); }
  dispose(): void { this.events.push("dispose"); }
}

function provider(runtime: ProvenanceRuntime, maxOutputBytes?: number) {
  return createStudioXAtlasUvProvider({
    requestEpoch: 1,
    documentEpoch: 7,
    runtimeLoader: () => runtime,
    ...(maxOutputBytes === undefined ? {} : { limits: { maxOutputBytes } }),
  });
}

function firstOutput(atlas: StudioXAtlasUvRuntimeAtlas) {
  const output = atlas.meshes[0];
  if (!output) throw new Error("회귀 fixture의 mesh 출력이 없습니다.");
  return output;
}

describe("xatlas 원본 정점 대응 전파", () => {
  it("version 2는 여러 mesh의 local 대응표를 전역 offset 없이 보존한다", async () => {
    const runtime = new ProvenanceRuntime();
    const result = await provider(runtime).execute(request([sourceMesh(), sourceMesh("mesh-b", 10)]));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.detail);
    expect(result.artifact.version).toBe(2);
    expect(result.artifact.originalInputVertexIndices).toEqual(new Uint32Array([0, 1, 2, 0, 1, 2]));
    expect(result.artifact.indices).toEqual(new Uint32Array([0, 1, 2, 3, 4, 5]));
    expect(result.artifact.meshes[1]).toMatchObject({ vertexOffset: 3, sourceVertexCount: 3 });
  });

  it("UV seam으로 복제한 출력 정점도 각각의 원본 ID와 서로 다른 UV를 유지한다", async () => {
    const source = {
      id: "quad",
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    };
    const original = new Float32Array(source.positions);
    const runtime = new ProvenanceRuntime((inputs) => {
      const input = inputs[0];
      if (!input) throw new Error("seam fixture 원본이 없습니다.");
      const mapping = new Uint32Array([0, 1, 2, 0, 2, 3]);
      const positions = new Float32Array(mapping.length * 3);
      for (let output = 0; output < mapping.length; output += 1) {
        const sourceIndex = mapping[output];
        if (sourceIndex === undefined) throw new Error("seam fixture 대응이 없습니다.");
        for (let axis = 0; axis < 3; axis += 1) {
          const value = input.positions[sourceIndex * 3 + axis];
          if (value === undefined) throw new Error("seam fixture 위치가 없습니다.");
          positions[output * 3 + axis] = value;
        }
      }
      return {
        ...atlasFor(inputs),
        meshes: [{
          id: input.id, positions, originalInputVertexIndices: mapping,
          indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
          uv: new Float32Array([0, 0, 1, 0, 1, 1, 0.25, 0.5, 0.75, 0.5, 0, 1]),
        }],
      };
    });
    const result = await provider(runtime).execute(request([source]));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.detail);
    expect(result.artifact.originalInputVertexIndices).toEqual(new Uint32Array([0, 1, 2, 0, 2, 3]));
    expect(result.artifact.uv[0]).toBe(0);
    expect(result.artifact.uv[6]).toBe(0.25);
    expect(source.positions).toEqual(original);
    expect(source.indices).toEqual(new Uint32Array([0, 1, 2, 0, 2, 3]));
  });

  it.each([
    { name: "누락", alter: (atlas: StudioXAtlasUvRuntimeAtlas) => { Reflect.deleteProperty(firstOutput(atlas), "originalInputVertexIndices"); } },
    { name: "짧은 배열", alter: (atlas: StudioXAtlasUvRuntimeAtlas) => { Object.assign(firstOutput(atlas), { originalInputVertexIndices: new Uint32Array([0, 1]) }); } },
    { name: "원본 범위 밖", alter: (atlas: StudioXAtlasUvRuntimeAtlas) => { Object.assign(firstOutput(atlas), { originalInputVertexIndices: new Uint32Array([0, 1, 3]) }); } },
    { name: "음수", alter: (atlas: StudioXAtlasUvRuntimeAtlas) => { Object.assign(firstOutput(atlas), { originalInputVertexIndices: new Float64Array([-1, 1, 2]) }); } },
    { name: "소수", alter: (atlas: StudioXAtlasUvRuntimeAtlas) => { Object.assign(firstOutput(atlas), { originalInputVertexIndices: new Float64Array([0.5, 1, 2]) }); } },
    { name: "NaN", alter: (atlas: StudioXAtlasUvRuntimeAtlas) => { Object.assign(firstOutput(atlas), { originalInputVertexIndices: new Float64Array([NaN, 1, 2]) }); } },
    { name: "무한대", alter: (atlas: StudioXAtlasUvRuntimeAtlas) => { Object.assign(firstOutput(atlas), { originalInputVertexIndices: new Float64Array([Infinity, 1, 2]) }); } },
    { name: "대응 위치 불일치", alter: (atlas: StudioXAtlasUvRuntimeAtlas) => { Object.assign(firstOutput(atlas), { originalInputVertexIndices: new Uint32Array([1, 1, 2]) }); } },
    { name: "위치 Float32 초과", alter: (atlas: StudioXAtlasUvRuntimeAtlas) => { Object.assign(firstOutput(atlas), { positions: [1e100, 0, 0, 1, 0, 0, 0, 1, 0] }); } },
    { name: "UV Float32 초과", alter: (atlas: StudioXAtlasUvRuntimeAtlas) => { Object.assign(firstOutput(atlas), { uv: [1e100, 0, 0, 0, 0, 0] }); } },
  ])("$name 대응표·출력은 거절하고 자원을 정리한다", async ({ alter }) => {
    const runtime = new ProvenanceRuntime((inputs) => {
      const atlas = atlasFor(inputs);
      alter(atlas);
      return atlas;
    });
    const result = await provider(runtime).execute(request());
    expect(result).toMatchObject({ ok: false, reason: "invalid-provider-output" });
    expect(runtime.events).toEqual(["cleanup", "release:mesh-a"]);
  });

  it("반환 대응표·UV·위치는 runtime 배열과 소유권을 공유하지 않는다", async () => {
    const runtime = new ProvenanceRuntime();
    const result = await provider(runtime).execute(request());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.detail);
    const atlas = runtime.lastAtlas;
    if (!atlas) throw new Error("복사 fixture 출력이 없습니다.");
    const output = firstOutput(atlas);
    expect(result.artifact.originalInputVertexIndices).not.toBe(output.originalInputVertexIndices);
    if (!(output.originalInputVertexIndices instanceof Uint32Array)
      || !(output.positions instanceof Float32Array) || !(output.uv instanceof Float32Array)) {
      throw new Error("복사 fixture 배열 형식이 다릅니다.");
    }
    output.originalInputVertexIndices[0] = 99;
    output.positions[0] = 99;
    output.uv[0] = 99;
    expect(result.artifact.originalInputVertexIndices[0]).toBe(0);
    expect(result.artifact.positions[0]).toBe(0);
    expect(result.artifact.uv[0]).toBe(0);
  });

  it.each([
    { meshes: 1, bytes: 83, accepted: false },
    { meshes: 1, bytes: 84, accepted: true },
    { meshes: 2, bytes: 167, accepted: false },
    { meshes: 2, bytes: 168, accepted: true },
  ])("출력 $meshes개 mesh의 대응표를 포함한 $bytes 바이트 예산을 검사한다", async ({ meshes, bytes, accepted }) => {
    const runtime = new ProvenanceRuntime();
    const inputs = meshes === 1 ? [sourceMesh()] : [sourceMesh(), sourceMesh("mesh-b", 10)];
    const result = await provider(runtime, bytes).execute(request(inputs));
    expect(result.ok).toBe(accepted);
    if (!accepted) expect(result).toMatchObject({ ok: false, reason: "budget-exceeded" });
  });

  it.each(["createGeometry", "pack"])("runtime의 %s 입력·출력 동시 변조는 고정한 원본과 대조해 거절한다", async (stage) => {
    const mutate = (input: StudioXAtlasUvRuntimeMeshInput) => { input.positions[0] = 9; };
    const runtime = new ProvenanceRuntime(
      (inputs) => {
        const input = inputs[0];
        if (!input) throw new Error("변조 fixture 원본이 없습니다.");
        if (stage === "pack") mutate(input);
        return atlasFor(inputs);
      },
      stage === "createGeometry" ? mutate : undefined,
    );
    const source = sourceMesh();
    const result = await provider(runtime).execute(request([source]));
    expect(result).toMatchObject({ ok: false, reason: "invalid-provider-output" });
    expect(source.positions[0]).toBe(0);
    expect(runtime.events).toEqual(["cleanup", "release:mesh-a"]);
  });
});
