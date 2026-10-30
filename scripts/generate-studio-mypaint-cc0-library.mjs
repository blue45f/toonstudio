#!/usr/bin/env node
/**
 * CC0 MyPaint 브러시 라이브러리 생성기 — mypaint/mypaint-brushes 저장소의 `.myb`(v3 JSON) 원문을
 * 제품이 지연 로드하는 TypeScript 생성 파일 두 개로 옮긴다. 개발 전용이며 결정적이다.
 *
 *   node scripts/generate-studio-mypaint-cc0-library.mjs --source <mypaint-brushes 체크아웃> [--commit <sha>]
 *   node scripts/generate-studio-mypaint-cc0-library.mjs --source <...> --check   (생성 결과가 커밋본과 같은지만 검사)
 *
 * 입력 권리: mypaint-brushes 의 `brushes/*` 는 Licenses.dep5 에서 CC0-1.0 으로 명시된다(작성자별 항목 포함).
 * 변환 규칙(무손실):
 *  - 설정 값과 곡선 점은 JSON 숫자를 그대로 옮긴다(배정밀도 왕복 표기).
 *  - libmypaint 기본 브러시(mypaint_brush_from_defaults)와 같은 상태가 되는 설정 — 기본값이고 입력 곡선이 없는 설정 —
 *    만 생략한다. `opaque_multiply` 는 기본 상태에 필압 곡선이 있으므로 항상 남긴다.
 *  - 입력 이름은 원문 그대로 둔다(예: 개발판 이름 `surfacemap_x`). 호환 별칭은 런타임 프로그램 단계가 명시적으로 적용한다.
 *  - 브러시 순서와 묶음은 `brushes/order.conf` 를 따른다. 원본 파일마다 SHA-256 을 기록한다.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIRECTORY = path.join(ROOT, "apps/web/src/domains/creator/brush/mypaint-library");
const INDEX_FILE = path.join(OUTPUT_DIRECTORY, "studio-mypaint-cc0-library-index.generated.ts");
const DATA_FILE = path.join(OUTPUT_DIRECTORY, "studio-mypaint-cc0-library-data.generated.ts");

/**
 * libmypaint 1.6.1 brushsettings.json 의 설정 기본값(64개). 제품 WASM 이 1.6.1 이므로 이 표가 생략 판정의 기준이다.
 * 표에 없는 설정이 원본에 있으면 생략하지 않고 그대로 싣는다(런타임이 미지원 설정을 보고한다).
 */
const LIBMYPAINT_161_DEFAULTS = Object.freeze({
  opaque: 1, opaque_multiply: 0, opaque_linearize: 0.9, radius_logarithmic: 2, hardness: 0.8,
  anti_aliasing: 1, dabs_per_basic_radius: 0, dabs_per_actual_radius: 2, dabs_per_second: 0,
  gridmap_scale: 0, gridmap_scale_x: 1, gridmap_scale_y: 1, radius_by_random: 0, speed1_slowness: 0.04,
  speed2_slowness: 0.8, speed1_gamma: 4, speed2_gamma: 4, offset_by_random: 0, offset_y: 0, offset_x: 0,
  offset_angle: 0, offset_angle_asc: 0, offset_angle_view: 0, offset_angle_2: 0, offset_angle_2_asc: 0,
  offset_angle_2_view: 0, offset_angle_adj: 0, offset_multiplier: 0, offset_by_speed: 0,
  offset_by_speed_slowness: 1, slow_tracking: 0, slow_tracking_per_dab: 0, tracking_noise: 0, color_h: 0,
  color_s: 0, color_v: 0, restore_color: 0, change_color_h: 0, change_color_l: 0, change_color_hsl_s: 0,
  change_color_v: 0, change_color_hsv_s: 0, smudge: 0, paint_mode: 1, smudge_transparency: 0,
  smudge_length: 0.5, smudge_length_log: 0, smudge_bucket: 0, smudge_radius_log: 0, eraser: 0,
  stroke_threshold: 0, stroke_duration_logarithmic: 4, stroke_holdtime: 0, custom_input: 0,
  custom_input_slowness: 0, elliptical_dab_ratio: 1, elliptical_dab_angle: 90, direction_filter: 2,
  lock_alpha: 0, colorize: 0, posterize: 0, posterize_num: 0.05, snap_to_pixel: 0, pressure_gain_log: 0,
});
const ALWAYS_KEEP = new Set(["opaque_multiply"]);
/**
 * 물감 도달 범위(변환 표면 여백)를 정하는 설정. 색인에 브러시마다 이 설정의 행(기준값과 곡선)을 싣고, 계획 단계가
 * 실제 획 속도로 libmypaint 의 계산을 따라간다(studio-mypaint-cc0-library-reach.ts).
 */
