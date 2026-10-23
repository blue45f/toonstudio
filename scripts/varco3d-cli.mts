#!/usr/bin/env tsx
/**
 * VARCO 3D (https://3d.varco.ai) External API (v2/v1), Remote MCP, DCC Bridge CLI 도구.
 */

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const VARCO3D_DEFAULT_API_BASE = "https://3d.varco.ai/api/external-api";
export const VARCO3D_DEFAULT_MCP_URL = "https://3d.varco.ai/api/mcp";
export const VARCO3D_MCP_SETUP_DOC_URL = "https://3d.varco.ai/mcp/setup.md";
export const VARCO3D_API_KEY_NAMES = ["VARCO_3D_API_KEY", "VARCO3D_API_KEY"] as const;
export const VARCO3D_DCC_BRIDGES = {
  blender: 5324,
  unreal: 5325,
  unity: 5326,
  "3dsmax": 5327,
  maya: 5328,
} as const;
export type DccBridgeName = keyof typeof VARCO3D_DCC_BRIDGES;
export const VARCO3D_TERMINAL_STATUSES = new Set([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "CANCELED",
  "ERROR",
]);

export interface Varco3dResolvedConfig {
  readonly apiBase: string;
  readonly mcpUrl: string;
  readonly apiKey: string;
  readonly apiKeyConfigured: boolean;
  readonly apiKeySource: string;
  readonly repoRoot: string;
  readonly homeDir: string;
}

export interface LoadConfigOptions {
  readonly explicitApiBase?: string;
  readonly explicitMcpUrl?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly cwd?: string;
  readonly repoRoot?: string;
  readonly homeDir?: string;
}

export interface ParsedCliArgs {
  readonly command: string;
  readonly positionals: readonly string[];
  readonly flags: ReadonlySet<string>;
  readonly options: ReadonlyMap<string, string>;
}

export interface RunCliDependencies {
  readonly fetchImpl?: typeof fetch;
  readonly spawnImpl?: typeof spawnSync;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly cwd?: string;
  readonly repoRoot?: string;
  readonly homeDir?: string;
  readonly sleepMs?: (ms: number) => Promise<void>;
}

export interface RunCliResult {
  readonly exitCode: number;
  readonly output: Record<string, unknown>;
}

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parseEnvFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!existsSync(filePath)) return result;
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const line = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    const rawVal = line.slice(eqIndex + 1).trim();
    result[key] =
      rawVal.length >= 2 &&
      ((rawVal.startsWith('"') && rawVal.endsWith('"')) ||
        (rawVal.startsWith("'") && rawVal.endsWith("'")))
        ? rawVal.slice(1, -1)
        : rawVal;
  }
  return result;
}

export function loadVarco3dConfig(options: LoadConfigOptions = {}): Varco3dResolvedConfig {
  const env = options.env ?? process.env;
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const cwd = options.cwd ?? process.cwd();
  const homeDir = options.homeDir ?? homedir();
  const apiBase = (
    options.explicitApiBase ??
    env.VARCO_3D_API_BASE ??
    VARCO3D_DEFAULT_API_BASE
  ).replace(/\/+$/u, "");
  const mcpUrl = (
    options.explicitMcpUrl ??
    env.VARCO_3D_MCP_URL ??
    VARCO3D_DEFAULT_MCP_URL
  ).replace(/\/+$/u, "");

  for (const keyName of VARCO3D_API_KEY_NAMES) {
    const fromEnv = env[keyName]?.trim();
    if (fromEnv) {
      return {
        apiBase,
        mcpUrl,
        apiKey: fromEnv,
        apiKeyConfigured: true,
        apiKeySource: `env:${keyName}`,
        repoRoot,
        homeDir,
      };
    }
  }

  const candidateFiles = new Set([
    resolve(cwd, ".env.infrastructure.local"),
    resolve(cwd, ".env.local"),
    resolve(repoRoot, ".env.infrastructure.local"),
    resolve(repoRoot, ".env.local"),
    resolve(homeDir, ".config/varco3d/credentials.env"),
    resolve(homeDir, ".toonspectrum/credentials.env"),
  ]);

  for (const filePath of candidateFiles) {
    const parsed = parseEnvFile(filePath);
    for (const keyName of VARCO3D_API_KEY_NAMES) {
      const val = parsed[keyName]?.trim();
      if (val) {
        return {
          apiBase,
          mcpUrl,
          apiKey: val,
          apiKeyConfigured: true,
          apiKeySource: `file:${basename(filePath)}:${keyName}`,
          repoRoot,
          homeDir,
        };
      }
    }
  }

  return {
    apiBase,
    mcpUrl,
    apiKey: "",
    apiKeyConfigured: false,
    apiKeySource: "missing",
    repoRoot,
    homeDir,
  };
}

