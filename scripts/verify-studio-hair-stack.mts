/** pnpm exec tsx scripts/verify-studio-hair-stack.mts [--baseline-ref <base commit>] */
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright";
import { build, preview, type Plugin } from "vite";

const models = ["sample", "shion"] as const;
const views = ["front", "side", "back"] as const;
type View = typeof views[number];
type Model = typeof models[number];
type FrameSpec = { variant: string; view: View; turned: boolean };
type Evidence = {
  hairPixels: number;
  cap: { visible: number; visibleWithoutHair: number; coveredByHair: number };
  sunglasses: { visible: number; visibleWithoutHair: number; coveredByHair: number };
  comparedStyle: string | null; changedPixels: number | null;
  headTurnDegrees: number; driftMm: Record<string, number>; sampleCounts: Record<string, number>;
  headFit: { source: string; sampleCount: number; frontSign: number; radius: number[] };
  nativeHairCandidates: number; nativeMeshesHidden: number; hairGeometry: string; hairVertices: number;
  camera: { position: number[]; quaternion: number[]; fov: number };
};
type Frame = FrameSpec & { model: Model; file: string; stats: Evidence };
declare global {
  interface Window {
    studioHairStack: {
      ready: boolean; model: Model; load: (model: Model) => Promise<void>;
      style: (style: string, height: number | undefined) => void; pose: (turned: boolean) => void;
      view: (view: View, closeup: boolean) => void; settled: () => boolean;
      inspect: (spec: FrameSpec) => { png: string; stats: Evidence };
    };
  }
}

const root = resolve("scripts/studio-hair-stack");
const sourcePaths = ["studio-vrm-avatar-forge-hair-object.ts", "studio-vrm-authored-hair-geometry.ts"]
  .map(name => `apps/web/src/domains/creator/vrm/${name}`);
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trimEnd();
const currentRef = git("rev-parse", "HEAD");

function rendererSources(ref: string) {
  const replacements = new Map(sourcePaths.map(path => [resolve(path), git("show", `${ref}:${path}`)]));
  const loaded = new Set<string>();
  const plugin: Plugin = {
    name: "compare-committed-hair-renderer",
    enforce: "pre",
    load(id) {
      const path = id.split("?")[0]!;
      const source = replacements.get(path);
      if (source === undefined) return null;
      loaded.add(path);
      return source;
    },
    buildEnd(error) {
      if (!error && loaded.size !== replacements.size) throw new Error("Baseline hair source was not loaded");
    },
  };
  return plugin;
}

async function sheet(page: Page, directory: string, name: string, frames: Frame[], columns = 3, labels?: string[]) {
  const images = await Promise.all(frames.map(async (frame, i) => ({
    label: labels?.[i] ?? frame.file.split("/").pop()!.replace(".png", ""),
    png: (await readFile(join(directory, frame.file))).toString("base64"),
  })));
  const url = await page.evaluate(async ({ images, columns }) => {
    const canvas = document.createElement("canvas");
    const w = 256, h = 280;
    canvas.width = w * columns; canvas.height = h * Math.ceil(images.length / columns);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#17202b"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const [i, entry] of images.entries()) {
      const img = new Image(); img.src = "data:image/png;base64," + entry.png; await img.decode();
      const x = w * (i % columns), y = h * Math.floor(i / columns);
      ctx.drawImage(img, x, y, w, w);
      ctx.fillStyle = "#fff"; ctx.font = "13px sans-serif";
      ctx.fillText(entry.label, x + 6, y + w + 17, w - 12);
    }
    return canvas.toDataURL("image/jpeg", 0.9);
  }, { images, columns });
  await writeFile(join(directory, `contact-sheet-${name}.jpg`), Buffer.from(url.split(",")[1]!, "base64"));
}

