import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { studioV6BrushMaterialGroup } from "../brush/studio-brush-v6-catalog";
import {
  BRUSH_STUDIO_V6_FULL_CAPABILITIES, analyzeBrushStudioV6Program, createBrushStudioV6Program,
  type BrushStudioV6Program, type BrushStudioV6Tuning,
} from "./brush-studio-v6-engine";
import { brushStudioV6ProviderManifestForNode } from "./brush-studio-v6-license-profile";
import { createBrushStudioV6MaterialStroke } from "./brush-studio-v6-material-engine";
import {
  brushStudioV6CellGridSize, brushStudioV6HatchingAngle, brushStudioV6HatchingSeparation,
} from "./brush-studio-v6-procedural-concept-kernels";
import {
  BRUSH_STUDIO_V6_PROCEDURAL_MODELS, BRUSH_STUDIO_V6_PROCEDURAL_TOPOLOGIES,
} from "./brush-studio-v6-procedural-family-catalog";
import { BRUSH_STUDIO_V6_PROCEDURAL_PRIMITIVE_CAP } from "./brush-studio-v6-procedural-family-engine";
import { BRUSH_STUDIO_V6_RECIPE_SEEDS } from "./brush-studio-v6-recipe-catalog";
import { BRUSH_STUDIO_V6_TOPOLOGIES } from "./brush-studio-v6-topology-catalog";
import { createBrushStudioV6TopologyStroke, type BrushTopologyContact, type BrushTopologyPrimitive } from "./brush-studio-v6-topology-engine";
import { brushStudioV6TopologyStep } from "./brush-studio-v6-topology-material";

/** 고정 접점 열의 프리미티브 스트림 SHA-256(소수 4자리 직렬화). 커널 수치를 바꾸면 의도적으로 갱신한다. */
const GOLDEN: Readonly<Record<string, string>> = {
  "harmony-sketchy": "11c09d7bdde068b5e1f04ef357d38222867c62201473afd9713ad7abc3816efd",
  "harmony-shaded": "733f95b5b8b302e57efb978572295f5fa7beef1b6bda31be160bf205f7f33d0e",
  "harmony-chrome": "69a3808bd0596c85722a59326253c6709e69e4e2970b17882d0f8b3a502148ce",
  "harmony-fur": "bd0ddfc8433979cdbe8bed6cda720af06ad6715a28eb3ae81248dc2368162cc5",
  "harmony-longfur": "f9ff6790e0a5d5021a761c3bd83d3686d10cbc01f6535c0e9ab294edde1d9f48",
  "harmony-web": "dcf6c7ab2c07bc77b5185dfd84c3793086abd11182f269b257ecb344b038903c",
  "harmony-squares": "60a669b3a1aacfea1313f747474b1b53d200701273107887e714d11f9526a506",
  "harmony-ribbon": "975184ced53c007d87263c7a4b7ee8f8bbb51b392b9c6de55b0b327b34d78c18",
  "harmony-circles": "28040c91f6929cf5992df883808391a267367fa03cc7367308638c8b79d13364",
  "harmony-grid": "58e0e6d8f16a5388e658ae3f7ba5b4ede0ef2f99d5393de186a6300a8c3eddee",
  "klecks-sketchy": "d0bbaec06b28cdbe984593d4233bd44a1245007abf5819b11de9cf51f4df0a02",
  "klecks-chemy": "25a416ffdbb9c39f705348c6659fb81635c178e89a6af27ae53f0c3ff96a9cd9",
  "hatching-crosshatch": "20dcbadef7cc664ecdca9352a15ab01f8b825dcf0a66c4499ae3e0ec3824c9e0",
  "cell-grid-tone": "fced471924474396bb7edeb035fe54367095cc26162906a425ff6b0549372fee",
  "curve-trail": "b556bf46d4c2e87e560b48167b9a517cdd3f33e7cacb45a4fca5bd6806e6d3ec",
  "particle-spray": "5620871e7a6fb109b7d8eb46e5c0d7e9d415c09cf6879cc47b9cc197553aaeb4",
};

const recipes = BRUSH_STUDIO_V6_PROCEDURAL_TOPOLOGIES.map((entry) => entry.recipeId);
const topologyFor = (recipeId: string) => BRUSH_STUDIO_V6_PROCEDURAL_TOPOLOGIES.find((entry) => entry.recipeId === recipeId)!;

