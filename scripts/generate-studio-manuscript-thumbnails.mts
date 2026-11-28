// 로컬 Vite를 실행하고 tsx scripts/generate-studio-manuscript-thumbnails.mts <origin> [--write]로 재생성한다.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import { SAMPLE_VRM_ENTRIES, sampleVrmUrl } from "../apps/web/src/domains/creator/vrm/vrm-library";

import type { createManuscriptCastingRenderer } from "../apps/web/tools/browser-harnesses/manuscript-casting-thumbnail";

type CaptureWindow = typeof window & { captureManuscriptPortrait?: ReturnType<typeof createManuscriptCastingRenderer> };
const origin = process.argv[2];
assert.ok(origin && /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/u.test(origin), "실행 중인 로컬 Vite 주소를 지정하세요.");
const write = process.argv.includes("--write");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "apps/web/public/assets/3d/characters/thumbnails/manuscript-v1");
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  const capturePage = `${origin}/__manuscript-casting`;
  await page.route(capturePage, (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><script type="module">
      import { createManuscriptCastingRenderer } from "/tools/browser-harnesses/manuscript-casting-thumbnail.ts";
      window.captureManuscriptPortrait = createManuscriptCastingRenderer();
    </script>`,
  }));
  await page.goto(capturePage);
  await page.waitForFunction(() => typeof (window as CaptureWindow).captureManuscriptPortrait === "function");
  const cards = new Map<string, Buffer>();
  for (const { id } of SAMPLE_VRM_ENTRIES) {
    const url = sampleVrmUrl(id);
    const data = await page.evaluate((source) => {
      const render = (window as CaptureWindow).captureManuscriptPortrait;
      if (!render) throw new Error("캐스팅 카드 렌더러를 불러오지 못했습니다.");
      return render(source);
    }, { id, url });
    assert.ok(data.startsWith("data:image/webp;base64,"), `브라우저가 WebP를 생성하지 못했습니다 (${id}).`);
    cards.set(id, Buffer.from(data.slice(data.indexOf(",") + 1), "base64"));
  }
  if (write) {
    await mkdir(target, { recursive: true });
    for (const [id, bytes] of cards) await writeFile(resolve(target, `${id}.webp`), bytes);
  }
  console.log(`원본 VRM 캐스팅 카드 ${cards.size}장 ${write ? "저장" : "렌더링 검증"} 완료`);
} finally {
  await browser.close();
}