function validate(frames: Frame[], baseline: boolean) {
  const failures: string[] = [];
  const expected = baseline ? 8 : 44;
  if (frames.length !== expected) failures.push(`Captured ${frames.length}/${expected} frames`);
  for (const frame of frames) {
    const { stats } = frame;
    if (stats.headFit.source !== "mesh" || stats.headFit.sampleCount < 48) failures.push(`${frame.file}: missing measured head`);
    if (stats.nativeHairCandidates > 0 && stats.nativeMeshesHidden === 0) failures.push(`${frame.file}: original hair still visible`);
    if (frame.turned && stats.headTurnDegrees < 20) failures.push(`${frame.file}: head did not rotate`);
    if (Object.values(stats.driftMm).some(mm => !Number.isFinite(mm) || mm > 1)) failures.push(`${frame.file}: rigid head-relative drift over 1 mm`);
    if (frame.variant.startsWith("ponytail-") && stats.hairPixels < 20) failures.push(`${frame.file}: no visible hair in tie closeup`);
  }
  for (const model of models) {
    if (baseline) continue;
    for (const variant of ["short", "long", "ponytail"]) {
      for (const turned of [false, true]) {
        const angles = frames.filter(frame => frame.model === model && frame.variant === variant && frame.turned === turned);
        if (!angles.some(({ stats }) => Math.min(stats.hairPixels, stats.cap.visible, stats.sunglasses.visible) >= 20)) {
          failures.push(`${model}/${variant}/${turned}: no view shows all three simultaneously`);
        }
        if (variant !== "short" && !angles.some(({ stats }) => stats.comparedStyle !== variant && (stats.changedPixels ?? 0) >= 20)) {
          failures.push(`${model}/${variant}/${turned}: style swap did not change visible pixels`);
        }
      }
    }
  }
  const radii = models.map(model => frames.find(frame => frame.model === model)?.stats.headFit.radius);
  if (radii[0] && radii[1] && radii[0].every((r, i) => Math.abs(r - radii[1]![i]!) < 0.0001)) {
    failures.push("Two fixtures returned the same measured head dimensions");
  }
  return failures;
}

async function compareBaseline(page: Page, directory: string, baseline: Frame[]) {
  const currentRoot = resolve(".artifacts/studio-hair-stack");
  const current: Frame[] = JSON.parse(await readFile(join(currentRoot, "review.json"), "utf8")).frames;
  const pairs = [];
  for (const model of models) {
    const sheetFrames: Frame[] = [], labels: string[] = [];
    for (const before of baseline.filter(f => f.model === model)) {
      const after = current.find(f => f.file === before.file);
      if (!after) throw new Error(`Missing current frame for ${before.file}`);
      const a = before.stats.camera, b = after.stats.camera;
      const sameCamera = JSON.stringify(a) === JSON.stringify(b);
      if (!sameCamera) throw new Error(`Mismatched comparison cameras: ${before.file}`);
      const sources = await Promise.all([directory, currentRoot].map(async dir =>
        (await readFile(join(dir, before.file))).toString("base64")));
      const changedPixels = await page.evaluate(async sources => {
        const images = await Promise.all(sources.map(async s => {
          const image = new Image(); image.src = "data:image/png;base64," + s; await image.decode();
          const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
          const ctx = canvas.getContext("2d")!; ctx.drawImage(image, 0, 0);
          return ctx.getImageData(0, 0, image.width, image.height).data;
        }));
        let changed = 0;
        const [a, b] = images;
        for (let i = 0; i < a!.length; i += 4) {
          if (Math.max(...[0, 1, 2].map(c => Math.abs(a![i + c]! - b![i + c]!))) >= 12) changed++;
        }
        return changed;
      }, sources);
      pairs.push({ file: before.file, sameCamera, changedPixels });
      sheetFrames.push(before, { ...after, file: join("../studio-hair-stack", after.file) });
      labels.push(`Base ${before.variant} ${before.view}`, `Current ${after.variant} ${after.view}`);
    }
    await sheet(page, directory, `comparison-${model}`, sheetFrames, 2, labels);
  }
  return pairs;
}

