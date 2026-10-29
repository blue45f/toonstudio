// @vitest-environment jsdom
import { MToonNodeMaterial as SdkMToonNodeMaterial } from "@pixiv/three-vrm/nodes";
import { BoxGeometry, Color, DirectionalLight, Material, PerspectiveCamera, Scene, Texture, WebGLCoordinateSystem, WebGPUCoordinateSystem } from "three";
import { float, lights } from "three/tsl";
import { Mesh, WebGPURenderer, WGSLNodeBuilder } from "three/webgpu";
import { describe, expect, it } from "vitest";

import { STUDIO_MTOON_NODE_REVISION, StudioMToonNodeMaterial, studioMToonNodeOutlineClipBias, studioMToonNodeScreenScale, studioMToonNodeShading } from "./studio-mtoon-node-material";
import { readStudioMToonRuntimeIdentity } from "./studio-mtoon-runtime-identity";

type ScalarFunction = typeof studioMToonNodeShading | typeof studioMToonNodeScreenScale;
function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function shaderFunction(fn: ScalarFunction) {
  // Fn은 callable Proxy여서 in/own-key에는 shaderNode가 없고 get trap으로 공개한다.
  const shader: unknown = Reflect.get(fn, "shaderNode");
  if (!object(shader) || typeof shader.jsFunc !== "function") throw new Error("설치 TSL 함수 구조가 바뀌었습니다.");
  return shader;
}
/** 실제 TSL scalar graph를 읽는다. 선택하지 않은 분기도 평가해 숨은 0 나눗셈을 검출한다. */
function scalar(node: unknown): number {
  if (!object(node)) throw new Error("실제 scalar node가 없습니다.");
  if (typeof node.value === "number") return node.value;
  if (node.isVarNode === true) return scalar(node.node);
  if ("convertTo" in node) return scalar(node.node);
  if ("condNode" in node) {
    const condition = scalar(node.condNode), yes = scalar(node.ifNode), no = scalar(node.elseNode); return condition ? yes : no;
  }
  if (typeof node.op === "string") {
    const a = scalar(node.aNode), b = scalar(node.bNode);
    if (node.op === "+") return a + b;
    if (node.op === "-") return a - b;
    if (node.op === "*") return a * b;
    if (node.op === "==") return a === b ? 1 : 0;
    if (node.op === "/") { if (b === 0) throw new Error("TSL graph 안에 0 나눗셈이 있습니다."); return a / b; }
  }
  if (node.method === "clamp") return Math.max(scalar(node.bNode), Math.min(scalar(node.cNode), scalar(node.aNode)));
  if (node.method === "step") return scalar(node.bNode) < scalar(node.aNode) ? 0 : 1;
  throw new Error(`검증하지 않은 TSL scalar node: ${String(node.op ?? node.method ?? node.type)}`);
}
function evaluate(fn: ScalarFunction, values: readonly number[]): number {
  const shader = shaderFunction(fn);
  if (typeof shader.jsFunc !== "function") throw new Error("TSL 원본 함수를 읽지 못했습니다.");
  const result: unknown = shader.jsFunc(values.map((value) => float(value))); return scalar(result);
}
function wgsl(fn: ScalarFunction): string {
  // 생성만 한다. renderer.init/render/compute와 GPU adapter 요청은 수행하지 않는다.
  const renderer = new WebGPURenderer({ canvas: document.createElement("canvas") });
  const builder = new WGSLNodeBuilder(new Mesh(), renderer);
  if (!("setShaderStage" in builder) || typeof builder.setShaderStage !== "function"
    || !("buildFunctionNode" in builder) || typeof builder.buildFunctionNode !== "function") throw new Error("설치 Three builder CPU API가 바뀌었습니다.");
  builder.setShaderStage("fragment");
  const compiled: unknown = builder.buildFunctionNode(shaderFunction(fn));
  if (!object(compiled) || typeof compiled.code !== "string") throw new Error("실제 WGSL 함수 출력이 없습니다."); return compiled.code;
}

