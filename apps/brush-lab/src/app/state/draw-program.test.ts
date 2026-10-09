import { describe, expect, it } from "vitest";

import { PRESET_CATALOG } from "../../engine/presets/catalog";
import { BRUSH_FAMILIES } from "../../engine/presets/program-schema";
import { supportedReport, unavailableReport } from "../../lanes/lane";
import { mockDescriptor } from "../testing/mock-lane";

import {
  buildDrawOverrides,
  catalogFamilies,
  decideInitialLane,
  drawOneEuroPosition,
  FAMILY_LABELS,
  filterPresets,
  lanePresentsLive,
  lazyRadiusPx,
  nearestRankPercentile,
  resolveDrawProgram,
} from "./draw-program";
import { emptyCapability } from "./lab-store";

import type { LaneDescriptor, LaneId } from "../../lanes/lane";

const base = { stabilizerMode: "one-euro" as const, stabilizerPct: null, paperKind: "preset" as const };

describe("가족 어휘", () => {
  it("모든 가족에 한글 이름이 있고 카탈로그의 가족만 BRUSH_FAMILIES 순서로 읽는다", () => {
    for (const f of BRUSH_FAMILIES) expect(FAMILY_LABELS[f].length).toBeGreaterThan(0);
    const fams = catalogFamilies();
    expect(new Set(fams).size).toBe(fams.length);
    for (const p of PRESET_CATALOG) expect(fams).toContain(p.family);
    const order = fams.map((f) => BRUSH_FAMILIES.indexOf(f));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // 요구 어휘: 연필·목탄·잉크·수채·수묵·유화·에어브러시·마커·해칭
    const labels = fams.map((f) => FAMILY_LABELS[f]);
    for (const want of ["연필", "목탄", "잉크", "수채", "수묵", "유화", "에어브러시", "마커", "해칭"]) {
      expect(labels).toContain(want);
    }
  });
});

describe("filterPresets", () => {
  it("가족 필터·검색어·최근을 조합한다(한글 이름·id·가족 이름·설명, 대소문자 무시)", () => {
    expect(filterPresets(PRESET_CATALOG, "all", "", [])).toHaveLength(PRESET_CATALOG.length);
    const watercolor = filterPresets(PRESET_CATALOG, "watercolor", "", []);
    expect(watercolor.length).toBeGreaterThan(0);
    expect(watercolor.every((p) => p.family === "watercolor")).toBe(true);
    expect(filterPresets(PRESET_CATALOG, "all", "목탄", []).map((p) => p.id)).toContain("charcoal");
    expect(filterPresets(PRESET_CATALOG, "all", "  AIRBRUSH ", []).map((p) => p.id)).toContain("airbrush");
    expect(filterPresets(PRESET_CATALOG, "all", "수채", []).every((p) => p.family === "watercolor" || p.name.includes("수채") || p.description.includes("수채") || p.id.includes("수채"))).toBe(true);
    expect(filterPresets(PRESET_CATALOG, "pencil", "샤프", []).map((p) => p.id)).toEqual(["pencil-mechanical"]);
    expect(filterPresets(PRESET_CATALOG, "all", "존재하지않는브러시", [])).toEqual([]);
  });

  it("최근 필터는 최근 순서를 지키고 없는 id는 건너뛴다", () => {
    const ids = ["charcoal", "nope", "airbrush"];
    expect(filterPresets(PRESET_CATALOG, "recent", "", ids).map((p) => p.id)).toEqual(["charcoal", "airbrush"]);
    expect(filterPresets(PRESET_CATALOG, "recent", "에어", ids).map((p) => p.id)).toEqual(["airbrush"]);
    expect(filterPresets(PRESET_CATALOG, "recent", "", [])).toEqual([]);
  });
});

