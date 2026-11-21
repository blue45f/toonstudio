#!/usr/bin/env -S pnpm exec tsx

/** 웹 발표와 정적 덱이 공유하는 표시 데이터를 JSON으로 내보낸다. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";

import { ASKS, BUSINESS_MODEL, CAPABILITIES, FLOW_STEPS, FOUNDER_CAREER, GTM_STEPS, IR_DECK_SLIDE_COUNT, IR_DECK_STATUS, IR_DECK_UPDATED_AT, LANDSCAPE, PROBLEMS, VALIDATION_GOALS } from "../apps/web/src/domains/marketing/ir-pitch-data";
import { SCENE_META } from "../apps/web/src/domains/marketing/ir-present-scene-data";
import { SCENE_NODES_A } from "../apps/web/src/domains/marketing/ir-present-scenes-a";
import { SCENE_NODES_B } from "../apps/web/src/domains/marketing/ir-present-scenes-b";
import { formatProductTourDuration, formatProductTourTime, PRODUCT_TOUR, productTourChapterHref } from "../apps/web/src/domains/marketing/product-tour-content";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sources = [
  "ir-pitch-data.ts", "ir-present-scene-data.ts", "ir-present-scenes-a.tsx",
  "ir-present-scenes-b.tsx", "ir-present-pipeline-widget.tsx", "product-tour-content.ts",
  "product-tour-asset.generated.ts",
].map((name) => `apps/web/src/domains/marketing/${name}`);
const nodes = [...SCENE_NODES_A, ...SCENE_NODES_B];
if (nodes.length !== SCENE_META.length) throw new Error("발표 장면과 목차 수가 다릅니다. 정본을 먼저 맞춰 주세요.");
if (nodes.length !== IR_DECK_SLIDE_COUNT) throw new Error("정적 덱의 표시 장면 수와 웹 발표가 다릅니다.");
const narrationPath = "tools/media/ir-present/narration.ko.json";
const narration = JSON.parse(readFileSync(resolve(root, narrationPath), "utf8")) as { scenes: { scene: number; audio: string; text: string }[] };
if (narration.scenes.length !== nodes.length || narration.scenes.some((scene, index) => scene.scene !== index + 1 || scene.audio !== SCENE_META[index].audio || !scene.text)) {
  throw new Error("내레이션 대본과 웹 발표의 장면 순서가 다릅니다.");
}
sources.push(narrationPath);
for (const id of ["drawing", "three-d", "collaboration"]) {
  const capability = CAPABILITIES.find((item) => item.id === id);
  if (!capability) throw new Error(`정적 덱의 제품 캡처를 찾을 수 없습니다: ${id}`);
  sources.push(`apps/web/public${capability.image}`);
}

const data = {
  schemaVersion: 1,
  basis: IR_DECK_UPDATED_AT,
  status: IR_DECK_STATUS,
  sources: sources.map((path) => ({ path, sha256: createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex") })),
  scenes: nodes.map((node, index) => ({ ...SCENE_META[index], html: renderToStaticMarkup(node) })),
  narration: narration.scenes,
  problems: PROBLEMS.map(({ ko }) => ko),
  flow: FLOW_STEPS.map(({ ko }) => ko),
  landscape: LANDSCAPE.map(({ ko }) => ko),
  capabilities: CAPABILITIES.map(({ id, image, href, ko, stats }) => ({ id, image, href, ...ko, stats: stats.map(({ ko: text }) => text) })),
  businessModel: BUSINESS_MODEL.map(({ ko }) => ko),
  gtm: GTM_STEPS.map(({ ko }) => ko),
  goals: VALIDATION_GOALS.map(({ value, ko }) => ({ value, label: ko })),
  asks: ASKS.map(({ ko }) => ko),
  founder: FOUNDER_CAREER.map(({ ko }) => ko),
  tour: {
    duration: PRODUCT_TOUR.duration,
    durationLabel: formatProductTourDuration(PRODUCT_TOUR.duration, "ko"),
    chapters: PRODUCT_TOUR.chapters.map((chapter, index) => ({
      number: index + 1, title: chapter.ko, start: chapter.start,
      time: formatProductTourTime(chapter.start), visual: chapter.visual,
      href: productTourChapterHref(chapter.start), summary: chapter.summary.ko,
    })),
  },
};
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--output") {
  throw new Error("사용법: node --import tsx scripts/export-ir-deck-data.mts --output <JSON 경로>");
}
const output = resolve(args[1]);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(data, null, 2)}\n`);
console.log(`IR 정본 ${data.scenes.length}개 장면을 내보냈습니다: ${output}`);
