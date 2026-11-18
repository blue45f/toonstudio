import { describe, expect, it } from "vitest";

import {
  createAdminWorkspace, createWorkspaceRecord, freezeWorkspaceDocument, importAdminWorkspace,
  parseAdminWorkspace, parseAdminWorkspaceSave, parseAdminWorkspaceSaveAck, updateWorkspaceRecord,
  validateWorkspaceTransition, workspaceEvidenceIssues, workspaceFreshness, workspacePreflight,
  workspaceSubmissionChanges, workspaceNumeric, workspaceDate,
} from "./index";

import type { AdminWorkspace, WorkspaceRecord } from "./types";

const now = new Date("2026-11-18T03:00:00Z");
function verifiedRecord(): WorkspaceRecord {
  return {
    ...createAdminWorkspace().records.find(record => record.id === "claim-01")!,
    text: "검증용 가상 주장", sourceTitle: "가상 연구 원문", sourceUrl: "https://example.com/research",
    sourceDate: "2026-11-17", quote: "가상 자료 1쪽", reviewer: "검토 담당", verifiedAt: "2026-11-18",
    verificationNote: "원문의 정의와 범위를 대조함", factStatus: "확인",
  };
}
function withVerifiedRecord(): AdminWorkspace {
  const state = createAdminWorkspace(); const verified = verifiedRecord();
  return { ...state, records: state.records.map(record => record.id === verified.id ? verified : record) };
}
function legacyFixture() {
  const state = createAdminWorkspace();
  return {
    kind: "toonstudio-admin-integration", schemaVersion: 1, savedAt: now.toISOString(),
    business: {
      schemaVersion: 1,
      tasks: state.records.filter(record => record.recordType === "task").map(record => ({ ...record, evidenceUrl: record.sourceUrl, source: record.sourceTitle, priority: "보통", updatedAt: "" })),
      claims: state.records.filter(record => record.recordType === "claim").map(record => ({ ...record, updatedAt: "" })),
      documents: state.documents, mentor: state.mentor, checklist: state.checklist, approvals: state.approvals, settings: state.settings, activity: [],
    },
    operations: {
      schemaVersion: 1, activity: [], savedAt: "", records: [{
        ...createWorkspaceRecord("cloud-sample", "cloud", "operation"), title: "가상 클라우드 변경 요청",
        category: "외부 배포", approvalOnly: true, approvalReason: "실행 승인 대기", status: "승인 대기",
        sourceId: "source-cloud", sourceRecordId: "sample", raw: { originalLabel: "원문 유지" }, evidence: [],
      }],
    },
  };
}

