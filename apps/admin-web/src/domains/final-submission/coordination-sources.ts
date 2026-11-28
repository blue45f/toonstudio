import { assessWorkspaceEvidenceSet, normalizeWorkspaceRepository, workspaceEvidenceSha, workspaceFreshness } from "@toonstudio/contracts/admin-workspace";
import { createCoordinationItem, createEmptyFinalSubmissionBoard, isSafeUrl } from "@toonstudio/contracts/final-submission";

import type { WorkspaceRecord } from "@toonstudio/contracts/admin-workspace";
import type { BoardState, CoordinationItem, DocumentRecord, Link, Task } from "@toonstudio/contracts/final-submission";

export const COORDINATION_OPERATIONS_URL = "/admin/workspace/";
export const COORDINATION_SUBMISSION_URL = "/admin/growth/business-plan/?view=final-submission";

type SourceJoin = {
  key: string; title: string; ids: string[]; operation: string; priority: 1 | 2;
  next: string; blocking: boolean;
};

// 원본 체크리스트의 행을 복제하지 않고 제출 결정에 영향을 주는 교차 점검 단위만 정의한다.
const joins: SourceJoin[] = [
  { key: "bundle", title: "제출 후보와 최종 묶음 대조", ids: ["DOC-02", "PACKAGE-01", "CHECK-02", "FORMAT-02"], operation: "task-10", priority: 1,
    next: "선정할 본문·붙임과 제출 후보의 파일명, 버전, SHA-256을 대조하세요.", blocking: true },
  { key: "receipt", title: "선정 파일과 플랫폼 접수본 대조", ids: ["PLATFORM-01"], operation: "", priority: 1,
    next: "담당자가 제공한 등록 목록과 접수 시각을 후보 파일의 버전·해시와 대조하세요.", blocking: true },
  { key: "runtime", title: "개발 검증과 제출용 화면 연결", ids: ["ONPOD-01", "DOC-01", "FORMAT-01"], operation: "task-09", priority: 2,
    next: "활동보고서의 운영 화면·주장을 확인하고, 해당하는 경우 촬영 시점과 배포·CI의 커밋을 연결하세요.", blocking: false },
  { key: "mentor", title: "멘토 검토 근거와 제출본 위치 연결", ids: ["MENTOR-01"], operation: "task-11", priority: 2,
    next: "기존 검토 문구와 해당 제출 후보의 쪽·문단을 대조해 반영 여부를 기록하세요.", blocking: false },
];
function visibleRecord(record: WorkspaceRecord) { return record.module !== "business"; }

export function coordinationOperationOptions(records: readonly WorkspaceRecord[]): {id: string; label: string}[] {
  return records.filter(record => visibleRecord(record) && record.factStatus !== "제외" && record.status !== "최종 확인")
    .map(({ id, title }) => ({ id, label: title }));
}

/** 서로 다른 원본 사이에서 같은 근거 주소를 직접 가리키는 단일 기록만 연결한다. */
function operationForTask(records: readonly WorkspaceRecord[], task: Task, mappingId: string): WorkspaceRecord | undefined {
  const open = records.filter(record => visibleRecord(record) && record.status !== "최종 확인" && record.factStatus !== "제외");
  const fixed = open.find(record => record.recordType === "task" && record.id === mappingId);
  if (fixed) return fixed;
  const taskLinks = new Set([...task.evidenceLinks, ...task.attachments].map(link => link.url).filter(isSafeUrl));
  if (taskLinks.size === 0) return undefined;
  const matches = open.filter(record => [record.sourceUrl, record.secondSourceUrl, ...(record.evidence ?? []).map(proof => proof.url)]
    .some(url => taskLinks.has(url)));
  return matches.length === 1 ? matches[0] : undefined;
}

const emptyBoard = createEmptyFinalSubmissionBoard();

function differsFromTemplate<T extends object>(source: T, template: T | undefined, ignoredKey?: keyof T): boolean {
  return !template || (Object.keys(source) as (keyof T)[]).some(key => key !== ignoredKey && JSON.stringify(source[key]) !== JSON.stringify(template[key]));
}

function hasOriginalInput(board: BoardState, task: Task): boolean {
  const seedTask = emptyBoard.tasks.find(original => original.id === task.id);
  // 서버는 최초 개인 저장 때 모든 기본 행에도 updatedAt을 붙인다.
  if (differsFromTemplate(task, seedTask, "updatedAt")) return true;
  const docs = task.id === "PLATFORM-01" ? board.documents : board.documents.filter(doc => doc.id === task.docId);
  return docs.some(doc => differsFromTemplate(doc, emptyBoard.documents.find(original => original.id === doc.id)));
}

