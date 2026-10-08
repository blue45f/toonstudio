#!/usr/bin/env node
/**
 * 가상 스튜디오 캠퍼스 바닥 아틀라스 생성기.
 *
 * experience-v8 terrain(1254×1254, 4×4 셀)을 셀마다 잘라 128px로 줄인 뒤 512×512 WebP 한 장으로 합친다.
 * 원본 313.5px 셀을 캠퍼스 64px 타일로 밉맵 없이 0.2배 축소하면 걷는 동안 바닥이 반짝이므로(모아레),
 * 미리 좋은 필터(lanczos3)로 줄인 128px 셀을 0.5배로만 표시한다.
 * 셀 경계의 이웃 재질·둥근 모서리가 섞이지 않게 각 셀을 안쪽으로 조금 잘라낸다.
 * 돌길(셀 4)은 원본 해상도에서 가장자리를 최소 오차 경로로 이어 가로·세로로 끊김 없이 이어지는 주기 타일로 만든 뒤 줄인다.
 *
 * 사용: node apps/web/scripts/build-virtual-studio-campus-atlas.mjs
 * 출력: apps/web/public/assets/virtual-studio/campus-v1/<style>/floor-atlas.webp (6종)
 */
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { periodizeTile, seamRatio } from "./lib/seamless-tile.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const SOURCE_DIR = join(ROOT, "apps/web/public/assets/virtual-studio/experience-v8");
const OUTPUT_DIR = join(ROOT, "apps/web/public/assets/virtual-studio/campus-v1");
const STYLES = ["sky-island", "webtoon", "pastel", "retro", "ink", "neon"];
const SOURCE_SIZE = 1254;
const GRID = 4;
const CELL = 128;
const INSET = 3;
const MAX_BYTES = 150 * 1024;
/**
 * 주기 타일로 만들 셀(아틀라스 인덱스 → 겹침 폭, 원본 px). 4 = CAMPUS_TERRAIN.cobble(돌길).
 * 원본 한 칸은 좌우·상하 가장자리가 이어지지 않아 그대로 이어 붙이면 칸마다 돌이 잘리고, 좌우 반전으로 섞어 가리면 접합부마다
 * 거울 대칭 무늬가 생긴다. 겹침만큼 칸이 작아지므로(307px → 267px) 돌이 약 15% 크게 보인다.
 * 이 셀은 런타임에서 뒤집지 않는다(studio-virtual-space-campus-world.ts의 variedGid).
 */
const SEAMLESS_CELLS = new Map([[4, 40]]);

/** sharp는 워크스페이스 직접 의존성이 아니므로 pnpm 저장소에서 찾는다. */
async function loadSharp() {
  const store = join(ROOT, "node_modules/.pnpm");
  const folder = readdirSync(store).filter((name) => /^sharp@\d/u.test(name)).sort().at(-1);
  if (!folder) throw new Error("sharp 패키지를 node_modules/.pnpm에서 찾지 못했습니다.");
  const entry = join(store, folder, "node_modules/sharp/dist/index.mjs");
  const module = await import(pathToFileURL(entry).href);
  return module.default;
}

function sourceFile(style) {
  return join(SOURCE_DIR, style === "sky-island" ? "terrain.png" : `terrain-${style}.png`);
}

async function buildStyle(sharp, style) {
  const input = sourceFile(style);
  if (!existsSync(input)) throw new Error(`원본이 없습니다: ${input}`);
  const meta = await sharp(input).metadata();
  if (meta.width !== SOURCE_SIZE || meta.height !== SOURCE_SIZE) throw new Error(`${style} 원본 크기가 ${SOURCE_SIZE}이 아닙니다.`);
  const cells = [];
  const seams = [];
  for (let index = 0; index < GRID * GRID; index += 1) {
    const column = index % GRID, row = Math.floor(index / GRID);
    const left = Math.round(column * SOURCE_SIZE / GRID) + INSET;
    const top = Math.round(row * SOURCE_SIZE / GRID) + INSET;
    const right = Math.round((column + 1) * SOURCE_SIZE / GRID) - INSET;
    const bottom = Math.round((row + 1) * SOURCE_SIZE / GRID) - INSET;
    const region = sharp(input).extract({ left, top, width: right - left, height: bottom - top }).removeAlpha();
    const overlap = SEAMLESS_CELLS.get(index);
    let buffer;
    if (overlap === undefined) {
      buffer = await region.resize(CELL, CELL, { kernel: "lanczos3", fit: "fill" }).png().toBuffer();
    } else {
      const { data, info } = await region.raw().toBuffer({ resolveWithObject: true });
      const source = { data: new Uint8Array(data), width: info.width, height: info.height, channels: info.channels };
      const tile = periodizeTile(source, overlap);
      seams.push({ index, before: seamRatio(source), after: seamRatio(tile) });
      buffer = await sharp(Buffer.from(tile.data), { raw: { width: tile.width, height: tile.height, channels: tile.channels } })
        .resize(CELL, CELL, { kernel: "lanczos3", fit: "fill" }).png().toBuffer();
    }
    cells.push({ input: buffer, left: column * CELL, top: row * CELL });
  }
  const folder = join(OUTPUT_DIR, style);
  mkdirSync(folder, { recursive: true });
  const output = join(folder, "floor-atlas.webp");
  await sharp({ create: { width: CELL * GRID, height: CELL * GRID, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite(cells)
    .webp({ quality: 90, effort: 6 })
    .toFile(output);
  const bytes = statSync(output).size;
  if (bytes > MAX_BYTES) throw new Error(`${style} 아틀라스가 ${MAX_BYTES}바이트를 넘습니다: ${bytes}`);
  return { style, bytes, seams };
}

const sharp = await loadSharp();
for (const style of STYLES) {
  const { bytes, seams } = await buildStyle(sharp, style);
  const seam = seams.map(({ index, before, after }) =>
    ` · 셀 ${index} 이음비(1에 가까울수록 이음이 안 보임) 가로 ${before.horizontal.toFixed(2)}→${after.horizontal.toFixed(2)} 세로 ${before.vertical.toFixed(2)}→${after.vertical.toFixed(2)}`).join("");
  console.log(`${style}: ${(bytes / 1024).toFixed(1)}KB${seam}`);
}
