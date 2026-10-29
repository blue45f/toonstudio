import { beforeAll, describe, expect, it } from "vitest";

import {
  applyMybSettings, createLibMypaintIncrementalStrokeSession,
} from "../../../../../../../packages/studio-brush-platform/src/libmypaint";
import { loadLibMypaint } from "../../../../../../../packages/studio-brush-platform/src/libmypaint/index";
import { validateNativeBrushOutputPixels } from "../studio-native-brush-output-validation";

import {
  STUDIO_MYPAINT_CC0_LIBRARY_PROVENANCE, findStudioMypaintCc0Brush, listStudioMypaintCc0Groups,
  studioMypaintCc0Halo, studioMypaintCc0SurfaceBlockReason,
} from "./studio-mypaint-cc0-library-catalog";
import { STUDIO_MYPAINT_CC0_LIBRARY_ROWS } from "./studio-mypaint-cc0-library-data.generated";
import { loadStudioMypaintCc0Program } from "./studio-mypaint-cc0-library-loader";
import {
  STUDIO_MYPAINT_CC0_INPUT_ALIASES, buildStudioMypaintCc0Program, findStudioMypaintCc0BrushRow, isStudioMypaintCc0BrushId,
} from "./studio-mypaint-cc0-library-program";

import type { LibMypaintRaw } from "../../../../../../../packages/studio-brush-platform/src/libmypaint/index";

/** libmypaint 1.6.1 brushsettings.json 의 설정 64개와 입력 18개(제품 WASM 과 같은 버전). */
const SETTINGS_161 = new Set([
  "opaque", "opaque_multiply", "opaque_linearize", "radius_logarithmic", "hardness", "anti_aliasing",
  "dabs_per_basic_radius", "dabs_per_actual_radius", "dabs_per_second", "gridmap_scale", "gridmap_scale_x",
  "gridmap_scale_y", "radius_by_random", "speed1_slowness", "speed2_slowness", "speed1_gamma", "speed2_gamma",
  "offset_by_random", "offset_y", "offset_x", "offset_angle", "offset_angle_asc", "offset_angle_view",
  "offset_angle_2", "offset_angle_2_asc", "offset_angle_2_view", "offset_angle_adj", "offset_multiplier",
  "offset_by_speed", "offset_by_speed_slowness", "slow_tracking", "slow_tracking_per_dab", "tracking_noise",
  "color_h", "color_s", "color_v", "restore_color", "change_color_h", "change_color_l", "change_color_hsl_s",
  "change_color_v", "change_color_hsv_s", "smudge", "paint_mode", "smudge_transparency", "smudge_length",
  "smudge_length_log", "smudge_bucket", "smudge_radius_log", "eraser", "stroke_threshold",
  "stroke_duration_logarithmic", "stroke_holdtime", "custom_input", "custom_input_slowness",
  "elliptical_dab_ratio", "elliptical_dab_angle", "direction_filter", "lock_alpha", "colorize", "posterize",
  "posterize_num", "snap_to_pixel", "pressure_gain_log",
]);
const INPUTS_161 = new Set([
  "pressure", "speed1", "speed2", "random", "stroke", "direction", "tilt_declination", "tilt_ascension", "custom",
  "direction_angle", "attack_angle", "tilt_declinationx", "tilt_declinationy", "gridmap_x", "gridmap_y",
  "viewzoom", "barrel_rotation", "brush_radius",
]);

