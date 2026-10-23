#!/usr/bin/env tsx
/**
 * VARCO 3D (https://openapi.ai.nc.com & https://3d.varco.ai) CLI 도구.
 * - NC AI OpenAPI Platform (image-to-3d, inference/result, auth-check)
 * - VARCO 3D Studio External API (v2 generate, ai-rig, animate, tasks, download-glb, v1 mv)
 * - Remote MCP (Antigravity, Claude Desktop App, Claude Code, OpenAI Codex) 및 Flow 카탈로그
 * - 로컬 DCC Bridge 상태 조회 및 원클릭 임포트 (Blender, Unreal, Unity, 3ds Max, Maya)
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type DccBridgeName,
  type Varco3dApiProvider,
  VARCO3D_ANIMATION_CATALOG,
  VARCO3D_API_KEY_NAMES,
  VARCO3D_CLAUDE_APP_CONNECTOR_GUIDE,
  VARCO3D_DCC_BRIDGE_PLUGINS,
  VARCO3D_DCC_BRIDGES,
  VARCO3D_DEFAULT_API_BASE,
  VARCO3D_DEFAULT_MCP_URL,
  VARCO3D_DEFAULT_NC_OPENAPI_BASE,
  VARCO3D_DEFAULT_STUDIO_API_BASE,
  VARCO3D_FLOW_NODE_CATALOG,
  VARCO3D_MCP_FLOW_TOOLS,
  VARCO3D_MCP_SETUP_DOC_URL,
} from "./lib/varco3d-catalog.mts";
import {
  encodeMultipartFormData,
  inferImageMimeType,
  inspectMcpSetup,
  type LoadConfigOptions,
  loadVarco3dConfig,
  parseEnvFile,
  probeDccBridges,
  probeNcOpenApiAuth,
  REPO_ROOT,
  requireApiKey,
  requestVarco3dJson,
  validatePolygonCount,
  type Varco3dResolvedConfig,
  writeAntigravityMcpConfig,
  writeClaudeDesktopMcpConfig,
} from "./lib/varco3d-runtime.mts";

export {
  type DccBridgeName,
  encodeMultipartFormData,
  inferImageMimeType,
  inspectMcpSetup,
  type LoadConfigOptions,
  loadVarco3dConfig,
  parseEnvFile,
  probeDccBridges,
  probeNcOpenApiAuth,
  REPO_ROOT,
  requireApiKey,
  requestVarco3dJson,
   validatePolygonCount,
  type Varco3dApiProvider,
  type Varco3dResolvedConfig,
  VARCO3D_ANIMATION_CATALOG,
  VARCO3D_API_KEY_NAMES,
  VARCO3D_CLAUDE_APP_CONNECTOR_GUIDE,
  VARCO3D_DCC_BRIDGE_PLUGINS,
  VARCO3D_DCC_BRIDGES,
  VARCO3D_DEFAULT_API_BASE,
  VARCO3D_DEFAULT_MCP_URL,
  VARCO3D_DEFAULT_NC_OPENAPI_BASE,
  VARCO3D_DEFAULT_STUDIO_API_BASE,
  VARCO3D_FLOW_NODE_CATALOG,
  VARCO3D_MCP_FLOW_TOOLS,
  VARCO3D_MCP_SETUP_DOC_URL,
  writeAntigravityMcpConfig,
};

export const VARCO3D_TERMINAL_STATUSES = new Set([
  "COMPLETED",
  "DONE",
  "SUCCEEDED",
  "SUCCESS",
  "FAILED",
  "CANCELLED",
  "CANCELED",
  "ERROR",
]);

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
    "no-texture",
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

export function resolveProvider(parsed: ParsedCliArgs): Varco3dApiProvider {
  const explicit = parsed.options.get("provider")?.trim();
  if (explicit) {
    if (explicit !== "nc-openapi" && explicit !== "studio") {
      throw new Error(
        `지원하지 않는 --provider 값입니다 (${explicit}). nc-openapi 또는 studio 중 하나를 지정하세요.`,
      );
    }
    return explicit;
  }
  if (
    parsed.flags.has("mv") ||
    parsed.flags.has("use-alpha") ||
    parsed.options.has("api-base")
  ) {
    return "studio";
  }
  return "nc-openapi";
}

function buildCatalogOutput(parsed: ParsedCliArgs): Record<string, unknown> {
  const section = parsed.options.get("section") ?? "all";
  const creature = parsed.options.get("creature");
  const category = parsed.options.get("category")?.toUpperCase();

  if (section === "mcp-tools") {
    return { mcpEndpoint: VARCO3D_DEFAULT_MCP_URL, tools: VARCO3D_MCP_FLOW_TOOLS };
  }
  if (section === "nodes") {
    return { nodes: VARCO3D_FLOW_NODE_CATALOG };
  }
  if (section === "bridges") {
    return { dccBridgePlugins: VARCO3D_DCC_BRIDGE_PLUGINS };
  }
  if (section === "claude-app") {
    return { claudeDesktopAppConnector: VARCO3D_CLAUDE_APP_CONNECTOR_GUIDE };
  }
  if (section === "animations") {
    if (creature === "humanoid") {
      const humanoidData = VARCO3D_ANIMATION_CATALOG.humanoid;
      return {
        creature: "humanoid",
        categories:
          category && category in humanoidData
            ? { [category]: humanoidData[category as keyof typeof humanoidData] }
            : humanoidData,
      };
    }
    if (creature === "quadruped") {
      const quadData = VARCO3D_ANIMATION_CATALOG.quadruped.categories;
      return {
        creature: "quadruped",
        speciesPrefixes: VARCO3D_ANIMATION_CATALOG.quadruped.speciesPrefixes,
        categories:
          category && category in quadData
            ? { [category]: quadData[category as keyof typeof quadData] }
            : quadData,
      };
    }
    return { animations: VARCO3D_ANIMATION_CATALOG };
  }

  return {
    mcpEndpoint: VARCO3D_DEFAULT_MCP_URL,
    claudeDesktopAppConnector: VARCO3D_CLAUDE_APP_CONNECTOR_GUIDE,
    mcpFlowTools: VARCO3D_MCP_FLOW_TOOLS,
    flowNodes: VARCO3D_FLOW_NODE_CATALOG,
    animations: VARCO3D_ANIMATION_CATALOG,
    dccBridgePlugins: VARCO3D_DCC_BRIDGE_PLUGINS,
  };
}

async function submitJsonTask(
  url: string,
  body: Record<string, unknown>,
  note: string,
  parsed: ParsedCliArgs,
  config: Varco3dResolvedConfig,
  fetchImpl: typeof fetch,
  authHeaderName: "x-api-key" | "OPENAPI_KEY" = "x-api-key",
): Promise<RunCliResult> {
  if (!parsed.flags.has("confirm") || parsed.flags.has("dry-run")) {
    return {
      exitCode: 0,
      output: {
        dryRun: true,
        method: "POST",
        url,
        authHeader: authHeaderName,
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
      authHeaderName,
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
  authHeaderName: "x-api-key" | "OPENAPI_KEY" = "x-api-key",
): Promise<RunCliResult> {
  if (!parsed.flags.has("confirm") || parsed.flags.has("dry-run")) {
    return {
      exitCode: 0,
      output: {
        dryRun: true,
        method: "POST",
        url,
        authHeader: authHeaderName,
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
      authHeaderName,
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
    explicitNcOpenApiBase: parsed.options.get("nc-openapi-base"),
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
          "auth-check",
          "catalog [--section all|mcp-tools|nodes|animations|bridges|claude-app] [--creature humanoid|quadruped] [--category <NAME>]",
          "bridge-status",
          "bridge-import --dcc <blender|unreal|unity|3dsmax|maya> --url <glbUrl> [--name <modelName>] [--confirm]",
          "mcp-setup [--target status|antigravity|claude-app|claude|codex] [--write]",
          "generate --image <path> [--provider nc-openapi|studio] [--face-type tri|quad] [--polygon-count <count>] [--no-texture] [--seed <int>] [--use-alpha] [--confirm]",
          "mv-generate --front <path> --back <path> [--left <path>] [--right <path>] [--confirm]",
          "ai-rig --source-task-id <uuid> [--confirm]",
          "animate --source-task-id <uuid> [--animation <preset>] [--in-place] [--confirm]",
          "status <taskId> [--provider nc-openapi|studio] [--mv]",
          "wait <taskId> [--provider nc-openapi|studio] [--mv] [--interval <ms>] [--timeout <ms>]",
          "download-glb <taskId> [--provider nc-openapi|studio] [--output <path>]",
        ],
      },
    };
  }

  if (parsed.command === "where" || parsed.command === "doctor") {
    return {
      exitCode: 0,
      output: {
        tool: "varco3d",
        provider: "NC AI VARCO 3D (platform.nc-ai.com & 3d.varco.ai)",
        mode: parsed.flags.has("check") ? "check" : "inspect",
        ncOpenApiBase: config.ncOpenApiBase,
        apiBase: config.apiBase,
        apiKeyConfigured: config.apiKeyConfigured,
        apiKeySource: config.apiKeySource,
        mcp: inspectMcpSetup(config),
        dccBridges: await probeDccBridges(fetchImpl),
        endpoints: {
          ncOpenApiImageTo3d: `${config.ncOpenApiBase}/3d/varco/v1/image-to-3d`,
          ncOpenApiResult: `${config.ncOpenApiBase}/inference/result/{requestId}`,
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

  if (parsed.command === "auth-check") {
    return probeNcOpenApiAuth(config, fetchImpl);
  }

  if (parsed.command === "catalog" || parsed.command === "capabilities") {
    return { exitCode: 0, output: buildCatalogOutput(parsed) };
  }

  if (parsed.command === "bridge-status") {
    return { exitCode: 0, output: { dccBridges: await probeDccBridges(fetchImpl) } };
  }

  if (parsed.command === "bridge-import") {
    const rawDcc = (parsed.options.get("dcc") ?? "").toLowerCase() as DccBridgeName;
    if (!(rawDcc in VARCO3D_DCC_BRIDGES)) {
      throw new Error(
        `지원하지 않는 --dcc 값입니다 (${rawDcc || "없음"}). blender, unreal, unity, 3dsmax, maya 중 하나를 지정하세요.`,
      );
    }
    const glbUrl = parsed.options.get("url")?.trim();
    if (!glbUrl) {
      throw new Error(
        "--url <glbUrl> 옵션이 필요합니다. 예: pnpm run varco3d -- bridge-import --dcc blender --url https://.../model.glb",
      );
    }
    const modelName = parsed.options.get("name")?.trim() || "varco3d_model";
    const pluginMeta = VARCO3D_DCC_BRIDGE_PLUGINS[rawDcc];
    const body = { url: glbUrl, name: modelName };
    if (!parsed.flags.has("confirm") || parsed.flags.has("dry-run")) {
      return {
        exitCode: 0,
        output: {
          dryRun: true,
          dcc: rawDcc,
          port: pluginMeta.port,
          method: "POST",
          url: pluginMeta.importEndpoint,
          body,
          pluginDownloadUrl: pluginMeta.pluginDownloadUrl,
          note: "실제 로컬 DCC 브리지로 모델을 전송하려면 --confirm 플래그를 추가하세요.",
        },
      };
    }
    const { statusCode, payload } = await requestVarco3dJson(
      pluginMeta.importEndpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      fetchImpl,
    );
    return {
      exitCode: statusCode >= 200 && statusCode < 300 ? 0 : 1,
      output: { dcc: rawDcc, port: pluginMeta.port, statusCode, ...payload },
    };
  }

  if (parsed.command === "mcp-setup") {
    const target = parsed.options.get("target") ?? "status";
    const shouldWrite = parsed.flags.has("write") && !parsed.flags.has("check");
    if (target === "claude-app") {
      return { exitCode: 0, output: { claudeDesktopAppConnector: VARCO3D_CLAUDE_APP_CONNECTOR_GUIDE } };
    }
    if (target === "antigravity" && shouldWrite) {
      return { exitCode: 0, output: writeAntigravityMcpConfig(config) };
    }
    if (target === "claude-desktop" && shouldWrite) {
      return { exitCode: 0, output: writeClaudeDesktopMcpConfig(config) };
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
    const provider = resolveProvider(parsed);
    if (provider === "nc-openapi") {
      const faceType = parsed.options.get("face-type") ?? "tri";
      if (faceType !== "tri" && faceType !== "quad") {
        throw new Error(`--face-type 값(${faceType})이 유효하지 않습니다. tri 또는 quad를 지정하세요.`);
      }
      const fields = {
        target_face_type: faceType,
        target_face_num: String(validatePolygonCount(parsed.options.get("polygon-count"), "nc-openapi")),
        generate_texture: String(!parsed.flags.has("no-texture")),
        seed: parsed.options.get("seed") ?? "-1",
      };
      return submitMultipartTask(
        `${config.ncOpenApiBase}/3d/varco/v1/image-to-3d`,
        fields,
        { image: resolvedImage },
        {
          provider: "nc-openapi",
          image: resolvedImage,
          note: "유료 크레딧 보호를 위해 기본 동작은 dry-run입니다. 실제 생성 요청은 --confirm 플래그를 함께 전달하세요.",
        },
        parsed,
        config,
        fetchImpl,
        "OPENAPI_KEY",
      );
    }

    const fields = {
      useAlpha: String(parsed.flags.has("use-alpha")),
      polygonCount: String(validatePolygonCount(parsed.options.get("polygon-count"), "studio")),
    };
    return submitMultipartTask(
      `${config.apiBase}/v2/generate`,
      fields,
      { image: resolvedImage },
      {
        provider: "studio",
        image: resolvedImage,
        note: "유료 크레딧 보호를 위해 기본 동작은 dry-run입니다. 실제 생성 요청은 --confirm 플래그를 함께 전달하세요.",
      },
      parsed,
      config,
      fetchImpl,
      "x-api-key",
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
      polygonCount: String(validatePolygonCount(parsed.options.get("polygon-count"), "studio")),
    };
    return submitMultipartTask(
      `${config.apiBase}/v1/mv/generate`,
      fields,
      files,
      {
        provider: "studio",
        deprecated: true,
        files,
        note: "실제 멀티뷰 생성 요청을 전송하려면 --confirm 플래그를 추가하세요.",
      },
      parsed,
      config,
      fetchImpl,
      "x-api-key",
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
    const provider = resolveProvider(parsed);
    const url =
      provider === "nc-openapi"
        ? `${config.ncOpenApiBase}/inference/result/${taskId}`
        : `${config.apiBase}${parsed.flags.has("mv") ? `/v1/mv/tasks/${taskId}` : `/v2/tasks/${taskId}`}`;
    const authHeaderName = provider === "nc-openapi" ? "OPENAPI_KEY" : "x-api-key";
    const { statusCode, payload } = await requestVarco3dJson(
      url,
      { method: "GET", apiKey: requireApiKey(config), authHeaderName },
      fetchImpl,
    );
    return { exitCode: statusCode >= 200 && statusCode < 300 ? 0 : 1, output: { statusCode, ...payload } };
  }

  if (parsed.command === "wait") {
    const taskId = parsed.positionals[0] ?? parsed.options.get("task-id");
    if (!taskId) throw new Error("대기할 taskId를 지정하세요. 예: pnpm run varco3d -- wait <taskId>");
    const apiKey = requireApiKey(config);
    const provider = resolveProvider(parsed);
    const intervalMs = Math.max(
      100,
      Number.parseInt(parsed.options.get("interval") ?? "5000", 10) || 5_000,
    );
    const timeoutMs = Math.max(
      intervalMs,
      Number.parseInt(parsed.options.get("timeout") ?? "600000", 10) || 600_000,
    );
    const url =
      provider === "nc-openapi"
        ? `${config.ncOpenApiBase}/inference/result/${taskId}`
        : `${config.apiBase}${parsed.flags.has("mv") ? `/v1/mv/tasks/${taskId}` : `/v2/tasks/${taskId}`}`;
    const authHeaderName = provider === "nc-openapi" ? "OPENAPI_KEY" : "x-api-key";
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const { statusCode, payload } = await requestVarco3dJson(
        url,
        { method: "GET", apiKey, authHeaderName },
        fetchImpl,
      );
      const status = String(payload.status ?? "").toUpperCase();
      if (statusCode >= 400 || VARCO3D_TERMINAL_STATUSES.has(status)) {
        const isSuccess =
          statusCode >= 200 &&
          statusCode < 300 &&
          (status === "COMPLETED" ||
            status === "DONE" ||
            status === "SUCCEEDED" ||
            status === "SUCCESS" ||
            typeof payload.model_url === "string");
        return { exitCode: isSuccess ? 0 : 1, output: { statusCode, ...payload } };
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
    const provider = resolveProvider(parsed);
    const url =
      provider === "nc-openapi"
        ? `${config.ncOpenApiBase}/inference/result/${taskId}`
        : `${config.apiBase}/v2/tasks/${taskId}/download-glb`;
    const authHeaderName = provider === "nc-openapi" ? "OPENAPI_KEY" : "x-api-key";
    const { statusCode, payload } = await requestVarco3dJson(
      url,
      { method: "GET", apiKey: requireApiKey(config), authHeaderName },
      fetchImpl,
    );
    if (statusCode >= 400) return { exitCode: 1, output: { statusCode, ...payload } };
    const glbUrl =
      typeof payload.glbUrl === "string"
        ? payload.glbUrl
        : typeof payload.model_url === "string"
          ? payload.model_url
          : "";
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
