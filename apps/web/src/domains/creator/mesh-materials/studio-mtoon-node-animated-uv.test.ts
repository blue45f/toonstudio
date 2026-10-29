// @vitest-environment jsdom
import { MToonAnimatedUVNode } from "@pixiv/three-vrm/nodes";
import { BoxGeometry, DataTexture, DirectionalLight, Matrix3, PerspectiveCamera, RGBAFormat, Scene } from "three";
import { lights } from "three/tsl";
import { Mesh, WebGPURenderer, WGSLNodeBuilder } from "three/webgpu";
import { describe, expect, it } from "vitest";

import { StudioMToonAnimatedUVNode } from "./studio-mtoon-node-animated-uv";
import { StudioMToonNodeMaterial } from "./studio-mtoon-node-material";
import { readStudioMToonRuntimeIdentity } from "./studio-mtoon-runtime-identity";

function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
type Value = number | readonly number[];
function vector(value: Value): readonly number[] { return typeof value === "number" ? [value] : value; }
function numeric(value: Value): number { if (typeof value !== "number") throw new Error("scalar graph가 아닙니다."); return value; }
function evaluate(node: unknown, coordinates: readonly number[], mask: readonly number[], phase: number, scroll: readonly number[]): Value {
  if (!object(node)) throw new Error("실제 UV graph가 없습니다.");
  const read = (child: unknown) => evaluate(child, coordinates, mask, phase, scroll);
  if (typeof node.value === "number") return node.value;
  if (object(node.value) && node.value.isVector2 === true && typeof node.value.x === "number" && typeof node.value.y === "number") return [node.value.x, node.value.y];
  if (node.isMaterialReferenceNode === true) {
    if (node.property === "uvAnimationMaskTexture") return mask;
    if (node.property === "uvAnimationRotationPhase") return phase;
    if (node.property === "uvAnimationScrollXOffset") return scroll[0] ?? NaN;
    if (node.property === "uvAnimationScrollYOffset") return scroll[1] ?? NaN;
  }
  if (node.type === "AttributeNode" && typeof node.getAttributeName === "function" && node.getAttributeName() === "uv") return coordinates;
  if (node.isVarNode === true || node.isContextNode === true || "convertTo" in node) return read(node.node);
  if (node.isSplitNode === true && typeof node.components === "string") {
    const source = vector(read(node.node)), result = [...node.components].map((name) => source["xyzw".indexOf(name)] ?? NaN);
    return result.length === 1 ? result[0] ?? NaN : result;
  }
  if (Array.isArray(node.nodes)) return node.nodes.flatMap((child: unknown) => vector(read(child)));
  if (node.method === "cos") return Math.cos(numeric(read(node.aNode)));
  if (node.method === "sin") return Math.sin(numeric(read(node.aNode)));
  if (node.method === "negate") {
    const value = read(node.aNode); return typeof value === "number" ? -value : value.map((n) => -n);
  }
  if (typeof node.op === "string") {
    const left = read(node.aNode), right = read(node.bNode), a = vector(left), b = vector(right);
    if (node.op === "*" && a.length === 2 && b.length === 4) return [
      (a[0] ?? NaN) * (b[0] ?? NaN) + (a[1] ?? NaN) * (b[1] ?? NaN),
      (a[0] ?? NaN) * (b[2] ?? NaN) + (a[1] ?? NaN) * (b[3] ?? NaN),
    ];
    const result = Array.from({ length: Math.max(a.length, b.length) }, (_, i) => {
      const x = a[a.length === 1 ? 0 : i] ?? NaN, y = b[b.length === 1 ? 0 : i] ?? NaN;
      if (node.op === "+") return x + y;
      if (node.op === "-") return x - y;
      if (node.op === "*") return x * y;
      throw new Error(`지원하지 않는 UV graph 연산: ${node.op}`);
    });
    return typeof left === "number" && typeof right === "number" ? result[0] ?? NaN : result;
  }
  throw new Error(`검증하지 않은 UV node: ${String(node.type)} ${Object.keys(node).join(",")}`);
}
const publicInputs = ["colorNode", "normalNode", "emissiveNode", "shadeColorNode", "shadingShiftNode", "rimMultiplyNode"] as const;
const textureProperties = ["map", "normalMap", "emissiveMap", "shadeMultiplyTexture", "shadingShiftTexture",
  "rimMultiplyTexture", "matcapTexture", "outlineWidthMultiplyTexture", "uvAnimationMaskTexture"] as const;
