import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateManuscriptManifest } from './manuscript-contract.mjs';

export const ACTUAL_PROFILE = 'existing-manuscript-with-images';
export const ACTUAL_DATASET = 'persisted-review-manuscript-v1';
const accessKeys = ['view', 'comment', 'edit', 'manage'];
const countKeys = ['tasks', 'edges', 'submissions', 'ready', 'deliverables'];
// 현재 제품의 production/studio-revision.ts와 scope.ts 계약을 계측 입력에 맞춘다.
const roleLineage = Object.freeze({ story: 'narrative', thumbnail: 'visual', lineart: 'visual', background: 'visual', color: 'visual', lettering: 'integrated', final: 'integrated' });
const scopeOrder = Object.freeze({ project: 0, season: 1, episode: 2, scene: 3, 'scroll-segment': 4, cut: 5, 'layer-group': 6, asset: 6, deliverable: 6 });
const hash = /^[a-f0-9]{64}$/u;
const check = (value, message) => {
  if (!value) {
    const error = new Error(message);
    error.name = 'C9PreconditionError';
    error.c9SafeMessage = message;
    throw error;
  }
};
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const digest = (value) => createHash('sha256').update(stable(value)).digest('hex');
const identifier = (value) => typeof value === 'string' && value.length > 0 && value.length <= 512 && [...value].every((character) => character.charCodeAt(0) > 31);
function validScope(scope) {
  const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(id);
  if (!scope || !Object.hasOwn(scopeOrder, scope.kind) || !validId(scope.id) || !Array.isArray(scope.ancestors)) return false;
  let previous = -1;
  for (const ancestor of scope.ancestors) {
    if (!Object.hasOwn(scopeOrder, ancestor.kind) || !validId(ancestor.id)
      || scopeOrder[ancestor.kind] <= previous || scopeOrder[ancestor.kind] >= scopeOrder[scope.kind]) return false;
    previous = scopeOrder[ancestor.kind];
  }
  return true;
}
const episodeForScope = (scope) => scope.kind === 'episode' ? scope.id : scope.ancestors.find((ancestor) => ancestor.kind === 'episode')?.id ?? null;
const containsScope = (container, candidate) => validScope(container) && validScope(candidate)
  && ((container.kind === candidate.kind && container.id === candidate.id) || candidate.ancestors.some((ancestor) => ancestor.kind === container.kind && ancestor.id === container.id));

/** 실제 원고 수량은 합성 작업 제목의 컷 번호와 별도로 센다. */
export function actualCounts(aggregate) {
  return {
    tasks: aggregate.tasks.length,
    edges: aggregate.tasks.reduce((sum, task) => sum + task.dependencyTaskIds.length, 0),
    submissions: aggregate.submissions.length,
    ready: aggregate.tasks.filter((task) => task.status === 'ready').length,
    deliverables: aggregate.deliverables.length,
  };
}

