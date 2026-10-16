/**
 * 편집기 삽입(미리보기에 해당하는 LT 삽입)과 멀티패스 내보내기(main-line / texture-line 패스)가 같은 선 설정
 * 객체와 같은 렌더러를 쓰는지, 새 필드가 두 경로에서 그대로 살아남는지 확인한다.
 *
 * - 편집기: 삽입 호스트가 `Object.freeze({ ...document.output.line })` 로 만든 스냅샷을 Worker 클라이언트에 넘긴다.
 * - 배치: `applyStudioBg3dShot` 이 만든 `output` 의 line/tone 을 컷 산출물 파이프라인에 넘긴다.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  renderStudioBg3dLtLayers,
  type StudioBg3dLtRasterInput,
  type StudioBg3dLtRasterLayer,
  type StudioBg3dLtRenderResult,
  type StudioBg3dLtRenderSettings,
} from "./studio-bg3d-lt-render";
import {
  renderStudioBg3dLtLayersInWorker,
  type StudioBg3dLtRenderWorkerLike,
} from "./studio-bg3d-lt-render-worker-client";
import {
  isStudioBg3dLtRenderWorkerRequest,
  type StudioBg3dLtRenderWorkerRequest,
  type StudioBg3dLtRenderWorkerResponse,
} from "./studio-bg3d-lt-render-worker-protocol";
import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  applyStudioBg3dShot,
  normalizeStudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import {
  buildStudioBg3dShotArtifacts,
  type StudioBg3dShotArtifactPipelineDependencies,
} from "./studio-bg3d-shot-artifact-pipeline";

import type { StudioBg3dShotBatchPlannedShot } from "./studio-bg3d-shot-batch-plan";

/** 요청을 받은 즉시 직접 렌더러로 처리해 응답하는 실제 Worker 대용품(프로토콜 검증 포함). */
class InlineRenderWorker implements StudioBg3dLtRenderWorkerLike {
  readonly requests: StudioBg3dLtRenderWorkerRequest[] = [];
  private listener: ((event: { readonly data: unknown }) => void) | null = null;

  postMessage(message: StudioBg3dLtRenderWorkerRequest): void {
    this.requests.push(message);
    queueMicrotask(() => {
      if (!isStudioBg3dLtRenderWorkerRequest(message)) return;
      const result = renderStudioBg3dLtLayers(
        {
          width: message.input.width,
          height: message.input.height,
          rgba: new Uint8Array(message.input.rgbaBuffer),
          ...(message.input.depthBuffer ? { depth: new Float32Array(message.input.depthBuffer) } : {}),
        },
        message.settings,
      );
      const response: StudioBg3dLtRenderWorkerResponse = {
        version: message.version,
        kind: "result",
        requestId: message.requestId,
        width: result.width,
        height: result.height,
        layers: result.layers.map((layer) => ({
          role: layer.role,
          width: layer.width,
          height: layer.height,
          dataBuffer: layer.data.buffer as ArrayBuffer,
        })),
      };
      this.listener?.({ data: response });
    });
  }

  addEventListener(
    type: "message" | "error" | "messageerror",
    listener: ((event: { readonly data: unknown }) => void) | ((event: { preventDefault?(): void }) => void),
  ): void {
    if (type === "message") this.listener = listener as (event: { readonly data: unknown }) => void;
  }

  removeEventListener(): void {
    this.listener = null;
  }

  terminate(): void {}
}

const WIDTH = 24;
const HEIGHT = 16;

/** 투명 배경 위 두 면과 깊이 단차가 있는 작은 장면. 윤곽·안쪽 선·재질 반점이 모두 나온다. */
function sceneRaster(): StudioBg3dLtRasterInput {
  const rgba = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  const depth = new Float32Array(WIDTH * HEIGHT).fill(1);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const inside = x >= 3 && x <= 20 && y >= 2 && y <= 13;
      const shade = x < 11 ? 50 : x < 16 ? 150 : 215;
      const speckle = inside && (x * 3 + y * 5) % 7 === 0 ? 20 : 0;
      const value = shade + speckle;
      rgba.set(inside ? [value, value, value, 255] : [50, 50, 50, 0], (y * WIDTH + x) * 4);
      if (inside) depth[y * WIDTH + x] = x < 16 ? 0.3 : 0.7;
    }
  }
  return { width: WIDTH, height: HEIGHT, rgba, depth };
}

