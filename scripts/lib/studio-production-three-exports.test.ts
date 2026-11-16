import { describe, expect, it } from "vitest";

import { resolveStudioProductionThreeExports, studioProductionThreeModuleUrls } from "./studio-production-three-exports.mjs";

const moduleUrl = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const renderer = `class Renderer {
  constructor() { throw new Error("렌더러 선택 중 GPU를 생성하면 안 됩니다"); }
  get coordinateSystem() { return 2000; }
  get outputColorSpace() { return "srgb"; }
  set outputColorSpace(value) {}
}`;
const camera = `class Camera {
  constructor() { throw new Error("카메라 선택에는 생성이 필요하지 않습니다"); }
  setFocalLength() {} getFocalLength() {} getFilmWidth() {} getFilmHeight() {}
  setViewOffset() {} updateProjectionMatrix() {}
}`;
const scene = `class Scene {
  constructor() { Object.assign(this, { isScene: true, isObject3D: true, type: "Scene" }); }
  copy() {} toJSON() {} add() {} remove() {} updateMatrixWorld() {}
}`;

describe("프로덕션 Three 정적 import 그래프", () => {
  const entryUrl = "https://preview.example.test/app/assets/three.module-renderer.js";
  const manifest = {
    renderer: { file: "assets/three.module-renderer.js", imports: ["core"], dynamicImports: ["other-engine"] },
    core: { file: "assets/three.core-primitives.js", imports: ["shared"] },
    shared: { file: "assets/math-shared.js", imports: ["core"] },
    "other-engine": { file: "assets/other-engine.js" },
  };

  it("분리된 core까지 따라가되 동적 엔진을 포함하지 않고 순환을 끝낸다", () => {
    expect(studioProductionThreeModuleUrls(entryUrl, manifest)).toEqual([
      entryUrl,
      "https://preview.example.test/app/assets/three.core-primitives.js",
      "https://preview.example.test/app/assets/math-shared.js",
    ]);
  });

  it("manifest에서 찾지 못한 production entry/import를 다른 빌드로 대체하지 않는다", () => {
    expect(() => studioProductionThreeModuleUrls(entryUrl.replace("renderer", "missing"), manifest)).toThrow("유일하지");
    expect(() => studioProductionThreeModuleUrls(entryUrl, {
      renderer: { file: "assets/three.module-renderer.js", imports: ["missing"] },
    })).toThrow("정적 import가 manifest에 없습니다");
  });

  it("잘못된 manifest와 빌드 밖 import를 거절한다", () => {
    expect(() => studioProductionThreeModuleUrls(entryUrl, [])).toThrow("객체가 아닙니다");
    expect(() => studioProductionThreeModuleUrls(entryUrl, { broken: { file: null } })).toThrow("파일/import 계약");
    for (const file of ["https://other.example.test/three.js", "../source/three.js", "assets/three.css"]) {
      expect(() => studioProductionThreeModuleUrls(entryUrl, {
        renderer: { file: "assets/three.module-renderer.js", imports: ["outside"] }, outside: { file },
      })).toThrow("빌드 파일 경계");
    }
  });
});

describe("프로덕션 Three export 식별", () => {
  it("서로 다른 청크의 축약 export를 함수 문자열이나 GPU 생성 없이 찾는다", async () => {
    const renderUrl = moduleUrl(`${renderer}; export { Renderer as r };`);
    const coreUrl = moduleUrl(`${camera}; ${scene}; export { Camera as p, Scene as s };`);
    expect(await resolveStudioProductionThreeExports([renderUrl, coreUrl])).toEqual({
      WebGLRenderer: { moduleUrl: renderUrl, exportName: "r" },
      PerspectiveCamera: { moduleUrl: coreUrl, exportName: "p" },
      Scene: { moduleUrl: coreUrl, exportName: "s" },
    });
  });

  it("동일 구현의 여러 alias는 하나로 세고 공개 이름을 우선한다", async () => {
    const url = moduleUrl(`${renderer}; ${camera}; ${scene}; export { Renderer as r, Renderer as WebGLRenderer, Camera as p, Camera as PerspectiveCamera, Scene as s, Scene };`);
    const result = await resolveStudioProductionThreeExports([url, url]);
    expect(Object.values(result).map((binding) => binding.exportName)).toEqual(["WebGLRenderer", "PerspectiveCamera", "Scene"]);
  });

  it("PerspectiveCamera를 상속한 ArrayCamera를 별도 원본 생성자로 오인하지 않는다", async () => {
    const url = moduleUrl(`${renderer}; ${camera}; ${scene}; class ArrayCamera extends Camera {} export { Renderer, Camera, Scene, ArrayCamera };`);
    expect((await resolveStudioProductionThreeExports([url])).PerspectiveCamera.exportName).toBe("Camera");
  });

  it("브랜드가 없는 비슷한 객체나 누락된 생성자는 실패한다", async () => {
    const url = moduleUrl(`${renderer}; ${camera}; ${scene.replace("isScene: true", "isScene: false")}; export { Renderer, Camera, Scene };`);
    await expect(resolveStudioProductionThreeExports([url])).rejects.toThrow("Three Scene 구현은 하나여야 합니다: 0");
    await expect(resolveStudioProductionThreeExports([])).rejects.toThrow("비어 있습니다");
  });

  it("두 독립 구현이 일치하면 임의 첫 후보를 선택하지 않는다", async () => {
    const first = moduleUrl(`${renderer}; ${camera}; ${scene}; export { Renderer, Camera, Scene };`);
    const second = moduleUrl(`${camera}; export { Camera as other };`);
    await expect(resolveStudioProductionThreeExports([first, second])).rejects.toThrow("Three PerspectiveCamera 구현은 하나여야 합니다: 2");
  });

  it("실제 모듈 로드 실패를 보존한다", async () => {
    await expect(resolveStudioProductionThreeExports([moduleUrl('throw new Error("production chunk failed")')]))
      .rejects.toThrow("production chunk failed");
  });

  it("Magic 장면의 지오메트리/재질/메시도 실제 브랜드로 선택하고 임시 자원을 정리한다", async () => {
    const primitives = `export let disposed = 0;
      class Geometry {
        constructor() { Object.assign(this, { type: "BoxGeometry", isBufferGeometry: true }); }
        static fromJSON() {} copy() {} getAttribute() {} setAttribute() {} dispose() { disposed += 1; }
      }
      class Material {
        constructor() { Object.assign(this, { type: "MeshBasicMaterial", isMaterial: true, isMeshBasicMaterial: true }); }
        copy() {} setValues() {} toJSON() {} dispose() { disposed += 1; }
      }
      class Mesh {
        constructor() { Object.assign(this, { type: "Mesh", isMesh: true, isObject3D: true,
          geometry: { dispose() { disposed += 1; } }, material: { dispose() { disposed += 1; } } }); }
        updateMorphTargets() {} getVertexPosition() {} raycast() {}
      }
      export { Geometry as g, Material as m, Mesh as x };`;
    const url = moduleUrl(`${renderer}; ${camera}; ${scene}; export { Renderer, Camera, Scene }; ${primitives}`);
    const result = await resolveStudioProductionThreeExports({ moduleUrls: [url], scenePrimitives: true });
    expect(result.scenePrimitives).toEqual({
      BoxGeometry: { moduleUrl: url, exportName: "g" },
      MeshBasicMaterial: { moduleUrl: url, exportName: "m" },
      Mesh: { moduleUrl: url, exportName: "x" },
    });
    expect((await import(/* @vite-ignore */ url)).disposed).toBe(4);
  });
});