describe("guarded MToon WebGPU TSL", () => {
  it("본체 depth는 유지하고 clip 범위·reversed 방향과 무관하게 외곽선을 같은 window depth만큼 뒤로 민다", () => {
    for (const coordinateSystem of [WebGLCoordinateSystem, WebGPUCoordinateSystem]) for (const reversed of [false, true]) {
      expect(studioMToonNodeOutlineClipBias(coordinateSystem, reversed, false)).toBe(0);
      const bias = studioMToonNodeOutlineClipBias(coordinateSystem, reversed, true);
      const zeroToOne = coordinateSystem === WebGPUCoordinateSystem || reversed;
      const depthShift = bias / (zeroToOne ? 1 : 2);
      expect(depthShift).toBe(reversed ? -5e-7 : 5e-7);
    }
    expect(() => studioMToonNodeOutlineClipBias(0, false, true)).toThrow("좌표계");
  });

  it("실제 body 직접광은 임시 변환값 대신 최종 diffuse·specular 누산기에 쓴다", () => {
    const material = new StudioMToonNodeMaterial({ shadingToonyFactor: 1 }), geometry = new BoxGeometry();
    const renderer = new WebGPURenderer({ canvas: document.createElement("canvas") });
    renderer.hasFeature = (feature) => { if (feature !== "float32-filterable") throw new Error(`예상하지 않은 CPU feature: ${feature}`); return false; };
    try {
      const builder = new WGSLNodeBuilder(new Mesh(geometry, material), renderer);
      Reflect.set(builder, "camera", new PerspectiveCamera()); Reflect.set(builder, "scene", new Scene());
      Reflect.set(builder, "lightsNode", lights([new DirectionalLight()]));
      if (!("build" in builder) || typeof builder.build !== "function") throw new Error("실제 material builder가 없습니다.");
      builder.build(); const fragment: unknown = Reflect.get(builder, "fragmentShader");
      if (typeof fragment !== "string") throw new Error("실제 fragment WGSL이 없습니다.");
      for (const accumulator of ["directDiffuse", "directSpecular"]) {
        const updates = [...fragment.matchAll(new RegExp(`\\b(\\w+)\\s*=\\s*\\(\\s*${accumulator}\\s*\\+[^;]+\\);`, "gu"))];
        expect(updates.length).toBeGreaterThan(0);
        expect(updates.some(([, value]) => value && fragment.includes(`${accumulator} = ${value};`))).toBe(true);
      }
    } finally { material.dispose(); geometry.dispose(); }
  });
  it("toony=1의 음수·양수·정확한 경계를 실제 graph에서 finite step으로 계산한다", () => {
    for (const [dot, shift, expected] of [[-.2, 0, 0], [.2, 0, 1], [0, 0, 1], [-.25, .5, 1], [.25, -.5, 0]]) {
      expect(evaluate(studioMToonNodeShading, [dot ?? NaN, shift ?? NaN, 1])).toBe(expected);
    }
    expect(evaluate(studioMToonNodeShading, [-0, 0, 1])).toBe(1);
  });

  it("부드러운 셀 경계·shift와 기존 toony 값은 임의 epsilon 하향 없이 보존한다", () => {
    for (const toony of [0, .5, .9, .9999999]) for (const dot of [-1, -.1, 0, .1, 1]) {
      const feather = 1 - toony, expected = Math.max(0, Math.min(1, (dot + .05 + feather) / (2 * feather)));
      expect(evaluate(studioMToonNodeShading, [dot, .05, toony])).toBeCloseTo(expected, 12);
    }
    const material = new StudioMToonNodeMaterial({ shadingToonyFactor: 1, shadingShiftFactor: -.35 });
    expect(material.shadingToonyFactor).toBe(1); expect(material.shadingShiftFactor).toBe(-.35);
  });

  it("직교는 깊이와 독립이고 원근은 SDK의 양수 view depth를 유지한다", () => {
    for (const depth of [1, 6, 30]) {
      expect(evaluate(studioMToonNodeScreenScale, [1, depth, 2])).toBe(.5);
      expect(evaluate(studioMToonNodeScreenScale, [0, depth, 2])).toBe(depth / 2);
    }
    expect(evaluate(studioMToonNodeScreenScale, [0, 6, 4])).toBe(1.5);
  });

  it("설치 WGSLNodeBuilder가 guard와 직교 보정을 실제 WGSL 함수로 생성한다", () => {
    const shading = wgsl(studioMToonNodeShading), screen = wgsl(studioMToonNodeScreenScale);
    expect(shading).toContain("fn studioMToonShading"); expect(shading).toContain("step("); expect(shading).toContain("toony");
    expect(shading).toMatch(/select\(|if\s*\(/u); expect(screen).toContain("fn studioMToonScreenScale");
    expect(screen).toContain("viewDepth"); expect(screen).toContain("projectionY"); expect(screen).toContain("clipW");
  });

  it("실제 조명이 있는 material graph도 GPU 초기화 없이 WGSL로 구성한다", () => {
    const material = new StudioMToonNodeMaterial({ shadingToonyFactor: 1, outlineWidthMode: "screenCoordinates", outlineWidthFactor: .003, isOutline: true });
    const renderer = new WebGPURenderer({ canvas: document.createElement("canvas") }), geometry = new BoxGeometry();
    const clone = material.clone(); clone.shadingToonyFactor = .75;
    try { for (const target of [material, clone]) {
      const builder = new WGSLNodeBuilder(new Mesh(geometry, target), renderer);
      Reflect.set(builder, "camera", new PerspectiveCamera()); Reflect.set(builder, "scene", new Scene());
      Reflect.set(builder, "lightsNode", lights([new DirectionalLight()]));
      if (!("build" in builder) || typeof builder.build !== "function") throw new Error("설치 WGSL material builder가 없습니다.");
      builder.build();
      const vertex: unknown = Reflect.get(builder, "vertexShader"), fragment: unknown = Reflect.get(builder, "fragmentShader");
      expect(typeof vertex).toBe("string"); expect(typeof fragment).toBe("string");
      expect(vertex).toContain("studioMToonScreenScale"); expect(fragment).toContain("studioMToonShading");
      const nodes: unknown = Reflect.get(builder, "nodes"); if (!(nodes instanceof Set)) throw new Error("실제 builder 노드 집합이 없습니다.");
      const references = Array.from(nodes, (node: unknown) => node).filter((node): node is Record<string, unknown> => object(node) && node.isMaterialReferenceNode === true
        && ["shadingToonyFactor", "shadingShiftFactor", "outlineWidthFactor", "shadeColorFactor"].includes(String(node.property)));
      expect(references.length).toBeGreaterThanOrEqual(4);
      for (const reference of references) { expect(reference.material).toBeNull(); expect(reference.reference).toBe(target); }
      expect(readStudioMToonRuntimeIdentity(target)?.backend).toBe("webgpu");
      expect(target.positionNode).toBeNull(); expect(target.emissiveNode).toBeNull(); expect(target.colorNode).toBeNull();
    } } finally { geometry.dispose(); material.dispose(); clone.dispose(); }
  });

  it("공식 Material constructor 계약과 approved lazy entry를 유지한다", async () => {
    const materialType: typeof Material = StudioMToonNodeMaterial, material = new materialType();
    expect(material).toBeInstanceOf(SdkMToonNodeMaterial);
    expect(readStudioMToonRuntimeIdentity(material)).toEqual({ backend: "webgpu", revision: STUDIO_MTOON_NODE_REVISION });
    const entry = await import("../bg3d/studio-bg3d-three-webgpu-entry"); expect(entry.MToonNodeMaterial).toBe(StudioMToonNodeMaterial);
  });

  it("clone/copy는 대상마다 등록하고 색·shift·toony·outline을 원본과 독립적으로 유지한다", () => {
    const source = new StudioMToonNodeMaterial({ color: new Color(.8, .2, .1), shadeColorFactor: new Color(.1, .2, .4),
      shadingShiftFactor: -.3, shadingToonyFactor: 1, outlineWidthMode: "screenCoordinates", outlineWidthFactor: .003, isOutline: true });
    const clone = source.clone(), copied = new StudioMToonNodeMaterial().copy(source);
    for (const target of [clone, copied]) {
      expect(target).not.toBe(source); expect(target.color).not.toBe(source.color); expect(target.color).toEqual(source.color);
      expect(target.shadeColorFactor).toEqual(source.shadeColorFactor); expect(target.shadingShiftFactor).toBe(-.3); expect(target.shadingToonyFactor).toBe(1);
      expect([target.isOutline, target.outlineWidthMode, target.outlineWidthFactor]).toEqual([true, "screenCoordinates", .003]);
      expect(readStudioMToonRuntimeIdentity(target)?.backend).toBe("webgpu"); expect(target.setupLightingModel()).not.toBe(source.setupLightingModel());
    }
    source.outlineWidthFactor = .1; source.color.setRGB(0, 0, 0); source.shadingToonyFactor = .5;
    expect(clone.outlineWidthFactor).toBe(.003); expect(copied.shadingToonyFactor).toBe(1); expect(copied.color).not.toEqual(source.color);
    copied.update(0); expect(readStudioMToonRuntimeIdentity(copied)?.backend).toBe("webgpu");
  });

  it("callback·node 입력을 바꾸면 현재 인스턴스만 미승인으로 바꾸고 변조된 clone도 거부한다", () => {
    const source = new StudioMToonNodeMaterial(), clone = source.clone();
    source.shadingToonyNode = float(.5); expect(readStudioMToonRuntimeIdentity(source)).toBeNull();
    expect(() => source.clone()).toThrow(/변조/u); expect(readStudioMToonRuntimeIdentity(clone)?.backend).toBe("webgpu");
    clone.onBeforeCompile = () => {}; expect(readStudioMToonRuntimeIdentity(clone)).toBeNull();
    expect(() => clone.setupLightingModel()).toThrow(/계약/u);
    const original = new StudioMToonNodeMaterial(); original.setupVariants = () => {};
    expect(readStudioMToonRuntimeIdentity(original)).toBeNull();
  });

  it("world/none outline 값도 저장값 그대로 유지하고 잘못된 factor는 승인하지 않는다", () => {
    for (const mode of ["none", "worldCoordinates", "screenCoordinates"] as const) {
      const material = new StudioMToonNodeMaterial({ outlineWidthMode: mode, outlineWidthFactor: 0 });
      expect(material.outlineWidthMode).toBe(mode); expect(material.outlineWidthFactor).toBe(0); expect(readStudioMToonRuntimeIdentity(material)?.backend).toBe("webgpu");
      material.shadingToonyFactor = NaN; expect(readStudioMToonRuntimeIdentity(material)).toBeNull();
    }
  });

  it("인스턴스와 prototype의 callback 교체는 모두 현재 계약 검증에서 거부한다", () => {
    const material = new StudioMToonNodeMaterial(), update = material.update;
    material.update = () => {}; expect(readStudioMToonRuntimeIdentity(material)).toBeNull();
    material.update = update; expect(readStudioMToonRuntimeIdentity(material)?.backend).toBe("webgpu");
    const original = StudioMToonNodeMaterial.prototype.setupLightingModel;
    try {
      StudioMToonNodeMaterial.prototype.setupLightingModel = () => new SdkMToonNodeMaterial().setupLightingModel();
      expect(readStudioMToonRuntimeIdentity(material)).toBeNull();
    } finally { StudioMToonNodeMaterial.prototype.setupLightingModel = original; }
    expect(readStudioMToonRuntimeIdentity(material)?.backend).toBe("webgpu");
  });

  it("outline 모드·직접광 텍스처의 graph 구조를 program cache key로 분리한다", () => {
    const material = new StudioMToonNodeMaterial({ isOutline: true, outlineWidthMode: "worldCoordinates" });
    const world = material.customProgramCacheKey(); material.outlineWidthMode = "screenCoordinates";
    const screen = material.customProgramCacheKey(); expect(screen).not.toBe(world);
    material.shadingToonyFactor = 1; material.shadingShiftFactor = .5; expect(material.customProgramCacheKey()).toBe(screen);
    const texture = new Texture(); material.shadeMultiplyTexture = texture; expect(material.customProgramCacheKey()).not.toBe(screen);
    material.shadeMultiplyTexture = null; expect(material.customProgramCacheKey()).toBe(screen); texture.dispose(); material.dispose();
  });
});
