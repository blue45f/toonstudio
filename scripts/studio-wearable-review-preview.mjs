import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const mode = process.argv[2];
if (mode !== "motion" && mode !== "hair") throw new Error("Expected a motion or hair review.");
const directory = mode === "motion" ? ".artifacts/studio-wearable-v5" : ".artifacts/studio-hair-stack";
const reference = ".artifacts/studio-hair-stack-baseline";

function frame(title, name, root = directory) {
  return { title, file: path.join(root, "screenshots", name + ".png") };
}

const panels = mode === "motion" ? {
  motion: [
    frame("Lumi | wrist neutral", "sample-prop-mic-motion-0"),
    frame("Lumi | wrist +35 deg", "sample-prop-mic-motion-35"),
    frame("Shion | head neutral", "shion-prop-sunglasses-motion-0"),
    frame("Shion | head -35 deg", "shion-prop-sunglasses-motion--35"),
  ],
} : {
  styles: [
    frame("Lumi | short, front", "sample-short-neutral-front"),
    frame("Shion | long, turned", "shion-long-turned-front"),
    frame("Lumi | ponytail, side", "sample-ponytail-turned-side"),
    frame("Shion | ponytail, rear", "shion-ponytail-turned-back"),
  ],
};
if (mode === "hair" && process.argv.includes("--baseline")) {
  panels.ponytail = [
    frame("Lumi | before, high knot", "sample-ponytail-high-neutral-side", reference),
    frame("Lumi | after, high knot", "sample-ponytail-high-neutral-side"),
    frame("Shion | before, low knot", "shion-ponytail-low-neutral-back", reference),
    frame("Shion | after, low knot", "shion-ponytail-low-neutral-back"),
  ];
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const [name, frames] of Object.entries(panels)) {
    const sources = await Promise.all(frames.map(async ({ title, file }) => ({
      title, url: "data:image/png;base64," + (await readFile(file)).toString("base64"),
    })));
    const dataUrl = await page.evaluate(async images => {
      const size = 256;
      const caption = 24;
      const canvas = document.createElement("canvas");
      canvas.width = size * 2;
      canvas.height = (size + caption) * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("The review canvas is unavailable.");
      ctx.fillStyle = "#151a20";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = "14px sans-serif";
      ctx.fillStyle = "#ffffff";
      for (const [index, image] of images.entries()) {
        const tile = new Image();
        tile.src = image.url;
        await tile.decode();
        const x = (index % 2) * size;
        const y = Math.floor(index / 2) * (size + caption);
        ctx.drawImage(tile, x, y, size, size);
        ctx.fillText(image.title, x + 8, y + size + 17);
      }
      return canvas.toDataURL("image/webp", 0.72);
    }, sources);
    const payload = dataUrl.split(",")[1];
    const bytes = Buffer.from(payload, "base64");
    await writeFile(path.join(directory, "preview-" + name + ".webp"), bytes);
    // Four fixed, bundled fixture frames fit in a collapsed log on clients without an archive viewer.
    if (bytes.length <= 64 * 1024) {
      console.log("::group::" + name + " WebP review preview");
      console.log("STUDIO_REVIEW_WEBP " + name + " " + payload);
      console.log("::endgroup::");
    }
  }
} finally {
  await browser.close();
}