/** 기존 서버 자료를 읽기 위한 입력이며 새 원고·검수본을 생성하는 명령이 아니다. */
export function validateActualInput(input, { sourceSha, actors }) {
  check(input?.schemaVersion === 1 && input.dataProfile === ACTUAL_PROFILE, '실제 원고 입력의 형식이 다릅니다.');
  check(/^[a-f0-9]{40}$/u.test(sourceSha) && input.sourceSha === sourceSha, '실제 원고 입력의 소스 SHA가 다릅니다.');
  for (const key of ['productionProjectId', 'workId', 'episodeId', 'taskId', 'submissionId', 'targetTaskTitle']) check(identifier(input[key]), '실제 원고의 프로젝트·작업·제출 식별자가 필요합니다.');
  check(hash.test(input.aggregateSha256), '서버 aggregate의 고정 digest가 필요합니다.');
  check(input.expectedCounts && Object.keys(input.expectedCounts).sort().join(',') === [...countKeys].sort().join(','), '실제 작업 수량의 필드가 다릅니다.');
  check(countKeys.every((key) => Number.isSafeInteger(input.expectedCounts[key]) && input.expectedCounts[key] >= 0)
    && input.expectedCounts.tasks > 0 && input.expectedCounts.submissions > 0 && input.expectedCounts.deliverables > 0, '실제 작업·제출·산출물 수량이 필요합니다.');
  check(Number.isSafeInteger(input.expectedPageCount) && input.expectedPageCount > 0, '실제 원고 페이지 수가 필요합니다.');
  const evidence = input.sourceEvidence;
  check(evidence?.version === 1 && evidence.kind === 'studio-review-capture' && evidence.selectionMode === 'document', '전체 원고의 저장된 캡처 근거가 필요합니다.');
  check(Object.hasOwn(roleLineage, evidence.documentRole) && roleLineage[evidence.documentRole] === input.revisionRef?.lineage
    && validScope(evidence.scope), '원고 역할·lineage·업무 범위가 제품 계약과 다릅니다.');
  check(evidence.subject?.workId === input.workId && Number.isSafeInteger(evidence.sourceServerRevision) && evidence.sourceServerRevision > 0, '원고 근거의 작품·저장 revision이 다릅니다.');
  check(input.revisionRef?.id === evidence.subject.revisionId && input.revisionRef.productionSubmissionId === input.submissionId
    && input.revisionRef.digest === `sha256:${evidence.subject.rootGraphHash}` && input.revisionRef.revision === evidence.sourceServerRevision, '제출 revision과 고정 검수 원고가 다릅니다.');
  const contract = validateManuscriptManifest(input.pageManifest, { subject: evidence.subject, expectedPageCount: input.expectedPageCount });
  check(Array.isArray(evidence.pages) && evidence.pages.length === contract.pageCount, '저장된 원고 사용 근거와 전체 이미지 수가 다릅니다.');
  const ids = new Set();
  for (const [index, page] of evidence.pages.entries()) {
    const expected = contract.pages[index];
    check(identifier(page.pageId) && !ids.has(page.pageId) && page.ordinal === expected.sourceOrdinal && page.sha256 === expected.sha256
      && Array.isArray(page.frameIds) && page.frameIds.length === 0, '원고 사용 근거의 페이지·순서·digest가 다릅니다.');
    check(expected.mapping?.status === 'mapped' && expected.mapping.page.id === page.pageId
      && expected.mapping.sourceContentDigest === evidence.subject.rootGraphHash
      && expected.mapping.sourceServerRevision === evidence.sourceServerRevision, '이미지의 실제 원고 mapping이 다릅니다.');
    ids.add(page.pageId);
  }
  let image;
  try { image = new URL(input.imageOrigin); } catch { check(false, '로컬 HTTPS 이미지 origin의 형식이 다릅니다.'); }
  check(image.protocol === 'https:' && ['localhost', '127.0.0.1', '[::1]'].includes(image.hostname)
    && image.pathname === '/' && !image.username && !image.password && !image.search && !image.hash, '명시한 로컬 HTTPS 이미지 origin이 필요합니다.');
  check(Array.isArray(input.measureOrdinals) && input.measureOrdinals.length > 0 && input.measureOrdinals[0] === 0
    && new Set(input.measureOrdinals).size === input.measureOrdinals.length
    && input.measureOrdinals.every((ordinal) => Number.isSafeInteger(ordinal) && ordinal >= 0 && ordinal < contract.pageCount), '실제 디코드할 페이지 순번이 다릅니다.');
  check(input.expectedAccessByActor && Object.keys(input.expectedAccessByActor).length === actors.length, '독립 계정별 실제 권한 입력이 필요합니다.');
  for (const actor of actors) {
    const access = input.expectedAccessByActor[actor.id];
    check(access?.view === true && Object.keys(access).sort().join(',') === [...accessKeys].sort().join(',')
      && accessKeys.every((key) => typeof access[key] === 'boolean'), '독립 계정별 조회·댓글·편집·관리 권한이 필요합니다.');
  }
  check(input.baseline?.projectId === input.productionProjectId && input.baseline.workId === input.workId
    && input.baseline.aggregateSha256 === input.aggregateSha256, '실제 DB의 읽기 전용 기준 snapshot이 필요합니다.');
  for (const key of ['revision', 'eventCount', 'mutationReceiptCount']) check(Number.isSafeInteger(input.baseline[key]) && input.baseline[key] >= 0, '기존 DB 원장의 기준 수량이 다릅니다.');
  assert.deepEqual(input.baseline.counts, input.expectedCounts, 'DB 기준과 실제 작업 수량이 다릅니다.');
  return { ...input, imageOrigin: image.origin, contract };
}

