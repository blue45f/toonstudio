#!/usr/bin/env node
/**
 * 웹(헤드리스 Chromium + SwiftShader)과 네이티브(Xvfb + Mesa llvmpipe)에서 같은 GDScript 로 캡처한 패스 PNG 의 픽셀 차이를 잰다.
 * 모드 A(브라우저 섬)와 모드 B/C(네이티브)가 같은 프로젝트에서 같은 결과를 내는지 보는 용도다.
 * 둘 다 소프트웨어 래스터라이저라서 "GPU 간 차이"가 아니라 "구현 간 차이"의 하한을 보여 줄 뿐이다.
 *
 * 사용(저장소 루트):
 *   bash tools/godot-3d-poc/native/run-native.sh <입력.glb> <네이티브 출력 폴더> 960x540
 *   node tools/godot-3d-poc/measure/parity.mjs --glb <입력.glb> --native <네이티브 출력 폴더> --out <결과.json> [--build <빌드 루트>] [--size 960x540] [--chromium <실행 파일>]
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import { startServers } from "./lib/server.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const pocRoot = path.resolve(here, "..");
const repoRoot = path.resolve(pocRoot, "../..");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const glb = argValue("--glb", "");
const nativeDir = argValue("--native", "");
const outFile = argValue("--out", "");
const buildDir = path.resolve(argValue("--build", path.join(pocRoot, "build")));
const [width, height] = argValue("--size", "960x540").split("x").map(Number);
const chromiumPath = argValue("--chromium", process.env.PW_CHROMIUM_PATH ?? "");
if (!glb || !nativeDir || !existsSync(glb) || !existsSync(nativeDir)) {
  console.error("사용: node tools/godot-3d-poc/measure/parity.mjs --glb <입력.glb> --native <네이티브 출력 폴더> --out <결과.json>");
  process.exit(2);
}

const PASSES = ["beauty", "line", "tone", "depth", "normal"];
const hostScript = readFileSync(path.join(here, "host/ts3d-host.js"), "utf8").replace("export function createTs3dHost", "function createTs3dHost");
const STANDALONE_INIT = `${hostScript}\nwindow.__host = createTs3dHost(window);`;

const servers = await startServers({
  buildDir,
  fixtureRoots: { "parity.glb": path.resolve(glb) },
  fixtureDirs: [],
  threeBundleDir: path.join(pocRoot, ".cache", "three-baseline", "full"),
  threeVendorDir: path.join(repoRoot, "node_modules", "three"),
  hostDir: path.join(here, "host"),
});

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox", "--disable-dev-shm-usage"],
  ...(chromiumPath ? { executablePath: chromiumPath } : {}),
});
let result;
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.addInitScript(STANDALONE_INIT);
  await page.goto(`${servers.origin}/g/n/index.html`, { waitUntil: "commit" });
  await page.waitForFunction(() => (window.__host?.events ?? []).some((event) => event.type === "first-frame"), null, { timeout: 120000, polling: 50 });
  const send = (command) =>
    page.evaluate(async (cmd) => (await window.__host.send(cmd, 300000)).event, command);
  const load = await send({ cmd: "load-glb", source: { kind: "url", url: "/fixtures/parity.glb", chunkBytes: 8388608 }, toon: true, fit: true });
  if (!load.ok) throw new Error(`load-glb 실패: ${load.error}`);
  // 첫 캡처는 셰이더 컴파일을 포함하므로 한 번 버리고 두 번째 결과를 쓴다.
  await send({ cmd: "capture", size: [width, height], passes: PASSES });
  const capture = await send({ cmd: "capture", size: [width, height], passes: PASSES });
  if (!capture.ok) throw new Error(`capture 실패: ${capture.error}`);

  const nativePng = {};
  for (const name of PASSES) {
    const file = path.join(nativeDir, `${name}.png`);
    if (!existsSync(file)) throw new Error(`네이티브 PNG 가 없습니다: ${file}`);
    nativePng[name] = readFileSync(file).toString("base64");
  }
  result = await page.evaluate(
    async ({ id, native, passes }) => {
      async function decode(bytes) {
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(bitmap, 0, 0);
        return { width: bitmap.width, height: bitmap.height, data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data };
      }
      const webItems = window.__host.takeBinaries(id);
      const rows = {};
      for (const name of passes) {
        const webItem = webItems.find((item) => item.name === name);
        const nativeBytes = Uint8Array.from(atob(native[name]), (c) => c.charCodeAt(0));
        const a = await decode(webItem.bytes);
        const b = await decode(nativeBytes);
        if (a.width !== b.width || a.height !== b.height) {
          rows[name] = { error: `크기 불일치 web ${a.width}x${a.height} native ${b.width}x${b.height}` };
          continue;
        }
        let differing = 0;
        let over8 = 0;
        let sumAbs = 0;
        let maxAbs = 0;
        const total = a.width * a.height;
        for (let i = 0; i < a.data.length; i += 4) {
          let pixelMax = 0;
          for (let c = 0; c < 4; c += 1) {
            const d = Math.abs(a.data[i + c] - b.data[i + c]);
            sumAbs += d;
            if (d > pixelMax) pixelMax = d;
          }
          if (pixelMax > 0) differing += 1;
          if (pixelMax > 8) over8 += 1;
          if (pixelMax > maxAbs) maxAbs = pixelMax;
        }
        rows[name] = {
          width: a.width,
          height: a.height,
          differingPixelRatio: differing / total,
          overEightPixelRatio: over8 / total,
          meanAbsDiffPerChannel: sumAbs / (total * 4),
          maxAbsDiff: maxAbs,
          identical: differing === 0,
        };
      }
      return rows;
    },
    { id: capture.replyTo, native: nativePng, passes: PASSES },
  );
  result = {
    note: "같은 GDScript(glb_loader.gd, pass_capture.gd)·같은 GLB·같은 카메라를 웹(Chromium SwiftShader)과 네이티브(Xvfb + Mesa llvmpipe)에서 실행한 패스 PNG 의 픽셀 차이. 둘 다 소프트웨어 래스터라이저이며 실GPU 비교가 아니다.",
    glb: path.basename(glb),
    size: [width, height],
    model: load.model,
    passes: result,
  };
} finally {
  await browser.close();
  await servers.close();
}
const text = `${JSON.stringify(result, null, 1)}\n`;
if (outFile) {
  mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  writeFileSync(outFile, text);
}
process.stdout.write(text);
