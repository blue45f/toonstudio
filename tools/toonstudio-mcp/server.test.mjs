import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { createToonStudioMcpEngine } from "./server.mjs";
import { runToonStudioCli } from "./cli.mjs";
import { containsSensitiveSecret } from "./tools-ecosystem-v2.mjs";

const MCP_DIR = dirname(fileURLToPath(import.meta.url));

const NEW_12_TOOL_NAMES = [
  "toonstudio_preflight_6platforms",
  "toonstudio_hyper_automate_episode",
  "toonstudio_hiatus_sos_match",
  "toonstudio_global_plaza_quote",
  "toonstudio_osmu_adapt_ip",
  "toonstudio_ai_qa_compliance_scan",
  "toonstudio_c2pa_provenance_pack",
  "toonstudio_bep_crossborder_tax",
  "toonstudio_brush_100_audit",
  "toonstudio_vrm_3d_fit_audit",
  "toonstudio_plugin_sandbox_verify",
  "toonstudio_search_materials",
];

function callTool(engine, id, name, args = {}) {
  const res = engine.handleJsonRpcRequest({
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: args },
  });
  assert.equal(res.error, undefined, `unexpected error for ${name}: ${JSON.stringify(res.error)}`);
  return res.result.structuredContent;
}

test("1. MCP 서버 initialize, ping 및 44종+ tools/list 정본 등록을 검증한다", () => {
  const engine = createToonStudioMcpEngine();

  const initRes = engine.handleJsonRpcRequest({ jsonrpc: "2.0", id: 1, method: "initialize" });
  assert.equal(initRes.result.serverInfo.name, "toonstudio-mcp");
  assert.equal(initRes.result.serverInfo.version, "2.4.0");
  assert.deepEqual(Object.keys(initRes.result.capabilities).sort(), ["prompts", "resources", "tools"]);

  const pingRes = engine.handleJsonRpcRequest({ jsonrpc: "2.0", id: 2, method: "ping" });
  assert.deepEqual(pingRes.result, {});

  const notifRes = engine.handleJsonRpcRequest({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(notifRes, null);

  const listRes = engine.handleJsonRpcRequest({ jsonrpc: "2.0", id: 3, method: "tools/list" });
  const tools = listRes.result.tools;
  assert.ok(tools.length >= 44, `expected >= 44 tools, got ${tools.length}`);

  const names = tools.map((t) => t.name);
  assert.equal(new Set(names).size, names.length, "MCP tool names must be unique");
  for (const requiredName of NEW_12_TOOL_NAMES) {
    assert.ok(names.includes(requiredName), `missing Wave 12-24 tool: ${requiredName}`);
  }
  for (const tool of tools) {
    assert.equal(tool.inputSchema?.type, "object", `tool ${tool.name} needs object inputSchema`);
    assert.ok(tool.description.length > 0, `tool ${tool.name} needs description`);
  }
});

test("2. JSON-RPC 2.0 resources/list, resources/read 및 시크릿 비노출을 검증한다", () => {
  const fakeKey = ["sk", "resource", "SecretShouldNeverLeak98765"].join("-");
  const engine = createToonStudioMcpEngine({ env: { OPENAI_API_KEY: fakeKey } });

  const listRes = engine.handleJsonRpcRequest({ jsonrpc: "2.0", id: 1, method: "resources/list" });
  assert.ok(listRes.result.resources.length >= 4);

  for (const resource of listRes.result.resources) {
    const readRes = engine.handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "resources/read",
      params: { uri: resource.uri },
    });
    assert.equal(readRes.error, undefined);
    const text = readRes.result.contents[0].text;
    assert.equal(text.includes(fakeKey), false);
    assert.doesNotThrow(() => JSON.parse(text));
  }

  const badRead = engine.handleJsonRpcRequest({
    jsonrpc: "2.0",
    id: 3,
    method: "resources/read",
    params: { uri: "toonstudio://unknown/uri" },
  });
  assert.equal(badRead.error.code, -32602);
});

