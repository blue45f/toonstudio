#!/usr/bin/env node
/**
 * `crates/studio-wasm64-fast-kernels` Rust 크레이트를 실제 Rust nightly `wasm64-unknown-unknown`
 * (`-Z build-std=core,alloc`, Section 5 Memory `flags & 0x04 === 0x04`) 및
 * `wasm32-unknown-unknown` 폴백 (`flags === 0x00`)으로 재현 가능하게 컴파일·최적화·검증한다.
 *
 * 사용법:
 *   node scripts/build-wasm64-fast-kernels.mjs          # 빌드 + 최적화 + 검증 + 체크인 복사
 *   node scripts/build-wasm64-fast-kernels.mjs --check  # 체크인된 두 .wasm 바이너리 검증
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, "..");
export const CRATE_DIR = join(REPO_ROOT, "crates", "studio-wasm64-fast-kernels");
export const CRATE_MANIFEST = join(CRATE_DIR, "Cargo.toml");

export const PUBLIC_WASM64_PATH = join(
  REPO_ROOT,
  "apps",
  "web",
  "public",
  "wasm",
  "studio-wasm64-fast-kernels-memory64.wasm",
);
export const PUBLIC_WASM32_PATH = join(
  REPO_ROOT,
  "apps",
  "web",
  "public",
  "wasm",
  "studio-wasm64-fast-kernels.wasm",
);

export const EXPECTED_ABI_VERSION = 1;
export const EXPECTED_CAPABILITIES_MASK = 0x0f;

export const REQUIRED_WASM_EXPORTS = Object.freeze([
  "memory",
  "wasm_fast_kernels_abi_version",
  "wasm_fast_kernels_capabilities",
  "wasm_pointer_width_bits",
  "wasm_alloc",
  "wasm_free",
  "wasm_meijster_edt2d_sq_f32",
  "wasm_sdf_gap_close_flood_fill_u8",
  "wasm_pack_bc1_tile_rgba_to_64bit",
  "wasm_oil_bristle_stamp_accumulate_rgba",
]);

const FORBIDDEN_PATH_MARKERS = Object.freeze(["/Users/", "/home/", "\\Users\\"]);

function readVarUint32(bytes, offset) {
  let result = 0;
  let shift = 0;
  let pos = offset;
  while (pos < bytes.length) {
    const byte = bytes[pos];
    pos += 1;
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value: result >>> 0, nextOffset: pos };
    }
    shift += 7;
    if (shift > 35) {
      throw new Error("LEB128 varuint32 오버플로");
    }
  }
  throw new Error("LEB128 varuint32가 예기치 않게 끝났습니다");
}

function readVarUint64(bytes, offset) {
  let result = 0n;
  let shift = 0n;
  let pos = offset;
  while (pos < bytes.length) {
    const byte = bytes[pos];
    pos += 1;
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value: result, nextOffset: pos };
    }
    shift += 7n;
    if (shift > 70n) {
      throw new Error("LEB128 varuint64 오버플로");
    }
  }
  throw new Error("LEB128 varuint64가 예기치 않게 끝났습니다");
}

/**
 * WebAssembly Section 5(Memory) 바이트를 직접 파싱해 `flags`, `isMemory64`, `minPages`, `maxPages`를 반환한다.
 */
export function inspectWasmMemorySection(bytes) {
  if (bytes.byteLength < 8 || bytes[0] !== 0x00 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) {
    throw new Error("유효한 WebAssembly 매직 헤더(\\0asm)가 아닙니다");
  }
  let pos = 8;
  while (pos < bytes.byteLength) {
    const sectionId = bytes[pos];
    pos += 1;
    const { value: sectionSize, nextOffset: payloadStart } = readVarUint32(bytes, pos);
    const payloadEnd = payloadStart + sectionSize;
    if (payloadEnd > bytes.byteLength) {
      throw new Error(`잘린 WebAssembly 섹션(id=${sectionId})`);
    }
    if (sectionId === 5) {
      const { value: count, nextOffset: entryStart } = readVarUint32(bytes, payloadStart);
      if (count < 1) {
        throw new Error("Memory 섹션에 정의된 메모리가 없습니다");
      }
      const flags = bytes[entryStart];
      const isMemory64 = (flags & 0x04) === 0x04;
      const hasMax = (flags & 0x01) === 0x01;
      const minDecoded = isMemory64
        ? readVarUint64(bytes, entryStart + 1)
        : readVarUint32(bytes, entryStart + 1);
      const minPages = Number(minDecoded.value);
      let maxPages = null;
      if (hasMax) {
        const maxDecoded = isMemory64
          ? readVarUint64(bytes, minDecoded.nextOffset)
          : readVarUint32(bytes, minDecoded.nextOffset);
        maxPages = Number(maxDecoded.value);
      }
      return { count, flags, isMemory64, hasMax, minPages, maxPages };
    }
    pos = payloadEnd;
  }
  throw new Error("WebAssembly Section 5(Memory)를 찾을 수 없습니다");
}

