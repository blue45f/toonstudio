import { create as createSkpBuilder, type SkpBuilder } from "openskp";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES } from "./studio-bg3d-glb-validation";
import {
  StudioBg3dModelImportError,
  convertStudioBg3dModelFilesToGlb,
  type StudioBg3dImportFile,
} from "./studio-bg3d-model-import";
import {
  STUDIO_BG3D_SKP_MAX_SOURCE_BYTES,
  STUDIO_BG3D_SKP_MOBILE_MAX_SOURCE_BYTES,
  STUDIO_BG3D_SKP_STAGES,
} from "./studio-bg3d-skp-contract";
import { STUDIO_BG3D_SKP_UNIT_SCALE_NODE_NAME } from "./studio-bg3d-skp-glb-scale";
import {
  importStudioBg3dSkpToGlb,
  type StudioBg3dSkpImportOptions,
  type StudioBg3dSkpImportRequest,
  type StudioBg3dSkpReportEvent,
  type StudioBg3dSkpStageEvent,
  type StudioBg3dSkpUnitDecision,
  type StudioBg3dSkpUnitDecisionRequest,
} from "./studio-bg3d-skp-import";
import { readGlbJson, replaceUtf16Text } from "./studio-bg3d-skp.test-fixture";

// 실제 openskp 와 그 작성기(SkpBuilder)로 만든 .skp 바이트만 쓴다. 바이너리 픽스처는 커밋하지 않는다.
// Worker 경로(실제 Worker 생성·타임아웃·취소)는 studio-bg3d-skp-worker-client.test.ts 가 가짜 Worker 로 다룬다.

type Point = [number, number, number];

const MIB = 1024 * 1024;
const GLB_MAGIC = [0x67, 0x6c, 0x54, 0x46];

function buildBytes(fill: (builder: SkpBuilder) => void): Uint8Array {
  const builder = createSkpBuilder();
  fill(builder);
  return builder.toBytes();
}

function square(size: number, z = 0): Point[] {
  return [[0, 0, z], [size, 0, z], [size, size, z], [0, size, z]];
}

/** 100인치(= 2.54m) 정사각형: 크기가 정상 범위다. */
function normalSkp(): Uint8Array {
  return buildBytes((builder) => { builder.addFace(square(100)); });
}

/** 0.2인치(약 5mm) 정사각형: 단위를 m 로 읽어야 0.2m 가 되는, 크기가 비정상(너무 작음)인 모델이다. */
function tinySkp(): Uint8Array {
  return buildBytes((builder) => { builder.addFace(square(0.2)); });
}

function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function namedNode(json: Record<string, unknown>, name: string): Record<string, unknown> | undefined {
  const nodes = json.nodes;
  if (!isUnknownArray(nodes)) return undefined;
  for (const node of nodes) {
    if (isRecord(node) && node.name === name) return node;
  }
  return undefined;
}

/** 균일 배율 노드의 배율. GLB 를 직접 쓰면 scale, three.js 내보내기를 거치면 matrix 로 나온다. */
function uniformScaleOf(node: Record<string, unknown> | undefined): number | undefined {
  if (!node) return undefined;
  const scale = node.scale;
  if (isUnknownArray(scale) && typeof scale[0] === "number") return scale[0];
  const matrix = node.matrix;
  if (isUnknownArray(matrix) && typeof matrix[0] === "number") return matrix[0];
  return undefined;
}

function request(
  bytes: Uint8Array,
  options: StudioBg3dSkpImportOptions | undefined = undefined,
  overrides: Partial<StudioBg3dSkpImportRequest> = {},
): StudioBg3dSkpImportRequest {
  return {
    name: "room.skp",
    path: "set/room.skp",
    size: bytes.byteLength,
    readBytes: () => Promise.resolve(exactBuffer(bytes)),
    signal: undefined,
    executionBackend: "direct",
    context: { options, profile: undefined },
    ...overrides,
  };
}