export function requireApiKey(config: Varco3dResolvedConfig): string {
  if (!config.apiKeyConfigured || !config.apiKey) {
    throw new Error(
      "VARCO_3D_API_KEY가 설정되어 있지 않습니다. .env.infrastructure.local 또는 환경변수에 VARCO_3D_API_KEY를 등록한 뒤 다시 실행하세요.",
    );
  }
  return config.apiKey;
}

export function inferImageMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".png") return "image/png";
  throw new Error(
    `지원하지 않는 이미지 확장자입니다 (${ext || "없음"}). PNG, JPEG, WebP 파일만 사용할 수 있습니다.`,
  );
}

export function encodeMultipartFormData(
  fields: Readonly<Record<string, string>>,
  files: Readonly<Record<string, string>>,
  boundarySeed = randomUUID().replace(/-/gu, ""),
): { readonly body: Buffer; readonly contentType: string; readonly boundary: string } {
  const boundary = `----Varco3DFormBoundary${boundarySeed}`;
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        "utf8",
      ),
    );
  }
  for (const [fieldName, rawPath] of Object.entries(files)) {
    const resolvedPath = resolve(rawPath);
    if (!existsSync(resolvedPath)) {
      throw new Error(`입력 이미지 파일을 찾을 수 없습니다: ${resolvedPath}`);
    }
    const mimeType = inferImageMimeType(resolvedPath);
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${basename(resolvedPath)}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
        "utf8",
      ),
      readFileSync(resolvedPath),
      Buffer.from("\r\n", "utf8"),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
    boundary,
  };
}

export function parseCliArguments(argv: readonly string[]): ParsedCliArgs {
  const [command = "doctor", ...rest] = argv.filter((arg) => arg !== "--");
  const positionals: string[] = [];
  const flags = new Set<string>();
  const options = new Map<string, string>();
  const booleanFlags = new Set([
    "check",
    "confirm",
    "dry-run",
    "use-alpha",
    "in-place",
    "mv",
    "write",
    "help",
  ]);

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token) continue;
    if (token === "-o") {
      const nextVal = rest[i + 1];
      if (!nextVal || nextVal.startsWith("-")) {
        throw new Error("-o 옵션에는 저장할 파일 경로가 필요합니다.");
      }
      options.set("output", nextVal);
      i += 1;
    } else if (token === "-h") {
      flags.add("help");
    } else if (!token.startsWith("--")) {
      positionals.push(token);
    } else if (token.indexOf("=") > 2) {
      const eqIdx = token.indexOf("=");
      options.set(token.slice(2, eqIdx), token.slice(eqIdx + 1));
    } else {
      const key = token.slice(2);
      if (booleanFlags.has(key)) {
        flags.add(key);
      } else {
        const nextVal = rest[i + 1];
        if (!nextVal || nextVal.startsWith("--")) {
          throw new Error(`--${key} 옵션에 값이 누락되었습니다.`);
        }
        options.set(key, nextVal);
        i += 1;
      }
    }
  }
  return { command, positionals, flags, options };
}

export function validatePolygonCount(rawCount: string | undefined): number {
  if (rawCount === undefined) return 500_000;
  const parsed = Number.parseInt(rawCount, 10);
  if (!Number.isFinite(parsed) || parsed < 1_000 || parsed > 1_000_000) {
    throw new Error(
      `polygonCount 값(${rawCount})이 유효하지 않습니다. 1000 이상 1000000 이하의 정수를 지정하세요.`,
    );
  }
  return parsed;
}