test("3. JSON-RPC 2.0 prompts/list 및 prompts/get 워크플로 템플릿을 검증한다", () => {
  const engine = createToonStudioMcpEngine();
  const listRes = engine.handleJsonRpcRequest({ jsonrpc: "2.0", id: 1, method: "prompts/list" });
  assert.ok(listRes.result.prompts.length >= 4);

  for (const prompt of listRes.result.prompts) {
    const getRes = engine.handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "prompts/get",
      params: { name: prompt.name, arguments: { workTitle: "서울 옥상 헌터", idea: "각성 1화", missingRole: "lineart" } },
    });
    assert.equal(getRes.error, undefined);
    assert.ok(Array.isArray(getRes.result.messages) && getRes.result.messages.length >= 1);
  }

  const unknownPrompt = engine.handleJsonRpcRequest({
    jsonrpc: "2.0",
    id: 3,
    method: "prompts/get",
    params: { name: "non-existent-prompt" },
  });
  assert.equal(unknownPrompt.error.code, -32602);
});

test("4. 기존 캔버스·RBAC 핵심 MCP 툴과 권한 경계가 정상 동작한다", () => {
  const engine = createToonStudioMcpEngine();
  const strokeRes = callTool(engine, 1, "studio.canvas.draw_stroke", {
    brush: "g-pen",
    points: [[10, 20], [200, 300]],
  });
  assert.equal(strokeRes.ok, true);
  assert.equal(strokeRes.totalStrokes, 1);

  const assignRes = callTool(engine, 2, "studio.rbac.assign_role", {
    actorUserId: "u-owner",
    targetUserId: "u-guest",
    roleId: "line_assistant",
  });
  assert.equal(assignRes.ok, true);

  const deniedAssign = callTool(engine, 3, "studio.rbac.assign_role", {
    actorUserId: "u-line",
    targetUserId: "u-guest",
    roleId: "studio_owner",
  });
  assert.equal(deniedAssign.ok, false);
});

test("5. 기존 포토샵 프로 4종 · 3D/VRoid/Blender/SketchUp 4종 MCP 툴이 동작한다", () => {
  const engine = createToonStudioMcpEngine();
  assert.equal(callTool(engine, 10, "studio.photoshop.apply_layer_fx", { effect: "outer-glow", opacityPct: 45 }).ok, true);
  assert.equal(callTool(engine, 11, "studio.photoshop.apply_camera_raw", { exposure: 0.25 }).ok, true);
  assert.equal(callTool(engine, 12, "studio.photoshop.frequency_separate", { radiusPx: 6, bitDepth: 16 }).ok, true);
  assert.equal(callTool(engine, 13, "studio.photoshop.run_action_batch", { actionName: "finish", cutIds: ["c1", "c2"] }).batchRun.processedCount, 2);
  assert.equal(callTool(engine, 14, "studio.bg3d.compose_scene", { sceneName: "옥상", lensMm: 35 }).scene.lighting.groundPlaneY, 0);
  assert.equal(callTool(engine, 15, "studio.vrm.apply_pose_expression", { avatarId: "vrm-1", expressions: { happy: 0.5 } }).avatar.expressions.happy, 0.5);
  assert.equal(callTool(engine, 16, "studio.blender.compile_npr_recipe", { celBands: 3 }).recipe.geometryGates.floorGroundZ, 0);
  assert.equal(callTool(engine, 17, "studio.sketchup.toggle_dynamic_component", { componentId: "door-1", attribute: "open_deg", value: 90 }).state.open_deg, 90);
});

test("6. 기존 분업 OS 4종 · 무과금 AI & 현지화 5종 MCP 툴이 시크릿 미노출로 동작한다", () => {
  const fakeKey = ["sk", "never", "LeakThisSecretValue123456"].join("-");
  const engine = createToonStudioMcpEngine({
    env: {
      OPENAI_API_KEY: fakeKey,
      OPENAI_MODEL: "gpt-4o-mini",
      GEMINI_API_KEY: ["AIza", "NeverLeakGemini1234567890123456"].join(""),
      GEMINI_MODEL: "gemini-2.5-pro",
    },
  });

  assert.equal(callTool(engine, 20, "studio.division.split_episode_cuts", { totalCuts: 24 }).packets.length, 6);
  assert.equal(callTool(engine, 21, "studio.division.run_ad_qa", { minWidthPx: 800 }).report.verdict, "pass");
  assert.equal(callTool(engine, 22, "studio.division.lock_asset", { assetId: "cut-07", userId: "u-line", action: "acquire" }).ok, true);
  assert.equal(callTool(engine, 23, "studio.division.lock_asset", { assetId: "cut-07", userId: "u-color", action: "acquire" }).ok, false);
  assert.ok(callTool(engine, 24, "studio.division.estimate_royalty", { grossRevenueKrw: 5_000_000, cuts: 50 }).estimate.totalDistributedKrw > 0);

  assert.equal(callTool(engine, 25, "studio.ai.list_modes").totalModes, 14);
  const quota = callTool(engine, 26, "studio.ai.free_quota_status");
  assert.equal(quota.paidBillingBlocked, true);
  assert.equal(JSON.stringify(quota).includes(fakeKey), false);

  const assist = callTool(engine, 27, "studio.ai.run_creative_assist", {
    mode: "character-bible-forge",
    inputText: `주인공 설정 ${fakeKey}`,
  });
  assert.equal(assist.run.inputPreview.includes(fakeKey), false);
  assert.equal(callTool(engine, 28, "studio.localization.translate_episode", { targetLocales: ["en", "ja"] }).ok, true);
  assert.equal(callTool(engine, 29, "studio.export.preflight_check", { platform: "naver-webtoon" }).verdict, "ready");
});