describe("buildDrawOverrides / resolveDrawProgram", () => {
  it("안정화 0..100은 1€ 모드에서만 로그 매핑 1€ 파라미터가 되고, 그 밖의 방식은 엔진 1€를 0(raw 수준)으로 둔다", () => {
    expect(drawOneEuroPosition({ stabilizerMode: "one-euro", stabilizerPct: null })).toBeNull();
    expect(drawOneEuroPosition({ stabilizerMode: "one-euro", stabilizerPct: 0 })).toEqual({ minCutoff: 30, beta: 0.12, dCutoff: 1 });
    expect(drawOneEuroPosition({ stabilizerMode: "one-euro", stabilizerPct: 100 })).toEqual({ minCutoff: 0.4, beta: 0.006, dCutoff: 1 });
    expect(drawOneEuroPosition({ stabilizerMode: "one-euro", stabilizerPct: 250 })).toEqual({ minCutoff: 0.4, beta: 0.006, dCutoff: 1 });
    for (const stabilizerMode of ["lazy-brush", "pen-spring", "off"] as const) {
      expect(drawOneEuroPosition({ stabilizerMode, stabilizerPct: 70 })).toEqual({ minCutoff: 30, beta: 0.12, dCutoff: 1 });
      expect(drawOneEuroPosition({ stabilizerMode, stabilizerPct: null })).toEqual({ minCutoff: 30, beta: 0.12, dCutoff: 1 });
    }
  });

  it("오버라이드에는 더 이상 stabilizer(선형 매핑) 키가 들어가지 않는다", () => {
    expect(buildDrawOverrides({ overrides: {}, paperKind: "preset" }).stabilizer).toBeUndefined();
    expect(resolveDrawProgram({ ...base, presetId: "pencil-hb", overrides: {}, stabilizerPct: 40 }).program?.input.oneEuro?.position.minCutoff).toBeCloseTo(
      30 * Math.pow(0.4 / 30, 0.4),
      10,
    );
  });

  it("1€ 방식에서 슬라이더 미설정(null)이면 프리셋 기본 입력 설정을 그대로 쓴다", () => {
    const r = resolveDrawProgram({ ...base, presetId: "pencil-hb", overrides: {} });
    expect(r.program?.input.oneEuro).toBeUndefined();
  });

  it("종이 종류는 종이 값 3개를 덧씌우고 '브러시 기본'은 아무것도 덧씌우지 않는다", () => {
    const rough = buildDrawOverrides({ ...base, overrides: { grain: true }, paperKind: "rough" });
    expect(rough).toMatchObject({ grain: true, paperScale: 0.8, paperRoughness: 0.85, paperAbsorbency: 0.5 });
    expect(buildDrawOverrides({ ...base, overrides: {}, paperKind: "preset" })).toEqual({});
  });

  it("크기·불투명도·흐름·종이·안정화가 프로그램에 반영되고 범위 밖 값은 오류 사유로 드러난다", () => {
    const r = resolveDrawProgram({
      presetId: "pencil-hb",
      overrides: { sizePx: 31, opacity: 0.3, flow: 0.2, grain: false },
      paperKind: "watercolor",
      stabilizerMode: "one-euro",
      stabilizerPct: 100,
    });
    expect(r.error).toBeNull();
    expect(r.program?.tip.sizePx).toBe(31);
    expect(r.program?.deposition.opacity).toBe(0.3);
    expect(r.program?.deposition.flow).toBe(0.2);
    expect(r.program?.paper).toMatchObject({ enabled: false, scale: 0.7, roughness: 0.9, absorbency: 0.85 });
    expect(r.program?.input.oneEuro?.position).toEqual({ minCutoff: 0.4, beta: 0.006, dCutoff: 1 });
    expect(r.hash).toMatch(/^[0-9a-f]{16}$/u);
    const bad = resolveDrawProgram({ ...base, presetId: "pencil-hb", overrides: { opacity: 3 } });
    expect(bad.program).toBeNull();
    expect(bad.error).toContain("스키마 범위");
    const missing = resolveDrawProgram({ ...base, presetId: "없는-브러시", overrides: {} });
    expect(missing.program).toBeNull();
    expect(missing.error).toContain("찾을 수 없다");
  });

  it("모든 카탈로그 브러시가 모든 종이 종류·안정화 극값에서 유효한 프로그램이 된다", () => {
    for (const p of PRESET_CATALOG) {
      for (const paperKind of ["preset", "smooth", "standard", "rough", "watercolor"] as const) {
        for (const pct of [null, 0, 100]) {
          const r = resolveDrawProgram({ presetId: p.id, overrides: { grain: true }, paperKind, stabilizerMode: "one-euro", stabilizerPct: pct });
          expect(r.error, `${p.id}/${paperKind}/${String(pct)}`).toBeNull();
        }
      }
    }
  });
});

