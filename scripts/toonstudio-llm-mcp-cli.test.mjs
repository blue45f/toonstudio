import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SUPPORTED_LLM_MCP_CLIENTS,
  TOONSTUDIO_MCP_RESOURCES,
  TOONSTUDIO_MCP_TOOLS,
  buildClientMcpConfig,
  runLongStrokeEnduranceBenchmark,
} from "./toonstudio-llm-mcp-cli.mjs";

describe("toonstudio universal LLM CLI/MCP bridge & long-stroke endurance benchmark", () => {
  it("Gemini·Claude·GPT/Codex·Meta Llama·Mistral/Muse·Cursor·Windsurf·OpenRouter·Ollama 9대 클라이언트 설정을 생성한다", () => {
    assert.equal(SUPPORTED_LLM_MCP_CLIENTS.length, 9);
    for (const client of SUPPORTED_LLM_MCP_CLIENTS) {
      const cfg = buildClientMcpConfig(client.id);
      assert.equal(cfg.client.id, client.id);
      assert.ok(cfg.mcpServers.toonstudio);
      assert.equal(cfg.tools.length, TOONSTUDIO_MCP_TOOLS.length);
      assert.equal(cfg.resources.length, TOONSTUDIO_MCP_RESOURCES.length);
    }
    assert.throws(() => buildClientMcpConfig("unknown-client"), /Unsupported LLM\/MCP client/);
  });

  it("10,000획 장시간 드로잉 소크 벤치마크가 16.6ms 프레임 예산과 LRU·Undo 상한을 유지한다", () => {
    const result = runLongStrokeEnduranceBenchmark({ strokes: 10_000, pointsPerStroke: 32 });
    assert.equal(result.strokes, 10_000);
    assert.equal(result.passed, true);
    assert.ok(result.p95Ms <= 16.6, `expected p95 <= 16.6ms, got ${result.p95Ms}`);
    assert.ok(result.residentTileCount <= result.maxResidentTiles);
    assert.equal(result.inMemoryUndoDepth, 20);
    assert.equal(result.spilledUndoToOpfs, 9_980);
  });
});
