import { describe, expect, it } from "vitest";

import {
  APPROVAL_TYPES,
  createEmptyBusinessPlanState,
  createSubmissionSnapshot,
  diffLines,
  effectiveFact,
  freshness,
  getChecks,
  parseBusinessPlanState,
  safeUrl,
  stats,
  todayKst,
  validateClaim,
  validateImport,
} from "../business-plan";

import type { BusinessPlanClaim, BusinessPlanDocument, BusinessPlanState } from "../business-plan";

const NOW = new Date("2024-02-01T12:00:00Z");
const blank = (): BusinessPlanState => createEmptyBusinessPlanState(NOW);
const checkedClaim = (overrides: Partial<BusinessPlanClaim> = {}): BusinessPlanClaim => ({
  ...blank().claims[0],
  title: "합성 자료의 항목 수", text: "합성 시험에서 센 항목 수", kind: "수치", value: "0", unit: "건",
  period: "2024-01", scope: "합성 시험 자료", factStatus: "근거 확인",
  sourceUrl: "https://example.com/report", sourceTitle: "합성 검증 자료", publisher: "테스트 발행자",
  publishedAt: "2024-01-30", sourceLocation: "표 A", originalExcerpt: "시험 데이터의 집계 기준을 대조함",
  verifiedAt: "2024-01-31", reviewer: "테스트 검토자", updatedAt: "2024-01-30T12:00:00Z",
  ...overrides,
});
const withClaim = (claim: BusinessPlanClaim): BusinessPlanState => {
  const board = blank();
  board.claims[0] = claim;
  return board;
};

describe("사업계획서 공개 템플릿과 v1 교환", () => {
  it("API와 Admin에서 같은 공개 진입점으로 계약을 가져온다", async () => {
    const contract = await import("@toonstudio/contracts/business-plan");
    expect(contract.parseBusinessPlanState(contract.createEmptyBusinessPlanState(NOW), NOW).ok).toBe(true);
  });

  it("개인 원문 없이 요청된 항목을 미확인 상태로 생성한다", () => {
    const state = blank();
    expect(validateImport(state, NOW)).toEqual({ ok: true, errors: [] });
    expect(state.tasks).toHaveLength(11);
    expect(state.claims).toHaveLength(16);
    expect(state.documents).toHaveLength(2);
    expect(state.checks).toHaveLength(8);
    expect(state.mentor).toEqual([]);
    expect(state.approvals.map((item) => item.type)).toEqual([...APPROVAL_TYPES]);
    expect(state.approvals.every((item) => item.status === "승인 대기")).toBe(true);
    expect(state.claims.every((item) => item.factStatus === "미확인" && item.value === "" && item.verifiedAt === "")).toBe(true);
    expect(state.project.deadlines.every((item) => !item.at && !item.sourceUrl && !item.verified)).toBe(true);
    expect(state.documents.every((item) => !item.workingText && !item.previousText && !item.fileName && !item.sourceUrl)).toBe(true);
    expect(JSON.stringify(state)).not.toMatch(/https?:\/\/|@|libfile_|appgprj_|\.docx/);
  });

  it("서로 다른 보드에 같은 배열이나 문서 객체를 공유하지 않는다", () => {
    const first = blank();
    const second = blank();
    first.tasks[0].notes = "독립된 기록";
    first.documents[0].workingText = "첫 보드의 작업 원문";
    expect(second.tasks[0].notes).toBe("");
    expect(second.documents[0].workingText).toBe("");
  });

  it("기존 v1 JSON의 원문 공백·ISO 일정·이력·확장 메모를 왕복 보존한다", () => {
    const state = blank();
    state.project.deadlines[0].at = "2024-03-01T13:00:00+09:00";
    state.documents[0].workingText = "  첫 줄\n\n마지막 줄  \n";
    state.documents[0].previousText = "  이전 줄  \n";
    state.documents[0].history = [{ label: "", type: "작업용", text: "과거 내용\n", at: "2024-01-29T01:00:00Z" }];
    state.savedAt = "2024-02-01T11:00:00Z";
    const raw: unknown = JSON.parse(JSON.stringify({ ...state, extension: { note: "안전한 추가 기록" } }));
    const parsed = parseBusinessPlanState(raw, NOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.errors.join(" · "));
    expect(parsed.value).toEqual(raw);
    parsed.value.documents[0].workingText = "파싱 결과만 변경";
    expect(raw).toMatchObject({ documents: [{ workingText: "  첫 줄\n\n마지막 줄  \n" }, {}] });
  });

  it("초기 v1의 선택 텍스트와 담당 작업 별칭을 잃지 않고 정규화한다", () => {
    const state = blank();
    const { assignment: omittedAssignment, notes: omittedNotes, ...legacyTask } = state.tasks[0];
    void omittedAssignment;
    void omittedNotes;
    const parsed = parseBusinessPlanState({
      ...state,
      tasks: [{ ...legacyTask, assignedWork: "원문 대조", note: "기존 메모" }, ...state.tasks.slice(1)],
    }, NOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.errors.join(" · "));
    expect(parsed.value.tasks[0]).toMatchObject({ assignment: "원문 대조", assignedWork: "원문 대조", notes: "기존 메모", note: "기존 메모" });
  });
});