function documentWith(line: Record<string, unknown>, shots?: readonly unknown[]) {
  const base = JSON.parse(JSON.stringify(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT)) as {
    output: { line: Record<string, unknown> };
  };
  return normalizeStudioBg3dSceneDocument({
    ...base,
    output: { ...base.output, line: { ...base.output.line, ...line } },
    ...(shots ? { shots } : {}),
  });
}

function plannedShot(): StudioBg3dShotBatchPlannedShot {
  return {
    shotId: "shot-a",
    shotName: "컷 A",
    shotIndex: 0,
    capture: {
      width: WIDTH,
      height: HEIGHT,
      requestedHeight: HEIGHT,
      wasReduced: false,
      includeDepth: true,
      shadows: false,
      shadowMapSize: 0,
      background: { color: "#ffffff", alpha: 0 },
    },
    files: [],
  };
}

/** 배치 파이프라인을 돌리고 패스별로 PNG 인코더에 넘어간 레이어와 렌더러가 받은 설정을 모은다. */
async function runBatch(
  settings: StudioBg3dLtRenderSettings,
  passes: readonly ("main-line" | "texture-line" | "lt-composite")[],
) {
  const rendered: StudioBg3dLtRenderResult[] = [];
  const receivedSettings: StudioBg3dLtRenderSettings[] = [];
  const encoded: { readonly layers: readonly StudioBg3dLtRasterLayer[] }[] = [];
  const dependencies: StudioBg3dShotArtifactPipelineDependencies = {
    renderLtInWorker: vi.fn(async (input, receivedSettingsArgument) => {
      receivedSettings.push(receivedSettingsArgument);
      const result = renderStudioBg3dLtLayers(input, receivedSettingsArgument);
      rendered.push(result);
      return result;
    }),
    createDepthLayer: vi.fn(),
    createNormalLayer: vi.fn(),
    encodePngInWorker: vi.fn(async (layers) => {
      encoded.push({ layers });
      return new Blob([new Uint8Array(1)], { type: "image/png" });
    }),
    admitPsdLayers: vi.fn(() => ({ ok: true, width: WIDTH, height: HEIGHT }) as const),
    buildLayeredPsdInWorker: vi.fn(),
    workersAvailable: () => true,
    maxImageBytes: 1_000,
    maxTotalBytes: 10_000,
  };
  const raster = sceneRaster();
  const result = await buildStudioBg3dShotArtifacts(
    {
      shot: plannedShot(),
      captured: {
        width: WIDTH,
        height: HEIGHT,
        rgba: raster.rgba as Uint8ClampedArray,
        ...(raster.depth ? { depth: raster.depth } : {}),
      },
      settings,
      passes,
      includeLayeredPsd: false,
      committedArtifactBytes: 0,
    },
    dependencies,
  );
  return { result, rendered, receivedSettings, encoded };
}

const SUPPRESSION_LINE = {
  widthPx: 2.5,
  strength: 1,
  accuracy: 1,
  smoothing: 0,
  textureLineEnabled: true,
  textureLineStrength: 1,
  creaseAngleDegrees: 0,
  hiddenLineRemoval: true,
  interiorSuppressionEnabled: true,
  interiorSuppressionStrength: 0.8,
} as const;

