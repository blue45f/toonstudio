import { describe, expect, it, vi } from "vitest";

import {
  detectStudioBg3dModelFormat,
  isStudioBg3dModelFormat,
  joinStudioBg3dModelUrl,
  loadStudioBg3dModelByFormat,
  resolveStudioBg3dModelDependencyUrl,
  type StudioBg3dModelLoaderFactories,
} from "./studio-bg3d-model-loader";

/**
 * three 패키지가 없는 하네스에서 도는 테스트다. 실제 로더 대신 가짜 로더 팩토리를
 * 주입해 포맷 판정·분기·URL 해석만 검증한다 (모듈 설계상 기본 팩토리는 동적 import라
 * 주입 시 three를 전혀 건드리지 않는다).
 */

const fakeScene = { kind: "scene" } as never;
const fakeRoot = { kind: "root" } as never;

function makeFactories(overrides: Partial<StudioBg3dModelLoaderFactories> = {}): {
  factories: StudioBg3dModelLoaderFactories;
  calls: Record<string, ReturnType<typeof vi.fn>>;
} {
  const calls: Record<string, ReturnType<typeof vi.fn>> = {
    createGLTFLoader: vi.fn(() => ({
      setMeshoptDecoder: vi.fn(),
      loadAsync: vi.fn(async () => ({ scene: fakeScene })),
      parseAsync: vi.fn(async () => ({ scene: fakeScene })),
    })),
    createFBXLoader: vi.fn(() => ({
      loadAsync: vi.fn(async () => fakeRoot),
      parse: vi.fn(() => fakeRoot),
    })),
    createOBJLoader: vi.fn(() => ({
      setMaterials: vi.fn(),
      loadAsync: vi.fn(async () => fakeRoot),
      parse: vi.fn(() => fakeRoot),
    })),
    createMTLLoader: vi.fn(() => ({
      loadAsync: vi.fn(async () => ({ preload: vi.fn() })),
      parse: vi.fn(() => ({ preload: vi.fn() })),
    })),
    createColladaLoader: vi.fn(() => ({
      loadAsync: vi.fn(async () => ({ scene: fakeScene })),
      parse: vi.fn(() => ({ scene: fakeScene })),
    })),
  };
  return { factories: { ...calls, ...overrides }, calls };
}

describe("detectStudioBg3dModelFormat / isStudioBg3dModelFormat", () => {
  it("확장자로 포맷을 판정한다 (대소문자·쿼리·프래그먼트 무시)", () => {
    expect(detectStudioBg3dModelFormat("model.glb")).toBe("glb");
    expect(detectStudioBg3dModelFormat("/assets/pack/model.GLTF")).toBe("gltf");
    expect(detectStudioBg3dModelFormat("https://example.com/a/b/model.fbx?v=3")).toBe("fbx");
    expect(detectStudioBg3dModelFormat("model.dae#fragment")).toBe("dae");
    expect(detectStudioBg3dModelFormat("model.obj")).toBe("obj");
  });

  it("지원 밖 확장자·확장자 없음은 null이다", () => {
    expect(detectStudioBg3dModelFormat("model.blend")).toBeNull();
    expect(detectStudioBg3dModelFormat("model.3ds")).toBeNull();
    expect(detectStudioBg3dModelFormat("model")).toBeNull();
    expect(detectStudioBg3dModelFormat("")).toBeNull();
    expect(detectStudioBg3dModelFormat(null)).toBeNull();
    expect(detectStudioBg3dModelFormat(undefined)).toBeNull();
  });

  it("isStudioBg3dModelFormat는 5종만 통과시킨다", () => {
    for (const format of ["glb", "gltf", "fbx", "obj", "dae"]) {
      expect(isStudioBg3dModelFormat(format)).toBe(true);
    }
    expect(isStudioBg3dModelFormat("blend")).toBe(false);
    expect(isStudioBg3dModelFormat("GLB")).toBe(false);
    expect(isStudioBg3dModelFormat(3)).toBe(false);
  });
});

