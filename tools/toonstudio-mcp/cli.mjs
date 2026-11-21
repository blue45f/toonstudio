#!/usr/bin/env node
/**
 * ToonStudio 통합 CLI (`toonstudio-cli`).
 *
 * 사용법:
 *   node tools/toonstudio-mcp/cli.mjs list
 *   node tools/toonstudio-mcp/cli.mjs quota
 *   node tools/toonstudio-mcp/cli.mjs ai-modes
 *   node tools/toonstudio-mcp/cli.mjs doctor [--state-file /tmp/ts.json]
 *   node tools/toonstudio-mcp/cli.mjs batch --json '[{"tool":"studio.canvas.create","arguments":{"title":"1화"}}]'
 *   node tools/toonstudio-mcp/cli.mjs call studio.canvas.draw_stroke --state-file /tmp/ts.json --json '{"points":[[10,10],[120,240]]}'
 *   node tools/toonstudio-mcp/cli.mjs draw-demo
 *   node tools/toonstudio-mcp/cli.mjs mcp [--state-file /tmp/ts.json]
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createToonStudioMcpEngine, startStdioMcpServer } from "./server.mjs";

function parseFlagValue(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
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

    const tools = listRes.result.tools;
    const domains = {};
    for (const tool of tools) {
      const domain = String(tool.name).split(".")[1] || "other";
      domains[domain] = (domains[domain] || 0) + 1;
    }

    const report = {
      ok: true,
      nodeVersion: process.version,
      mcpServerVersion: "2.0.0",
      totalMcpTools: tools.length,
      toolDomainCounts: domains,
      aiAssistModesCount: modesRes.result.structuredContent.totalModes,
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
    return { exitCode: 0, output: JSON.stringify(report, null, 2) };
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
      args = JSON.parse(rawJson);
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
      "ToonStudio CLI & MCP Bridge v2.0 (32종 풀스튜디오 툴 · ₩0 Fail-Closed AI)",
      "  list                                                              사용 가능한 전체 MCP 툴 목록 출력",
      "  quota                                                             무료 AI 공급자 안전 할당량(₩0) 조회 (키 미노출)",
      "  ai-modes                                                          14종 무과금 웹툰 AI 창작 보조 모드 목록 출력",
      "  doctor [--state-file <p>] [--api-url <u>]                         MCP/CLI/무과금 AI 환경 종합 진단",
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
