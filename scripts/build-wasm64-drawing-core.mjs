#!/usr/bin/env node
/**
 * `crates/studio-wasm64-drawing-core` Rust 크레이트를 `wasm32-unknown-unknown --release`로
 * 재현 가능하게 컴파일해 `apps/web/public/wasm/studio-wasm64-drawing-core.wasm`(< 48 KiB)을 생성·검증한다.
 *
 * 사용법:
 *   node scripts/build-wasm64-drawing-core.mjs           # 빌드 + 복사 + 내보내기/크기/경로 검증
 *   node scripts/build-wasm64-drawing-core.mjs --check   # 체크인된 .wasm 바이너리 무결성만 검증
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, "..");
export const CRATE_DIR = join(REPO_ROOT, "crates", "studio-wasm64-drawing-core");
export const CRATE_MANIFEST = join(CRATE_DIR, "Cargo.toml");
export const TARGET_WASM_PATH = join(
  CRATE_DIR,
  "target",
  "wasm32-unknown-unknown",
  "release",
  "studio_wasm64_drawing_core.wasm",
);
export const PUBLIC_WASM_PATH = join(
  REPO_ROOT,
  "apps",
  "web",
  "public",
  "wasm",
  "studio-wasm64-drawing-core.wasm",
);

export const MAX_WASM_BYTES = 48 * 1024;
export const EXPECTED_ABI_VERSION = 1;
export const EXPECTED_CAPABILITIES_MASK = 0x7f;

export const REQUIRED_WASM_EXPORTS = Object.freeze([
  "memory",
  "wasm_drawing_core_abi_version",
  "wasm_hotpath_capabilities",
  "wasm_alloc",
  "wasm_free",
  "wasm_unsharp_mask_rgba",
  "wasm_gaussian_blur_rgba",
  "wasm_apply_impasto_lighting_rgba",
  "wasm_mix_pigments_km_packed",
  "wasm_mix_pigments_km16_packed",
  "wasm_mix_pigments_km16_strip",
  "wasm_xor_tile_delta_bytes",
  "wasm_fnv1a_checksum",
  "wasm_sample_world_paper_height",
]);

const FORBIDDEN_PATH_MARKERS = Object.freeze(["/Users/", "/home/", "\\Users\\"]);

function buildCargoEnv() {
  const home = homedir();
  const cargoBinCandidates = [join(home, ".cargo", "bin"), "/Users/hjunkim/.cargo/bin"];
  const currentPath = process.env.PATH ?? "";
  const pathParts = currentPath.split(":").filter(Boolean);
  for (const dir of cargoBinCandidates) {
    if (existsSync(dir) && !pathParts.includes(dir)) {
      pathParts.unshift(dir);
    }
  }

  const cargoHome = process.env.CARGO_HOME ?? join(home, ".cargo");
  const remapFlags = [
    `--remap-path-prefix=${REPO_ROOT}=/toonstudio`,
    `--remap-path-prefix=${cargoHome}=/cargo`,
    `--remap-path-prefix=${home}=/home-redacted`,
  ];
  const existingRustflags = (process.env.RUSTFLAGS ?? "").trim();
  const rustflags = existingRustflags ? `${existingRustflags} ${remapFlags.join(" ")}` : remapFlags.join(" ");

  return {
    ...process.env,
    PATH: pathParts.join(":"),
    RUSTFLAGS: rustflags,
  };
}

function runCargoReleaseWasmBuild() {
  const env = buildCargoEnv();
  const result = spawnSync(
    "cargo",
    [
      "build",
      "--manifest-path",
      CRATE_MANIFEST,
      "--target",
      "wasm32-unknown-unknown",
      "--release",
    ],
    {
      cwd: REPO_ROOT,
      env,
      stdio: "inherit",
    },
  );
  if (result.error) {
    throw new Error(`cargo 실행 실패: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`cargo wasm32-unknown-unknown --release 빌드 실패 (exit ${result.status ?? -1})`);
  }
  if (!existsSync(TARGET_WASM_PATH)) {
    throw new Error(`컴파일된 .wasm 산출물을 찾을 수 없습니다: ${TARGET_WASM_PATH}`);
  }
}

export async function verifyWasmBinary(wasmPath = PUBLIC_WASM_PATH) {
  if (!existsSync(wasmPath)) {
    throw new Error(`.wasm 바이너리가 존재하지 않습니다: ${wasmPath}`);
  }
  const bytes = readFileSync(wasmPath);
  const byteLength = bytes.byteLength;

  if (byteLength < 8 || bytes[0] !== 0x00 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) {
    throw new Error(`유효한 WebAssembly 매직 헤더(\\0asm)가 아닙니다: ${wasmPath}`);
  }
  if (byteLength >= MAX_WASM_BYTES) {
    throw new Error(
      `.wasm 크기 예산 초과: ${byteLength.toLocaleString("en-US")} B >= 상한 ${MAX_WASM_BYTES.toLocaleString("en-US")} B (48 KiB)`,
    );
  }

  const latin1 = bytes.toString("latin1");
  for (const marker of FORBIDDEN_PATH_MARKERS) {
    if (latin1.includes(marker)) {
      throw new Error(`.wasm 바이너리 내부에 로컬 경로 마커(${marker})가 남아 있습니다`);
    }
  }

  const { instance } = await WebAssembly.instantiate(bytes, {});
  const exportsObj = instance.exports;
  const exportNames = Object.keys(exportsObj).sort();
  for (const name of REQUIRED_WASM_EXPORTS) {
    if (!(name in exportsObj)) {
      throw new Error(`필수 Wasm export 누락: ${name}`);
    }
  }

  const abiVersionFn = exportsObj.wasm_drawing_core_abi_version;
  const capFn = exportsObj.wasm_hotpath_capabilities;
  if (typeof abiVersionFn !== "function" || typeof capFn !== "function") {
    throw new Error("ABI 버전 또는 기능 비트마스크 함수 export 형식이 올바르지 않습니다");
  }
  const abiVersion = Number(abiVersionFn());
  const capabilities = Number(capFn());
  if (abiVersion !== EXPECTED_ABI_VERSION) {
    throw new Error(`예상 ABI 버전 불일치: expected=${EXPECTED_ABI_VERSION}, actual=${abiVersion}`);
  }
  if (capabilities !== EXPECTED_CAPABILITIES_MASK) {
    throw new Error(
      `예상 기능 비트마스크 불일치: expected=0x${EXPECTED_CAPABILITIES_MASK.toString(16)}, actual=0x${capabilities.toString(16)}`,
    );
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    path: relative(REPO_ROOT, wasmPath),
    byteLength,
    kib: Number((byteLength / 1024).toFixed(2)),
    abiVersion,
    capabilities,
    sha256,
    exportNames,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const checkOnly = argv.includes("--check");
  if (!checkOnly) {
    runCargoReleaseWasmBuild();
    mkdirSync(dirname(PUBLIC_WASM_PATH), { recursive: true });
    copyFileSync(TARGET_WASM_PATH, PUBLIC_WASM_PATH);
    const stat = statSync(PUBLIC_WASM_PATH);
    console.log(
      `[wasm64-drawing-core] 복사 완료: ${relative(REPO_ROOT, PUBLIC_WASM_PATH)} (${stat.size.toLocaleString("en-US")} B)`,
    );
  }

  const report = await verifyWasmBinary(PUBLIC_WASM_PATH);
  console.log(
    `[wasm64-drawing-core] 검증 통과: ${report.path} · ${report.byteLength.toLocaleString("en-US")} B (${report.kib} KiB < 48 KiB) · ABI v${report.abiVersion} · caps=0x${report.capabilities.toString(16)} · exports=${report.exportNames.length} · sha256=${report.sha256.slice(0, 16)}…`,
  );
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[wasm64-drawing-core] 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
