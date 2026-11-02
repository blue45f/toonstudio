import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { access, mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { COUNTS, assertCounts, assertQaDatabase, check, counts, digest, gitEvidence, loadConfig, readJson, requireAt, snapshotDb } from './shared.mjs';

// 실행은 추후 별도 승인한 로컬 QA 단계에서만 한다. 기본 --plan은 DB에 연결하지 않는다.
async function main() {
  const [configPath, mode] = process.argv.slice(2);
  check(['--plan', '--apply'].includes(mode) && process.argv.length === 4, '사용법: node --import <repo>/node_modules/tsx/dist/esm/index.mjs seed.mjs <절대config> --plan|--apply');
  const requested = await readJson(configPath);
  check(requested.dataProfile !== 'existing-manuscript-with-images', '실제 저장 원고 모드는 seed를 사용하지 않습니다. DB 연결·파일 생성 없이 중단합니다.');
  const env = await loadConfig(configPath);
  const { config, actors, actorsConfig, git } = env;
  await mkdir(config.outputDir, { recursive: true, mode: 0o700 });
  try { await access(config.seedStatePath); throw new Error('기존 seed state를 덮어쓸 수 없습니다. 새 outputDir를 지정하세요.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const core = await import(pathToFileURL(join(config.repoRoot, 'packages/core/src/production/index.ts')).href);
  const workflow = await import(pathToFileURL(join(config.repoRoot, 'packages/contracts/src/production-workflow.ts')).href);
  const { divisionQueueDependencyFixture } = await import(pathToFileURL(join(config.repoRoot, 'apps/web/src/domains/creator/production-hub/production-division-handoff-queue.test-fixture.ts')).href);
  const fixture = divisionQueueDependencyFixture(500);
  assertCounts(fixture);
  const runId = `c9-${randomUUID()}`;
  const projectId = `${runId}-project`;
  const workId = `${runId}-work`;
  const episodeId = `${runId}-episode`;
  const ownerPartyId = `${runId}-party-owner`;
  const at = new Date().toISOString();
  const owner = actors[0];
  const base = core.createProductionProjectAggregate({ projectId, workId, title: `${runId} 합성 DAG 제어 측정`, collaborationModel: 'studio-production', ownerPartyId, ownerUserId: owner.id, ownerDisplayName: 'C9 소유자', at });
  const profile = workflow.createProductionWorkflowProfile(projectId, 'studio', at);
  const scope = core.episodeScope(projectId, episodeId);
  const namespace = (id) => `${runId}:${id}`;
  const parties = actors.map((actor, index) => ({ ...base.parties[0], id: index === 0 ? ownerPartyId : `${runId}-party-${index}`, accountUserId: actor.id, publicDisplayName: `C9 참여자 ${index + 1}`, internalDisplayName: `C9 참여자 ${index + 1}` }));
  const roles = [...new Set(profile.steps.map((step) => step.defaultRole))];
  const assignments = [...base.assignments, ...roles.filter((role) => role !== 'producer').map((role) => ({ ...base.assignments[0], id: `${runId}-assignment-${role}`, roleType: role, capabilities: [], lead: false }))];
  const assignmentFor = (process) => {
    const step = profile.steps.find((entry) => entry.key === workflow.canonicalProductionProcessKey(process));
    check(step, 'DAG에 현재 profile에 없는 공정이 있습니다.');
    const assignment = assignments.find((entry) => entry.roleType === step.defaultRole);
    check(assignment, 'DAG 공정의 활성 담당 배정이 없습니다.');
    return assignment.id;
  };
  const revision = (ref) => ({ ...ref, id: namespace(ref.id), createdAt: at });
  const taskByOutput = new Map(fixture.tasks.flatMap((task) => task.outputDeliverableIds.map((id) => [id, task])));
  let aggregate = { ...base, parties, assignments, workflowProfile: profile,
    episodes: [{ id: `${runId}-collaboration`, projectId, episodeId, revision: 1, state: 'episode-planning', narrativeRevisionRef: null, visualRevisionRef: null, integratedRevisionRef: null, activeHandoffId: null, openBlockerCount: 0, storyLockApproved: false, thumbnailLockApproved: false, jointProofApproved: false, creditPreflightPassed: false, publicationPreflightPassed: false, updatedAt: at }],
    tasks: fixture.tasks.map((task) => ({ ...task, id: namespace(task.id), projectId, scope, assignmentIds: [assignmentFor(task.processKey)], reviewerAssignmentIds: [base.assignments[0].id], dependencyTaskIds: task.dependencyTaskIds.map(namespace), inputRevisionRefs: task.inputRevisionRefs.map(revision), outputDeliverableIds: task.outputDeliverableIds.map(namespace), sourceAgreementMilestoneId: null, linkedRiskIds: [], statusChangedAt: at })),
    deliverables: fixture.deliverables.map((entry) => ({ ...entry, id: namespace(entry.id), projectId, scope, currentSubmissionId: entry.currentSubmissionId ? namespace(entry.currentSubmissionId) : null, approvedSubmissionId: entry.approvedSubmissionId ? namespace(entry.approvedSubmissionId) : null })),
    submissions: fixture.submissions.map((entry) => ({ ...entry, id: namespace(entry.id), projectId, deliverableId: namespace(entry.deliverableId), revisionRef: revision(entry.revisionRef), inputRevisionRefs: entry.inputRevisionRefs.map(revision), submittedByAssignmentId: assignmentFor(taskByOutput.get(entry.deliverableId).processKey), submittedAt: at })),
  };
  aggregate = core.migrateProductionProjectAggregate(aggregate);
  assertCounts(aggregate);
  const taskIds = new Set(aggregate.tasks.map((entry) => entry.id));
  const deliverables = new Map(aggregate.deliverables.map((entry) => [entry.id, entry]));
  const submissions = new Map(aggregate.submissions.map((entry) => [entry.id, entry]));
  const assignmentIds = new Set(assignments.map((entry) => entry.id));
  check(taskIds.size === COUNTS.tasks && deliverables.size === COUNTS.deliverables && submissions.size === COUNTS.submissions, 'DAG 식별자가 중복되었습니다.');
  for (const assignment of assignments) { core.assertScopeRef(assignment.scope); check(assignment.projectId === projectId && assignment.partyId === ownerPartyId && assignment.status === 'active' && assignment.endsAt === null, '담당자와 새 프로젝트 소유자가 일치하지 않습니다.'); }
  const reader = core.createProductionTaskWorkflowReader(aggregate);
  for (const task of aggregate.tasks) {
    core.assertScopeRef(task.scope);
    check(task.projectId === projectId && task.scope.id === episodeId && task.scope.ancestors[0]?.id === projectId, '작업 scope의 프로젝트·회차가 다릅니다.');
    check(task.dependencyTaskIds.every((id) => taskIds.has(id)) && task.outputDeliverableIds.every((id) => deliverables.has(id)) && [...task.assignmentIds, ...task.reviewerAssignmentIds].every((id) => assignmentIds.has(id)), 'DAG 참조가 없습니다.');
    check(reader.hasCurrentDependencyInputs(task), 'DAG의 고정 입력이 현재 승인 출력과 다릅니다.');
    if (task.status === 'approved') check(reader.hasCurrentApprovedOutputs(task), '합성 승인 출력 참조가 현재 제출본과 다릅니다.');
  }
  for (const entry of aggregate.deliverables) {
    core.assertScopeRef(entry.scope);
    check(entry.projectId === projectId, '산출물 projectId가 다릅니다.');
    if (entry.currentSubmissionId) check(submissions.get(entry.currentSubmissionId)?.deliverableId === entry.id, '현재 제출 참조가 다릅니다.');
  }
  check(core.detectTaskDependencyCycles(aggregate.tasks).length === 0, 'DAG에 순환이 있습니다.');
  assert.deepEqual(workflow.validateProductionWorkflowProfile({ ...aggregate, workflowProfile: null }, profile), [], 'canonical profile 검증 실패');
  assert.deepEqual(workflow.validateProductionWorkflowMutation(aggregate, aggregate, at), [], 'snapshot workflow 일관성 검증 실패');
  check(!JSON.stringify(aggregate).includes('sample-project') && !JSON.stringify(aggregate).includes('sample-work'), '데모 프로젝트 식별자가 남았습니다.');
  const proofTask = aggregate.tasks.find((task) => task.title === 'dag-cut-00499-proof');
  check(proofTask?.status === 'ready', '검색·상세 열기 대상이 없습니다.');
  const state = { schemaVersion: 1, applied: false, runId, sourceSha: git.sourceSha, schema: actorsConfig.schema, productSchema: env.productSchema, projectId, workId, episodeId, ownerPartyId, ownerUserId: owner.id,
    dataset: config.dataset, dataProfile: config.dataProfile, aggregateSha256: digest(aggregate), counts: counts(aggregate), target: { id: proofTask.id, title: proofTask.title },
    actors: actors.map((actor) => ({ role: actor.role, id: actor.id, workRole: actor.role === 'owner' ? 'owner' : 'viewer' })),
    canonicalChecks: ['current core aggregate factory + v2 migration', 'scope/identity/reference mapping', 'current dependency inputs + approved output reader', 'dependency cycle detection', 'workflow profile validator', 'same-snapshot workflow validator'],
    fixtureLimit: '승인 상태를 가진 합성 snapshot의 로컬 DB 직접 INSERT. 실제 승인 명령·원고 저장·동의 절차의 검증이 아님.', createdAt: at };
  if (mode === '--plan') {
    await writeFile(join(config.outputDir, 'seed-plan.json'), `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ mode, dbConnected: false, sourceSha: git.sourceSha, counts: state.counts, statePath: join(config.outputDir, 'seed-plan.json') }));
    return;
  }
  gitEvidence(config);
  // commit 직후 증거 저장이 실패해도 대상 UUID를 복구할 수 있게 먼저 보관한다.
  await writeFile(config.seedStatePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  const { Client } = requireAt(config.repoRoot)('pg');
  const client = new Client({ connectionString: actorsConfig.databaseUrl });
  await client.connect();
  let committed;
  try {
    await client.query('BEGIN');
    await assertQaDatabase(client, env);
    await client.query(`SET LOCAL search_path TO "${env.productSchema}", pg_catalog`);
    const foundActors = (await client.query('SELECT id FROM "user" WHERE id = ANY($1::text[])', [actors.map((actor) => actor.id)])).rows;
    check(foundActors.length === actors.length, '기존 실제 계정이 해당 schema에 없습니다.');
    const collisions = (await client.query('SELECT id FROM creator_work WHERE id=$1 UNION ALL SELECT id FROM production_project WHERE id=$2', [workId, projectId])).rows;
    check(collisions.length === 0, '새 UUID 식별자가 기존 행과 충돌합니다.');
    // 기존 행 UPDATE/DELETE/ON CONFLICT 및 사용자 권한 변경은 없다. 새 작품도 비공개 초안이다.
    await client.query('INSERT INTO creator_work (id,"userId",title,description,format,pages,doc,status,hidden,revision,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,true,1,$9,$9)', [workId, owner.id, aggregate.title, 'C9 합성 DAG 제어 측정 전용', 'cuttoon', '[]', '{}', 'draft', at]);
    for (const actor of actors.slice(1)) await client.query('INSERT INTO creator_work_collaborator ("workId","userId",role,status,"invitationId","invitedBy","createdAt","updatedAt","respondedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$7)', [workId, actor.id, 'viewer', 'active', `${runId}-read-${actor.role}`, owner.id, at]);
    await client.query('INSERT INTO production_project (id,"workId","organizationId",title,"collaborationModel","modelVersion",revision,aggregate,"createdBy","createdAt","updatedAt") VALUES ($1,$2,NULL,$3,$4,2,0,$5::jsonb,$6,$7,$7)', [projectId, workId, aggregate.title, aggregate.collaborationModel, JSON.stringify(aggregate), owner.id, at]);
    const inserted = (await client.query('SELECT aggregate FROM production_project WHERE id=$1', [projectId])).rows[0];
    check(digest(inserted.aggregate) === state.aggregateSha256, 'INSERT 후 aggregate가 다릅니다.');
    await client.query('COMMIT');
    committed = true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { await client.end(); }
  if (committed) {
    state.applied = true;
    state.appliedAt = new Date().toISOString();
    state.baseline = await snapshotDb(env, projectId);
    check(state.baseline.eventCount === 0 && state.baseline.mutationReceiptCount === 0 && state.baseline.revision === 0, '초기 mutation/event가 0이 아닙니다.');
    const completedPath = `${config.seedStatePath}.completed`;
    await writeFile(completedPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    await rename(completedPath, config.seedStatePath);
    console.log(JSON.stringify({ mode, applied: true, projectId, workId, sourceSha: git.sourceSha, counts: state.counts, mutationCount: 0, statePath: config.seedStatePath }));
  }
}
main().catch((error) => { console.error(JSON.stringify({ status: 'failed', errorType: error.name, errorCode: error.code ?? null, validation: error.c9SafeMessage ?? null, note: '민감정보 보호를 위해 외부 오류 본문·stack·DB 연결 문자열은 출력하지 않음' })); process.exitCode = 1; });
