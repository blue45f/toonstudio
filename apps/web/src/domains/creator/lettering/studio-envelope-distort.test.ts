import { describe, expect, it } from "vitest";

import {
  DEFAULT_ENVELOPE,
  ENVELOPE_PRESETS,
  applyEnvelopePreset,
  envelopeHasFold,
  envelopeNodeRest,
  envelopePresetNodes,
  isIdentityEnvelope,
  moveEnvelopeNode,
  normalizeEnvelope,
  parseEnvelopePathData,
  resampleEnvelopeGrid,
  resetEnvelope,
  sampleEnvelopePoint,
  warpEnvelopePathData,
  warpEnvelopePoint,
} from "./studio-envelope-distort";

describe("normalizeEnvelope", () => {
  it("빈 입력은 기본 아치 프리셋으로 채운다", () => {
    const e = normalizeEnvelope(null);
    expect(e.presetId).toBe("arch");
    expect(e.cols).toBe(3);
    expect(e.rows).toBe(2);
    expect(e.nodes).toHaveLength(12);
  });

  it("범위 밖 값은 클램프하고 미상 프리셋은 arch로 되돌린다", () => {
    const e = normalizeEnvelope({ bend: 999, cols: 99, rows: 0, presetId: "nope" });
    expect(e.bend).toBe(100);
    expect(e.cols).toBe(4);
    expect(e.rows).toBe(1);
    expect(e.presetId).toBe("arch");
  });

  it("preset 모드에서 노드 수는 격자와 항상 일치한다", () => {
    const e = normalizeEnvelope({ cols: 2, rows: 1, nodes: [] });
    expect(e.nodes).toHaveLength(6);
  });
});

describe("프리셋·항등", () => {
  it("bend 0 프리셋은 항등이다", () => {
    const e = applyEnvelopePreset(DEFAULT_ENVELOPE, { presetId: "arch", bend: 0 });
    expect(isIdentityEnvelope(e)).toBe(true);
  });

  it("아치는 모서리가 고정되고 가운데 윗변이 위로 솟는다", () => {
    const nodes = envelopePresetNodes("arch", 100, 0, 0, 2, 1);
    // 2x1 격자: 인덱스 0=(0,0) 1=(0.5,0) 2=(1,0) / 3=(0,1) 4=(0.5,1) 5=(1,1)
    expect(nodes[0]).toEqual({ dx: 0, dy: 0 });
    expect(nodes[2]).toEqual({ dx: 0, dy: 0 });
    expect(nodes[1]!.dy).toBeLessThan(-0.3);
  });

  it("bend 부호를 뒤집으면 오프셋 부호가 뒤집힌다", () => {
    const plus = envelopePresetNodes("wave", 60, 0, 0, 4, 1);
    const minus = envelopePresetNodes("wave", -60, 0, 0, 4, 1);
    for (let i = 0; i < plus.length; i += 1) {
      expect(minus[i]!.dy).toBeCloseTo(-plus[i]!.dy, 10);
    }
  });

  it("프리셋 10종(custom 포함 11개)이 모두 유한 오프셋을 낸다", () => {
    for (const p of ENVELOPE_PRESETS) {
      const nodes = envelopePresetNodes(p.id, 80, 20, -20, 3, 3);
      for (const n of nodes) {
        expect(Number.isFinite(n.dx)).toBe(true);
        expect(Number.isFinite(n.dy)).toBe(true);
      }
    }
  });
});

describe("sampleEnvelopePoint", () => {
  it("항등 엔벨로프는 입력 좌표를 그대로 돌려준다", () => {
    const flat = resetEnvelope(DEFAULT_ENVELOPE);
    const p = sampleEnvelopePoint(flat, 0.3, 0.7);
    expect(p.x).toBeCloseTo(0.3, 10);
    expect(p.y).toBeCloseTo(0.7, 10);
  });

  it("노드 위치에서는 정확히 노드 절대 위치를 반환한다", () => {
    const e = normalizeEnvelope(DEFAULT_ENVELOPE);
    for (let i = 0; i < e.nodes.length; i += 1) {
      const { u, v } = envelopeNodeRest(e.cols, e.rows, i);
      const p = sampleEnvelopePoint(e, u, v);
      expect(p.x).toBeCloseTo(u + e.nodes[i]!.dx, 9);
      expect(p.y).toBeCloseTo(v + e.nodes[i]!.dy, 9);
    }
  });

  it("아치의 윗변 가운데는 아랫변 가운데보다 위에 있다", () => {
    const top = sampleEnvelopePoint(DEFAULT_ENVELOPE, 0.5, 0);
    const bottom = sampleEnvelopePoint(DEFAULT_ENVELOPE, 0.5, 1);
    expect(top.y).toBeLessThan(0);
    // arch 오프셋은 v와 무관하므로 아랫변도 같은 양만큼 솟는다(둘 다 1보다 위).
    expect(bottom.y).toBeLessThan(1);
    expect(top.y).toBeLessThan(bottom.y);
  });

  it("px 변환은 정규화 샘플과 비례한다", () => {
    const p = warpEnvelopePoint(DEFAULT_ENVELOPE, 100, 0, 200, 100);
    const n = sampleEnvelopePoint(DEFAULT_ENVELOPE, 0.5, 0);
    expect(p.x).toBeCloseTo(n.x * 200, 9);
    expect(p.y).toBeCloseTo(n.y * 100, 9);
  });
});

