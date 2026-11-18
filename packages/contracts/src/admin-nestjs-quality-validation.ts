import { NEST_BOARD_REPOSITORY, STATUSES, boundedJson, commit, date, evidence, flag, identifier, integer, list, record, text, unique, url } from "./admin-nestjs-quality-values";

import type {
  CIRow, Exclusion, HistoryEntry, Link, NestBoardDocument,
  NestBoardMutation, PackageRow, PathRow, PRRow, Snapshot, Status, Task,
} from "./admin-nestjs-quality";

function status(value: unknown, field: string): Status {
  if (typeof value !== "string" || !STATUSES.includes(value as Status)) throw new Error(`${field}: 허용된 작업 상태가 아닙니다.`);
  return value as Status;
}
function link(value: unknown): Link {
  const item = record(value, "근거 링크");
  return {
    label: text(item.label, "근거 이름", 200, true), url: url(item.url, "근거 링크"),
    ...(item.type === undefined ? {} : { type: text(item.type, "근거 종류", 100) }),
  };
}
function links(value: unknown): Link[] { return list(value, "근거 링크", 100).map(link); }
function strings(value: unknown, field: string, max: number, length = 4000): string[] {
  return list(value, field, max).map(item => text(item, field, length, true));
}
function isRepositoryPr(value: string, number?: number): boolean {
  const parsed = new URL(value);
  const match = /^\/blue45f\/toonstudio\/pull\/([1-9]\d*)\/?$/u.exec(parsed.pathname);
  return parsed.protocol === "https:" && parsed.hostname === "github.com" && !parsed.port
    && Boolean(match) && (number === undefined || Number(match?.[1]) === number);
}
function task(value: unknown, now: number): Task {
  const item = record(value, "작업");
  const priority = item.priority;
  if (priority !== "P0" && priority !== "P1" && priority !== "P2") throw new Error("작업 우선순위가 올바르지 않습니다.");
  const result: Task = {
    id: identifier(item.id, "작업 ID"), title: text(item.title, "작업 제목", 300, true),
    category: text(item.category, "작업 분류", 100, true), priority, status: status(item.status, "작업 상태"),
    kind: text(item.kind, "증거 분류", 200, true), summary: text(item.summary, "작업 요약"),
    scope: text(item.scope, "변경 영향 범위", 2000), nextAction: text(item.nextAction, "다음 조치"),
    owner: text(item.owner, "담당자", 256), commit: commit(item.commit, "작업 커밋"),
    checkedAt: date(item.checkedAt, "확인 시각", now, true), verificationDate: date(item.verificationDate, "검증일", now, true),
    environment: text(item.environment, "검증 환경", 4000), result: text(item.result, "검증 결과", 4000),
    steps: strings(item.steps, "최소 검증 절차", 100), acceptance: text(item.acceptance, "성공 기준"),
    beforeEvidence: text(item.beforeEvidence, "변경 전 증거", 25_000), afterEvidence: text(item.afterEvidence, "변경 후 증거", 25_000),
    evidenceLinks: links(item.evidenceLinks), notes: text(item.notes, "메모", 25_000),
    approvalRequired: flag(item.approvalRequired, "승인 필요 여부"), archived: flag(item.archived, "제외 여부"),
    revision: integer(item.revision, "작업 수정 번호"),
    ...(item.updatedAt === undefined ? {} : { updatedAt: date(item.updatedAt, "작업 수정 시각", now) }),
  };
  if (result.approvalRequired && result.status !== "승인 대기") throw new Error("실행 승인이 필요한 작업은 승인 대기 상태로만 기록합니다.");
  if (result.status === "검증 완료" || result.status === "main 머지 완료") {
    if (!evidence(result.verificationDate) || !evidence(result.result) || !evidence(result.afterEvidence) || !result.evidenceLinks.length) {
      throw new Error("완료 상태에는 검증일·확인된 결과·변경 후 증거·근거 링크가 필요합니다.");
    }
  }
  if (result.status === "main 머지 완료"
    && (!/^[a-f0-9]{7,40}$/iu.test(result.commit) || !result.evidenceLinks.some(item => isRepositoryPr(item.url)))) {
    throw new Error("main 머지 완료에는 커밋 SHA와 ToonStudio PR 링크가 필요합니다.");
  }
  return result;
}
function packageRow(value: unknown): PackageRow {
  const item = record(value, "패키지");
  return {
    name: text(item.name, "패키지 이름", 200, true), declared: text(item.declared, "선언 버전", 200, true),
    locked: text(item.locked, "잠금 버전", 200, true), target: text(item.target, "목표 버전", 300, true),
    targetNote: text(item.targetNote, "정렬 판단 근거"), peerSummary: text(item.peerSummary, "호환성 근거"),
    assessment: text(item.assessment, "패키지 판정", 4000), scope: text(item.scope, "패키지 영향 범위", 2000),
    links: links(item.links), taskId: identifier(item.taskId, "패키지 관련 작업"),
  };
}
function prRow(value: unknown, now: number): PRRow {
  const item = record(value, "PR");
  const number = integer(item.number, "PR 번호", 1);
  const prUrl = url(item.url, "PR 링크");
  if (!isRepositoryPr(prUrl, number)) throw new Error("PR 링크와 ToonStudio PR 번호가 일치해야 합니다.");
  return {
    number, title: text(item.title, "PR 제목", 500, true), state: text(item.state, "PR 상태", 200, true),
    sha: commit(item.sha, "PR 커밋"), mergedAt: date(item.mergedAt, "PR 병합 시각", now, true, true),
    url: prUrl, note: text(item.note, "PR 메모"),
  };
}
function ciRow(value: unknown): CIRow {
  const item = record(value, "CI");
  return {
    title: text(item.title, "CI 제목", 500, true), scope: text(item.scope, "CI 실행 범위", 2000),
    result: text(item.result, "CI 결과", 4000, true), detail: text(item.detail, "CI 근거"),
    url: url(item.url, "CI 링크", true), counted: flag(item.counted, "CI 집계 여부"),
  };
}
function pathRow(value: unknown): PathRow {
  const item = record(value, "실행 경로");
  return {
    id: identifier(item.id, "실행 경로 ID"), title: text(item.title, "실행 경로 제목", 500, true),
    subtitle: text(item.subtitle, "실행 경로 요약", 2000), detail: text(item.detail, "실행 경로 근거"),
    url: url(item.url, "실행 경로 코드"), taskId: identifier(item.taskId, "실행 경로 관련 작업"),
  };
}
function exclusion(value: unknown): Exclusion {
  const item = record(value, "제외 근거");
  return { title: text(item.title, "제외 항목", 500, true), reason: text(item.reason, "제외 이유", 12_000, true), url: url(item.url, "제외 근거 링크") };
}
function snapshot(value: unknown, now: number): Snapshot {
  const item = record(value, "기준 스냅샷");
  if (item.repository !== NEST_BOARD_REPOSITORY) throw new Error("ToonStudio 저장소의 스냅샷이 필요합니다.");
  return {
    observedAt: date(item.observedAt, "스냅샷 관측 시각", now), observedKst: date(item.observedKst, "한국 관측 시각", now, false, true),
    repository: NEST_BOARD_REPOSITORY, mainSha: commit(item.mainSha, "기준 main SHA", true),
    mainUrl: url(item.mainUrl, "기준 main 링크"), mainCiUrl: url(item.mainCiUrl, "기준 CI 링크", true),
    mainCiState: text(item.mainCiState, "기준 CI 상태", 4000, true), releaseUrl: url(item.releaseUrl, "릴리스 노트"),
    releaseDate: date(item.releaseDate, "릴리스 날짜", now, true, true),
    packages: unique(list(item.packages, "패키지 목록", 100).map(packageRow), row => row.name, "패키지 목록"),
    prs: unique(list(item.prs, "PR 목록", 100).map(row => prRow(row, now)), row => row.number, "PR 목록"),
    ci: list(item.ci, "CI 실행 목록", 200).map(ciRow),
    paths: unique(list(item.paths, "실행 경로 목록", 100).map(pathRow), row => row.id, "실행 경로 목록"),
    exclusions: list(item.exclusions, "제외 항목 목록", 200).map(exclusion), sources: links(item.sources),
    sequence: list(item.sequence, "정렬 순서", 50).map(value => {
      const row = record(value, "정렬 단계");
      return { title: text(row.title, "정렬 단계 제목", 500, true), detail: text(row.detail, "정렬 단계 근거"), status: status(row.status, "정렬 단계 상태") };
    }),
  };
}
function historyEntry(value: unknown, now: number): HistoryEntry {
  const item = record(value, "외부 원본 이력");
  return {
    id: identifier(item.id, "원본 이력 ID"), taskId: identifier(item.taskId, "원본 이력 작업 ID"),
    taskTitle: text(item.taskTitle, "원본 작업 제목", 300, true), changedAt: date(item.changedAt, "원본 변경 시각", now),
    actor: text(item.actor, "외부 원본 작성자", 500, true), changes: strings(item.changes, "원본 변경 내용", 100),
  };
}
function document(value: unknown, now: number): NestBoardDocument {
  const input = record(value, "NestJS 검증 보드");
  if (input.schemaVersion !== 1 || input.repository !== NEST_BOARD_REPOSITORY) throw new Error("ToonStudio NestJS 보드 schemaVersion 1 형식이 필요합니다.");
  const tasks = unique(list(input.tasks, "작업 목록", 300).map(item => task(item, now)), item => item.id, "작업 목록");
  if (!tasks.length) throw new Error("검증 작업이 최소 한 개 필요합니다.");
  const basis = snapshot(input.snapshot, now);
  const taskIds = new Set(tasks.map(item => item.id));
  if ([...basis.packages, ...basis.paths].some(item => !taskIds.has(item.taskId))) {
    throw new Error("패키지·실행 경로가 참조하는 작업이 보드에 없습니다.");
  }
  return {
    schemaVersion: 1, repository: NEST_BOARD_REPOSITORY, snapshot: basis, tasks,
    sourceHistory: unique(list(input.sourceHistory, "외부 원본 이력", 500).map(item => historyEntry(item, now)), item => item.id, "외부 원본 이력"),
  };
}

