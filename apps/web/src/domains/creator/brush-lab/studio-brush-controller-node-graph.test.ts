import { describe, expect, it } from "vitest";

import {
  BRUSH_GRAPH_SCHEMA_VERSION,
  compileBrushControllerGraph,
  createDefaultBrushOutputs,
  createInkVelocityBrushGraphPreset,
  emitBrushControllerWgsl,
  MAX_BRUSH_GRAPH_NODES,
  validateBrushControllerGraph,
  type BrushControllerGraph,
  type BrushControllerNode,
  type BrushDabInputSample,
} from "./studio-brush-controller-node-graph";

const BASE_DAB: BrushDabInputSample = {
  pressure: 0.8,
  tilt: 0.3,
  azimuth: 1.2,
  barrelRoll: 0.1,
  velocity: 0.25,
  strokeLength: 4.5,
  time: 0.5,
  canvasLuma: 0.9,
};

describe("studio-brush-controller-node-graph", () => {
  it("프리셋 DAG를 컴파일해 무할당 evaluateInto로 일관된 필압-속도 감응 결과를 계산한다", () => {
    const graph = createInkVelocityBrushGraphPreset();
    const compiled = compileBrushControllerGraph(graph);
    const out = createDefaultBrushOutputs();

    const ref = compiled.evaluateInto(BASE_DAB, out);
    expect(ref).toBe(out); // 동일 객체 재사용(무할당 계약)
    const slowSize = out.size;
    const splay1 = out.bristleSplay;

    // 속도가 빨라지면 invert -> clamp 때문에 선 굵기가 줄어들어야 함
    compiled.evaluateInto({ ...BASE_DAB, velocity: 0.95 }, out);
    expect(out.size).toBeLessThan(slowSize);
    expect(out.size).toBeGreaterThan(0.1);

    // 동일 입력 재평가 시 노이즈까지 완벽히 결정적
    compiled.evaluateInto(BASE_DAB, out);
    expect(out.bristleSplay).toBe(splay1);
  });

  it("사이클(순환 참조)이 있는 그래프를 정적으로 감지하고 컴파일을 차단한다", () => {
    const cyclic: BrushControllerGraph = {
      version: BRUSH_GRAPH_SCHEMA_VERSION,
      id: "cyclic-test",
      name: "사이클 테스트",
      nodes: [
        { id: "a", kind: "math", op: "add" },
        { id: "b", kind: "math", op: "mul" },
        { id: "out", kind: "output", channel: "opacity", defaultValue: 1 },
      ],
      edges: [
        { fromNodeId: "a", toNodeId: "b", toPort: 0 },
        { fromNodeId: "b", toNodeId: "a", toPort: 0 },
        { fromNodeId: "b", toNodeId: "out", toPort: 0 },
      ],
    };

    const result = validateBrushControllerGraph(cyclic);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "cycle-detected")).toBe(true);
    expect(() => compileBrushControllerGraph(cyclic)).toThrow(/cycle-detected/);
  });

  it("최대 64노드 예산을 초과하면 node-budget-exceeded 오류를 반환한다", () => {
    const nodes: BrushControllerNode[] = [];
    for (let i = 0; i < MAX_BRUSH_GRAPH_NODES + 1; i += 1) {
      nodes.push({ id: `c-${i}`, kind: "constant", value: i * 0.01 });
    }
    const oversized: BrushControllerGraph = {
      version: BRUSH_GRAPH_SCHEMA_VERSION,
      id: "oversized",
      name: "예산 초과 테스트",
      nodes,
      edges: [],
    };

    const result = validateBrushControllerGraph(oversized);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "node-budget-exceeded")).toBe(true);
  });

  it("branch, mix, step, simplex 노이즈 연산과 WGSL 코드 방출을 정확히 처리한다", () => {
    const graph: BrushControllerGraph = {
      version: BRUSH_GRAPH_SCHEMA_VERSION,
      id: "branch-mix-step",
      name: "조건 분기 및 믹스",
      nodes: [
        { id: "luma", kind: "input", channel: "canvasLuma" },
        { id: "tilt", kind: "input", channel: "tilt" },
        { id: "c-low", kind: "constant", value: 0.2 },
        { id: "c-high", kind: "constant", value: 0.9 },
        { id: "br", kind: "branch", threshold: 0.5 },
        { id: "st", kind: "step", smooth: true, edge0: 0.2, edge1: 0.8 },
        { id: "mx", kind: "mix" },
        { id: "ns", kind: "noise", noiseKind: "simplex", frequency: 4, seed: 99 },
        { id: "out-op", kind: "output", channel: "opacity", defaultValue: 1 },
        { id: "out-temp", kind: "output", channel: "tempShift", defaultValue: 0 },
      ],
      edges: [
        { fromNodeId: "luma", toNodeId: "br", toPort: 0 },
        { fromNodeId: "c-high", toNodeId: "br", toPort: 1 },
        { fromNodeId: "c-low", toNodeId: "br", toPort: 2 },
        { fromNodeId: "tilt", toNodeId: "st", toPort: 0 },
        { fromNodeId: "c-low", toNodeId: "mx", toPort: 0 },
        { fromNodeId: "br", toNodeId: "mx", toPort: 1 },
        { fromNodeId: "st", toNodeId: "mx", toPort: 2 },
        { fromNodeId: "mx", toNodeId: "out-op", toPort: 0 },
        { fromNodeId: "luma", toNodeId: "ns", toPort: 0 },
        { fromNodeId: "tilt", toNodeId: "ns", toPort: 1 },
        { fromNodeId: "ns", toNodeId: "out-temp", toPort: 0 },
      ],
    };

    const compiled = compileBrushControllerGraph(graph);
    const out = createDefaultBrushOutputs();
    compiled.evaluateInto({ ...BASE_DAB, canvasLuma: 0.8, tilt: 0.8 }, out);
    expect(out.opacity).toBeCloseTo(0.9, 5);
    expect(out.tempShift).toBeGreaterThanOrEqual(0);
    expect(out.tempShift).toBeLessThanOrEqual(1);

    compiled.evaluateInto({ ...BASE_DAB, canvasLuma: 0.1, tilt: 0.8 }, out);
    expect(out.opacity).toBeCloseTo(0.2, 5);

    const wgsl = emitBrushControllerWgsl(graph);
    expect(wgsl).toContain("fn eval_brush_controller");
    expect(wgsl).toContain("smoothstep(");
    expect(wgsl).toContain("select(");
    expect(wgsl).toContain("out_dab.opacity");
  });
});