describe("편집 연산", () => {
  it("노드 드래그는 mesh 모드로 전환하고 custom이 된다", () => {
    const e = moveEnvelopeNode(DEFAULT_ENVELOPE, 5, 0.2, -0.1);
    expect(e.mode).toBe("mesh");
    expect(e.presetId).toBe("custom");
    expect(e.nodes[5]).toEqual({ dx: 0.2, dy: -0.1 });
    // 원본 불변
    expect(DEFAULT_ENVELOPE.mode).toBe("preset");
  });

  it("노드 오프셋은 ±0.6으로 클램프된다", () => {
    const e = moveEnvelopeNode(DEFAULT_ENVELOPE, 0, 5, -5);
    expect(e.nodes[0]).toEqual({ dx: 0.6, dy: -0.6 });
  });

  it("없는 인덱스는 원본 객체를 그대로 반환한다", () => {
    expect(moveEnvelopeNode(DEFAULT_ENVELOPE, 999, 0.1, 0.1)).toBe(DEFAULT_ENVELOPE);
  });

  it("격자 해상도를 바꿔도 새 노드 위치에서 곡면이 정확히 유지된다", () => {
    const resampled = resampleEnvelopeGrid(DEFAULT_ENVELOPE, 2, 1);
    expect(resampled.nodes).toHaveLength(6);
    // 리샘플 불변식: 새 노드 rest 위치에서는 새 곡면 == 옛 곡면 (보간이 노드를 통과)
    for (let i = 0; i < resampled.nodes.length; i += 1) {
      const { u, v } = envelopeNodeRest(resampled.cols, resampled.rows, i);
      const before = sampleEnvelopePoint(DEFAULT_ENVELOPE, u, v);
      const after = sampleEnvelopePoint(resampled, u, v);
      expect(after.x).toBeCloseTo(before.x, 9);
      expect(after.y).toBeCloseTo(before.y, 9);
    }
  });

  it("온건한 프리셋은 접힘이 없고, 위쪽 두 행을 아래 끝 너머로 밀면 접힘이 감지된다", () => {
    expect(envelopeHasFold(DEFAULT_ENVELOPE)).toBe(false);
    // 윗행(인덱스 1,2)·가운데행(5,6)을 dy +0.6으로 밀면 가운데행 y≈1.1이 아랫행(1.0)을 역전한다
    let e = DEFAULT_ENVELOPE;
    for (const idx of [1, 2, 5, 6]) e = moveEnvelopeNode(e, idx, 0, 0.6);
    expect(envelopeHasFold(e)).toBe(true);
  });
});

describe("warpEnvelopePathData", () => {
  const RECT = "M0 0L200 0L200 100L0 100Z";
  const BOUNDS = { width: 200, height: 100 };

  it("항등이면 입력 문자열을 그대로 반환한다", () => {
    const flat = resetEnvelope(DEFAULT_ENVELOPE);
    expect(warpEnvelopePathData(flat, RECT, BOUNDS)).toBe(RECT);
  });

  it("아치를 적용하면 윗변 가운데가 위로 솟고 Z가 보존된다", () => {
    const out = warpEnvelopePathData(DEFAULT_ENVELOPE, RECT, BOUNDS);
    expect(out.endsWith("Z")).toBe(true);
    const cmds = parseEnvelopePathData(out);
    const ys = cmds.filter((c) => c.t === "L").map((c) => (c as { y: number }).y);
    expect(Math.min(...ys)).toBeLessThan(-5); // 윗변 가운데가 박스 위로 솟는다
  });

  it("곡선(Q/C)도 분할되어 왜곡되고 시작점 M은 모서리를 유지한다", () => {
    const out = warpEnvelopePathData(DEFAULT_ENVELOPE, "M0 100Q100 -50 200 100C150 0 50 0 0 100Z", BOUNDS);
    const cmds = parseEnvelopePathData(out);
    expect(cmds[0]).toEqual({ t: "M", x: 0, y: 100 });
    expect(cmds.length).toBeGreaterThan(6); // 분할된 폴리라인
  });

  it("지원하지 않는 커맨드는 조용히 넘기지 않고 throw한다", () => {
    expect(() => warpEnvelopePathData(DEFAULT_ENVELOPE, "M0 0H100", BOUNDS)).toThrow();
  });

  it("결정적이다 — 같은 입력은 같은 문자열", () => {
    expect(warpEnvelopePathData(DEFAULT_ENVELOPE, RECT, BOUNDS)).toBe(
      warpEnvelopePathData(DEFAULT_ENVELOPE, RECT, BOUNDS),
    );
  });
});