const REACH_SETTINGS = Object.freeze([
  "radius_logarithmic", "radius_by_random", "offset_by_random", "offset_x", "offset_y", "offset_angle",
  "offset_angle_asc", "offset_angle_view", "offset_angle_2", "offset_angle_2_asc", "offset_angle_2_view",
  "offset_multiplier", "offset_by_speed", "offset_by_speed_slowness", "custom_input", "speed1_gamma",
  "speed2_gamma", "speed1_slowness", "speed2_slowness", "slow_tracking", "tracking_noise", "pressure_gain_log",
]);
/** 묶음/파일 이름. 원본에는 `+`, `#`, `%`, 괄호가 들어간 이름이 있다(예: `ramon/100%_Opaque`). */
const ID_PATTERN = /^[A-Za-z0-9_]+\/[A-Za-z0-9_+\-#.%()]+$/u;

function fail(message) {
  console.error(`generate-studio-mypaint-cc0-library: ${message}`);
  process.exit(1);
}

function parseArguments(argv) {
  const options = { source: "", commit: "", check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--source") options.source = argv[++index] ?? "";
    else if (argument === "--commit") options.commit = argv[++index] ?? "";
    else if (argument === "--check") options.check = true;
    else fail(`알 수 없는 인자: ${argument}`);
  }
  if (!options.source) fail("--source <mypaint-brushes 체크아웃> 이 필요합니다.");
  return options;
}

function readOrder(brushesDirectory) {
  const lines = fs.readFileSync(path.join(brushesDirectory, "order.conf"), "utf8").split(/\r?\n/u);
  const groups = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("Group:")) {
      groups.push({ name: line.slice("Group:".length).trim(), ids: [] });
      continue;
    }
    if (!groups.length) fail(`order.conf 의 묶음 선언 전에 브러시가 있습니다: ${line}`);
    groups.at(-1).ids.push(line);
  }
  return groups;
}

/** JSON 숫자를 배정밀도 왕복 표기로 쓴다(JavaScript Number 와 같은 값). */
function number(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`유한한 숫자가 아닙니다: ${value}`);
  return Object.is(value, -0) ? "0" : String(value);
}

function encodeSetting(name, setting, file) {
  if (!setting || typeof setting !== "object") fail(`${file}: ${name} 설정 형식이 올바르지 않습니다.`);
  const inputs = setting.inputs ?? {};
  const entries = Object.keys(inputs).sort().map((input) => {
    const points = inputs[input];
    if (!Array.isArray(points) || points.length < 2 || points.length > 64) {
      fail(`${file}: ${name}.${input} 곡선 점 수가 2~64 범위를 벗어났습니다.`);
    }
    let previous = -Infinity;
    const flat = [];
    for (const point of points) {
      if (!Array.isArray(point) || point.length !== 2) fail(`${file}: ${name}.${input} 점 형식이 올바르지 않습니다.`);
      if (point[0] < previous) fail(`${file}: ${name}.${input} x 가 감소합니다.`);
      previous = point[0];
      flat.push(number(point[0]), number(point[1]));
    }
    return `${JSON.stringify(input)}: [${flat.join(", ")}]`;
  });
  const base = number(setting.base_value);
  const fallback = LIBMYPAINT_161_DEFAULTS[name];
  if (!entries.length && !ALWAYS_KEEP.has(name) && fallback !== undefined && Number(base) === fallback) return null;
  return entries.length ? `[${JSON.stringify(name)}, ${base}, { ${entries.join(", ")} }]` : `[${JSON.stringify(name)}, ${base}]`;
}

function displayName(id) {
  return id.slice(id.indexOf("/") + 1).replace(/_/gu, " ").replace(/\s+/gu, " ").trim();
}

/** 설정의 최솟값 추정: 기준값 + 입력 곡선마다 음의 최소 출력의 합. 곡선이 어떤 입력에서도 낮출 수 없는 하한이다. */
function settingMinimum(settings, name) {
  const setting = settings[name];
  if (!setting) return LIBMYPAINT_161_DEFAULTS[name] ?? 0;
  let total = setting.base_value;
  for (const points of Object.values(setting.inputs ?? {})) {
    total += Math.min(0, ...points.map((point) => point[1]));
  }
  return total;
}

/**
 * 투명한 새 표면에 그렸을 때 물감이 남는지에 대한 정적 분류. 곡선을 포함한 하한으로 판정한다
 * (예: 스머지 기준값 1에 0만 내는 곡선이 붙은 브러시는 항상 문지르기만 한다). 하한이 기준에 못 미치면
 * 입력에 따라 칠할 수 있으므로 "paint" 로 둔다. 이유 코드는 제품 UI 가 한국어 설명으로 바꾼다.
 */
