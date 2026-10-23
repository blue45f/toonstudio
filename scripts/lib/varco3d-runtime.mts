/**
 * VARCO 3D CLI 런타임 헬퍼 (환경변수 로드, 멀티파트 인코딩, HTTP 요청, NC OpenAPI 인증 점검, DCC 브리지 연동).
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type DccBridgeName,
  type Varco3dApiProvider,
  VARCO3D_API_KEY_NAMES,
  VARCO3D_CLAUDE_APP_CONNECTOR_GUIDE,
  VARCO3D_DCC_BRIDGE_PLUGINS,
  VARCO3D_DCC_BRIDGES,
  VARCO3D_DEFAULT_MCP_URL,
  VARCO3D_DEFAULT_NC_OPENAPI_BASE,
  VARCO3D_DEFAULT_STUDIO_API_BASE,
  VARCO3D_MCP_SETUP_DOC_URL,
} from "./varco3d-catalog.mts";

export interface Varco3dResolvedConfig {
  readonly ncOpenApiBase: string;
  readonly apiBase: string;
  readonly mcpUrl: string;
  readonly apiKey: string;
  readonly apiKeyConfigured: boolean;
  readonly apiKeySource: string;
  readonly repoRoot: string;
  readonly homeDir: string;
}

export interface LoadConfigOptions {
  readonly explicitNcOpenApiBase?: string;
  readonly explicitApiBase?: string;
  readonly explicitMcpUrl?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly cwd?: string;
  readonly repoRoot?: string;
  readonly homeDir?: string;
}

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

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
  const ncOpenApiBase = (
    options.explicitNcOpenApiBase ??
    env.NC_OPENAPI_BASE ??
    VARCO3D_DEFAULT_NC_OPENAPI_BASE
  ).replace(/\/+$/u, "");
  const apiBase = (
    options.explicitApiBase ??
    env.VARCO_3D_API_BASE ??
    VARCO3D_DEFAULT_STUDIO_API_BASE
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
        ncOpenApiBase,
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
          ncOpenApiBase,
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
    ncOpenApiBase,
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

export function validatePolygonCount(
  rawCount: string | undefined,
  provider: Varco3dApiProvider = "studio",
): number {
  const maxAllowed = provider === "nc-openapi" ? 300_000 : 1_000_000;
  const defaultCount = provider === "nc-openapi" ? 300_000 : 500_000;
  if (rawCount === undefined) return defaultCount;
  const parsed = Number.parseInt(rawCount, 10);
  if (!Number.isFinite(parsed) || parsed < 1_000 || parsed > maxAllowed) {
    throw new Error(
      `polygonCount 값(${rawCount})이 유효하지 않습니다. ${provider} 기준 1000 이상 ${maxAllowed} 이하의 정수를 지정하세요.`,
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
  const claudeDesktopConfigPath = resolve(
    config.homeDir,
    "Library/Application Support/Claude/claude_desktop_config.json",
  );
  let claudeDesktopRegistered = false;
  if (existsSync(claudeDesktopConfigPath)) {
    try {
      const parsed = JSON.parse(readFileSync(claudeDesktopConfigPath, "utf8")) as {
        mcpServers?: Record<string, { command?: string; args?: readonly string[] }>;
      };
      const entry = parsed.mcpServers?.["varco-3d"];
      claudeDesktopRegistered = Boolean(entry && Array.isArray(entry.args) && entry.args.includes(config.mcpUrl));
    } catch {
      claudeDesktopRegistered = false;
    }
  }
  const blenderAddonPath = resolve(
    config.homeDir,
    "Library/Application Support/Blender/5.2/extensions/user_default/varco3d_bridge_for_blender/__init__.py",
  );
  const localCliBinaryPath = resolve(config.homeDir, ".local/bin/varco3d");
  return {
    endpoint: config.mcpUrl,
    setupDocUrl: VARCO3D_MCP_SETUP_DOC_URL,
    antigravityConfigPath,
    antigravityRegistered,
    claudeDesktopConfigPath,
    claudeDesktopRegistered,
    blenderAddonPath,
    blenderAddonInstalled: existsSync(blenderAddonPath),
    localCliBinaryPath,
    localCliInstalled: existsSync(localCliBinaryPath),
    claudeDesktopAppConnector: VARCO3D_CLAUDE_APP_CONNECTOR_GUIDE,
    commands: {
      antigravity: "pnpm run varco3d -- mcp-setup --target antigravity --write",
      claudeDesktop: "pnpm run varco3d -- mcp-setup --target claude-desktop --write",
      claudeDesktopApp: "pnpm run varco3d -- mcp-setup --target claude-app",
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

export function writeClaudeDesktopMcpConfig(
  config: Varco3dResolvedConfig,
): Record<string, unknown> {
  const targetPath = resolve(
    config.homeDir,
    "Library/Application Support/Claude/claude_desktop_config.json",
  );
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
  existingServers["varco-3d"] = {
    command: "npx",
    args: ["-y", "mcp-remote", config.mcpUrl],
  };
  rootObj.mcpServers = existingServers;
  writeFileSync(targetPath, `${JSON.stringify(rootObj, null, 2)}\n`, "utf8");
  return { updated: true, path: targetPath, url: config.mcpUrl };
}

export async function probeDccBridges(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 500,
): Promise<
  Record<
    DccBridgeName,
    {
      port: number;
      connected: boolean;
      statusCode?: number;
      pluginDownloadUrl: string;
      guideBlogUrl: string;
    }
  >
> {
  const entries = await Promise.all(
    (Object.entries(VARCO3D_DCC_BRIDGES) as [DccBridgeName, number][]).map(
      async ([name, port]) => {
        const pluginMeta = VARCO3D_DCC_BRIDGE_PLUGINS[name];
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const resp = await fetchImpl(`http://127.0.0.1:${port}/status`, {
            method: "GET",
            signal: controller.signal,
          });
          return [
            name,
            {
              port,
              connected: resp.status === 200,
              statusCode: resp.status,
              pluginDownloadUrl: pluginMeta.pluginDownloadUrl,
              guideBlogUrl: pluginMeta.guideBlogUrl,
            },
          ] as const;
        } catch {
          return [
            name,
            {
              port,
              connected: false,
              pluginDownloadUrl: pluginMeta.pluginDownloadUrl,
              guideBlogUrl: pluginMeta.guideBlogUrl,
            },
          ] as const;
        } finally {
          clearTimeout(timer);
        }
      },
    ),
  );
  return Object.fromEntries(entries) as Record<
    DccBridgeName,
    {
      port: number;
      connected: boolean;
      statusCode?: number;
      pluginDownloadUrl: string;
      guideBlogUrl: string;
    }
  >;
}

export async function requestVarco3dJson(
  url: string,
  init: {
    readonly method: "GET" | "POST";
    readonly apiKey?: string;
    readonly authHeaderName?: "x-api-key" | "OPENAPI_KEY";
    readonly headers?: Readonly<Record<string, string>>;
    readonly body?: BodyInit;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<{ readonly statusCode: number; readonly payload: Record<string, unknown> }> {
  const authHeaderName = init.authHeaderName ?? "x-api-key";
  const authHeaders: Record<string, string> = init.apiKey
    ? { [authHeaderName]: init.apiKey }
    : {};
  const response = await fetchImpl(url, {
    method: init.method,
    headers: {
      Accept: "application/json",
      ...authHeaders,
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

export async function probeNcOpenApiAuth(
  config: Varco3dResolvedConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<{ readonly exitCode: number; readonly output: Record<string, unknown> }> {
  if (!config.apiKeyConfigured || !config.apiKey) {
    return {
      exitCode: 1,
      output: {
        endpoint: config.ncOpenApiBase,
        header: "OPENAPI_KEY",
        authenticated: false,
        reason: "missing_api_key",
      },
    };
  }
  const probeUrl = `${config.ncOpenApiBase}/inference/result/00000000-0000-0000-0000-000000000000`;
  const { statusCode, payload } = await requestVarco3dJson(
    probeUrl,
    {
      method: "GET",
      apiKey: config.apiKey,
      authHeaderName: "OPENAPI_KEY",
    },
    fetchImpl,
  );
  const authenticated =
    (statusCode === 200 || statusCode === 404) && payload.message !== "Unauthorized";
  return {
    exitCode: authenticated ? 0 : 1,
    output: {
      endpoint: config.ncOpenApiBase,
      header: "OPENAPI_KEY",
      authenticated,
      probeStatusCode: statusCode,
      apiKeySource: config.apiKeySource,
    },
  };
}
