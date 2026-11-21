import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createToonStudioMcpEngine } from "./server.mjs";
import { runToonStudioCli } from "./cli.mjs";

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

test("ToonStudio MCP 서버가 initialize, 32종+ tools/list 및 드로잉·전기능 tools/call을 처리한다", () => {
  const engine = createToonStudioMcpEngine();

  const initRes = engine.handleJsonRpcRequest({ jsonrpc: "2.0", id: 1, method: "initialize" });
  assert.equal(initRes.result.serverInfo.name, "toonstudio-mcp");
  assert.equal(initRes.result.serverInfo.version, "2.0.0");

  const listRes = engine.handleJsonRpcRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.ok(listRes.result.tools.length >= 32, `expected >= 32 tools, got ${listRes.result.tools.length}`);

  const strokeRes = callTool(engine, 3, "studio.canvas.draw_stroke", {
    brush: "g-pen",
    points: [[10, 20], [200, 300]],
  });
  assert.equal(strokeRes.ok, true);
  assert.equal(strokeRes.totalStrokes, 1);

  const assignRes = callTool(engine, 4, "studio.rbac.assign_role", {
    actorUserId: "u-owner",
    targetUserId: "u-guest",
    roleId: "line_assistant",
  });
  assert.equal(assignRes.ok, true);
  assert.equal(assignRes.roleId, "line_assistant");

  const deniedAssign = callTool(engine, 5, "studio.rbac.assign_role", {
    actorUserId: "u-line",
    targetUserId: "u-guest",
    roleId: "studio_owner",
  });
  assert.equal(deniedAssign.ok, false);
});

test("신규 포토샵 프로 4종 · 3D/VRoid/Blender/SketchUp 4종 MCP 툴이 정상 동작한다", () => {
  const engine = createToonStudioMcpEngine();

  const fx = callTool(engine, 10, "studio.photoshop.apply_layer_fx", {
    effect: "outer-glow",
    blendMode: "screen",
    opacityPct: 45,
  });
  assert.equal(fx.ok, true);
  assert.equal(fx.layerFx.nonDestructive, true);

  const acr = callTool(engine, 11, "studio.photoshop.apply_camera_raw", {
    exposure: 0.25,
    clarity: 18,
    grainPct: 10,
  });
  assert.equal(acr.ok, true);
  assert.equal(acr.cameraRaw.exposure, 0.25);

  const freq = callTool(engine, 12, "studio.photoshop.frequency_separate", {
    radiusPx: 6,
    bitDepth: 16,
  });
  assert.equal(freq.ok, true);
  assert.equal(freq.frequencySeparation.highBlendMode, "linear-light");
  assert.ok(freq.totalLayers >= 3);

  const batch = callTool(engine, 13, "studio.photoshop.run_action_batch", {
    actionName: "webtoon-finish-clean",
    cutIds: ["cut-01", "cut-02"],
  });
  assert.equal(batch.ok, true);
  assert.equal(batch.batchRun.processedCount, 2);

  const bg3d = callTool(engine, 14, "studio.bg3d.compose_scene", {
    sceneName: "서울 옥상 노을",
    lensMm: 35,
    timeOfDay: "golden-hour",
  });
  assert.equal(bg3d.ok, true);
  assert.equal(bg3d.scene.lighting.groundPlaneY, 0);

  const vrm = callTool(engine, 15, "studio.vrm.apply_pose_expression", {
    avatarId: "vrm-hero",
    posePreset: "dramatic-turn",
    expressions: { happy: 0.2, surprised: 0.85 },
  });
  assert.equal(vrm.ok, true);
  assert.equal(vrm.avatar.expressions.surprised, 0.85);

  const blender = callTool(engine, 16, "studio.blender.compile_npr_recipe", {
    styleName: "hunter-cel",
    celBands: 3,
    outlineThicknessPx: 2.0,
  });
  assert.equal(blender.ok, true);
  assert.equal(blender.recipe.geometryGates.floorGroundZ, 0);

  const skp = callTool(engine, 17, "studio.sketchup.toggle_dynamic_component", {
    componentId: "skp-rooftop-door",
    attribute: "door_open_deg",
    value: 90,
  });
  assert.equal(skp.ok, true);
  assert.equal(skp.state.door_open_deg, 90);
});