describe("주장 검증과 최신성", () => {
  it("작업의 최종 확인이 주장 사실 확인으로 전파되지 않는다", () => {
    const state = blank();
    state.tasks.forEach((item) => { item.status = "최종 확인"; });
    expect(stats(state, NOW)).toMatchObject({ completedTasks: 11, finalTasks: 11, unknownClaims: 16, verifiedClaims: 0 });
    expect(getChecks(state, NOW).find((item) => item.id === "auto-tasks")?.pass).toBe(true);
    expect(getChecks(state, NOW).find((item) => item.id === "auto-evidence")?.pass).toBe(false);
  });

  it("확인된 0과 비어 있거나 미확인으로 적힌 수치를 구분한다", () => {
    const zero = checkedClaim();
    expect(validateClaim(zero, NOW).ok).toBe(true);
    expect(effectiveFact(zero, NOW)).toBe("근거 확인");
    expect(parseBusinessPlanState(withClaim(zero), NOW).ok).toBe(true);
    for (const value of ["", "미확인", "—"]) {
      expect(validateClaim({ ...zero, value }, NOW).ok).toBe(false);
      expect(effectiveFact({ ...zero, value }, NOW)).toBe("근거 부족");
    }
    expect(effectiveFact({ ...zero, factStatus: "미확인" }, NOW)).toBe("미확인");
  });

  it("링크만 있거나 확인 내용이 없으면 근거 확인 저장을 거부한다", () => {
    const missing = checkedClaim({ originalExcerpt: "", reviewer: "" });
    expect(validateClaim(missing, NOW).ok).toBe(false);
    expect(parseBusinessPlanState(withClaim(missing), NOW).ok).toBe(false);
    expect(validateClaim(checkedClaim({ sourceUrl: "javascript:alert(1)" }), NOW).ok).toBe(false);
    expect(validateClaim(checkedClaim({ originalExcerpt: "확인 필요" }), NOW).ok).toBe(false);
  });

  it("시장 교차검증에서 같은 원문의 추적 링크와 부분 링크를 제외한다", () => {
    const claim = checkedClaim({
      kind: "시장 규모", crossSourceUrl: "https://example.com/report/?utm_source=test#table",
      crossSourceTitle: "대조 자료", crossNotes: "범위·기간 대조",
    });
    expect(validateClaim(claim, NOW).errors.some((item) => item.includes("원문과 같습니다"))).toBe(true);
    expect(validateClaim({ ...claim, crossSourceUrl: "https://example.org/independent-report" }, NOW).ok).toBe(true);
    expect(validateClaim({ ...claim, crossSourceUrl: "https://example.org/independent-report", crossNotes: "" }, NOW).ok).toBe(false);
  });

  it("검토된 매출 전망도 확정 실적 대신 가정·산식으로 표시한다", () => {
    const claim = checkedClaim({
      kind: "매출 전망", crossSourceUrl: "https://example.org/assumptions", crossSourceTitle: "별도 가정 자료",
      crossNotes: "대상·기간과 입력값의 별도 근거를 대조", assumptions: "합성 시험의 좌석 가정", formula: "과금 좌석 × 적용 단가",
    });
    expect(validateClaim(claim, NOW).ok).toBe(true);
    expect(effectiveFact(claim, NOW)).toBe("가정·산식 검토");
    expect(validateClaim({ ...claim, assumptions: "" }, NOW).ok).toBe(false);
    expect(validateClaim({ ...claim, formula: "" }, NOW).ok).toBe(false);
  });

  it.each([
    [{ verifiedAt: "" }, "검증일 없음"],
    [{ verifiedAt: "2024-02-30" }, "검증일 오류"],
    [{ verifiedAt: "2024-02-02" }, "미래 검증일"],
    [{ publishedAt: "2024-02-01" }, "발행 후 재확인 필요"],
    [{ updatedAt: "2024-02-01T00:00:00Z" }, "검증 후 변경"],
    [{ reviewDays: 1 }, "재확인 필요"],
  ] satisfies [Partial<BusinessPlanClaim>, string][])("날짜 조건 %j을 %s로 표시한다", (overrides, label) => {
    expect(freshness(checkedClaim(overrides), NOW).label).toBe(label);
  });

  it("한국 날짜 경계와 정확한 시각의 미래 검증을 구분한다", () => {
    const boundary = new Date("2024-01-31T15:01:00Z");
    expect(todayKst(boundary)).toBe("2024-02-01");
    expect(freshness(checkedClaim({ verifiedAt: "2024-02-01" }), boundary).level).toBe("good");
    expect(freshness(checkedClaim({ verifiedAt: "2024-02-01T01:00:00+09:00" }), boundary).label).toBe("미래 검증일");
    expect(validateClaim(checkedClaim({ verifiedAt: "2024-02-02" }), NOW).ok).toBe(false);
  });
});

