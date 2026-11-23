import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { THORVG_WEB_VERSION } from "./audit";

import type { Browser, Page } from "playwright";
import type { ViteDevServer } from "vite";

// 현재 DOM 타입에 없는 플래그 namespace만 이 테스트 모듈에서 선언한다.
// 런타임 값은 브라우저의 표준 WebGPU 전역 상수를 그대로 사용한다.
declare const GPUTextureUsage: {
  readonly RENDER_ATTACHMENT: number;
  readonly COPY_SRC: number;
};
declare const GPUBufferUsage: {
  readonly COPY_DST: number;
  readonly MAP_READ: number;
};
declare const GPUMapMode: {
  readonly READ: number;
};

const ENABLED = process.env.THORVG_BROWSER_PROBE === "1";
const describeProbe = ENABLED ? describe : describe.skip;

describe("ThorVG npm 배포와 커밋된 WASM의 정합성", () => {
  it("설치한 고정 버전과 실행 영수증·WASM 원본·무결성 해시가 일치한다", () => {
    const require = createRequire(import.meta.url);
    const installedDist = dirname(require.resolve("@thorvg/webcanvas"));
    const installedManifest: unknown = JSON.parse(
      readFileSync(join(installedDist, "..", "package.json"), "utf8"),
    );
    expect(installedManifest).toMatchObject({
      name: "@thorvg/webcanvas",
      version: THORVG_WEB_VERSION,
    });
    const wasmDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "wasm");
    const installedWasm = readFileSync(join(installedDist, "thorvg.wasm"));
    const committedWasm = readFileSync(join(wasmDirectory, "thorvg.wasm"));
    const sha256 = createHash("sha256").update(committedWasm).digest("hex");
    expect(committedWasm.equals(installedWasm)).toBe(true);
    expect(WebAssembly.validate(new Uint8Array(committedWasm))).toBe(true);
    expect(readFileSync(join(wasmDirectory, "INTEGRITY.sha256"), "utf8"))
      .toBe(`${sha256}  thorvg.wasm\n`);
    console.info("[thorvg-integrity]", JSON.stringify({
      version: THORVG_WEB_VERSION,
      bytes: committedWasm.byteLength,
      sha256,
      installedPackageBytesMatch: true,
    }));
  });
});