test("신규 분업 OS 4종 · 무과금 AI & 현지화 5종 MCP 툴이 동작하며 키를 절대 노출하지 않는다", () => {
  const fakeKey = ["sk", "never", "LeakThisSecretValue123456"].join("-");
  const engine = createToonStudioMcpEngine({
    env: {
      OPENAI_API_KEY: fakeKey,
      OPENAI_MODEL: "gpt-4o-mini",
      GEMINI_API_KEY: ["AIza", "NeverLeakGemini1234567890123456"].join(""),
      GEMINI_MODEL: "gemini-2.5-pro",
    },
  });

  const split = callTool(engine, 20, "studio.division.split_episode_cuts", {
    episodeTitle: "1화 옥상",
    totalCuts: 24,
  });
  assert.equal(split.ok, true);
  assert.equal(split.packets.length, 6);

  const qa = callTool(engine, 21, "studio.division.run_ad_qa", { minWidthPx: 800 });
  assert.equal(qa.ok, true);
  assert.equal(qa.report.verdict, "pass");

  const lock1 = callTool(engine, 22, "studio.division.lock_asset", {
    assetId: "cut-07",
    userId: "u-line",
    action: "acquire",
  });
  assert.equal(lock1.ok, true);
  const lockConflict = callTool(engine, 23, "studio.division.lock_asset", {
    assetId: "cut-07",
    userId: "u-color",
    action: "acquire",
  });
  assert.equal(lockConflict.ok, false);

  const royalty = callTool(engine, 24, "studio.division.estimate_royalty", {
    grossRevenueKrw: 5_000_000,
    cuts: 50,
  });
  assert.equal(royalty.ok, true);
  assert.ok(royalty.estimate.totalDistributedKrw > 0);

  const modes = callTool(engine, 25, "studio.ai.list_modes");
  assert.equal(modes.totalModes, 14);
  assert.equal(modes.costUsdGuaranteed, "$0.00");

  const quota = callTool(engine, 26, "studio.ai.free_quota_status");
  assert.equal(quota.guaranteedZeroCostUsd, 0);
  assert.equal(quota.paidBillingBlocked, true);
  assert.equal(JSON.stringify(quota).includes(fakeKey), false);
  const geminiEntry = quota.providers.find((p) => p.id === "gemini-free");
  assert.equal(geminiEntry.modelAllowed, false);

  const assist = callTool(engine, 27, "studio.ai.run_creative_assist", {
    mode: "character-bible-forge",
    inputText: `주인공 설정 테스트 ${fakeKey}`,
  });
  assert.equal(assist.ok, true);
  assert.equal(assist.run.costGuaranteedZeroUsd, 0);
  assert.equal(assist.run.inputPreview.includes(fakeKey), false);

  callTool(engine, 28, "studio.canvas.add_speech_balloon", {
    text: "오늘도 비가 오네.",
    x: 300,
    y: 180,
  });
  const l10n = callTool(engine, 29, "studio.localization.translate_episode", {
    targetLocales: ["en", "ja"],
  });
  assert.equal(l10n.ok, true);
  assert.equal(l10n.localizationJob.balloonCount, 1);

  const preflight = callTool(engine, 30, "studio.export.preflight_check", {
    platform: "naver-webtoon",
    rightsBomClean: true,
  });
  assert.equal(preflight.ok, true);
  assert.equal(preflight.verdict, "ready");
});

test("ToonStudio CLI가 --state-file과 신규 quota, ai-modes, doctor, batch 명령을 처리한다", () => {
  const dir = mkdtempSync(join(tmpdir(), "toonstudio-mcp-"));
  const stateFile = join(dir, "session.json");
  const fakeKey = ["ghp", "DoNotPrintCliSecret1234567890"].join("_");
  try {
    const quotaRes = runToonStudioCli(["quota"], {
      env: { STUDIO_AI_FREE_GITHUB_MODELS_API_KEY: fakeKey },
    });
    assert.equal(quotaRes.exitCode, 0);
    assert.equal(quotaRes.output.includes(fakeKey), false);
    const parsedQuota = JSON.parse(quotaRes.output);
    assert.equal(parsedQuota.guaranteedZeroCostLabel, "$0.00");

    const modesRes = runToonStudioCli(["ai-modes"]);
    assert.equal(modesRes.exitCode, 0);
    assert.equal(JSON.parse(modesRes.output).totalModes, 14);

    const doctorRes = runToonStudioCli(["doctor", "--state-file", stateFile], {
      env: { STUDIO_AI_FREE_GITHUB_MODELS_API_KEY: fakeKey },
    });
    assert.equal(doctorRes.exitCode, 0);
    assert.equal(doctorRes.output.includes(fakeKey), false);
    const doctorData = JSON.parse(doctorRes.output);
    assert.ok(doctorData.totalMcpTools >= 32);
    assert.equal(doctorData.aiAssistModesCount, 14);

    const batchRes = runToonStudioCli([
      "batch",
      "--state-file",
      stateFile,
      "--json",
      JSON.stringify([
        { tool: "studio.canvas.create", arguments: { title: "배치 테스트 1화", width: 800, height: 1200 } },
        { tool: "studio.canvas.draw_stroke", arguments: { points: [[0, 0], [100, 200]] } },
        { tool: "studio.photoshop.apply_layer_fx", arguments: { effect: "outer-glow", opacityPct: 35 } },
        { tool: "studio.export.preflight_check", arguments: { platform: "naver-webtoon" } },
      ]),
    ]);
    assert.equal(batchRes.exitCode, 0);
    const parsedBatch = JSON.parse(batchRes.output);
    assert.equal(parsedBatch.succeededSteps, 4);

    const snapRes = runToonStudioCli(["call", "studio.session.snapshot", "--state-file", stateFile]);
    const parsedSnap = JSON.parse(snapRes.output);
    assert.equal(parsedSnap.state.canvas.title, "배치 테스트 1화");
    assert.equal(parsedSnap.state.canvas.strokes.length, 1);
    assert.equal(parsedSnap.state.photoshop.layerFx.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
