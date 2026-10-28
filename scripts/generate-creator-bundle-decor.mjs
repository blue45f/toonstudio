#!/usr/bin/env node
/** 검수된 CC0 소품 3개를 리사이즈 없이 바닥 고정 장식으로 파생한다. --check는 쓰지 않는다. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadPackRightsLedger, validatePackRightsLedger } from "./lib/creator-bundle-pack-rights.mjs";
import { planRenderSlot, RENDER_PACK_DIR } from "./lib/creator-bundle-render-rights.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DECOR_PUBLIC_ROOT = "assets/virtual-studio/bundle-decor-v1";
export const DECOR_SELECTION = Object.freeze([
  { id: "park-tree", sourceId: "cbv1-008-tree-1-1" },
  { id: "park-planter", sourceId: "cbv1-008-bush-1-1" },
  { id: "park-flower", sourceId: "cbv1-008-flower-1-1" },
]);
const sha256 = (body) => createHash("sha256").update(body).digest("hex");

/** 원본 슬롯·원장·실물 바이트를 함께 확인한다. 자체 선언만으로 공개 파생물을 만들지 않는다. */
export function resolveDecorSources({ manifest, ledger, sourceRoot = join(ROOT, RENDER_PACK_DIR) }) {
  const problems = validatePackRightsLedger(ledger);
  if (problems.length) throw new Error(`권리 원장 검증 실패: ${JSON.stringify(problems)}`);
  return DECOR_SELECTION.map((selection) => {
    const matches = manifest.assets.filter((slot) => slot.id === selection.sourceId);
    if (matches.length !== 1) throw new Error(`장식 원본 슬롯을 하나로 특정할 수 없습니다: ${selection.sourceId}`);
    const slot = matches[0];
    const planned = planRenderSlot(ledger, slot);
    if (!planned.deliverable || planned.problems.length || slot.curationStatus !== "visual-reviewed"
      || slot.visualReviewed !== true || slot.kind !== "prop-image"
      || planned.expected?.status !== "public-domain" || planned.expected?.licenseName !== "CC0-1.0"
      || slot.license.id !== "CC0-1.0" || slot.license.redistributionAllowed !== true
      || slot.width !== 1536 || slot.height !== 1536 || !/^[a-f0-9]{64}$/u.test(slot.sourceModelSha256 ?? "")) {
      throw new Error(`검수·CC0 권리를 확인하지 못한 장식 원본: ${slot.id}`);
    }
    const sourcePath = join(sourceRoot, slot.path);
    const body = readFileSync(sourcePath);
    if (body.length !== slot.bytes || sha256(body) !== slot.sha256) {
      throw new Error(`장식 원본 바이트·해시 불일치: ${slot.id}`);
    }
    return { ...selection, slot, sourcePath };
  });
}

function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--check")) throw new Error("사용법: node scripts/generate-creator-bundle-decor.mjs [--check]");
  const check = args.includes("--check");
  const manifest = JSON.parse(readFileSync(join(ROOT, RENDER_PACK_DIR, "manifest.json"), "utf8"));
  const sources = resolveDecorSources({ manifest, ledger: loadPackRightsLedger() });
  const jobs = sources.map(({ id, slot, sourcePath }) => ({ id, sourcePath, sourceSize: [slot.width, slot.height] }));
  const crop = spawnSync("python3", [join(ROOT, "scripts/lib/trim-creator-bundle-decor.py")], {
    input: JSON.stringify(jobs), encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  if (crop.status !== 0) throw new Error(`장식 crop을 실행하지 못했습니다. Pillow가 있는 Python 3를 사용하세요: ${crop.stderr || crop.error?.message}`);
  const cropped = JSON.parse(crop.stdout);
  const files = new Map();
  const assets = sources.map(({ id, slot }, index) => {
    const result = cropped[index];
    if (result?.id !== id) throw new Error(`장식 crop 출력 순서가 다릅니다: ${id}`);
    const body = Buffer.from(result.body, "base64");
    const path = `${id}.webp`;
    files.set(path, body);
    return {
      id, path, bytes: body.length, sha256: sha256(body), width: result.width, height: result.height,
      trimBbox: result.trimBbox, bottomAnchor: [result.width / 2, result.height],
      sourceRenderId: slot.id, sourceImagePath: `/assets/studio/bundle-renders-v1/${slot.path}`,
      sourceBodySha256: slot.sha256, sourceModelSha256: slot.sourceModelSha256,
      sourceSize: [slot.width, slot.height], license: slot.license, rights: slot.rights,
    };
  });
  const output = { schema: "toonstudio.virtual-bundle-decor.v1", version: 1,
    sourceManifest: "/assets/studio/bundle-renders-v1/manifest.json",
    recipe: { alphaThreshold: 0, bbox: "left-top-right-bottom-exclusive", resized: false, format: "lossless-webp", anchor: "bottom-center" }, assets };
  files.set("manifest.json", Buffer.from(`${JSON.stringify(output, null, 2)}\n`));
  const outputRoot = join(ROOT, "apps/web/public", DECOR_PUBLIC_ROOT);
  if (existsSync(outputRoot)) {
    const unexpected = readdirSync(outputRoot).filter((path) => !files.has(path));
    if (unexpected.length) throw new Error(`장식 공개 폴더에 예상하지 않은 파일이 있습니다: ${unexpected.join(", ")}`);
  }
  if (check) {
    for (const [path, body] of files) {
      const target = join(outputRoot, path);
      if (!existsSync(target) || !readFileSync(target).equals(body)) {
        throw new Error(`장식 파생물이 원본·권리·crop 결과와 다릅니다: ${path}. 생성기를 다시 실행하세요.`);
      }
    }
  } else {
    mkdirSync(outputRoot, { recursive: true });
    for (const [path, body] of files) writeFileSync(join(outputRoot, path), body);
  }
  console.log(`${check ? "check" : "generated"}: CC0 장식 ${assets.length}개, 원본1536 보존·리사이즈 없음, ${[...files.values()].reduce((sum, body) => sum + body.length, 0)} bytes`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