/** 역할 이름으로 권한을 추정하지 않고 실제 GET과 고정 입력을 대조한다. */
export function verifyActualProjectRead(payload, input, actorId) {
  const aggregate = payload?.aggregate;
  check(aggregate?.projectId === input.productionProjectId && aggregate.workId === input.workId
    && digest(aggregate) === input.aggregateSha256, '실제 GET의 프로젝트·작품·digest가 다릅니다.');
  assert.deepEqual(actualCounts(aggregate), input.expectedCounts, '실제 GET의 원고 작업 수량이 다릅니다.');
  const expectedAccess = input.expectedAccessByActor[actorId];
  check(expectedAccess && accessKeys.every((key) => payload.access?.[key] === expectedAccess[key]), '실제 GET의 계정별 권한이 다릅니다.');
  const task = aggregate.tasks.find((entry) => entry.id === input.taskId);
  const submission = aggregate.submissions.find((entry) => entry.id === input.submissionId);
  check(task?.projectId === aggregate.projectId && task.title === input.targetTaskTitle && submission?.projectId === aggregate.projectId
    && task.outputDeliverableIds.includes(submission.deliverableId), '실제 작업과 제출본의 연결이 다릅니다.');
  check(validScope(task.scope), '실제 작업의 업무 범위가 다릅니다.');
  const outputs = task.outputDeliverableIds.map((id) => aggregate.deliverables.find((entry) => entry.id === id
    && entry.projectId === aggregate.projectId && containsScope(task.scope, entry.scope))).filter(Boolean);
  const outputEpisodes = new Set(outputs.map((entry) => episodeForScope(entry.scope)).filter((id) => id !== null));
  const episodeId = episodeForScope(task.scope) ?? (outputEpisodes.size === 1 ? [...outputEpisodes][0] : input.episodeId);
  check(episodeId === input.episodeId && aggregate.episodes.some((episode) => episode.episodeId === episodeId && episode.state !== 'cancelled'), '검수 링크의 현재 회차가 다릅니다.');
  const deliverable = outputs.find((entry) => entry.id === submission.deliverableId);
  check(deliverable?.currentSubmissionId === submission.id && submission.status !== 'superseded'
    && stable(submission.sourceEvidence?.scope) === stable(deliverable.scope), '현재 산출물·제출본·원고 사용 범위가 다릅니다.');
  check(stable(submission.revisionRef) === stable(input.revisionRef)
    && stable(submission.sourceEvidence) === stable(input.sourceEvidence), '실제 제출본의 고정 원고 근거가 다릅니다.');
  return { actorId, productionProjectId: aggregate.projectId, submissionId: submission.id, sourceSubject: input.sourceEvidence.subject,
    pageCount: input.contract.pageCount, verified: true };
}

export function actualState(input, env) {
  return { schemaVersion: 1, sourceSha: env.git.sourceSha, schema: env.actorsConfig.schema, productSchema: env.productSchema,
    projectId: input.productionProjectId, workId: input.workId, episodeId: input.episodeId, dataset: ACTUAL_DATASET,
    dataProfile: ACTUAL_PROFILE, aggregateSha256: input.aggregateSha256, counts: input.expectedCounts,
    target: { id: input.taskId, title: input.targetTaskTitle }, baseline: input.baseline,
    actors: env.actors.map(({ role, id }) => ({ role, id })), actualInput: input,
    fixtureLimit: '이미 저장된 원고와 고정 제출본의 읽기 전용 측정. 새 원고·캡처·승인 생성과 실제 제작팀 현장 결과는 포함하지 않음.' };
}