export function inspectMcpSetup(config: Varco3dResolvedConfig): Record<string, unknown> {
  const antigravityConfigPath = resolve(config.homeDir, ".gemini/config/mcp_config.json");
  let antigravityRegistered = false;
  if (existsSync(antigravityConfigPath)) {
    try {
      const parsed = JSON.parse(readFileSync(antigravityConfigPath, "utf8")) as {
        mcpServers?: Record<string, { url?: string }>;
      };
      antigravityRegistered = parsed.mcpServers?.["varco-3d"]?.url === config.mcpUrl;
    } catch {
      antigravityRegistered = false;
    }
  }
  const localCliBinaryPath = resolve(config.homeDir, ".local/bin/varco3d");
  return {
    endpoint: config.mcpUrl,
    setupDocUrl: VARCO3D_MCP_SETUP_DOC_URL,
    antigravityConfigPath,
    antigravityRegistered,
    localCliBinaryPath,
    localCliInstalled: existsSync(localCliBinaryPath),
    commands: {
      antigravity: "pnpm run varco3d -- mcp-setup --target antigravity --write",
      claude: `claude mcp add --transport http varco-3d ${config.mcpUrl}`,
      codex: `codex mcp add varco-3d --url ${config.mcpUrl} --oauth-resource ${config.mcpUrl} && codex mcp login varco-3d`,
    },
  };
}

export function writeAntigravityMcpConfig(
  config: Varco3dResolvedConfig,
): Record<string, unknown> {
  const targetPath = resolve(config.homeDir, ".gemini/config/mcp_config.json");
  mkdirSync(dirname(targetPath), { recursive: true });
  let rootObj: Record<string, unknown> = {};
  if (existsSync(targetPath)) {
    const raw = readFileSync(targetPath, "utf8").trim();
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        rootObj = { ...(parsed as Record<string, unknown>) };
      }
    }
  }
  const existingServers =
    rootObj.mcpServers &&
    typeof rootObj.mcpServers === "object" &&
    !Array.isArray(rootObj.mcpServers)
      ? { ...(rootObj.mcpServers as Record<string, unknown>) }
      : {};
  existingServers["varco-3d"] = { url: config.mcpUrl };
  rootObj.mcpServers = existingServers;
  writeFileSync(targetPath, `${JSON.stringify(rootObj, null, 2)}\n`, "utf8");
  return { updated: true, path: targetPath, url: config.mcpUrl };
}

export async function probeDccBridges(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 500,
): Promise<Record<DccBridgeName, { port: number; connected: boolean; statusCode?: number }>> {
  const entries = await Promise.all(
    (Object.entries(VARCO3D_DCC_BRIDGES) as [DccBridgeName, number][]).map(
      async ([name, port]) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const resp = await fetchImpl(`http://127.0.0.1:${port}/status`, {
            method: "GET",
            signal: controller.signal,
          });
          return [name, { port, connected: resp.status === 200, statusCode: resp.status }] as const;
        } catch {
          return [name, { port, connected: false }] as const;
        } finally {
          clearTimeout(timer);
        }
      },
    ),
  );
  return Object.fromEntries(entries) as Record<
    DccBridgeName,
    { port: number; connected: boolean; statusCode?: number }
  >;
}