const LAUNCH_CANDIDATES: Array<{
  readonly label: string;
  readonly options: {
    channel?: "chrome";
    executablePath?: string;
    headless: boolean;
    args: string[];
  };
}> = process.platform === "linux" ? [
  {
    label: "chromium headless (swiftshader Vulkan/ANGLE, unsafe-webgpu)",
    options: {
      headless: true,
      ...(process.env.THORVG_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.THORVG_CHROMIUM_EXECUTABLE_PATH }
        : {}),
      // 실제 software adapter와 canvas 공유 이미지의 Vulkan·ANGLE 구현을 일치시킨다.
      args: [
        "--enable-unsafe-webgpu",
        "--enable-features=Vulkan",
        "--use-vulkan=swiftshader",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
] : [
  {
    label: "playwright chromium headless shell (metal, unsafe-webgpu)",
    options: {
      headless: true,
      args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU", "--use-angle=metal"],
    },
  },
  {
    label: "system chrome headless (metal, unsafe-webgpu)",
    options: {
      channel: "chrome",
      headless: true,
      args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU", "--use-angle=metal"],
    },
  },
  {
    label: "system chrome headed (metal, unsafe-webgpu)",
    options: {
      channel: "chrome",
      headless: false,
      args: ["--enable-unsafe-webgpu", "--use-angle=metal"],
    },
  },
];

const SVG = `<svg width="96" height="96" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g"><stop stop-color="#ff0044"/><stop offset="1" stop-color="#0066ff"/></linearGradient>
    <filter id="f"><feGaussianBlur stdDeviation="2"/></filter>
  </defs>
  <rect x="12" y="12" width="72" height="72" rx="12" fill="url(#g)" filter="url(#f)"/>
</svg>`;

describeProbe("ThorVG selected-provider real-browser lifecycle", () => {
  let server: ViteDevServer;
  let browser: Browser | undefined;
  let page: Page;
  let baseUrl = "";
  const browserErrors: string[] = [];

  beforeAll(async () => {
    const { createServer } = await import("vite");
    server = await createServer({
      configFile: false,
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, strictPort: false },
      plugins: [{
        name: "thorvg-probe-page",
        configureServer(vite) {
          vite.middlewares.use("/favicon.ico", (_request, response) => {
            response.writeHead(204);
            response.end();
          });
          vite.middlewares.use("/__thorvg_probe__", (_request, response) => {
            response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
            response.end("<!doctype html><html><body></body></html>");
          });
        },
      }],
    });
    await server.listen();
    baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/u, "") ?? "";
    if (!baseUrl) throw new Error("ThorVG probe Vite server has no local URL");

    const { chromium } = await import("playwright");
    const launchErrors: string[] = [];
    for (const candidate of LAUNCH_CANDIDATES) {
      try {
        const attempt = await chromium.launch(candidate.options);
        const attemptPage = await attempt.newPage();
        await attemptPage.addInitScript(() => {
          const trace = (event: string, details: Record<string, unknown>) => {
            console.info("[thorvg-webgpu]", JSON.stringify({ event, ...details }));
          };
          trace("document", { timeOrigin: performance.timeOrigin, secureContext: isSecureContext });
          const gpu = navigator.gpu;
          if (!gpu) {
            trace("unavailable", { userAgent: navigator.userAgent });
            return;
          }
          // 실제 canvas 구성·해제 호출만 기록하며 원래 this와 인수를 그대로 전달한다.
          if (typeof GPUCanvasContext !== "undefined") {
            const configure = GPUCanvasContext.prototype.configure;
            const unconfigure = GPUCanvasContext.prototype.unconfigure;
            GPUCanvasContext.prototype.configure = function (
              this: GPUCanvasContext,
              configuration: GPUCanvasConfiguration,
            ) {
              trace("canvas-configure", {
                format: configuration.format,
                usage: configuration.usage ?? null,
                alphaMode: configuration.alphaMode ?? null,
                width: this.canvas.width,
                height: this.canvas.height,
              });
              return configure.call(this, configuration);
            };
            GPUCanvasContext.prototype.unconfigure = function (this: GPUCanvasContext) {
              trace("canvas-unconfigure", { width: this.canvas.width, height: this.canvas.height });
              return unconfigure.call(this);
            };
          }
          // SDK의 실제 요청만 관찰한다. 인수·반환값·거절 원인을 바꾸거나 장치를 미리 요청하지 않는다.
          const requestAdapter = gpu.requestAdapter.bind(gpu);
          gpu.requestAdapter = (options) => {
            trace("request-adapter", { options: options ?? null });
            return requestAdapter(options).then((adapter) => {
              trace("adapter-result", {
                available: adapter !== null,
                info: adapter ? {
                  vendor: adapter.info.vendor,
                  architecture: adapter.info.architecture,
                  device: adapter.info.device,
                  description: adapter.info.description,
                } : null,
              });
              if (adapter) {
                const requestDevice = adapter.requestDevice.bind(adapter);
                adapter.requestDevice = (descriptor) => {
                  trace("request-device", {
                    label: descriptor?.label ?? null,
                    requiredFeatures: Array.from(descriptor?.requiredFeatures ?? []),
                    requiredLimits: descriptor?.requiredLimits ?? null,
                  });
                  return requestDevice(descriptor).then((device) => {
                    trace("device-result", { label: device.label, features: Array.from(device.features) });
                    device.addEventListener("uncapturederror", (event) => {
                      console.error("[thorvg-webgpu-error]", JSON.stringify({ message: event.error.message }));
                    });
                    void device.lost.then((info) => {
                      trace("device-lost", { reason: info.reason, message: info.message });
                    });
                    return device;
                  }, (error: unknown) => {
                    trace("device-rejected", {
                      message: error instanceof Error ? error.message : String(error),
                    });
                    throw error;
                  });
                };
              }
              return adapter;
            }, (error: unknown) => {
              trace("adapter-rejected", {
                message: error instanceof Error ? error.message : String(error),
              });
              throw error;
            });
          };
        });
        attemptPage.on("console", (message) => {
          const text = message.text();
          if (message.type() === "error") browserErrors.push(text);
          if (message.type() === "error" || message.type() === "warning" || text.startsWith("[thorvg-")) {
            console.info("[thorvg-page]", JSON.stringify({ type: message.type(), text }));
          }
        });
        attemptPage.on("pageerror", (error) => {
          browserErrors.push(error.message);
          console.info("[thorvg-page-error]", error.message);
        });
        await attemptPage.goto(`${baseUrl}/__thorvg_probe__`);
        browser = attempt;
        page = attemptPage;
        console.info("[thorvg-browser]", JSON.stringify({
          candidate: candidate.label,
          version: attempt.version(),
          executablePath: candidate.options.executablePath ?? null,
        }));
        break;
      } catch (error) {
        launchErrors.push(
          `${candidate.label}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (!browser) {
      throw new Error(`ThorVG browser launch failed: ${launchErrors.join(" | ")}`);
    }
  }, 120_000);

  beforeEach(async () => {
    // 실패한 SDK의 전역 initialized 상태가 다음 사례에 남아 초기화를 건너뛰지 않게 한다.
    await page.goto("about:blank");
    browserErrors.length = 0;
    await page.goto(baseUrl + "/__thorvg_probe__");
  });

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  it("renders and releases 32 WebGPU surfaces without readback or leaked runtime refs", async () => {
    const result = await page.evaluate(async ({ moduleUrl, svg }) => {
      const importer = new Function("url", "return import(url)") as (
        url: string,
      ) => Promise<typeof import("./runtime")>;
      const runtime = await importer(moduleUrl);
      const dataUrlLengths: number[] = [];
      for (let index = 0; index < 32; index += 1) {
        try {
          const canvas = document.createElement("canvas");
          document.body.append(canvas);
          const surface = await runtime.mountThorvgAsset({
            canvas,
            kind: "svg",
            source: svg,
            width: 96,
            height: 96,
            backend: "wg",
          });
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          dataUrlLengths.push(canvas.toDataURL("image/png").length);
          const receipt = surface.receipt;
          if (
            receipt.selectedProviderId !== receipt.attemptedProviderId
            || receipt.attemptedProviderId !== receipt.activeProviderId
            || receipt.cpuReadbackBytes !== 0
          ) {
            throw new Error(`invalid provider receipt: ${JSON.stringify(receipt)}`);
          }
          surface.destroy();
          canvas.remove();
          const snapshot = runtime.thorvgRuntimeSnapshot();
          if (snapshot.backend !== null || snapshot.references !== 0) {
            throw new Error(`runtime leak after cycle ${index}: ${JSON.stringify(snapshot)}`);
          }
        } catch (error) {
          console.error("[thorvg-cycle-failure]", JSON.stringify({
            cycle: index + 1,
            totalCycles: 32,
            snapshot: runtime.thorvgRuntimeSnapshot(),
            message: error instanceof Error ? error.message : String(error),
          }));
          throw error;
        }
      }
      return {
        minimumDataUrlLength: Math.min(...dataUrlLengths),
        maximumDataUrlLength: Math.max(...dataUrlLengths),
        finalSnapshot: runtime.thorvgRuntimeSnapshot(),
      };
    }, {
      moduleUrl: `${baseUrl}/packages/studio-engine-thorvg/src/runtime.ts`,
      svg: SVG,
    });

    expect(result.minimumDataUrlLength).toBeGreaterThan(300);
    expect(result.maximumDataUrlLength).toBe(result.minimumDataUrlLength);
    expect(result.finalSnapshot).toEqual({ backend: null, references: 0 });
    expect(browserErrors).toEqual([]);
  }, 120_000);

  it("shares one backend across simultaneous surfaces and terminates only after the final owner", async () => {
    const snapshots = await page.evaluate(async ({ moduleUrl, svg }) => {
      const importer = new Function("url", "return import(url)") as (
        url: string,
      ) => Promise<typeof import("./runtime")>;
      const runtime = await importer(moduleUrl);
      const firstCanvas = document.createElement("canvas");
      const secondCanvas = document.createElement("canvas");
      document.body.append(firstCanvas, secondCanvas);
      console.info("[thorvg-owners]", JSON.stringify({ requested: 1, snapshot: runtime.thorvgRuntimeSnapshot() }));
      const first = await runtime.mountThorvgAsset({
        canvas: firstCanvas, kind: "svg", source: svg, width: 96, height: 96, backend: "wg",
      });
      console.info("[thorvg-owners]", JSON.stringify({ requested: 2, snapshot: runtime.thorvgRuntimeSnapshot() }));
      const second = await runtime.mountThorvgAsset({
        canvas: secondCanvas, kind: "svg", source: svg, width: 96, height: 96, backend: "wg",
      });
      const both = runtime.thorvgRuntimeSnapshot();
      first.destroy();
      const one = runtime.thorvgRuntimeSnapshot();
      second.destroy();
      const none = runtime.thorvgRuntimeSnapshot();
      firstCanvas.remove();
      secondCanvas.remove();
      return { both, one, none };
    }, {
      moduleUrl: `${baseUrl}/packages/studio-engine-thorvg/src/runtime.ts`,
      svg: SVG,
    });

    expect(snapshots).toEqual({
      both: { backend: "wg", references: 2 },
      one: { backend: "wg", references: 1 },
      none: { backend: null, references: 0 },
    });
    expect(browserErrors).toEqual([]);
  }, 120_000);

  // 직접 WebGPU 픽셀 확인으로 빈 출력을 렌더링 성공으로 판정하지 않게 한다.
  it("진단: 순수 WebGPU canvas의 렌더링과 명시적 해제를 두 번 반복한다", async () => {
    const result = await page.evaluate(async () => {
      const gpu = navigator.gpu;
      if (!gpu) throw new Error("WebGPU canvas control requires navigator.gpu");
      const dataUrlLengths: number[] = [];
      const centerPixels: number[][] = [];
      for (let index = 0; index < 2; index += 1) {
        let device: GPUDevice | undefined;
        let readbackBuffer: GPUBuffer | undefined;
        let context: GPUCanvasContext | null = null;
        const canvas = document.createElement("canvas");
        canvas.width = 96;
        canvas.height = 96;
        document.body.append(canvas);
        try {
          console.info("[thorvg-native-control]", JSON.stringify({ cycle: index + 1, phase: "request" }));
          const adapter = await gpu.requestAdapter({
            powerPreference: "high-performance",
            forceFallbackAdapter: false,
          });
          if (!adapter) throw new Error("WebGPU canvas control requestAdapter returned null");
          device = await adapter.requestDevice({ label: "ThorVG Device" });
          const acquiredContext = canvas.getContext("webgpu");
          if (!(acquiredContext instanceof GPUCanvasContext)) {
            throw new Error("WebGPU canvas control has no WebGPU canvas context");
          }
          context = acquiredContext;
          const format = gpu.getPreferredCanvasFormat();
          context.configure({
            device,
            format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
            alphaMode: "premultiplied",
          });
          const texture = context.getCurrentTexture();
          readbackBuffer = device.createBuffer({
            size: 256,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
          });
          const encoder = device.createCommandEncoder();
          const pass = encoder.beginRenderPass({
            colorAttachments: [{
              view: texture.createView(),
              clearValue: { r: 1, g: 0, b: 0, a: 1 },
              loadOp: "clear",
              storeOp: "store",
            }],
          });
          pass.end();
          // 현재 frame의 canvas texture에 대한 clear와 픽셀 복사를 같은 명령으로 제출한다.
          encoder.copyTextureToBuffer(
            { texture, origin: { x: 48, y: 48, z: 0 } },
            { buffer: readbackBuffer, bytesPerRow: 256, rowsPerImage: 1 },
            { width: 1, height: 1, depthOrArrayLayers: 1 },
          );
          device.queue.submit([encoder.finish()]);
          // 진단에만 CPU 픽셀 확인을 사용한다. 제품 surface의 readback 영수증은 바꾸지 않는다.
          await readbackBuffer.mapAsync(GPUMapMode.READ);
          const pixel = new DataView(readbackBuffer.getMappedRange());
          const rgba = [
            pixel.getUint8(format === "bgra8unorm" ? 2 : 0),
            pixel.getUint8(1),
            pixel.getUint8(format === "bgra8unorm" ? 0 : 2),
            pixel.getUint8(3),
          ];
          readbackBuffer.unmap();
          centerPixels.push(rgba);
          console.info("[thorvg-native-pixels]", JSON.stringify({ cycle: index + 1, format, rgba }));
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          dataUrlLengths.push(canvas.toDataURL("image/png").length);
        } catch (error) {
          console.error("[thorvg-native-control-failure]", JSON.stringify({
            cycle: index + 1,
            message: error instanceof Error ? error.message : String(error),
          }));
          throw error;
        } finally {
          if (readbackBuffer && readbackBuffer.mapState !== "unmapped") {
            readbackBuffer.unmap();
          }
          readbackBuffer?.destroy();
          context?.unconfigure();
          device?.destroy();
          canvas.remove();
        }
        console.info("[thorvg-native-control]", JSON.stringify({ cycle: index + 1, phase: "destroyed" }));
      }
      return {
        completedCycles: dataUrlLengths.length,
        centerPixels,
        minimumDataUrlLength: Math.min(...dataUrlLengths),
        maximumDataUrlLength: Math.max(...dataUrlLengths),
      };
    });
    expect(result.completedCycles).toBe(2);
    expect(result.centerPixels).toEqual([[255, 0, 0, 255], [255, 0, 0, 255]]);
    expect(result.minimumDataUrlLength).toBeGreaterThan(300);
    expect(result.maximumDataUrlLength).toBe(result.minimumDataUrlLength);
    expect(browserErrors).toEqual([]);
  }, 120_000);
});