export function parseNestBoardDocument(value: unknown, now = Date.now()): NestBoardDocument {
  return document(boundedJson(value), now);
}
export function parseNestBoardMutation(value: unknown, now = Date.now()): NestBoardMutation {
  const input = record(boundedJson(value), "보드 저장 요청");
  const mutationId = text(input.mutationId, "요청 ID", 128, true);
  if (!/^[a-z0-9][a-z0-9._:-]{7,127}$/iu.test(mutationId)) throw new Error("재시도에 사용할 올바른 요청 ID가 필요합니다.");
  return {
    expectedRevision: integer(input.expectedRevision, "기대 수정 번호"), mutationId,
    document: document(input.document, now), reason: text(input.reason, "변경 사유", 1000, true),
  };
}
/** 네이티브 내보내기 또는 Sites 원본을 검증한 뒤 새 서버 문서로 가져온다. */
export function parseNestBoardImport(value: unknown, now = Date.now()): NestBoardDocument {
  const input = record(boundedJson(value), "가져오기 JSON");
  if (input.document !== undefined) return document(input.document, now);
  if (input.repository !== undefined) return document(input, now);
  if (input.schemaVersion !== 1) throw new Error("Sites 보드 schemaVersion 1 형식이 필요합니다.");
  if (input.exportedAt !== undefined) date(input.exportedAt, "원본 내보내기 시각", now);
  return document({
    schemaVersion: 1, repository: NEST_BOARD_REPOSITORY, snapshot: input.snapshot,
    tasks: input.tasks, sourceHistory: input.history ?? [],
  }, now);
}
