// @vitest-environment node

import { create as createSkpBuilder } from "openskp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseStudioBg3dSkpImportReport } from "./studio-bg3d-skp-import-report";
import {
  STUDIO_BG3D_SKP_WORKER_PROTOCOL_VERSION as VERSION,
  isStudioBg3dSkpWorkerResponse,
  type StudioBg3dSkpWorkerResponse,
} from "./studio-bg3d-skp-worker-protocol";
import { createSkpReportFixture } from "./studio-bg3d-skp.test-fixture";

// 실제 Worker 진입점(studio-bg3d-skp.worker.ts)을 가짜 `self` 위에서 불러와, 메시지 한 건이 들어왔을 때
// 진입점이 프로토콜대로 응답하는지 증명한다. 브라우저의 Worker 생성·종료는 클라이언트 테스트가 맡는다.

type MessageListener = (event: { readonly data: unknown }) => void;

interface PostedMessage {
  readonly message: StudioBg3dSkpWorkerResponse;
  readonly transfer: readonly Transferable[];
}

function installFakeScope() {
  const listeners: MessageListener[] = [];
  const posted: PostedMessage[] = [];
  vi.stubGlobal("self", {
    addEventListener: (type: string, listener: MessageListener): void => {
      if (type === "message") listeners.push(listener);
    },
    postMessage: (message: unknown, transfer?: readonly Transferable[]): void => {
      // 진입점이 프로토콜에 없는 응답을 보내면 여기서 바로 실패한다.
      if (!isStudioBg3dSkpWorkerResponse(message)) throw new Error("프로토콜에 없는 응답입니다.");
      posted.push({ message, transfer: transfer ?? [] });
    },
  });
  return {
    posted,
    listenerCount: () => listeners.length,
    send: (data: unknown): void => {
      for (const listener of [...listeners]) listener({ data });
    },
  };
}

function skpBytes(): Uint8Array {
  const builder = createSkpBuilder();
  builder.addFace([[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0]]);
  return builder.toBytes();
}

function convertRequest(bytes: Uint8Array, requestId = 1) {
  return {
    version: VERSION,
    kind: "convert",
    requestId,
    bytes: bytes.slice().buffer,
    maxBytes: 32 * 1024 * 1024,
  };
}

function finalMessage(posted: readonly PostedMessage[], requestId: number): PostedMessage | undefined {
  return posted.find((entry) =>
    entry.message.requestId === requestId && (entry.message.kind === "result" || entry.message.kind === "error"));
}

async function importEntry(): Promise<void> {
  vi.resetModules();
  await import("./studio-bg3d-skp.worker");
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock("./studio-bg3d-skp-worker-runtime");
  vi.unstubAllGlobals();
});