describe("resolveStudioBg3dModelDependencyUrl / joinStudioBg3dModelUrl", () => {
  it("resolveDependency 콜백이 baseUrl보다 우선한다", () => {
    const resolved = resolveStudioBg3dModelDependencyUrl("textures/a.png", {
      baseUrl: "/assets/pack/",
      resolveDependency: (relativePath) => `/cdn/${relativePath}`,
    });
    expect(resolved).toBe("/cdn/textures/a.png");
  });

  it("콜백이 null을 돌려주면 baseUrl 결합으로 폴백한다", () => {
    const resolved = resolveStudioBg3dModelDependencyUrl("./model.bin", {
      baseUrl: "/assets/pack/native",
      resolveDependency: () => null,
    });
    expect(resolved).toBe("/assets/pack/native/model.bin");
  });

  it("상위 참조(../)를 정규화해 폴더 구조를 보존한다", () => {
    expect(joinStudioBg3dModelUrl("/assets/pack/native/model/", "../Textures/a.png"))
      .toBe("/assets/pack/native/Textures/a.png");
    expect(joinStudioBg3dModelUrl("https://cdn.example.com/packs/p1/", "sub/tex.png"))
      .toBe("https://cdn.example.com/packs/p1/sub/tex.png");
  });

  it("절대 URL·스킴 URL·절대 경로는 그대로 둔다", () => {
    expect(resolveStudioBg3dModelDependencyUrl("https://other.example.com/a.bin", {
      baseUrl: "/assets/",
      resolveDependency: () => "/should/not/win",
    })).toBe("https://other.example.com/a.bin");
    expect(resolveStudioBg3dModelDependencyUrl("/rooted/a.bin", { baseUrl: "/assets/" }))
      .toBe("/rooted/a.bin");
    expect(resolveStudioBg3dModelDependencyUrl("data:application/octet-stream;base64,AA==", {}))
      .toBe("data:application/octet-stream;base64,AA==");
  });

  it("해석 수단이 없으면 상대 경로를 그대로 돌려준다", () => {
    expect(resolveStudioBg3dModelDependencyUrl("tex/a.png")).toBe("tex/a.png");
  });
});

describe("loadStudioBg3dModelByFormat — 포맷별 분기 (가짜 로더)", () => {
  it("gltf URL: GLTFLoader.loadAsync의 scene을 반환하고 Meshopt 디코더를 건다", async () => {
    const { factories, calls } = makeFactories();
    const decoder = { tag: "meshopt" };
    const root = await loadStudioBg3dModelByFormat(
      { url: "/assets/pack/model.gltf" },
      { loaders: factories, meshoptDecoder: decoder as never },
    );
    expect(root).toBe(fakeScene);
    expect(calls.createGLTFLoader).toHaveBeenCalledTimes(1);
    expect(calls.createFBXLoader).not.toHaveBeenCalled();
    const loader = calls.createGLTFLoader.mock.results[0]!.value;
    expect(loader.setMeshoptDecoder).toHaveBeenCalledWith(decoder);
    expect(loader.loadAsync).toHaveBeenCalledWith("/assets/pack/model.gltf");
  });

  it("glb data: parseAsync에 ArrayBuffer와 resourcePath를 넘긴다", async () => {
    // baseUrl이 있으면 의존 해석용 LoadingManager가 필요하므로 매니저 팩토리도 주입한다
    // (주입이 없으면 기본 팩토리가 three에서 LoadingManager를 동적 import한다).
    const { factories, calls } = makeFactories({
      createLoadingManager: vi.fn(() => ({ setURLModifier: vi.fn() })),
    });
    const bytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
    const root = await loadStudioBg3dModelByFormat(
      { data: bytes, format: "glb", baseUrl: "/assets/pack/" },
      { loaders: factories, loadMeshoptDecoder: async () => ({}) as never },
    );
    expect(root).toBe(fakeScene);
    const loader = calls.createGLTFLoader.mock.results[0]!.value;
    const [data, path] = loader.parseAsync.mock.calls[0]!;
    expect(data).toBeInstanceOf(ArrayBuffer);
    expect((data as ArrayBuffer).byteLength).toBe(4);
    expect(path).toBe("/assets/pack/");
  });

  it("fbx data: FBXLoader.parse의 루트를 그대로 반환한다", async () => {
    const { factories, calls } = makeFactories();
    const root = await loadStudioBg3dModelByFormat(
      { data: new ArrayBuffer(8), name: "prop.fbx" },
      { loaders: factories },
    );
    expect(root).toBe(fakeRoot);
    expect(calls.createFBXLoader).toHaveBeenCalledTimes(1);
    expect(calls.createGLTFLoader).not.toHaveBeenCalled();
  });

  it("fbx URL: FBXLoader.loadAsync를 쓴다", async () => {
    const { factories, calls } = makeFactories();
    const root = await loadStudioBg3dModelByFormat(
      { url: "https://example.com/prop.fbx" },
      { loaders: factories },
    );
    expect(root).toBe(fakeRoot);
    const loader = calls.createFBXLoader.mock.results[0]!.value;
    expect(loader.loadAsync).toHaveBeenCalledWith("https://example.com/prop.fbx");
    expect(loader.parse).not.toHaveBeenCalled();
  });

  it("obj data + mtlText: MTLLoader.parse → preload → setMaterials 후 OBJ를 파싱한다", async () => {
    const creator = { preload: vi.fn() };
    const objLoader = { setMaterials: vi.fn(), loadAsync: vi.fn(), parse: vi.fn(() => fakeRoot) };
    const { factories } = makeFactories({
      createOBJLoader: vi.fn(() => objLoader),
      createMTLLoader: vi.fn(() => ({ loadAsync: vi.fn(), parse: vi.fn(() => creator) })),
    });
    const root = await loadStudioBg3dModelByFormat(
      { data: "v 0 0 0\n", format: "obj" },
      { loaders: factories, mtlText: "newmtl a\n" },
    );
    expect(root).toBe(fakeRoot);
    expect(creator.preload).toHaveBeenCalledTimes(1);
    expect(objLoader.setMaterials).toHaveBeenCalledWith(creator);
    expect(objLoader.parse).toHaveBeenCalledWith("v 0 0 0\n");
  });

  it("obj URL (MTL 없음): MTLLoader를 만들지 않고 loadAsync만 쓴다", async () => {
    const { factories, calls } = makeFactories();
    const root = await loadStudioBg3dModelByFormat(
      { url: "/assets/pack/model.obj" },
      { loaders: factories },
    );
    expect(root).toBe(fakeRoot);
    expect(calls.createMTLLoader).not.toHaveBeenCalled();
    const loader = calls.createOBJLoader.mock.results[0]!.value;
    expect(loader.loadAsync).toHaveBeenCalledWith("/assets/pack/model.obj");
    expect(loader.setMaterials).not.toHaveBeenCalled();
  });

  it("dae data: ColladaLoader.parse의 scene을 반환한다", async () => {
    const { factories, calls } = makeFactories();
    const root = await loadStudioBg3dModelByFormat(
      { data: "<COLLADA></COLLADA>", format: "dae" },
      { loaders: factories },
    );
    expect(root).toBe(fakeScene);
    const loader = calls.createColladaLoader.mock.results[0]!.value;
    expect(loader.parse).toHaveBeenCalledWith("<COLLADA></COLLADA>", "");
  });

  it("명시 format이 확장자 판정보다 우선한다", async () => {
    const { factories, calls } = makeFactories();
    await loadStudioBg3dModelByFormat(
      { url: "/assets/pack/model.bin" },
      { loaders: factories, format: "fbx" },
    );
    expect(calls.createFBXLoader).toHaveBeenCalledTimes(1);
  });

  it("판정 불가·지원 밖 포맷은 TypeError로 실패한다", async () => {
    const { factories } = makeFactories();
    await expect(loadStudioBg3dModelByFormat(
      { data: new ArrayBuffer(4) },
      { loaders: factories },
    )).rejects.toBeInstanceOf(TypeError);
    await expect(loadStudioBg3dModelByFormat(
      { url: "/assets/pack/model.blend" },
      { loaders: factories },
    )).rejects.toBeInstanceOf(TypeError);
    await expect(loadStudioBg3dModelByFormat(
      { url: "/assets/pack/model.glb" },
      { loaders: factories, format: "blend" as never },
    )).rejects.toBeInstanceOf(TypeError);
  });

  it("이미 중단된 signal이면 로더를 만들지 않고 AbortError로 실패한다", async () => {
    const { factories, calls } = makeFactories();
    const controller = new AbortController();
    controller.abort();
    await expect(loadStudioBg3dModelByFormat(
      { url: "/assets/pack/model.glb" },
      { loaders: factories, signal: controller.signal },
    )).rejects.toMatchObject({ name: "AbortError" });
    expect(calls.createGLTFLoader).not.toHaveBeenCalled();
  });
});