export function coordinationSuggestions(board: BoardState, records: readonly WorkspaceRecord[], saved: readonly CoordinationItem[] = board.coordination ?? []): CoordinationItem[] {
  if (board.revision < 1) return [];
  const result: CoordinationItem[] = [];
  for (const join of joins) {
    const id = "source-join-" + join.key;
    if (saved.some(row => row.id === id || join.ids.includes(row.sourceTaskId))) continue;
    const source = join.ids.map(key => board.tasks.find(task => task.id === key && task.unresolved && task.status !== "최종 확인" && hasOriginalInput(board, task))).find(Boolean);
    if (!source) continue;
    const operation = operationForTask(records, source, join.operation);
    result.push({ ...createCoordinationItem(id, join.title), project: "ToonStudio · 모두의 창업 1R",
      priority: join.priority, blocking: join.blocking, sourceTaskId: source.id, operationId: operation?.id ?? "", next: join.next });
  }
  // 가져온 Sites 보드의 사용자 정의 ID도 공통 근거가 실제 존재하면 조정 대상으로 삼는다.
  for (const task of board.tasks) {
    if (!hasOriginalInput(board, task) || task.approvalRequired || !task.unresolved || task.status === "최종 확인" || joins.some(join => join.ids.includes(task.id))
        || saved.some(row => row.sourceTaskId === task.id)) continue;
    const operation = operationForTask(records, task, "");
    if (!operation) continue;
    let id = task.id;
    for (let n = 1; [...result, ...saved].some(row => row.id === id); n++) id = "join-" + n + "-" + task.id.slice(0, 100);
    result.push({ ...createCoordinationItem(id, "공통 근거의 개발·제출 기록 대조"), project: "ToonStudio · 모두의 창업 1R",
      priority: task.priority === "높음" ? 1 : 2, operationId: operation.id, sourceTaskId: task.id,
      next: "양쪽 원본이 인용한 자료의 대상 버전과 관측 범위를 대조하세요." });
  }
  return result;
}

type SourceDetail = { facts: {label: string; value: string}[]; links: Link[]; warnings: string[]; gaps: string[] };
const sha256 = (value: string) => /^[a-f\d]{64}$/iu.test(value);

function documentDetail(detail: SourceDetail, doc: DocumentRecord, item: CoordinationItem) {
  const label = doc.label;
  const { platform } = doc;
  detail.facts.push(
    { label: label + " · 후보 파일", value: [doc.fileName, doc.version, doc.fileHash].filter(Boolean).join(" · ") || "미확인" },
    { label: label + " · 후보 판정", value: doc.candidateState },
    { label: label + " · 플랫폼 기록", value: [platform.status, platform.fileName, platform.version, platform.observedAt].filter(Boolean).join(" · ") },
  );
  detail.links.push({label: label + " 원본", url: doc.sourceUrl}, {label: label + " 플랫폼 근거", url: platform.evidenceUrl});
  if (platform.comparison === "차이 확인" || (sha256(doc.fileHash) && sha256(platform.hash) && doc.fileHash.toLowerCase() !== platform.hash.toLowerCase())) {
    detail.warnings.push(label + " 후보와 플랫폼의 첨부본이 다릅니다.");
  } else if (platform.version && doc.version && platform.version !== doc.version) {
    detail.warnings.push(label + " 후보 버전과 플랫폼 버전이 다릅니다.");
  }
  if (item.file && item.file === doc.fileName && sha256(item.digest) && sha256(doc.fileHash) && item.digest.toLowerCase() !== doc.fileHash.toLowerCase()) {
    detail.warnings.push(label + " 파일명이 같지만 조정 기록과 원본 후보 해시가 다릅니다.");
  }
}