async function failureOf(promise: Promise<unknown>): Promise<StudioBg3dModelImportError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof StudioBg3dModelImportError) return error;
    throw error;
  }
  throw new Error("실패해야 하는 호출이 성공했습니다.");
}

function chooseUnit(
  unit: "m" | "cm" | "mm" | "inch",
  seen: StudioBg3dSkpUnitDecisionRequest[] = [],
): NonNullable<StudioBg3dSkpImportOptions["resolveUnit"]> {
  return (decisionRequest) => {
    seen.push(decisionRequest);
    const decision: StudioBg3dSkpUnitDecision = { kind: "unit", unit };
    return Promise.resolve(decision);
  };
}

describe("importStudioBg3dSkpToGlb", () => {
  it("returns a self-contained GLB, reports the stages in order and never asks about a normal size", async () => {
    const reports: StudioBg3dSkpReportEvent[] = [];
    const stages: StudioBg3dSkpStageEvent[] = [];
    const resolveUnit = vi.fn(chooseUnit("m"));
    const glb = await importStudioBg3dSkpToGlb(request(normalSkp(), {
      resolveUnit,
      onReport: (event) => reports.push(event),
      onStage: (event) => stages.push(event),
    }));

    expect([...new Uint8Array(glb, 0, 4)]).toEqual(GLB_MAGIC);
    expect(resolveUnit).not.toHaveBeenCalled();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ sourcePath: "set/room.skp", sourceName: "room.skp" });
    expect(reports[0].report.units).toEqual({ appliedUnit: "inch", scaleFactor: 1, userSelected: false });
    expect(reports[0].report.size?.level).toBe("ok");
    expect(stages.map((event) => event.progress.stage)).toEqual([...STUDIO_BG3D_SKP_STAGES]);
    expect(stages.every((event) => event.sourceName === "room.skp" && event.sourcePath === "set/room.skp")).toBe(true);
    expect(namedNode(readGlbJson(new Uint8Array(glb)), STUDIO_BG3D_SKP_UNIT_SCALE_NODE_NAME)).toBeUndefined();
  });

  it("refuses an oversized source with skp-too-large before reading a single byte", async () => {
    const readBytes = vi.fn(() => Promise.resolve(new ArrayBuffer(0)));
    const error = await failureOf(importStudioBg3dSkpToGlb(request(normalSkp(), undefined, {
      size: STUDIO_BG3D_SKP_MAX_SOURCE_BYTES + 1,
      readBytes,
    })));
    expect(error.code).toBe("skp-too-large");
    expect(readBytes).not.toHaveBeenCalled();
  });

  it("applies the tighter mobile limit before reading", async () => {
    const readBytes = vi.fn(() => Promise.resolve(new ArrayBuffer(0)));
    const error = await failureOf(importStudioBg3dSkpToGlb(request(normalSkp(), undefined, {
      size: STUDIO_BG3D_SKP_MOBILE_MAX_SOURCE_BYTES + 1,
      readBytes,
      context: { options: undefined, profile: "mobile" },
    })));
    expect(error.code).toBe("skp-too-large");
    expect(readBytes).not.toHaveBeenCalled();

    const desktop = await importStudioBg3dSkpToGlb(request(normalSkp(), undefined, {
      context: { options: undefined, profile: "desktop" },
    }));
    expect(desktop.byteLength).toBeGreaterThan(0);
  });

  it("asks which unit the author used when the model is a few millimetres wide, then applies the answer", async () => {
    const reports: StudioBg3dSkpReportEvent[] = [];
    const seen: StudioBg3dSkpUnitDecisionRequest[] = [];
    const glb = await importStudioBg3dSkpToGlb(request(tinySkp(), {
      resolveUnit: chooseUnit("m", seen),
      onReport: (event) => reports.push(event),
    }));

    expect(seen).toHaveLength(1);
    expect(seen[0].sourceName).toBe("room.skp");
    expect(seen[0].assessment).toMatchObject({ level: "too-small", recommendedUnit: "m" });
    expect(seen[0].report.units.userSelected).toBe(false);

    const scale = uniformScaleOf(namedNode(readGlbJson(new Uint8Array(glb)), STUDIO_BG3D_SKP_UNIT_SCALE_NODE_NAME));
    expect(scale).toBeCloseTo(1 / 0.0254, 6);

    expect(reports).toHaveLength(1);
    const { report } = reports[0];
    expect(report.units.appliedUnit).toBe("m");
    expect(report.units.userSelected).toBe(true);
    expect(report.units.scaleFactor).toBeCloseTo(1 / 0.0254, 6);
    expect(report.size?.meters[0]).toBeCloseTo(0.2, 5);
    expect(report.size?.openSkpMeters[0]).toBeCloseTo(0.00508, 6);
    expect(report.warnings.map((warning) => warning.code)).toContain("unit-override-applied");
  });

  it("keeps OpenSKP's inch reading and warns when nobody can answer the unit question", async () => {
    const reports: StudioBg3dSkpReportEvent[] = [];
    const glb = await importStudioBg3dSkpToGlb(request(tinySkp(), { onReport: (event) => reports.push(event) }));
    expect(namedNode(readGlbJson(new Uint8Array(glb)), STUDIO_BG3D_SKP_UNIT_SCALE_NODE_NAME)).toBeUndefined();
    expect(reports[0].report.units).toEqual({ appliedUnit: "inch", scaleFactor: 1, userSelected: false });
    expect(reports[0].report.warnings.map((warning) => warning.code)).toContain("size-abnormal");
  });

  it("records an explicit inch answer without touching the GLB", async () => {
    const reports: StudioBg3dSkpReportEvent[] = [];
    const glb = await importStudioBg3dSkpToGlb(request(tinySkp(), {
      resolveUnit: chooseUnit("inch"),
      onReport: (event) => reports.push(event),
    }));
    expect(namedNode(readGlbJson(new Uint8Array(glb)), STUDIO_BG3D_SKP_UNIT_SCALE_NODE_NAME)).toBeUndefined();
    expect(reports[0].report.units).toEqual({ appliedUnit: "inch", scaleFactor: 1, userSelected: true });
  });

  it("keeps the default reading, without recording a user choice, when the question is dismissed with keep", async () => {
    const reports: StudioBg3dSkpReportEvent[] = [];
    const glb = await importStudioBg3dSkpToGlb(request(tinySkp(), {
      resolveUnit: () => Promise.resolve({ kind: "keep" }),
      onReport: (event) => reports.push(event),
    }));
    expect(namedNode(readGlbJson(new Uint8Array(glb)), STUDIO_BG3D_SKP_UNIT_SCALE_NODE_NAME)).toBeUndefined();
    expect(reports[0].report.units).toEqual({ appliedUnit: "inch", scaleFactor: 1, userSelected: false });
    expect(reports[0].report.warnings.map((warning) => warning.code)).toContain("size-abnormal");
  });

  it("stops with skp-cancelled, and reports nothing, when the user declines to pick a unit", async () => {
    const onReport = vi.fn();
    const error = await failureOf(importStudioBg3dSkpToGlb(request(tinySkp(), {
      resolveUnit: () => Promise.resolve({ kind: "cancel" }),
      onReport,
    })));
    expect(error.code).toBe("skp-cancelled");
    expect(onReport).not.toHaveBeenCalled();
  });

  it("does not hang when the import is aborted while the unit question is still open", async () => {
    const controller = new AbortController();
    const opened = vi.fn(() => controller.abort());
    const error = await failureOf(importStudioBg3dSkpToGlb(request(tinySkp(), {
      // 응답자가 취소 신호를 무시하고 영영 답하지 않는 최악의 경우.
      resolveUnit: () => {
        opened();
        return new Promise<StudioBg3dSkpUnitDecision>(() => undefined);
      },
    }, { signal: controller.signal })));
    expect(opened).toHaveBeenCalledOnce();
    expect(error.code).toBe("skp-cancelled");
  });

  it("does not hide a failing unit resolver behind a made-up answer", async () => {
    await expect(importStudioBg3dSkpToGlb(request(tinySkp(), {
      resolveUnit: () => Promise.reject(new Error("패널이 사라졌습니다")),
    }))).rejects.toThrow("패널이 사라졌습니다");
  });

  it("refuses to start when the import was already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const readBytes = vi.fn(() => Promise.resolve(new ArrayBuffer(0)));
    const error = await failureOf(importStudioBg3dSkpToGlb(request(normalSkp(), undefined, {
      signal: controller.signal,
      readBytes,
    })));
    expect(error.code).toBe("aborted");
    expect(readBytes).not.toHaveBeenCalled();
  });

  it("shows why an empty model was refused: the refusal's report reaches the host before the failure", async () => {
    const reports: StudioBg3dSkpReportEvent[] = [];
    const hiddenOnly = buildBytes((builder) => { builder.addFace(square(10), { hidden: true }); });
    const error = await failureOf(importStudioBg3dSkpToGlb(request(hiddenOnly, { onReport: (event) => reports.push(event) })));
    expect(error.code).toBe("skp-empty-scene");
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ sourcePath: "set/room.skp", sourceName: "room.skp" });
    expect(reports[0].report.size).toBeNull();
    expect(reports[0].report.warnings.map((warning) => warning.code)).toContain("empty-scene");
  });

  it("reports nothing for refusals that produce no report, such as a corrupt file", async () => {
    const onReport = vi.fn();
    const error = await failureOf(importStudioBg3dSkpToGlb(request(normalSkp().slice(0, 100), { onReport })));
    expect(error.code).toBe("skp-parse-failed");
    expect(onReport).not.toHaveBeenCalled();
  });

  it("maps converter failures to the import error codes with user guidance", async () => {
    const corrupt = normalSkp().slice(0, 100);
    const hiddenOnly = buildBytes((builder) => { builder.addFace(square(10), { hidden: true }); });
    const tooOld = replaceUtf16Text(normalSkp(), "{17.0.1}", "{12.0.5}");
    const cases: readonly [string, Uint8Array, string][] = [
      ["a truncated file", corrupt, "skp-parse-failed"],
      ["a model with nothing visible", hiddenOnly, "skp-empty-scene"],
      ["a file saved before SketchUp 2013", tooOld, "skp-unsupported-version"],
    ];
    for (const [label, bytes, code] of cases) {
      const error = await failureOf(importStudioBg3dSkpToGlb(request(bytes)));
      expect({ label, code: error.code }).toEqual({ label, code });
      expect(error.message.length).toBeGreaterThan(10);
    }
  });
});