describe("loadStudioBg3dModelByFormat — LoadingManager URL modifier", () => {
  it("resolveDependency가 있으면 매니저에 URL modifier를 건다", async () => {
    const manager = { setURLModifier: vi.fn() };
    const { factories } = makeFactories({
      createLoadingManager: vi.fn(() => manager),
    });
    await loadStudioBg3dModelByFormat(
      { url: "/assets/pack/model.gltf" },
      {
        loaders: factories,
        resolveDependency: (relativePath) => `/resolved/${relativePath}`,
        meshoptDecoder: {} as never,
      },
    );
    expect(manager.setURLModifier).toHaveBeenCalledTimes(1);
    const modifier = manager.setURLModifier.mock.calls[0]![0] as (url: string) => string;
    expect(modifier("textures/a.png")).toBe("/resolved/textures/a.png");
    expect(modifier("https://other.example.com/a.png")).toBe("https://other.example.com/a.png");
  });

  it("baseUrl만 있으면 modifier가 baseUrl 결합으로 해석한다", async () => {
    const manager = { setURLModifier: vi.fn() };
    const { factories } = makeFactories({
      createLoadingManager: vi.fn(() => manager),
    });
    await loadStudioBg3dModelByFormat(
      { url: "/assets/pack/native/model/model.gltf" },
      { loaders: factories, baseUrl: "/assets/pack/native/model/", meshoptDecoder: {} as never },
    );
    const modifier = manager.setURLModifier.mock.calls[0]![0] as (url: string) => string;
    expect(modifier("../Textures/a.png")).toBe("/assets/pack/native/Textures/a.png");
    expect(modifier("model.bin")).toBe("/assets/pack/native/model/model.bin");
  });

  it("baseUrl·resolveDependency·매니저 팩토리가 모두 없으면 매니저 없이 로더를 만든다", async () => {
    const { factories, calls } = makeFactories();
    await loadStudioBg3dModelByFormat(
      { url: "/assets/pack/model.glb" },
      { loaders: factories, meshoptDecoder: {} as never },
    );
    expect(calls.createGLTFLoader).toHaveBeenCalledWith(undefined);
  });
});
