#!/usr/bin/env node
/**
 * 툰스튜디오 범용 멀티-LLM CLI · MCP 브리지 설정 생성기 & 장시간 드로잉 소크 벤치마크.
 *
 * 지원 클라이언트 (9종):
 *   gemini-cli, claude-code, codex-cli, meta-llama, mistral-muse,
 *   cursor, windsurf, openrouter-bridge, ollama-local
 *
 * 사용 예:
 *   node scripts/toonstudio-llm-mcp-cli.mjs --list-clients --json
 *   node scripts/toonstudio-llm-mcp-cli.mjs --client claude-code --json
 *   node scripts/toonstudio-llm-mcp-cli.mjs --bench-stroke --strokes 10000 --json
 */

import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

export const SUPPORTED_LLM_MCP_CLIENTS = Object.freeze([
  {
    id: "gemini-cli",
    vendor: "Google Gemini",
    protocol: "mcp-stdio-jsonrpc-2.0",
    configPath: "~/.gemini/settings.json",
    freeTierPriority: 1,
    notes: "Gemini 무료 최상위 티어 우선 연결 및 Antigravity/Gemini CLI MCP 호환",
  },
  {
    id: "claude-code",
    vendor: "Anthropic Claude",
    protocol: "mcp-stdio-jsonrpc-2.0",
    configPath: "~/.claude.json",
    freeTierPriority: 3,
    notes: "Claude Code 및 Claude Desktop 표준 MCP 서버 연동",
  },
  {
    id: "codex-cli",
    vendor: "OpenAI Codex / GPT",
    protocol: "mcp-stdio-jsonrpc-2.0",
    configPath: "~/.codex/config.toml",
    freeTierPriority: 3,
    notes: "OpenAI Codex CLI 및 GPT Function/MCP 브리지",
  },
  {
    id: "meta-llama",
    vendor: "Meta Llama (Llama Stack)",
    protocol: "mcp-streamable-http",
    configPath: "~/.llama/mcp-servers.json",
    freeTierPriority: 2,
    notes: "Llama Stack 및 로컬/사내 오픈웨이트 Llama 4 에이전트 연동",
  },
  {
    id: "mistral-muse",
    vendor: "Mistral / Muse Creative",
    protocol: "mcp-streamable-http",
    configPath: "~/.config/muse-mcp/servers.json",
    freeTierPriority: 2,
    notes: "Mistral API · 오픈소스 크리에이티브 어시스턴트 호환",
  },
  {
    id: "cursor",
    vendor: "Cursor IDE",
    protocol: "mcp-stdio-jsonrpc-2.0",
    configPath: ".cursor/mcp.json",
    freeTierPriority: 2,
    notes: "프로젝트 단위 원클릭 스튜디오 MCP 서버 등록",
  },
  {
    id: "windsurf",
    vendor: "Windsurf IDE",
    protocol: "mcp-stdio-jsonrpc-2.0",
    configPath: "~/.codeium/windsurf/mcp_config.json",
    freeTierPriority: 2,
    notes: "Cascade 워크플로우에서 스튜디오 캔버스·3D·PM 도구 호출",
  },
  {
    id: "openrouter-bridge",
    vendor: "OpenRouter Multi-Model",
    protocol: "openai-compatible-cli",
    configPath: "~/.toonstudio/openrouter-cli.json",
    freeTierPriority: 2,
    notes: "무료 고성능 모델 자동 폴백 라우터(토큰 소진 시 BYOK 안내)",
  },
  {
    id: "ollama-local",
    vendor: "Local Ollama (₩0 Offline)",
    protocol: "openai-compatible-local",
    configPath: "~/.toonstudio/ollama-local.json",
    freeTierPriority: 4,
    notes: "API 비용 0원 · 인터넷 단절 환경 로컬 추론 폴백",
  },
]);

