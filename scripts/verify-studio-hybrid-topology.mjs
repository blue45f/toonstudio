/** Browser pixels and measured CPU submission on the real shared product renderer. */
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { arch, cpus, platform, tmpdir, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadStudioChemyBrowserToolchain } from "./lib/studio-chemy-toolchain.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--legacy-chemy-pressure-only")) throw new Error("지원하지 않는 hybrid 진단 인자입니다.");
const pressureOnly = args.includes("--legacy-chemy-pressure-only");
const { chromium, createServer } = await loadStudioChemyBrowserToolchain();
const output = resolve(process.env.TOONSPECTRUM_HYBRID_VERIFY_DIR || join(tmpdir(), "studio-hybrid-topology"));
mkdirSync(output, { recursive: true });
const harness = "/__hybrid_topology_audit__";
const vite = await createServer({
  configFile: false, root,
  resolve: { alias: { "@": join(root, "apps/web/src") } },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
  plugins: [{ name: "hybrid-topology-audit", configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url !== harness) { next(); return; }
      res.setHeader("Content-Type", "text/html");
      res.end('<!doctype html><meta charset="utf-8"><title>Material renderer audit</title><body>Material renderer audit</body>');
    });
  } }],
});
let browser;
const diagnostics = [];
try {
  await vite.listen();
  const address = vite.httpServer.address();
  if (!address || typeof address === "string") throw new Error("Missing audit server port");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  page.on("pageerror", (error) => diagnostics.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}${harness}`);
  const result = await page.evaluate(async ({ pressureEnvironment, pressureOnly }) => {
    const entry = await import("/scripts/studio-hybrid-topology-browser.ts");
    if (pressureOnly) return entry.auditStudioLegacyChemyV1Pressure(pressureEnvironment);
    return entry.auditStudioHybridTopology(pressureEnvironment);
  }, { pressureEnvironment: { browser: browser.version(), platform: platform(), architecture: arch() }, pressureOnly });
  for (const [index, png] of (result.sheets ?? []).entries()) {
    writeFileSync(join(output, `materials-${index + 1}.png`), Buffer.from(png.split(",")[1], "base64"));
  }
  for (const artifact of result.pressureFailureArtifacts ?? []) {
    for (const side of ["low", "high"]) {
      const image = artifact[side];
      try {
        if (!/^[a-z0-9-]+$/u.test(artifact.id) || !image.pngDataUrl.startsWith("data:image/png;base64,")) {
          throw new Error("압력 실패 진단 이미지 형식이 올바르지 않습니다.");
        }
        const filename = `pressure-${artifact.id}-${side}.png`;
        writeFileSync(join(output, filename), Buffer.from(image.pngDataUrl.split(",")[1], "base64"));
        image.pngFile = filename;
        if (pressureOnly) {
          if (!Array.isArray(image.rawRgba) || image.rawRgba.length !== image.width * image.height * 4
            || !image.rawRgba.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
            throw new Error("원본 RGBA 바이트가 Canvas 크기와 다릅니다.");
          }
          const rgba = Buffer.from(image.rawRgba), input = JSON.stringify(image.input);
          const hash = (value) => createHash("sha256").update(value).digest("hex");
          if (hash(rgba) !== image.rawRgbaSha256 || input === undefined || hash(input) !== image.inputSha256) {
            throw new Error("원본 RGBA 또는 입력 지문이 다릅니다.");
          }
          image.rawRgbaFile = `pressure-${artifact.id}-${side}.rgba`;
          image.inputFile = `pressure-${artifact.id}-${side}.input.json`;
          writeFileSync(join(output, image.rawRgbaFile), rgba);
          writeFileSync(join(output, image.inputFile), input);
        }
      } catch (error) {
        result.pressureFailureArtifactErrors.push({ id: `${artifact.id}/${side}`, error: String(error) });
        if (pressureOnly) result.failures.push(`압력 원본 수집 실패: ${artifact.id}/${side}: ${String(error)}`);
      } finally {
        delete image.pngDataUrl;
        if (pressureOnly) { delete image.rawRgba; delete image.input; }
      }
    }
  }
  delete result.sheets;
  writeFileSync(join(output, "report.json"), `${JSON.stringify({ ...result, diagnostics, environment: { recordedAt: new Date().toISOString(), browser: browser.version(), node: process.version, platform: platform(), architecture: arch(), cpu: cpus()[0]?.model ?? "unknown", memoryBytes: totalmem() } }, null, 2)}\n`);
  if (diagnostics.length || result.failures.length) throw new Error([...diagnostics, ...result.failures].join("\n"));
  console.log(JSON.stringify({ count: result.cases.length, ...result.performance, output }));
} catch (error) {
  writeFileSync(join(output, "failure.json"), JSON.stringify({ error: String(error), diagnostics }, null, 2));
  throw error;
} finally {
  await browser?.close();
  await vite.close();
}
