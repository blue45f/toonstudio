#!/usr/bin/env node
/**
 * 공식 웹 export 템플릿(압축을 푼 폴더)의 wasm·js 크기를 비교한다: 원본, gzip 레벨 9, brotli 품질 9.
 * brotli 품질 9·gzip 레벨 9 는 저장소 배포 sidecar 생성(scripts/prepare-cloudflare-static-assets.mts)과 같은 설정이다.
 *
 * 사용: node tools/godot-3d-poc/measure/sizes.mjs <라벨>=<godot.wasm 이 있는 폴더> [...]  [--out <json>]
 * 예:   node tools/godot-3d-poc/measure/sizes.mjs 4.4.1=/tmp/tpl-441/web_nothreads_release 4.7=/tmp/tpl-47/web_nothreads_release
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";

const entries = process.argv.slice(2).filter((arg) => arg.includes("=") && !arg.startsWith("--"));
const outIndex = process.argv.indexOf("--out");
const outFile = outIndex >= 0 ? process.argv[outIndex + 1] : null;

function triple(file) {
  const buffer = readFileSync(file);
  return {
    raw: buffer.length,
    gzip9: gzipSync(buffer, { level: 9 }).length,
    brotli9: brotliCompressSync(buffer, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 9, [zlibConstants.BROTLI_PARAM_SIZE_HINT]: buffer.length } }).length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

const result = {};
for (const entry of entries) {
  const [label, dir] = entry.split("=");
  result[label] = {
    wasm: triple(path.join(dir, "godot.wasm")),
    js: triple(path.join(dir, "godot.js")),
  };
}
const text = `${JSON.stringify(result, null, 2)}\n`;
if (outFile) writeFileSync(outFile, text);
process.stdout.write(text);
