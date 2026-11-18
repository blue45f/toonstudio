import { editableRecordFields, recordDefinitions, workflowStatuses } from "./dependency-review-types";

import type { DependencyReviewBoard, DependencyRow, PrComparison, RecordFreshness, ReviewHistory, ReviewRecord, ReviewSnapshot, ValidationCommand } from "./dependency-review-types";

export const REVIEW_JSON_MAX_BYTES = 2_000_000;
const SHA = /^[a-f0-9]{40}$/iu;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/u;
const forbiddenKeys = new Set(["__proto__", "constructor", "prototype"]);
export const reviewTextFields = ["title", "group", "result", "historicalResult", "confidence", "regression", "summary", ...editableRecordFields.filter(key => key !== "verifiedAt" && key !== "verificationSha"), "sourceStatus", "sourceResult"] as const;

export function reviewObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}: 객체가 필요합니다.`);
  return value as Record<string, unknown>;
}
export function reviewText(value: unknown, label: string, max = 15_000): string {
  if (typeof value !== "string" || value.length > max) throw new Error(`${label}: ${max}자 이하 문자열이 필요합니다.`);
  return value;
}
export function reviewArray(value: unknown, label: string, max = 100): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label}: 최대 ${max}개 배열이 필요합니다.`);
  return value;
}
export function reviewSha(value: unknown, label = "근거 SHA"): string {
  const sha = reviewText(value, label, 40);
  if (!SHA.test(sha)) throw new Error(`${label}: 40자리 커밋 SHA가 필요합니다.`);
  return sha.toLowerCase();
}
export function reviewDate(value: unknown, label: string, now = Date.now(), optional = false): string {
  const date = reviewText(value, label, 64);
  if (optional && !date) return date;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!ISO.test(date) || month < 1 || month > 12 || day < 1 || day > days[month - 1]
    || Number(date.slice(11, 13)) > 23 || Number(date.slice(14, 16)) > 59
    || !Number.isFinite(Date.parse(date)) || Date.parse(date) > now + 300_000) {
    throw new Error(`${label}: 미래가 아닌 올바른 ISO 시각과 시간대가 필요합니다.`);
  }
  return date;
}
export function reviewUrl(value: unknown, label = "링크", optional = false): string {
  const text = reviewText(value, label, 4096);
  if (optional && !text) return text;
  try {
    const url = new URL(text);
    if (url.protocol === "https:" && !url.username && !url.password) return text;
  } catch { /* 아래의 명시적인 형식 오류로 처리한다. */ }
  throw new Error(`${label}: 인증 정보가 없는 HTTPS URL이 필요합니다.`);
}
export function isRepositoryEvidence(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === "https://github.com" && !url.username && !url.password
      && /^\/blue45f\/toonstudio\/(?:actions\/runs\/\d+(?:\/job\/\d+)?|commit\/[a-f0-9]{40}|pull\/\d+)(?:\/|$)/iu.test(url.pathname);
  } catch { return false; }
}
export function assertReviewJsonSize(value: string): void {
  if (value.length > REVIEW_JSON_MAX_BYTES || new TextEncoder().encode(value).byteLength > REVIEW_JSON_MAX_BYTES) {
    throw new Error("의존성 검토 JSON은 UTF-8 기준 2MB 이하만 허용합니다.");
  }
}
/** 알려진 필드를 읽기 전에 중첩된 위험 키와 과도한 입력을 거부한다. */
export function assertReviewJsonValue(value: unknown): void {
  let nodes = 0;
  const visit = (entry: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > 30_000 || depth > 20) throw new Error("JSON의 중첩 또는 항목 수가 너무 많습니다.");
    if (entry === null || typeof entry === "boolean" || typeof entry === "string") return;
    if (typeof entry === "number" && Number.isFinite(entry)) return;
    if (Array.isArray(entry)) { entry.forEach(item => visit(item, depth + 1)); return; }
    if (entry && typeof entry === "object") {
      for (const [key, item] of Object.entries(entry)) {
        if (forbiddenKeys.has(key)) throw new Error("JSON에 허용하지 않는 키가 있습니다.");
        visit(item, depth + 1);
      }
      return;
    }
    throw new Error("JSON 값만 기록할 수 있습니다.");
  };
  visit(value, 0);
}
export function parseReviewJson(input: string): Record<string, unknown> {
  assertReviewJsonSize(input);
  let parsed: unknown;
  try { parsed = JSON.parse(input); } catch { throw new Error("JSON 문법이 올바르지 않습니다."); }
  assertReviewJsonValue(parsed);
  return reviewObject(parsed, "의존성 검토 JSON");
}

