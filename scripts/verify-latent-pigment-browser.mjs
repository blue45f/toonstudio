/**
 * 자체 잠재 안료의 실제 브라우저 검증. 전체 앱·운영 배포·원본 Mixbox 출력 비교와 구분한다.
 * WebGL 3경로, 기본 표 33, 브러시 23종과 합성 펜 입력은 필수다.
 * WebGPU 미지원은 unavailable로 기록하며, 지원되는 장치의 계산 실패는 검증 실패다.
 * 앱 소스는 수정하지 않고 .qa 아래에 작은 fixture와 증거를 생성한다.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright";
import { build } from "vite";

const SCRIPT = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT), "..");
const OUTPUT = path.join(ROOT, ".qa/mixbox-internalization/browser-probe");
const RESULT_TIMEOUT_MS = 180_000;
const BROWSER_TIMEOUT_MS = 30_000;
const ARTIFACTS = ["fixture.ts", "dist/fixture.js", "module-audit.json", "result.json", "brushes-23.png", "verifier-source.mjs"];
const EXPECTED_IDS = [
  "mixbox-oil-bristle", "mixbox-watercolor-bloom", "mixbox-gouache-dual", "mixbox-pastel-smudge",
  "mixbox-alcohol-marker", "mixbox-palette-knife", "mixbox-color-smudge", "mixbox-colored-pencil",
  "mixbox-charcoal-rake", "mixbox-pigment-spray", "mixbox-wax-resist", "mixbox-bristle-calligraphy",
  "mixbox-foliage-stamp", "mixbox-neon-wet", "mixbox-granulating-ink", "mixbox-water-brush",
  "mixbox-oil-pastel-film", "mixbox-crosshatch-color", "mixbox-reaction-bloom", "mixbox-linen-weave",
  "mixbox-glaze-marker", "mixbox-phyllotaxis-stipple", "mixbox-braided-paint",
];
const FIXTURE_EXPORTS = [
  ["pigment/toonstudio-pigment.ts", "*"],
  ["pigment/latent-pigment-table.ts", "bakeLatentPigmentTable, mixRgbLatentPigmentTable"],
  ["pigment/latent-pigment-shaders.ts", "latentPigmentWebGpuTableUpload"],
  ["brush-studio-v6-engine.ts", "BRUSH_STUDIO_V6_RECIPES, createBrushStudioV6Program"],
  ["brush-studio-v6-preview.ts", "renderBrushStudioV6Preview, attachBrushStudioV6LivePreview"],
  ["brush-studio-v6-pigment-provider.ts", "brushStudioV6PigmentProviderForNode"],
];
const HTML = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>자체 안료 브러시 검증</title>
<style>
body{font-family:Arial,sans-serif;background:#ecebe6;color:#17232a;margin:24px}
h1{font-size:25px}#cards{display:grid;grid-template-columns:repeat(3,330px);gap:16px}
.card{padding:8px;background:white;border-radius:8px}h2{font-size:14px;height:30px;margin:0}
canvas{width:320px;height:140px}#live{width:640px;height:180px}
</style></head><body>
<h1>자체 잠재 안료 · 브러시 23종 브라우저 검증</h1>
<p>구성과 자체 혼색 연결을 확인합니다. 원본 Mixbox와 픽셀 동일성 비교가 아닙니다.</p>
<div id="cards"></div><h2>합성 펜 입력 검증</h2><canvas id="live" width="640" height="180"></canvas>
</body></html>`;

function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
async function json(file, value) { await writeFile(file, `${JSON.stringify(value, null, 2)}\n`); }
async function optionalJson(file) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

export function isExternalMixboxModule(id) {
  const normalized = id.replaceAll("\\", "/").split("?")[0];
  return normalized === "mixbox" || normalized.startsWith("mixbox/")
    || /(?:^|\/)node_modules\/(?:\.pnpm\/mixbox@[^/]+\/node_modules\/)?mixbox(?:\/|$)/u.test(normalized);
}

export async function compareModuleSources(root, audit) {
  const changed = [];
  const unavailable = [];
  for (const module of audit?.modules ?? []) {
    if (module.virtual) continue;
    try {
      const currentSha256 = digest(await readFile(path.resolve(root, module.id)));
      if (currentSha256 !== module.sha256) changed.push({ id: module.id, recordedSha256: module.sha256, currentSha256 });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      unavailable.push(module.id);
    }
  }
  return { stale: changed.length > 0 || unavailable.length > 0, changed, unavailable };
}

export async function verifyArtifactDigests(directory, record) {
  const entries = record?.schemaVersion === 2 ? record.artifacts : record ?? {};
  const artifacts = [];
  for (const [name, expected] of Object.entries(entries)) {
    if (typeof expected !== "string" || ![...ARTIFACTS, "run.mjs"].includes(name)) continue;
    let actual = null;
    try { actual = digest(await readFile(path.join(directory, name))); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    artifacts.push({ name, expected, actual, verified: actual === expected });
  }
  return { verified: artifacts.length > 0 && artifacts.every((row) => row.verified), artifacts };
}

async function preservePreviousEvidence(runId) {
  const previous = await optionalJson(path.join(OUTPUT, "artifact-digests.json"));
  if (!previous) return null;
  const previousAudit = await optionalJson(path.join(OUTPUT, "module-audit.json"));
  const previousVerifier = previous.verifier ? {
    recordedSha256: previous.verifier.sha256,
    currentSha256: digest(await readFile(SCRIPT)),
  } : null;
  const sourceStatus = await compareModuleSources(ROOT, previousAudit);
  const verifierChanged = previousVerifier !== null && previousVerifier.recordedSha256 !== previousVerifier.currentSha256;
  const prior = {
    status: "superseded", archivedByRun: runId,
    sourceStatusAtSupersession: { ...sourceStatus, stale: sourceStatus.stale || verifierChanged, previousVerifier },
    artifactIntegrity: await verifyArtifactDigests(OUTPUT, previous),
  };
  const archive = path.join(OUTPUT, "history", runId);
  for (const name of [...ARTIFACTS, "artifact-digests.json", "run.mjs"]) {
    const target = path.join(archive, name);
    await mkdir(path.dirname(target), { recursive: true });
    try { await copyFile(path.join(OUTPUT, name), target); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  await json(path.join(archive, "superseded.json"), prior);
  await json(path.join(OUTPUT, "previous-evidence-state.json"), { ...prior, archive: path.relative(ROOT, archive) });
  // 실패한 새 실행이 과거의 녹색 결과를 최신 결과처럼 남기지 않게 한다.
  for (const name of ["result.json", "artifact-digests.json", "module-audit.json", "brushes-23.png"]) {
    await rm(path.join(OUTPUT, name), { force: true });
  }
  return { archive: path.relative(ROOT, archive), ...prior };
}

async function buildFixture() {
  const sourceRoot = path.join(ROOT, "apps/web/src/domains/creator/brush-lab");
  const fixture = FIXTURE_EXPORTS.map(([file, names]) =>
    `export ${names === "*" ? "*" : `{ ${names} }`} from ${JSON.stringify(path.join(sourceRoot, file))};`,
  ).join("\n");
  await writeFile(path.join(OUTPUT, "fixture.ts"), `${fixture}\n`);
  await build({
    configFile: false, envDir: false, root: ROOT, publicDir: false, logLevel: "warn",
    resolve: { alias: { "@": path.join(ROOT, "apps/web/src") } },
    plugins: [{
      name: "latent-pigment-browser-module-evidence",
      async generateBundle(_options, bundle) {
        const ids = [...new Set(Object.values(bundle).filter((row) => row.type === "chunk")
          .flatMap((row) => Object.keys(row.modules)))].sort();
        const forbiddenModules = ids.filter(isExternalMixboxModule);
        if (forbiddenModules.length) throw new Error(`브라우저 fixture에 외부 Mixbox가 있습니다: ${forbiddenModules.join(", ")}`);
        const modules = await Promise.all(ids.map(async (id) => id.startsWith("\0")
          ? { id, sha256: null, virtual: true }
          : { id: path.relative(ROOT, id.split("?")[0]), sha256: digest(await readFile(id.split("?")[0])) }));
        await json(path.join(OUTPUT, "module-audit.json"), { scope: "bounded browser fixture", forbiddenModules, modules });
      },
    }],
    build: {
      outDir: path.join(OUTPUT, "dist"), emptyOutDir: true, copyPublicDir: false, minify: false,
      lib: { entry: path.join(OUTPUT, "fixture.ts"), formats: ["es"], fileName: () => "fixture.js" },
    },
  });
  await writeFile(path.join(OUTPUT, "dist/index.html"), HTML);
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("검증용 로컬 포트를 할당하지 못했습니다.");
  return address.port;
}

async function within(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} 제한 시간 ${milliseconds}ms를 넘었습니다.`)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

/** Playwright가 이 함수 전체를 브라우저로 직렬화하므로 내부 함수는 외부 클로저를 읽지 않는다. */
async function inspectBrowserPigment({ expectedIds, fixtureModuleUrl }) {
  const m = await import(fixtureModuleUrl);
  const tableStarted = performance.now();
  const table = m.bakeLatentPigmentTable(33);
  const tableBakeMs = performance.now() - tableStarted;
  const modes = ["srgb", "srgb-rgba-coverage", "linear", "linear-rgba-coverage"];
  const cases = [
    [[1, 0.8, 0], [0, 0.1, 0.6], 0], [[1, 0.8, 0], [0, 0.1, 0.6], 0.25],
    [[1, 0.8, 0], [0, 0.1, 0.6], 0.5], [[1, 0.8, 0], [0, 0.1, 0.6], 0.75],
    [[1, 0.8, 0], [0, 0.1, 0.6], 1], [[0.1, 0.2, 0.3], [0.9, 0.7, 0.5], 0.4],
    [[0, 0, 0], [1, 1, 1], 0.5], [[1, 0, 1], [0, 1, 0], 0.6],
  ];

  function reference(mode, a, b, t, alphaA = 0.15, alphaB = 0.8) {
    const alpha = alphaA * (1 - t) + alphaB * t;
    const colorT = mode % 2 ? alphaB * t / alpha : t;
    const first = mode >= 2 ? a.map(m.pigmentLinearToSrgb) : a;
    const second = mode >= 2 ? b.map(m.pigmentLinearToSrgb) : b;
    const mixed = m.mixRgbLatentPigmentTable(first, second, colorT, table);
    const rgb = mode >= 2 ? mixed.map(m.pigmentSrgbToLinear) : mixed;
    return [...rgb, mode % 2 ? alpha : 1];
  }
  function maximumError(actual, expected) {
    return Math.max(...expected.map((value, index) => Math.abs(value - actual[index])));
  }
  function renderer(gl) {
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const description = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return {
      vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: description, version: gl.getParameter(gl.VERSION),
      softwareRenderer: /swiftshader|llvmpipe|software|softpipe/i.test(description),
    };
  }
  function dirtyUnpack(gl, modern) {
    const parameters = [gl.UNPACK_ALIGNMENT, gl.UNPACK_FLIP_Y_WEBGL,
      gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, gl.UNPACK_COLORSPACE_CONVERSION_WEBGL];
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 8);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
    let buffer = null;
    if (modern) {
      const values = [[gl.UNPACK_ROW_LENGTH, 7], [gl.UNPACK_IMAGE_HEIGHT, 9],
        [gl.UNPACK_SKIP_PIXELS, 1], [gl.UNPACK_SKIP_ROWS, 1], [gl.UNPACK_SKIP_IMAGES, 1]];
      for (const [parameter, value] of values) { parameters.push(parameter); gl.pixelStorei(parameter, value); }
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, buffer);
      gl.bufferData(gl.PIXEL_UNPACK_BUFFER, 1024, gl.STATIC_DRAW);
    }
    return { parameters, buffer, before: parameters.map((parameter) => gl.getParameter(parameter)) };
  }
  function compile(gl, type, source, label) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error(`${label} 셰이더 할당 실패`);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`${label} 셰이더 컴파일 실패: ${message}`);
    }
    return shader;
  }
  function inspectWebGl(api, layout) {
    const canvas = document.createElement("canvas");
    canvas.width = 1; canvas.height = 1;
    const gl = canvas.getContext(api, { alpha: true, premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: true });
    if (!gl) return { api, layout, available: false, pass: false, reason: "필수 WebGL 컨텍스트 미지원" };
    const modern = api === "webgl2";
    const state = dirtyUnpack(gl, modern);
    let resource, vertexShader, fragmentShader, program, buffer;
    try {
      resource = m.createLatentPigmentWebGlResource(gl, { table, tableLayout: layout });
      const after = state.parameters.map((parameter) => gl.getParameter(parameter));
      const restored = state.before.every((value, index) => value === after[index])
        && (!modern || gl.getParameter(gl.PIXEL_UNPACK_BUFFER_BINDING) === state.buffer);
      const vertex = `${modern ? "#version 300 es\nin" : "attribute"} vec2 p;
void main(){gl_Position=vec4(p,0.0,1.0);}`;
      const fragment = `${modern ? "#version 300 es\n" : ""}precision highp float;
precision highp int;
${m.glsl({ version: resource.version, tableLayout: layout, tableSize: table.size })}
uniform vec4 a; uniform vec4 b; uniform float t; uniform int mode;
${modern ? "out vec4 color;" : ""}
void main(){
  ${modern ? "color" : "gl_FragColor"} = mode==0 ? vec4(toonstudio_pigment_lerp(a.rgb,b.rgb,t),1.0)
    : mode==1 ? latent_pigment_mix_rgba(a,b,t)
    : mode==2 ? vec4(toonstudio_pigment_lerp_linear(a.rgb,b.rgb,t),1.0)
    : mode==3 ? latent_pigment_mix_linear_rgba(a,b,t)
    : mode==4 ? toonstudio_pigment_lerp(a,b,t) : toonstudio_pigment_lerp_linear(a,b,t);
}`;
      vertexShader = compile(gl, gl.VERTEX_SHADER, vertex, `${api}/${layout}`);
      fragmentShader = compile(gl, gl.FRAGMENT_SHADER, fragment, `${api}/${layout}`);
      program = gl.createProgram();
      if (!program) throw new Error("WebGL 프로그램 할당 실패");
      gl.attachShader(program, vertexShader); gl.attachShader(program, fragmentShader); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`WebGL 링크 실패: ${gl.getProgramInfoLog(program)}`);
      gl.useProgram(program); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(resource.target, resource.texture);
      gl.uniform1i(gl.getUniformLocation(program, "u_latentPigmentTable"), 0);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const location = gl.getAttribLocation(program, "p");
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
      gl.viewport(0, 0, 1, 1); gl.disable(gl.DITHER);
      const uniform = (mode, a, b, t) => {
        gl.uniform4fv(gl.getUniformLocation(program, "a"), a);
        gl.uniform4fv(gl.getUniformLocation(program, "b"), b);
        gl.uniform1f(gl.getUniformLocation(program, "t"), t);
        gl.uniform1i(gl.getUniformLocation(program, "mode"), mode);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const actual = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, actual);
        return Array.from(actual);
      };
      const pixels = [];
      for (const mode of [0, 1, 2, 3]) for (const [a, b, t] of cases) {
        const actual = uniform(mode, [...a, 0.15], [...b, 0.8], t);
        const expected = reference(mode, a, b, t).map((value) => Math.round(value * 255));
        pixels.push({ mode: modes[mode], a, b, t, actual, expected, error: maximumError(actual, expected) });
      }
      const publicAlpha = [4, 5].map((mode) => {
        const a = [1, 0, 0, 0], b = [0, 0, 1, 1], t = 0.5;
        const actual = uniform(mode, a, b, t);
        const cpu = (mode === 4 ? m.toonstudioPigment.lerpFloat : m.toonstudioPigment.lerpLinearFloat)(a, b, t);
        const expected = cpu.map((value) => Math.round(value * 255));
        const error = maximumError(actual, expected);
        return { mode: mode === 4 ? "public-independent-rgba" : "public-independent-linear-rgba", a, b, t, actual, expected, error, pass: error <= 2 };
      });
      const maxError = Math.max(...pixels.map((pixel) => pixel.error), ...publicAlpha.map((pixel) => pixel.error));
      const webglError = gl.getError();
      return { api, layout, available: true, device: renderer(gl), shaderCompiled: true, pixels, publicAlpha,
        maxError, webglError, unpackBefore: state.before, unpackAfter: after, unpackStateRestored: restored,
        pass: maxError <= 2 && webglError === gl.NO_ERROR && restored };
    } finally {
      resource?.dispose();
      for (const value of [buffer, state.buffer]) if (value) gl.deleteBuffer(value);
      if (program) gl.deleteProgram(program);
      for (const shader of [vertexShader, fragmentShader]) if (shader) gl.deleteShader(shader);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  }
  async function inspectWebGpu() {
    if (!navigator.gpu) return { available: false, state: "unavailable", reason: "navigator.gpu 미지원", pass: null };
    let adapter, device;
    try { adapter = await navigator.gpu.requestAdapter({ forceFallbackAdapter: true }); }
    catch (error) { return { available: false, state: "unavailable", reason: `fallback adapter 요청 실패: ${error.message}`, pass: null }; }
    if (!adapter) return { available: false, state: "unavailable", reason: "fallback adapter 미지원", pass: null };
    try { device = await adapter.requestDevice(); }
    catch (error) { return { available: false, state: "unavailable", reason: `WebGPU 장치 미지원: ${error.message}`, pass: null }; }
    const allocated = [];
    try {
      const errors = [];
      device.addEventListener("uncapturederror", (event) => errors.push(event.error.message));
      const upload = m.latentPigmentWebGpuTableUpload(table);
      const texture = device.createTexture({ size: upload.size, dimension: upload.dimension,
        format: upload.format, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
      allocated.push(texture);
      device.queue.writeTexture({ texture }, upload.data, { bytesPerRow: upload.bytesPerRow, rowsPerImage: upload.rowsPerImage }, upload.size);
      const inputs = [], expected = [];
      for (const mode of [0, 1, 2, 3]) for (const [a, b, t] of cases) {
        inputs.push(...a, 0.15, ...b, 0.8, t, mode, 0, 0);
        expected.push(reference(mode, a, b, t));
      }
      const allocate = (size, usage) => { const value = device.createBuffer({ size, usage }); allocated.push(value); return value; };
      const input = allocate(inputs.length * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
      device.queue.writeBuffer(input, 0, new Float32Array(inputs));
      const output = allocate(expected.length * 16, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
      const readback = allocate(expected.length * 16, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ);
      const compute = `
struct Input { a:vec4f, b:vec4f, data:vec4f }
@group(0) @binding(1) var<storage,read> inputs:array<Input>;
@group(0) @binding(2) var<storage,read_write> outputs:array<vec4f>;
@compute @workgroup_size(32)
fn main(@builtin(global_invocation_id) index:vec3u){
  let i=index.x;if(i>=arrayLength(&inputs)){return;}
  let a=inputs[i].a;let b=inputs[i].b;let t=inputs[i].data.x;let mode=u32(inputs[i].data.y);
  if(mode==0){outputs[i]=vec4f(latent_pigment_mix(a.rgb,b.rgb,t),1.0);}
  else if(mode==1){outputs[i]=latent_pigment_mix_rgba(a,b,t);}
  else if(mode==2){outputs[i]=vec4f(latent_pigment_mix_linear(a.rgb,b.rgb,t),1.0);}
  else {outputs[i]=latent_pigment_mix_linear_rgba(a,b,t);}
}`;
      const module = device.createShaderModule({ code: m.buildLatentPigmentWgsl({ tableSize: table.size }) + compute });
      const diagnostics = await module.getCompilationInfo();
      const compilationErrors = diagnostics.messages.filter((message) => message.type === "error").map((message) => message.message);
      if (compilationErrors.length) throw new Error(`WGSL 컴파일 실패: ${compilationErrors.join("; ")}`);
      const layout = device.createBindGroupLayout({ entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float", viewDimension: "3d" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      ] });
      const pipeline = await device.createComputePipelineAsync({ layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
        compute: { module, entryPoint: "main" } });
      const binding = device.createBindGroup({ layout, entries: [{ binding: 0, resource: texture.createView() },
        { binding: 1, resource: { buffer: input } }, { binding: 2, resource: { buffer: output } }] });
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline); pass.setBindGroup(0, binding); pass.dispatchWorkgroups(1); pass.end();
      encoder.copyBufferToBuffer(output, 0, readback, 0, expected.length * 16);
      device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const values = new Float32Array(readback.getMappedRange()).slice();
      readback.unmap();
      const pixels = expected.map((color, index) => {
        const actual = Array.from(values.slice(index * 4, index * 4 + 4));
        return { mode: modes[Math.floor(index / cases.length)], actual, expected: color, error: maximumError(actual, color) };
      });
      const maxError = Math.max(...pixels.map((pixel) => pixel.error));
      return { available: true, state: "verified", adapter: { vendor: adapter.info.vendor,
        architecture: adapter.info.architecture, device: adapter.info.device, description: adapter.info.description,
        isFallbackAdapter: adapter.info.isFallbackAdapter, softwareRenderer: /swiftshader|software|llvmpipe/i.test(adapter.info.architecture) },
      shaderCompiled: true, count: pixels.length, pixels, maxError, uncapturedErrors: errors, pass: maxError <= 2 / 255 && errors.length === 0 };
    } finally {
      for (const value of allocated) value.destroy();
      device.destroy();
    }
  }
  function inspectBrushes() {
    const recipes = m.BRUSH_STUDIO_V6_RECIPES.filter((recipe) => recipe.id.startsWith("mixbox-"));
    return recipes.map((recipe) => {
      const card = document.createElement("div"); card.className = "card";
      const heading = document.createElement("h2"); heading.textContent = recipe.label; card.append(heading);
      const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 140;
      card.append(canvas); document.querySelector("#cards").append(card);
      const program = m.createBrushStudioV6Program(recipe.id);
      m.renderBrushStudioV6Preview(canvas, program);
      const first = canvas.toDataURL();
      m.renderBrushStudioV6Preview(canvas, program);
      const deterministic = first === canvas.toDataURL();
      const data = canvas.getContext("2d").getImageData(0, 0, 320, 140).data;
      let coloredPixels = 0;
      for (let offset = 0; offset < data.length; offset += 4) {
        if (Math.max(data[offset], data[offset + 1], data[offset + 2]) - Math.min(data[offset], data[offset + 1], data[offset + 2]) > 20) coloredPixels += 1;
      }
      const provider = m.brushStudioV6PigmentProviderForNode(program.slots.pigment)?.id;
      return { id: recipe.id, name: recipe.label, pigment: program.slots.pigment, provider, deterministic,
        coloredPixels, pass: deterministic && coloredPixels > 0 && provider === "toonstudio-latent-pigment-v1" };
    });
  }
  function inspectPen() {
    const canvas = document.querySelector("#live");
    const program = m.createBrushStudioV6Program("mixbox-oil-bristle");
    const telemetry = [];
    const controller = m.attachBrushStudioV6LivePreview(canvas, () => program, (value) => telemetry.push(value));
    const before = canvas.toDataURL();
    const rect = canvas.getBoundingClientRect();
    let dispatchedEvents = 0;
    const dispatch = (type, x, pressure) => {
      dispatchedEvents += 1;
      canvas.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: "pen", isPrimary: true, button: 0,
        buttons: type === "pointerup" ? 0 : 1, clientX: rect.left + x, clientY: rect.top + 80 + Math.sin(x / 50) * 20,
        pressure, bubbles: true, tiltX: 15, tiltY: 5 }));
    };
    try {
      dispatch("pointerdown", 20, 0.1);
      for (let x = 25; x <= 600; x += 5) {
        const pressure = 0.15 + 0.7 * Math.sin((x - 20) / 580 * Math.PI);
        dispatch("pointerrawupdate", x, pressure); dispatch("pointermove", x, pressure);
      }
      dispatch("pointerup", 605, 0);
      const changed = before !== canvas.toDataURL();
      const provider = m.brushStudioV6PigmentProviderForNode(program.slots.pigment)?.id;
      return { input: "synthetic PointerEvent; not physical pen", changed, dispatchedEvents,
        telemetryCount: telemetry.length, provider, pass: changed && telemetry.length > 0 && provider === "toonstudio-latent-pigment-v1" };
    } finally { controller.destroy(); }
  }
  const gpu = [["webgl", "atlas-2d"], ["webgl2", "atlas-2d"], ["webgl2", "texture-3d"]]
    .map(([api, layout]) => inspectWebGl(api, layout));
  const webgpu = await inspectWebGpu();
  const cpuApi = {
    namedCss: m.toonstudioPigment.lerp("red", "blue", 0),
    rgbObject: m.toonstudioPigment.lerp({ r: 255, g: 0, b: 0, a: 64 }, { r: 0, g: 0, b: 255, a: 192 }, 0.5),
    floatObject: m.toonstudioPigment.lerpFloat({ r: 1, g: 0, b: 0 }, { r: 0, g: 0, b: 1 }, 1),
  };
  cpuApi.pass = JSON.stringify(cpuApi.namedCss) === "[255,0,0]"
    && JSON.stringify(cpuApi.floatObject) === "[0,0,1]"
    && cpuApi.rgbObject.length === 4 && cpuApi.rgbObject.every(Number.isFinite) && cpuApi.rgbObject[3] === 128;
  const brushes = inspectBrushes();
  const live = inspectPen();
  const recipeIdsMatch = JSON.stringify(brushes.map((brush) => brush.id).sort()) === JSON.stringify([...expectedIds].sort());
  return { scope: "bounded standalone library probe; not full app, deployed smoke or original Mixbox parity",
    tableSize: table.size, tableBakeMs, gpu, webgpu, cpuApi, brushes, recipeIdsMatch, live,
    requiredWebGpu: false, pass: cpuApi.pass && gpu.every((row) => row.pass) && (!webgpu.available || webgpu.pass)
      && recipeIdsMatch && brushes.every((brush) => brush.pass) && live.pass };
}

function summary(result) {
  return { pass: result.pass, browser: result.browserVersion, tableSize: result.tableSize,
    gpu: result.gpu.map(({ api, layout, maxError, pass, device, unpackStateRestored }) =>
      ({ api, layout, maxError, pass, device, unpackStateRestored })),
    webgpu: { available: result.webgpu.available, state: result.webgpu.state, reason: result.webgpu.reason,
      adapter: result.webgpu.adapter, count: result.webgpu.count, maxError: result.webgpu.maxError, pass: result.webgpu.pass },
    brushes: result.brushes.length, brushFailures: result.brushes.filter((row) => !row.pass),
    live: result.live, consoleErrors: result.consoleErrors, resultPath: path.join(OUTPUT, "result.json") };
}

export async function runBrowserVerification() {
  await mkdir(OUTPUT, { recursive: true });
  const runId = `${Date.now()}-${process.pid}`;
  const previousEvidence = await preservePreviousEvidence(runId);
  const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  const workingTreeDirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim().length > 0;
  const verifierSha256 = digest(await readFile(SCRIPT));
  await copyFile(SCRIPT, path.join(OUTPUT, "verifier-source.mjs"));
  await json(path.join(OUTPUT, "run-state.json"), { status: "running", runId, sourceRevision, workingTreeDirty, previousEvidence });
  let server, browser;
  try {
    await buildFixture();
    server = createServer(async (request, response) => {
      const name = request.url === "/" ? "index.html" : request.url?.slice(1);
      if (!["index.html", "fixture.js"].includes(name)) { response.writeHead(404); response.end(); return; }
      try {
        response.setHeader("Content-Type", name.endsWith(".js") ? "text/javascript" : "text/html; charset=utf-8");
        response.end(await readFile(path.join(OUTPUT, "dist", name)));
      } catch { response.writeHead(500); response.end("검증 fixture를 읽지 못했습니다."); }
    });
    const port = await listen(server);
    browser = await chromium.launch({ headless: true, timeout: BROWSER_TIMEOUT_MS, args: ["--enable-unsafe-webgpu"] });
    const page = await browser.newPage({ viewport: { width: 1080, height: 1800 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(BROWSER_TIMEOUT_MS);
    const consoleErrors = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/`, { timeout: BROWSER_TIMEOUT_MS });
    const result = await within(page.evaluate(inspectBrowserPigment, {
      expectedIds: EXPECTED_IDS, fixtureModuleUrl: new URL("fixture.js", page.url()).href,
    }), RESULT_TIMEOUT_MS, "안료 브라우저 검증");
    Object.assign(result, { runId, sourceRevision, workingTreeDirty, verifierSha256, browserVersion: browser.version(), consoleErrors,
      browserFlags: ["--enable-unsafe-webgpu"], physicalGpuVerified: false, previousEvidence });
    const audit = await optionalJson(path.join(OUTPUT, "module-audit.json"));
    result.sourceDriftDuringRun = await compareModuleSources(ROOT, audit);
    result.verifierChangedDuringRun = digest(await readFile(SCRIPT)) !== verifierSha256;
    result.pass = result.pass && consoleErrors.length === 0 && !result.sourceDriftDuringRun.stale && !result.verifierChangedDuringRun;
    await page.screenshot({ path: path.join(OUTPUT, "brushes-23.png"), fullPage: true, timeout: BROWSER_TIMEOUT_MS });
    await json(path.join(OUTPUT, "result.json"), result);
    const artifacts = Object.fromEntries(await Promise.all(ARTIFACTS.map(async (name) =>
      [name, digest(await readFile(path.join(OUTPUT, name)))])));
    await json(path.join(OUTPUT, "artifact-digests.json"), { schemaVersion: 2,
      verifier: { path: path.relative(ROOT, SCRIPT), sha256: verifierSha256 }, artifacts });
    await json(path.join(OUTPUT, "run-state.json"), { status: result.pass ? "passed" : "failed", runId, sourceRevision, workingTreeDirty,
      resultSha256: artifacts["result.json"], previousEvidence });
    console.log(JSON.stringify(summary(result), null, 2));
    if (!result.webgpu.available) console.log(`WebGPU 검증 미실행: ${result.webgpu.reason}`);
    if (!result.pass) throw new Error("자체 안료의 필수 브라우저 검증이 실패했습니다. result.json을 확인하세요.");
    return result;
  } catch (error) {
    await json(path.join(OUTPUT, "run-state.json"), { status: "failed", runId, sourceRevision, workingTreeDirty,
      error: error instanceof Error ? error.message : String(error), previousEvidence });
    throw error;
  } finally {
    // 브라우저 종료가 실패하더라도 HTTP 서버 정리는 반드시 수행한다.
    try { if (browser) await browser.close(); }
    finally {
      if (server?.listening) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    }
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runBrowserVerification().catch((error) => {
    console.error(`자체 안료 브라우저 검증 실패: ${error instanceof Error ? error.message : String(error)}`);
    console.error("Chromium이 없으면 pnpm exec playwright install chromium을 실행한 환경에서 다시 검증하세요.");
    process.exitCode = 1;
  });
}