function surfaceRequirement(settings) {
  // draw_dab 의 일반 칠하기 비중은 (1 − lock_alpha)(1 − colorize)(1 − posterize), 지우개는 목표 알파에 (1 − eraser)를
  // 곱한다. 값이 1 에 못 미치면 빈 표면에도 그만큼 물감이 남으므로 사실상 1 일 때만 칠하지 못하는 브러시로 본다.
  if (settingMinimum(settings, "eraser") >= 0.999) return "eraser";
  if (settingMinimum(settings, "lock_alpha") >= 0.999) return "lock-alpha";
  if (settingMinimum(settings, "colorize") >= 0.999) return "colorize";
  if (settingMinimum(settings, "posterize") >= 0.999) return "posterize";
  // libmypaint 은 스머지 값을 min(1, smudge)로 쓰므로 0.98 이상이면 붓 색이 거의 섞이지 않는다.
  if (settingMinimum(settings, "smudge") >= 0.98) return "smudge-only";
  return "paint";
}

function build(source, commit) {
  const brushesDirectory = path.join(source, "brushes");
  const groups = readOrder(brushesDirectory);
  const seen = new Set();
  const onDisk = new Set();
  for (const set of fs.readdirSync(brushesDirectory, { withFileTypes: true })) {
    if (!set.isDirectory()) continue;
    for (const file of fs.readdirSync(path.join(brushesDirectory, set.name))) {
      if (file.endsWith(".myb")) onDisk.add(`${set.name}/${file.slice(0, -4)}`);
    }
  }
  const dataLines = [];
  const indexGroups = [];
  for (const group of groups) {
    const members = [];
    for (const id of group.ids) {
      if (!ID_PATTERN.test(id)) fail(`허용하지 않는 브러시 id: ${id}`);
      if (seen.has(id)) fail(`order.conf 에 중복된 브러시 id: ${id}`);
      if (!onDisk.has(id)) fail(`order.conf 의 브러시 파일이 없습니다: ${id}.myb`);
      seen.add(id);
      const file = path.join(brushesDirectory, `${id}.myb`);
      const bytes = fs.readFileSync(file);
      const document = JSON.parse(bytes.toString("utf8"));
      if (document.version !== 3 || !document.settings || typeof document.settings !== "object") {
        fail(`${id}: .myb v3 문서가 아닙니다.`);
      }
      const settings = Object.keys(document.settings).sort()
        .map((name) => encodeSetting(name, document.settings[name], id))
        .filter((entry) => entry !== null);
      const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
      dataLines.push(`  [${JSON.stringify(id)}, ${JSON.stringify(sha256)}, [${settings.join(", ")}]],`);
      const reach = REACH_SETTINGS.filter((name) => Object.hasOwn(document.settings, name))
        .map((name) => encodeSetting(name, document.settings[name], id))
        .filter((entry) => entry !== null);
      members.push(`    [${JSON.stringify(id)}, ${JSON.stringify(displayName(id))}, ${JSON.stringify(surfaceRequirement(document.settings))}, [${reach.join(", ")}]],`);
    }
    // order.conf 의 빈 묶음(예: 사용자용 Favorites)은 브러시가 없으므로 싣지 않는다.
    if (members.length) indexGroups.push({ name: group.name, members });
  }
  const missingFromOrder = [...onDisk].filter((id) => !seen.has(id)).sort();
  if (missingFromOrder.length) fail(`order.conf 에 없는 브러시: ${missingFromOrder.join(", ")}`);
  const header = (title) => [
    "/**",
    ` * ${title} — 생성 파일이다. 직접 고치지 않는다.`,
    " *",
    " * 생성기: scripts/generate-studio-mypaint-cc0-library.mjs (개발 전용, 결정적)",
    ` * 원본: github.com/mypaint/mypaint-brushes @ ${commit} · brushes/*.myb (CC0-1.0, Licenses.dep5)`,
    " * 근거와 한계: docs/features/mypaint-cc0-brush-library.md",
    " */",
  ].join("\n");
  const index = [
    header("CC0 MyPaint 브러시 라이브러리 목록(가벼운 색인)"),
    "",
    `export const STUDIO_MYPAINT_CC0_LIBRARY_SOURCE_COMMIT = ${JSON.stringify(commit)};`,
    `export const STUDIO_MYPAINT_CC0_LIBRARY_BRUSH_COUNT = ${seen.size};`,
    "",
    "/**",
    " * 투명한 새 표면에서 물감이 남는지에 대한 정적 분류(곡선 없는 기준값으로만 판정).",
    " * paint 외의 값은 기존 물감을 지우거나(eraser) 문지르거나(smudge-only) 기존 알파·색에만 작용한다.",
    " */",
    "export type StudioMypaintCc0SurfaceRequirement = \"paint\" | \"eraser\" | \"lock-alpha\" | \"colorize\" | \"posterize\" | \"smudge-only\";",
    "",
    "/** 도달 범위 설정 행: [설정 이름, 기준값] 또는 [설정 이름, 기준값, { 입력 이름: [x0, y0, x1, y1, …] }](데이터 행과 같은 꼴). */",
    "export type StudioMypaintCc0ReachRow =",
    "  | readonly [setting: string, base: number]",
    "  | readonly [setting: string, base: number, inputs: Readonly<Record<string, readonly number[]>>];",
    "",
    "/** 도달 범위 설정의 libmypaint 1.6.1 기본값. 색인 행에 없는 설정은 이 값이고 곡선이 없다. */",
    `export const STUDIO_MYPAINT_CC0_REACH_DEFAULTS: Readonly<Record<string, number>> = Object.freeze({ ${REACH_SETTINGS.map((name) => `${name}: ${number(LIBMYPAINT_161_DEFAULTS[name])}`).join(", ")} });`,
    "",
    "/**",
    " * order.conf 순서의 묶음과 [브러시 id, 표시 이름, 표면 분류, 도달 범위 설정 행].",
    " * 표시 이름은 파일 이름에서 밑줄만 공백으로 바꾼 원문이다. 도달 범위 설정 행은 기본값과 같고 곡선이 없는 설정을 뺀다.",
    " */",
    "export type StudioMypaintCc0IndexEntry = readonly [id: string, name: string, surface: StudioMypaintCc0SurfaceRequirement, reach: readonly StudioMypaintCc0ReachRow[]];",
    "",
    "export const STUDIO_MYPAINT_CC0_LIBRARY_GROUPS: readonly (readonly [group: string, brushes: readonly StudioMypaintCc0IndexEntry[]])[] = [",
    ...indexGroups.flatMap((group) => [`  [${JSON.stringify(group.name)}, [`, ...group.members, "  ]],"]),
    "];",
    "",
  ].join("\n");
  const data = [
    header("CC0 MyPaint 브러시 설정 데이터(작업자 전용 지연 로드)"),
    "",
    "/** [설정 이름, 기준값] 또는 [설정 이름, 기준값, { 입력 이름: [x0, y0, x1, y1, …] }]. */",
    "export type StudioMypaintCc0SettingRow =",
    "  | readonly [setting: string, base: number]",
    "  | readonly [setting: string, base: number, inputs: Readonly<Record<string, readonly number[]>>];",
    "",
    "/** [브러시 id, 원본 .myb SHA-256, 설정 행]. 기본 브러시와 같은 설정은 생략했다(opaque_multiply 제외). */",
    "export type StudioMypaintCc0BrushRow = readonly [id: string, sha256: string, settings: readonly StudioMypaintCc0SettingRow[]];",
    "",
    "export const STUDIO_MYPAINT_CC0_LIBRARY_ROWS: readonly StudioMypaintCc0BrushRow[] = [",
    ...dataLines,
    "];",
    "",
  ].join("\n");
  return { index, data, count: seen.size };
}