export function validateReviewSnapshot(value: unknown, now = Date.now()): ReviewSnapshot {
  const s = reviewObject(value, "기준 스냅샷");
  const sha = reviewSha(s.sha, "기준 SHA");
  const commitUrl = reviewUrl(s.commitUrl, "기준 커밋 링크");
  if (new URL(commitUrl).pathname !== `/blue45f/toonstudio/commit/${sha}` || new URL(commitUrl).origin !== "https://github.com") {
    throw new Error("기준 커밋 링크와 ToonStudio SHA가 일치해야 합니다.");
  }
  return {
    sha, checkedAt: reviewDate(s.checkedAt, "기준 관측 시각", now),
    commitAt: reviewDate(s.commitAt, "기준 커밋 시각", now, true), commitUrl,
    ciUrl: reviewUrl(s.ciUrl, "기준 CI 링크", true), summary: reviewText(s.summary, "스냅샷 설명"),
  };
}
export function validateReviewRecord(value: unknown, now = Date.now()): ReviewRecord {
  const r = reviewObject(value, "작업 기록");
  const id = reviewText(r.id, "작업 ID", 80);
  if (!Object.hasOwn(recordDefinitions, id)) throw new Error("알 수 없는 의존성 검토 작업 ID입니다.");
  const definition = recordDefinitions[id as keyof typeof recordDefinitions];
  if (r.category !== definition.category) throw new Error("작업 분류를 바꿀 수 없습니다.");
  const causes = reviewArray(r.causeIds, "원인 관계", 2).map(v => reviewText(v, "원인 ID", 80));
  if (JSON.stringify(causes) !== JSON.stringify(definition.causeIds)) throw new Error("Remotion·deepmerge·별도 브라우저 원인 관계를 보존해야 합니다.");
  if (!workflowStatuses.some(status => status === r.status)) throw new Error("허용된 6단계 작업 상태가 아닙니다.");
  if (r.category === "approval" && r.status !== "승인 대기") throw new Error("코드 수정·푸시·병합·배포는 승인 대기로만 기록합니다.");
  if (r.category === "archive" && r.status !== "main 머지 완료") throw new Error("PR #2789는 별도 완료 보관 항목입니다.");
  if (r.provenance !== "repository-snapshot" && r.provenance !== "manual-record" && r.provenance !== "sites-import") throw new Error("기록의 출처를 확인하세요.");
  if (!Number.isSafeInteger(r.revision) || Number(r.revision) < 0) throw new Error("기록 revision이 올바르지 않습니다.");
  if (typeof r.edited !== "boolean") throw new Error("기록 편집 여부를 확인하세요.");
  const texts = Object.fromEntries(reviewTextFields.map(key => [key, reviewText(r[key], key)])) as Pick<ReviewRecord, typeof reviewTextFields[number]>;
  if (!texts.title.trim()) throw new Error("작업 제목이 필요합니다.");
  const verifiedAt = reviewDate(r.verifiedAt, "검증일", now, true);
  const verificationSha = r.verificationSha === "" ? "" : reviewSha(r.verificationSha, "수동 검증 SHA");
  if (!["미확인", "통과", "실패", "취소", "미실행"].includes(texts.recordedResult)) throw new Error("수동 검사 결과는 미확인·통과·실패·취소·미실행 중에서 기록하세요.");
  if ((r.status === "검증 완료" || r.status === "main 머지 완료") && (!texts.evidence.trim() || !verifiedAt)) {
    throw new Error("완료 상태에는 확정 근거와 검증일이 필요합니다.");
  }
  const links = reviewArray(r.links, "근거 링크", 30).map(value => {
    const link = reviewObject(value, "근거 링크");
    return { label: reviewText(link.label, "링크 이름", 200), url: reviewUrl(link.url) };
  });
  for (const url of texts.ciLinks.split(/\s+/u).filter(Boolean)) reviewUrl(url, "CI 링크");
  return {
    ...texts, id, category: definition.category, causeIds: causes,
    status: r.status as ReviewRecord["status"], provenance: r.provenance,
    links, verifiedAt, verificationSha, snapshotSha: reviewSha(r.snapshotSha), revision: Number(r.revision),
    updatedAt: reviewDate(r.updatedAt, "수정 시각", now, true), edited: r.edited,
  };
}
export function validateDependencyRows(value: unknown): DependencyRow[] {
  return reviewArray(value, "의존성 대조", 50).map(entry => {
    const d = reviewObject(entry, "의존성");
    return { name: reviewText(d.name, "패키지", 200), workspace: reviewText(d.workspace, "위치"), declared: reviewText(d.declared, "선언 버전"), resolved: reviewText(d.resolved, "잠금 버전"), expected: reviewText(d.expected, "기대 버전"), interpretation: reviewText(d.interpretation, "잠금 해석"), url: reviewUrl(d.url) };
  });
}
export function validatePrComparisons(value: unknown): PrComparison[] {
  return reviewArray(value, "PR 비교", 30).map(entry => {
    const p = reviewObject(entry, "PR");
    if (!Number.isSafeInteger(p.number) || Number(p.number) < 1) throw new Error("PR 번호를 확인하세요.");
    const optionalSha = (value: unknown) => value === undefined || value === "" ? "" : reviewSha(value);
    const ciLinks = reviewArray(p.ciLinks ?? [], "PR CI 링크", 20).map(entry => {
      const link = reviewObject(entry, "PR CI 링크");
      return { label: reviewText(link.label, "CI 이름", 200), url: reviewUrl(link.url) };
    });
    return { number: Number(p.number), title: reviewText(p.title, "PR 제목", 300), mergedAt: reviewText(p.mergedAt, "병합 시각", 100), sha: reviewSha(p.sha, "병합 SHA"), url: reviewUrl(p.url), commitUrl: reviewUrl(p.commitUrl), changes: reviewArray(p.changes, "변경 내역", 30).map(v => reviewText(v, "변경 내역")), judgement: reviewText(p.judgement, "판정"), files: reviewText(p.files, "변경 파일"), role: reviewText(p.role, "비교 역할", 100),
      ...(p.baseSha === undefined ? {} : { baseSha: optionalSha(p.baseSha) }),
      ...(p.headSha === undefined ? {} : { headSha: optionalSha(p.headSha) }),
      ...(p.checkoutSha === undefined ? {} : { checkoutSha: optionalSha(p.checkoutSha) }),
      ...(p.ciLinks === undefined ? {} : { ciLinks }),
    };
  });
}
export function validateValidationCommands(value: unknown): ValidationCommand[] {
  return reviewArray(value, "검증 초안", 30).map(entry => {
    const c = reviewObject(entry, "검증 초안");
    return { title: reviewText(c.title, "검증 이름", 200), command: reviewText(c.command, "명령 초안"), scope: reviewText(c.scope, "범위"), cost: reviewText(c.cost, "비용"), limitations: reviewText(c.limitations, "검증 한계") };
  });
}
export function validateReviewHistory(value: unknown, now = Date.now()): ReviewHistory[] {
  const history = reviewArray(value, "변경 이력", 200).map(entry => {
    const h = reviewObject(entry, "이력");
    return { id: reviewText(h.id, "이력 ID", 200), recordId: reviewText(h.recordId, "이력 작업 ID", 80), summary: reviewText(h.summary, "이력 내용", 2000), createdAt: reviewDate(h.createdAt, "이력 시각", now) };
  });
  if (new Set(history.map(h => h.id)).size !== history.length) throw new Error("중복 이력 ID가 있습니다.");
  return history;
}
export function validateDependencyReviewBoard(value: unknown, now = Date.now()): DependencyReviewBoard {
  assertReviewJsonValue(value);
  const b = reviewObject(value, "의존성 검토 보드");
  if (b.schemaVersion !== 1 || b.kind !== "toonstudio-dependency-review") throw new Error("의존성 검토 전용 schemaVersion 1 JSON이 필요합니다. 기존 CI·QA JSON과 구분하세요.");
  if (typeof b.ttlHours !== "number" || !Number.isFinite(b.ttlHours) || b.ttlHours < 1 || b.ttlHours > 720) throw new Error("최신성 TTL은 1~720시간입니다.");
  const records = reviewArray(b.records, "작업 기록", 12).map(r => validateReviewRecord(r, now));
  if (records.length !== 12 || new Set(records.map(r => r.id)).size !== 12) throw new Error("중복 없는 의존성 검토 12개 항목이 필요합니다.");
  const snapshot = validateReviewSnapshot(b.snapshot, now);
  for (const record of records) {
    if (record.category !== "check" || record.status !== "검증 완료") continue;
    const links = [...record.links.map(link => link.url), ...record.ciLinks.split(/\s+/u)];
    if (record.recordedResult !== "통과" || record.verificationSha !== snapshot.sha || !record.evidence.includes(record.verificationSha) || !links.some(isRepositoryEvidence)) {
      throw new Error("검사 검증 완료에는 통과 결과·현재 기준 SHA·해당 SHA가 명시된 근거·저장소 증빙 링크가 모두 필요합니다.");
    }
  }
  const imports = reviewArray(b.imports, "가져오기 원본", 20).map(entry => {
    const i = reviewObject(entry, "가져오기 원본");
    const fingerprint = reviewText(i.fingerprint, "원본 식별자", 64);
    if (!/^[a-f0-9]{64}$/u.test(fingerprint)) throw new Error("가져오기 원본 식별자를 확인하세요.");
    const sourceJson = reviewText(i.sourceJson, "원본 JSON", REVIEW_JSON_MAX_BYTES);
    parseReviewJson(sourceJson);
    return { fingerprint, sourceJson, importedAt: reviewDate(i.importedAt, "가져온 시각", now), snapshotSha: reviewSha(i.snapshotSha), exportedAt: reviewDate(i.exportedAt, "원본 내보낸 시각", now) };
  });
  if (new Set(imports.map(i => i.fingerprint)).size !== imports.length) throw new Error("같은 원본이 중복 기록되었습니다.");
  return {
    schemaVersion: 1, kind: "toonstudio-dependency-review", snapshot, ttlHours: b.ttlHours,
    records, dependencies: validateDependencyRows(b.dependencies), prs: validatePrComparisons(b.prs), commands: validateValidationCommands(b.commands),
    history: validateReviewHistory(b.history, now), imports,
  };
}
export function exportDependencyReviewBoard(board: DependencyReviewBoard, now = Date.now()): string {
  const text = JSON.stringify({ ...validateDependencyReviewBoard(board, now), exportedAt: new Date(now).toISOString() }, null, 2);
  assertReviewJsonSize(text);
  return text;
}
export function updateDependencyRecord(board: DependencyReviewBoard, draft: ReviewRecord, now = Date.now()): DependencyReviewBoard {
  const current = board.records.find(r => r.id === draft.id);
  if (!current || current.revision !== draft.revision) throw new Error("기록이 변경되었습니다. 최신 기록을 다시 열어 주세요.");
  const changes = Object.fromEntries(editableRecordFields.map(key => [key, draft[key]]));
  const next = validateReviewRecord({ ...current, ...changes, status: draft.status, revision: current.revision + 1, updatedAt: new Date(now).toISOString(), edited: true, provenance: "manual-record" }, now);
  if (current.provenance === "sites-import") {
    const links = [...next.links.map(link => link.url), ...next.ciLinks.split(/\s+/u)];
    const hasNewEvidence = next.verificationSha === board.snapshot.sha && next.evidence.includes(next.verificationSha)
      && next.evidence !== current.evidence && next.verifiedAt !== current.verifiedAt && Boolean(next.verifiedAt) && links.some(isRepositoryEvidence);
    if (!hasNewEvidence) next.provenance = "sites-import";
  }
  if (current.status !== next.status && (next.status === "검증 완료" || next.status === "main 머지 완료")) {
    if (next.evidence === current.evidence || next.verifiedAt === current.verifiedAt) throw new Error("완료 전환에는 새 확정 근거와 검증일을 함께 기록하세요.");
    if (next.verificationSha !== board.snapshot.sha || !next.evidence.includes(next.verificationSha)) throw new Error("완료 전환의 수동 검증 SHA와 근거에 현재 기준의 40자리 SHA를 명시하세요.");
    if (next.category === "check" && next.status === "검증 완료" && next.recordedResult !== "통과") throw new Error("검사 검증 완료에는 해당 SHA의 수동 검사 결과 통과를 기록하세요.");
    const links = [...next.links.map(link => link.url), ...next.ciLinks.split(/\s+/u)];
    if (!links.some(isRepositoryEvidence)) throw new Error("완료 전환에는 ToonStudio CI·PR·커밋 근거 링크가 필요합니다.");
  }
  const updated = validateDependencyReviewBoard({ ...board, records: board.records.map(r => r.id === next.id ? next : r), history: [{ id: `${next.id}:${next.revision}:${now}`, recordId: next.id, summary: `${next.title} · ${next.status} 수동 기록`, createdAt: new Date(now).toISOString() }, ...board.history].slice(0, 200) }, now);
  exportDependencyReviewBoard(updated, now);
  return updated;
}
export function getRecordFreshness(record: ReviewRecord, board: DependencyReviewBoard, now = Date.now()): RecordFreshness {
  if (record.provenance === "sites-import") return { kind: "review", label: "가져온 기록 · 검토 필요", reason: "원본의 완료 주장은 보존했으며 GitHub 실행 결과를 새로 검증하지 않았습니다." };
  if ((record.verificationSha || record.snapshotSha) !== board.snapshot.sha) return { kind: "stale", label: "이전 SHA 증빙", reason: "기록의 SHA가 기준 main과 다릅니다. 현재 검사 성공으로 집계하지 않습니다." };
  if (!record.verifiedAt || !record.evidence.trim()) return { kind: "missing", label: "최신 실행 미확인", reason: "해당 SHA의 실행 증빙을 확인해야 합니다." };
  if (now - Date.parse(board.snapshot.checkedAt) > board.ttlHours * 3_600_000 || now - Date.parse(record.verifiedAt) > board.ttlHours * 3_600_000) return { kind: "stale", label: "증빙 갱신 필요", reason: "기준 관측 또는 근거가 TTL을 초과했습니다. 최신 main은 자동 조회하지 않습니다." };
  return { kind: "recorded", label: record.provenance === "manual-record" ? "수동 기록 · 형식 일치" : "소스 관측 기록", reason: "SHA·시각의 형식과 기준 일치만 확인합니다. 작업 상태는 현재 CI 성공을 뜻하지 않습니다." };
}