function programFor(recipeId: string, tuning: Partial<BrushStudioV6Tuning> = {}): BrushStudioV6Program {
  const base = createBrushStudioV6Program(recipeId);
  return { ...base, tuning: { ...base.tuning, ...tuning } };
}
function stepFor(program: BrushStudioV6Program): number {
  const size = Math.max(1, Math.min(240, program.tuning.size));
  return brushStudioV6TopologyStep(program, Math.max(0.35, Math.min(96, size * program.tuning.spacing)));
}
/** 오가며 겹치는 지그재그(지난 통과선과 이웃) + 곧은 끝 구간. 펜 압력은 매끄럽게 변한다. */
function polyline(): { x: number; y: number; pressure: number }[] {
  return Array.from({ length: 721 }, (_, i) => {
    const t = i / 720, wave = Math.abs(((t * 9) % 2) - 1) * 2 - 1;
    return t < 0.8
      ? { x: 40 + t * 260, y: 90 + wave * 46, pressure: 0.3 + 0.6 * Math.abs(Math.sin(t * 7)) }
      : { x: 248 + (t - 0.8) * 900, y: 90 + 46 * (Math.abs(((0.8 * 9) % 2) - 1) * 2 - 1), pressure: 0.85 };
  });
}
/** 재료 엔진과 같은 방식(거리 step 등간격)으로 재표본한 위상 접점. */
function contactsFor(program: BrushStudioV6Program): BrushTopologyContact[] {
  const step = stepFor(program), size = Math.max(1, Math.min(240, program.tuning.size)), line = polyline();
  const contact = (x: number, y: number, pressure: number, direction: number, index: number): BrushTopologyContact =>
    ({ x, y, pressure, direction, index, radius: size * (0.035 + pressure * 0.465), directional: index > 0, discontinuity: false });
  const result = [contact(line[0]!.x, line[0]!.y, line[0]!.pressure, 0, 0)];
  let remaining = step;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!, b = line[i]!, length = Math.hypot(b.x - a.x, b.y - a.y), direction = Math.atan2(b.y - a.y, b.x - a.x);
    let travelled = remaining;
    while (travelled <= length) {
      const r = travelled / length;
      result.push(contact(a.x + (b.x - a.x) * r, a.y + (b.y - a.y) * r, a.pressure + (b.pressure - a.pressure) * r, direction, result.length));
      travelled += step;
    }
    remaining = travelled - length;
  }
  return result;
}
function run(program: BrushStudioV6Program, contacts = contactsFor(program)) {
  const stroke = createBrushStudioV6TopologyStroke(program, stepFor(program))!;
  const dabs = contacts.map((c) => {
    const out: BrushTopologyPrimitive[] = [];
    stroke.deposit(c, (primitive) => out.push(primitive));
    return out;
  });
  return { stroke, contacts, dabs };
}
function digest(dabs: readonly (readonly BrushTopologyPrimitive[])[]): string {
  const n = (value: number) => value.toFixed(4);
  return createHash("sha256").update(dabs.map((dab) => dab.map((p) =>
    `${p.shape}:${n(p.x)},${n(p.y)},${n(p.radiusX)},${n(p.radiusY)},${n(p.angle)},${n(p.opacity)},${n(p.mix)}`).join(";")).join("|")).digest("hex");
}
/** 캡슐 양 끝점(중심 ± (radiusX − radiusY)·방향). */
function ends(p: BrushTopologyPrimitive): readonly [readonly [number, number], readonly [number, number]] {
  const half = p.radiusX - p.radiusY, ux = Math.cos(p.angle) * half, uy = Math.sin(p.angle) * half;
  return [[p.x - ux, p.y - uy], [p.x + ux, p.y + uy]];
}
const length = (p: BrushTopologyPrimitive): number => 2 * (p.radiusX - p.radiusY);
const near = (a: readonly [number, number], x: number, y: number, tolerance = 1e-6) => Math.hypot(a[0] - x, a[1] - y) <= tolerance;
const modulo = (value: number, period: number) => ((value % period) + period) % period;
/** 각도 a 가 b 와 같은 평행선족(π 주기)인지. */
const parallel = (a: number, b: number) => Math.min(modulo(a - b, Math.PI), Math.PI - modulo(a - b, Math.PI)) < 1e-9;

afterEach(() => vi.restoreAllMocks());