function buildToolchainEnv(extraRustFlags) {
  const home = homedir();
  const preferredDirs = [
    join(home, ".cargo", "bin"),
    "/Users/hjunkim/.cargo/bin",
    "/Users/hjunkim/.nvm/versions/node/v24.22.1/bin",
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
  const currentPath = (process.env.PATH ?? "").split(":").filter(Boolean);
  for (const dir of [...preferredDirs].reverse()) {
    if (existsSync(dir) && !currentPath.includes(dir)) {
      currentPath.unshift(dir);
    }
  }

  const cargoHome = process.env.CARGO_HOME ?? join(home, ".cargo");
  const rustupHome = process.env.RUSTUP_HOME ?? join(home, ".rustup");
  const rustflagsParts = [
    extraRustFlags,
    `--remap-path-prefix=${REPO_ROOT}=/toonstudio`,
    `--remap-path-prefix=${cargoHome}=/cargo`,
    `--remap-path-prefix=${rustupHome}=/rustup`,
    `--remap-path-prefix=${home}=/home-redacted`,
  ].filter(Boolean);

  return {
    ...process.env,
    PATH: currentPath.join(":"),
    RUSTFLAGS: rustflagsParts.join(" "),
  };
}

function resolveWasmOptBinary() {
  if (process.env.WASM_OPT && existsSync(process.env.WASM_OPT)) {
    return process.env.WASM_OPT;
  }
  const emsdkCandidate = "/Users/hjunkim/emsdk/upstream/bin/wasm-opt";
  if (existsSync(emsdkCandidate)) {
    return emsdkCandidate;
  }
  return "wasm-opt";
}

function runCargoBuild({ toolchain, target, buildStd, extraRustFlags }) {
  const env = buildToolchainEnv(extraRustFlags);
  const args = [];
  if (toolchain) {
    args.push(`+${toolchain}`);
  }
  args.push("build", "--manifest-path", CRATE_MANIFEST, "--release", "--target", target);
  if (buildStd) {
    args.push("-Z", "build-std=core,alloc");
  }
  const result = spawnSync("cargo", args, {
    cwd: REPO_ROOT,
    env,
    stdio: "inherit",
  });
  if (result.error) {
    throw new Error(`cargo 실행 실패: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`cargo ${target} 빌드 실패 (exit ${result.status ?? -1})`);
  }
  const outPath = join(CRATE_DIR, "target", target, "release", "studio_wasm64_fast_kernels.wasm");
  if (!existsSync(outPath)) {
    throw new Error(`컴파일된 .wasm 산출물을 찾을 수 없습니다: ${outPath}`);
  }
  return outPath;
}

function runWasmOpt({ input, output, enableMemory64 }) {
  const wasmOpt = resolveWasmOptBinary();
  const args = [
    "-Oz",
    "--strip-debug",
    "--strip-producers",
    "--enable-simd",
    "--enable-bulk-memory",
    "--enable-nontrapping-float-to-int",
    "--enable-sign-ext",
  ];
  if (enableMemory64) {
    args.push("--enable-memory64");
  }
  args.push(input, "-o", output);
  const result = spawnSync(wasmOpt, args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
  if (result.error) {
    throw new Error(`wasm-opt 실행 실패 (${wasmOpt}): ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`wasm-opt 최적화 실패 (exit ${result.status ?? -1})`);
  }
}

export async function verifyFastKernelBinary(wasmPath, { expectMemory64 }) {
  if (!existsSync(wasmPath)) {
    throw new Error(`.wasm 바이너리가 존재하지 않습니다: ${wasmPath}`);
  }
  const bytes = readFileSync(wasmPath);
  const memoryInfo = inspectWasmMemorySection(bytes);

  if (expectMemory64) {
    if ((memoryInfo.flags & 0x04) !== 0x04) {
      throw new Error(
        `memory64 플래그 불일치: expected (flags & 0x04) === 0x04, actual flags=0x${memoryInfo.flags.toString(16).padStart(2, "0")}`,
      );
    }
  } else if (memoryInfo.flags !== 0x00) {
    throw new Error(
      `wasm32 플래그 불일치: expected flags === 0x00, actual flags=0x${memoryInfo.flags.toString(16).padStart(2, "0")}`,
    );
  }

  const latin1 = bytes.toString("latin1");
  for (const marker of FORBIDDEN_PATH_MARKERS) {
    if (latin1.includes(marker)) {
      throw new Error(`.wasm 바이너리 내부에 로컬 경로 마커(${marker})가 남아 있습니다: ${wasmPath}`);
    }
  }

  const { instance } = await WebAssembly.instantiate(bytes, {});
  const exportsObj = instance.exports;
  for (const name of REQUIRED_WASM_EXPORTS) {
    if (!(name in exportsObj)) {
      throw new Error(`필수 Wasm export 누락(${wasmPath}): ${name}`);
    }
  }

  const abiVersion = Number(exportsObj.wasm_fast_kernels_abi_version());
  const capabilities = Number(exportsObj.wasm_fast_kernels_capabilities());
  const pointerBits = Number(exportsObj.wasm_pointer_width_bits());
  const expectedBits = expectMemory64 ? 64 : 32;

  if (abiVersion !== EXPECTED_ABI_VERSION) {
    throw new Error(`ABI 버전 불일치: expected=${EXPECTED_ABI_VERSION}, actual=${abiVersion}`);
  }
  if (capabilities !== EXPECTED_CAPABILITIES_MASK) {
    throw new Error(
      `기능 비트마스크 불일치: expected=0x${EXPECTED_CAPABILITIES_MASK.toString(16)}, actual=0x${capabilities.toString(16)}`,
    );
  }
  if (pointerBits !== expectedBits) {
    throw new Error(`포인터 비트폭 불일치: expected=${expectedBits}, actual=${pointerBits}`);
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    path: relative(REPO_ROOT, wasmPath),
    byteLength: bytes.byteLength,
    kib: Number((bytes.byteLength / 1024).toFixed(2)),
    memoryFlags: memoryInfo.flags,
    isMemory64: memoryInfo.isMemory64,
    pointerBits,
    abiVersion,
    capabilities,
    sha256,
    exportCount: Object.keys(exportsObj).length,
  };
}

async function buildAndVerifyAll() {
  const scratchDir = mkdtempSync(join(tmpdir(), "toonstudio-fast-kernels-wasm-"));
  try {
    // 1. Real WASM64 (memory64, flags & 0x04 === 0x04) via Rust nightly + build-std=core,alloc
    const rawWasm64 = runCargoBuild({
      toolchain: "nightly",
      target: "wasm64-unknown-unknown",
      buildStd: true,
      extraRustFlags: "-C target-feature=+simd128,+bulk-memory",
    });
    const optWasm64 = join(scratchDir, "studio-wasm64-fast-kernels-memory64.wasm");
    runWasmOpt({ input: rawWasm64, output: optWasm64, enableMemory64: true });
    const report64 = await verifyFastKernelBinary(optWasm64, { expectMemory64: true });

    // 2. WASM32 fallback (flags === 0x00)
    const rawWasm32 = runCargoBuild({
      toolchain: "nightly",
      target: "wasm32-unknown-unknown",
      buildStd: true,
      extraRustFlags: "-C target-feature=+simd128,+bulk-memory",
    });
    const optWasm32 = join(scratchDir, "studio-wasm64-fast-kernels.wasm");
    runWasmOpt({ input: rawWasm32, output: optWasm32, enableMemory64: false });
    const report32 = await verifyFastKernelBinary(optWasm32, { expectMemory64: false });

    mkdirSync(dirname(PUBLIC_WASM64_PATH), { recursive: true });
    copyFileSync(optWasm64, PUBLIC_WASM64_PATH);
    copyFileSync(optWasm32, PUBLIC_WASM32_PATH);

    return {
      wasm64: { ...report64, path: relative(REPO_ROOT, PUBLIC_WASM64_PATH) },
      wasm32: { ...report32, path: relative(REPO_ROOT, PUBLIC_WASM32_PATH) },
    };
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
}

export async function main(argv = process.argv.slice(2)) {
  const isCheckOnly = argv.includes("--check");
  const reports = isCheckOnly
    ? {
        wasm64: await verifyFastKernelBinary(PUBLIC_WASM64_PATH, { expectMemory64: true }),
        wasm32: await verifyFastKernelBinary(PUBLIC_WASM32_PATH, { expectMemory64: false }),
      }
    : await buildAndVerifyAll();

  for (const [label, r] of Object.entries(reports)) {
    const flagHex = `0x${r.memoryFlags.toString(16).padStart(2, "0")}`;
    console.log(
      `[wasm64-fast-kernels:${label}] OK · ${r.path} · ${r.byteLength.toLocaleString("en-US")} B (${r.kib} KiB) · flags=${flagHex} · ptr=${r.pointerBits}bit · ABI v${r.abiVersion} · caps=0x${r.capabilities.toString(16)} · sha256=${r.sha256.slice(0, 16)}…`,
    );
  }
  return reports;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[wasm64-fast-kernels] 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