describe("CC0 MyPaint library data", () => {
  it("records 196 uniquely named brushes with pinned upstream provenance", () => {
    expect(STUDIO_MYPAINT_CC0_LIBRARY_ROWS).toHaveLength(196);
    expect(STUDIO_MYPAINT_CC0_LIBRARY_PROVENANCE).toMatchObject({ license: "CC0-1.0", brushCount: 196 });
    expect(STUDIO_MYPAINT_CC0_LIBRARY_PROVENANCE.commit).toMatch(/^[0-9a-f]{40}$/u);
    const ids = STUDIO_MYPAINT_CC0_LIBRARY_ROWS.map(([id]) => id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [id, sha256] of STUDIO_MYPAINT_CC0_LIBRARY_ROWS) {
      expect(isStudioMypaintCc0BrushId(id), id).toBe(true);
      expect(sha256, id).toMatch(/^[0-9a-f]{64}$/u);
    }
  });

  it("keeps the light index in the same order as the worker data", () => {
    const groups = listStudioMypaintCc0Groups();
    expect(groups.map((group) => group.id)).toEqual(["Dieterle", "Classic", "Deevad", "Ramon", "Experimental", "Tanda", "Kaerhon"]);
    expect(groups.flatMap((group) => group.brushes.map((brush) => brush.id))).toEqual(STUDIO_MYPAINT_CC0_LIBRARY_ROWS.map(([id]) => id));
    expect(groups.every((group) => group.label.length > 0 && group.brushes.length > 0)).toBe(true);
  });

  it("uses only libmypaint 1.6.1 settings and inputs, apart from the documented surfacemap aliases", () => {
    const aliasesUsed = new Set<string>();
    for (const [id, , settings] of STUDIO_MYPAINT_CC0_LIBRARY_ROWS) {
      for (const [name, base, inputs] of settings) {
        expect(SETTINGS_161.has(name), `${id} ${name}`).toBe(true);
        expect(Number.isFinite(base), `${id} ${name}`).toBe(true);
        for (const [input, flat] of Object.entries(inputs ?? {})) {
          if (!INPUTS_161.has(input)) {
            expect(STUDIO_MYPAINT_CC0_INPUT_ALIASES[input], `${id} ${name}.${input}`).toBeDefined();
            aliasesUsed.add(input);
          }
          expect(flat.length % 2, `${id} ${name}.${input}`).toBe(0);
          expect(flat.length, `${id} ${name}.${input}`).toBeGreaterThanOrEqual(4);
        }
      }
    }
    expect([...aliasesUsed].sort()).toEqual(["surfacemap_x", "surfacemap_y"]);
  });

  it("classifies which brushes cannot paint on an empty surface", () => {
    const counts = new Map<string, number>();
    for (const group of listStudioMypaintCc0Groups()) {
      for (const brush of group.brushes) counts.set(brush.surface, (counts.get(brush.surface) ?? 0) + 1);
    }
    expect(Object.fromEntries(counts)).toEqual({ paint: 157, eraser: 8, "smudge-only": 30, posterize: 1 });
    expect(studioMypaintCc0SurfaceBlockReason(findStudioMypaintCc0Brush("deevad/2B_pencil")!)).toBeNull();
    expect(studioMypaintCc0SurfaceBlockReason(findStudioMypaintCc0Brush("deevad/kneaded_eraser")!)).toMatch(/지우개/u);
    expect(studioMypaintCc0SurfaceBlockReason(findStudioMypaintCc0Brush("classic/smudge")!)).toMatch(/문지르기/u);
  });
});