describe("절차 브러시 계열 등록과 제품 노출", () => {
  it("16개 모델이 고유한 운반체·레시피로 위상 카탈로그와 V6 레시피에 한 번씩 등록된다", () => {
    expect(BRUSH_STUDIO_V6_PROCEDURAL_MODELS).toHaveLength(16);
    expect(new Set(BRUSH_STUDIO_V6_PROCEDURAL_TOPOLOGIES.map((entry) => entry.model))).toEqual(new Set(BRUSH_STUDIO_V6_PROCEDURAL_MODELS));
    for (const entry of BRUSH_STUDIO_V6_PROCEDURAL_TOPOLOGIES) {
      expect(BRUSH_STUDIO_V6_TOPOLOGIES.filter((topology) => topology.id === entry.id), entry.id).toHaveLength(1);
      const seeds = BRUSH_STUDIO_V6_RECIPE_SEEDS.filter((seed) => seed.id === entry.recipeId);
      expect(seeds, entry.recipeId).toHaveLength(1);
      expect(seeds[0]!.delta.slots?.carrier).toBe(entry.id);
    }
  });

  it("레시피는 출처 개념을 밝히고 기본 라이선스 프로필에서 차단되지 않으며 정해진 재질 탭에 놓인다", () => {
    const expectedTab: Readonly<Record<string, string>> = {
      "harmony-sketchy": "pencil", "harmony-shaded": "pencil", "harmony-web": "pencil", "klecks-sketchy": "pencil",
      "harmony-fur": "texture", "harmony-longfur": "texture", "harmony-squares": "texture", "harmony-circles": "texture",
      "harmony-grid": "texture", "harmony-chrome": "fx", "harmony-ribbon": "fx", "klecks-chemy": "fx",
      "hatching-crosshatch": "tone", "cell-grid-tone": "tone", "curve-trail": "ink", "particle-spray": "airbrush",
    };
    for (const id of recipes) {
      const seed = BRUSH_STUDIO_V6_RECIPE_SEEDS.find((entry) => entry.id === id)!;
      expect(seed.description, id).toMatch(/Harmony|Klecks|Krita 공개 매뉴얼/u);
      expect(studioV6BrushMaterialGroup(seed), id).toBe(expectedTab[id]);
      const analysis = analyzeBrushStudioV6Program(createBrushStudioV6Program(id), BRUSH_STUDIO_V6_FULL_CAPABILITIES);
      expect(analysis.providerPlan.valid, `${id}: ${analysis.providerPlan.blockedNodeIds.join(", ")}`).toBe(true);
      expect(analysis.valid, id).toBe(true);
      expect(analysis.rightsProfile).toBe("commercial-safe");
    }
  });

  it("Klecks 이식 운반체만 MIT 허용형 제공자로, 나머지는 내부 CPU 커널로 기록된다", () => {
    for (const entry of BRUSH_STUDIO_V6_PROCEDURAL_TOPOLOGIES) {
      const manifest = brushStudioV6ProviderManifestForNode(entry.id)!;
      if (entry.model.startsWith("klecks-")) {
        expect(manifest).toMatchObject({ id: "klecks-procedural-port-v1", rights: "permissive", integration: "connected" });
        expect(manifest.license).toContain("MIT");
        expect(entry.rights).toBe("permissive");
      } else {
        expect(manifest.id, entry.id).toBe("toonstudio-cpu-contact-v2");
        expect(entry.rights).toBeUndefined();
      }
    }
  });
});

