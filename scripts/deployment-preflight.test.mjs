import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { contract, inspectDeployment } from './deployment-preflight.mjs';
const sha = 'a'.repeat(40);
const options = { profile: 'onpod-current', sha, head: sha };
function fixture() {
  const env = { ...contract.profiles['onpod-current'].settings };
  for (const [name, spec] of Object.entries(contract.variables)) {
    if (spec.type === 'secret32') env[name] = `${name}:`.padEnd(80, 'x');
  }
  for (const [a, b] of contract.pairs) env[b] = env[a];
  // 문서·운영 값과 무관한 합성 credential. 네트워크 접속 없음.
  env.DATABASE_URL = `postgresql://${['fixture', 'fixture'].join(':')}@toonstudio-db.db.onpod.local/example`;
  env.TRAFFIC_ANALYTICS_D1_RPC_URL = 'https://analytics.example.test/query';
  return env;
}
const codes = result => result.errors.map(item => item.code);

test('현재 프로필은 offline 계약만 통과하고 인증·배포 권한을 주장하지 않는다', () => {
  const result = inspectDeployment({ ...options, env: fixture(), dirty: true });
  assert.deepEqual(result.errors, []);
  assert.equal(result.status, 'offline-contract-only');
  assert.equal(result.deploymentAuthorized, false);
  assert.ok(result.findings.some(f => f.code === 'REMOTE_AUTH_UNVERIFIED'));
  assert.ok(result.findings.some(f => f.code === 'WORKTREE_DIFF_NOT_COVERED_BY_SHA'));
});
test('명시적 프로필·정확한 SHA·필수 secret이 없으면 닫힌다', () => {
  assert.ok(codes(inspectDeployment({ ...options, profile: undefined })).includes('PROFILE_REQUIRED'));
  assert.ok(codes(inspectDeployment({ ...options, sha: 'main' })).includes('EXACT_CHECKOUT_SHA_REQUIRED'));
  assert.ok(codes(inspectDeployment({ ...options, head: 'b'.repeat(40) })).includes('EXACT_CHECKOUT_SHA_REQUIRED'));
  assert.ok(codes(inspectDeployment(options)).includes('MISSING_REQUIRED'));
});
test('잘못된 origin과 퇴역 origin을 차단한다', () => {
  for (const origin of ['https://toonspectrum-core-api.onrender.com', 'https://old.vercel.app', 'https://old.neon.tech', 'https://toonstudio-api.onpod.ai/path', 'https://toonstudio-api.onpod.ai?token=x', `https://${['fixture', 'fixture'].join(':')}@example.test`, 'http://localhost', 'invalid']) {
    const env = { ...fixture(), CORE_API_ORIGIN: origin };
    assert.ok(codes(inspectDeployment({ ...options, unit: 'static-worker', env })).includes('INVALID_OR_RETIRED_ORIGIN'));
  }
});
test('conditional D1·distributed·postgres 요구사항은 누락 시 닫힌다', () => {
  let env = fixture();
  delete env.TRAFFIC_ANALYTICS_D1_RPC_TOKEN;
  assert.ok(inspectDeployment({ ...options, env }).errors.some(f => f.keys.includes('TRAFFIC_ANALYTICS_D1_RPC_TOKEN')));
  env = { ...contract.profiles['generic-separated'].settings };
  const result = inspectDeployment({ ...options, profile: 'generic-separated', env });
  assert.ok(result.errors.some(f => f.keys.includes('UPSTASH_COORDINATION_REST_TOKEN')));
  const postgres = inspectDeployment({ ...options, env: { ...fixture(), STUDIO_LIVE_CLUSTER_ADAPTER: 'postgres' } });
  assert.ok(postgres.errors.some(f => f.keys.includes('STUDIO_LIVE_POSTGRES_URL')));
});
test('짝 불일치·티켓과 제어 secret 재사용·약한 secret을 차단한다', () => {
  let env = { ...fixture(), CORE_ORIGIN_SECRET: 'm'.repeat(64) };
  assert.ok(codes(inspectDeployment({ ...options, env })).includes('SECRET_PAIR_MISMATCH'));
  env = fixture(); env.REALTIME_CONTROL_SECRET = env.REALTIME_TICKET_SECRET;
  assert.ok(codes(inspectDeployment({ ...options, env })).includes('REALTIME_SECRETS_MUST_DIFFER'));
  env = { ...fixture(), AUTH_SESSION_SECRET: 'short' };
  assert.ok(codes(inspectDeployment({ ...options, env })).includes('INVALID_SECRET_FORMAT'));
});
test('VITE 비밀 이름·임의 이름으로 복사한 비밀 값을 노출하지 않는다', () => {
  const env = fixture();
  env.VITE_DATABASE_URL = env.DATABASE_URL;
  env.VITE_AUTH_SESSION_SECRET = env.AUTH_SESSION_SECRET;
  env.VITE_LABEL = env.CORE_ORIGIN_SECRET;
  const result = inspectDeployment({ ...options, env });
  assert.ok(codes(result).includes('SERVER_SECRET_IN_PUBLIC_ENV'));
  assert.ok(codes(result).includes('SERVER_SECRET_VALUE_IN_PUBLIC_ENV'));
  for (const [name, spec] of Object.entries(contract.variables)) {
    if (spec.visibility === 'server-secret' && env[name]) assert.ok(!JSON.stringify(result).includes(env[name]));
  }
});
test('onpod에는 기존 DDL·퇴역 recovery workflow를 연결하지 않는다', () => {
  assert.ok(codes(inspectDeployment({ ...options, env: fixture(), operation: 'database-migrations' })).includes('ONPOD_DATABASE_WORKFLOW_UNSUPPORTED'));
  assert.ok(codes(inspectDeployment({ ...options, env: fixture(), operation: 'health-recovery' })).includes('RETIRED_RECOVERY_TARGET_UNSUPPORTED'));
});
test('generic DB 계약은 기존 엄격 validator를 재사용한다', () => {
  const env = { ...fixture(), ...contract.profiles['generic-separated'].settings, UPSTASH_COORDINATION_REST_URL: 'https://coordination.example.test', DATABASE_URL: `postgresql://${['fixture', 'fixture'].join(':')}@db.example.test/example?sslmode=require` };
  assert.ok(codes(inspectDeployment({ ...options, profile: 'generic-separated', env })).includes('INVALID_OR_UNSUPPORTED_DATABASE_TARGET'));
});
test('API enum 계약이 배포 manifest와 어긋나면 실패한다', () => {
  const source = readFileSync(new URL('../apps/api/src/config/env.ts', import.meta.url), 'utf8');
  for (const [name, spec] of Object.entries(contract.variables)) {
    if (!Array.isArray(spec.type)) continue;
    const field = source.match(new RegExp(`${name}: z\\s*\\.enum\\(\\[([^\\]]+)\\]`));
    assert.ok(field, name);
    assert.deepEqual([...field[1].matchAll(/"([^"]+)"/gu)].map(m => m[1]), spec.type, name);
  }
});
test('CLI는 알 수 없는 인자 값을 다시 출력하지 않는다', () => {
  const marker = 'sensitive-argument-marker';
  const result = spawnSync(process.execPath, [new URL('./deployment-preflight.mjs', import.meta.url).pathname, '--unknown', marker], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(marker));
});

test('명시된 Kakao 공개 JavaScript key는 서버 비밀로 오판하지 않는다', () => {
  const env = { ...fixture(), VITE_KAKAO_JAVASCRIPT_KEY: 'public-browser-fixture' };
  assert.deepEqual(inspectDeployment({ ...options, env }).errors, []);
  env.VITE_OPENAI_API_KEY = 'synthetic-only';
  assert.ok(codes(inspectDeployment({ ...options, env })).includes('SERVER_SECRET_IN_PUBLIC_ENV'));
});

test('이미지·정적·R2 작업은 runtime 비밀을 요구하지 않는다', () => {
  for (const [operation, env] of [
    ['container-release', { GH_TOKEN: 'fixture-provider-auth' }],
    ['onpod-image-update', { ONPOD_TOKEN: 'fixture-provider-auth' }],
    ['static-deploy', { CLOUDFLARE_API_TOKEN: 'fixture-provider-auth', CLOUDFLARE_ACCOUNT_ID: 'fixture-account' }],
    ['r2-assets', { CLOUDFLARE_API_TOKEN: 'fixture-provider-auth', CLOUDFLARE_ACCOUNT_ID: 'fixture-account' }],
  ]) {
    const result = inspectDeployment({ ...options, operation, env });
    assert.deepEqual(result.errors, []);
    assert.ok(!result.variables.some(variable => variable.name === 'DATABASE_URL'));
    const missing = inspectDeployment({ ...options, operation });
    assert.ok(codes(missing).includes('MISSING_PROVIDER_AUTH'));
    assert.ok(!codes(missing).includes('MISSING_REQUIRED'));
  }
});
test('runtime 설정은 API 또는 Worker 한 목적지만 요구한다', () => {
  const env = fixture();
  for (const [, workerKey] of contract.pairs) delete env[workerKey];
  delete env.CORE_API_ORIGIN;
  assert.deepEqual(inspectDeployment({ ...options, env }).errors, []);
  assert.deepEqual(inspectDeployment({ ...options, unit: 'static-worker', env: { CORE_API_ORIGIN: contract.profiles['onpod-current'].settings.CORE_API_ORIGIN, CORE_ORIGIN_SECRET: 'fixture-origin:'.padEnd(80, 'x') } }).errors, []);
});

test('provider token 공개 노출과 잘못된 profile/enum을 차단한다', () => {
  assert.ok(codes(inspectDeployment({ ...options, profile: '__proto__' })).includes('PROFILE_REQUIRED'));
  assert.ok(codes(inspectDeployment({ ...options, env: { ...fixture(), AUTH_RATE_LIMIT_MODE: 'invalid' } })).includes('INVALID_ENUM'));
  assert.ok(codes(inspectDeployment({ ...options, env: { VITE_ONPOD_TOKEN: 'fixture-value' } })).includes('SERVER_SECRET_IN_PUBLIC_ENV'));
});

test('DDL 직접 연결 검사는 local 프로필로도 TLS 계약을 우회할 수 없다', () => {
  const env = { PRODUCTION_RUNTIME_DATABASE_ROLE: 'fixture_runtime', PRODUCTION_DATABASE_DIRECT_URL: `postgresql://${['fixture', 'fixture'].join(':')}@db.example.test/example?sslmode=require` };
  assert.ok(codes(inspectDeployment({ ...options, profile: 'local', operation: 'database-migrations', env })).includes('INVALID_OR_UNSUPPORTED_DATABASE_TARGET'));
});
