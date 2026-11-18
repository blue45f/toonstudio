import { describe, expect, it } from "vitest";

import {
  aiOperationsEvidenceAge, MAX_AI_OPERATIONS_BYTES, parseAiOperationsImport,
  parseAiOperationsSave, parseAiOperationsSnapshot, safeEvidenceUrl, STATUSES,
  type BoardItem, type BoardSnapshot,
} from "./ai-operations";

const now = Date.parse("2026-11-18T04:00:00.000Z");
const observedAt = "2026-11-17T01:00:00Z";
const commit = "a".repeat(40);
const commitUrl = `https://github.com/blue45f/toonstudio/commit/${commit}`;
function item(): BoardItem {
  return {
    id: "sample-model", type: "model", provider: "Cloudflare", title: "검토할 모델", description: "합성 검증 자료",
    status: "미확인", priority: "P1", assurance: "미확인", fields: [
      { key: "frequency", label: "호출 빈도", value: "미확인" },
      { key: "window", label: "측정 구간", value: "알림 발송 전 24시간, 정확한 시작·종료 미확인" },
    ],
    sourceIds: ["commit"], owner: "", nextAction: "근거 확인", notes: "", verifiedAt: null,
    verificationNote: "", mainSha: null, tags: [], approvalRequired: false,
  };
}
function snapshot(): BoardSnapshot {
  return {
    meta: { title: "AI·무료 운영", snapshotAt: observedAt, mainSha: commit, mainCommitUrl: commitUrl,
      deadline: "2026-11-20", noticeUrl: "https://developers.cloudflare.com/changelog/", caveats: ["관측 시각과 측정 구간은 다릅니다."] },
    items: [item()], sources: [{ id: "commit", title: "합성 커밋 근거", url: commitUrl, kind: "커밋", observedAt, scope: "소스 확인만" }],
  };
}
function completed(status: "검증 완료" | "main 반영 완료" = "검증 완료"): BoardSnapshot {
  const result = snapshot();
  Object.assign(result.items[0]!, { status, verifiedAt: observedAt, verificationNote: "고정 SHA의 소스 확인. 운영 호출 미실행.", mainSha: status === "main 반영 완료" ? commit : null });
  return result;
}
function approval(): BoardSnapshot {
  const result = snapshot();
  Object.assign(result.items[0]!, { type: "task", title: "운영 변경 검토", status: "승인 대기", approvalRequired: true });
  return result;
}