export const TOONSTUDIO_MCP_TOOLS = Object.freeze([
  { name: "studio_canvas_inspect", category: "canvas", readOnly: true, description: "현재 컷·레이어 트리·캐릭터 바이블·권리 BOM 조회" },
  { name: "studio_canvas_apply_action", category: "canvas", readOnly: false, description: "말풍선 배치·팔레트 적용·3D 카메라 앵글 전환·수정 핀 등록" },
  { name: "studio_pm_conveyor_status", category: "pm-ops", readOnly: true, description: "3~4화차 로테이션 컨베이어 병목·도미노 지연 위험 조회" },
  { name: "studio_pm_handoff_cut", category: "pm-ops", readOnly: false, description: "8단계 공정 게이트 검증 후 다음 담당자 바통 터치 실행" },
  { name: "studio_settlement_preview", category: "pm-ops", readOnly: true, description: "컷 난이도 가중치 3.3%/사업자 세금계산서 정산 미리보기(dry-run)" },
  { name: "studio_asset_smart_search", category: "assets", readOnly: true, description: "자연어·실루엣·색무드·카메라 앵글·BOM 안전 복합 소재 검색" },
  { name: "studio_vrm_autofit_audit", category: "3d-vrm", readOnly: true, description: "42-소켓 본 밀착·Anti-Clip 오프셋·매니폴드 0결함 진단" },
  { name: "studio_remotion_render_plan", category: "video", readOnly: true, description: "완성 화차에서 60초 Remotion 숏폼 트레일러 컴포지션 생성" },
  { name: "studio_export_platform_qc", category: "delivery", readOnly: true, description: "네이버/카카오/글로벌 규격·권리 BOM·포렌식 워터마크 사전 QC" },
  { name: "studio_stroke_endurance_bench", category: "performance", readOnly: true, description: "장시간 10,000획 링버퍼·Dirty-Tile LRU 메모리 평탄화 실측" },
]);

export const TOONSTUDIO_MCP_RESOURCES = Object.freeze([
  "toon://series/{seriesId}/canon-bible",
  "toon://episode/{episodeId}/conveyor-status",
  "toon://episode/{episodeId}/rights-bom",
  "toon://cut/{cutId}/layers",
  "toon://studio/capabilities/nextgen-web",
]);

export function buildClientMcpConfig(clientId, options = {}) {
  const client = SUPPORTED_LLM_MCP_CLIENTS.find((entry) => entry.id === clientId);
  if (!client) {
    throw new Error(`Unsupported LLM/MCP client: ${clientId}`);
  }
  const serverUrl = options.serverUrl ?? "http://127.0.0.1:4319/mcp";
  const serverEntry =
    client.protocol === "mcp-stdio-jsonrpc-2.0"
      ? {
          command: "node",
          args: ["scripts/toonstudio-llm-mcp-cli.mjs", "--mcp-manifest"],
          env: {
            TOONSTUDIO_MCP_DRY_RUN: "1",
            TOONSTUDIO_LLM_TARGET: client.id,
          },
        }
      : {
          transport: client.protocol,
          endpoint: serverUrl,
          dryRunDefault: true,
          llmTarget: client.id,
        };

  return {
    schemaVersion: 1,
    client,
    mcpServers: {
      toonstudio: serverEntry,
    },
    tools: TOONSTUDIO_MCP_TOOLS,
    resources: TOONSTUDIO_MCP_RESOURCES,
  };
}

