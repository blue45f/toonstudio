const { describe, test } = process.env.VITEST ? await import("vitest") : await import("node:test");
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";

import { ROOT, verifyLiveOnpodOrigin, verifyOnpodDeployment } from "./cloud-deploy-onpod.mjs";

const ORIGIN = "https://toonstudio-api.onpod.ai";
const TARGET_IMAGE = `ghcr.io/blue45f/toonspectrum-core-api:${"a".repeat(40)}`;
const PREVIOUS_IMAGE = `ghcr.io/blue45f/toonspectrum-core-api:${"b".repeat(40)}`;
const status = (image) => ({ state: "running", image, plan: "free", freeTier: true });
const attempt = (code = 200) => ({
  timestamp: "2026-11-18T00:00:00.000Z",
  path: "/api/health/live",
  status: code,
  attempt: 1,
  elapsedMs: 12,
  retryAfterMs: null,
  errorCode: code === 200 ? null : "HTTP_503",
});

async function withEvidence(fn) {
  const artifactDir = mkdtempSync(join(tmpdir(), "toonstudio-onpod-verification-"));
  const summaryPath = join(artifactDir, "summary.md");
  const readEvidence = () => JSON.parse(readFileSync(join(artifactDir, "onpod-verification.json"), "utf8"));
  const options = {
    appName: "toonstudio-api",
    originUrl: ORIGIN,
    targetImage: TARGET_IMAGE,
    requireTargetImage: true,
    beforeStatus: status(PREVIOUS_IMAGE),
    childEnv: { ONPOD_TOKEN: "비밀값은 아티팩트에 남기지 않는다" },
    artifactDir,
    env: { GITHUB_STEP_SUMMARY: summaryPath },
    inspectStatusImpl: () => status(TARGET_IMAGE),
    verifyOriginImpl: async () => ({ directAuthStatus: 403 }),
  };
  try {
    return await fn({ options, readEvidence, summaryPath });
  } finally {
    rmSync(artifactDir, { recursive: true, force: true });
  }
}

