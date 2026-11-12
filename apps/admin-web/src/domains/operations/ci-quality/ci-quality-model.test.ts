import { describe, expect, it } from "vitest";

import {
  appendQualityHistory, CI_QUALITY_REQUIRED_IDS, createQualityBoard, createQualityGate,
  exportQualityBoardJson, getFreshness, isQualityHttpUrl, parseQualityBoardJson,
  QUALITY_HISTORY_LIMIT, QUALITY_JSON_MAX_LENGTH, summarizeQualityBoard, validateQualityBoard,
} from "./ci-quality-model";

import type { QualityBoard, QualityCheck, QualityJsonObject } from "./ci-quality-model";

const NOW = Date.parse("2026-11-12T08:00:00Z");
function freshCheck(board: QualityBoard): QualityCheck {
  return { ...board.checks[0], sha: board.commit.sha, executedAt: "2026-11-12T07:50:00Z", scope: "product shard", logUrl: "https://github.com/blue45f/toonstudio/actions/runs/123" };
}

describe("CI·QA 보드의 입력 계약", () => {
  it("초기 커밋 관측과 실제 CI 결과를 구분하고 12개 검사를 미확인으로 만든다", () => {
    const board = createQualityBoard(NOW);
    expect(validateQualityBoard(board, NOW)).toEqual(board);
    expect(board.checks.map(c => c.id)).toEqual(CI_QUALITY_REQUIRED_IDS);
    expect(board.checks.every(c => c.status === "unknown")).toBe(true);
    expect(board.checks.every(c => Object.values(c.stats).every(n => n === null))).toBe(true);
    expect(board.commit.observedAt).toBe("2026-11-12T06:46:20Z");
    expect(board.commit.sha).toHaveLength(40);
  });

  it("이전 HTML에서 사용하는 schemaVersion 1 필드를 JSON 왕복으로 보존한다", () => {
    const board = createQualityBoard(NOW);
    board.checks[0] = { ...freshCheck(board), status: "failed", stats: { passed: 9, failed: 1, skipped: 0, total: 10, duration: 1.25 }, failure: { classification: "regression", change: "예산 기준 변경", baseline: "이전 정상 SHA 및 실행", diff: "기대값 차이", cause: "추정: fixture 불일치", action: "코드 수정 승인 요청" }, ciJson: { workflow: "CI", scope: "product shard", jobs: [{ name: "test", conclusion: "failure" }] } };
    board.qa.results.push({ id: "qa-1", title: "수동 외부 QA 참고", status: "done", sha: board.commit.sha, executedAt: "2026-11-12T07:00:00Z", summary: "정본 CI와 분리", url: "https://example.com/results/1" });
    board.approvals[0].note = "변경 제안만 기록";
    const exported = exportQualityBoardJson(board, NOW);
    expect(parseQualityBoardJson(exported, NOW)).toEqual(board);
    expect(JSON.parse(exported).derivedSummary.ciConnection).toBe("not-connected");
  });

  it.each([
    ["알 수 없는 상태", (b: QualityBoard) => Object.assign(b.checks[0], { status: "success" })],
    ["잘못된 SHA", (b: QualityBoard) => { b.commit.sha = "abc"; }],
    ["중복 검사 ID", (b: QualityBoard) => { b.checks[1].id = b.checks[0].id; }],
    ["필수 검사 누락", (b: QualityBoard) => { b.checks.pop(); }],
    ["core를 테스트로 재분류", (b: QualityBoard) => { b.checks[10].group = "tests"; }],
    ["음수 테스트", (b: QualityBoard) => { b.checks[0].stats.passed = -1; }],
    ["빈 통계를 숫자로 전달", (b: QualityBoard) => Object.assign(b.checks[0].stats, { passed: "" })],
    ["안전한 정수 초과", (b: QualityBoard) => { b.checks[0].stats.total = Number.MAX_SAFE_INTEGER + 1; }],
    ["소수 테스트 수", (b: QualityBoard) => { b.checks[0].stats.failed = 0.5; }],
    ["통계 합계 불일치", (b: QualityBoard) => { b.checks[0].stats = { passed: 9, failed: 1, skipped: 0, total: 99, duration: null }; }],
    ["부분 합계의 전체 초과", (b: QualityBoard) => { b.checks[0].stats = { passed: 11, failed: null, skipped: null, total: 10, duration: null }; }],
    ["완료와 실패 통계 모순", (b: QualityBoard) => { b.checks[0].status = "done"; b.checks[0].stats.failed = 1; }],
    ["시간대 없는 시각", (b: QualityBoard) => { b.checks[0].executedAt = "2026-11-12T07:00:00"; }],
    ["존재하지 않는 날짜", (b: QualityBoard) => { b.checks[0].executedAt = "2026-02-31T07:00:00Z"; }],
    ["미래 실행 시각", (b: QualityBoard) => { b.checks[0].executedAt = "2026-11-12T09:00:00Z"; }],
    ["잘못된 TTL", (b: QualityBoard) => { b.ttlHours = 0; }],
  ])("%s를 가져오기 전에 거부한다", (_label, mutate) => {
    const board = createQualityBoard(NOW);
    mutate(board);
    expect(() => validateQualityBoard(board, NOW)).toThrow();
  });

  it.each(["javascript:alert(1)", "data:text/html,test", "https://user:password@example.com/log", "//example.com/log"])("로그 URL %s를 차단한다", value => {
    const board = createQualityBoard(NOW);
    board.checks[0].logUrl = value;
    expect(() => validateQualityBoard(board, NOW)).toThrow(/http/u);
    expect(isQualityHttpUrl(value)).toBe(false);
  });

  it("Testifly와 승인 작업의 상태를 가져오기로 바꿀 수 없다", () => {
    const active = createQualityBoard(NOW);
    Object.assign(active.qa, { integration: "active" });
    expect(() => validateQualityBoard(active, NOW)).toThrow(/reference-only/u);
    for (const id of ["code", "deploy", "account"] as const) {
      const board = createQualityBoard(NOW);
      Object.assign(board.approvals.find(a => a.id === id)!, { status: "done" });
      expect(() => validateQualityBoard(board, NOW)).toThrow(/승인 대기/u);
    }
    const duplicate = createQualityBoard(NOW);
    duplicate.approvals[2].id = "code";
    expect(() => validateQualityBoard(duplicate, NOW)).toThrow(/중복/u);
  });

  it("위험한 중첩 JSON 키와 과도한 깊이·항목 수를 차단한다", () => {
    for (const key of ["__proto__", "constructor", "prototype"]) {
      const board = createQualityBoard(NOW);
      board.checks[0].ciJson = JSON.parse(`{"nested":{"${key}":{}}}`) as QualityJsonObject;
      expect(() => validateQualityBoard(board, NOW)).toThrow(/키/u);
    }
    const deep = createQualityBoard(NOW);
    let nested: QualityJsonObject = {};
    for (let depth = 0; depth < 22; depth += 1) nested = { child: nested };
    deep.checks[0].ciJson = nested;
    expect(() => validateQualityBoard(deep, NOW)).toThrow(/중첩/u);
    deep.checks[0].ciJson = { entries: Array.from({ length: 10_000 }, () => null) };
    expect(() => validateQualityBoard(deep, NOW)).toThrow(/항목 수/u);
  });

  it("JSON 문법과 UTF-8 2MB 크기를 검증하며 원본 객체를 바꾸지 않는다", () => {
    expect(() => parseQualityBoardJson("{bad", NOW)).toThrow(/문법/u);
    expect(() => parseQualityBoardJson(" ".repeat(QUALITY_JSON_MAX_LENGTH + 1), NOW)).toThrow(/2MB/u);
    expect(() => parseQualityBoardJson(`{"large":"${"가".repeat(700_000)}"}`, NOW)).toThrow(/2MB/u);
    const board = createQualityBoard(NOW);
    const before = JSON.stringify(board);
    const normalized = validateQualityBoard(board, NOW);
    normalized.checks[0].summary = "별도 객체";
    expect(JSON.stringify(board)).toBe(before);
  });
});