const options = parseArguments(process.argv.slice(2));
const source = path.resolve(options.source);
let commit = options.commit;
if (!commit) {
  const head = path.join(source, ".git", "HEAD");
  if (fs.existsSync(head)) {
    const reference = fs.readFileSync(head, "utf8").trim();
    commit = reference.startsWith("ref: ")
      ? fs.readFileSync(path.join(source, ".git", reference.slice(5)), "utf8").trim()
      : reference;
  }
}
if (!/^[0-9a-f]{40}$/u.test(commit)) fail("원본 커밋(40자리 SHA)을 알 수 없습니다. --commit 으로 지정하세요.");
const result = build(source, commit);
if (options.check) {
  const current = [fs.readFileSync(INDEX_FILE, "utf8"), fs.readFileSync(DATA_FILE, "utf8")];
  if (current[0] !== result.index || current[1] !== result.data) fail("생성 파일이 원본과 다릅니다. 생성기를 다시 실행하세요.");
  console.log(`CC0 MyPaint 라이브러리 생성 파일이 최신입니다(${result.count}종).`);
} else {
  fs.mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
  fs.writeFileSync(INDEX_FILE, result.index);
  fs.writeFileSync(DATA_FILE, result.data);
  console.log(`CC0 MyPaint 라이브러리 ${result.count}종을 생성했습니다.`);
}
