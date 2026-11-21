import { readFileSync } from "node:fs";
import { Script } from "node:vm";

import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  collectStudioSoakBrowserLaunchEvidence, createStudioSoakBrowserLaunchEvidence,
  isStudioSoakBrowserLaunchTimeout, STUDIO_SOAK_LINUX_WEBGPU_LAUNCH_ARGS,
} from "./studio-soak-browser-launch";

const source = readFileSync(new URL("../diagnose-studio-soak-webgpu.mts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("diagnose-studio-soak-webgpu.mts", source, ts.ScriptTarget.Latest, true);
const requiredDefinitions = new Set([
  "OPERATION_TIMEOUT_MS", "CONFIGURATIONS", "failure", "record", "browserTimedOut",
  "DiagnosticTimeoutError", "BrowserDiagnosticError", "bounded", "stage",
]);
const definitions = parsed.statements.filter((statement) => {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.some((declaration) => requiredDefinitions.has(declaration.name.getText(parsed)));
  }
  return (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement))
    && statement.name !== undefined && requiredDefinitions.has(statement.name.text);
}).map((statement) => statement.getText(parsed)).join("\n");

function buildActualMetadataStartup(): Script {
  const runCase = parsed.statements.find((statement): statement is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === "runCase");
  const tryBlock = runCase?.body?.statements.find(ts.isTryStatement)?.tryBlock;
  if (!tryBlock) throw new Error("실제 runCase 시작 경로를 찾지 못했습니다.");
  const contextIndex = tryBlock.statements.findIndex((statement) =>
    ts.isExpressionStatement(statement) && ts.isBinaryExpression(statement.expression)
    && ts.isIdentifier(statement.expression.left) && statement.expression.left.text === "context");
  if (contextIndex < 1) throw new Error("metadata 뒤의 실제 context 생성 경계를 찾지 못했습니다.");
  let entryStatement: ts.VariableStatement | undefined;
  const findEntry = (node: ts.Node): void => {
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) =>
      ts.isIdentifier(declaration.name) && declaration.name.text === "entry")) entryStatement = node;
    ts.forEachChild(node, findEntry);
  };
  findEntry(parsed);
  if (!entryStatement) throw new Error("실제 진단 entry 생성을 찾지 못했습니다.");
  const startup = tryBlock.statements.slice(0, contextIndex + 1).map((statement) => statement.getText(parsed)).join("\n");
  const program = `${definitions}\n(async () => {
    let browser, context; const intentionalClose = false;
    const configuration = CONFIGURATIONS.find((candidate) => candidate.id === configurationId);
    ${entryStatement.getText(parsed)}
    observation.entry = entry;
    ${startup}
    return entry;
  })()`;
  return new Script(ts.transpileModule(program, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText);
}

interface MetadataEntry {
  requestedLaunchArgs: string[];
  actualLaunchArgs: string[] | null;
  browserVersion: string | null;
  browserProtocolVersion: unknown;
  stages: Array<{ phase: string; outcome: string; error?: { message: string } }>;
  failures: Array<{ phase: string; message: string }>;
}
class FakeProtocolTimeout extends Error {
  constructor(message: string) { super(message); this.name = "TimeoutError"; }
}
const browserProtocolVersion = { product: "HeadlessChrome/158.0.8127.18", protocolVersion: "1.3",
  revision: "@revision", userAgent: "HeadlessChrome/158.0.8127.18", jsVersion: "15.8.0" };

function fixture(options: {
  configuration?: "existing" | "vulkan-angle";
  failMethod?: "Browser.getBrowserCommandLine" | "Browser.getVersion";
  error?: Error; pendingCommandLine?: boolean; detachError?: Error;
} = {}) {
  let actualLaunchArgs: string[] = [];
  const send = vi.fn(async (method: string) => {
    if (method === options.failMethod) throw options.error ?? new Error("CDP metadata 조회 실패 원문");
    if (method === "Browser.getBrowserCommandLine") {
      if (options.pendingCommandLine) return new Promise<never>(() => undefined);
      if (!actualLaunchArgs.includes("--enable-automation")) throw new Error("Command line not returned because --enable-automation not set.");
      return { arguments: actualLaunchArgs };
    }
    if (method === "Browser.getVersion") return browserProtocolVersion;
    throw new Error("예상하지 않은 CDP 명령: " + method);
  });
  const detach = vi.fn(async () => { if (options.detachError) throw options.detachError; });
  const newContext = vi.fn(async () => ({}));
  const launch = vi.fn(async (options: { args: string[] }) => {
    actualLaunchArgs = ["/test/chrome-headless-shell", "--headless", ...options.args];
    return { version: () => "158.0.8127.18", on: vi.fn(), newBrowserCDPSession: async () => ({ send, detach }), newContext };
  });
  const checkpoint = vi.fn();
  const observation: { entry?: MetadataEntry } = {};
  const run = (): Promise<MetadataEntry> => buildActualMetadataStartup().runInNewContext({
    configurationId: options.configuration ?? "existing", surface: "canvas", telemetryWrapper: true,
    chromium: { launch }, environment: () => ({}), checkpoint, observation,
    collectStudioSoakBrowserLaunchEvidence, createStudioSoakBrowserLaunchEvidence,
    isStudioSoakBrowserLaunchTimeout, STUDIO_SOAK_LINUX_WEBGPU_LAUNCH_ARGS,
    errors: { TimeoutError: FakeProtocolTimeout }, Error, setTimeout, clearTimeout,
  });
  return { run, launch, send, detach, newContext, checkpoint, observation };
}