describe("문서 후보와 최종 점검", () => {
  it("작업 원문이 바뀌어도 제출 후보를 보존하고 새 후보는 이전 후보를 이력에 남긴다", () => {
    const original: BusinessPlanDocument = { ...blank().documents[0], workingText: "  첫 후보\n" };
    const first = createSubmissionSnapshot(original, "후보 A", NOW);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(first.errors.join(" · "));
    expect(original.submission).toBeNull();
    first.value.workingText = "두 번째 작업용\n";
    expect(first.value.submission?.text).toBe("  첫 후보\n");
    const state = blank();
    state.documents = [first.value];
    expect(getChecks(state, NOW).find((item) => item.id === "auto-version-match")?.pass).toBe(false);
    const second = createSubmissionSnapshot(first.value, "후보 B", new Date("2024-02-02T00:00:00Z"));
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error(second.errors.join(" · "));
    expect(first.value.history).toEqual([]);
    expect(second.value.history).toEqual([expect.objectContaining({ label: "후보 A", text: "  첫 후보\n", type: "제출 후보" })]);
    expect(second.value.submission?.text).toBe("두 번째 작업용\n");
    expect(createSubmissionSnapshot(blank().documents[0], "빈 후보", NOW).ok).toBe(false);
  });

  it("정확한 변경 전후 텍스트와 큰 변경 블록의 내용을 보존한다", () => {
    const before = "  A\n중복\n중복\n";
    const after = "  A\n새 줄\n중복\n";
    const difference = diffLines(before, after);
    expect(difference.filter((line) => line.type !== "add").map((line) => line.text).join("\n")).toBe(before);
    expect(difference.filter((line) => line.type !== "remove").map((line) => line.text).join("\n")).toBe(after);
    const largeBefore = "이전\n".repeat(6000);
    const largeAfter = "다음\n".repeat(6000);
    expect(diffLines(largeBefore, largeAfter)).toEqual([{ type: "remove", text: largeBefore }, { type: "add", text: largeAfter }]);
    expect(diffLines("", "")).toEqual([]);
  });

  it("체크 표시만으로 멘토 반영이나 수동 점검을 완료하지 않는다", () => {
    const state = blank();
    state.mentor = [{
      id: "MT-01", title: "합성 검토 요청", request: "시험용 요청", round: "", sourceUrl: "", taskId: "BP-01",
      documentId: "DOC-01", location: "", reflected: true, evidence: "", note: "",
    }];
    state.checks.forEach((item) => { item.checked = true; });
    expect(getChecks(state, NOW).find((item) => item.id === "auto-mentor")?.pass).toBe(false);
    expect(getChecks(state, NOW).find((item) => item.id === "auto-manual")?.pass).toBe(false);
    state.mentor[0].location = "시험 문단";
    state.mentor[0].evidence = "반영 전후의 문단을 대조함";
    state.checks.forEach((item) => { item.note = "합성 점검 수행 메모"; });
    expect(getChecks(state, NOW).find((item) => item.id === "auto-mentor")?.pass).toBe(true);
    expect(getChecks(state, NOW).find((item) => item.id === "auto-manual")?.pass).toBe(true);
  });
});