describe("SKP conversion Worker entry", () => {
  it("listens for exactly one message handler and posts nothing until a request arrives", async () => {
    const scope = installFakeScope();
    await importEntry();
    expect(scope.listenerCount()).toBe(1);
    expect(scope.posted).toEqual([]);
  });

  it("converts a request end to end: stages first, then one result whose GLB buffer is transferred", async () => {
    const scope = installFakeScope();
    await importEntry();
    scope.send(convertRequest(skpBytes()));
    await vi.waitFor(() => { expect(finalMessage(scope.posted, 1)).toBeDefined(); }, { timeout: 15_000 });

    const kinds = scope.posted.map((entry) => entry.message.kind);
    expect(kinds.filter((kind) => kind === "result")).toHaveLength(1);
    expect(kinds.at(-1)).toBe("result");
    expect(scope.posted.every((entry) => entry.message.requestId === 1)).toBe(true);

    const stages = scope.posted.flatMap((entry) => (entry.message.kind === "progress" ? [entry.message.stage] : []));
    expect(stages[0]).toBe("validating");
    expect(stages).toEqual(expect.arrayContaining(["loading-converter", "building-scene", "writing-glb"]));

    const last = scope.posted.at(-1);
    if (last?.message.kind !== "result") throw new Error("마지막 응답이 결과가 아닙니다.");
    expect(last.message.glb.byteLength).toBeGreaterThan(0);
    expect(new DataView(last.message.glb).getUint32(0, true)).toBe(0x46546c67);
    // 복사 없이 넘기려면 전송 목록이 응답의 GLB 버퍼와 정확히 같아야 한다.
    expect(last.transfer).toEqual([last.message.glb]);
    const report = parseStudioBg3dSkpImportReport(last.message.report);
    expect(report?.conversion.execution).toBe("worker");
    expect(report?.counts.triangles).toBe(2);
  });

  it("answers a file that is not SketchUp with a typed error, the diagnostic reason, and no result", async () => {
    const scope = installFakeScope();
    await importEntry();
    scope.send(convertRequest(new Uint8Array(512).fill(7)));
    await vi.waitFor(() => { expect(finalMessage(scope.posted, 1)).toBeDefined(); });

    const answer = finalMessage(scope.posted, 1)?.message;
    expect(answer).toMatchObject({
      kind: "error",
      requestId: 1,
      code: "skp-parse-failed",
      reason: "invalid-signature",
      report: null,
    });
    expect(scope.posted.some((entry) => entry.message.kind === "result")).toBe(false);
  });

  it("sends the report along with a refusal that has one, such as an empty scene", async () => {
    const scope = installFakeScope();
    await importEntry();
    const builder = createSkpBuilder();
    builder.addFace([[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]], { hidden: true });
    scope.send(convertRequest(builder.toBytes()));
    await vi.waitFor(() => { expect(finalMessage(scope.posted, 1)).toBeDefined(); }, { timeout: 15_000 });

    const answer = finalMessage(scope.posted, 1)?.message;
    if (answer?.kind !== "error") throw new Error("빈 장면은 오류여야 합니다.");
    expect(answer.code).toBe("skp-empty-scene");
    expect(parseStudioBg3dSkpImportReport(answer.report)?.warnings.map((warning) => warning.code)).toContain("empty-scene");
  });

  it("ignores anything that is not a valid convert request", async () => {
    const scope = installFakeScope();
    await importEntry();
    for (const junk of [
      null,
      "convert",
      { version: 2, kind: "convert", requestId: 1, bytes: new ArrayBuffer(8), maxBytes: 10 },
      { version: VERSION, kind: "cancel", requestId: 1 },
      { version: VERSION, kind: "convert", requestId: 0, bytes: new ArrayBuffer(8), maxBytes: 10 },
      { version: VERSION, kind: "convert", requestId: 1, bytes: [1, 2, 3], maxBytes: 10 },
      { version: VERSION, kind: "convert", requestId: 1, bytes: new ArrayBuffer(8), maxBytes: 0 },
    ]) {
      scope.send(junk);
    }
    await new Promise<void>((resolve) => { setTimeout(resolve, 20); });
    expect(scope.posted).toEqual([]);
  });

  it("serves one conversion at a time: a second request while busy is ignored, a later one is served", async () => {
    const scope = installFakeScope();
    await importEntry();
    const bytes = skpBytes();
    scope.send(convertRequest(bytes, 1));
    scope.send(convertRequest(bytes, 2));
    await vi.waitFor(() => { expect(finalMessage(scope.posted, 1)).toBeDefined(); }, { timeout: 15_000 });
    await new Promise<void>((resolve) => { setTimeout(resolve, 20); });
    expect(scope.posted.some((entry) => entry.message.requestId === 2)).toBe(false);

    scope.send(convertRequest(bytes, 3));
    await vi.waitFor(() => { expect(finalMessage(scope.posted, 3)).toBeDefined(); }, { timeout: 15_000 });
    expect(finalMessage(scope.posted, 3)?.message.kind).toBe("result");
  });

  describe("with a runtime that misbehaves", () => {
    it("reports an unclassified failure as parse-failed without leaking the raw error text", async () => {
      vi.doMock("./studio-bg3d-skp-worker-runtime", () => ({
        runStudioBg3dSkpConversion: () => Promise.reject(new Error("secret internal detail")),
      }));
      const scope = installFakeScope();
      await importEntry();
      scope.send(convertRequest(skpBytes()));
      await vi.waitFor(() => { expect(finalMessage(scope.posted, 1)).toBeDefined(); });

      const answer = finalMessage(scope.posted, 1)?.message;
      expect(answer).toMatchObject({ kind: "error", code: "skp-parse-failed", reason: "parse-error", detail: null, report: null });
      expect(JSON.stringify(answer)).not.toContain("secret internal detail");
    });

    it("copies a GLB that is only a view of a larger buffer, so the transfer list matches the bytes it sends", async () => {
      const backing = new ArrayBuffer(64);
      new Uint8Array(backing).fill(9);
      const view = new Uint8Array(backing, 16, 24);
      vi.doMock("./studio-bg3d-skp-worker-runtime", () => ({
        runStudioBg3dSkpConversion: () => Promise.resolve({ glb: view, report: createSkpReportFixture() }),
      }));
      const scope = installFakeScope();
      await importEntry();
      scope.send(convertRequest(skpBytes()));
      await vi.waitFor(() => { expect(finalMessage(scope.posted, 1)).toBeDefined(); });

      const answer = finalMessage(scope.posted, 1);
      if (answer?.message.kind !== "result") throw new Error("결과여야 합니다.");
      expect(answer.message.glb.byteLength).toBe(24);
      expect(answer.message.glb).not.toBe(backing);
      expect([...new Uint8Array(answer.message.glb)]).toEqual(new Array<number>(24).fill(9));
      expect(answer.transfer).toEqual([answer.message.glb]);
    });
  });
});
