#!/usr/bin/env node
/**
 * `crates/studio-wasm64-drawing-core` 크레이트의 SIMD128 · Relaxed-SIMD · Full Extended Suite
 * WebAssembly 바이너리 3종을 빌드·최적화(`wasm-opt -Oz`)·V8 라이브 검증한다.
 *
 * 생성/검증 대상 (`apps/web/public/wasm/`):
 *   1. `studio-wasm64-drawing-core-simd.wasm`         (+simd128,+bulk-memory, < 56 KiB, 코어 16 exports)
 *   2. `studio-wasm64-drawing-core-relaxed-simd.wasm` (+simd128,+relaxed-simd,+bulk-memory, < 56 KiB, 코어 16 exports)
 *   3. `studio-wasm64-extended-suite.wasm`            (--features full-suite +simd128,+relaxed-simd,+bulk-memory, 전체 40 exports)
 *
 * 주의: 기본 유니버설 `< 48 KiB` 바이너리(`studio-wasm64-drawing-core.wasm`)는
 *       `scripts/build-wasm64-drawing-core.mjs` 계약 그대로 보존한다.
 *
 * 사용법:
 *   node scripts/build-wasm64-extended-suite.mjs           # 빌드 + wasm-opt 최적화 + V8 라이브 검증 + 복사
 *   node scripts/build-wasm64-extended-suite.mjs --check   # 체크인된 3종 .wasm 바이너리 검증 + V8 라이브 실행
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCoreHotpathSmoke, runExtendedSuiteSmoke } from "./lib/wasm64-extended-suite-smoke.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, "..");
export const CRATE_DIR = join(REPO_ROOT, "crates", "studio-wasm64-drawing-core");
export const CRATE_MANIFEST = join(CRATE_DIR, "Cargo.toml");
export const PUBLIC_WASM_DIR = join(REPO_ROOT, "apps", "web", "public", "wasm");

export const EXPECTED_ABI_VERSION = 1;
export const EXPECTED_HOTPATH_CAPABILITIES = 0x7f;
export const EXPECTED_EXTENDED_3D_CAPABILITIES = 0x3f;
export const EXPECTED_ATELIER_STAGE_CAPABILITIES = 0x07;
export const EXPECTED_EXTENDED_SUITE_CAPABILITIES = 0x7ffff;

const FORBIDDEN_PATH_MARKERS = Object.freeze(["/Users/", "/home/", "\\Users\\"]);

export const CORE_EXPORTS = Object.freeze([
  "memory",
  "wasm_drawing_core_abi_version",
  "wasm_hotpath_capabilities",
  "wasm_alloc",
  "wasm_free",
  "wasm_mix_pigments_km_packed",
  "wasm_mix_pigments_km16_packed",
  "wasm_mix_pigments_km16_strip",
  "wasm_sample_world_paper_height",
  "wasm_gaussian_blur_rgba",
  "wasm_unsharp_mask_rgba",
  "wasm_apply_impasto_lighting_rgba",
  "wasm_xor_tile_delta_bytes",
  "wasm_fnv1a_checksum",
  "wasm_stamp_tactile_bristle",
  "wasm_composite_tile_dirty_rect",
]);

export const EXTENDED_3D_EXPORTS = Object.freeze([
  "wasm_extended_3d_capabilities",
  "wasm_encode_morton_2d_u32",
  "wasm_encode_morton_3d_u32",
  "wasm_skin_vrm_mesh_4bone_soa",
  "wasm_extract_lt_lineart_from_gbuffer",
  "wasm_atelier_stage_3d_capabilities",
  "wasm_cull_stage_frustum_hiz",
  "wasm_resolve_stage_sphere_overlaps",
  "wasm_evaluate_stage_acoustics_and_lighting",
]);

export const VIRTUAL_3D_PHYSICS_EXPORTS = Object.freeze([
  "wasm_step_verlet_spring_chains_soa",
  "wasm_solve_finger_fabrik_chain",
  "wasm_render_foley_biquad_block",
]);

export const PRO_RASTER_TOOLS_EXPORTS = Object.freeze([
  "wasm_extended_capabilities",
  "wasm_warp_mesh_rigid_mls",
  "wasm_vectorize_stroke_cubic",
  "wasm_parse_psd_header",
  "wasm_flood_fill_rgba",
  "wasm_magic_wand_mask",
  "wasm_extract_marching_ants_segments",
  "wasm_rgba_to_oklch_batch",
  "wasm_oklch_to_rgba_batch",
  "wasm_rgba_to_cmyk_batch",
  "wasm_render_halftone_screentone",
  "wasm_liquify_displace_rgba",
]);

export const EXTENDED_SUITE_EXPORTS = Object.freeze([
  ...CORE_EXPORTS,
  ...EXTENDED_3D_EXPORTS,
  ...VIRTUAL_3D_PHYSICS_EXPORTS,
  ...PRO_RASTER_TOOLS_EXPORTS,
]);

export const ARTIFACT_SPECS = Object.freeze([
  {
    id: "core-simd",
    fileName: "studio-wasm64-drawing-core-simd.wasm",
    features: [],
    optLevel: 2,
    targetFeatures: "+simd128,+bulk-memory",
    wasmOptExtraFlags: ["--enable-simd"],
    maxBytes: 56 * 1024,
    requiredExports: CORE_EXPORTS,
    exactExports: true,
    isExtendedSuite: false,
  },
  {
    id: "core-relaxed-simd",
    fileName: "studio-wasm64-drawing-core-relaxed-simd.wasm",
    features: [],
    optLevel: 2,
    targetFeatures: "+simd128,+relaxed-simd,+bulk-memory",
    wasmOptExtraFlags: ["--enable-simd", "--enable-relaxed-simd"],
    maxBytes: 56 * 1024,
    requiredExports: CORE_EXPORTS,
    exactExports: true,
    isExtendedSuite: false,
  },
  {
    id: "extended-suite",
    fileName: "studio-wasm64-extended-suite.wasm",
    features: ["full-suite"],
    optLevel: 3,
    targetFeatures: "+simd128,+relaxed-simd,+bulk-memory",
    wasmOptExtraFlags: ["--enable-simd", "--enable-relaxed-simd"],
    maxBytes: 256 * 1024,
    requiredExports: EXTENDED_SUITE_EXPORTS,
    exactExports: true,
    isExtendedSuite: true,
  },
]);

function resolveWasmOpt() {
  const candidates = [
    process.env.WASM_OPT,
    "wasm-opt",
    join(homedir(), "emsdk", "upstream", "bin", "wasm-opt"),
    "/Users/hjunkim/emsdk/upstream/bin/wasm-opt",
    "/opt/homebrew/bin/wasm-opt",
    "/usr/local/bin/wasm-opt",
  ].filter(Boolean);

  for (const bin of candidates) {
    const probe = spawnSync(bin, ["--version"], { stdio: "pipe" });
    if (!probe.error && probe.status === 0) {
      return bin;
    }
  }
  return null;
}

function buildCargoEnv(targetFeatures) {
  const home = homedir();
  const cargoBinCandidates = [join(home, ".cargo", "bin"), "/Users/hjunkim/.cargo/bin"];
  const pathParts = (process.env.PATH ?? "").split(":").filter(Boolean);
  for (const dir of cargoBinCandidates) {
    if (existsSync(dir) && !pathParts.includes(dir)) {
      pathParts.unshift(dir);
    }
  }

  const cargoHome = process.env.CARGO_HOME ?? join(home, ".cargo");
  const flags = [
    `-C target-feature=${targetFeatures}`,
    `--remap-path-prefix=${REPO_ROOT}=/toonstudio`,
    `--remap-path-prefix=${cargoHome}=/cargo`,
    `--remap-path-prefix=${home}=/home-redacted`,
  ];
  const existing = (process.env.RUSTFLAGS ?? "").trim();
  const rustflags = existing ? `${existing} ${flags.join(" ")}` : flags.join(" ");

  return {
    ...process.env,
    PATH: pathParts.join(":"),
    RUSTFLAGS: rustflags,
  };
}

function runCargoBuild(spec) {
  const targetDir = join(CRATE_DIR, "target", "wasm-suite", spec.id);
  const args = [
    "build",
    "--manifest-path",
    CRATE_MANIFEST,
    "--target",
    "wasm32-unknown-unknown",
    "--target-dir",
    targetDir,
    "--release",
    "--config",
    `profile.release.opt-level=${spec.optLevel}`,
  ];
  if (spec.features.length > 0) {
    args.push("--features", spec.features.join(","));
  }
  const env = buildCargoEnv(spec.targetFeatures);
  const result = spawnSync("cargo", args, {
    cwd: REPO_ROOT,
    env,
    stdio: "inherit",
  });
  if (result.error) {
    throw new Error(`[${spec.id}] cargo 실행 실패: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`[${spec.id}] cargo 빌드 실패 (exit ${result.status ?? -1})`);
  }
  const rawWasm = join(
    targetDir,
    "wasm32-unknown-unknown",
    "release",
    "studio_wasm64_drawing_core.wasm",
  );
  if (!existsSync(rawWasm)) {
    throw new Error(`[${spec.id}] 컴파일된 .wasm 산출물을 찾을 수 없습니다: ${rawWasm}`);
  }
  return rawWasm;
}

function optimizeWithWasmOpt(wasmOptBin, input, output, extraFlags) {
  const args = [
    "-Oz",
    "--converge",
    "--strip-producers",
    "--enable-bulk-memory",
    "--enable-nontrapping-float-to-int",
    "--enable-sign-ext",
    ...extraFlags,
    input,
    "-o",
    output,
  ];
  const result = spawnSync(wasmOptBin, args, { cwd: REPO_ROOT, stdio: "inherit" });
  if (result.error) {
    throw new Error(`wasm-opt 실행 실패: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`wasm-opt 최적화 실패 (exit ${result.status ?? -1})`);
  }
}

export async function verifyArtifact(spec, wasmPath) {
  if (!existsSync(wasmPath)) {
    throw new Error(`[${spec.id}] .wasm 바이너리가 존재하지 않습니다: ${wasmPath}`);
  }
  const bytes = readFileSync(wasmPath);
  const byteLength = bytes.byteLength;
  if (byteLength < 8 || bytes[0] !== 0x00 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) {
    throw new Error(`[${spec.id}] 유효한 WebAssembly 매직 헤더(\\0asm)가 아닙니다`);
  }
  if (byteLength >= spec.maxBytes) {
    throw new Error(
      `[${spec.id}] .wasm 크기 예산 초과: ${byteLength.toLocaleString("en-US")} B >= 상한 ${spec.maxBytes.toLocaleString("en-US")} B`,
    );
  }
  const latin1 = bytes.toString("latin1");
  for (const marker of FORBIDDEN_PATH_MARKERS) {
    if (latin1.includes(marker)) {
      throw new Error(`[${spec.id}] 로컬 경로 마커(${marker})가 바이너리에 남아 있습니다`);
    }
  }
  if (!WebAssembly.validate(bytes)) {
    throw new Error(`[${spec.id}] Node V8 WebAssembly.validate() 실패 (${spec.targetFeatures})`);
  }

  const { instance } = await WebAssembly.instantiate(bytes, {});
  const exportsObj = instance.exports;
  const exportNames = Object.keys(exportsObj).sort();

  for (const name of spec.requiredExports) {
    if (!(name in exportsObj)) {
      throw new Error(`[${spec.id}] 필수 Wasm export 누락: ${name}`);
    }
  }
  if (spec.exactExports) {
    const expectedSorted = [...spec.requiredExports].sort();
    assert.deepEqual(
      exportNames,
      expectedSorted,
      `[${spec.id}] export 목록 불일치`,
    );
  }

  const abiVersion = Number(exportsObj.wasm_drawing_core_abi_version());
  const hotpathCaps = Number(exportsObj.wasm_hotpath_capabilities());
  assert.equal(abiVersion, EXPECTED_ABI_VERSION);
  assert.equal(hotpathCaps, EXPECTED_HOTPATH_CAPABILITIES);

  const coreTimings = runCoreHotpathSmoke(exportsObj);
  const extendedTimings = spec.isExtendedSuite ? runExtendedSuiteSmoke(exportsObj) : null;
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  return {
    id: spec.id,
    path: relative(REPO_ROOT, wasmPath),
    targetFeatures: spec.targetFeatures,
    byteLength,
    kib: Number((byteLength / 1024).toFixed(2)),
    maxKib: Number((spec.maxBytes / 1024).toFixed(0)),
    abiVersion,
    hotpathCaps,
    extended3dCaps: spec.isExtendedSuite ? Number(exportsObj.wasm_extended_3d_capabilities()) : null,
    atelierStageCaps: spec.isExtendedSuite
      ? Number(exportsObj.wasm_atelier_stage_3d_capabilities())
      : null,
    extendedCaps: spec.isExtendedSuite ? Number(exportsObj.wasm_extended_capabilities()) : null,
    sha256,
    exportCount: exportNames.length,
    exportNames,
    v8Validated: true,
    timings: extendedTimings ? { ...coreTimings, ...extendedTimings } : coreTimings,
  };
}

async function buildAll() {
  const wasmOptBin = resolveWasmOpt();
  if (wasmOptBin) {
    console.log(`[wasm64-extended-suite] wasm-opt 감지: ${wasmOptBin}`);
  } else {
    console.warn("[wasm64-extended-suite] wasm-opt 미발견 — Cargo --release 산출물을 직접 검증합니다");
  }

  const reports = [];
  mkdirSync(PUBLIC_WASM_DIR, { recursive: true });

  for (const spec of ARTIFACT_SPECS) {
    const rawWasm = runCargoBuild(spec);
    const rawSize = statSync(rawWasm).size;
    let candidate = rawWasm;
    let scratch = null;
    try {
      if (wasmOptBin) {
        scratch = mkdtempSync(join(tmpdir(), `toonstudio-${spec.id}-`));
        candidate = join(scratch, spec.fileName);
        optimizeWithWasmOpt(wasmOptBin, rawWasm, candidate, spec.wasmOptExtraFlags);
      }
      const optSize = statSync(candidate).size;
      const report = await verifyArtifact(spec, candidate);
      const destPath = join(PUBLIC_WASM_DIR, spec.fileName);
      copyFileSync(candidate, destPath);
      reports.push({
        ...report,
        path: relative(REPO_ROOT, destPath),
        rawBytes: rawSize,
        optimizedBytes: optSize,
      });
    } finally {
      if (scratch) rmSync(scratch, { recursive: true, force: true });
    }
  }
  return reports;
}

async function checkAll() {
  const reports = [];
  for (const spec of ARTIFACT_SPECS) {
    const destPath = join(PUBLIC_WASM_DIR, spec.fileName);
    reports.push(await verifyArtifact(spec, destPath));
  }
  return reports;
}

export async function main(argv = process.argv.slice(2)) {
  const checkOnly = argv.includes("--check");
  const jsonOutput = argv.includes("--json");
  const reports = checkOnly ? await checkAll() : await buildAll();

  if (jsonOutput) {
    console.log(JSON.stringify(reports, null, 2));
    return reports;
  }

  for (const r of reports) {
    const capsStr =
      r.extendedCaps !== null
        ? `hotpath=0x${r.hotpathCaps.toString(16)} ext=0x${r.extendedCaps.toString(16)} (3d=0x${r.extended3dCaps.toString(16)}, stage=0x${r.atelierStageCaps.toString(16)})`
        : `hotpath=0x${r.hotpathCaps.toString(16)}`;
    console.log(
      `[wasm64-extended-suite] 검증 통과 [${r.id}]: ${r.path} · ${r.byteLength.toLocaleString("en-US")} B (${r.kib} KiB < ${r.maxKib} KiB) · ${r.targetFeatures} · ABI v${r.abiVersion} · ${capsStr} · exports=${r.exportCount} · V8=OK · sha256=${r.sha256.slice(0, 16)}…`,
    );
  }
  return reports;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(
      `[wasm64-extended-suite] 실패: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
