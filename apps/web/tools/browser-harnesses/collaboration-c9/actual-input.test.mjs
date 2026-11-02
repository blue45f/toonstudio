import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { ACTUAL_PROFILE, actualCounts, validateActualInput, verifyActualProjectRead } from './actual-input.mjs';

const sha = 'a'.repeat(40);
const stable = (value) => Array.isArray(value) ? `[${value.map(stable).join(',')}]`
  : value !== null && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}` : JSON.stringify(value);
const digest = (value) => createHash('sha256').update(stable(value)).digest('hex');
function fixture() {
  const subject = { schemaVersion: 1, projectId: 'graph-project', workId: 'work-1', artifactId: 'artifact-1', reviewId: 'review-1', revisionId: 'revision-1', rootGraphHash: 'b'.repeat(64) };
  const mapping = { status: 'mapped', version: 1, sourceServerRevision: 7, sourceContentDigest: subject.rootGraphHash,
    page: { id: 'page-1', ordinal: 0, width: 1440, height: 2160, renderWidth: 1440, renderHeight: 2160, frames: [], elements: [] } };
  const page = { ordinal: 0, path: 'pages/0001.png', sha256: 'c'.repeat(64), mediaType: 'image/png', byteLength: 16,
    sourceReviewId: subject.reviewId, sourceRevisionId: subject.revisionId, sourceArtifactId: subject.artifactId, sourceOrdinal: 0, mapping };
  const evidence = { version: 1, kind: 'studio-review-capture', subject, sourceServerRevision: 7, documentRole: 'lineart', selectionMode: 'document',
    scope: { kind: 'episode', id: 'episode-1', ancestors: [{ kind: 'project', id: 'production-1' }] },
    pages: [{ pageId: 'page-1', ordinal: 0, sha256: page.sha256, frameIds: [] }] };
  const revisionRef = { id: subject.revisionId, revision: 7, digest: `sha256:${subject.rootGraphHash}`, productionSubmissionId: 'submission-1', createdAt: '2026-11-02T00:00:00.000Z', lineage: 'visual' };
  const aggregate = { projectId: 'production-1', workId: subject.workId,
    tasks: [{ id: 'task-1', title: '60컷 원고 검수', projectId: 'production-1', dependencyTaskIds: [], outputDeliverableIds: ['deliverable-1'], status: 'internal-review', scope: structuredClone(evidence.scope) }],
    submissions: [{ id: 'submission-1', projectId: 'production-1', deliverableId: 'deliverable-1', status: 'submitted', revisionRef, sourceEvidence: evidence }],
    deliverables: [{ id: 'deliverable-1', projectId: 'production-1', scope: structuredClone(evidence.scope), currentSubmissionId: 'submission-1' }],
    episodes: [{ episodeId: 'episode-1', state: 'active' }] };
  const expectedCounts = actualCounts(aggregate);
  const access = { view: true, comment: true, edit: true, manage: false };
  const input = { schemaVersion: 1, dataProfile: ACTUAL_PROFILE, sourceSha: sha, productionProjectId: aggregate.projectId, workId: aggregate.workId,
    episodeId: 'episode-1', taskId: 'task-1', submissionId: 'submission-1', targetTaskTitle: aggregate.tasks[0].title,
    aggregateSha256: digest(aggregate), expectedCounts, expectedPageCount: 1, sourceEvidence: evidence, revisionRef,
    pageManifest: { schema: 'toonstudio.page-manifest.v1', projectId: subject.projectId, workId: subject.workId, artifactId: subject.artifactId,
      title: '검증 입력', createdAt: '2026-11-02T00:00:00.000Z', pageCount: 1, contentBytes: 16, pages: [page] },
    imageOrigin: 'https://127.0.0.1:5191', measureOrdinals: [0], expectedAccessByActor: { 'editor-1': access },
    baseline: { projectId: aggregate.projectId, workId: aggregate.workId, aggregateSha256: digest(aggregate), counts: expectedCounts, revision: 8, eventCount: 12, mutationReceiptCount: 9 } };
  return { input, aggregate, access, options: { sourceSha: sha, actors: [{ id: 'editor-1', role: 'editor' }] } };
}

test('기존 원장의 0이 아닌 기준값과 편집 가능한 비소유 계정 권한을 보존한다', () => {
  const { input, aggregate, access, options } = fixture();
  const normalized = validateActualInput(input, options);
  assert.equal(normalized.baseline.eventCount, 12);
  assert.equal(normalized.baseline.mutationReceiptCount, 9);
  assert.equal(verifyActualProjectRead({ aggregate, access }, normalized, 'editor-1').verified, true);
  assert.equal(normalized.contract.pageCount, 1);
});

test('빈 원고와 제출본에서 다른 저장 revision으로 바뀐 근거를 거절한다', () => {
  const { input, options } = fixture();
  for (const mutate of [
    (copy) => { copy.pageManifest.pages = []; },
    (copy) => { copy.sourceEvidence.sourceServerRevision += 1; },
    (copy) => { copy.sourceEvidence.pages[0].pageId = 'other-page'; },
    (copy) => { copy.sourceEvidence.subject.workId = 'other-work'; },
    (copy) => { copy.revisionRef.productionSubmissionId = 'other-submission'; },
  ]) {
    const changed = structuredClone(input); mutate(changed);
    assert.throws(() => validateActualInput(changed, options));
  }
});

test('원고 입력이 맞아도 실제 계정의 현재 권한이 다르면 거절한다', () => {
  const { input, aggregate, access, options } = fixture();
  const normalized = validateActualInput(input, options);
  assert.throws(() => verifyActualProjectRead({ aggregate, access: { ...access, manage: true } }, normalized, 'editor-1'));
  assert.throws(() => verifyActualProjectRead({ aggregate, access }, normalized, 'other-account'));
});

test('관측할 순번과 이미지 origin에는 빈 목록·중복·범위 이탈·자격증명을 허용하지 않는다', () => {
  const { input, options } = fixture();
  for (const value of [[], [0, 0], [-1], [1], [0.5]]) assert.throws(() => validateActualInput({ ...input, measureOrdinals: value }, options));
  const credentialUrl = new URL('https://127.0.0.1:5191');
  credentialUrl.username = 'fixture-user'; credentialUrl.password = 'fixture-password';
  for (const value of ['https://example.com', 'http://127.0.0.1:5191', credentialUrl.href, 'https://127.0.0.1:5191?token=secret']) {
    assert.throws(() => validateActualInput({ ...input, imageOrigin: value }, options));
  }
});

test('실제 GET 본문이 바뀌면 입력에 적힌 별도 digest로 통과시키지 않는다', () => {
  const { input, aggregate, access, options } = fixture();
  const normalized = validateActualInput(input, options);
  const changed = structuredClone(aggregate); changed.tasks[0].title = '다른 작업';
  assert.throws(() => verifyActualProjectRead({ aggregate: changed, access }, normalized, 'editor-1'));
});

test('제품에 없는 문서 역할이나 역할과 다른 lineage는 거절한다', () => {
  const { input, options } = fixture();
  const unknown = structuredClone(input); unknown.sourceEvidence.documentRole = 'art';
  const wrong = structuredClone(input); wrong.revisionRef.lineage = 'narrative';
  assert.throws(() => validateActualInput(unknown, options));
  assert.throws(() => validateActualInput(wrong, options));
});

test('현재 digest가 맞아도 과거 제출본·다른 회차·취소 회차·출력 범위 이탈은 거절한다', () => {
  const cases = [
    (value) => {
      value.aggregate.deliverables[0].currentSubmissionId = 'new-submission';
      const next = structuredClone(value.aggregate.submissions[0]); next.id = 'new-submission'; next.revisionRef.productionSubmissionId = next.id;
      value.aggregate.submissions.push(next);
    },
    (value) => { value.input.episodeId = 'other-episode'; },
    (value) => { value.aggregate.episodes[0].state = 'cancelled'; },
    (value) => { value.aggregate.deliverables[0].projectId = 'other-project'; },
    (value) => { value.aggregate.deliverables[0].scope.id = 'other-episode'; },
    (value) => { value.aggregate.submissions[0].status = 'superseded'; },
    (value) => { value.input.sourceEvidence.scope.id = 'other-episode'; },
  ];
  for (const mutate of cases) {
    const value = fixture(); mutate(value);
    value.input.aggregateSha256 = digest(value.aggregate);
    value.input.expectedCounts = actualCounts(value.aggregate);
    value.input.baseline.aggregateSha256 = value.input.aggregateSha256;
    value.input.baseline.counts = value.input.expectedCounts;
    const normalized = validateActualInput(value.input, value.options);
    assert.throws(() => verifyActualProjectRead({ aggregate: value.aggregate, access: value.access }, normalized, 'editor-1'));
  }
});
