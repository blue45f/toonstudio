import { describe, expect, it } from "vitest";

import {
  REQUIRED_ANCESTOR_COMMITS,
  REQUIRED_VIEWPORT_IDS,
  createPassingPoseUsabilityFixture,
  evaluatePoseUsabilityReport,
  runPoseUsabilityNegativeControlSuite,
} from "./pose-usability-evaluator.mjs";
import { guardTmpdir, parseArgs } from "./pose-usability-probe.mjs";

describe("parseArgs & guardTmpdir", () => {
  it("기본 CLI 옵션과 커스텀 플래그를 정확히 파싱한다", () => {
    const defaults = parseArgs([]);
    expect(defaults).toEqual({
      software: false,
      negativeControl: false,
      out: "/tmp/character-lab-pose-usability-probe/pose-usability-report.json",
      screenshotsDir: "/tmp/character-lab-pose-usability-probe",
      beforeDir: "/tmp/character-lab-pose-usability-probe/before",
      url: null,
      timeoutSec: 120,
    });

    const custom = parseArgs([
      "--software",
      "--negative-control",
      "--out",
      "/tmp/custom-out.json",
      "--screenshots-dir",
      "/tmp/custom-shots",
      "--before-dir",
      "/tmp/custom-before",
      "--url",
      "http://127.0.0.1:4173/",
      "--timeout-sec",
      "90",
    ]);
    expect(custom).toEqual({
      software: true,
      negativeControl: true,
      out: "/tmp/custom-out.json",
      screenshotsDir: "/tmp/custom-shots",
      beforeDir: "/tmp/custom-before",
      url: "http://127.0.0.1:4173/",
      timeoutSec: 90,
    });
  });

  it("유효하지 않은 옵션이나 누락된 값에 대해 명시적 오류를 던진다", () => {
    expect(() => parseArgs(["--unknown"])).toThrow(/알 수 없는 옵션/u);
    expect(() => parseArgs(["--out"])).toThrow(/옵션에는 값이 필요합니다/u);
    expect(() => parseArgs(["--timeout-sec", "0"])).toThrow(/양수여야 합니다/u);
  });

  it("guardTmpdir가 소켓 경로 한도를 넘는 긴 TMPDIR를 /tmp로 안전하게 대체한다", () => {
    const env = {};
    const shortRes = guardTmpdir(env, "linux", () => "/tmp");
    expect(shortRes.changed).toBe(false);

    const longTmp = `/tmp/${"a".repeat(80)}`;
    const longRes = guardTmpdir(env, "linux", () => longTmp);
    expect(longRes.changed).toBe(true);
    expect(longRes.tmpdir).toBe("/tmp");
    expect(env.TMPDIR).toBe("/tmp");
  });
});

describe("evaluatePoseUsabilityReport & createPassingPoseUsabilityFixture", () => {
  it("REQUIRED_VIEWPORT_IDS와 REQUIRED_ANCESTOR_COMMITS 상수가 명세와 일치한다", () => {
    expect(REQUIRED_VIEWPORT_IDS).toEqual(["320px", "390px", "768px", "1440px", "200pct-zoom"]);
    expect(REQUIRED_ANCESTOR_COMMITS).toEqual(["f8a04aee", "06d95bc8", "39976d11", "eac1fb45", "698dffc4"]);
  });

  it("createPassingPoseUsabilityFixture가 생성한 정본 리포트가 ok === true로 통과한다", () => {
    const fixture = createPassingPoseUsabilityFixture();
    const evaluation = evaluatePoseUsabilityReport(fixture);
    expect(evaluation.ok).toBe(true);
    expect(evaluation.failures).toEqual([]);
    expect(evaluation.summary).toEqual({
      viewportCount: 5,
      overflowFreeCount: 5,
      touchTargetPassCount: 5,
      screenshotPairCount: 5,
      diagnosticsAndGroupingOk: true,
      rigTransitionsOk: true,
      interactionsOk: true,
      failureCount: 0,
    });
  });

  it("provenance, 스크린샷 존재 여부, 정상 빈 리그 배너 등이 위반되면 실패로 거부한다", () => {
    const missingAncestor = createPassingPoseUsabilityFixture();
    missingAncestor.provenance.allRequiredAncestorsPresent = false;
    expect(evaluatePoseUsabilityReport(missingAncestor).ok).toBe(false);

    const missingBeforeShot = createPassingPoseUsabilityFixture();
    missingBeforeShot.viewports["768px"].beforeScreenshotExists = false;
    expect(evaluatePoseUsabilityReport(missingBeforeShot).ok).toBe(false);

    const falsePositiveEmptyBanner = createPassingPoseUsabilityFixture();
    falsePositiveEmptyBanner.rigTransitions.normalEmptyRig.failureBannerCount = 1;
    expect(evaluatePoseUsabilityReport(falsePositiveEmptyBanner).ok).toBe(false);
  });
});

describe("runPoseUsabilityNegativeControlSuite", () => {
  it("기준선 리포트는 통과하고 6종의 단일 관심사 변이는 모두 ok === false로 거부된다", () => {
    const suite = runPoseUsabilityNegativeControlSuite();
    expect(suite.baselinePassed).toBe(true);
    expect(suite.allRejected).toBe(true);
    expect(suite.ok).toBe(true);
    expect(suite.exitCode).toBe(1);
    expect(suite.cases).toHaveLength(6);

    const expectedIds = [
      "mutate-320px-horizontal-overflow",
      "mutate-touch-target-under-44px",
      "mutate-diagnostics-not-collapsible",
      "mutate-corrupt-rig-controls-not-disabled",
      "mutate-recovery-rig-still-blocked",
      "mutate-undo-redo-broken",
    ];
    expect(suite.cases.map((c) => c.id)).toEqual(expectedIds);

    for (const c of suite.cases) {
      expect(c.rejected).toBe(true);
      expect(c.observedOk).toBe(false);
      expect(c.failures.length).toBeGreaterThan(0);
    }
  });
});
