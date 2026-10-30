// @vitest-environment jsdom
import { ShaderChunk } from "three";
import { float } from "three/tsl";
import { Mesh, WebGPURenderer, WGSLNodeBuilder } from "three/webgpu";
import { describe, expect, it } from "vitest";

import { studioThreeNodePackDepthToRgba } from "./studio-three-node-depth-packing";

function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
type Value = number | readonly number[];
function number(value: Value): number { if (typeof value !== "number") throw new Error("scalar가 아닙니다."); return value; }
function evaluate(node: unknown): Value {
  if (!object(node)) throw new Error("packing node가 없습니다.");
  if (typeof node.value === "number") return node.value;
  if (object(node.value) && node.value.isVector4 === true) {
    const { x, y, z, w } = node.value;
    if (typeof x === "number" && typeof y === "number" && typeof z === "number" && typeof w === "number") return [x, y, z, w];
  }
  if (node.isVarNode === true || "convertTo" in node) return evaluate(node.node);
  if (Array.isArray(node.nodes)) return node.nodes.flatMap((child: unknown) => {
    const value = evaluate(child); return typeof value === "number" ? [value] : value;
  });
  if ("condNode" in node) { const condition = evaluate(node.condNode), yes = evaluate(node.ifNode), no = evaluate(node.elseNode); return number(condition) ? yes : no; }
  const a = () => number(evaluate(node.aNode)), b = () => number(evaluate(node.bNode));
  if (node.op === "*") return a() * b();
  if (node.op === "/") return a() / b();
  if (node.op === ">=") return a() >= b() ? 1 : 0;
  if (node.method === "floor") return Math.floor(a());
  if (node.method === "fract") return a() - Math.floor(a());
  if (node.method === "clamp") return Math.max(b(), Math.min(number(evaluate(node.cNode)), a()));
  throw new Error(`검증하지 않은 packing node: ${String(node.type ?? node.op ?? node.method)}`);
}
function shaderFunction() {
  const shader: unknown = Reflect.get(studioThreeNodePackDepthToRgba, "shaderNode");
  if (!object(shader) || typeof shader.jsFunc !== "function") throw new Error("실제 TSL 함수가 없습니다.");
  return shader;
}
function pack(value: number): Value {
  const shader = shaderFunction();
  if (typeof shader.jsFunc !== "function") throw new Error("실제 TSL 함수가 없습니다.");
  return evaluate(shader.jsFunc([float(value)]));
}

describe("Three window depth의 공통 RGBA8 packing", () => {
  it("공개 ShaderChunk의 near/far 경계와 같은 검정·흰색을 출력한다", () => {
    expect(ShaderChunk.packing).toMatch(/if\( v <= 0\.0 \)\s*return vec4\( 0\., 0\., 0\., 0\. \)/u);
    expect(ShaderChunk.packing).toMatch(/if\( v >= 1\.0 \)\s*return vec4\( 1\., 1\., 1\., 1\. \)/u);
    for (const value of [-2, 0]) expect(pack(value)).toEqual([0, 0, 0, 0]);
    for (const value of [1, 2]) expect(pack(value)).toEqual([1, 1, 1, 1]);
  });
  it("중간 깊이는 독립 정수 byte 분해와 같고 마지막 alpha byte를 버리지 않는다", () => {
    for (const value of [1e-7, .125, .5, .50000001, .731234567, .99999999]) {
      const scaled = value * 2 ** 24, integer = Math.floor(scaled);
      expect(pack(value)).toEqual([(integer >>> 16) / 255, ((integer >>> 8) & 255) / 255, (integer & 255) / 255, scaled - integer]);
    }
    const result = pack(.50000001); expect(Array.isArray(result) && result[3]).not.toBe(1);
  });
  it("실제 WGSL builder가 경계 분기와 4채널 packing을 GPU 없이 구성한다", () => {
    const renderer = new WebGPURenderer({ canvas: document.createElement("canvas") });
    const builder = new WGSLNodeBuilder(new Mesh(), renderer);
    if (!("setShaderStage" in builder) || typeof builder.setShaderStage !== "function"
      || !("buildFunctionNode" in builder) || typeof builder.buildFunctionNode !== "function") throw new Error("실제 WGSL 함수 builder가 없습니다.");
    builder.setShaderStage("fragment");
    const built: unknown = builder.buildFunctionNode(shaderFunction());
    if (!object(built) || typeof built.code !== "string") throw new Error("WGSL 출력이 없습니다.");
    expect(built.code).toContain("vec4<f32>"); expect(built.code).toContain("fract(");
    expect(built.code).toContain("floor("); expect(built.code).toContain(">=");
  });
});