export async function requestVarco3dJson(
  url: string,
  init: {
    readonly method: "GET" | "POST";
    readonly apiKey: string;
    readonly headers?: Readonly<Record<string, string>>;
    readonly body?: BodyInit;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<{ readonly statusCode: number; readonly payload: Record<string, unknown> }> {
  const response = await fetchImpl(url, {
    method: init.method,
    headers: {
      Accept: "application/json",
      "x-api-key": init.apiKey,
      ...(init.headers ?? {}),
    },
    body: init.body,
  });
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  if (text.trim()) {
    try {
      const jsonVal = JSON.parse(text) as unknown;
      payload =
        jsonVal && typeof jsonVal === "object" && !Array.isArray(jsonVal)
          ? (jsonVal as Record<string, unknown>)
          : { data: jsonVal };
    } catch {
      payload = { error: text.trim() };
    }
  }
  return { statusCode: response.status, payload };
}

async function submitJsonTask(
  url: string,
  body: Record<string, unknown>,
  note: string,
  parsed: ParsedCliArgs,
  config: Varco3dResolvedConfig,
  fetchImpl: typeof fetch,
): Promise<RunCliResult> {
  if (!parsed.flags.has("confirm") || parsed.flags.has("dry-run")) {
    return {
      exitCode: 0,
      output: {
        dryRun: true,
        method: "POST",
        url,
        body,
        apiKeyConfigured: config.apiKeyConfigured,
        note,
      },
    };
  }
  const { statusCode, payload } = await requestVarco3dJson(
    url,
    {
      method: "POST",
      apiKey: requireApiKey(config),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    fetchImpl,
  );
  return { exitCode: statusCode >= 200 && statusCode < 300 ? 0 : 1, output: { statusCode, ...payload } };
}

async function submitMultipartTask(
  url: string,
  fields: Record<string, string>,
  files: Record<string, string>,
  dryRunMeta: Record<string, unknown>,
  parsed: ParsedCliArgs,
  config: Varco3dResolvedConfig,
  fetchImpl: typeof fetch,
): Promise<RunCliResult> {
  if (!parsed.flags.has("confirm") || parsed.flags.has("dry-run")) {
    return {
      exitCode: 0,
      output: {
        dryRun: true,
        method: "POST",
        url,
        fields,
        ...dryRunMeta,
        apiKeyConfigured: config.apiKeyConfigured,
      },
    };
  }
  const multipart = encodeMultipartFormData(fields, files);
  const { statusCode, payload } = await requestVarco3dJson(
    url,
    {
      method: "POST",
      apiKey: requireApiKey(config),
      headers: { "Content-Type": multipart.contentType },
      body: new Uint8Array(multipart.body),
    },
    fetchImpl,
  );
  return { exitCode: statusCode >= 200 && statusCode < 300 ? 0 : 1, output: { statusCode, ...payload } };
}

export async function executeVarco3dCli(
  argv: readonly string[],
  deps: RunCliDependencies = {},
): Promise<RunCliResult> {
  const parsed = parseCliArguments(argv);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const spawnImpl = deps.spawnImpl ?? spawnSync;
  const sleepMs =
    deps.sleepMs ??
    ((ms: number) => new Promise<void>((resolveSleep) => setTimeout(resolveSleep, ms)));

  const config = loadVarco3dConfig({
    explicitApiBase: parsed.options.get("api-base"),
    explicitMcpUrl: parsed.options.get("mcp-url"),
    env: deps.env,
    cwd: deps.cwd,
    repoRoot: deps.repoRoot,
    homeDir: deps.homeDir,
  });

  if (parsed.flags.has("help") || parsed.command === "help") {
    return {
      exitCode: 0,
      output: {
        usage: "pnpm run varco3d -- <command> [options]",
        commands: [
          "doctor [--check]",
          "where",
          "bridge-status",
          "mcp-setup [--target status|antigravity|claude|codex] [--write]",
          "generate --image <path> [--use-alpha] [--polygon-count <1000..1000000>] [--confirm]",
          "mv-generate --front <path> --back <path> [--left <path>] [--right <path>] [--confirm]",
          "ai-rig --source-task-id <uuid> [--confirm]",
          "animate --source-task-id <uuid> [--animation <preset>] [--in-place] [--confirm]",
          "status <taskId> [--mv]",
          "wait <taskId> [--mv] [--interval <ms>] [--timeout <ms>]",
          "download-glb <taskId> [--output <path>]",
        ],
      },
    };
  }

  if (parsed.command === "where" || parsed.command === "doctor") {
    return {
      exitCode: 0,
      output: {
        tool: "varco3d",
        provider: "NC AI VARCO 3D (https://3d.varco.ai)",
        mode: parsed.flags.has("check") ? "check" : "inspect",
        apiBase: config.apiBase,
        apiKeyConfigured: config.apiKeyConfigured,
        apiKeySource: config.apiKeySource,
        mcp: inspectMcpSetup(config),
        dccBridges: await probeDccBridges(fetchImpl),
        endpoints: {
          v2Generate: `${config.apiBase}/v2/generate`,
          v2AiRig: `${config.apiBase}/v2/ai-rig`,
          v2Animate: `${config.apiBase}/v2/animate`,
          v2TaskStatus: `${config.apiBase}/v2/tasks/{taskId}`,
          v2DownloadGlb: `${config.apiBase}/v2/tasks/{taskId}/download-glb`,
          v1MvGenerateDeprecated: `${config.apiBase}/v1/mv/generate`,
          v1MvTaskStatusDeprecated: `${config.apiBase}/v1/mv/tasks/{taskId}`,
        },
        paidSubmissionRequiresConfirm: true,
      },
    };
  }

  if (parsed.command === "bridge-status") {
    return { exitCode: 0, output: { dccBridges: await probeDccBridges(fetchImpl) } };
  }

  if (parsed.command === "mcp-setup") {
    const target = parsed.options.get("target") ?? "status";
    const shouldWrite = parsed.flags.has("write") && !parsed.flags.has("check");
    if (target === "antigravity" && shouldWrite) {
      return { exitCode: 0, output: writeAntigravityMcpConfig(config) };
    }
    if ((target === "claude" || target === "codex") && shouldWrite) {
      const args =
        target === "claude"
          ? ["mcp", "add", "--transport", "http", "varco-3d", config.mcpUrl]
          : ["mcp", "add", "varco-3d", "--url", config.mcpUrl, "--oauth-resource", config.mcpUrl];
      const proc = spawnImpl(target, args, { encoding: "utf8" });
      const exitCode = proc.status ?? 1;
      return {
        exitCode,
        output: {
          target,
          exitCode,
          stdout: (proc.stdout ?? "").trim(),
          stderr: (proc.stderr ?? "").trim(),
        },
      };
    }
    return { exitCode: 0, output: { mcp: inspectMcpSetup(config) } };
  }

  if (parsed.command === "generate") {
    const imageOption = parsed.options.get("image");
    if (!imageOption) {
      throw new Error("--image 옵션이 필요합니다. 예: pnpm run varco3d -- generate --image ./sample.png");
    }
    const resolvedImage = resolve(deps.cwd ?? process.cwd(), imageOption);
    if (!existsSync(resolvedImage)) {
      throw new Error(`입력 이미지 파일을 찾을 수 없습니다: ${resolvedImage}`);
    }
    inferImageMimeType(resolvedImage);
    const fields = {
      useAlpha: String(parsed.flags.has("use-alpha")),
      polygonCount: String(validatePolygonCount(parsed.options.get("polygon-count"))),
    };
    return submitMultipartTask(
      `${config.apiBase}/v2/generate`,
      fields,
      { image: resolvedImage },
      {
        image: resolvedImage,
        note: "유료 크레딧 보호를 위해 기본 동작은 dry-run입니다. 실제 생성 요청은 --confirm 플래그를 함께 전달하세요.",
      },
      parsed,
      config,
      fetchImpl,
    );
  }

  if (parsed.command === "mv-generate") {
    const front = parsed.options.get("front");
    const back = parsed.options.get("back");
    if (!front || !back) {
      throw new Error("mv-generate 명령에는 --front 및 --back 이미지 경로가 모두 필요합니다.");
    }
    const baseDir = deps.cwd ?? process.cwd();
    const files: Record<string, string> = {
      front: resolve(baseDir, front),
      back: resolve(baseDir, back),
    };
    const left = parsed.options.get("left");
    const right = parsed.options.get("right");
    if (left) files.left = resolve(baseDir, left);
    if (right) files.right = resolve(baseDir, right);
    for (const [viewName, filePath] of Object.entries(files)) {
      if (!existsSync(filePath)) {
        throw new Error(`${viewName} 이미지 파일을 찾을 수 없습니다: ${filePath}`);
      }
      inferImageMimeType(filePath);
    }
    const fields = {
      useAlpha: String(parsed.flags.has("use-alpha")),
      polygonCount: String(validatePolygonCount(parsed.options.get("polygon-count"))),
    };
    return submitMultipartTask(
      `${config.apiBase}/v1/mv/generate`,
      fields,
      files,
      {
        deprecated: true,
        files,
        note: "실제 멀티뷰 생성 요청을 전송하려면 --confirm 플래그를 추가하세요.",
      },
      parsed,
      config,
      fetchImpl,
    );
  }

  if (parsed.command === "ai-rig") {
    const sourceTaskId = parsed.options.get("source-task-id")?.trim();
    if (!sourceTaskId) throw new Error("--source-task-id <uuid> 옵션이 필요합니다.");
    return submitJsonTask(
      `${config.apiBase}/v2/ai-rig`,
      { sourceTaskId },
      "실제 AI 리깅 요청을 전송하려면 --confirm 플래그를 추가하세요.",
      parsed,
      config,
      fetchImpl,
    );
  }

  if (parsed.command === "animate") {
    const sourceTaskId = parsed.options.get("source-task-id")?.trim();
    if (!sourceTaskId) throw new Error("--source-task-id <uuid> 옵션이 필요합니다.");
    return submitJsonTask(
      `${config.apiBase}/v2/animate`,
      {
        sourceTaskId,
        animation: parsed.options.get("animation")?.trim() ?? "walk",
        inPlaceAnimation: parsed.flags.has("in-place"),
      },
      "실제 애니메이션 요청을 전송하려면 --confirm 플래그를 추가하세요.",
      parsed,
      config,
      fetchImpl,
    );
  }

  if (parsed.command === "status") {
    const taskId = parsed.positionals[0] ?? parsed.options.get("task-id");
    if (!taskId) throw new Error("조회할 taskId를 지정하세요. 예: pnpm run varco3d -- status <taskId>");
    const subpath = parsed.flags.has("mv") ? `/v1/mv/tasks/${taskId}` : `/v2/tasks/${taskId}`;
    const { statusCode, payload } = await requestVarco3dJson(
      `${config.apiBase}${subpath}`,
      { method: "GET", apiKey: requireApiKey(config) },
      fetchImpl,
    );
    return { exitCode: statusCode >= 200 && statusCode < 300 ? 0 : 1, output: { statusCode, ...payload } };
  }

  if (parsed.command === "wait") {
    const taskId = parsed.positionals[0] ?? parsed.options.get("task-id");
    if (!taskId) throw new Error("대기할 taskId를 지정하세요. 예: pnpm run varco3d -- wait <taskId>");
    const apiKey = requireApiKey(config);
    const intervalMs = Math.max(
      100,
      Number.parseInt(parsed.options.get("interval") ?? "5000", 10) || 5_000,
    );
    const timeoutMs = Math.max(
      intervalMs,
      Number.parseInt(parsed.options.get("timeout") ?? "600000", 10) || 600_000,
    );
    const subpath = parsed.flags.has("mv") ? `/v1/mv/tasks/${taskId}` : `/v2/tasks/${taskId}`;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const { statusCode, payload } = await requestVarco3dJson(
        `${config.apiBase}${subpath}`,
        { method: "GET", apiKey },
        fetchImpl,
      );
      const status = String(payload.status ?? "").toUpperCase();
      if (statusCode >= 400 || VARCO3D_TERMINAL_STATUSES.has(status)) {
        return {
          exitCode: statusCode >= 200 && statusCode < 300 && status === "COMPLETED" ? 0 : 1,
          output: { statusCode, ...payload },
        };
      }
      if (Date.now() >= deadline) {
        throw new Error(`작업 완료 대기 시간이 초과되었습니다 (${timeoutMs}ms): ${taskId}`);
      }
      await sleepMs(intervalMs);
    }
  }

  if (parsed.command === "download-glb") {
    const taskId = parsed.positionals[0] ?? parsed.options.get("task-id");
    if (!taskId) {
      throw new Error(
        "다운로드할 taskId를 지정하세요. 예: pnpm run varco3d -- download-glb <taskId> --output ./model.glb",
      );
    }
    const { statusCode, payload } = await requestVarco3dJson(
      `${config.apiBase}/v2/tasks/${taskId}/download-glb`,
      { method: "GET", apiKey: requireApiKey(config) },
      fetchImpl,
    );
    if (statusCode >= 400) return { exitCode: 1, output: { statusCode, ...payload } };
    const glbUrl = typeof payload.glbUrl === "string" ? payload.glbUrl : "";
    const outputOption = parsed.options.get("output");
    if (outputOption && glbUrl) {
      const targetFile = resolve(deps.cwd ?? process.cwd(), outputOption);
      mkdirSync(dirname(targetFile), { recursive: true });
      const binaryResponse = await fetchImpl(glbUrl);
      if (!binaryResponse.ok) {
        throw new Error(`GLB 파일 다운로드에 실패했습니다 (HTTP ${binaryResponse.status}).`);
      }
      const bytes = Buffer.from(await binaryResponse.arrayBuffer());
      writeFileSync(targetFile, bytes);
      return {
        exitCode: 0,
        output: { statusCode, ...payload, savedPath: targetFile, bytesWritten: bytes.byteLength },
      };
    }
    return { exitCode: 0, output: { statusCode, ...payload } };
  }

  throw new Error(
    `알 수 없는 명령입니다: ${parsed.command}. 도움말은 pnpm run varco3d -- --help 로 확인하세요.`,
  );
}

async function main(): Promise<void> {
  try {
    const result = await executeVarco3dCli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result.output, null, 2)}\n`);
    if (result.exitCode !== 0) process.exitCode = result.exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${JSON.stringify({ error: message }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  void main();
}