function textureFixture() {
  const textures = textureProperties.map((_, index) => {
    // R와 B가 다른 선형 mask를 포함한다. 동일 채널의 회색 fixture로 불일치를 숨기지 않는다.
    const texture = new DataTexture(new Uint8Array([0, 128, 255, 255]), 1, 1, RGBAFormat);
    texture.offset.set(index / 20, index / 30); texture.repeat.set(.8 + index / 30, .9 + index / 40);
    texture.rotation = index / 10; texture.updateMatrix(); texture.needsUpdate = true;
    return texture;
  });
  return { textures, dispose: () => textures.forEach((texture) => texture.dispose()) };
}
function builderFor(material: StudioMToonNodeMaterial, geometry: BoxGeometry) {
  // 생성·TSL 코드 작성만 수행하며 GPU init/render/compute는 호출하지 않는다.
  const renderer = new WebGPURenderer({ canvas: document.createElement("canvas") });
  // Texture WGSL 생성은 이 한 capability만 질의한다. GPU 없이 기본 비필터 F32 profile을 명시한다.
  renderer.hasFeature = (name) => { if (name !== "float32-filterable") throw new Error(`예상하지 않은 CPU profile 질의: ${name}`); return false; };
  const builder = new WGSLNodeBuilder(new Mesh(geometry, material), renderer);
  Reflect.set(builder, "camera", new PerspectiveCamera()); Reflect.set(builder, "scene", new Scene());
  Reflect.set(builder, "lightsNode", lights([new DirectionalLight()]));
  return builder;
}
function hasMaskReference(node: unknown, visited = new Set<unknown>()): boolean {
  if (!object(node) || visited.has(node)) return false;
  visited.add(node);
  if (node.isMaterialReferenceNode === true && node.property === "uvAnimationMaskTexture") return true;
  // mask sample의 바로 위 convert/context만 따라간다. UV 결과의 .x를 mask 채널로 오인하지 않는다.
  return hasMaskReference(node.node, visited);
}

