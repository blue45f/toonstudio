import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

  it("NaN·비정상 문자열·무한대 입력에도 크래시 없이 기본값(10,000획·32포인트)으로 안전 폴백한다", () => {
    const nanResult = runLongStrokeEnduranceBenchmark({
      strokes: Number.NaN,
      pointsPerStroke: Number.NaN,
    });
    assert.equal(nanResult.strokes, 10_000);
    assert.equal(nanResult.pointsPerStroke, 32);
    assert.equal(nanResult.passed, true);

    const invalidStrResult = runLongStrokeEnduranceBenchmark({
      strokes: "abc",
      pointsPerStroke: "xyz",
    });
    assert.equal(invalidStrResult.strokes, 10_000);
    assert.equal(invalidStrResult.pointsPerStroke, 32);
    assert.equal(invalidStrResult.passed, true);

    const infResult = runLongStrokeEnduranceBenchmark({
      strokes: Number.POSITIVE_INFINITY,
      pointsPerStroke: "",
    });
    assert.equal(infResult.strokes, 10_000);
    assert.equal(infResult.pointsPerStroke, 32);
    assert.equal(infResult.passed, true);

    // 상대 경로 CLI 실행 + `--strokes abc` 방어 종단 검증
    const stdout = execFileSync(
      process.execPath,
      ["scripts/toonstudio-llm-mcp-cli.mjs", "--bench-stroke", "--strokes", "abc"],
      { encoding: "utf8" },
    );
    const cliReport = JSON.parse(stdout);
    assert.equal(cliReport.strokes, 10_000);
    assert.equal(cliReport.passed, true);
  });
});
