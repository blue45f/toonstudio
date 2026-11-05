#!/usr/bin/env node
// 네트워크·dotenv 로딩·배포 없이 명시적으로 주입된 환경만 점검한다.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateProductionDatabaseUrl } from './validate-production-database-url.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export const contract = JSON.parse(readFileSync(new URL('../config/deployment/environment-contract.json', import.meta.url), 'utf8'));
const apiSource = readFileSync(new URL('../apps/api/src/config/env.ts', import.meta.url), 'utf8');
// 런타임 비밀 목록을 재사용한다. 값·오류 원문은 어떤 진단에도 포함하지 않는다.
const secretBlock = apiSource.split('const SECRET_KEYS:')[1]?.split('];')[0];
if (!secretBlock) throw new Error('API 비밀 목록 참조를 확인하세요.');
const apiSecrets = new Set([...secretBlock.matchAll(/"([A-Z][A-Z0-9_]+)"/gu)].map(match => match[1]));
const present = value => typeof value === 'string' && value.trim().length > 0;
const isRetired = hostname => contract.retiredTargets.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));

function validUrl(value, type, production) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return false;
    if (isRetired(url.hostname)) return false;
    if (production && (url.protocol !== 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')) return false;
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    return type !== 'origin' || (url.pathname === '/' && !url.search);
  } catch { return false; }
}