describe("lazyRadiusPx", () => {
  it("로그 매핑: 슬라이더 0은 끈 없음, 100은 48 px이고 미설정은 방식 기본값(40)을 쓴다", () => {
    expect(lazyRadiusPx(0)).toBe(0);
    expect(lazyRadiusPx(100)).toBe(48);
    expect(lazyRadiusPx(1000)).toBe(48);
    expect(lazyRadiusPx(null)).toBeCloseTo(0.5 * Math.pow(96, 0.4), 10);
    expect(lazyRadiusPx(50)).toBeCloseTo(Math.sqrt(0.5 * 48), 10);
  });
});

describe("decideInitialLane", () => {
  const registry: LaneDescriptor[] = [
    mockDescriptor({ id: "cpu-reference" }),
    mockDescriptor({ id: "webgpu-compute", kind: "candidate", status: "browser-verification-required" }),
    mockDescriptor({ id: "wasm-cpu", kind: "candidate" }),
  ];
  const cap = (entries: Partial<Record<LaneId, "ok" | "no">>) => {
    const c = emptyCapability();
    for (const [id, v] of Object.entries(entries) as [LaneId, "ok" | "no"][]) {
      c[id] = v === "ok" ? supportedReport(id) : unavailableReport(id, ["webgpu-api-unavailable"]);
    }
    return c;
  };

  it("webgpu-compute가 가능하면 그것, 아니면 wasm-cpu, 아니면 cpu-reference 순으로 정한다", () => {
    expect(decideInitialLane(registry, cap({ "webgpu-compute": "ok", "wasm-cpu": "ok", "cpu-reference": "ok" }))).toEqual({ kind: "picked", laneId: "webgpu-compute" });
    expect(decideInitialLane(registry, cap({ "webgpu-compute": "no", "wasm-cpu": "ok", "cpu-reference": "ok" }))).toEqual({ kind: "picked", laneId: "wasm-cpu" });
    expect(decideInitialLane(registry, cap({ "webgpu-compute": "no", "wasm-cpu": "no", "cpu-reference": "ok" }))).toEqual({ kind: "picked", laneId: "cpu-reference" });
  });

  it("앞선 후보가 아직 probe되지 않았으면 뒤 후보로 건너뛰지 않고 기다린다", () => {
    expect(decideInitialLane(registry, cap({ "wasm-cpu": "ok", "cpu-reference": "ok" }))).toEqual({ kind: "pending" });
    expect(decideInitialLane(registry, cap({ "webgpu-compute": "no", "cpu-reference": "ok" }))).toEqual({ kind: "pending" });
  });

  it("후보가 모두 unavailable이면 none(몰래 대체하지 않는다), reserved·미등록 후보는 건너뛴다", () => {
    expect(decideInitialLane(registry, cap({ "webgpu-compute": "no", "wasm-cpu": "no", "cpu-reference": "no" }))).toEqual({ kind: "none" });
    const reserved: LaneDescriptor[] = [
      mockDescriptor({ id: "webgpu-compute", status: "reserved" }),
      mockDescriptor({ id: "cpu-reference" }),
    ];
    expect(decideInitialLane(reserved, cap({ "cpu-reference": "ok" }))).toEqual({ kind: "picked", laneId: "cpu-reference" });
  });
});

describe("lanePresentsLive / nearestRankPercentile", () => {
  it("GPU 표시 레인만 라이브 표시로 본다", () => {
    for (const id of ["webgpu-compute", "wasm-gpu-hybrid", "webgpu-instanced", "webgl2-instanced"] as const) expect(lanePresentsLive(id)).toBe(true);
    for (const id of ["cpu-reference", "wasm-cpu", "canvas2d", "platform-baseline"] as const) expect(lanePresentsLive(id)).toBe(false);
  });

  it("최근접 순위 백분위", () => {
    expect(nearestRankPercentile([], 50)).toBeNull();
    expect(nearestRankPercentile([5], 95)).toBe(5);
    const v = [10, 1, 5, 3, 2, 4, 6, 7, 8, 9];
    expect(nearestRankPercentile(v, 50)).toBe(5);
    expect(nearestRankPercentile(v, 95)).toBe(10);
    expect(v[0]).toBe(10);
  });
});