describe("CC0 MyPaint brush programs", () => {
  const row = (id: string) => findStudioMypaintCc0BrushRow(STUDIO_MYPAINT_CC0_LIBRARY_ROWS, id)!;

  it("replaces only colour and base radius, keeping every other setting and curve verbatim", () => {
    const source = row("deevad/2B_pencil");
    const before = JSON.stringify(source);
    const program = buildStudioMypaintCc0Program(source, { color: "#ff0000", diameterPx: 10 });
    expect(JSON.stringify(source)).toBe(before);
    const settings = program.document.settings;
    expect(settings.color_h).toEqual({ base_value: 0, inputs: {} });
    expect(settings.color_s).toEqual({ base_value: 1, inputs: {} });
    expect(settings.color_v).toEqual({ base_value: 1, inputs: {} });
    expect(settings.radius_logarithmic!.base_value).toBeCloseTo(Math.log(5), 12);
    const sourceRadius = source[2].find(([name]) => name === "radius_logarithmic")!;
    expect(settings.radius_logarithmic!.inputs.pressure).toEqual(
      (sourceRadius[2]!.pressure as number[]).reduce<[number, number][]>((points, value, index, flat) =>
        index % 2 ? points : [...points, [value, flat[index + 1]!]], []),
    );
    for (const [name, base] of source[2]) {
      if (!["color_h", "color_s", "color_v", "radius_logarithmic"].includes(name)) expect(settings[name]!.base_value).toBe(base);
    }
  });

  it("maps blue to MyPaint hue 2/3 the way rgb_to_hsv_float does", () => {
    const program = buildStudioMypaintCc0Program(row("classic/pencil"), { color: "#0000ff", diameterPx: 4 });
    expect(program.document.settings.color_h!.base_value).toBeCloseTo(2 / 3, 12);
  });

  it("clears the default opaque_multiply pressure curve when a brush stores the setting without it", () => {
    const program = buildStudioMypaintCc0Program(row("tanda/splatter-02"), { color: "#123456", diameterPx: 8 });
    expect(program.clearedDefaultCurves).toEqual(["opaque_multiply.pressure"]);
    expect(program.document.settings.opaque_multiply!.inputs.pressure).toEqual([]);
    expect(buildStudioMypaintCc0Program(row("deevad/2B_pencil"), { color: "#123456", diameterPx: 8 }).clearedDefaultCurves).toEqual([]);
  });

  it("moves development-era surfacemap inputs onto gridmap inputs", () => {
    const program = buildStudioMypaintCc0Program(row("Dieterle/Blender"), { color: "#123456", diameterPx: 8 });
    expect(program.aliasedInputs).toContain("smudge.surfacemap_x");
    const smudge = program.document.settings.smudge!.inputs;
    expect(smudge.gridmap_x).toEqual([[0, 0], [256, 0]]);
    expect(smudge).not.toHaveProperty("surfacemap_x");
  });

  it("builds every library brush and rejects invalid requests", async () => {
    for (const source of STUDIO_MYPAINT_CC0_LIBRARY_ROWS) {
      expect(() => buildStudioMypaintCc0Program(source, { color: "#204060", diameterPx: 12 }), source[0]).not.toThrow();
    }
    expect(() => buildStudioMypaintCc0Program(row("classic/pencil"), { color: "red", diameterPx: 4 })).toThrow(/#RRGGBB/u);
    expect(() => buildStudioMypaintCc0Program(row("classic/pencil"), { color: "#000000", diameterPx: 0 })).toThrow(RangeError);
    await expect(loadStudioMypaintCc0Program("classic/no_such_brush", "#000000", 8)).rejects.toThrow(/없는 브러시/u);
    await expect(loadStudioMypaintCc0Program("../escape", "#000000", 8)).rejects.toThrow(TypeError);
    expect((await loadStudioMypaintCc0Program("ramon/100%_Opaque", "#000000", 8)).brushId).toBe("ramon/100%_Opaque");
  });

  it("programs the native brush with app semantics through the shared injection API", () => {
    const calls: string[] = [];
    const settingIds = [...SETTINGS_161], inputIds = [...INPUTS_161];
    const fake = {
      settingCount: () => settingIds.length, inputCount: () => inputIds.length,
      settingId: (name: string) => settingIds.indexOf(name), inputId: (name: string) => inputIds.indexOf(name),
      brushSetBaseValue: () => undefined,
      brushSetMappingN: (_brush: number, setting: number, input: number, n: number) => {
        calls.push(`${settingIds[setting]}.${inputIds[input]}=${n}`);
      },
      brushSetMappingPoint: () => undefined,
    } as unknown as LibMypaintRaw;
    const result = applyMybSettings(fake, 1, buildStudioMypaintCc0Program(row("tanda/splatter-02"), { color: "#123456", diameterPx: 8 }).document);
    expect(result.unknownSettings).toEqual([]);
    expect(result.unknownInputs).toEqual([]);
    expect(calls).toContain("opaque_multiply.pressure=0");
  });
});

describe("CC0 MyPaint library on the pinned libmypaint 1.6.1 WASM", () => {
  let lmp: LibMypaintRaw;
  beforeAll(async () => { lmp = await loadLibMypaint(); }, 60_000);

  it("renders every paint brush with ink inside its planned halo and blocks the rest honestly", () => {
    const strokeWidth = 160, strokeHeight = 60;
    const outcomes = new Map<string, { inked: boolean; blocked: boolean }>();
    const oversizedAtEight: string[] = [];
    for (const row of STUDIO_MYPAINT_CC0_LIBRARY_ROWS) {
      const brush = findStudioMypaintCc0Brush(row[0])!;
      // 깃털·물보라 브러시는 반지름의 수백 배까지 닿아, 8px 에서는 계획 표면이 제품 한도 2048px 를 넘는다.
      // 계획이 자르지 않고 거부하므로 그런 브러시는 2px 로 검증한다.
      const fits = (diameter: number) => strokeWidth + 2 * studioMypaintCc0Halo(brush, diameter) <= 2048;
      if (!fits(8)) oversizedAtEight.push(row[0]);
      const diameter = fits(8) ? 8 : 2;
      const program = buildStudioMypaintCc0Program(row, { color: "#204060", diameterPx: diameter });
      const halo = studioMypaintCc0Halo(brush, diameter);
      const surface = { width: strokeWidth + 2 * halo, height: strokeHeight + 2 * halo };
      const session = createLibMypaintIncrementalStrokeSession(lmp, program.document,
        { ...surface, seed: 7, primeAtFirstSample: true });
      try {
        expect(session.settings.unknownSettings, row[0]).toEqual([]);
        expect(session.settings.unknownInputs, row[0]).toEqual([]);
        session.append(Array.from({ length: 96 }, (_, index) => {
          const t = index / 95;
          return { x: halo + strokeWidth * t, y: halo + 30 + 25 * Math.sin(t * Math.PI * 2),
            pressure: 0.3 + 0.6 * Math.sin(t * Math.PI), tiltX: 0, tiltY: 0, tMs: index * 8 };
        }));
        const frame = session.finish();
        let inked = false;
        for (let offset = 3; offset < frame.length && !inked; offset += 4) inked = frame[offset] !== 0;
        // 여기서는 어떤 표면 가장자리도 문서 가장자리가 아니다. 접촉은 여백이 실제 물감을 잘랐다는 뜻이다.
        // (제품 검증은 빈 프레임도 거부하므로 물감이 있는 결과에만 적용한다.)
        if (inked) {
          expect(() => validateNativeBrushOutputPixels(frame, { x: 0, y: 0, ...surface }, surface,
            [false, false, false, false]), row[0]).not.toThrow();
        }
        outcomes.set(row[0], { inked, blocked: studioMypaintCc0SurfaceBlockReason(brush) !== null });
      } finally { session.dispose(); }
    }
    expect(oversizedAtEight).toEqual(["Dieterle/Flight_Feathers"]);
    const usable = [...outcomes].filter(([, outcome]) => !outcome.blocked);
    expect(usable).toHaveLength(157);
    expect(usable.filter(([, outcome]) => !outcome.inked).map(([id]) => id)).toEqual([]);
    // 빈 표면 브러시는 비어 있어야 한다. 단 포스터화 브러시는 고정된 레거시 획 경로가 일반 칠하기로 그린다.
    expect([...outcomes].filter(([, outcome]) => outcome.blocked && outcome.inked).map(([id]) => id))
      .toEqual(["Dieterle/Posterizer"]);
  }, 120_000);

  it("starts slow-tracking brushes at the first sample only when priming is requested", () => {
    const program = buildStudioMypaintCc0Program(
      findStudioMypaintCc0BrushRow(STUDIO_MYPAINT_CC0_LIBRARY_ROWS, "classic/pencil")!, { color: "#000000", diameterPx: 8 });
    const inkNearOrigin = (primeAtFirstSample: boolean) => {
      const session = createLibMypaintIncrementalStrokeSession(lmp, program.document,
        { width: 256, height: 160, seed: 7, finishTailSteps: 0, primeAtFirstSample });
      try {
        session.append([
          { x: 120, y: 80, pressure: 0.6, tiltX: 0, tiltY: 0, tMs: 0 },
          { x: 130, y: 80, pressure: 0.6, tiltX: 0, tiltY: 0, tMs: 8 },
        ]);
        const frame = session.finish();
        let near = 0;
        for (let y = 0; y < 40; y += 1) for (let x = 0; x < 40; x += 1) near += frame[(y * 256 + x) * 4 + 3]!;
        return near;
      } finally { session.dispose(); }
    };
    expect(inkNearOrigin(false)).toBeGreaterThan(0);
    expect(inkNearOrigin(true)).toBe(0);
  });
});
