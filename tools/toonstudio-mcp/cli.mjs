#!/usr/bin/env node
/**
 * ToonStudio 통합 CLI (`toonstudio-cli`).
 *
 * 사용법:
 *   node tools/toonstudio-mcp/cli.mjs list
 *   node tools/toonstudio-mcp/cli.mjs call studio.canvas.draw_stroke --state-file /tmp/ts.json --json '{"points":[[10,10],[120,240]]}'
 *   node tools/toonstudio-mcp/cli.mjs draw-demo
 *   node tools/toonstudio-mcp/cli.mjs mcp [--state-file /tmp/ts.json]
 */

import { createToonStudioMcpEngine, startStdioMcpServer } from "./server.mjs";

function parseFlagValue(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
}

export function runToonStudioCli(argv) {
  const [command = "help", ...rest] = argv;
  const stateFile = parseFlagValue(rest, "--state-file") ?? process.env.TOONSTUDIO_MCP_STATE_FILE;
  const apiUrl = parseFlagValue(rest, "--api-url") ?? process.env.TOONSTUDIO_API_URL;
  const engine = createToonStudioMcpEngine({ stateFile, apiUrl });

  if (command === "mcp") {
    startStdioMcpServer({ stateFile, apiUrl });
    return { exitCode: 0, output: "" };
  }

  if (command === "list") {
    const res = engine.handleJsonRpcRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    return { exitCode: 0, output: JSON.stringify(res.result.tools, null, 2) };
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
      "ToonStudio CLI & MCP Bridge",
      "  list                                              사용 가능한 전체 툴 목록 출력",
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