describe("가져오기 경계와 실행 금지", () => {
  it("승인 대기 네 유형을 삭제·중복·승인 완료로 바꾼 백업을 거부한다", () => {
    const state = blank();
    expect(validateImport({ ...state, approvals: state.approvals.slice(1) }, NOW).ok).toBe(false);
    expect(validateImport({ ...state, approvals: state.approvals.map((item) => ({ ...item, status: "승인 완료" })) }, NOW).ok).toBe(false);
    expect(validateImport({ ...state, approvals: state.approvals.map((item) => ({ ...item, type: "코드 수정" })) }, NOW).ok).toBe(false);
    expect(validateImport({ ...state, approvals: state.approvals.map((item) => ({ ...item, note: "검토 메모" })) }, NOW).ok).toBe(true);
  });

  it("잘못된 버전·타입·참조·중복 ID와 날짜를 저장 전에 거부한다", () => {
    const state = blank();
    const candidates: unknown[] = [
      { ...state, schemaVersion: 2 },
      { ...state, claims: null },
      { ...state, tasks: [{ ...state.tasks[0], status: "완료" }] },
      { ...state, claims: [{ ...state.claims[0], value: 0 }] },
      { ...state, claims: [{ ...state.claims[0], taskId: "missing" }] },
      { ...state, tasks: [state.tasks[0], { ...state.tasks[0] }] },
      { ...state, documents: [{ ...state.documents[0], updatedAt: "2024-02-30" }] },
      { ...state, documents: [{ ...state.documents[0], updatedAt: "2024-02-01T24:00:00Z" }] },
      { ...state, project: { ...state.project, deadlines: [{ ...state.project.deadlines[0], verified: true }] } },
    ];
    for (const candidate of candidates) expect(parseBusinessPlanState(candidate, NOW).ok).toBe(false);
  });

  it("URL에 스크립트·인증 정보·제어 문자를 허용하지 않는다", () => {
    const authenticatedUrl = new URL("https://example.com");
    authenticatedUrl.username = "fixture-user";
    authenticatedUrl.password = "fixture-password";
    for (const url of ["javascript:alert(1)", "data:text/html,test", authenticatedUrl.href, "https://example.com/\npath"]) {
      expect(safeUrl(url)).toBe("");
      expect(validateImport({ ...blank(), claims: [{ ...blank().claims[0], sourceUrl: url }] }, NOW).ok).toBe(false);
    }
    expect(safeUrl("https://example.com/report#table")).toBe("https://example.com/report#table");
  });

  it("원형·오염 속성·실행 속성과 UTF-8 크기 초과를 차단한다", () => {
    const state = blank();
    const pollution: unknown = JSON.parse('{"__proto__":{"polluted":true}}');
    expect(validateImport({ ...state, extension: pollution }, NOW).ok).toBe(false);
    const circular: Record<string, unknown> = { ...state };
    circular.self = circular;
    expect(validateImport(circular, NOW).ok).toBe(false);
    expect(validateImport({ ...state, tasks: new Array(2) }, NOW).errors).toEqual(["비어 있는 배열 항목은 가져올 수 없습니다."]);
    const withGetter: Record<string, unknown> = { ...state };
    Object.defineProperty(withGetter, "extension", { enumerable: true, get() { throw new Error("실행되면 안 됨"); } });
    expect(validateImport(withGetter, NOW).errors).toEqual(["실행 가능한 속성은 가져올 수 없습니다."]);
    const oversize = blank();
    oversize.documents[0].workingText = "가".repeat(400_000);
    oversize.documents[1].workingText = "나".repeat(400_000);
    expect(validateImport(oversize, NOW).errors).toEqual(["가져오기 파일은 2MiB 이하여야 합니다."]);
  });
});