describe("절차 커널 결정성·예산", () => {
  it.each(recipes)("%s 는 고정 접점 열에서 같은 스트림(해시 고정)을 내고 리셋 후 재현한다", (id) => {
    vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("Math.random 사용 금지"); });
    vi.spyOn(Date, "now").mockImplementation(() => { throw new Error("Date.now 사용 금지"); });
    const program = programFor(id);
    const first = run(program);
    expect(first.dabs.flat().length, id).toBeGreaterThan(0);
    expect(run(program).dabs).toEqual(first.dabs);
    first.stroke.reset();
    expect(first.contacts.map((c) => {
      const out: BrushTopologyPrimitive[] = [];
      first.stroke.deposit(c, (primitive) => out.push(primitive));
      return out;
    })).toEqual(first.dabs);
    expect(digest(first.dabs)).toBe(GOLDEN[id]);
  });

  it.each(recipes)("%s 는 덥마다 선언 상한 이하, 유한한 값, 고정 상태만 쓴다(극단 설정 포함)", (id) => {
    for (const tuning of [{}, { size: 240, spacing: 0.01, patternScale: 4, patternDensity: 1, patternJitter: 1, particleCount: 4096,
      bristleStrands: 128, reservoir: 1, relief: 1, friction: 1, viscosity: 0, diffusion: 1, granulation: 1, pickup: 1 },
    { size: 1, spacing: 4, patternScale: 0.1, patternDensity: 0, patternJitter: 0, particleCount: 16, bristleStrands: 8, reservoir: 0, relief: 0 }] as const) {
      const { stroke, dabs } = run(programFor(id, tuning));
      expect(stroke.maxPrimitivesPerDab).toBeLessThanOrEqual(BRUSH_STUDIO_V6_PROCEDURAL_PRIMITIVE_CAP);
      expect(stroke.retainedStateBytes).toBeLessThanOrEqual(1312);
      for (const dab of dabs) {
        expect(dab.length).toBeLessThanOrEqual(stroke.maxPrimitivesPerDab);
        for (const p of dab) {
          expect([p.x, p.y, p.radiusX, p.radiusY, p.angle, p.opacity, p.mix].every(Number.isFinite), id).toBe(true);
          expect(p.radiusX).toBeGreaterThan(0); expect(p.radiusY).toBeGreaterThan(0);
          expect(p.opacity).toBeGreaterThanOrEqual(0); expect(p.opacity).toBeLessThanOrEqual(1);
          expect(p.mix).toBeGreaterThanOrEqual(0); expect(p.mix).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it.each(recipes)("%s 는 유효하지 않은 접점을 무시하고 필압 0 에서 상태를 비운다", (id) => {
    const program = programFor(id), { stroke, contacts, dabs } = run(program);
    const out: BrushTopologyPrimitive[] = [];
    stroke.deposit({ ...contacts[3]!, x: Number.NaN }, (p) => out.push(p));
    stroke.deposit({ ...contacts[3]!, pressure: 0 }, (p) => out.push(p));
    expect(out).toEqual([]);
    const again = contacts.map((c) => { const dab: BrushTopologyPrimitive[] = []; stroke.deposit(c, (p) => dab.push(p)); return dab; });
    expect(again).toEqual(dabs);
  });

  it.each(recipes)("%s 는 15px 간격의 보통 병합 입력을 순간이동으로 잘라내지 않는다", (id) => {
    const stroke = createBrushStudioV6MaterialStroke(createBrushStudioV6Program(id));
    for (let i = 0; i <= 120; i++) stroke.push({ x: i * 15, y: 50 + Math.sin(i / 8) * 15, pressure: 0.65 });
    expect(stroke.statistics().clippedDabs).toBe(0);
    expect(stroke.statistics().emittedMarks).toBeGreaterThan(0);
  });
});

describe("Harmony 개념 모델의 동작", () => {
  /** 본선(직전 접점→현재 접점)을 뺀 연결선. */
  function links(id: string, tuning: Partial<BrushStudioV6Tuning> = {}) {
    const { contacts, dabs } = run(programFor(id, tuning));
    return dabs.map((dab, i) => dab.filter((p) => {
      const c = contacts[i]!, previous = contacts[i - 1];
      const [a, b] = ends(p);
      return !(previous && ((near(a, previous.x, previous.y, 1e-6) && near(b, c.x, c.y, 1e-6)) || (near(b, previous.x, previous.y, 1e-6) && near(a, c.x, c.y, 1e-6))));
    }));
  }
  const reachOf = (id: string, ratio: number, pressure: number) => {
    const t = programFor(id).tuning;
    return t.size * Math.min(8, t.patternScale * ratio) * (0.65 + 0.35 * pressure);
  };

  it("sketchy 는 연결 반경 안의 지난 점과만 잇는다", () => {
    const { contacts } = run(programFor("harmony-sketchy"));
    const all = links("harmony-sketchy");
    expect(all.flat().length).toBeGreaterThan(100);
    all.forEach((dab, i) => {
      const c = contacts[i]!, reach = reachOf("harmony-sketchy", 3, c.pressure);
      for (const p of dab) for (const end of ends(p)) expect(Math.hypot(end[0] - c.x, end[1] - c.y)).toBeLessThanOrEqual(reach + 1e-6);
    });
  });

  it("web 은 같은 획에서 sketchy 보다 많이 잇는다(반경 안 전부 연결)", () => {
    const tuning = { size: 24, spacing: 0.22, patternScale: 1, patternDensity: 0.7 };
    const web = links("harmony-web", tuning).flat().length, sketchy = links("harmony-sketchy", tuning).flat().length;
    expect(web).toBeGreaterThan(sketchy * 1.5);
  });

  it("shaded 는 끝 줄임 없이 현재 점에서 출발하고 멀수록 옅다", () => {
    const { contacts } = run(programFor("harmony-shaded"));
    links("harmony-shaded").forEach((dab, i) => {
      const c = contacts[i]!;
      for (const p of dab) expect(ends(p).some((end) => near(end, c.x, c.y, 1e-6))).toBe(true);
      const sorted = [...dab].sort((a, b) => length(a) - length(b));
      for (let k = 1; k < sorted.length; k++) expect(sorted[k]!.opacity).toBeLessThanOrEqual(sorted[k - 1]!.opacity + 1e-12);
    });
  });

  it("fur 털은 지난 점에서 바깥쪽으로 뻗고 longfur 털은 더 길다", () => {
    const { contacts, dabs } = run(programFor("harmony-fur"));
    let hairs = 0;
    dabs.forEach((dab, i) => {
      const c = contacts[i]!;
      for (const p of dab) {
        const [a, b] = ends(p), [inner, outer] = Math.hypot(a[0] - c.x, a[1] - c.y) <= Math.hypot(b[0] - c.x, b[1] - c.y) ? [a, b] : [b, a];
        if (near(inner, c.x, c.y, 1e-6)) continue; // 보호털(현재 점에서 솟음)
        // 안쪽 끝 = 지난 점 e + 0.06·(e − p) → e 를 복원하면 실제 지난 접점이어야 한다.
        const ex = (inner[0] + 0.06 * c.x) / 1.06, ey = (inner[1] + 0.06 * c.y) / 1.06;
        expect(contacts.slice(Math.max(0, i - 64), i).some((q) => Math.hypot(q.x - ex, q.y - ey) < 1e-6)).toBe(true);
        expect(Math.hypot(outer[0] - c.x, outer[1] - c.y)).toBeGreaterThan(Math.hypot(ex - c.x, ey - c.y));
        hairs++;
      }
    });
    expect(hairs).toBeGreaterThan(50);
    const mean = (id: string) => { const all = links(id, { size: 30, patternScale: 0.9 }).flat(); return all.reduce((sum, p) => sum + length(p), 0) / all.length; };
    expect(mean("harmony-longfur")).toBeGreaterThan(mean("harmony-fur") * 1.3);
  });

  it("chrome 은 기본색 연결선 위에 보조색 강조선을 더한다", () => {
    const all = links("harmony-chrome").flat();
    expect(all.some((p) => p.mix === 1)).toBe(true);
    expect(all.filter((p) => p.mix === 0).length).toBeGreaterThan(all.filter((p) => p.mix === 1).length);
    expect(links("harmony-chrome", { patternDensity: 0 }).flat().some((p) => p.mix === 1)).toBe(false);
  });

  it("squares 는 획 방향으로 회전한 정사각형을 그리고 곧게 그을수록 커진다", () => {
    const { dabs } = run(programFor("harmony-squares", { patternJitter: 0 }));
    const squares = dabs.filter((dab) => dab.length === 4);
    expect(squares.length).toBeGreaterThan(20);
    for (const dab of squares) {
      const sides = dab.map(length);
      for (const side of sides) expect(side).toBeCloseTo(sides[0]!, 6);
      expect(parallel(dab[0]!.angle - dab[1]!.angle, Math.PI / 2)).toBe(true);
    }
    expect(length(squares.at(-1)![0]!)).toBeGreaterThan(length(squares[0]![0]!) * 2);
  });

  it("ribbon 가닥은 기본색에서 보조색까지 퍼지고 circles 는 운동량에 따라 커진다", () => {
    const ribbon = run(programFor("harmony-ribbon")).dabs.flat();
    expect(Math.min(...ribbon.map((p) => p.mix))).toBe(0);
    expect(Math.max(...ribbon.map((p) => p.mix))).toBe(1);
    const circles = run(programFor("harmony-circles", { patternJitter: 0, patternDensity: 0 })).dabs.filter((dab) => dab.length > 0);
    expect(length(circles.at(-1)![0]!)).toBeGreaterThan(length(circles[0]![0]!) * 2);
  });

  it("grid 선분은 문서 고정 격자선 위에서 축 정렬된다", () => {
    const program = programFor("harmony-grid"), t = program.tuning;
    const cell = Math.max(2, Math.min(t.size * 8, t.size * t.patternScale * 1.2));
    const all = run(program).dabs.flat();
    expect(all.length).toBeGreaterThan(50);
    for (const p of all) {
      const [a, b] = ends(p);
      const vertical = parallel(p.angle, Math.PI / 2);
      expect(vertical || parallel(p.angle, 0)).toBe(true);
      const onLine = (value: number) => Math.min(modulo(value, cell), cell - modulo(value, cell)) < 1e-6;
      expect(onLine(vertical ? p.x : p.y)).toBe(true);
      expect(length(p)).toBeCloseTo(cell, 6);
      for (const end of [a, b]) expect(onLine(end[0]) && onLine(end[1])).toBe(true);
    }
  });
});

describe("Klecks 이식 모델의 동작", () => {
  it("sketchy 연결은 정수 절삭된 지난 점과 Klecks 반경(√2000·scale) 안에서만, 양 끝 30% 를 줄여 잇는다", () => {
    const program = programFor("klecks-sketchy"), t = program.tuning;
    const scale = t.patternScale * t.size / 20, { contacts, dabs } = run(program);
    let connections = 0;
    dabs.forEach((dab, i) => {
      if (i === 0) { expect(dab).toEqual([]); return; }
      const x = Math.trunc(contacts[i]!.x), y = Math.trunc(contacts[i]!.y);
      const earlier = contacts.slice(Math.max(1, i - 63), i).map((c) => [Math.trunc(c.x), Math.trunc(c.y)] as const);
      for (const p of dab.slice(1)) {
        const [a, b] = ends(p), [inner, outer] = Math.hypot(a[0] - x, a[1] - y) <= Math.hypot(b[0] - x, b[1] - y) ? [a, b] : [b, a];
        // inner = p + 0.3·(e − p), outer = e − 0.3·(e − p) → e = (outer − 0.3·p) / 0.7
        const ex = (outer[0] - 0.3 * x) / 0.7, ey = (outer[1] - 0.3 * y) / 0.7;
        expect(earlier.some(([qx, qy]) => Math.abs(qx - ex) < 1e-6 && Math.abs(qy - ey) < 1e-6)).toBe(true);
        expect(near(inner, x + 0.3 * (ex - x), y + 0.3 * (ey - y), 1e-6)).toBe(true);
        expect((ex - x) ** 2 + (ey - y) ** 2).toBeLessThan(2000 * scale * scale);
        connections++;
      }
    });
    expect(connections).toBeGreaterThan(100);
  });

  it("chemy 는 시작점 축 대칭 사본을 정확히 만들고 채움·윤곽을 따로 끌 수 있다", () => {
    const { contacts, dabs } = run(programFor("klecks-chemy", { patternDensity: 0.5, patternJitter: 0 }));
    const ax = contacts[0]!.x;
    for (const dab of dabs) {
      expect(dab.length % 2).toBe(0);
      for (let k = 0; k < dab.length; k += 2) {
        const original = dab[k]!, mirror = dab[k + 1]!;
        expect(mirror.x).toBeCloseTo(2 * ax - original.x, 9);
        expect(mirror.y).toBeCloseTo(original.y, 9);
        expect(parallel(mirror.angle, Math.PI - original.angle)).toBe(true);
      }
    }
    const outlineOnly = run(programFor("klecks-chemy", { patternDensity: 0, reservoir: 0 })).dabs.slice(1).flat();
    expect(outlineOnly.length).toBeGreaterThan(0);
    expect(outlineOnly.every((p) => p.mix === 1)).toBe(true);
    const fillOnly = run(programFor("klecks-chemy", { patternDensity: 0, relief: 0 })).dabs.slice(1).flat();
    expect(fillOnly.length).toBeGreaterThan(0);
    expect(fillOnly.every((p) => p.mix === 0)).toBe(true);
  });
});

describe("Krita 매뉴얼 개념 모델의 동작", () => {
  it("hatching 선은 설정 각도로 평행하고 문서 고정 간격 위에 놓이며 교차 층이 각도를 더한다", () => {
    for (const jitter of [0, 0.2, 0.7]) {
      const program = programFor("hatching-crosshatch", { patternDensity: 0, patternJitter: jitter });
      const angle = brushStudioV6HatchingAngle(jitter), separation = brushStudioV6HatchingSeparation(program.tuning.size, program.tuning.patternScale);
      const all = run(program).dabs.flat();
      expect(all.length).toBeGreaterThan(100);
      const nx = -Math.sin(angle), ny = Math.cos(angle);
      for (const p of all) {
        expect(parallel(p.angle, angle)).toBe(true);
        const offset = modulo(p.x * nx + p.y * ny, separation);
        expect(Math.min(offset, separation - offset)).toBeLessThan(1e-6);
      }
    }
    const crossed = run(programFor("hatching-crosshatch", { patternDensity: 1 })).dabs.flat();
    const families = new Set(crossed.map((p) => modulo(p.angle, Math.PI).toFixed(6)));
    expect(families.size).toBe(4);
  });

  it("cell-grid 는 붓이 지난 격자 칸 중심에 도형을 한 번씩만 놓는다", () => {
    const program = programFor("cell-grid-tone", { patternJitter: 0 });
    const cell = brushStudioV6CellGridSize(program.tuning.size, program.tuning.patternScale);
    const all = run(program).dabs.flat();
    expect(all.length).toBeGreaterThan(30);
    const keys = all.map((p) => {
      const ix = (p.x / cell) - 0.5, iy = (p.y / cell) - 0.5;
      expect(Math.abs(ix - Math.round(ix))).toBeLessThan(1e-6);
      expect(Math.abs(iy - Math.round(iy))).toBeLessThan(1e-6);
      return `${Math.round(ix)}:${Math.round(iy)}`;
    });
    // 지그재그가 같은 칸을 다시 지나도 최근 96칸 안에서는 다시 칠하지 않는다.
    for (let k = 0; k < keys.length; k++) expect(keys.slice(Math.max(0, k - 95), k)).not.toContain(keys[k]);
    for (const [relief, shape] of [[0, "ellipse"], [0.5, "ring"], [1, "capsule"]] as const) {
      expect(new Set(run(programFor("cell-grid-tone", { relief })).dabs.flat().map((p) => p.shape))).toEqual(new Set([shape]));
    }
  });

  it("curve-trail 곡선은 실제 지난 접점에서 끝난다", () => {
    const { contacts, dabs } = run(programFor("curve-trail", { patternJitter: 0.4 }));
    let curves = 0;
    dabs.forEach((dab, i) => {
      const c = contacts[i]!;
      // 0번은 직전 접점→현재 접점 본선, 이후 8개씩이 곡선 하나다. 곡선 첫 조각은 현재 점에서, 끝 조각은 지난 접점에서 끝난다.
      for (let k = 1; k + 7 < dab.length; k += 8) {
        expect(ends(dab[k]!).some((end) => near(end, c.x, c.y, 1e-6))).toBe(true);
        expect(ends(dab[k + 7]!).some((end) => contacts.slice(0, i).some((q) => near(end, q.x, q.y, 1e-6)))).toBe(true);
        curves++;
      }
    });
    expect(curves).toBeGreaterThan(50);
  });

  it("particle-spray 는 균일 분포면 반경 안, 가우시안이면 1.6 반경 안에 시드 고정 입자를 뿌린다", () => {
    for (const diffusion of [0, 1]) {
      const program = programFor("particle-spray", { diffusion }), t = program.tuning;
      const { contacts, dabs } = run(program);
      dabs.forEach((dab, i) => {
        const c = contacts[i]!, radius = t.size * t.patternScale * 0.6 * (0.45 + 0.55 * c.pressure);
        expect(dab).toHaveLength(Math.round(t.particleCount / 64));
        for (const p of dab) expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeLessThanOrEqual(radius * (diffusion ? 1.6 : 1) + 1e-6);
      });
    }
  });
});

describe("레시피 기본값", () => {
  it.each(recipes)("%s 레시피 기본 조율값은 카탈로그 묘사와 같다", (id) => {
    const program = createBrushStudioV6Program(id), entry = topologyFor(id);
    for (const [key, value] of Object.entries(entry.tuning)) expect(program.tuning[key as keyof BrushStudioV6Tuning], `${id}.${key}`).toBe(value);
    expect(program.slots).toMatchObject({ motion: "motion-direct", carrier: entry.id, surface: "surface-kent", pigment: "pigment-spectral" });
  });
});