describe("편집기 삽입과 멀티패스 내보내기의 선 설정 공유", () => {
  it("passes the same canonical line and tone objects, including the new fields, to both paths", async () => {
    const document = documentWith(SUPPRESSION_LINE, [{ id: "shot-a", name: "컷 A" }]);
    // 삽입 호스트와 같은 방식의 스냅샷
    const editorSettings: StudioBg3dLtRenderSettings = Object.freeze({
      line: Object.freeze({ ...document.output.line }),
      tone: Object.freeze({ ...document.output.tone }),
    });
    // 배치 실행과 같은 방식: 컷을 적용한 문서의 output
    const applied = applyStudioBg3dShot(document, "shot-a")!;
    const batchSettings: StudioBg3dLtRenderSettings = { line: applied.output.line, tone: applied.output.tone };

    expect(batchSettings.line).toEqual(editorSettings.line);
    expect(batchSettings.tone).toEqual(editorSettings.tone);
    expect(batchSettings.line).toMatchObject({
      interiorSuppressionEnabled: true,
      interiorSuppressionStrength: 0.8,
      widthPx: 2.5,
    });

    const worker = new InlineRenderWorker();
    const editor = await renderStudioBg3dLtLayersInWorker(sceneRaster(), editorSettings, {
      workerFactory: () => worker,
    });
    expect(worker.requests[0]!.settings.line).toEqual(editorSettings.line);

    const batch = await runBatch(batchSettings, ["main-line", "texture-line", "lt-composite"]);
    // 파이프라인은 받은 설정을 바꾸지 않고 렌더러에 그대로 넘긴다.
    expect(batch.receivedSettings[0]!.line).toEqual(editorSettings.line);

    const editorMain = editor.layers.find((layer) => layer.role === "main-line")!;
    const editorTexture = editor.layers.find((layer) => layer.role === "texture-line")!;
    expect(editorMain).toBeDefined();
    expect(editorTexture).toBeDefined();
    // main-line / texture-line 패스는 편집기 삽입과 바이트까지 같은 레이어를 쓴다.
    const [mainPass, texturePass, compositePass] = batch.encoded;
    expect(mainPass!.layers).toHaveLength(1);
    expect(Array.from(mainPass!.layers[0]!.data)).toEqual(Array.from(editorMain.data));
    expect(texturePass!.layers).toHaveLength(1);
    expect(Array.from(texturePass!.layers[0]!.data)).toEqual(Array.from(editorTexture.data));
    expect(compositePass!.layers.map((layer) => layer.role)).toEqual(
      editor.layers.map((layer) => layer.role),
    );
  });

  it("makes the new fields change the exported main-line and texture-line passes", async () => {
    const withSuppression = documentWith(SUPPRESSION_LINE);
    const without = documentWith({ ...SUPPRESSION_LINE, interiorSuppressionEnabled: false });
    const run = (document: ReturnType<typeof documentWith>) =>
      runBatch({ line: document.output.line, tone: document.output.tone }, ["main-line", "texture-line"]);
    const on = await run(withSuppression);
    const off = await run(without);
    const alphaSum = (layers: readonly StudioBg3dLtRasterLayer[]) =>
      layers[0]!.data.reduce((sum, value, index) => sum + (index % 4 === 3 ? value : 0), 0);
    expect(alphaSum(on.encoded[0]!.layers)).toBeLessThan(alphaSum(off.encoded[0]!.layers));
    expect(alphaSum(on.encoded[1]!.layers)).toBeLessThan(alphaSum(off.encoded[1]!.layers));
  });

  it("lets a shot override the suppression for the batch only", async () => {
    const document = documentWith(SUPPRESSION_LINE, [
      { id: "shot-a", name: "억제 끔", output: { line: { interiorSuppressionEnabled: false } } },
    ]);
    const editorLine = document.output.line;
    const batchLine = applyStudioBg3dShot(document, "shot-a")!.output.line;
    expect(editorLine.interiorSuppressionEnabled).toBe(true);
    expect(batchLine.interiorSuppressionEnabled).toBe(false);
    expect(batchLine.interiorSuppressionStrength).toBe(0.8);
  });

  it("renders an old document (no new keys) identically in the editor path and the batch path", async () => {
    const document = documentWith({ widthPx: 2, textureLineEnabled: true, textureLineStrength: 1 });
    expect(document.output.line).not.toHaveProperty("interiorSuppressionEnabled");
    const editor = await renderStudioBg3dLtLayersInWorker(
      sceneRaster(),
      { line: { ...document.output.line }, tone: { ...document.output.tone } },
      { workerFactory: () => new InlineRenderWorker() },
    );
    const batch = await runBatch({ line: document.output.line, tone: document.output.tone }, ["main-line"]);
    expect(Array.from(batch.encoded[0]!.layers[0]!.data)).toEqual(
      Array.from(editor.layers.find((layer) => layer.role === "main-line")!.data),
    );
  });

  it("asks for the depth capture through the same predicate in the editor insert, the batch plan, and the export run", () => {
    const read = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
    expect(read("studio-bg3d-editor-insert-host.ts")).toContain(
      "includeDepth: studioBg3dLineNeedsDepth(ltSettingsSnapshot.line),",
    );
    expect(read("studio-bg3d-shot-batch-export-run.ts")).toContain(
      "includeDepth: studioBg3dShotBatchNeedsDepth(applied.output.line, selectedShotBatchPasses),",
    );
    expect(read("studio-bg3d-shot-batch-plan.ts")).toContain(
      "const includeDepth = studioBg3dShotBatchNeedsDepth(applied.output.line, passes);",
    );
    // 옛 규칙(깊이선 검출만 보는 식)이 어느 경로에도 남아 있지 않다.
    for (const name of [
      "studio-bg3d-editor-insert-host.ts",
      "studio-bg3d-shot-batch-export-run.ts",
      "studio-bg3d-shot-batch-plan.ts",
    ]) {
      expect(read(name)).not.toMatch(/includeDepth(:|\s*=)\s*[\w.]*line\.depthEnabled/u);
    }
  });
});