/** 배포 준비 승인이나 원격 검증이 아닌 오프라인 설정 검사 결과만 반환한다. */
export function inspectDeployment({ profile, sha, head, env = {}, operation = 'runtime-config', unit = 'api', dirty = false }) {
  const errors = [];
  const findings = [];
  const add = (code, keys = []) => errors.push({ code, keys });
  const selected = Object.hasOwn(contract.profiles, profile) ? contract.profiles[profile] : null;
  if (!selected) add('PROFILE_REQUIRED');
  if (!/^[a-f0-9]{40}$/u.test(sha ?? '') || sha !== head) add('EXACT_CHECKOUT_SHA_REQUIRED');
  if (!Object.hasOwn(contract.operations, operation)) add('UNKNOWN_OPERATION');
  if (!['api', 'static-worker', 'realtime-worker', 'analytics-worker', 'build'].includes(unit)) add('UNKNOWN_UNIT');
  if (operation !== 'runtime-config' && dirty) add('CLEAN_WORKTREE_REQUIRED');
  for (const alternatives of contract.operations[operation]?.providerAuth ?? []) {
    if (!alternatives.some(name => present(env[name]))) add('MISSING_PROVIDER_AUTH', alternatives);
  }
  if (operation === 'health-recovery') add('RETIRED_RECOVERY_TARGET_UNSUPPORTED');
  if (profile === 'onpod-current' && operation === 'database-migrations') add('ONPOD_DATABASE_WORKFLOW_UNSUPPORTED');
  const production = selected?.production ?? true;
  const effective = { ...selected?.settings, ...env };
  for (const [key, spec] of Object.entries(contract.variables)) {
    const runtimeScope = operation === 'runtime-config' && spec.unit === unit;
    const migrationScope = operation === 'database-migrations' && profile !== 'onpod-current' && spec.required === 'operation:database-migrations';
    if (!runtimeScope && !migrationScope) continue;
    const condition = spec.required.split('=');
    const required = (spec.required === 'production' && production)
      || (condition.length === 2 && effective[condition[0]] === condition[1])
      || spec.required === `operation:${operation}`;
    const configured = present(env[key]);
    if (required && !configured) add('MISSING_REQUIRED', [key]);
    if (!configured) continue;
    const value = env[key];
    if (Array.isArray(spec.type) && !spec.type.includes(value)) add('INVALID_ENUM', [key]);
    if (['origin', 'https-url'].includes(spec.type)
      && (!validUrl(value, spec.type, production) || (key === 'CORE_API_ORIGIN' && new URL(value).pathname !== '/'))) add('INVALID_OR_RETIRED_ORIGIN', [key]);
    if (spec.type === 'secret32' && (value !== value.trim() || Buffer.byteLength(value) < 32 || /(?:change.me|placeholder|insecure|dev.only)/iu.test(value))) add('INVALID_SECRET_FORMAT', [key]);
    if (spec.type === 'role' && !/^[a-z_][a-z0-9_]{0,62}$/u.test(value)) add('INVALID_RUNTIME_ROLE', [key]);
    if (spec.type === 'postgres-url') {
      try {
        const url = new URL(value);
        if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !url.password || !url.pathname.slice(1) || isRetired(url.hostname)) throw new Error();
        if (profile === 'onpod-current' && key === 'DATABASE_URL' && url.hostname !== 'toonstudio-db.db.onpod.local') throw new Error();
        if (profile === 'onpod-current' && key === 'DATABASE_URL') {
          const params = [...url.searchParams];
          if (url.hash || params.some(([name]) => name !== 'sslmode') || params.length > 1) throw new Error();
        }
        if (operation === 'database-migrations' && url.hostname.includes('.onpod.')) throw new Error();
        // onpod runtime TLS는 기존 기록만 설명한다. DDL 검증 계약을 완화하지 않는다.
        if (operation === 'database-migrations' || (production && profile !== 'onpod-current')) validateProductionDatabaseUrl(value);
      } catch { add('INVALID_OR_UNSUPPORTED_DATABASE_TARGET', [key]); }
    }
  }
  if (production && operation === 'runtime-config') {
    for (const [key, expected] of Object.entries(selected?.settings ?? {})) {
      if (contract.variables[key]?.unit !== unit) continue;
      if (!present(env[key])) add('MISSING_PROFILE_SETTING', [key]);
      else if (env[key] !== expected) add('PROFILE_DRIFT', [key]);
    }
    for (const pair of contract.pairs) {
      if (pair.every(key => present(env[key])) && env[pair[0]] !== env[pair[1]]) add('SECRET_PAIR_MISMATCH', pair);
    }
    for (const [ticket, control] of [['REALTIME_TICKET_SECRET', 'REALTIME_CONTROL_SECRET'], ['STUDIO_REALTIME_CLOUDFLARE_TICKET_SECRET', 'STUDIO_REALTIME_CLOUDFLARE_CONTROL_SECRET']]) {
      if (present(env[ticket]) && env[ticket] === env[control]) add('REALTIME_SECRETS_MUST_DIFFER', [ticket, control]);
    }
  }
  if (operation === 'runtime-config' && unit === 'api' && effective.AUTH_EDGE_CLIENT_IP_ENABLED === 'true' && !present(env.CLOUDFLARE_EDGE_ORIGIN_SECRET)) add('EDGE_SECRET_REQUIRED', ['CLOUDFLARE_EDGE_ORIGIN_SECRET']);
  if (operation === 'runtime-config' && unit === 'api' && effective.AUTH_RATE_LIMIT_MODE === 'distributed' && env.UPSTASH_COORDINATION_ENABLED !== 'true') add('DISTRIBUTED_COORDINATION_REQUIRED', ['UPSTASH_COORDINATION_ENABLED']);
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith('VITE_') || !present(value)) continue;
    const serverName = key.slice(5);
    if (apiSecrets.has(serverName) || contract.variables[serverName]?.visibility === 'server-secret') add('SERVER_SECRET_IN_PUBLIC_ENV');
    if ([...apiSecrets, ...Object.keys(contract.variables).filter(name => contract.variables[name].visibility === 'server-secret')]
      .some(name => present(env[name]) && value.includes(env[name]))) add('SERVER_SECRET_VALUE_IN_PUBLIC_ENV');
  }
  findings.push({ code: 'REMOTE_AUTH_UNVERIFIED' }, { code: 'REMOTE_RUNTIME_UNVERIFIED' }, { code: 'REMOTE_SECRET_PAIRS_UNVERIFIED' }, { code: 'LOCAL_ENV_NOT_LOADED' }, { code: 'RELEASE_CI_APPROVAL_UNVERIFIED' });
  if (dirty) findings.push({ code: 'WORKTREE_DIFF_NOT_COVERED_BY_SHA' });
  return {
    profile: selected ? profile : null,
    operation: Object.hasOwn(contract.operations, operation) ? operation : null,
    unit: ['api', 'static-worker', 'realtime-worker', 'analytics-worker', 'build'].includes(unit) ? unit : null,
    releaseSha: /^[a-f0-9]{40}$/u.test(sha ?? '') ? sha : null,
    evidenceDate: contract.evidenceDate,
    status: errors.length ? 'blocked' : 'offline-contract-only',
    deploymentAuthorized: false,
    variables: [...new Set([
      ...Object.entries(contract.variables).filter(([, spec]) =>
        (operation === 'runtime-config' && spec.unit === unit)
        || (operation === 'database-migrations' && profile !== 'onpod-current' && spec.required === 'operation:database-migrations')
      ).map(([name]) => name),
      ...(contract.operations[operation]?.providerAuth ?? []).flat(),
    ])].map(name => ({ name, present: present(env[name]) })),
    errors, findings,
  };
}

function main() {
  try {
    const args = process.argv.slice(2);
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
      if (!['--profile', '--sha', '--operation', '--unit'].includes(args[i]) || !args[i + 1]) throw new Error();
      options[args[i].slice(2)] = args[i + 1];
    }
    const headResult = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
    const statusResult = spawnSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root, encoding: 'utf8' });
    if (headResult.status !== 0 || statusResult.status !== 0) throw new Error();
    const result = inspectDeployment({ ...options, head: headResult.stdout.trim(), dirty: Boolean(statusResult.stdout.trim()), env: process.env });
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length) process.exitCode = 1;
  } catch {
    console.error('preflight 입력/저장소 확인 실패. --profile local|onpod-current|generic-separated --sha <현재 40자리 SHA> [--operation runtime-config|container-release|onpod-image-update|static-deploy|r2-assets|database-migrations|health-recovery] [--unit api|static-worker|realtime-worker|analytics-worker|build]를 사용하세요. 값은 출력하지 않습니다.');
    process.exitCode = 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