describe("CI 근거의 최신성과 통계", () => {
  it("미등록·형식 오류·SHA 차이·TTL 초과를 구분한다", () => {
    const board = createQualityBoard(NOW);
    const fresh = freshCheck(board);
    expect(getFreshness(board.checks[0], board, NOW).kind).toBe("missing");
    expect(getFreshness({ ...fresh, scope: " " }, board, NOW).kind).toBe("missing");
    expect(getFreshness({ ...fresh, sha: "a".repeat(40) }, board, NOW).label).toContain("SHA 불일치");
    expect(getFreshness({ ...fresh, executedAt: "2026-11-11T07:00:00Z" }, board, NOW).label).toContain("TTL 초과");
    expect(getFreshness({ ...fresh, executedAt: "2026-11-12T09:00:00Z", scope: "" }, board, NOW).kind).toBe("invalid");
    expect(getFreshness(fresh, board, NOW).kind).toBe("fresh");
  });

  it("완료 상태와 유효 완료를 분리하고 TTL 경계에서 다시 계산한다", () => {
    const board = createQualityBoard(NOW);
    board.checks[0] = { ...freshCheck(board), status: "done" };
    expect(summarizeQualityBoard(board, NOW)).toMatchObject({ byStatus: { done: 1 }, fresh: 1, validCompleted: 1 });
    const expired = summarizeQualityBoard(board, NOW + 25 * 3_600_000);
    expect(expired.byStatus.done).toBe(1);
    expect(expired.validCompleted).toBe(0);
    expect(expired.stale).toBe(1);
    board.commit.sha = "b".repeat(40);
    expect(summarizeQualityBoard(board, NOW).validCompleted).toBe(0);
  });

  it("실패라도 근거는 fresh일 수 있고 외부 QA·core 통계를 합산하지 않는다", () => {
    const board = createQualityBoard(NOW);
    board.checks[0] = { ...freshCheck(board), status: "failed", stats: { passed: 9, failed: 1, skipped: 0, total: 10, duration: 1.5 } };
    board.checks[10].stats = { passed: 999, failed: 0, skipped: 0, total: 999, duration: 100 };
    board.qa.results.push({ id: "external", title: "외부 QA 완료", status: "done", sha: board.commit.sha, executedAt: "2026-11-12T07:00:00Z", url: "", summary: "참고 결과" });
    const summary = summarizeQualityBoard(board, NOW);
    expect(summary.fresh).toBe(1);
    expect(summary.validCompleted).toBe(0);
    expect(summary.testStats).toMatchObject({ passed: 9, failed: 1, total: 10, duration: 1.5, recordedChecks: 1, incomplete: true });
    expect(summarizeQualityBoard(createQualityBoard(NOW), NOW).testStats).toMatchObject({ passed: null, failed: null, total: null, recordedChecks: 0 });
  });

  it("전용 게이트와 한도 내 감사 이력을 추가하며 원본을 변경하지 않는다", () => {
    const board = createQualityBoard(NOW);
    const gate = createQualityGate({ name: "전용 게이트", subtitle: "별도 검증", command: "참조만", source: "검토 문서" }, "gate-custom");
    expect(gate).toMatchObject({ group: "gates", status: "unknown", ciJson: null });
    board.checks.push(gate);
    expect(validateQualityBoard(board, NOW).checks).toHaveLength(13);
    let current = board;
    for (let index = 0; index < QUALITY_HISTORY_LIMIT + 5; index += 1) current = appendQualityHistory(current, `기록 ${index}`, NOW, `history-${index}`);
    expect(current.history).toHaveLength(QUALITY_HISTORY_LIMIT);
    expect(current.history[0].text).toBe(`기록 ${QUALITY_HISTORY_LIMIT + 4}`);
    expect(board.history).toHaveLength(0);
  });
});
