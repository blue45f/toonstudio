import { readFileSync } from "node:fs";
import { Script } from "node:vm";

import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

import { STUDIO_SOAK_LINUX_WEBGPU_LAUNCH_ARGS } from "./studio-soak-browser-launch";

const source = readFileSync(new URL("../diagnose-studio-soak-webgpu.mts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("diagnose-studio-soak-webgpu.mts", source, ts.ScriptTarget.Latest, true);
const requiredDefinitions = new Set([
  "OPERATION_TIMEOUT_MS", "METADATA_LAUNCH_ARGS", "failure", "record", "browserTimedOut",
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
  const startup = tryBlock.statements.slice(0, contextIndex).map((statement) => statement.getText(parsed)).join("\n");
  const program = `${definitions}\n(async () => {
    let browser; const intentionalClose = false;
    ${entryStatement.getText(parsed)}
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

class FakeProtocolTimeout extends Error {}
const browserProtocolVersion = { product: "HeadlessChrome/158.0.8127.18", protocolVersion: "1.3" };

function fixture(options: {
  configuration?: "existing" | "vulkan-angle"; surface?: "offscreen" | "canvas"; telemetryWrapper?: boolean;
  failMethod?: "Browser.getBrowserCommandLine" | "Browser.getVersion"; error?: Error;
} = {}) {
  const configuration = options.configuration === "vulkan-angle"
    ? { id: "vulkan-angle", args: STUDIO_SOAK_LINUX_WEBGPU_LAUNCH_ARGS }
    : { id: "existing", args: ["--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-gl=swiftshader", "--enable-unsafe-webgpu"] };
  let actualLaunchArgs: string[] = [];
  const send = vi.fn(async (method: string) => {
    if (method === options.failMethod) throw options.error ?? new Error("CDP metadata 조회 실패 원문");
    if (method === "Browser.getBrowserCommandLine") {
      if (!actualLaunchArgs.includes("--enable-automation")) throw new Error("Command line not returned because --enable-automation not set.");
      return { arguments: actualLaunchArgs };
    }
    if (method === "Browser.getVersion") return browserProtocolVersion;
    throw new Error("예상하지 않은 CDP 명령: " + method);
  });
  const launch = vi.fn(async (options: { args: string[] }) => {
    actualLaunchArgs = ["/test/chrome-headless-shell", "--headless", ...options.args];
    return { version: () => "158.0.8127.18", on: vi.fn(), newBrowserCDPSession: async () => ({ send }) };
  });
  const checkpoint = vi.fn();
  const run = () => buildActualMetadataStartup().runInNewContext({
    configuration, surface: options.surface ?? "offscreen", telemetryWrapper: options.telemetryWrapper ?? false,
    chromium: { launch }, environment: () => ({}), checkpoint,
    errors: { TimeoutError: FakeProtocolTimeout }, Error, setTimeout, clearTimeout,
  }) as Promise<MetadataEntry>;
  return { run, configuration, launch, send, checkpoint };
}

describe("독립 GPU 진단의 실제 launch·CDP metadata 경로", () => {
  const cases = (["existing", "vulkan-angle"] as const).flatMap((configuration) =>
    (["offscreen", "canvas"] as const).flatMap((surface) => [false, true].map((telemetryWrapper) =>
      ({ configuration, surface, telemetryWrapper }))));

  it.each(cases)("$configuration/$surface/wrapper=$telemetryWrapper의 인자와 실제 metadata를 보존한다", async (options) => {
    const f = fixture(options);
    const entry = await f.run();
    const requested = [...f.configuration.args, "--enable-automation"];
    expect(f.launch).toHaveBeenCalledExactlyOnceWith({ headless: true, args: requested, timeout: 15_000 });
    expect(entry.requestedLaunchArgs).toEqual(requested);
    expect(entry.actualLaunchArgs).toEqual(["/test/chrome-headless-shell", "--headless", ...requested]);
    expect(entry.browserVersion).toBe("158.0.8127.18");
    expect(entry.browserProtocolVersion).toEqual(browserProtocolVersion);
    expect(entry.stages).toEqual([expect.objectContaining({ phase: "browser-metadata", outcome: "completed" })]);
    expect(entry.failures).toEqual([]);
    expect(f.send.mock.calls.map(([method]) => method)).toEqual(["Browser.getBrowserCommandLine", "Browser.getVersion"]);
    expect(f.checkpoint).toHaveBeenCalledOnce();
  });

  it.each(["Browser.getBrowserCommandLine", "Browser.getVersion"] as const)("%s 오류를 skip·성공으로 바꾸지 않는다", async (failMethod) => {
    const f = fixture({ failMethod });
    const entry = await f.run();
    expect(entry.failures).toEqual([expect.objectContaining({ phase: "browser-metadata", message: "CDP metadata 조회 실패 원문" })]);
    expect(entry.stages).toEqual([expect.objectContaining({ phase: "browser-metadata", outcome: "failed" })]);
    expect(entry.browserProtocolVersion).toBeNull();
    if (failMethod === "Browser.getBrowserCommandLine") expect(entry.actualLaunchArgs).toBeNull();
    else expect(entry.actualLaunchArgs).toContain("--enable-automation");
    expect(f.checkpoint).toHaveBeenCalledOnce();
  });

  it("CDP timeout은 case 중단을 위해 다시 전달하고 실패 checkpoint도 남긴다", async () => {
    const error = new FakeProtocolTimeout("CDP 응답 기한 초과");
    const f = fixture({ failMethod: "Browser.getBrowserCommandLine", error });
    await expect(f.run()).rejects.toBe(error);
    expect(f.send).toHaveBeenCalledExactlyOnceWith("Browser.getBrowserCommandLine");
    expect(f.checkpoint).toHaveBeenCalledOnce();
  });
});