describe("관리자 작업실 공통 계약", () => {
  it("11개 사업 과업과 미확인 수치·승인 전용 기록으로 시작한다", () => {
    const state = createAdminWorkspace();
    expect(state.records.filter(record => record.recordType === "task")).toHaveLength(11);
    expect(state.records.every(record => record.factStatus === "미확인" && record.value === null)).toBe(true);
    expect(state.approvals.every(item => item.status === "승인 대기")).toBe(true);
    expect(parseAdminWorkspace(state, now).ok).toBe(true);
    expect(workspacePreflight(state, now).some(gate => gate.tone === "bad")).toBe(true);
  });
  it("중복 ID와 참조가 없는 원문 연결을 거부한다", () => {
    const state = createAdminWorkspace(); state.records.push({ ...state.records[0] });
    expect(parseAdminWorkspace(state, now).errors.join(" ")).toContain("중복 ID");
    state.records.pop(); state.records[0].origin = { importId: "missing", sourceId: "source", sourceRecordId: "one", raw: {} };
    expect(parseAdminWorkspace(state, now).errors.join(" ")).toContain("가져오기 기록");
  });
  it("실행 URL·자격증명 URL·미래 날짜·유효하지 않은 날짜를 거부한다", () => {
    for (const sourceUrl of ["javascript:alert(1)", "https://user:password@example.com", "file:///tmp/example"]) {
      const state = createAdminWorkspace(); state.records[0].sourceUrl = sourceUrl;
      expect(parseAdminWorkspace(state, now).ok).toBe(false);
    }
    for (const verifiedAt of ["2026-11-19", "2026-02-30", "2026-11-17T25:10:00Z"]) {
      const state = createAdminWorkspace(); state.records[0].verifiedAt = verifiedAt;
      expect(parseAdminWorkspace(state, now).ok).toBe(false);
    }
  });
  it("객체 오염·순환·과도한 텍스트·비유한 수치를 거부한다", () => {
    const state = createAdminWorkspace(); state.records[0].value = Number.NaN;
    expect(parseAdminWorkspace(state, now).ok).toBe(false);
    expect(parseAdminWorkspace(JSON.parse('{"__proto__":{"admin":true}}'), now).ok).toBe(false);
    const cyclic: { self?: unknown } = {}; cyclic.self = cyclic;
    expect(parseAdminWorkspace(cyclic, now).ok).toBe(false);
    state.records[0].value = null; state.records[0].notes = "x".repeat(30_001);
    expect(parseAdminWorkspace(state, now).ok).toBe(false);
  });
  it("확인 표시만 있고 근거가 없는 수치를 통과시키지 않는다", () => {
    const state = createAdminWorkspace(); state.records[0].factStatus = "확인";
    expect(parseAdminWorkspace(state, now).ok).toBe(false);
    const record = { ...verifiedRecord(), kind: "숫자" as const, value: null };
    expect(workspaceEvidenceIssues(record, now).join(" ")).toContain("확인된 수치");
    expect(workspaceEvidenceIssues({ ...record, value: 0, unit: "명", period: "가상 기간", scope: "가상 표본" }, now)).toEqual([]);
  });
  it("같은 출처의 추적 URL 차이를 독립 교차검증으로 인정하지 않는다", () => {
    const record = { ...verifiedRecord(), kind: "비교" as const, scope: "가상 조건", secondSourceTitle: "다른 표시", secondSourceUrl: "https://example.com/research?utm_source=duplicate#section", verificationNote: "독립성: 서로 다른 발행기관과 조사자료의 원문을 대조함" };
    expect(workspaceEvidenceIssues(record, now).join(" ")).toContain("같은 원출처");
    expect(workspaceEvidenceIssues({ ...record, secondSourceUrl: "https://example.org/independent" }, now)).toEqual([]);
  });
  it("매출 전망은 수치뿐 아니라 산식과 가정을 요구한다", () => {
    const record = { ...verifiedRecord(), kind: "매출 전망" as const, value: 10, unit: "가상 통화", period: "가상 기간", scope: "가상 시장", secondSourceTitle: "두 번째 가상 연구", secondSourceUrl: "https://example.org/source", verificationNote: "독립성: 각 발행기관의 조사방법과 표본을 대조함" };
    expect(workspaceEvidenceIssues(record, now).join(" ")).toContain("산식");
  });
  it("주장 또는 원문 변경 시 검증과 최종 확인을 해제한다", () => {
    const state = withVerifiedRecord(); state.records.find(record => record.id === "claim-01")!.status = "최종 확인";
    const result = updateWorkspaceRecord(state, { id: "claim-01", text: "달라진 가상 주장" }, now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const record = result.value.records.find(item => item.id === "claim-01")!;
      expect(record.factStatus).toBe("미확인"); expect(record.verifiedAt).toBe(""); expect(record.status).toBe("검토 필요");
    }
  });
  it("서버 전환 검증도 클라이언트 검증 해제 우회를 거부한다", () => {
    const before = withVerifiedRecord(); const after = structuredClone(before);
    after.records.find(record => record.id === "claim-01")!.sourceUrl = "https://example.com/changed";
    expect(validateWorkspaceTransition(before, after, now).join(" ")).toContain("검증을 해제");
    expect(validateWorkspaceTransition(null, before, now).join(" ")).toContain("미확인으로 등록");
  });
  it("오래된 저장 기록은 조회하되 새 최종 전환은 차단한다", () => {
    const state = withVerifiedRecord(); const record = state.records.find(item => item.id === "claim-01")!;
    record.verifiedAt = "2026-09-01"; record.sourceDate = "2026-09-01";
    expect(parseAdminWorkspace(state, now).ok).toBe(true);
    expect(workspaceFreshness(record, now).tone).toBe("warn");
    expect(updateWorkspaceRecord(state, { id: record.id, status: "최종 확인" }, now).ok).toBe(false);
    record.status = "최종 확인";
    expect(parseAdminWorkspace(state, now).ok).toBe(true);
  });
  it("외부 실행 항목의 승인 상태와 원문을 약화할 수 없다", () => {
    const imported = importAdminWorkspace(legacyFixture(), undefined, now); expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const state = imported.value; const next = structuredClone(state);
    const record = next.records.find(item => item.id === "cloud-sample")!; record.approvalOnly = false; record.category = "조사"; record.status = "초안";
    expect(validateWorkspaceTransition(state, next, now).join(" ")).toContain("승인 제한");
    const tampered = structuredClone(state); tampered.imports[0].archive = {};
    expect(validateWorkspaceTransition(state, tampered, now).join(" ")).toContain("원문");
  });
  it("문서 고정본과 근거 변경을 추적하고 기존 고정본을 지우지 않는다", () => {
    const state = createAdminWorkspace(); state.documents[0].working.content = "가상 작업 문서";
    const frozen = freezeWorkspaceDocument(state, "doc-1", "snapshot-1", now); expect(frozen.ok).toBe(true);
    if (!frozen.ok) return;
    expect(workspaceSubmissionChanges(frozen.value.documents[0], frozen.value)).toEqual([]);
    const changed = structuredClone(frozen.value); changed.mentor[0].notes = "변경된 반영 근거";
    expect(workspaceSubmissionChanges(changed.documents[0], changed)).toHaveLength(1);
    changed.documents[0].submission!.content = "고정본 덮어쓰기";
    expect(validateWorkspaceTransition(frozen.value, changed, now).join(" ")).toContain("고정");
    const second = freezeWorkspaceDocument(frozen.value, "doc-1", "snapshot-2", now);
    expect(second.ok && second.value.documents[0].history[0].id).toBe("snapshot-1");
  });
  it("빈 제출 목록·모든 주장 제외·근거 없는 체크 완료를 준비 완료로 처리하지 않는다", () => {
    const state = createAdminWorkspace(); state.documents.forEach(document => { document.purpose = "reference"; });
    state.records.forEach(record => { if (record.recordType === "claim") record.factStatus = "제외"; });
    state.checklist.forEach(item => { item.done = true; });
    const gates = workspacePreflight(state, now);
    expect(gates.find(gate => gate.id === "coverage")!.count).toBeGreaterThan(0);
    expect(gates.find(gate => gate.id === "checklist")!.count).toBe(state.checklist.length);
  });
  it("legacy 전체 원문을 보존하고 같은 백업은 중복 등록하지 않는다", () => {
    const fixture = legacyFixture(); const first = importAdminWorkspace(fixture, createAdminWorkspace(), now);
    expect(first.ok).toBe(true); if (!first.ok) return;
    expect(first.value.imports[0].archive).toEqual(fixture);
    expect(first.value.records).toHaveLength(21);
    expect(first.value.records.every(record => record.factStatus === "미확인")).toBe(true);
    const second = importAdminWorkspace(fixture, first.value, now);
    expect(second.ok && second.value).toEqual(first.value);
  });
  it("추가 import가 현재 담당자 메모를 덮어쓰지 않는다", () => {
    const state = createAdminWorkspace(); state.records[0].notes = "현재 담당자의 수정";
    const fixture = legacyFixture(); fixture.business.tasks[0].notes = "백업의 오래된 메모";
    const result = importAdminWorkspace(fixture, state, now); expect(result.ok).toBe(true);
    if (result.ok) { expect(result.value.records[0].notes).toBe("현재 담당자의 수정"); expect(result.value.imports).toHaveLength(1); }
  });
  it("이전 확인·완료 기록을 현재 검증으로 자동 승격하지 않는다", () => {
    const fixture = legacyFixture(); fixture.business.claims[0].factStatus = "확인"; fixture.business.claims[0].verifiedAt = "2026-11-18";
    fixture.business.mentor[0].status = "반영 완료"; fixture.business.checklist[0].done = true;
    const result = importAdminWorkspace(fixture, undefined, now); expect(result.ok).toBe(true);
    if (result.ok) { expect(result.value.records.find(item => item.id === "claim-01")!.factStatus).toBe("미확인"); expect(result.value.mentor[0].status).toBe("미반영"); expect(result.value.checklist[0].done).toBe(false); }
  });
  it("복구 파일은 검증된 working만 읽고 저장 원문 문자열을 실행하지 않는다", () => {
    const result = importAdminWorkspace({ kind: "toonstudio-admin-recovery", schemaVersion: 1, storedRaw: "not JSON", legacyRaw: null, working: legacyFixture() }, undefined, now);
    expect(result.ok).toBe(true);
    expect(importAdminWorkspace({ kind: "toonstudio-admin-recovery", schemaVersion: 1, storedRaw: {}, legacyRaw: null, working: legacyFixture() }, undefined, now).ok).toBe(false);
  });
  it("legacy 불명확 모듈과 중복 ID를 조용히 버리지 않는다", () => {
    const fixture = legacyFixture(); const bad = { ...fixture, operations: { ...fixture.operations, records: [{ ...fixture.operations.records[0], module: "unknown" }] } };
    expect(importAdminWorkspace(bad, undefined, now).ok).toBe(false);
    fixture.business.tasks.push({ ...fixture.business.tasks[0] });
    expect(importAdminWorkspace(fixture, undefined, now).errors.join(" ")).toContain("중복 ID");
  });
  it("저장 revision·mutation UUID·서버 응답을 경계에서 검증한다", () => {
    const state = createAdminWorkspace();
    expect(parseAdminWorkspaceSave({ expectedRevision: 0, mutationId: "12345678-1234-1234-1234-123456789abc", state }, now).ok).toBe(true);
    expect(parseAdminWorkspaceSave({ expectedRevision: -1, mutationId: "bad", state }, now).ok).toBe(false);
    expect(parseAdminWorkspaceSaveAck({ boardId: "toonstudio", revision: 1, updatedAt: now.toISOString(), replayed: false }).ok).toBe(true);
    expect(parseAdminWorkspaceSaveAck({ boardId: "toonstudio", revision: 0, updatedAt: now.toISOString(), replayed: false }).ok).toBe(false);
  });
  it("숫자의 천 단위 구분을 엄격히 검사하고 잘못된 쉼표를 추측하지 않는다", () => {
    expect(workspaceNumeric("1,000.25")).toBe(true); expect(workspaceNumeric("-12,345,678")).toBe(true);
    for (const value of ["1,2", "1,,2", "12,34,567", "1e6", "미확인"]) expect(workspaceNumeric(value)).toBe(false);
  });
  it("검증일은 서울 날짜 경계와 시간 필드 범위를 지킨다", () => {
    expect(workspaceDate("2026-11-18")).toBe(Date.parse("2026-11-17T15:00:00Z"));
    expect(workspaceDate("2026-11-18T24:00:00Z")).toBeNull();
    expect(workspaceDate("2026-11-18T12:60:00Z")).toBeNull();
    const record = { ...verifiedRecord(), verifiedAt: "2026-11-11T03:00:00Z", sourceDate: "2026-11-01", freshnessDays: 7 };
    expect(workspaceFreshness(record, now).tone).toBe("good");
    expect(workspaceFreshness(record, new Date(now.getTime() + 1)).tone).toBe("warn");
  });
  it("원문 archive와 연결 raw가 서로 다르거나 원문 ID가 사라지면 거부한다", () => {
    const imported = importAdminWorkspace(legacyFixture(), undefined, now); expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const altered = structuredClone(imported.value); altered.records[0].origin!.raw = { id: "task-01", title: "변조" };
    expect(parseAdminWorkspace(altered, now).errors.join(" ")).toContain("일치하지");
    const duplicate = structuredClone(imported.value); duplicate.records.push({ ...duplicate.records[0], id: "duplicate-link" });
    expect(parseAdminWorkspace(duplicate, now).errors.join(" ")).toContain("원문 항목 연결이 중복");
    const missing = structuredClone(imported.value); missing.imports[0].archive = { kind: "toonstudio-admin-integration", schemaVersion: 1, business: { tasks: [], claims: [] }, operations: { records: [] } };
    expect(parseAdminWorkspace(missing, now).ok).toBe(false);
  });
  it("원문 없는 native 승인 전용 기록도 가져오기 후 제한을 약화할 수 없다", () => {
    const state = createAdminWorkspace(); state.records.push({ ...createWorkspaceRecord("manual-approval", "cloud", "operation"), approvalOnly: true, status: "승인 대기", approvalReason: "별도 승인 필요" });
    const imported = importAdminWorkspace(state, undefined, now); expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const after = structuredClone(imported.value); after.records.find(record => record.id === "manual-approval")!.approvalOnly = false;
    expect(validateWorkspaceTransition(imported.value, after, now).join(" ")).toContain("승인 제한");
  });
  it("멘토·점검 삭제와 근거 변경 후 완료 표시 유지를 차단한다", () => {
    const before = createAdminWorkspace(); before.mentor[0].status = "반영 완료"; before.checklist[0].done = true; before.checklist[0].verifiedAt = "2026-11-18";
    const removed = structuredClone(before); removed.mentor.shift(); removed.checklist.shift();
    expect(validateWorkspaceTransition(before, removed, now).join(" ")).toContain("삭제할 수 없습니다");
    const changed = structuredClone(before); changed.mentor[0].source = "달라진 요청"; changed.checklist[0].source = "달라진 기준";
    expect(validateWorkspaceTransition(before, changed, now)).toHaveLength(2);
    changed.mentor[0].status = "미반영"; changed.checklist[0].done = false; changed.checklist[0].verifiedAt = "";
    expect(validateWorkspaceTransition(before, changed, now)).toEqual([]);
  });
  it("제외에는 사유가 필요하고 문서 이름·용도·버전도 고정 후 변경으로 추적한다", () => {
    const state = createAdminWorkspace(); state.records[0].factStatus = "제외";
    expect(parseAdminWorkspace(state, now).errors.join(" ")).toContain("제외 사유");
    state.records[0].notes = "대상 범위와 무관한 가상 항목"; state.documents[0].working.content = "가상 내용";
    const frozen = freezeWorkspaceDocument(state, "doc-1", "metadata-snapshot", now); expect(frozen.ok).toBe(true);
    if (!frozen.ok) return;
    for (const field of ["title", "purpose", "label"]) {
      const changed = structuredClone(frozen.value);
      if (field === "title") changed.documents[0].title = "새 제목";
      if (field === "purpose") changed.documents[0].purpose = "reference";
      if (field === "label") changed.documents[0].working.label = "작업본 v2";
      expect(workspaceSubmissionChanges(changed.documents[0], changed).length).toBeGreaterThan(0);
    }
  });

  it("native 첫 이관에서 과거 검증을 내리되 원래 검증일·메모를 불변 원문에 남긴다", () => {
    const source = withVerifiedRecord();
    const imported = importAdminWorkspace(source, createAdminWorkspace(), now); expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const record = imported.value.records.find(item => item.id === "claim-01")!;
    expect(record.factStatus).toBe("미확인"); expect(record.verifiedAt).toBe("");
    expect(imported.value.imports).toHaveLength(1); expect(imported.value.imports[0].format).toBe("native-backup");
    expect(imported.value.imports[0].archive).toEqual(source);
    const repeated = importAdminWorkspace(source, imported.value, now);
    expect(repeated.ok && repeated.value).toEqual(imported.value);
    const tampered = structuredClone(imported.value); tampered.imports[0].archive = {};
    expect(validateWorkspaceTransition(imported.value, tampered, now).length).toBeGreaterThan(0);
  });
  it("변환이 없는 미확인 native 백업은 불필요한 원문 사본을 만들지 않는다", () => {
    const source = createAdminWorkspace(); const result = importAdminWorkspace(source, undefined, now);
    expect(result.ok && result.value.imports).toEqual([]);
  });
  it("과거 검증 원문 보존으로 출력이 12MiB를 넘으면 적용하지 않는다", () => {
    const source = withVerifiedRecord();
    source.documents = Array.from({ length: 27 }, (_, index) => ({ ...source.documents[0], id: `large-doc-${index}`, working: { ...source.documents[0].working, content: "x".repeat(249_000) } }));
    expect(parseAdminWorkspace(source, now).ok).toBe(true);
    const result = importAdminWorkspace(source, undefined, now);
    expect(result.ok).toBe(false); expect(result.errors.join(" ")).toContain("12MiB");
  });

  it("저장 envelope의 임의 사용자·보드·실행 플래그를 거부한다", () => {
    const request = { expectedRevision: 0, mutationId: "12345678-1234-1234-1234-123456789abc", state: createAdminWorkspace() };
    for (const field of ["userId", "boardId", "execute", "canEdit"]) {
      expect(parseAdminWorkspaceSave({ ...request, [field]: "unexpected" }, now).errors.join(" ")).toContain("허용되지 않은 필드");
    }
  });

});
