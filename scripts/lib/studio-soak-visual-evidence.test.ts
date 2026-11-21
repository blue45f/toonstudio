import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { evaluateStudioSoakVisualCoverage, type StudioSoakScreenshotEvidence } from "./studio-soak-visual-evidence";

const minute = 60_000;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

function fixture(requestedMinutes = 300) {
  const screenshotEvidence: StudioSoakScreenshotEvidence[] = [];
  for (let minutes = 10; minutes < requestedMinutes; minutes += 10) {
    const file = `checkpoint-${minutes}m.png`;
    screenshotEvidence.push({ phase: "periodic", scheduledAtMs: minutes * minute,
      sessionAtMs: minutes * minute + 1, file, sha256: digest(file) });
  }
  screenshotEvidence.push({ phase: "final", scheduledAtMs: requestedMinutes * minute,
    sessionAtMs: requestedMinutes * minute + 1, file: "final.png", sha256: digest("final.png") });
  return {
    report: { schemaVersion: 2, sessionId: "visual-test-session", requestedMinutes, screenshotEvidence },
    files: screenshotEvidence.map(({ file, sha256 }) => ({ file, sha256 })),
  };
}

describe("소크 시각 증거의 전체 체크포인트와 원본 지문", () => {
  it("300분은 초기 힙 표본을 이미지로 요구하지 않고 periodic 29장과 최종 1장을 대조한다", () => {
    const { report, files } = fixture();
    expect(evaluateStudioSoakVisualCoverage(report, files)).toMatchObject({
      ok: true, expected: 30, recorded: 30, observed: 30, verified: 30, failures: [],
    });
  });

  it.each([3, 10, 11, 300, 301])("%i분의 실제 필수 슬롯만 요구한다", (minutes) => {
    const { report, files } = fixture(minutes);
    expect(evaluateStudioSoakVisualCoverage(report, files)).toMatchObject({
      ok: true, expected: Math.ceil(minutes / 10), verified: Math.ceil(minutes / 10),
    });
  });

  it("전체 PNG가 있어도 저장 시점의 증거가 없는 과거 보고서는 통과하지 않는다", () => {
    const { report, files } = fixture();
    expect(evaluateStudioSoakVisualCoverage({ ...report, screenshotEvidence: undefined }, files))
      .toMatchObject({ ok: false, failures: [expect.objectContaining({ code: "missing-evidence" })] });
  });

  it.each([
    { name: "보고서 없음", patch: null },
    { name: "세션 없음", patch: { sessionId: "" } },
    { name: "무한 요청 시간", patch: { requestedMinutes: Infinity } },
    { name: "0분", patch: { requestedMinutes: 0 } },
  ])("$name을 완전한 증거로 처리하지 않는다", ({ patch }) => {
    const { report, files } = fixture();
    expect(evaluateStudioSoakVisualCoverage(patch === null ? null : { ...report, ...patch }, files).ok).toBe(false);
  });

  it("final 한 장을 5시간 전체 캡처로 인정하지 않는다", () => {
    const { report, files } = fixture();
    report.screenshotEvidence = report.screenshotEvidence.slice(-1);
    const result = evaluateStudioSoakVisualCoverage(report, files.slice(-1));
    expect(result).toMatchObject({ ok: false, expected: 30, verified: 1 });
    expect(result.failures).toContainEqual(expect.objectContaining({ code: "checkpoint-coverage" }));
  });

  it.each(["checkpoint-20m.png", "final.png"])("필수 파일 %s가 없으면 실패한다", (missing) => {
    const { report, files } = fixture();
    expect(evaluateStudioSoakVisualCoverage(report, files.filter(({ file }) => file !== missing)).failures)
      .toContainEqual(expect.objectContaining({ code: "missing-file", file: missing }));
  });

  it("빠진 중간 슬롯을 다른 슬롯의 중복으로 채울 수 없다", () => {
    const { report, files } = fixture();
    report.screenshotEvidence[1] = { ...report.screenshotEvidence[0]! };
    const result = evaluateStudioSoakVisualCoverage(report, files);
    expect(result.ok).toBe(false);
    expect(result.failures).toContainEqual(expect.objectContaining({ code: "duplicate-evidence" }));
    expect(result.failures).toContainEqual(expect.objectContaining({ code: "checkpoint-coverage" }));
  });

  it("원본 PNG가 교체되면 같은 파일명이어도 지문 불일치로 실패한다", () => {
    const { report, files } = fixture();
    files[0]!.sha256 = digest("replacement PNG");
    expect(evaluateStudioSoakVisualCoverage(report, files).failures)
      .toContainEqual(expect.objectContaining({ code: "hash-mismatch", file: "checkpoint-10m.png" }));
  });

  it.each([
    { name: "누락된 해시", patch: { sha256: "" } },
    { name: "요청보다 빠른 캡처", patch: { sessionAtMs: 10 * minute - 1 } },
    { name: "다음 시간 창까지 지연", patch: { sessionAtMs: 20 * minute } },
    { name: "10분 간격 밖의 표본", patch: { scheduledAtMs: 11 * minute } },
    { name: "상위 경로 파일", patch: { file: "../checkpoint-10m.png" } },
    { name: "다른 슬롯의 파일", patch: { file: "checkpoint-20m.png" } },
  ])("$name을 필수 체크포인트로 인정하지 않는다", ({ patch }) => {
    const { report, files } = fixture();
    report.screenshotEvidence[0] = { ...report.screenshotEvidence[0]!, ...patch };
    expect(evaluateStudioSoakVisualCoverage(report, files).ok).toBe(false);
  });

  it("요청 시간 전에 종료한 실행의 final PNG를 완료 증거로 인정하지 않는다", () => {
    const { report, files } = fixture();
    report.screenshotEvidence[29] = { ...report.screenshotEvidence[29]!, sessionAtMs: 299 * minute };
    expect(evaluateStudioSoakVisualCoverage(report, files).failures)
      .toContainEqual(expect.objectContaining({ code: "invalid-checkpoint", file: "final.png" }));
  });

  it("이전 실행에서 남은 PNG와 요청 종료 시각의 중복 periodic을 거절한다", () => {
    const { report, files } = fixture();
    files.push({ file: "checkpoint-300m.png", sha256: digest("stale") });
    expect(evaluateStudioSoakVisualCoverage(report, files).failures)
      .toContainEqual(expect.objectContaining({ code: "unrecorded-file", file: "checkpoint-300m.png" }));
    report.screenshotEvidence.push({ phase: "periodic", scheduledAtMs: 300 * minute,
      sessionAtMs: 300 * minute + 1, file: "checkpoint-300m.png", sha256: digest("stale") });
    expect(evaluateStudioSoakVisualCoverage(report, files).failures)
      .toContainEqual(expect.objectContaining({ code: "invalid-checkpoint" }));
  });

  it("보고서와 파일 관측값을 변경하지 않는다", () => {
    const { report, files } = fixture();
    for (const row of report.screenshotEvidence) Object.freeze(row);
    Object.freeze(report.screenshotEvidence);
    Object.freeze(report);
    for (const file of files) Object.freeze(file);
    Object.freeze(files);
    expect(evaluateStudioSoakVisualCoverage(report, files).ok).toBe(true);
  });
});