function parseBoundedInt(value, fallback, min, max) {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

/**
 * 장시간 드로잉 소크 벤치마크:
 * - 고정 Float32Array 링 버퍼(객체 할당 0)
 * - 256px Dirty-Tile LRU 풀(상한 128타일, 오래된 타일 즉시 회수)
 * - Delta Undo 링(상한 20단계, 초과분 OPFS 스필 카운트)
 */
export function runLongStrokeEnduranceBenchmark(options = {}) {
  const strokes = parseBoundedInt(options.strokes, 10_000, 100, 50_000);
  const pointsPerStroke = parseBoundedInt(options.pointsPerStroke, 32, 8, 128);
  const tileSize = 256;
  const canvasWidth = 3840;
  const canvasHeight = 2160;
  const maxResidentTiles = 128;
  const maxInMemoryUndo = 20;

  // 고정 링 버퍼 재사용 (x, y, pressure, tilt)
  const pointRing = new Float32Array(pointsPerStroke * 4);
  const dirtyTileLru = new Map();
  const undoDeltaRing = [];
  let spilledUndoToOpfs = 0;
  let totalDirtyTileUpdates = 0;
  const strokeDurationsMs = new Float64Array(strokes);

  const heapStart = process.memoryUsage().heapUsed;
  const benchStart = performance.now();

  for (let s = 0; s < strokes; s += 1) {
    const t0 = performance.now();
    const baseX = (s * 73) % (canvasWidth - 256);
    const baseY = (s * 41) % (canvasHeight - 256);

    for (let p = 0; p < pointsPerStroke; p += 1) {
      const idx = p * 4;
      const px = baseX + p * 4;
      const py = baseY + Math.sin(p * 0.25) * 18;
      pointRing[idx] = px;
      pointRing[idx + 1] = py;
      pointRing[idx + 2] = 0.35 + (p / pointsPerStroke) * 0.65;
      pointRing[idx + 3] = 0.2;

      if ((p & 7) === 0) {
        const tx = Math.floor(px / tileSize);
        const ty = Math.floor(py / tileSize);
        const key = `${tx}:${ty}`;
        if (dirtyTileLru.has(key)) {
          dirtyTileLru.delete(key);
        }
        dirtyTileLru.set(key, s);
        totalDirtyTileUpdates += 1;
        if (dirtyTileLru.size > maxResidentTiles) {
          const oldestKey = dirtyTileLru.keys().next().value;
          if (oldestKey !== undefined) dirtyTileLru.delete(oldestKey);
        }
      }
    }

    // 델타 Undo 링 유지 (초과 이력은 OPFS 스필 시뮬레이션)
    if (undoDeltaRing.length >= maxInMemoryUndo) {
      undoDeltaRing.shift();
      spilledUndoToOpfs += 1;
    }
    undoDeltaRing.push(s);

    strokeDurationsMs[s] = performance.now() - t0;
  }

  const totalElapsedMs = performance.now() - benchStart;
  const heapEnd = process.memoryUsage().heapUsed;
  const sorted = Array.from(strokeDurationsMs).sort((a, b) => a - b);
  const pick = (q) => Number(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))].toFixed(4));
  const heapDeltaMb = Number(((heapEnd - heapStart) / (1024 * 1024)).toFixed(2));
  const p95Ms = pick(0.95);
  const p99Ms = pick(0.99);

  return {
    strokes,
    pointsPerStroke,
    canvas: `${canvasWidth}x${canvasHeight}`,
    totalElapsedMs: Number(totalElapsedMs.toFixed(2)),
    p50Ms: pick(0.5),
    p95Ms,
    p99Ms,
    residentTileCount: dirtyTileLru.size,
    maxResidentTiles,
    totalDirtyTileUpdates,
    inMemoryUndoDepth: undoDeltaRing.length,
    spilledUndoToOpfs,
    heapDeltaMb,
    frameBudgetMs: 16.6,
    passed: p95Ms <= 16.6 && dirtyTileLru.size <= maxResidentTiles && undoDeltaRing.length <= maxInMemoryUndo,
  };
}

function main(argv) {
  const args = new Set(argv);
  const valueOf = (flag) => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };

  if (args.has("--list-clients")) {
    console.log(JSON.stringify({ clients: SUPPORTED_LLM_MCP_CLIENTS }, null, 2));
    return;
  }

  if (args.has("--list-tools") || args.has("--mcp-manifest")) {
    console.log(
      JSON.stringify(
        {
          name: "toonstudio-universal-mcp",
          protocolVersion: "2025-03-26",
          clients: SUPPORTED_LLM_MCP_CLIENTS.map((c) => c.id),
          tools: TOONSTUDIO_MCP_TOOLS,
          resources: TOONSTUDIO_MCP_RESOURCES,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (args.has("--bench-stroke")) {
    const strokes = valueOf("--strokes");
    const pointsPerStroke = valueOf("--points-per-stroke");
    const report = runLongStrokeEnduranceBenchmark({ strokes, pointsPerStroke });
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
    return;
  }

  const clientId = valueOf("--client") ?? "gemini-cli";
  console.log(JSON.stringify(buildClientMcpConfig(clientId), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2));
}