describe("MToon TSL의 B mask와 원본 UV 식", () => {
  it("mask가 없으면 실제 SDK graph와 회전·scroll·음수 및 바깥 타일 값까지 동일하다", () => {
    for (const coordinates of [[.2, .7], [-2, 3], [0, 1]]) for (const phase of [0, .7, Math.PI]) {
      const original = evaluate(new MToonAnimatedUVNode(false).setup(), coordinates, [0, .2, 1, 1], phase, [.13, -.21]);
      const corrected = evaluate(new StudioMToonAnimatedUVNode(false).setup(), coordinates, [0, .2, 1, 1], phase, [.13, -.21]);
      expect(corrected).toEqual(original); expect(vector(corrected).every(Number.isFinite)).toBe(true);
    }
  });

  it("R=0/B=1과 R=1/B=0을 구분하고 중심 회전 뒤 mask가 적용된 scroll을 더한다", () => {
    const coordinates = [.7, .1], phase = .63, scroll = [.2, -.3];
    const active = new StudioMToonAnimatedUVNode(true).setup();
    vector(evaluate(active, coordinates, [1, .3, 0, 1], phase, scroll)).forEach((value, index) => { expect(value).toBeCloseTo(coordinates[index] ?? NaN, 12); });
    const actual = vector(evaluate(active, coordinates, [0, .3, 1, 1], phase, scroll));
    const x = (coordinates[0] ?? NaN) - .5, y = (coordinates[1] ?? NaN) - .5;
    expect(actual[0]).toBeCloseTo(Math.cos(phase) * x + Math.sin(phase) * y + .5 + (scroll[0] ?? NaN), 12);
    expect(actual[1]).toBeCloseTo(-Math.sin(phase) * x + Math.cos(phase) * y + .5 + (scroll[1] ?? NaN), 12);
    const old = evaluate(new MToonAnimatedUVNode(true).setup(), coordinates, [0, .3, 1, 1], phase, scroll);
    expect(old).not.toEqual(actual);
  });

  it("분수 mask는 회전과 scroll에 같은 비율을 적용하고 명시 source 참조를 유지한다", () => {
    const material = new StudioMToonNodeMaterial();
    const graph = new StudioMToonAnimatedUVNode(true, material).setup();
    const pending: unknown[] = [graph], visited = new Set<unknown>(), references: Record<string, unknown>[] = [];
    for (let index = 0; index < pending.length; index += 1) {
      const node = pending[index]; if (!object(node) || visited.has(node)) continue;
      visited.add(node);
      if (node.isMaterialReferenceNode === true) references.push(node);
      for (const key of ["node", "aNode", "bNode", "cNode", "nodes"]) {
        const child = node[key]; if (Array.isArray(child)) pending.push(...child); else if (child) pending.push(child);
      }
    }
    expect(new Set(references.map((reference) => reference.property))).toEqual(new Set([
      "uvAnimationMaskTexture", "uvAnimationRotationPhase", "uvAnimationScrollXOffset", "uvAnimationScrollYOffset",
    ]));
    for (const reference of references) expect(reference.material).toBe(material);
    for (const amount of [.25, .5, .75]) {
      const actual = vector(evaluate(graph, [1.2, -.3], [1 - amount, 0, amount, 1], .7, [.2, -.4]));
      const phase = .7 * amount;
      expect(actual[0]).toBeCloseTo(Math.cos(phase) * .7 + Math.sin(phase) * -.8 + .5 + .2 * amount, 12);
      expect(actual[1]).toBeCloseTo(-Math.sin(phase) * .7 + Math.cos(phase) * -.8 + .5 - .4 * amount, 12);
    }
    material.dispose();
  });

  it.each([false, true])("본체/outline=%s 전체 WGSL에서 모든 map의 고유 transform과 B mask를 사용하고 clone graph를 분리한다", (outline) => {
    const fixture = textureFixture(), geometry = new BoxGeometry();
    const material = new StudioMToonNodeMaterial();
    material.isOutline = outline; material.outlineWidthMode = "screenCoordinates"; material.outlineWidthFactor = .003;
    material.uvAnimationRotationPhase = .3; material.uvAnimationScrollXOffset = .15; material.uvAnimationScrollYOffset = -.2;
    material.alphaTest = .5;
    textureProperties.forEach((name, index) => { material[name] = fixture.textures[index] ?? null; });
    const clone = material.clone(), matrices = fixture.textures.map((texture) => texture.matrix.clone());
    try {
      expect(clone.alphaTest).toBe(.5);
      expect(clone.isOutline).toBe(outline); expect(clone.outlineWidthMode).toBe("screenCoordinates"); expect(clone.outlineWidthFactor).toBe(.003);
      expect(clone.uvAnimationRotationPhase).toBe(.3);
      expect(clone.uvAnimationScrollXOffset).toBe(.15);
      expect(clone.uvAnimationScrollYOffset).toBe(-.2);
      for (const target of [material, clone]) {
      const builder = builderFor(target, geometry);
      if (!("build" in builder) || typeof builder.build !== "function") throw new Error("실제 WGSL builder가 없습니다.");
      builder.build();
      const nodes: unknown = Reflect.get(builder, "nodes"); if (!(nodes instanceof Set)) throw new Error("실제 builder node 집합이 없습니다.");
      const records = [...nodes].filter(object);
      const references = records.filter((node) => node.isMaterialReferenceNode === true);
      for (const name of textureProperties.filter((name) => outline || name !== "outlineWidthMultiplyTexture")) {
        expect(references.some((node) => node.property === name), name).toBe(true);
      }
      for (const reference of references) { expect(reference.material).toBeNull(); expect(reference.reference).toBe(target); }
      const channels = records.filter((node) => node.isSplitNode === true && hasMaskReference(node.node)).map((node) => node.components);
      const chains = records.filter((node) => node.isSplitNode === true && hasMaskReference(node.node)).map((node) => {
        const result = []; let current: unknown = node;
        while (object(current)) { result.push({ type: current.type, components: current.components, property: current.property }); current = current.node; }
        return result;
      });
      expect(channels.length).toBeGreaterThan(0); expect(new Set(channels), JSON.stringify(chains)).toEqual(new Set(["z"]));
      expect(records.filter((node) => node instanceof MToonAnimatedUVNode).every((node) => node instanceof StudioMToonAnimatedUVNode)).toBe(true);
      // TextureNode가 각 Texture의 원래 matrix를 참조하므로 transform을 누락/통합하지 않는다.
      const matrixUniforms = records.filter((node) => node.isUniformNode === true && node.value instanceof Matrix3);
      for (const texture of fixture.textures.filter((_, index) => outline || textureProperties[index] !== "outlineWidthMultiplyTexture")) {
        expect(matrixUniforms.some((node) => node.value === texture.matrix)).toBe(true);
      }
      const fragment: unknown = Reflect.get(builder, "fragmentShader");
      expect(fragment).toContain("discard"); expect(fragment).toContain("textureLoad("); expect(fragment).toContain("DiffuseColor.w");
      for (const name of publicInputs) expect(target[name], name).toBeNull();
      expect(readStudioMToonRuntimeIdentity(target)?.backend).toBe("webgpu");
    }
    fixture.textures.forEach((texture, index) => { expect(texture.matrix).toEqual(matrices[index]); expect(texture.image.data).toEqual(new Uint8Array([0, 128, 255, 255])); });
    } finally { material.dispose(); clone.dispose(); fixture.dispose(); geometry.dispose(); }
  });

  it("SDK setup 중 오류가 발생해도 여섯 공개 node 입력과 승인 상태를 복원한다", () => {
    const material = new StudioMToonNodeMaterial(), fixture = textureFixture(), geometry = new BoxGeometry();
    material.uvAnimationMaskTexture = fixture.textures[8] ?? null;
    const builder = builderFor(material, geometry);
    Object.defineProperty(builder, "context", { get: () => { throw new Error("setup 실패 fixture"); } });
    try {
      expect(() => material.setup(builder)).toThrow(/setup 실패/u);
      for (const name of publicInputs) expect(material[name], name).toBeNull();
      expect(readStudioMToonRuntimeIdentity(material)?.backend).toBe("webgpu");
      const clone = material.clone();
      for (const name of publicInputs) expect(clone[name], name).toBeNull();
      clone.dispose();
    } finally { material.dispose(); fixture.dispose(); geometry.dispose(); }
  });

  it("공통 UV helper의 공개 callback 변경은 현재 재질 승인을 취소한다", () => {
    const material = new StudioMToonNodeMaterial(), original = StudioMToonAnimatedUVNode.prototype.setup;
    try {
      StudioMToonAnimatedUVNode.prototype.setup = function () { return original.call(this); };
      expect(readStudioMToonRuntimeIdentity(material)).toBeNull();
      expect(() => material.setupNormal()).toThrow(/계약/u);
    } finally { StudioMToonAnimatedUVNode.prototype.setup = original; material.dispose(); }
  });
});