describe("Onpod 사후 검증과 실패 증거 보존", () => {
  test("health 대기 전에 이미지를 기록하고 대기 뒤 갱신된 이미지로 성공을 판정한다", async () => {
    await withEvidence(async ({ options, readEvidence }) => {
      let statusCalls = 0;
      const result = await verifyOnpodDeployment({
        ...options,
        inspectStatusImpl: () => status(++statusCalls === 1 ? PREVIOUS_IMAGE : TARGET_IMAGE),
        verifyOriginImpl: async (origin, _fetch, { onAttempt }) => {
          assert.equal(origin, ORIGIN);
          assert.equal(readEvidence().afterUpdateStatus.image, PREVIOUS_IMAGE);
          assert.equal(readEvidence().result, "pending");
          onAttempt(attempt());
          return { directAuthStatus: 403 };
        },
      });
      assert.equal(statusCalls, 2);
      assert.equal(result.afterStatus.image, TARGET_IMAGE);
      const evidence = readEvidence();
      assert.equal(evidence.result, "success");
      assert.equal(evidence.targetImage, TARGET_IMAGE);
      assert.equal(evidence.beforeStatus.image, PREVIOUS_IMAGE);
      assert.equal(evidence.afterUpdateStatus.image, PREVIOUS_IMAGE);
      assert.equal(evidence.finalStatus.image, TARGET_IMAGE);
      assert.equal(evidence.directAuthStatus, 403);
      assert.deepEqual(evidence.healthAttempts, [attempt()]);
      assert.ok(!JSON.stringify(evidence).includes(options.childEnv.ONPOD_TOKEN));
    });
  });

  test("health가 실패해도 실제 이미지·시도 기록·실패 요약을 보존한다", async () => {
    await withEvidence(async ({ options, readEvidence, summaryPath }) => {
      const failure = new Error("기동 대기 기한 초과");
      let statusCalls = 0;
      await assert.rejects(verifyOnpodDeployment({
        ...options,
        inspectStatusImpl: () => { statusCalls += 1; return status(TARGET_IMAGE); },
        verifyOriginImpl: async (_origin, _fetch, { onAttempt }) => {
          onAttempt(attempt(503));
          throw failure;
        },
      }), (error) => error === failure);
      assert.equal(statusCalls, 2);
      const evidence = readEvidence();
      assert.equal(evidence.result, "failure");
      assert.equal(evidence.failureStage, "origin_verification");
      assert.equal(evidence.afterUpdateStatus.image, TARGET_IMAGE);
      assert.equal(evidence.finalStatus.image, TARGET_IMAGE);
      assert.deepEqual(evidence.healthAttempts, [attempt(503)]);
      const summary = readFileSync(summaryPath, "utf8");
      assert.match(summary, /사후 검증 실패/u);
      assert.match(summary, /상태 확인 횟수:\*\* 1회/u);
      assert.match(summary, /이미지 재교체나 롤백은 실행하지 않았습니다/u);
    });
  });

  for (const image of [PREVIOUS_IMAGE, null]) {
    test(`health가 정상이어도 이미지 ${image === null ? "미확인" : "불일치"}를 성공 처리하지 않는다`, async () => {
      await withEvidence(async ({ options, readEvidence }) => {
        await assert.rejects(verifyOnpodDeployment({
          ...options,
          inspectStatusImpl: () => status(image),
        }), /최종 실행 이미지가 대상 이미지와 일치하지 않거나 확인되지/u);
        assert.equal(readEvidence().result, "failure");
        assert.equal(readEvidence().failureStage, "final_image_identity");
        assert.equal(readEvidence().finalStatus.image, image);
      });
    });
  }

  test("최종 상태 조회 실패는 이전 스냅샷을 최종 이미지로 대신하지 않는다", async () => {
    await withEvidence(async ({ options, readEvidence }) => {
      let statusCalls = 0;
      await assert.rejects(verifyOnpodDeployment({
        ...options,
        inspectStatusImpl: () => {
          if (++statusCalls === 2) throw new Error("원문 오류는 아티팩트에 저장하지 않는다");
          return status(TARGET_IMAGE);
        },
      }), /최종 실행 이미지 조회에 실패/u);
      const evidence = readEvidence();
      assert.equal(evidence.finalStatus, null);
      assert.equal(evidence.finalStatusReadFailed, true);
      assert.equal(evidence.afterUpdateStatus.image, TARGET_IMAGE);
      assert.ok(!JSON.stringify(evidence).includes("원문 오류"));
    });
  });

  test("환경변수 전용 동기화에서는 기존 이미지를 목표 SHA로 오인하지 않는다", async () => {
    await withEvidence(async ({ options, readEvidence }) => {
      await verifyOnpodDeployment({
        ...options,
        requireTargetImage: false,
        inspectStatusImpl: () => status(PREVIOUS_IMAGE),
      });
      assert.equal(readEvidence().result, "success");
      assert.equal(readEvidence().finalStatus.image, PREVIOUS_IMAGE);
      assert.equal(readEvidence().targetImage, TARGET_IMAGE);
    });
  });

  test("live/ready 성공 후 직접 인증 요청의 403을 재시도 없이 검사한다", async () => {
    const calls = [];
    const health = { liveness: { status: 200 }, readiness: { status: 200 }, attempts: [] };
    const result = await verifyLiveOnpodOrigin(ORIGIN, async (url, options) => {
      calls.push(url);
      assert.equal(options.redirect, "manual");
      assert.ok(options.signal instanceof AbortSignal);
      return new Response("접근 차단", { status: 403 });
    }, {
      verifyHealthImpl: async ({ origin }) => { assert.equal(origin, ORIGIN); return health; },
    });
    assert.deepEqual(calls, [`${ORIGIN}/api/auth/providers`]);
    assert.equal(result.health, health);
    assert.equal(result.directAuthStatus, 403);
  });

  test("인증 요청이 200이면 health 성공과 무관하게 즉시 실패한다", async () => {
    let directCalls = 0;
    await assert.rejects(verifyLiveOnpodOrigin(ORIGIN, async () => {
      directCalls += 1;
      return new Response("정상 접근이 허용되면 안 됨", { status: 200 });
    }, { verifyHealthImpl: async () => ({}) }), /403으로 차단되지/u);
    assert.equal(directCalls, 1);
  });

  test("인증 응답의 본문 정리 오류는 상태 확인을 덮어쓰거나 원문을 노출하지 않는다", async () => {
    const result = await verifyLiveOnpodOrigin(ORIGIN, async () => ({
      status: 403,
      body: { cancel: async () => { throw new Error("출력하면 안 되는 응답 원문"); } },
    }), { verifyHealthImpl: async () => ({}) });
    assert.equal(result.directAuthStatus, 403);
  });

  test("health 실패 뒤에는 인증 요청을 보내지 않는다", async () => {
    let directCalls = 0;
    await assert.rejects(verifyLiveOnpodOrigin(ORIGIN, async () => {
      directCalls += 1;
      return new Response(null, { status: 403 });
    }, { verifyHealthImpl: async () => { throw new Error("기동 실패"); } }), /기동 실패/u);
    assert.equal(directCalls, 0);
  });

  test("실패 시에도 기존 복구 기록과 새 진단 기록을 함께 업로드한다", () => {
    const workflow = parse(readFileSync(join(ROOT, ".github/workflows/cloud-production-deploy.yml"), "utf8"));
    assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
    const upload = Object.values(workflow.jobs).flatMap((job) => job.steps ?? [])
      .find((step) => step.with?.name?.startsWith("onpod-api-rollback-"));
    assert.equal(upload.if, "always()");
    assert.deepEqual(upload.with.path.trim().split("\n"), [
      "artifacts/cloud-deploy/onpod-rollback.json",
      "artifacts/cloud-deploy/onpod-verification.json",
    ]);
  });
});
