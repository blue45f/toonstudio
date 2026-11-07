import { describe, expect, it } from "vitest";

import {
  REQUIRED_ANCESTOR_COMMITS,
  REQUIRED_CANCEL_SCENARIO_IDS,
  createPassingPoseCancelFixture,
  evaluatePoseCancelProbeReport,
  runPoseCancelNegativeControlSuite,
} from "./pose-cancel-evaluator.mjs";
import { guardTmpdir, parseArgs } from "./pose-cancel-probe.mjs";

describe("parseArgs & guardTmpdir", () => {
  it("기본 CLI 옵션과 커스텀 플래그를 정확히 파싱한다", () => {
    const defaults = parseArgs([]);
    expect(defaults).toEqual({
      software: false,
      negativeControl: false,
      out: "/tmp/character-lab-pose-cancel-probe/pose-cancel-report.json",
      screenshotsDir: "/tmp/character-lab-pose-cancel-probe",
      url: null,
      timeoutSec: 120,
    });

    const custom = parseArgs([
      "--software",
      "--negative-control",
      "--out",
      "/tmp/custom-cancel-out.json",
      "--screenshots-dir",
      "/tmp/custom-cancel-shots",
      "--url",
      "http://127.0.0.1:4173/",
      "--timeout-sec",
      "90",
    ]);
    expect(custom).toEqual({
      software: true,
      negativeControl: true,
      out: "/tmp/custom-cancel-out.json",
      screenshotsDir: "/tmp/custom-cancel-shots",
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

describe("evaluatePoseCancelProbeReport & createPassingPoseCancelFixture", () => {
  it("REQUIRED_ANCESTOR_COMMITS와 REQUIRED_CANCEL_SCENARIO_IDS 상수가 명세와 일치한다", () => {
    expect(REQUIRED_ANCESTOR_COMMITS).toEqual([
      "f8a04aee",
      "06d95bc8",
      "39976d11",
      "eac1fb45",
      "698dffc4",
      "6a35c0ee",
    ]);
    expect(REQUIRED_CANCEL_SCENARIO_IDS).toEqual([
      "pointerCancelMidDrag",
      "lostPointerCaptureMidDrag",
      "escapeKeyMidDrag",
      "windowBlurMidDrag",
    ]);
  });

  it("createPassingPoseCancelFixture가 생성한 정본 리포트가 ok === true로 통과한다", () => {
    const fixture = createPassingPoseCancelFixture();
    const evaluation = evaluatePoseCancelProbeReport(fixture);
    expect(evaluation.ok).toBe(true);
    expect(evaluation.failures).toEqual([]);
    expect(evaluation.summary).toEqual({
      scenarioCheckedCount: 4,
      scenarioPassedCount: 4,
      modeCancelChecksOk: true,
      continuousRigTransitionsOk: true,
      pageErrorsZero: true,
      failureCount: 0,
    });
  });

  it("provenance 누락, pageErrors 발생, 제어점 취소 실패, 연속 리그 전환 잔여 드래그 요소 존재 시 실패로 거부한다", () => {
    const missingAncestor = createPassingPoseCancelFixture();
    missingAncestor.provenance.allRequiredAncestorsPresent = false;
    expect(evaluatePoseCancelProbeReport(missingAncestor).ok).toBe(false);

    const withPageError = createPassingPoseCancelFixture();
    withPageError.pageErrors = ["Uncaught Error: boom"];
    expect(evaluatePoseCancelProbeReport(withPageError).ok).toBe(false);

    const cpCancelFail = createPassingPoseCancelFixture();
    cpCancelFail.modeCancelChecks.controlPointCancel.draggingClearedAfterCancel = false;
    expect(evaluatePoseCancelProbeReport(cpCancelFail).ok).toBe(false);

    const leftoverDragging = createPassingPoseCancelFixture();
    leftoverDragging.continuousRigTransitions.leftoverDraggingElements = 1;
    expect(evaluatePoseCancelProbeReport(leftoverDragging).ok).toBe(false);
  });
});

describe("runPoseCancelNegativeControlSuite", () => {
  it("기준선 리포트는 통과하고 6종의 단일 관심사 변이는 모두 ok === false로 거부된다", () => {
    const suite = runPoseCancelNegativeControlSuite();
    expect(suite.baselinePassed).toBe(true);
    expect(suite.allRejected).toBe(true);
    expect(suite.ok).toBe(true);
    expect(suite.exitCode).toBe(1);
    expect(suite.cases).toHaveLength(6);

    const expectedIds = [
      "mutate-pointercancel-pollutes-history",
      "mutate-lostpointercapture-leaves-dragging-state",
      "mutate-escape-keeps-uncommitted-mutation",
      "mutate-window-blur-breaks-next-drag-recovery",
      "mutate-mode3-scale-cancel-mutates-store",
      "mutate-continuous-rig-transition-fails",
    ];
    expect(suite.cases.map((c) => c.id)).toEqual(expectedIds);

    for (const c of suite.cases) {
      expect(c.rejected).toBe(true);
      expect(c.observedOk).toBe(false);
      expect(c.failures.length).toBeGreaterThan(0);
    }
  });
});
