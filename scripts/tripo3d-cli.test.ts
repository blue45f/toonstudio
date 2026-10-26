import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildTripo3dPlanCard,
  COMPETITOR_3D_PLATFORM_MATRIX,
  detectTripo3dLowPolyIntent,
  executeTripo3dCli,
  formatTripo3dPoseControlPromptSuffix,
  loadTripo3dConfig,
  parseTripoCliArguments,
  resolveTripo3dModelAndValidateParams,
  TRIPO3D_CHAIN_STEPS,
  TRIPO3D_ERROR_CATALOG,
  TRIPO3D_GENERATION_ENDPOINTS,
  TRIPO3D_REGIONS,
} from "./tripo3d-cli.mts";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "tripo3d-cli-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("tripo3d-cli", () => {
  it("로컬 .env.infrastructure.local 및 ~/.tripo/config.json에서 API 키를 로드하되 출력에는 비밀값을 노출하지 않는다", async () => {
    const dir = createTempDir();
    const fakeSecret = "tsk_test_do_not_expose_9876543210";
    writeFileSync(
      join(dir, ".env.infrastructure.local"),
      `# local infra\nTRIPO_API_KEY="${fakeSecret}"\n`,
      "utf8",
    );
    const tripoDir = join(dir, ".tripo");
    mkdirSync(tripoDir, { recursive: true });
    writeFileSync(
      join(tripoDir, "config.json"),
      JSON.stringify({ apiKey: fakeSecret, region: "ov" }),
      "utf8",
    );

    const cfg = loadTripo3dConfig({
      env: {},
      cwd: dir,
      repoRoot: dir,
      homeDir: dir,
    });
    expect(cfg.apiKeyConfigured).toBe(true);
    expect(cfg.apiKeySource).toBe("file:.env.infrastructure.local:TRIPO_API_KEY");
    expect(cfg.apiBase).toBe(TRIPO3D_REGIONS.ov.apiBase);

    const res = await executeTripo3dCli(["doctor", "--check"], {
      env: {},
      cwd: dir,
      repoRoot: dir,
      homeDir: dir,
    });
    expect(res.exitCode).toBe(0);
    const serialized = JSON.stringify(res.output);
    expect(serialized).not.toContain(fakeSecret);
    expect(res.output.apiKeyConfigured).toBe(true);
    expect(res.output.mode).toBe("check");
  });

  it("Dual/Triple 모델 자동 라우팅(v3.1-20260211 / P1-20260311 / P2-20260801) 및 P1 비호환 파라미터 자동 제거를 수행한다", () => {
    expect(detectTripo3dLowPolyIntent("low-poly stylized game prop chest")).toBe(true);
    expect(detectTripo3dLowPolyIntent("로우폴리 웹툰 골목 가로등 소품")).toBe(true);
    expect(detectTripo3dLowPolyIntent("high detailed realistic knight armor")).toBe(false);

    const autoP1 = resolveTripo3dModelAndValidateParams({
      prompt: "low-poly isometric village house",
      smartLowPoly: true,
      generateParts: true,
      geometryQuality: "detailed",
      faceLimit: 4000,
    });
    expect(autoP1.wireModel).toBe("P1-20260311");
    expect(autoP1.strippedFields).toEqual(
      expect.arrayContaining(["smart_low_poly", "generate_parts", "geometry_quality"]),
    );
    expect(autoP1.requestBody.smart_low_poly).toBeUndefined();

    const autoP2 = resolveTripo3dModelAndValidateParams({
      prompt: "lowpoly temple gate",
      quad: true,
      faceLimit: 8000,
    });
    expect(autoP2.wireModel).toBe("P2-20260801");
  });

  it("Hard/Soft 파라미터 검증 및 체인 순서 제약(segment->complete, rig->retarget, 비-바이페드 프리셋 스왑)을 강제한다", () => {
    expect(() =>
      resolveTripo3dModelAndValidateParams({
        prompt: "wooden barrel",
        modelVersion: "tripo-p1",
        faceLimit: 50000,
      }),
    ).toThrow(/50 이상 20000 이하/);

    const invalidCompleteChain = buildTripo3dPlanCard({
      generationInput: { prompt: "cyberpunk vending machine" },
      chainExpression: "complete",
    });
    expect(invalidCompleteChain.readyToExecute).toBe(false);
    expect(invalidCompleteChain.chainValidation.errorsKo.join(" ")).toContain("mesh_segmentation");

    const quadrupedChain = buildTripo3dPlanCard({
      generationInput: {
        prompt: "armored wolf companion",
        poseControl: { enabled: true, poseType: "A-Pose" },
      },
      chainExpression: "rig-check;rig:spec=mixamo;retarget:animations=preset:idle|preset:walk;convert",
      rigType: "quadruped",
    });
    expect(quadrupedChain.readyToExecute).toBe(true);
    const retargetStep = quadrupedChain.chainValidation.normalizedSteps.find(
      (s) => s.step === "retarget",
    );
    expect(retargetStep?.params.animations).toEqual(["preset:quadruped:walk"]);
    expect(String(quadrupedChain.generationPlan.requestBody.prompt)).toContain(
      "a-pose:1.0:1.0:1.0:1.0:9.0",
    );
    expect(quadrupedChain.totalEstimatedCredits).toBeGreaterThan(20);
  });

  it("포즈 비율 접미사 생성기 및 카탈로그/플랜/밸런스/드라이런 CLI 명령이 정상 동작한다", async () => {
    const suffix = formatTripo3dPoseControlPromptSuffix({
      enabled: true,
      poseType: "T-Pose",
      headBodyHeightRatio: 1.2,
      headBodyWidthRatio: 1.0,
      legsBodyHeightRatio: 1.1,
      armsBodyLengthRatio: 0.95,
      spanOfLegs: 12,
    });
    expect(suffix).toBe(", t-pose:1.2:1.0:1.1:0.9:12.0");

    expect(Object.keys(TRIPO3D_GENERATION_ENDPOINTS).length).toBe(8);
    expect(Object.keys(TRIPO3D_CHAIN_STEPS).length).toBe(12);
    expect(COMPETITOR_3D_PLATFORM_MATRIX.length).toBeGreaterThanOrEqual(5);
    expect(TRIPO3D_ERROR_CATALOG[2010]?.exitCode).toBe(4);

    const parsed = parseTripoCliArguments([
      "make",
      "--prompt",
      "webtoon convenience store",
      "--then",
      "rig,retarget,convert",
    ]);
    expect(parsed.command).toBe("make");
    expect(parsed.options.get("prompt")).toBe("webtoon convenience store");

    const dryRunRes = await executeTripo3dCli(
      ["make", "--prompt", "webtoon classroom desk", "--then", "segment;complete"],
      { env: { TRIPO_API_KEY: "tsk_live_valid_format_key" } },
    );
    expect(dryRunRes.exitCode).toBe(0);
    expect(dryRunRes.output.dryRun).toBe(true);

    const balanceFetchStub: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toContain("/user/balance");
      return new Response(
        JSON.stringify({ code: 0, data: { balance: 2900, frozen: 100 } }),
        { status: 200 },
      );
    };
    const balanceRes = await executeTripo3dCli(["balance"], {
      env: { TRIPO_API_KEY: "tsk_live_valid_format_key" },
      fetchImpl: balanceFetchStub,
    });
    expect(balanceRes.exitCode).toBe(0);
    expect((balanceRes.output.data as { balance: number }).balance).toBe(2900);
  });
});