afterEach(() => vi.useRealTimers());

describe("독립 GPU 진단의 실제 launch·CDP metadata 시작 경로", () => {
  it.each(["existing", "vulkan-angle"] as const)("%s의 실제 metadata와 그래픽 검사 진입을 보존한다", async (configuration) => {
    const f = fixture({ configuration });
    const entry = await f.run();
    expect(f.launch).toHaveBeenCalledExactlyOnceWith({ headless: true, args: entry.requestedLaunchArgs, timeout: 15_000 });
    expect(entry.requestedLaunchArgs).toContain("--enable-automation");
    expect(entry.actualLaunchArgs).toEqual(["/test/chrome-headless-shell", "--headless", ...entry.requestedLaunchArgs]);
    expect(entry.browserVersion).toBe("158.0.8127.18");
    expect(entry.browserProtocolVersion).toEqual(browserProtocolVersion);
    expect(entry.stages).toEqual([expect.objectContaining({ phase: "browser-metadata", outcome: "completed" })]);
    expect(entry.failures).toEqual([]);
    expect(f.send.mock.calls.map(([method]) => method)).toEqual(["Browser.getVersion", "Browser.getBrowserCommandLine"]);
    expect(f.detach).toHaveBeenCalledOnce();
    expect(f.checkpoint).toHaveBeenCalledOnce();
    expect(f.newContext).toHaveBeenCalledOnce();
  });

  it.each(["Browser.getBrowserCommandLine", "Browser.getVersion"] as const)("%s의 일반 오류를 실패로 남기고 그래픽 검사는 계속한다", async (failMethod) => {
    const f = fixture({ failMethod });
    const entry = await f.run();
    expect(entry.failures).toEqual([expect.objectContaining({ phase: "browser-metadata", message: "CDP metadata 조회 실패 원문" })]);
    expect(entry.stages).toEqual([expect.objectContaining({ phase: "browser-metadata", outcome: "failed" })]);
    expect(entry.browserProtocolVersion).toEqual(failMethod === "Browser.getVersion" ? null : browserProtocolVersion);
    expect(entry.actualLaunchArgs).toBeNull();
    expect(f.checkpoint).toHaveBeenCalledOnce();
    expect(f.newContext).toHaveBeenCalledOnce();
  });

  it.each([false, true])("수집 timeout은 정리 실패=%s여도 checkpoint 뒤 조건을 중단한다", async (detachFails) => {
    vi.useFakeTimers();
    const f = fixture({ pendingCommandLine: true, detachError: detachFails ? new Error("CDP 정리 실패") : undefined });
    const pending = expect(f.run()).rejects.toThrow("8000ms");
    await vi.advanceTimersByTimeAsync(8_000);
    await pending;
    expect(f.observation.entry?.stages).toEqual([expect.objectContaining({ phase: "browser-metadata", outcome: "failed" })]);
    expect(f.observation.entry?.failures).toHaveLength(1);
    expect(f.detach).toHaveBeenCalledOnce();
    expect(f.checkpoint).toHaveBeenCalledOnce();
    expect(f.newContext).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("Playwright timeout도 정리 오류에 감싸져 중단 사유를 잃지 않는다", async () => {
    const error = new FakeProtocolTimeout("CDP 응답 기한 초과");
    const cleanup = new Error("CDP 정리 실패");
    const f = fixture({ failMethod: "Browser.getBrowserCommandLine", error, detachError: cleanup });
    await expect(f.run()).rejects.toMatchObject({ errors: [error, cleanup] });
    expect(f.observation.entry?.stages).toEqual([expect.objectContaining({ phase: "browser-metadata", outcome: "failed" })]);
    expect(f.checkpoint).toHaveBeenCalledOnce();
    expect(f.newContext).not.toHaveBeenCalled();
  });
});