test("7. toonstudio_preflight_6platforms가 6대 플랫폼 규격·Rights BOM·미지원 입력을 점검한다", () => {
  const engine = createToonStudioMcpEngine();
  const allRes = callTool(engine, 1, "toonstudio_preflight_6platforms", {
    platform: "all",
    widthPx: 800,
    heightPx: 25_000,
    totalSizeMb: 12,
    format: "jpg",
    colorProfile: "sRGB",
    rightsBomClean: true,
  });
  assert.equal(allRes.ok, true);
  assert.equal(allRes.summary.checkedPlatforms, 6);
  const naver = allRes.reports.find((r) => r.platformId === "naver-webtoon");
  const globalWebtoon = allRes.reports.find((r) => r.platformId === "webtoon-global");
  assert.equal(naver.verdict, "ready");
  assert.equal(naver.estimatedSliceCount, 2);
  assert.equal(globalWebtoon.verdict, "ready");

  const blocked = callTool(engine, 2, "toonstudio_preflight_6platforms", {
    platform: "piccoma",
    widthPx: 720,
    colorProfile: "CMYK",
    rightsBomClean: false,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reports[0].verdict, "blocked");
  assert.equal(blocked.reports[0].writingDirection, "vertical-jp");
});

test("8. toonstudio_hyper_automate_episode가 0~99% 클램프·보호 공정·빈 입력 거부·시크릿 마스킹을 검증한다", () => {
  const engine = createToonStudioMcpEngine();
  const emptyRes = callTool(engine, 1, "toonstudio_hyper_automate_episode", { idea: "   " });
  assert.equal(emptyRes.ok, false);

  const fakeSecret = ["sk", "hyper", "NeverLeakIdeaSecret12345"].join("-");
  const res = callTool(engine, 2, "toonstudio_hyper_automate_episode", {
    idea: `서울 옥상 각성 헌터 ${fakeSecret}`,
    mode: "one-click-99",
    targetCuts: 60,
    stageAutonomy: { story: 150, lineart: 40 },
    protectedStages: ["lettering"],
  });
  assert.equal(res.ok, true);
  assert.equal(res.plan.stageAutonomy.story, 99);
  assert.equal(res.plan.stageAutonomy.lineart, 40);
  assert.equal(res.plan.stageAutonomy.lettering, 0);
  assert.equal(res.plan.manualControlOpen, true);
  assert.equal(res.plan.ideaSummary.includes(fakeSecret), false);
});

test("9. toonstudio_hiatus_sos_match가 10분 긴급 대타 랭킹과 작화 인계 키트를 생성한다", () => {
  const engine = createToonStudioMcpEngine();
  const res = callTool(engine, 1, "toonstudio_hiatus_sos_match", {
    missingRole: "lineart",
    hoursUntilDeadline: 5,
    remainingCuts: 22,
    genre: "modern-fantasy",
  });
  assert.equal(res.ok, true);
  assert.equal(res.riskLevel, "critical");
  assert.equal(res.slaResponseMinutes, 10);
  assert.ok(res.rankedCandidates[0].matchScore >= res.rankedCandidates[1].matchScore);
  assert.ok(res.rankedCandidates[0].etaMinutes <= 10);
  assert.equal(res.handoffKit.cutRange[1], 22);
});

test("10. toonstudio_global_plaza_quote가 6통화 단가·KST 시차 겹침·3단계 에스크로 견적을 산출한다", () => {
  const engine = createToonStudioMcpEngine();
  const res = callTool(engine, 1, "toonstudio_global_plaza_quote", {
    partnerRegion: "VN",
    ratePerCutKrw: 18_000,
    cutCount: 50,
    escrowFeeRatePct: 3.5,
  });
  assert.equal(res.ok, true);
  assert.equal(res.quote.targetCurrency, "VND");
  assert.deepEqual(Object.keys(res.quote.sixCurrencyQuotes).sort(), ["IDR", "JPY", "KRW", "THB", "USD", "VND"]);
  assert.equal(res.quote.timezoneOverlap.overlapHours, 7);
  assert.equal(res.quote.milestones.reduce((sum, m) => sum + m.ratioPct, 0), 100);
});

test("11. toonstudio_osmu_adapt_ip가 웹소설·웹드라마 OTT 피치·24fps 애니 X-Sheet를 생성한다", () => {
  const engine = createToonStudioMcpEngine();
  const res = callTool(engine, 1, "toonstudio_osmu_adapt_ip", {
    targetFormat: "all",
    workTitle: "별빛 헌터",
    episodeNumber: 3,
    cutCount: 60,
    fps: 24,
  });
  assert.equal(res.ok, true);
  assert.ok(res.adaptation.webnovel.estimatedWordCountKo > 0);
  assert.equal(res.adaptation.webdramaPitch.seasonEpisodes, 12);
  assert.equal(res.adaptation.animationXSheet.fps, 24);
  assert.equal(res.adaptation.animationXSheet.totalFrames, res.adaptation.animationXSheet.durationSeconds * 24);
});

test("12. toonstudio_ai_qa_compliance_scan이 심의·말투 혼용·180도 시선·라이선스 차단을 탐지한다", () => {
  const engine = createToonStudioMcpEngine();
  const res = callTool(engine, 1, "toonstudio_ai_qa_compliance_scan", {
    regions: ["KR", "JP", "US"],
    targetAgeRating: "all",
    dialogues: [
      { character: "주인공", line: "안녕하세요." },
      { character: "주인공", line: "거기 멈춰!" },
    ],
    cameraAnglesDeg: [20, 235],
    assets: [{ id: "prop-01", license: "cc-by-nc", commercialAllowed: false }],
  });
  assert.equal(res.ok, false);
  assert.equal(res.scan.verdict, "blocked");
  const gates = res.scan.findings.map((f) => f.gate);
  assert.ok(gates.includes("speech-consistency"));
  assert.ok(gates.includes("sightline-180"));
  assert.ok(gates.includes("rights-license"));
});

test("13. toonstudio_c2pa_provenance_pack이 C2PA 2.1 SHA-256 해시 체인과 타임랩스를 생성한다", () => {
  const engine = createToonStudioMcpEngine();
  const res = callTool(engine, 1, "toonstudio_c2pa_provenance_pack", {
    workTitle: "옥상 연대기",
    authorName: "김작가",
    episodeNumber: 7,
    humanStrokeCount: 180,
    aiAssistEventCount: 20,
  });
  assert.equal(res.ok, true);
  assert.equal(res.manifest.specVersion, "c2pa-2.1");
  assert.match(res.manifest.genesisHash, /^[0-9a-f]{64}$/u);
  assert.match(res.manifest.finalChainHash, /^[0-9a-f]{64}$/u);
  assert.equal(res.manifest.humanAuthoredRatio, 0.9);
  assert.equal(res.manifest.timelapseCheckpoints.length, 5);
  assert.equal(res.manifest.timelapseCheckpoints[4].checkpointHash, res.manifest.finalChainHash);
});

test("14. toonstudio_bep_crossborder_tax가 회차별 BEP 및 7개국 원천징수 정산을 계산한다", () => {
  const engine = createToonStudioMcpEngine();
  const res = callTool(engine, 1, "toonstudio_bep_crossborder_tax", {
    plannedEpisodes: 50,
    cutsPerEpisode: 60,
    costPerCutKrw: 40_000,
    fixedOverheadPerEpisodeKrw: 600_000,
    initialSetupCostKrw: 6_000_000,
    mgPerEpisodeKrw: 2_500_000,
    rsRatePct: 50,
    grossRevenuePerEpisodeKrw: 8_000_000,
    crossBorderLines: [
      { jurisdiction: "KR", grossKrw: 1_000_000, treatySubmitted: true },
      { jurisdiction: "US", grossKrw: 1_000_000, treatySubmitted: false },
      { jurisdiction: "JP", grossKrw: 1_000_000, treatySubmitted: true },
      { jurisdiction: "VN", grossKrw: 1_000_000, treatySubmitted: true },
      { jurisdiction: "TH", grossKrw: 1_000_000, treatySubmitted: true },
      { jurisdiction: "ID", grossKrw: 1_000_000, treatySubmitted: true },
      { jurisdiction: "PH", grossKrw: 1_000_000, treatySubmitted: false },
    ],
  });
  assert.equal(res.ok, true);
  assert.equal(res.report.supportedJurisdictions.length, 7);
  assert.equal(res.report.bep.costPerEpisodeKrw, 3_000_000);
  assert.equal(res.report.bep.bepEpisode, 6);
  const usLine = res.report.crossBorderTax.lines.find((l) => l.jurisdiction === "US");
  assert.equal(usLine.withholdingRatePct, 30);
  assert.equal(res.report.crossBorderTax.lines.length, 7);
});

test("15. 브러시 100점 점검 · 3D VRM 밀착 점검 · 통합 소재 CC0 검색 툴이 정상 동작한다", () => {
  const engine = createToonStudioMcpEngine();
  const brush = callTool(engine, 1, "toonstudio_brush_100_audit", { targetBenchmark: "both", strictMinScore: 90 });
  assert.equal(brush.ok, true);
  assert.equal(brush.audit.verdict, "pass");
  assert.ok(brush.audit.averageScore >= 94);

  const vrmOk = callTool(engine, 2, "toonstudio_vrm_3d_fit_audit", {
    avatarId: "vrm-hero",
    hairGapMm: 1.0,
    hairPenetrationMm: 0.0,
    handPose: "sword-grip",
    groundY: 0,
    nonManifoldEdges: 0,
  });
  assert.equal(vrmOk.audit.verdict, "pass");
  assert.equal(vrmOk.audit.fitScore, 100);

  const vrmBad = callTool(engine, 3, "toonstudio_vrm_3d_fit_audit", {
    hairGapMm: 5.5,
    groundY: 0.15,
    nonManifoldEdges: 4,
  });
  assert.equal(vrmBad.ok, false);
  assert.equal(vrmBad.audit.verdict, "blocked");

  const materials = callTool(engine, 4, "toonstudio_search_materials", {
    query: "옥상",
    category: "bg3d",
    licenseFilter: "cc0",
  });
  assert.equal(materials.ok, true);
  assert.equal(materials.totalMatched, 1);
  assert.equal(materials.items[0].license, "cc0");
});

test("VRM 밀착 점검은 제공된 측정값만 판정하고 누락된 검사를 통과시키지 않는다", () => {
  const engine = createToonStudioMcpEngine();
  const auditFit = (args) => callTool(engine, 1, "toonstudio_vrm_3d_fit_audit", args);
  const measured = { hairGapMm: 2.5, hairPenetrationMm: 0.5, handPose: "relaxed", groundY: -0.001, nonManifoldEdges: 0 };
  const socket = { socket: "hat", itemId: "cap", offsetMm: 3, rotationDriftDeg: 5 };
  const empty = auditFit({ avatarId: "hero" });
  assert.equal(empty.ok, false);
  assert.equal(empty.audit.verdict, "insufficient-data");
  assert.equal(empty.audit.fitScore, null);
  assert.deepEqual(empty.audit.checks, []);
  assert.equal(empty.audit.missingMeasurements.length, 4);

  const hairOnly = auditFit({ hairGapMm: 0, hairPenetrationMm: 0 }).audit;
  assert.equal(hairOnly.verdict, "insufficient-data");
  assert.deepEqual(hairOnly.checks.map((row) => row.id), ["hair-scalp-fit"]);
  assert.equal(auditFit({ ...measured, hairGapMm: -1 }).audit.verdict, "insufficient-data");
  assert.equal(auditFit({ ...measured, groundY: null }).audit.fitScore, null);
  assert.equal(auditFit({ ...measured, equippedSockets: [null] }).audit.verdict, "insufficient-data");
  const partialSocket = auditFit({ ...measured, equippedSockets: [{ socket: "hat", offsetMm: 0 }] }).audit;
  assert.equal(partialSocket.fitScore, null);
  assert.deepEqual(partialSocket.missingMeasurements, ["socket:hat"]);

  assert.equal(auditFit({ nonManifoldEdges: 2 }).audit.verdict, "blocked");
  assert.equal(auditFit({ ...measured, equippedSockets: [{ ...socket, offsetMm: 3.1 }] }).audit.verdict, "needs-refit");
  const complete = auditFit({ ...measured, equippedSockets: [socket] }).audit;
  assert.equal(complete.verdict, "pass");
  assert.equal(complete.fitScore, 100);
  assert.deepEqual(complete.missingMeasurements, []);
  assert.equal(auditFit(measured).audit.checks.some((row) => row.id.startsWith("socket:")), false);
});

test("16. toonstudio_plugin_sandbox_verify가 승인·검토필요·위험조합 차단·시크릿 차단을 판정한다", () => {
  const engine = createToonStudioMcpEngine();
  const approved = callTool(engine, 1, "toonstudio_plugin_sandbox_verify", {
    manifest: {
      id: "studio.safe-brush-pack",
      name: "Safe Brush Pack",
      authorName: "ToonStudio",
      version: "1.2.0",
      sdkApiVersion: "^2.4.0",
      entryModule: "./index.mjs",
      requestedScopes: ["canvas.read", "asset.insert"],
    },
  });
  assert.equal(approved.verdict, "approved");
  assert.equal(approved.valid, true);

  const exfilSecret = ["ghp", "MaliciousPluginSecret999999999"].join("_");
  const blocked = callTool(engine, 2, "toonstudio_plugin_sandbox_verify", {
    manifest: {
      id: "evil.exfil",
      name: "Exfil",
      authorName: "Unknown",
      version: "1.0.0",
      sdkApiVersion: "^2.4.0",
      entryModule: "../outside.mjs",
      requestedScopes: ["canvas.read", "network.external", "auth.session"],
      leaked: exfilSecret,
    },
  });
  assert.equal(blocked.verdict, "blocked");
  assert.equal(blocked.valid, false);
  assert.equal(JSON.stringify(blocked).includes(exfilSecret), false);
  const codes = blocked.violations.map((v) => v.code);
  assert.ok(codes.includes("PLAINTEXT_SECRET_DETECTED"));
  assert.ok(codes.includes("FORBIDDEN_SCOPE"));
  assert.ok(codes.includes("EXFILTRATION_CANVAS_NET"));
});

test("17. CLI doctor, quota, ai-modes, batch가 44툴·상태 영속성·시크릿 무노출을 보장한다", () => {
  const dir = mkdtempSync(join(tmpdir(), "toonstudio-mcp-cli-"));
  const stateFile = join(dir, "session.json");
  const fakeKey = ["ghp", "DoNotPrintCliSecret1234567890"].join("_");
  try {
    const doctorRes = runToonStudioCli(["doctor", "--state-file", stateFile], {
      env: { STUDIO_AI_FREE_GITHUB_MODELS_API_KEY: fakeKey },
    });
    assert.equal(doctorRes.exitCode, 0);
    assert.equal(doctorRes.output.includes(fakeKey), false);
    const report = JSON.parse(doctorRes.output);
    assert.equal(report.ok, true);
    assert.ok(report.totalMcpTools >= 44);
    assert.equal(report.toolDomainCounts["ecosystem-v2"], 12);
    assert.equal(report.localStack.pluginManifestVerdict, "approved");
    assert.equal(report.buildArtifacts.officialSkillPresent, true);

    const batchRes = runToonStudioCli([
      "batch",
      "--state-file",
      stateFile,
      "--json",
      JSON.stringify([
        { tool: "studio.canvas.create", arguments: { title: "배치 1화", width: 800, height: 1280 } },
        { tool: "toonstudio_preflight_6platforms", arguments: { platform: "naver-webtoon" } },
      ]),
    ]);
    assert.equal(batchRes.exitCode, 0);
    assert.equal(JSON.parse(batchRes.output).succeededSteps, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("18. CLI mcp-config가 5개 클라이언트(claude/cursor/gemini/codex/antigravity)용 즉시 연동 JSON을 생성한다", () => {
  const clients = ["claude", "cursor", "gemini", "codex", "antigravity"];
  for (const client of clients) {
    const res = runToonStudioCli(["mcp-config", "--client", client]);
    assert.equal(res.exitCode, 0, `mcp-config failed for ${client}`);
    const parsed = JSON.parse(res.output);
    assert.equal(containsSensitiveSecret(res.output), false);
    if (client === "codex") {
      assert.ok(parsed.mcp_servers.toonstudio.command === "node");
      assert.ok(parsed.tomlSnippet.includes("[mcp_servers.toonstudio]"));
    } else {
      assert.equal(parsed.mcpServers.toonstudio.command, "node");
    }
    if (client === "antigravity") {
      assert.ok(parsed.skillPath.endsWith("SKILL.md"));
      assert.ok(parsed.pluginManifest.endsWith("plugin.json"));
    }
  }
  const invalid = runToonStudioCli(["mcp-config", "--client", "unknown-client"]);
  assert.equal(invalid.exitCode, 1);
});

test("19. CLI init-skill 스캐폴딩과 completion(zsh/bash) 자동완성 스크립트를 검증한다", () => {
  const dir = mkdtempSync(join(tmpdir(), "toonstudio-skill-"));
  try {
    const first = runToonStudioCli(["init-skill", dir]);
    assert.equal(first.exitCode, 0);
    const parsed = JSON.parse(first.output);
    assert.equal(parsed.ok, true);
    assert.ok(existsSync(join(parsed.targetDir, "SKILL.md")));
    assert.ok(existsSync(join(parsed.targetDir, "plugin.json")));

    const duplicate = runToonStudioCli(["init-skill", dir]);
    assert.equal(duplicate.exitCode, 1);

    const forced = runToonStudioCli(["init-skill", dir, "--force"]);
    assert.equal(forced.exitCode, 0);

    const zsh = runToonStudioCli(["completion", "zsh"]);
    assert.equal(zsh.exitCode, 0);
    assert.ok(zsh.output.includes("#compdef toonstudio"));
    assert.ok(zsh.output.includes("toonstudio_preflight_6platforms"));

    const bash = runToonStudioCli(["completion", "bash"]);
    assert.equal(bash.exitCode, 0);
    assert.ok(bash.output.includes("complete -F _toonstudio_completions"));
    assert.ok(bash.output.includes("verify-plugin"));

    const badShell = runToonStudioCli(["completion", "fish"]);
    assert.equal(badShell.exitCode, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("20. CLI verify-plugin 및 공식 plugin.json · SKILL.md 무결성과 시크릿 0건을 검증한다", () => {
  const officialPluginPath = join(MCP_DIR, "plugin.json");
  const officialSkillPath = join(MCP_DIR, "skills", "toonstudio-creator", "SKILL.md");

  const verifyOfficial = runToonStudioCli(["verify-plugin", officialPluginPath, "--strict"]);
  assert.equal(verifyOfficial.exitCode, 0);
  const officialReport = JSON.parse(verifyOfficial.output);
  assert.equal(officialReport.verdict, "approved");

  const pluginJson = JSON.parse(readFileSync(officialPluginPath, "utf8"));
  const engine = createToonStudioMcpEngine();
  assert.equal(pluginJson.mcpServers.toonstudio.toolCount, engine.tools.length);

  const skillText = readFileSync(officialSkillPath, "utf8");
  assert.ok(skillText.startsWith("---\nname: toonstudio-creator\n"));
  for (const toolName of NEW_12_TOOL_NAMES) {
    assert.ok(skillText.includes(toolName), `SKILL.md should document ${toolName}`);
  }
  assert.equal(containsSensitiveSecret(readFileSync(officialPluginPath, "utf8")), false);
  assert.equal(containsSensitiveSecret(skillText), false);

  const tmpDir = mkdtempSync(join(tmpdir(), "toonstudio-plugin-bad-"));
  try {
    const badPath = join(tmpDir, "bad-plugin.json");
    writeFileSync(
      badPath,
      JSON.stringify({
        id: "bad.plugin",
        name: "Bad",
        authorName: "Attacker",
        version: "1.0.0",
        sdkApiVersion: "^2.4.0",
        entryModule: "./bad.mjs",
        requestedScopes: ["filesystem.host"],
      }),
      "utf8",
    );
    const badRes = runToonStudioCli(["verify-plugin", badPath]);
    assert.equal(badRes.exitCode, 1);
    assert.equal(JSON.parse(badRes.output).verdict, "blocked");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
