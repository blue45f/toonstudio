import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { hostname, platform, arch, cpus, totalmem } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { normalizeSnapshot } from './snapshot-contract.mjs';
export { unchangedDb } from './snapshot-contract.mjs';
import { ACTUAL_PROFILE, ACTUAL_DATASET, actualCounts, validateActualInput } from './actual-input.mjs';

export const COUNTS = Object.freeze({ cuts: 500, tasks: 3001, edges: 3500, submissions: 2501, ready: 500, deliverables: 3001 });
export function check(value, message) {
  if (!value) {
    const error = new Error(message);
    error.name = 'C9PreconditionError';
    error.c9SafeMessage = message;
    throw error;
  }
}
export function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function digest(value) { return sha256(stable(value)); }
export function requireAt(root) { return createRequire(join(root, 'package.json')); }
export function localUrl(value, protocols = ['http:', 'https:']) {
  const url = new URL(value);
  check(protocols.includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), '루프백 주소만 허용합니다.');
  check(!url.username && !url.password && !url.hash && !url.search, 'HTTP 주소에 자격증명·query·fragment를 넣을 수 없습니다.');
  return url;
}
export function counts(aggregate) {
  return { cuts: new Set(aggregate.tasks.map((task) => /^dag-cut-(\d{5})-/u.exec(task.title)?.[1]).filter(Boolean)).size, tasks: aggregate.tasks.length, edges: aggregate.tasks.reduce((n, task) => n + task.dependencyTaskIds.length, 0),
    submissions: aggregate.submissions.length, ready: aggregate.tasks.filter((task) => task.status === 'ready').length,
    deliverables: aggregate.deliverables.length };
}
export function assertCounts(aggregate) { assert.deepEqual(counts(aggregate), COUNTS, '고정 DAG 수량이 다릅니다.'); }
export function gitEvidence(config) {
  const read = (...args) => execFileSync('git', args, { cwd: config.repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const sourceSha = read('rev-parse', 'HEAD');
  check(/^[0-9a-f]{40}$/.test(config.expectedSourceSha) && sourceSha === config.expectedSourceSha, '승인한 source SHA와 현재 HEAD가 다릅니다.');
  check(read('status', '--porcelain') === '', 'source worktree가 clean 상태가 아닙니다.');
  return { sourceSha, clean: true, branch: read('branch', '--show-current') };
}
export async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
export async function loadConfig(path) {
  check(isAbsolute(path), 'config는 절대 경로로 지정하세요.');
  const config = await readJson(path);
  const actualProfile = config.dataProfile === ACTUAL_PROFILE;
  for (const key of ['repoRoot', 'actorConfigPath', 'outputDir', actualProfile ? 'actualInputPath' : 'seedStatePath']) check(isAbsolute(config[key] ?? ''), `${key} 절대 경로가 필요합니다.`);
  const outputRoot = actualProfile ? 'toon-collaboration-c9-real-qa' : 'toon-collaboration-c9-v2-qa';
  check([`/tmp/${outputRoot}/`, `/private/tmp/${outputRoot}/`].some((root) => resolve(config.outputDir).startsWith(root)), 'C9 모드별 /tmp 하위 outputDir만 허용합니다.');
  if (actualProfile) check(config.dataset === ACTUAL_DATASET, '기존 저장 원고의 dataset 계약이 다릅니다.');
  else {
    check(dirname(resolve(config.seedStatePath)) === resolve(config.outputDir), 'seed state는 outputDir 바로 아래에 둡니다.');
    check(config.dataset === 'division-dag-500-v1' && config.dataProfile === 'synthetic-no-manuscript-images', '합성 DAG의 dataset 계약이 다릅니다.');
  }
  const meta = await stat(config.actorConfigPath);
  check((meta.mode & 0o077) === 0, '실제 actorConfig는 0600 권한으로 보관하세요.');
  const actorsConfig = await readJson(config.actorConfigPath);
  check(actorsConfig.schema === config.expectedSchema && /^[a-z][a-z0-9_]{0,62}$/.test(actorsConfig.schema) && actorsConfig.schema !== 'public' && !actorsConfig.schema.startsWith('pg_'), '격리 QA schema가 일치하지 않습니다.');
  const db = new URL(actorsConfig.databaseUrl);
  check(['postgres:', 'postgresql:'].includes(db.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(db.hostname), '로컬 PostgreSQL만 허용합니다.');
  check(db.searchParams.get('host') === null, 'PostgreSQL host override는 허용하지 않습니다.');
  check(decodeURIComponent(db.pathname.slice(1)) === config.expectedDatabaseName && config.expectedDatabaseName.endsWith('_test'), '전용 QA database 이름이 다릅니다.');
  const productSchema = actorsConfig.productSchema ?? actorsConfig.schema;
  check(productSchema === config.expectedProductSchema && /^[a-z][a-z0-9_]{0,62}$/.test(productSchema) && !productSchema.startsWith('pg_'), '제품 schema 계약이 다릅니다.');
  if (productSchema === 'public') {
    check(isAbsolute(config.expectedPgData ?? '') && resolve(config.expectedPgData).startsWith(`/tmp/${outputRoot}/`) && resolve(actorsConfig.cleanup?.pgData ?? '') === resolve(config.expectedPgData), 'public 제품 schema에는 별도 승인한 C9v2 임시 cluster의 정확한 경로가 필요합니다.');
    check(decodeURIComponent(db.pathname).endsWith('_test') && actorsConfig.storage?.qaOnly === true && actorsConfig.head === config.expectedSourceSha, 'public은 현재 SHA의 QA 전용 *_test 클러스터에서만 허용합니다.');
  }
  const api = localUrl(actorsConfig.apiBaseUrl);
  const web = localUrl(config.webBaseUrl);
  check(localUrl(actorsConfig.frontendOrigin).origin === web.origin, 'QA 인증/CORS의 실제 frontendOrigin과 측정 origin이 다릅니다.');
  check(api.pathname === '/' && web.pathname === '/', 'API/web 주소는 origin만 지정하세요.');
  check(Array.isArray(config.actorRoles) && config.actorRoles.length >= 2 && config.actorRoles.length <= 4 && config.actorRoles[0] === 'owner', 'owner를 포함한 2~4개 실제 계정 역할이 필요합니다.');
  const actors = config.actorRoles.map((role) => {
    const actor = actorsConfig.actors?.[role];
    check(actor && typeof actor.id === 'string' && typeof actor.email === 'string' && typeof actor.password === 'string' && actor.password.length > 0, '실제 actorConfig 계정 계약을 확인하세요.');
    return { ...actor, role };
  });
  check(new Set(actors.map((actor) => actor.id)).size === actors.length && new Set(config.actorRoles).size === actors.length, '독립 실제 계정 ID가 중복되었습니다.');
  const git = gitEvidence(config);
  let actualInput = null;
  if (actualProfile) {
    check(((await stat(config.actualInputPath)).mode & 0o077) === 0, '실제 원고 입력은 0600 권한으로 보관하세요.');
    actualInput = validateActualInput(await readJson(config.actualInputPath), { sourceSha: git.sourceSha, actors });
  }
  return { config, actorsConfig, actors, git, productSchema, apiOrigin: api.origin, webOrigin: web.origin, actualInput };
}
export function validateProfile(profile) {
  check(profile && typeof profile.id === 'string' && Number.isInteger(profile.viewport?.width) && Number.isInteger(profile.viewport?.height) && profile.viewport.width > 0 && profile.viewport.height > 0, 'viewport profile이 필요합니다.');
  check(profile.deviceScaleFactor === 1 && profile.locale === 'ko-KR' && profile.timezoneId === 'Asia/Seoul', '기존 제어 profile의 DPR·언어·시간대를 명시하세요.');
  check(profile.cpuRate === 1 || profile.cpuRate === 4, '기존 하네스의 CPU rate 1 또는 4만 재사용합니다.');
  if (profile.network !== null) assert.deepEqual(profile.network, { offline: false, latency: 562.5, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 }, '기존 Slow 4G profile과 다릅니다.');
  check((profile.cpuRate === 1 && profile.network === null) || (profile.cpuRate === 4 && profile.network !== null), '기존 unthrottled/cpu4x-slow4g 조합만 허용합니다.');
}
export function hostEvidence() {
  return { platform: platform(), arch: arch(), node: process.version, cpuModel: cpus()[0]?.model ?? null, logicalCpus: cpus().length, totalMemoryBytes: totalmem(), hostIdentifierSha256: sha256(hostname()) };
}
export async function assertQaDatabase(client, env) {
  const identity = (await client.query("SELECT current_database() AS name, current_setting('data_directory') AS directory")).rows[0];
  check(identity.name === env.config.expectedDatabaseName, '실제 연결 DB가 다릅니다.');
  check(await realpath(identity.directory) === await realpath(env.actorsConfig.cleanup.pgData), '실제 로컬 PostgreSQL cluster 경로가 다릅니다.');
  const marker = (await client.query(`SELECT count(*) AS n FROM "${env.actorsConfig.schema}".run_marker`)).rows[0];
  check(Number(marker.n) === 1, '실제 QA run marker가 없습니다.');
}
export async function snapshotDb(env, projectId) {
  const { Client } = requireAt(env.config.repoRoot)('pg');
  const client = new Client({ connectionString: env.actorsConfig.databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await assertQaDatabase(client, env);
    await client.query(`SET LOCAL search_path TO "${env.productSchema}", pg_catalog`);
    const row = (await client.query('SELECT id, "workId", "createdBy", revision, aggregate FROM production_project WHERE id=$1', [projectId])).rows[0];
    check(row, 'C9 전용 프로젝트가 없습니다.');
    const events = Number((await client.query('SELECT count(*) AS n FROM production_project_event WHERE "projectId"=$1', [projectId])).rows[0].n);
    const receipts = Number((await client.query('SELECT count(*) AS n FROM production_project_mutation_receipt WHERE "projectId"=$1', [projectId])).rows[0].n);
    const work = (await client.query('SELECT id, "userId", revision, "updatedAt" FROM creator_work WHERE id=$1', [row.workId])).rows[0];
    const memberships = (await client.query('SELECT "userId", role, status FROM creator_work_collaborator WHERE "workId"=$1 ORDER BY "userId"', [row.workId])).rows;
    await client.query('COMMIT');
    return normalizeSnapshot({ projectId: row.id, workId: row.workId, createdBy: row.createdBy, revision: row.revision, aggregateSha256: digest(row.aggregate), counts: env.actualInput ? actualCounts(row.aggregate) : counts(row.aggregate), eventCount: events, mutationReceiptCount: receipts, work, memberships, checkedAt: new Date().toISOString() });
  } finally { await client.end(); }
}
export function stats(values) {
  check(values.length > 0 && values.every(Number.isFinite), '유효한 원시 표본이 필요합니다.');
  const ordered = [...values].sort((a, b) => a - b);
  const percentile = (fraction) => ordered[Math.max(0, Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1))];
  return { n: values.length, p50: percentile(0.5), p95: percentile(0.95), max: ordered.at(-1), estimator: 'nearest-rank ceil(n*fraction)-1', smallSampleP95EqualsMax: Math.ceil(ordered.length * 0.95) === ordered.length };
}
export async function artifactEvidence(env) {
  const { config } = env;
  if (config.runtimeMode === 'development') {
    check(config.allowDevelopment === true && config.artifact === null, '개발 측정은 명시 승인 라벨과 artifact:null이 필요합니다.');
    return { runtimeMode: 'development', qualifiedForFinalP95: false, reason: '개발 모드·대표 원고 없음', sourceSha: env.git.sourceSha };
  }
  check(config.runtimeMode === 'production-preview' && config.allowDevelopment === false, '검증된 production-preview 또는 명시 development만 허용합니다.');
  const artifact = config.artifact;
  check(artifact && isAbsolute(artifact.distDir) && isAbsolute(artifact.buildEvidencePath), '현재 SHA의 실제 빌드 증거가 필요합니다.');
  const dist = await realpath(artifact.distDir);
  const evidence = await readJson(artifact.buildEvidencePath);
  check(evidence.sourceSha === env.git.sourceSha && evidence.clean === true && evidence.exitCode === 0 && evidence.runtimeMode === 'production-preview', '빌드 증거의 SHA·clean·exit·mode가 일치하지 않습니다.');
  check(isAbsolute(evidence.logPath) && (await stat(evidence.logPath)).size > 0 && typeof evidence.command === 'string' && evidence.command.length > 0 && typeof evidence.builtAt === 'string', '정확한 빌드 명령·보존 로그·시각이 필요합니다.');
  const manifestPath = join(dist, '.vite/manifest.json');
  const manifestBytes = await readFile(manifestPath);
  const indexBytes = await readFile(join(dist, 'index.html'));
  check(sha256(manifestBytes) === artifact.manifestSha256 && sha256(manifestBytes) === evidence.manifestSha256 && sha256(indexBytes) === evidence.indexSha256, '빌드 산출물 manifest/index 해시가 다릅니다.');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  check(Object.keys(manifest).length > 0 && Object.values(manifest).some((entry) => entry.isEntry), 'Vite manifest entry가 없습니다.');
  const paths = new Set(Object.values(manifest).flatMap((entry) => [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])]).filter(Boolean));
  const files = [];
  for (const file of paths) {
    check(typeof file === 'string' && !isAbsolute(file) && !relative(dist, resolve(dist, file)).startsWith('..'), 'manifest 경로가 dist 바깥입니다.');
    check((await stat(join(dist, file))).isFile(), 'manifest에 대응하는 산출물이 없습니다.');
    const bytes = await readFile(join(dist, file));
    files.push({ file, sha256: sha256(bytes), bytes: bytes.length });
  }
  const served = await fetch(`${env.webOrigin}/`, { redirect: 'error' });
  check(served.ok && sha256(Buffer.from(await served.arrayBuffer())) === sha256(indexBytes), 'preview가 검증한 index를 제공하지 않습니다.');
  const entryAssets = new Set(Object.values(manifest).filter((entry) => entry.isEntry).flatMap((entry) => [entry.file, ...(entry.css ?? [])]));
  for (const file of entryAssets) {
    const response = await fetch(new URL(file, `${env.webOrigin}/`), { redirect: 'error' });
    check(response.ok && sha256(Buffer.from(await response.arrayBuffer())) === sha256(await readFile(join(dist, file))), 'preview entry JS/CSS와 검증된 산출물이 다릅니다.');
  }
  return { runtimeMode: 'production-preview', sourceSha: env.git.sourceSha, manifestSha256: sha256(manifestBytes), indexSha256: sha256(indexBytes), manifestEntries: Object.keys(manifest).length, manifestFiles: paths.size, files, servedEntryAssetsVerified: entryAssets.size, buildCommand: evidence.command, buildLogPath: evidence.logPath, builtAt: evidence.builtAt, qualifiedForFinalP95: false, reason: '대표 원고 이미지·승인된 C9 예산 없음' };
}
