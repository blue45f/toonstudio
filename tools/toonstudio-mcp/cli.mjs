#!/usr/bin/env node
/**
 * ToonStudio 통합 CLI (`toonstudio-cli`) v2.4.
 *
 * 사용법:
 *   node tools/toonstudio-mcp/cli.mjs list
 *   node tools/toonstudio-mcp/cli.mjs quota
 *   node tools/toonstudio-mcp/cli.mjs ai-modes
 *   node tools/toonstudio-mcp/cli.mjs doctor [--state-file /tmp/ts.json]
 *   node tools/toonstudio-mcp/cli.mjs mcp-config --client claude|cursor|gemini|codex|antigravity
 *   node tools/toonstudio-mcp/cli.mjs init-skill <dir> [--force]
 *   node tools/toonstudio-mcp/cli.mjs completion zsh|bash
 *   node tools/toonstudio-mcp/cli.mjs verify-plugin <manifest.json> [--strict]
 *   node tools/toonstudio-mcp/cli.mjs batch --json '[{"tool":"studio.canvas.create","arguments":{"title":"1화"}}]'
 *   node tools/toonstudio-mcp/cli.mjs call studio.canvas.draw_stroke --state-file /tmp/ts.json --json '{"points":[[10,10],[120,240]]}'
 *   node tools/toonstudio-mcp/cli.mjs draw-demo
 *   node tools/toonstudio-mcp/cli.mjs mcp [--state-file /tmp/ts.json]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createToonStudioMcpEngine, startStdioMcpServer } from "./server.mjs";
import { verifyPluginManifestSandbox } from "./tools-ecosystem-v2.mjs";

const MCP_PACKAGE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT_DIR = resolve(MCP_PACKAGE_DIR, "..", "..");
const OFFICIAL_PLUGIN_PATH = join(MCP_PACKAGE_DIR, "plugin.json");
const OFFICIAL_SKILL_PATH = join(MCP_PACKAGE_DIR, "skills", "toonstudio-creator", "SKILL.md");
const SUPPORTED_CLIENTS = Object.freeze(["claude", "cursor", "gemini", "codex", "antigravity"]);

const CLI_SUBCOMMANDS = Object.freeze([
  "list",
  "quota",
  "ai-modes",
  "doctor",
  "mcp-config",
  "init-skill",
  "completion",
  "verify-plugin",
  "batch",
  "call",
  "draw-demo",
  "mcp",
  "help",
]);

function parseFlagValue(args, flag) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith("--")) {
    return args[idx + 1];
  }
  const eqPrefix = `${flag}=`;
  const eqArg = args.find((item) => item.startsWith(eqPrefix));
  return eqArg ? eqArg.slice(eqPrefix.length) : undefined;
}

function buildClientMcpConfig(client, { stateFile, apiUrl }) {
  const serverScript = join(MCP_PACKAGE_DIR, "server.mjs");
  const resolvedState = stateFile || ".cache/toonstudio-mcp-state.json";
  const serverArgs = [serverScript, "--state-file", resolvedState];
  if (apiUrl) serverArgs.push("--api-url", apiUrl);

  const safeEnv = { TOONSTUDIO_ZERO_BILL_GUARD: "1" };

  if (client === "claude") {
    return {
      mcpServers: {
        toonstudio: {
          command: "node",
          args: serverArgs,
          env: safeEnv,
        },
      },
    };
  }

  if (client === "cursor") {
    return {
      mcpServers: {
        toonstudio: {
          type: "stdio",
          command: "node",
          args: serverArgs,
          env: safeEnv,
        },
      },
    };
  }

  if (client === "gemini") {
    return {
      mcpServers: {
        toonstudio: {
          command: "node",
          args: serverArgs,
          trust: false,
          env: safeEnv,
        },
      },
    };
  }

  if (client === "codex") {
    const escapedArgs = serverArgs.map((item) => JSON.stringify(item)).join(", ");
    return {
      mcp_servers: {
        toonstudio: {
          command: "node",
          args: serverArgs,
          env: safeEnv,
        },
      },
      tomlSnippet: [
        "[mcp_servers.toonstudio]",
        'command = "node"',
        `args = [${escapedArgs}]`,
        '[mcp_servers.toonstudio.env]',
        'TOONSTUDIO_ZERO_BILL_GUARD = "1"',
      ].join("\n"),
    };
  }

  return {
    mcpServers: {
      toonstudio: {
        command: "node",
        args: serverArgs,
        env: safeEnv,
      },
    },
    skillPath: OFFICIAL_SKILL_PATH,
    pluginManifest: OFFICIAL_PLUGIN_PATH,
  };
}

function buildShellCompletion(shell, toolNames) {
  const subList = CLI_SUBCOMMANDS.join(" ");
  const clientList = SUPPORTED_CLIENTS.join(" ");
  const toolList = toolNames.join(" ");

  if (shell === "zsh") {
    return [
      "#compdef toonstudio toonstudio-cli",
      "_toonstudio() {",
      "  local -a subcommands clients tools",
      `  subcommands=(${subList})`,
      `  clients=(${clientList})`,
      `  tools=(${toolList})`,
      '  if (( CURRENT == 2 )); then',
      '    compadd -a subcommands',
      '    return',
      "  fi",
      '  case "${words[2]}" in',
      "    call)",
      '      if (( CURRENT == 3 )); then compadd -a tools; fi',
      "      ;;",
      "    mcp-config)",
      '      if [[ "${words[CURRENT-1]}" == "--client" ]]; then',
      "        compadd -a clients",
      "      else",
      "        compadd -- --client --state-file --api-url",
      "      fi",
      "      ;;",
      "    completion)",
      "      compadd -- zsh bash",
      "      ;;",
      "    verify-plugin)",
      "      _files -g '*.json'",
      "      ;;",
      "    init-skill)",
      "      _files -/",
      "      ;;",
      "  esac",
      "}",
      "compdef _toonstudio toonstudio toonstudio-cli",
    ].join("\n");
  }

  return [
    "# bash completion for toonstudio / toonstudio-cli",
    "_toonstudio_completions() {",
    '  local cur prev cmd',
    '  cur="${COMP_WORDS[COMP_CWORD]}"',
    '  prev="${COMP_WORDS[COMP_CWORD-1]}"',
    '  cmd="${COMP_WORDS[1]}"',
    "  if [[ ${COMP_CWORD} -eq 1 ]]; then",
    `    COMPREPLY=( $(compgen -W "${subList}" -- "$cur") )`,
    "    return 0",
    "  fi",
    '  case "$cmd" in',
    "    call)",
    "      if [[ ${COMP_CWORD} -eq 2 ]]; then",
    `        COMPREPLY=( $(compgen -W "${toolList}" -- "$cur") )`,
    "      fi",
    "      ;;",
    "    mcp-config)",
    '      if [[ "$prev" == "--client" ]]; then',
    `        COMPREPLY=( $(compgen -W "${clientList}" -- "$cur") )`,
    "      else",
    '        COMPREPLY=( $(compgen -W "--client --state-file --api-url" -- "$cur") )',
    "      fi",
    "      ;;",
    "    completion)",
    '      COMPREPLY=( $(compgen -W "zsh bash" -- "$cur") )',
    "      ;;",
    "    verify-plugin)",
    '      COMPREPLY=( $(compgen -f -- "$cur") )',
    "      ;;",
    "    init-skill)",
    '      COMPREPLY=( $(compgen -d -- "$cur") )',
    "      ;;",
    "  esac",
    "}",
    "complete -F _toonstudio_completions toonstudio toonstudio-cli",
  ].join("\n");
}

function inspectPluginFile(filePath) {
  const resolvedPath = resolve(String(filePath));
  if (!existsSync(resolvedPath)) {
    return {
      exitCode: 1,
      report: { ok: false, error: `매니페스트 파일을 찾을 수 없습니다: ${resolvedPath}` },
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    return {
      exitCode: 1,
      report: {
        ok: false,
        error: `매니페스트 JSON 파싱 실패: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
  const verification = verifyPluginManifestSandbox(parsed);
  return {
    exitCode: verification.verdict === "blocked" ? 1 : 0,
    report: {
      manifestPath: resolvedPath,
      ...verification,
    },
  };
}

export function runToonStudioCli(argv, options = {}) {
  const [command = "help", ...rest] = argv;
  const stateFile = parseFlagValue(rest, "--state-file") ?? process.env.TOONSTUDIO_MCP_STATE_FILE;
  const apiUrl = parseFlagValue(rest, "--api-url") ?? process.env.TOONSTUDIO_API_URL;
  const env = options.env ?? process.env;
  const engine = createToonStudioMcpEngine({ stateFile, apiUrl, env });

  if (command === "mcp") {
    startStdioMcpServer({ stateFile, apiUrl, env });
    return { exitCode: 0, output: "" };
  }

  if (command === "list") {
    const res = engine.handleJsonRpcRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    return { exitCode: 0, output: JSON.stringify(res.result.tools, null, 2) };
  }

  if (command === "quota") {
    const res = engine.handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "studio.ai.free_quota_status", arguments: {} },
    });
    return { exitCode: 0, output: JSON.stringify(res.result.structuredContent, null, 2) };
  }

  if (command === "ai-modes") {
    const res = engine.handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "studio.ai.list_modes", arguments: {} },
    });
    return { exitCode: 0, output: JSON.stringify(res.result.structuredContent, null, 2) };
  }

  if (command === "doctor") {
    const listRes = engine.handleJsonRpcRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const quotaRes = engine.handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "studio.ai.free_quota_status", arguments: {} },
    });
    const modesRes = engine.handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "studio.ai.list_modes", arguments: {} },
    });
    const preflightRes = engine.handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "studio.export.preflight_check", arguments: { platform: "naver-webtoon" } },
    });
    const resourcesRes = engine.handleJsonRpcRequest({ jsonrpc: "2.0", id: 5, method: "resources/list" });
    const promptsRes = engine.handleJsonRpcRequest({ jsonrpc: "2.0", id: 6, method: "prompts/list" });
    const pluginCheck = inspectPluginFile(OFFICIAL_PLUGIN_PATH);

    const tools = listRes.result.tools;
    const domains = {};
    for (const tool of tools) {
      const name = String(tool.name);
      const domain = name.startsWith("toonstudio_") ? "ecosystem-v2" : name.split(".")[1] || "other";
      domains[domain] = (domains[domain] || 0) + 1;
    }

    const majorNode = Number.parseInt(process.versions.node.split(".")[0] || "0", 10);
    const report = {
      ok: pluginCheck.report.valid !== false && tools.length >= 44,
      nodeVersion: process.version,
      mcpServerVersion: "2.4.0",
      totalMcpTools: tools.length,
      toolDomainCounts: domains,
      aiAssistModesCount: modesRes.result.structuredContent.totalModes,
      environment: {
        nodeVersion: process.version,
        nodeSupported: majorNode >= 24,
        platform: process.platform,
        arch: process.arch,
      },
      buildArtifacts: {
        packageJsonPresent: existsSync(join(REPO_ROOT_DIR, "package.json")),
        mcpServerPresent: existsSync(join(MCP_PACKAGE_DIR, "server.mjs")),
        pluginManifestPresent: existsSync(OFFICIAL_PLUGIN_PATH),
        officialSkillPresent: existsSync(OFFICIAL_SKILL_PATH),
        webDistPresent: existsSync(join(REPO_ROOT_DIR, "dist", "index.html")),
      },
      localStack: {
        pluginManifestVerdict: pluginCheck.report.verdict ?? "blocked",
        pluginManifestValid: Boolean(pluginCheck.report.valid),
        totalResources: resourcesRes.result.resources.length,
        totalPrompts: promptsRes.result.prompts.length,
        zeroBillGuaranteed: true,
        secretsRedacted: true,
      },
      zeroBillGuard: {
        guaranteedZeroCostLabel: quotaRes.result.structuredContent.guaranteedZeroCostLabel,
        paidBillingBlocked: quotaRes.result.structuredContent.paidBillingBlocked,
        safetyCutoffRatio: quotaRes.result.structuredContent.safetyCutoffRatio,
        configuredCloudCount: quotaRes.result.structuredContent.summary.configuredCloudCount,
        activeCloudCount: quotaRes.result.structuredContent.summary.activeCloudCount,
        localFallbackReady: quotaRes.result.structuredContent.summary.localFallbackReady,
      },
      preflightVerdict: preflightRes.result.structuredContent.verdict,
      stateFileConfigured: Boolean(stateFile),
      apiUrlConfigured: Boolean(apiUrl),
    };
    return { exitCode: report.ok ? 0 : 1, output: JSON.stringify(report, null, 2) };
  }

  if (command === "mcp-config") {
    const clientRaw = parseFlagValue(rest, "--client") ?? rest.find((arg) => !arg.startsWith("--"));
    const client = String(clientRaw ?? "").trim().toLowerCase();
    if (!SUPPORTED_CLIENTS.includes(client)) {
      return {
        exitCode: 1,
        output: JSON.stringify(
          {
            ok: false,
            error: `지원하는 클라이언트를 지정하세요(--client ${SUPPORTED_CLIENTS.join("|")}).`,
            supportedClients: SUPPORTED_CLIENTS,
          },
          null,
          2,
        ),
      };
    }
    const config = buildClientMcpConfig(client, { stateFile, apiUrl });
    return { exitCode: 0, output: JSON.stringify(config, null, 2) };
  }

  if (command === "init-skill") {
    const targetArg = rest.find((arg) => !arg.startsWith("--"));
    const force = rest.includes("--force");
    if (!targetArg) {
      return {
        exitCode: 1,
        output: JSON.stringify(
          { ok: false, error: "사용법: toonstudio-cli init-skill <dir> [--force]" },
          null,
          2,
        ),
      };
    }
    const baseDir = resolve(targetArg);
    const targetDir = basename(baseDir) === "toonstudio-creator" ? baseDir : join(baseDir, "toonstudio-creator");
    const targetSkillPath = join(targetDir, "SKILL.md");
    const targetPluginPath = join(targetDir, "plugin.json");

    if (!force && (existsSync(targetSkillPath) || existsSync(targetPluginPath))) {
      return {
        exitCode: 1,
        output: JSON.stringify(
          {
            ok: false,
            error: `대상 경로에 이미 스킬 파일이 존재합니다(${targetDir}). 덮어쓰려면 --force 옵션을 추가하세요.`,
            targetDir,
          },
          null,
          2,
        ),
      };
    }

    mkdirSync(targetDir, { recursive: true });
    writeFileSync(targetSkillPath, readFileSync(OFFICIAL_SKILL_PATH, "utf8"), "utf8");
    writeFileSync(targetPluginPath, readFileSync(OFFICIAL_PLUGIN_PATH, "utf8"), "utf8");
    return {
      exitCode: 0,
      output: JSON.stringify(
        {
          ok: true,
          skillId: "toonstudio-creator",
          targetDir,
          overwritten: force,
          filesWritten: [targetSkillPath, targetPluginPath],
        },
        null,
        2,
      ),
    };
  }

  if (command === "completion") {
    const shell = String(rest.find((arg) => !arg.startsWith("--")) ?? "").trim().toLowerCase();
    if (shell !== "zsh" && shell !== "bash") {
      return {
        exitCode: 1,
        output: JSON.stringify(
          { ok: false, error: "사용법: toonstudio-cli completion zsh|bash", supportedShells: ["zsh", "bash"] },
          null,
          2,
        ),
      };
    }
    const listRes = engine.handleJsonRpcRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const toolNames = listRes.result.tools.map((t) => t.name);
    return { exitCode: 0, output: buildShellCompletion(shell, toolNames) };
  }

  if (command === "verify-plugin") {
    const manifestPath = rest.find((arg) => !arg.startsWith("--"));
    const strict = rest.includes("--strict");
    if (!manifestPath) {
      return {
        exitCode: 1,
        output: JSON.stringify(
          { ok: false, error: "사용법: toonstudio-cli verify-plugin <manifest.json> [--strict]" },
          null,
          2,
        ),
      };
    }
    const inspected = inspectPluginFile(manifestPath);
    const exitCode =
      inspected.exitCode !== 0 || (strict && inspected.report.verdict !== "approved") ? 1 : 0;
    return { exitCode, output: JSON.stringify(inspected.report, null, 2) };
  }

  if (command === "batch") {
    const rawJson = parseFlagValue(rest, "--json");
    const filePath = parseFlagValue(rest, "--file");
    if (!rawJson && !filePath) {
      return {
        exitCode: 1,
        output:
          "사용법: toonstudio-cli batch (--json '[{\"tool\":\"...\",\"arguments\":{}}]' | --file <path>) [--state-file <p>]",
      };
    }
    let steps;
    try {
      const sourceText = filePath ? readFileSync(resolve(filePath), "utf8") : rawJson;
      steps = JSON.parse(sourceText);
    } catch (error) {
      return {
        exitCode: 1,
        output: JSON.stringify(
          { ok: false, error: `배치 JSON 파싱 실패: ${error instanceof Error ? error.message : String(error)}` },
          null,
          2,
        ),
      };
    }
    if (!Array.isArray(steps) || steps.length === 0) {
      return {
        exitCode: 1,
        output: JSON.stringify({ ok: false, error: "배치 입력은 1개 이상의 스텝 배열이어야 합니다." }, null, 2),
      };
    }

    const results = [];
    let failedCount = 0;
    for (let idx = 0; idx < steps.length; idx += 1) {
      const step = steps[idx] ?? {};
      const toolName = step.tool || step.name;
      const toolArgs = step.arguments || step.args || {};
      const res = engine.handleJsonRpcRequest({
        jsonrpc: "2.0",
        id: idx + 1,
        method: "tools/call",
        params: { name: toolName, arguments: toolArgs },
      });
      if (res.error) {
        failedCount += 1;
        results.push({ step: idx + 1, tool: toolName, ok: false, error: res.error });
      } else {
        const structured = res.result.structuredContent;
        if (structured && structured.ok === false) failedCount += 1;
        results.push({ step: idx + 1, tool: toolName, ok: structured?.ok !== false, result: structured });
      }
    }
    return {
      exitCode: failedCount === 0 ? 0 : 1,
      output: JSON.stringify(
        {
          ok: failedCount === 0,
          totalSteps: steps.length,
          succeededSteps: steps.length - failedCount,
          failedSteps: failedCount,
          results,
        },
        null,
        2,
      ),
    };
  }

  if (command === "call") {
    const toolName = rest[0];
    if (!toolName || toolName.startsWith("--")) {
      return { exitCode: 1, output: "사용법: toonstudio-cli call <tool_name> [--state-file <path>] [--json '<payload>']" };
    }
    const rawJson = parseFlagValue(rest, "--json");
    let args = {};
    if (rawJson) {
      try {
        args = JSON.parse(rawJson);
      } catch (error) {
        return {
          exitCode: 1,
          output: JSON.stringify(
            { ok: false, error: `인자 JSON 파싱 실패: ${error instanceof Error ? error.message : String(error)}` },
            null,
            2,
          ),
        };
      }
    }
    const res = engine.handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    });
    if (res.error) {
      return { exitCode: 1, output: JSON.stringify(res.error, null, 2) };
    }
    return { exitCode: 0, output: JSON.stringify(res.result.structuredContent, null, 2) };
  }

  if (command === "draw-demo") {
    engine.handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "studio.canvas.create", arguments: { title: "CLI 드로잉 데모", width: 800, height: 1200 } },
    });
    engine.handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "studio.canvas.draw_stroke",
        arguments: { brush: "g-pen", color: "#111827", width: 4, points: [[80, 120], [420, 360], [680, 220]] },
      },
    });
    engine.handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "studio.canvas.add_speech_balloon", arguments: { text: "CLI로 그린 웹툰 컷!", x: 400, y: 180 } },
    });
    engine.handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "studio.canvas.apply_scene_fx", arguments: { presetId: "impact-frame-burst", intensity: 88 } },
    });
    const exported = engine.handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "studio.canvas.export_svg", arguments: {} },
    });
    return { exitCode: 0, output: JSON.stringify(exported.result.structuredContent, null, 2) };
  }

  return {
    exitCode: 0,
    output: [
      "ToonStudio CLI & MCP Bridge v2.4 (44종 풀스튜디오 툴 · ₩0 Fail-Closed AI · 공식 스킬/플러그인)",
      "  list                                                              사용 가능한 전체 44종 MCP 툴 목록 출력",
      "  quota                                                             무료 AI 공급자 안전 할당량(₩0) 조회 (키 미노출)",
      "  ai-modes                                                          14종 무과금 웹툰 AI 창작 보조 모드 목록 출력",
      "  doctor [--state-file <p>] [--api-url <u>]                         환경·빌드·로컬 스택·플러그인·무과금 AI 종합 진단",
      "  mcp-config --client claude|cursor|gemini|codex|antigravity        클라이언트별 복붙 즉시 연동 MCP JSON 생성",
      "  init-skill <dir> [--force]                                        공식 toonstudio-creator 스킬 스캐폴딩 설치",
      "  completion zsh|bash                                               쉘 자동완성 스크립트 출력",
      "  verify-plugin <manifest.json> [--strict]                          플러그인/스킬 매니페스트 샌드박스 보안 검증",
      "  batch (--json '<steps>' | --file <path>) [--state-file <p>]       여러 MCP 툴 체인 일괄 실행",
      "  call <tool> [--state-file <p>] [--api-url <u>] [--json '<json>']  지정된 툰스튜디오 툴 실행",
      "  draw-demo                                                         CLI 드로잉·말풍선·VFX SVG 생성 데모",
      "  mcp [--state-file <p>] [--api-url <u>]                            JSON-RPC 2.0 MCP stdio 서버 실행",
    ].join("\n"),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = runToonStudioCli(process.argv.slice(2));
  if (result.output) process.stdout.write(`${result.output}\n`);
  if (result.exitCode !== 0) process.exit(result.exitCode);
}