class TestFileReader {
  result: string | ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then(
      (buffer) => {
        this.result = buffer;
        this.onloadend?.();
      },
      () => this.onerror?.(),
    );
  }

  readAsDataURL(blob: Blob): void {
    void blob.arrayBuffer().then(
      (buffer) => {
        this.result = `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(buffer).toString("base64")}`;
        this.onloadend?.();
      },
      () => this.onerror?.(),
    );
  }
}

function sourceFile(name: string, contents: Uint8Array): StudioBg3dImportFile {
  const blob = new Blob([exactBuffer(contents)]);
  Object.defineProperties(blob, {
    name: { configurable: false, enumerable: true, value: name },
    webkitRelativePath: { configurable: false, enumerable: true, value: "" },
  });
  return blob as StudioBg3dImportFile;
}

/** 크기만 선언하고 내용을 읽으면 즉시 실패하는 가짜 파일: 읽기 전에 거절하는지 검증한다. */
function unreadableFile(name: string, size: number): { file: StudioBg3dImportFile; arrayBuffer: ReturnType<typeof vi.fn> } {
  const arrayBuffer = vi.fn(() => Promise.reject(new Error("읽으면 안 되는 파일입니다.")));
  const blob = new Blob([]);
  Object.defineProperties(blob, {
    name: { configurable: false, enumerable: true, value: name },
    webkitRelativePath: { configurable: false, enumerable: true, value: "" },
    size: { configurable: false, enumerable: true, value: size },
    arrayBuffer: { configurable: false, enumerable: true, value: arrayBuffer },
  });
  return { file: blob as StudioBg3dImportFile, arrayBuffer };
}