describe("AI·무료 운영 기록의 공통 계약", () => {
  it("여섯 상태를 보존하고 수치 미확인·측정 구간을 숫자로 변환하지 않는다", () => {
    expect(STATUSES).toEqual(["미확인", "분석 중", "검토 필요", "승인 대기", "검증 완료", "main 반영 완료"]);
    const result = parseAiOperationsSnapshot(snapshot(), undefined, now);
    expect(result).toEqual(snapshot());
    expect(result.items[0]!.fields[0]!.value).toBe("미확인");
    expect(result.items[0]!.fields[1]!.value).toContain("정확한 시작·종료 미확인");
  });

  it("초기 빈 보드의 기준 정보는 미확인으로 둘 수 있다", () => {
    const value: BoardSnapshot = { meta: { title: "AI 운영", snapshotAt: "", mainSha: "", mainCommitUrl: "", deadline: "", noticeUrl: "", caveats: [] }, items: [], sources: [] };
    expect(parseAiOperationsSnapshot(value, undefined, now)).toEqual(value);
    expect(aiOperationsEvidenceAge(value, now)).toBeNull();
  });

  it("저장과 가져오기가 관측 시각을 갱신하지 않으며 오래된 증거는 계속 오래된 상태다", () => {
    const original = snapshot();
    original.items[0]!.notes = "메모만 수정";
    const request = { expectedRevision: 2, mutationId: "719eae09-b090-49c2-a7e5-83a7a50f581e", snapshot: original };
    const result = parseAiOperationsSave(request, snapshot(), now);
    expect(result.snapshot.meta.snapshotAt).toBe(observedAt);
    expect(result.snapshot.sources[0]!.observedAt).toBe(observedAt);
    expect(aiOperationsEvidenceAge(result.snapshot, now)).toBe(27 * 60 * 60 * 1000);
    expect(parseAiOperationsImport(JSON.stringify({ ...original, exportedAt: new Date(now).toISOString() }), now).meta.snapshotAt).toBe(observedAt);
  });

  it("Sites 이력은 가져온 기록으로 보존하고 원본 revision을 서버 revision으로 가져오지 않는다", () => {
    const activity = [{ id: "history-1", itemId: "sample-model", title: "검토 메모 수정", at: observedAt }];
    const result = parseAiOperationsImport(JSON.stringify({ ...snapshot(), activity, revision: 15, exportedAt: observedAt }), now);
    expect(result.importedActivity).toEqual(activity);
    expect(result).not.toHaveProperty("revision");
    expect(result).not.toHaveProperty("activity");
    expect(parseAiOperationsImport(JSON.stringify(result), now)).toEqual(result);
    expect(parseAiOperationsImport(JSON.stringify({ kind: "toonstudio-ai-operations", schemaVersion: 1, snapshot: result }), now)).toEqual(result);
  });

  it("잘못된 형식·실행 필드·중복 이력은 기존 데이터를 덮어쓰는 입력으로 받지 않는다", () => {
    const source = snapshot();
    for (const invalid of [
      { ...source, execute: "deploy" },
      { ...source, canEdit: true },
      { ...source, items: [{ ...item(), runCommand: "deploy" }] },
      { ...source, activity: [], importedActivity: [] },
      { kind: "another-board", schemaVersion: 1, snapshot: source },
      { ...source, meta: { ...source.meta, __proto__: { canEdit: true } }, unrelated: true },
    ]) expect(() => parseAiOperationsImport(JSON.stringify(invalid), now)).toThrow();
    expect(() => parseAiOperationsImport("{broken", now)).toThrow("올바른 JSON");
    expect(() => parseAiOperationsSave({ expectedRevision: 0, mutationId: "not-uuid", snapshot: source }, undefined, now)).toThrow("저장 요청");
    expect(() => parseAiOperationsSave({ expectedRevision: -1, mutationId: "719eae09-b090-49c2-a7e5-83a7a50f581e", snapshot: source }, undefined, now)).toThrow("저장 요청");
  });

  it("항목·출처·필드·출처 연결의 중복과 위조 참조를 거부한다", () => {
    for (const invalid of [
      { ...snapshot(), items: [item(), item()] },
      { ...snapshot(), sources: [...snapshot().sources, ...snapshot().sources] },
      { ...snapshot(), items: [{ ...item(), fields: [item().fields[0]!, item().fields[0]!] }] },
      { ...snapshot(), items: [{ ...item(), sourceIds: ["missing"] }] },
      { ...snapshot(), items: [{ ...item(), sourceIds: ["commit", "commit"] }] },
      { ...snapshot(), items: [{ ...item(), id: "__proto__" }] },
      { ...snapshot(), items: [{ ...item(), fields: [{ key: "constructor", label: "필드", value: "값" }] }] },
    ]) expect(() => parseAiOperationsSnapshot(invalid, undefined, now)).toThrow();
  });

  it.each(["http://example.com/evidence", "javascript:alert(1)", "data:text/html,hello", "https://user:password@example.com", " https://example.com"])("안전하지 않은 근거 URL %s를 거부한다", (unsafe) => {
    expect(safeEvidenceUrl(unsafe)).toBe(false);
    const value = snapshot();
    value.sources[0]!.url = unsafe;
    expect(() => parseAiOperationsSnapshot(value, undefined, now)).toThrow();
    value.sources = snapshot().sources;
    value.items[0]!.fields.push({ key: "userEvidenceUrl", label: "추가 근거", value: unsafe });
    expect(() => parseAiOperationsSnapshot(value, undefined, now)).toThrow("증빙 링크");
  });

  it("달력에 없는 날짜·시간대 누락·미래 확인 시각을 거부한다", () => {
    for (const invalid of ["2026-02-30T01:00:00Z", "2026-11-17T01:00:00", "2026-11-17T24:00:00Z", "2026-13-01T00:00:00Z", "not-a-date"]) {
      const value = snapshot(); value.meta.snapshotAt = invalid;
      expect(() => parseAiOperationsSnapshot(value, undefined, now)).toThrow();
    }
    const value = completed(); value.items[0]!.verifiedAt = "2026-11-18T04:00:01Z";
    expect(() => parseAiOperationsSnapshot(value, undefined, now)).toThrow("미래");
    value.items[0]!.verifiedAt = observedAt; value.sources[0]!.observedAt = "2026-11-18T04:00:01Z";
    expect(() => parseAiOperationsSnapshot(value, undefined, now)).toThrow("미래");
    value.sources[0]!.observedAt = observedAt; value.meta.deadline = "2026-02-30";
    expect(() => parseAiOperationsSnapshot(value, undefined, now)).toThrow();
    value.meta.deadline = "2028-02-29";
    expect(parseAiOperationsSnapshot(value, undefined, now).meta.deadline).toBe("2028-02-29");
  });

  it("완료 표시에는 날짜·검증 메모·근거가 모두 필요하다", () => {
    expect(parseAiOperationsSnapshot(completed(), undefined, now).items[0]!.status).toBe("검증 완료");
    for (const patch of [{ verifiedAt: null }, { verificationNote: " " }, { sourceIds: [] }]) {
      const value = completed(); Object.assign(value.items[0]!, patch);
      expect(() => parseAiOperationsSnapshot(value, undefined, now)).toThrow();
    }
  });

  it("main 완료는 정확한 저장소·커밋 경로와 전체 SHA를 요구한다", () => {
    expect(parseAiOperationsSnapshot(completed("main 반영 완료"), undefined, now).items[0]!.mainSha).toBe(commit);
    for (const badUrl of [
      `https://github.com/other/repo/commit/${commit}`,
      `https://github.com/blue45f/toonstudio/commit/${"b".repeat(40)}?sha=${commit}`,
      `https://github.com.evil.example/blue45f/toonstudio/commit/${commit}`,
      `https://github.com/blue45f/toonstudio/commit/${commit}/unrelated`,
    ]) {
      const value = completed("main 반영 완료"); value.sources[0]!.url = badUrl;
      expect(() => parseAiOperationsSnapshot(value, undefined, now)).toThrow("정확히 일치");
    }
    const value = completed("main 반영 완료"); value.items[0]!.mainSha = "a".repeat(7);
    expect(() => parseAiOperationsSnapshot(value, undefined, now)).toThrow();
    value.items[0]!.mainSha = commit; value.meta.mainSha = "b".repeat(40);
    expect(() => parseAiOperationsSnapshot(value, undefined, now)).toThrow("기준 main SHA");
  });

  it("이미 저장된 승인 항목은 삭제·승인 해제·종류 변경·완료 승격할 수 없다", () => {
    const prior = approval();
    for (const invalid of [
      { ...prior, items: [] },
      { ...prior, items: [{ ...prior.items[0]!, approvalRequired: false }] },
      { ...prior, items: [{ ...prior.items[0]!, type: "model" }] },
      { ...prior, items: [{ ...prior.items[0]!, status: "검증 완료", verifiedAt: observedAt, verificationNote: "수동 완료" }] },
      { ...prior, items: [{ ...prior.items[0]!, status: "분석 중" }] },
    ]) expect(() => parseAiOperationsSnapshot(invalid, prior, now)).toThrow();
    const changed = approval(); changed.items[0]!.notes = "승인 검토에 필요한 근거를 추가할 예정";
    expect(parseAiOperationsSnapshot(changed, prior, now).items[0]!.status).toBe("승인 대기");
  });

  it("작은 원본도 반환 객체를 수정해 소급 변경할 수 없다", () => {
    const original = snapshot();
    const parsed = parseAiOperationsSnapshot(original, undefined, now);
    parsed.items[0]!.fields[0]!.value = "수정된 입력";
    expect(original.items[0]!.fields[0]!.value).toBe("미확인");
  });

  it("배열 상한과 UTF-8 바이트 상한을 적용한다", () => {
    const tooMany = snapshot(); tooMany.items = Array.from({ length: 501 }, (_, index) => ({ ...item(), id: `item-${index}` }));
    expect(() => parseAiOperationsSnapshot(tooMany, undefined, now)).toThrow();
    const oversized = "가".repeat(Math.ceil(MAX_AI_OPERATIONS_BYTES / 3));
    expect(oversized.length).toBeLessThan(MAX_AI_OPERATIONS_BYTES);
    expect(() => parseAiOperationsImport(JSON.stringify({ ...snapshot(), extra: oversized }), now)).toThrow("2 MiB");
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    expect(() => parseAiOperationsSnapshot(cyclic, undefined, now)).toThrow("JSON");
  });
});