function operationDetail(detail: SourceDetail, record: WorkspaceRecord, item: CoordinationItem) {
  const evidenceAt = Date.parse(item.evidenceAt);
  const sourceDates = [record.verifiedAt, record.sourceDate, record.changeIdentity?.mergeProof?.observedAt, record.operationalState?.approvalEvidence?.at,
    ...(record.evidence ?? []).map(proof => proof.collectedAt)];
  if (sourceDates.some(at => at && Number.isFinite(evidenceAt) && Date.parse(at) > evidenceAt)) detail.gaps.push("새 운영 원본 관측이 있어 최신 증빙 재대조가 필요합니다.");
  const freshness = workspaceFreshness(record);
  if (freshness.tone !== "good") detail.gaps.push("운영 원본 근거 · " + freshness.label);
  const identity = record.changeIdentity;
  detail.facts.push({label: "운영 원본", value: record.title}, {label: "원본 진행", value: record.status},
    {label: "운영 근거", value: freshness.label}, {label: "원본 확인 시점", value: record.verifiedAt || "미확인"});
  if (identity?.repository) detail.facts.push({label: "원본 저장소", value: identity.repository});
  if (identity?.pullRequest) detail.facts.push({label: "원본 PR", value: "#" + identity.pullRequest});
  detail.links.push({label: record.sourceTitle || "운영 근거", url: record.sourceUrl}, {label: record.secondSourceTitle || "교차 확인 자료", url: record.secondSourceUrl});
  for (const proof of record.evidence ?? []) {
    detail.links.push({label: proof.scope + " · " + proof.collectedAt, url: proof.url});
  }
  if (record.evidenceTarget) {
    const assessment = assessWorkspaceEvidenceSet(record.evidence ?? [], record.evidenceTarget);
    if (!assessment.current) {
      const issues = assessment.status === "failed" || assessment.status === "mismatch" ? detail.warnings : detail.gaps;
      issues.push(...assessment.reasons);
    }
  }
  const state = record.operationalState;
  if (state) {
    const ciLabels = { unknown: "미확인", success: "성공", failure: "실패", pending: "진행 중", cancelled: "취소", skipped: "건너뜀" };
    const deployLabels = { unknown: "미확인", "not-deployed": "미배포", "image-built": "이미지 생성", applied: "적용", "smoke-passed": "스모크 통과", failed: "실패" };
    detail.facts.push({label: "원본에 기록된 CI", value: ciLabels[state.ciStatus]}, {label: "원본에 기록된 배포", value: deployLabels[state.deploymentStatus]});
  }
  if (record.mainSha) detail.facts.push({label: "원본 main SHA", value: record.mainSha});
  if (record.deployedSha) detail.facts.push({label: "원본 배포 SHA", value: record.deployedSha});
  const prState = record.operationalState?.pullRequestStatus;
  if (prState === "open" || prState === "closed-unmerged" || identity?.pullRequestState === "open" || identity?.pullRequestState === "closed-unmerged") {
    detail.warnings.push("연결한 운영 원본에 미병합 PR이 기록돼 있습니다.");
  }
  const deployed = record.operationalState?.deploymentStatus;
  if (["applied","smoke-passed"].includes(deployed ?? "") && (record.evidenceTarget?.kind !== "deployment" || !assessWorkspaceEvidenceSet(record.evidence ?? [], record.evidenceTarget).current)) {
    detail.gaps.push("운영 원본의 배포 기록에 현재 대상과 일치하는 스모크 증빙이 필요합니다.");
  }
  if (item.repo && identity?.repository && normalizeWorkspaceRepository(item.repo) !== normalizeWorkspaceRepository(identity.repository)) {
    detail.warnings.push("연결한 운영 원본과 조정 기록의 저장소가 다릅니다.");
  }
  const sourceSha = identity?.headSha || record.localSha;
  if (workspaceEvidenceSha(item.commit) && workspaceEvidenceSha(sourceSha) && item.commit.toLowerCase() !== sourceSha.toLowerCase()) {
    detail.warnings.push("운영 원본 head와 제출 대상 커밋이 다릅니다.");
  }
}

/** 권한이 유효한 렌더에서만 대조한다. 반환값을 조정 저장 요청에 포함하지 않는다. */
export function coordinationSourceDetail(board: BoardState, records: readonly WorkspaceRecord[], item: CoordinationItem): SourceDetail {
  const detail: SourceDetail = {facts: [], links: [], warnings: [], gaps: []};
  const task = board.tasks.find(source => source.id === item.sourceTaskId);
  if (task && hasOriginalInput(board, task)) {
    detail.facts.push({label: "제출 원본", value: task.title}, {label: "제출 원본 상태", value: task.status});
    detail.links.push(...task.evidenceLinks, ...task.attachments);
    const docs = task.id === "PLATFORM-01" ? board.documents : board.documents.filter(doc => doc.id === task.docId);
    for (const doc of docs) documentDetail(detail, doc, item);
  } else {
    if (item.sourceTaskId) detail.gaps.push("연결된 제출 원본의 실제 기록을 확인하지 못했습니다.");
    detail.facts.push({label: "제출 원본", value: "미확인 · 제출 점검 보드에서 연결할 항목을 선택하세요."});
  }
  const record = records.find(source => visibleRecord(source) && source.id === item.operationId);
  if (record) operationDetail(detail, record, item);
  else {
    if (item.operationId) detail.gaps.push("연결된 운영 원본과 현재 열람 권한을 확인하지 못했습니다.");
    detail.facts.push({label: "운영 원본", value: "미확인 · 열람 가능한 운영 기록을 연결하세요."});
  }
  detail.links = detail.links.filter(link => isSafeUrl(link.url));
  detail.links.unshift({label: "관리자 운영 보드", url: COORDINATION_OPERATIONS_URL}, {label: "최종 제출 점검 보드", url: COORDINATION_SUBMISSION_URL});
  detail.links = [...new Map(detail.links.map(link => [link.url, link])).values()];
  detail.warnings = [...new Set(detail.warnings)];
  return detail;
}
