#!/usr/bin/env node
/**
 * 가상 스튜디오 캠퍼스 바닥 아틀라스 생성기.
 *
 * experience-v8 terrain(1254×1254, 4×4 셀)을 셀마다 잘라 128px로 줄인 뒤 512×512 WebP 한 장으로 합친다.
 * 원본 313.5px 셀을 캠퍼스 64px 타일로 밉맵 없이 0.2배 축소하면 걷는 동안 바닥이 반짝이므로(모아레),
 * 미리 좋은 필터(lanczos3)로 줄인 128px 셀을 0.5배로만 표시한다.
 * 셀 경계의 이웃 재질·둥근 모서리가 섞이지 않게 각 셀을 안쪽으로 조금 잘라낸다.
 * 돌길(셀 4)은 원본 해상도에서 가장자리를 최소 오차 경로로 이어 가로·세로로 끊김 없이 이어지는 주기 타일로 만든 뒤 줄인다.
 * 아틀라스는 near-lossless WebP로 인코딩한다. 일반 손실 인코딩은 색차 번짐과 블록 경계 필터 때문에 맞닿은 칸의 색을 서로 끌어와
 * 칸의 가장자리 줄이 틀어지고(돌길 마지막 행 R+10 G-2.5 B-14, 품질 90~100에서도 동일), 타일 경계마다 옅은 황갈색 실선이 생긴다.
 * 인코딩 뒤 복원해 가장자리 편향을 재고 한도를 넘으면 실패한다.
 *
 * 사용: node apps/web/scripts/build-virtual-studio-campus-atlas.mjs
 * 출력: apps/web/public/assets/virtual-studio/campus-v1/<style>/floor-atlas.webp (6종)
 */
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { atlasEdgeBias } from "./lib/atlas-edge-bias.mjs";
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
const MAX_BYTES = 250 * 1024;
/** near-lossless 수준(1~100, 높을수록 원본에 가깝다). 40에서 가장자리 편향이 0이고 평균 오차가 기존 손실 q90의 절반이다. */
const NEAR_LOSSLESS_LEVEL = 40;
/** 칸 가장자리 줄의 평균 색 편향 한도(0~255). 기존 손실 인코딩은 10~14였다. */
const MAX_EDGE_BIAS = 3;
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
  const size = CELL * GRID;
  const atlas = sharp({ create: { width: size, height: size, channels: 3, background: { r: 0, g: 0, b: 0 } } }).composite(cells);
  const truth = await atlas.clone().removeAlpha().raw().toBuffer();
  await atlas.webp({ nearLossless: true, quality: NEAR_LOSSLESS_LEVEL, effort: 6 }).toFile(output);
  const bytes = statSync(output).size;
  if (bytes > MAX_BYTES) throw new Error(`${style} 아틀라스가 ${MAX_BYTES}바이트를 넘습니다: ${bytes}`);
  const decoded = await sharp(output).removeAlpha().raw().toBuffer();
  const edgeBias = atlasEdgeBias(new Uint8Array(truth), new Uint8Array(decoded), { width: size, height: size, cell: CELL, channels: 3 });
  if (edgeBias > MAX_EDGE_BIAS) throw new Error(`${style} 아틀라스의 칸 가장자리 색 편향이 ${edgeBias.toFixed(1)}로 한도 ${MAX_EDGE_BIAS}를 넘습니다.`);
  return { style, bytes, edgeBias, seams };
}

const sharp = await loadSharp();
for (const style of STYLES) {
  const { bytes, edgeBias, seams } = await buildStyle(sharp, style);
  const seam = seams.map(({ index, before, after }) =>
    ` · 셀 ${index} 이음비(1에 가까울수록 이음이 안 보임) 가로 ${before.horizontal.toFixed(2)}→${after.horizontal.toFixed(2)} 세로 ${before.vertical.toFixed(2)}→${after.vertical.toFixed(2)}`).join("");
  console.log(`${style}: ${(bytes / 1024).toFixed(1)}KB 가장자리 편향 ${edgeBias.toFixed(2)}${seam}`);
}