describe("SketchUp import through the model import pipeline", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects an .skp above the conversion limit with skp-too-large while planning", async () => {
    const { file, arrayBuffer } = unreadableFile("huge.skp", STUDIO_BG3D_SKP_MAX_SOURCE_BYTES + 1);
    await expect(convertStudioBg3dModelFilesToGlb([file], { executionBackend: "direct" })).rejects.toMatchObject({
      code: "skp-too-large",
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("applies the mobile profile's tighter .skp limit without reading the file", async () => {
    const { file, arrayBuffer } = unreadableFile("big.skp", 20 * MIB);
    await expect(convertStudioBg3dModelFilesToGlb([file], {
      executionBackend: "direct",
      profile: "mobile",
      budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
    })).rejects.toMatchObject({ code: "skp-too-large" });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("keeps the generic file-too-large code for the other formats", async () => {
    const { file } = unreadableFile("huge.obj", STUDIO_BG3D_SKP_MAX_SOURCE_BYTES + 1);
    await expect(convertStudioBg3dModelFilesToGlb([file], { executionBackend: "direct" })).rejects.toMatchObject({
      code: "file-too-large",
    });
  });

  it("applies the chosen unit to the exported GLB and hands the report and stages to the host", async () => {
    vi.stubGlobal("FileReader", TestFileReader);
    const reports: StudioBg3dSkpReportEvent[] = [];
    const stages: StudioBg3dSkpStageEvent[] = [];
    const converted = await convertStudioBg3dModelFilesToGlb([sourceFile("tiny.skp", tinySkp())], {
      executionBackend: "direct",
      skp: {
        resolveUnit: chooseUnit("m"),
        onReport: (event) => reports.push(event),
        onStage: (event) => stages.push(event),
      },
    });

    expect(converted).toHaveLength(1);
    const exported = new Uint8Array(await converted[0].arrayBuffer());
    expect([...exported.slice(0, 4)]).toEqual([0x67, 0x6c, 0x54, 0x46]);
    const scale = uniformScaleOf(namedNode(readGlbJson(exported), STUDIO_BG3D_SKP_UNIT_SCALE_NODE_NAME));
    expect(scale).toBeCloseTo(1 / 0.0254, 5);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ sourcePath: "tiny.skp", sourceName: "tiny.skp" });
    expect(reports[0].report.units.appliedUnit).toBe("m");
    expect(stages.map((event) => event.progress.stage)).toEqual([...STUDIO_BG3D_SKP_STAGES]);
  });

  it("imports without any host options and still produces a GLB", async () => {
    vi.stubGlobal("FileReader", TestFileReader);
    const converted = await convertStudioBg3dModelFilesToGlb([sourceFile("room.skp", normalSkp())], {
      executionBackend: "direct",
    });
    expect(converted).toHaveLength(1);
    expect(converted[0].size).toBeGreaterThan(0);
  });

  it("surfaces an abort during the unit question as the generic aborted code", async () => {
    vi.stubGlobal("FileReader", TestFileReader);
    const controller = new AbortController();
    const error = await failureOf(convertStudioBg3dModelFilesToGlb([sourceFile("tiny.skp", tinySkp())], {
      executionBackend: "direct",
      signal: controller.signal,
      skp: {
        resolveUnit: () => {
          controller.abort();
          return new Promise<StudioBg3dSkpUnitDecision>(() => undefined);
        },
      },
    }));
    expect(error.code).toBe("aborted");
  });

  it("surfaces the user's cancel decision as skp-cancelled", async () => {
    const error = await failureOf(convertStudioBg3dModelFilesToGlb([sourceFile("tiny.skp", tinySkp())], {
      executionBackend: "direct",
      skp: { resolveUnit: () => Promise.resolve({ kind: "cancel" }) },
    }));
    expect(error.code).toBe("skp-cancelled");
  });
});
