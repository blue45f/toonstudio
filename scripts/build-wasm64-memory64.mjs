#!/usr/bin/env node
/**
 * `crates/studio-wasm64-drawing-core` 크레이트를 `wasm64-unknown-unknown` (`memory64`, `flags=0x04`, `i64` 포인터 ABI)
 * 실물 타깃으로 컴파일·최적화(`wasm-opt -Oz --enable-memory64`)하고 Section 5(Memory) 플래그 및 V8 런타임을 검증한다.
 *
 * 생성/검증 대상 (`apps/web/public/wasm/`, 기존 Safari/구형 호환 `wasm32` 4종은 그대로 보존):
 *   1. `studio-wasm64-drawing-core-memory64.wasm` (+simd128,+bulk-memory, 코어 16 exports, flags & 0x04 !== 0)
 *   2. `studio-wasm64-extended-suite-memory64.wasm` (--features full-suite, +simd128,+relaxed-simd,+bulk-memory, 전체 62 exports, flags & 0x04 !== 0)
 *
 * 사용법:
 *   node scripts/build-wasm64-memory64.mjs           # 빌드 + wasm-opt + Section 5 flags(0x04) 강제 검증 + V8 실행 + 복사
 *   node scripts/build-wasm64-memory64.mjs --check   # 체크인된 2종 memory64 .wasm 바이너리 검증 + V8 라이브 실행
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
import {
  CORE_EXPORTS,
  EXPECTED_ABI_VERSION,
  EXPECTED_HOTPATH_CAPABILITIES,
  EXTENDED_SUITE_EXPORTS,
} from "./build-wasm64-extended-suite.mjs";
import { runCoreHotpathSmoke, runExtendedSuiteSmoke } from "./lib/wasm64-extended-suite-smoke.mjs";
import {
  WASM_MEMORY64_FLAG,
  createDualWidthExportsAdapter,
  inspectWasmBinaryMemorySection,
} from "./lib/wasm64-memory64-abi-adapter.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, "..");
export const CRATE_DIR = join(REPO_ROOT, "crates", "studio-wasm64-drawing-core");
export const CRATE_MANIFEST = join(CRATE_DIR, "Cargo.toml");
export const PUBLIC_WASM_DIR = join(REPO_ROOT, "apps", "web", "public", "wasm");

const FORBIDDEN_PATH_MARKERS = Object.freeze(["/Users/", "/home/", "\\Users\\"]);

export const MEMORY64_ARTIFACT_SPECS = Object.freeze([
  {
    id: "core-memory64",
    fileName: "studio-wasm64-drawing-core-memory64.wasm",
    features: [],
    optLevel: 2,
    targetFeatures: "+simd128,+bulk-memory",
    wasmOptExtraFlags: ["--enable-memory64", "--enable-simd"],
    maxBytes: 64 * 1024,
    requiredExports: CORE_EXPORTS,
    exactExports: true,
    isExtendedSuite: false,
  },
  {
    id: "extended-suite-memory64",
    fileName: "studio-wasm64-extended-suite-memory64.wasm",
    features: ["full-suite"],
    optLevel: 3,
    targetFeatures: "+simd128,+relaxed-simd,+bulk-memory",
    wasmOptExtraFlags: ["--enable-memory64", "--enable-simd", "--enable-relaxed-simd"],
    maxBytes: 340 * 1024,
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

function buildCargoMemory64Env(targetFeatures) {
  const home = homedir();
  const cargoBinCandidates = [join(home, ".cargo", "bin"), "/Users/hjunkim/.cargo/bin"];
  const pathParts = (process.env.PATH ?? "").split(":").filter(Boolean);
  for (const dir of cargoBinCandidates) {
    if (existsSync(dir) && !pathParts.includes(dir)) {
      pathParts.unshift(dir);
    }
  }

  const cargoHome = process.env.CARGO_HOME ?? join(home, ".cargo");
  const rustupHome = process.env.RUSTUP_HOME ?? join(home, ".rustup");
  const flags = [
    `-C target-feature=${targetFeatures}`,
    `--remap-path-prefix=${REPO_ROOT}=/toonstudio`,
    `--remap-path-prefix=${cargoHome}=/cargo`,
    `--remap-path-prefix=${rustupHome}=/rustup`,
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

function ensureNightlyRustSrc(env) {
  const probe = spawnSync("rustup", ["run", "nightly", "rustc", "--version"], {
    cwd: REPO_ROOT,
    env,
    stdio: "pipe",
  });
  if (probe.error || probe.status !== 0) {
    throw new Error(
      "wasm64-unknown-unknown 빌드를 위해 nightly 툴체인 및 rust-src 컴포넌트가 필요합니다 (rustup toolchain install nightly --profile minimal --component rust-src)",
    );
  }
}

function runCargoMemory64Build(spec) {
  const env = buildCargoMemory64Env(spec.targetFeatures);
  ensureNightlyRustSrc(env);

  const targetDir = join(CRATE_DIR, "target", "wasm64-memory64-suite", spec.id);
  const args = [
    "+nightly",
    "build",
    "-Z",
    "build-std=std,panic_abort",
    "--manifest-path",
    CRATE_MANIFEST,
    "--target",
    "wasm64-unknown-unknown",
    "--target-dir",
    targetDir,
    "--release",
    "--config",
    `profile.release.opt-level=${spec.optLevel}`,
  ];
  if (spec.features.length > 0) {
    args.push("--features", spec.features.join(","));
  }

  const result = spawnSync("cargo", args, {
    cwd: REPO_ROOT,
    env,
    stdio: "inherit",
  });
  if (result.error) {
    throw new Error(`[${spec.id}] cargo +nightly 실행 실패: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`[${spec.id}] cargo wasm64-unknown-unknown 빌드 실패 (exit ${result.status ?? -1})`);
  }

  const rawWasm = join(
    targetDir,
    "wasm64-unknown-unknown",
    "release",
    "studio_wasm64_drawing_core.wasm",
  );
  if (!existsSync(rawWasm)) {
    throw new Error(`[${spec.id}] 컴파일된 memory64 .wasm 산출물을 찾을 수 없습니다: ${rawWasm}`);
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
    throw new Error(`wasm-opt memory64 최적화 실패 (exit ${result.status ?? -1})`);
  }
}

export async function verifyMemory64Artifact(spec, wasmPath) {
  if (!existsSync(wasmPath)) {
    throw new Error(`[${spec.id}] .wasm 바이너리가 존재하지 않습니다: ${wasmPath}`);
  }
  const bytes = readFileSync(wasmPath);
  const byteLength = bytes.byteLength;

  const memSection = inspectWasmBinaryMemorySection(bytes);
  if (!memSection.validWasmHeader) {
    throw new Error(`[${spec.id}] 유효한 WebAssembly 매직 헤더(\\0asm v1)가 아닙니다`);
  }
  if (!memSection.hasMemorySection || memSection.flags === null) {
    throw new Error(`[${spec.id}] WebAssembly Section 5(Memory)가 존재하지 않습니다`);
  }
  if ((memSection.flags & WASM_MEMORY64_FLAG) !== WASM_MEMORY64_FLAG || !memSection.isMemory64) {
    throw new Error(
      `[${spec.id}] Section 5(Memory) flags(0x${memSection.flags.toString(16)})에 memory64 비트(0x04)가 켜져 있지 않습니다!`,
    );
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
    throw new Error(`[${spec.id}] Node V8 WebAssembly.validate() 실패 (memory64 + ${spec.targetFeatures})`);
  }

  const { instance } = await WebAssembly.instantiate(bytes, {});
  const rawExports = instance.exports;
  const exportNames = Object.keys(rawExports).sort();

  for (const name of spec.requiredExports) {
    if (!(name in rawExports)) {
      throw new Error(`[${spec.id}] 필수 Wasm export 누락: ${name}`);
    }
  }
  if (spec.exactExports) {
    assert.deepEqual(exportNames, [...spec.requiredExports].sort(), `[${spec.id}] export 목록 불일치`);
  }

  // 원시 64-bit i64 포인터 FFI 직접 검증 (wasm_alloc(BigInt) -> bigint 반환)
  const rawPtr = rawExports.wasm_alloc(64n);
  assert.equal(typeof rawPtr, "bigint", `[${spec.id}] wasm_alloc 반환 타입이 bigint(i64)가 아닙니다`);
  assert.ok(rawPtr > 0n, `[${spec.id}] wasm_alloc(64n) 포인터가 양수가 아닙니다`);
  rawExports.wasm_free(rawPtr, 64n);

  const dual = createDualWidthExportsAdapter(rawExports, true);
  const abiVersion = Number(dual.exports.wasm_drawing_core_abi_version());
  const hotpathCaps = Number(dual.exports.wasm_hotpath_capabilities());
  assert.equal(abiVersion, EXPECTED_ABI_VERSION);
  assert.equal(hotpathCaps, EXPECTED_HOTPATH_CAPABILITIES);

  const coreTimings = runCoreHotpathSmoke(dual.exports);
  const extendedTimings = spec.isExtendedSuite ? runExtendedSuiteSmoke(dual.exports) : null;
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  return {
    id: spec.id,
    path: relative(REPO_ROOT, wasmPath),
    addressBits: 64,
    memoryFlagsHex: `0x${memSection.flags.toString(16).padStart(2, "0")}`,
    initialPages: memSection.initialPages?.toString() ?? null,
    targetFeatures: `memory64,${spec.targetFeatures}`,
    byteLength,
    kib: Number((byteLength / 1024).toFixed(2)),
    maxKib: Number((spec.maxBytes / 1024).toFixed(0)),
    abiVersion,
    hotpathCaps,
    extendedCaps: spec.isExtendedSuite ? Number(dual.exports.wasm_extended_capabilities()) : null,
    wave2Caps: spec.isExtendedSuite ? Number(dual.exports.wasm_wave2_capabilities()) : null,
    wave3Caps: spec.isExtendedSuite ? Number(dual.exports.wasm_wave3_capabilities()) : null,
    sha256,
    exportCount: exportNames.length,
    exportNames,
    v8Memory64Validated: true,
    timings: extendedTimings ? { ...coreTimings, ...extendedTimings } : coreTimings,
  };
}

async function buildAllMemory64(onlyId = null) {
  const wasmOptBin = resolveWasmOpt();
  if (wasmOptBin) {
    console.log(`[wasm64-memory64] wasm-opt 감지: ${wasmOptBin}`);
  } else {
    console.warn("[wasm64-memory64] wasm-opt 미발견 — Cargo --release 산출물을 직접 검증합니다");
  }

  const specs = onlyId
    ? MEMORY64_ARTIFACT_SPECS.filter((s) => s.id === onlyId)
    : MEMORY64_ARTIFACT_SPECS;
  if (specs.length === 0) {
    throw new Error(`알 수 없는 memory64 아티팩트 대상(--only): ${onlyId}`);
  }

  const reports = [];
  mkdirSync(PUBLIC_WASM_DIR, { recursive: true });

  for (const spec of specs) {
    const rawWasm = runCargoMemory64Build(spec);
    const rawSize = statSync(rawWasm).size;
    // 원시 Cargo 산출물 자체도 Section 5 flags & 0x04가 켜져 있는지 즉시 확인
    const rawMem = inspectWasmBinaryMemorySection(readFileSync(rawWasm));
    if (!rawMem.isMemory64 || rawMem.flags === null || (rawMem.flags & WASM_MEMORY64_FLAG) === 0) {
      throw new Error(`[${spec.id}] 원시 Cargo 산출물이 memory64(0x04)가 아닙니다`);
    }

    let candidate = rawWasm;
    let scratch = null;
    try {
      if (wasmOptBin) {
        scratch = mkdtempSync(join(tmpdir(), `toonstudio-${spec.id}-`));
        candidate = join(scratch, spec.fileName);
        optimizeWithWasmOpt(wasmOptBin, rawWasm, candidate, spec.wasmOptExtraFlags);
      }
      const optSize = statSync(candidate).size;
      const report = await verifyMemory64Artifact(spec, candidate);
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

async function checkAllMemory64() {
  const reports = [];
  for (const spec of MEMORY64_ARTIFACT_SPECS) {
    const destPath = join(PUBLIC_WASM_DIR, spec.fileName);
    reports.push(await verifyMemory64Artifact(spec, destPath));
  }
  return reports;
}

export async function main(argv = process.argv.slice(2)) {
  const checkOnly = argv.includes("--check");
  const jsonOutput = argv.includes("--json");
  const onlyArg = argv.find((a) => a.startsWith("--only="));
  const onlyId = onlyArg ? onlyArg.slice("--only=".length) : null;
  const reports = checkOnly ? await checkAllMemory64() : await buildAllMemory64(onlyId);

  if (jsonOutput) {
    console.log(JSON.stringify(reports, null, 2));
    return reports;
  }

  for (const r of reports) {
    console.log(
      `[wasm64-memory64] 검증 통과 [${r.id}]: ${r.path} · ${r.byteLength.toLocaleString("en-US")} B (${r.kib} KiB < ${r.maxKib} KiB) · flags=${r.memoryFlagsHex}(i64) · ${r.targetFeatures} · ABI v${r.abiVersion} · exports=${r.exportCount} · V8=OK · sha256=${r.sha256.slice(0, 16)}…`,
    );
  }
  return reports;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(
      `[wasm64-memory64] 실패: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