async function run(baselineRef?: string) {
  const directory = resolve(baselineRef ? ".artifacts/studio-hair-stack-baseline" : ".artifacts/studio-hair-stack");
  const outDir = join(directory, "runtime");
  await rm(directory, { recursive: true, force: true });
  await mkdir(join(directory, "screenshots"), { recursive: true });
  const options = { root, configFile: false as const, publicDir: false as const, build: { outDir, emptyOutDir: true },
    esbuild: { jsx: "automatic" as const }, resolve: { alias: { "@": process.cwd() } } };
  await build({ ...options, plugins: baselineRef ? [rendererSources(baselineRef)] : [] });
  await symlink(resolve("apps/web/public/assets/3d"), join(outDir, "assets/3d"), "dir");
  await symlink(resolve("apps/web/public/vrm"), join(outDir, "vrm"), "dir");
  const server = await preview({ ...options, preview: { host: "127.0.0.1", port: 0 } });
  const address = server.httpServer.address();
  if (!address || typeof address === "string") throw new Error("Missing review server port");
  const frames: Frame[] = [], errors: string[] = [];
  let comparison: Awaited<ReturnType<typeof compareBaseline>> = [];
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.waitForFunction(() => window.studioHairStack?.ready);
    const standard = ["short", "long", "ponytail"].map(style => ({ variant: style, style, height: undefined }));
    const extrema = [{ variant: "ponytail-low", style: "ponytail", height: 0 }, { variant: "ponytail-high", style: "ponytail", height: 1 }];
    for (const model of models) {
      await page.evaluate(model => window.studioHairStack.load(model), model);
      await page.waitForFunction(model => window.studioHairStack.model === model, model);
      for (const choice of baselineRef ? extrema : [...standard, ...extrema]) {
        await page.evaluate(({ style, height }) => window.studioHairStack.style(style, height), choice);
        const closeup = choice.height !== undefined;
        for (const turned of closeup ? [false] : [false, true]) {
          await page.evaluate(turned => window.studioHairStack.pose(turned), turned);
          for (const view of closeup ? ["side", "back"] as const : views) {
            await page.evaluate(({ view, closeup }) => window.studioHairStack.view(view, closeup), { view, closeup });
            await page.waitForFunction(() => window.studioHairStack.settled(), undefined, { timeout: 45_000 });
            const spec = { variant: choice.variant, view, turned };
            const { png, stats } = await page.evaluate(spec => window.studioHairStack.inspect(spec), spec);
            const file = `screenshots/${model}-${choice.variant}-${turned ? "turned" : "neutral"}-${view}.png`;
            await writeFile(join(directory, file), Buffer.from(png.split(",")[1]!, "base64"));
            frames.push({ ...spec, model, file, stats });
          }
        }
        console.log(`Captured ${model}/${choice.variant} (${frames.length} frames)`);
      }
      for (const variant of baselineRef ? ["ponytail"] : ["short", "long", "ponytail"]) {
        await sheet(page, directory, `${model}-${variant}`, frames.filter(f => f.model === model && f.variant.startsWith(variant)));
      }
    }
    if (baselineRef) comparison = await compareBaseline(page, directory, frames);
  } catch (error) {
    errors.push(String(error));
  } finally {
    await browser.close();
    await server.close();
  }
  const failures = [...errors, ...validate(frames, Boolean(baselineRef))];
  const sourceRef = baselineRef ?? currentRef;
  const sources = Object.fromEntries(sourcePaths.map(path => [path, git("rev-parse", `${sourceRef}:${path}`)]));
  await writeFile(join(directory, "review.json"), JSON.stringify({ currentRef, geometrySourceRef: sourceRef, sources,
    fixture: { models, styles: ["short", "long", "ponytail"], props: ["cap", "sunglasses"], width: 512, height: 512,
      renderer: "Chromium ANGLE SwiftShader", minRgbDifference: 12, driftUnits: "millimetres", rigidDriftLimitMm: 1 },
    frames, comparison, failures }, null, 2));
  return failures;
}

const index = process.argv.indexOf("--baseline-ref");
const candidate = index < 0 ? undefined : process.argv[index + 1];
if (index >= 0 && !/^[0-9a-f]{40}$/iu.test(candidate ?? "")) throw new Error("--baseline-ref needs a full commit SHA");
const failures = await run();
if (candidate) failures.push(...await run(candidate));
if (failures.length) throw new Error(failures.join("\n"));
