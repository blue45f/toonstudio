import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createToonStudioMcpEngine } from "./server.mjs";
import { runToonStudioCli } from "./cli.mjs";

test("ToonStudio MCP 서버가 initialize, tools/list 및 드로잉·전기능 tools/call을 처리한다", () => {
  const engine = createToonStudioMcpEngine();

  const initRes = engine.handleJsonRpcRequest({ jsonrpc: "2.0", id: 1, method: "initialize" });
  assert.equal(initRes.result.serverInfo.name, "toonstudio-mcp");

  const listRes = engine.handleJsonRpcRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.ok(listRes.result.tools.length >= 15);

  const strokeRes = engine.handleJsonRpcRequest({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "studio.canvas.draw_stroke",
      arguments: { brush: "g-pen", points: [[10, 20], [200, 300]] },
    },
  });
  assert.equal(strokeRes.result.structuredContent.ok, true);
  assert.equal(strokeRes.result.structuredContent.totalStrokes, 1);

  const assignRes = engine.handleJsonRpcRequest({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "studio.rbac.assign_role",
      arguments: { actorUserId: "u-owner", targetUserId: "u-guest", roleId: "line_assistant" },
    },
  });
  assert.equal(assignRes.result.structuredContent.ok, true);
  assert.equal(assignRes.result.structuredContent.roleId, "line_assistant");

  const deniedAssign = engine.handleJsonRpcRequest({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "studio.rbac.assign_role",
      arguments: { actorUserId: "u-line", targetUserId: "u-guest", roleId: "studio_owner" },
    },
  });
  assert.equal(deniedAssign.result.structuredContent.ok, false);
});

test("ToonStudio CLI가 --state-file로 연속 명령 상태를 유지한다", () => {
  const dir = mkdtempSync(join(tmpdir(), "toonstudio-mcp-"));
  const stateFile = join(dir, "session.json");
  try {
    const createRes = runToonStudioCli([
      "call",
      "studio.canvas.create",
      "--state-file",
      stateFile,
      "--json",
      '{"title":"연속 테스트 컷","width":800,"height":1200}',
    ]);
    assert.equal(createRes.exitCode, 0);

    const drawRes = runToonStudioCli([
      "call",
      "studio.canvas.draw_stroke",
      "--state-file",
      stateFile,
      "--json",
      '{"points":[[0,0],[100,200]]}',
    ]);
    assert.equal(drawRes.exitCode, 0);

    const snapRes = runToonStudioCli(["call", "studio.session.snapshot", "--state-file", stateFile]);
    const parsed = JSON.parse(snapRes.output);
    assert.equal(parsed.state.canvas.title, "연속 테스트 컷");
    assert.equal(parsed.state.canvas.strokes.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
