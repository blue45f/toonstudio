#!/usr/bin/env node
/**
 * 가상 스튜디오 테마 캐릭터 미리보기 사본 생성기.
 *
 * 입장 로비의 캐릭터 카드와 꾸미기 패널의 선택기는 카드마다 한 칸(약 130×245px)만 보여 주는데, 테마 캐릭터 6종의 원본 시트
 * (avatar-<화풍>.png, 1.3~2.4MB)를 통째로 내려받아 첫 방문 로비가 12MB 가까이 받았다. 같은 격자·같은 비율로 줄인 WebP 사본을
 * 미리보기에만 쓰면 한 장이 244~344KB가 된다. 월드는 원본을 그대로 쓰고 원본 PNG는 바꾸지 않는다.
 *
 * 줄이는 비율은 DPR 2 카드(높이 100px → 200 기기 px)에서도 한 칸 높이(243px)의 0.75배(182px)로 거의 1:1이 되도록 정했다.
 * 같은 값이 studio-virtual-space-theme-character-sources.ts의 STUDIO_THEME_CHARACTER_PREVIEW_SCALE이며, 단위 테스트가
 * 파일 크기와 이 값의 일치를 검사한다.
 *
 * 원본이 바뀌었는데 사본을 다시 만들지 않으면 로비 카드가 옛 그림을 보여 주므로, 사본마다 원본의 SHA-256을 manifest.json에 남기고
 * 단위 테스트가 지금 원본의 해시와 맞는지 확인한다.
 *
 * 사용: node apps/web/scripts/build-virtual-studio-avatar-previews.mjs
 * 출력: apps/web/public/assets/virtual-studio/experience-v8/previews/avatar-<화풍>.webp (6종)와 manifest.json
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const SOURCE_DIR = join(ROOT, "apps/web/public/assets/virtual-studio/experience-v8");
const OUTPUT_DIR = join(SOURCE_DIR, "previews");
const STYLES = ["sky-island", "webtoon", "pastel", "retro", "ink", "neon"];
const PREVIEW_SCALE = 0.75;
const MAX_BYTES = 400 * 1024;

/** sharp는 워크스페이스 직접 의존성이 아니므로 pnpm 저장소에서 찾는다. */
async function loadSharp() {
  const store = join(ROOT, "node_modules/.pnpm");
  const folder = readdirSync(store).filter((name) => /^sharp@\d/u.test(name)).sort().at(-1);
  if (!folder) throw new Error("sharp 패키지를 node_modules/.pnpm에서 찾지 못했습니다.");
  const entry = join(store, folder, "node_modules/sharp/dist/index.mjs");
  const module = await import(pathToFileURL(entry).href);
  return module.default;
}

const sharp = await loadSharp();
mkdirSync(OUTPUT_DIR, { recursive: true });
const previews = [];
for (const style of STYLES) {
  const input = join(SOURCE_DIR, `avatar-${style}.png`);
  if (!existsSync(input)) throw new Error(`원본이 없습니다: ${input}`);
  const meta = await sharp(input).metadata();
  const width = Math.round(meta.width * PREVIEW_SCALE);
  const height = Math.round(meta.height * PREVIEW_SCALE);
  const output = join(OUTPUT_DIR, `avatar-${style}.webp`);
  await sharp(input).resize(width, height, { kernel: "lanczos3", fit: "fill" })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(output);
  const bytes = statSync(output).size;
  if (bytes > MAX_BYTES) throw new Error(`${style} 미리보기가 ${MAX_BYTES}바이트를 넘습니다: ${bytes}`);
  previews.push({
    artStyle: style, file: `avatar-${style}.webp`, source: `avatar-${style}.png`,
    sourceSha256: createHash("sha256").update(readFileSync(input)).digest("hex"), width, height, bytes,
  });
  console.log(`${style}: ${meta.width}×${meta.height} → ${width}×${height} ${(bytes / 1024).toFixed(0)}KB (원본 ${(statSync(input).size / 1024).toFixed(0)}KB)`);
}
writeFileSync(join(OUTPUT_DIR, "manifest.json"), `${JSON.stringify({ version: 1, scale: PREVIEW_SCALE, previews }, null, 2)}\n`);
