/**
 * 하네스가 .env.infrastructure.local 에 두는 TOONSTUDIO_LOCAL_* 값의 계획·검증.
 *
 * 갱신 규칙(README 와 동일):
 * - 이미 유효한 값은 덮어쓰지 않고 유지한다.
 * - 없는 키·형식이 깨진 키만 새로 만든다(--rotate-secrets 를 명시하면 비밀값만 새로 만든다).
 * - 포트처럼 비밀이 아닌 엔드포인트는 요청한 포트에 맞춰 갱신한다.
 * - DB URL·origin 이 로컬(127.0.0.1/localhost)이 아니면 새로 만들지 않고 가드 오류로 중단한다.
 */

import { randomBytes, randomUUID } from "node:crypto";

import { DEFAULTS, ENV_KEYS, SENSITIVE_ENV_KEYS, resolveEnvFilePath } from "./config.mjs";
import { readEnvFileText, readEnvValues } from "./env-file.mjs";
import { assertLocalOrigin, assertLocalPostgresUrl } from "./guard.mjs";

const ROLE_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export const defaultRandom = Object.freeze({
  secret: (bytes) => randomBytes(bytes).toString("base64url"),
  hex: (bytes) => randomBytes(bytes).toString("hex"),
  uuid: () => randomUUID(),
});

function isPlausibleEmail(value) {
  if (typeof value !== "string" || value.length < 6 || value.length > 254 || /\s/u.test(value)) return false;
  const at = value.indexOf("@");
  if (at < 1 || at !== value.lastIndexOf("@")) return false;
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  return dot > 0 && dot < domain.length - 1;
}

function isUsablePassword(value, minimum) {
  return typeof value === "string"
    && value.length >= minimum
    && value.length <= 128
    && !/[\s\0]/u.test(value);
}

function buildDatabaseUrl({ username, password, port, database }) {
  return `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${encodeURIComponent(database)}`;
}

/**
 * 기존 URL 이 있으면 가드를 통과해야 한다(통과하지 못하면 예외: 운영 호스트 등을 조용히 덮어쓰지 않는다).
 * 없으면 null.
 */
function readExistingDatabaseUrl(value, label) {
  if (typeof value !== "string" || value.trim() === "") return null;
  return assertLocalPostgresUrl(value, label);
}

/**
 * @param {object} options
 * @param {Record<string, string | undefined>} options.existing 파일/프로세스 환경에서 읽은 현재 값(환경변수 우선)
 * @param {Record<string, string | undefined>} [options.persisted] 비밀 파일에 실제로 적힌 값. 기본은 existing.
 *        환경변수로만 지정된 값(예: 스택 디렉터리)도 파일에 기록되도록 changedKeys 는 이 값과 비교한다.
 * @param {{ pg: number, api: number, web: number }} options.ports
 * @param {string} options.stackDirectory
 * @param {boolean} [options.rotateSecrets]
 * @param {typeof defaultRandom} [options.random]
 * @returns {{ values: Record<string, string>, actions: Record<string, string>, changedKeys: string[] }}
 */
export function planHarnessEnv({
  existing,
  persisted = existing,
  ports,
  stackDirectory,
  rotateSecrets = false,
  random = defaultRandom,
}) {
  const values = {};
  const actions = {};
  const keep = (key, value, action = "유지") => {
    values[key] = value;
    actions[key] = action;
  };
  const create = (key, value) => keep(key, value, "생성");

  // 계정 식별자(회전해도 유지: DB 의 사용자 행과 맞물린다).
  if (isPlausibleEmail(existing[ENV_KEYS.testEmail])) keep(ENV_KEYS.testEmail, existing[ENV_KEYS.testEmail]);
  else create(ENV_KEYS.testEmail, `local-qa-${random.hex(4)}@${DEFAULTS.testEmailDomain}`);

  if (UUID_PATTERN.test(existing[ENV_KEYS.testUserId] ?? "")) keep(ENV_KEYS.testUserId, existing[ENV_KEYS.testUserId]);
  else create(ENV_KEYS.testUserId, random.uuid());

  // 비밀값.
  const secretSlot = (key, minimum, bytes) => {
    if (!rotateSecrets && isUsablePassword(existing[key], minimum)) keep(key, existing[key]);
    else if (rotateSecrets && existing[key]) keep(key, random.secret(bytes), "회전");
    else create(key, random.secret(bytes));
  };
  secretSlot(ENV_KEYS.testPassword, 24, 24);
  secretSlot(ENV_KEYS.sessionSecret, 32, 48);
  secretSlot(ENV_KEYS.stateSecret, 32, 48);

  // DB URL: 사용자·DB 이름은 기존 값을 존중하고, 호스트는 127.0.0.1·포트는 요청값으로 맞춘다.
  const adminExisting = readExistingDatabaseUrl(existing[ENV_KEYS.migrationDatabaseUrl], ENV_KEYS.migrationDatabaseUrl);
  const runtimeExisting = readExistingDatabaseUrl(existing[ENV_KEYS.databaseUrl], ENV_KEYS.databaseUrl);
  const database = [runtimeExisting?.database, adminExisting?.database, DEFAULTS.databaseName]
    .find((name) => typeof name === "string" && ROLE_PATTERN.test(name)) ?? DEFAULTS.databaseName;
  const databaseSlot = (key, current, defaultRole) => {
    const username = current && ROLE_PATTERN.test(current.username) ? current.username : defaultRole;
    const reuse = current && !rotateSecrets && isUsablePassword(current.password, 24);
    const password = reuse ? current.password : random.secret(24);
    const url = buildDatabaseUrl({ username, password, port: ports.pg, database });
    const action = !current ? "생성" : reuse ? (current.port === ports.pg ? "유지" : "갱신(포트)") : "회전";
    keep(key, url, action);
    return { username, password };
  };
  const admin = databaseSlot(ENV_KEYS.migrationDatabaseUrl, adminExisting, DEFAULTS.adminRole);
  const runtime = databaseSlot(ENV_KEYS.databaseUrl, runtimeExisting, DEFAULTS.runtimeRole);
  if (admin.username === runtime.username) {
    throw new Error("마이그레이션 역할과 런타임 역할 이름이 같을 수 없습니다(운영 부트스트랩의 분리 규칙).");
  }

  // 엔드포인트.
  const originSlot = (key, port) => {
    const wanted = `http://127.0.0.1:${port}`;
    const current = typeof existing[key] === "string" && existing[key].trim() !== ""
      ? assertLocalOrigin(existing[key], key)
      : null;
    if (!current) create(key, wanted);
    else keep(key, wanted, current.port === port && current.hostname === "127.0.0.1" ? "유지" : "갱신(포트)");
  };
  originSlot(ENV_KEYS.apiOrigin, ports.api);
  originSlot(ENV_KEYS.webOrigin, ports.web);

  if (existing[ENV_KEYS.stackDir] === stackDirectory) keep(ENV_KEYS.stackDir, stackDirectory);
  else if (existing[ENV_KEYS.stackDir]) keep(ENV_KEYS.stackDir, stackDirectory, "갱신");
  else create(ENV_KEYS.stackDir, stackDirectory);

  const changedKeys = Object.keys(values).filter((key) => values[key] !== persisted[key]);
  return { values, actions, changedKeys };
}

/** 값을 읽어 온 뒤 모든 DB URL·origin 이 로컬인지 한 번 더 확인한다(실행 직전 최종 가드). */
export function assertHarnessValuesLocal(values) {
  const checks = {};
  for (const key of [ENV_KEYS.databaseUrl, ENV_KEYS.migrationDatabaseUrl]) {
    if (values[key]) checks[key] = assertLocalPostgresUrl(values[key], key);
  }
  for (const key of [ENV_KEYS.apiOrigin, ENV_KEYS.webOrigin]) {
    if (values[key]) checks[key] = assertLocalOrigin(values[key], key);
  }
  return checks;
}

/** 로그·산출물 누출 검사에 쓸 비밀값 목록. DB 비밀번호는 URL 에서 따로 꺼내 포함한다. */
export function collectSecretValues(values) {
  const secrets = [];
  for (const key of SENSITIVE_ENV_KEYS) {
    if (values[key]) secrets.push({ key, value: values[key] });
  }
  for (const key of [ENV_KEYS.databaseUrl, ENV_KEYS.migrationDatabaseUrl]) {
    if (!values[key]) continue;
    try {
      const { password } = assertLocalPostgresUrl(values[key], key);
      secrets.push({ key: `${key}(비밀번호)`, value: password });
    } catch {
      // 형식이 깨진 URL 은 전체 값만 검사한다.
    }
  }
  return secrets;
}

/** 출력용 요약: 키 이름·조치·길이만. */
export function summarizePlan(plan) {
  return Object.keys(plan.values).map((key) => ({
    key,
    action: plan.actions[key],
    length: plan.values[key].length,
    sensitive: SENSITIVE_ENV_KEYS.includes(key),
  }));
}

/**
 * 환경변수(우선) → .env.infrastructure.local 순으로 TOONSTUDIO_LOCAL_* 값을 읽는다.
 * 프로세스 환경변수가 우선하므로, 운영 URL 이 환경에 들어 있으면 이후 가드가 그 값을 보고 중단한다.
 */
export function loadHarnessValues({ environment = process.env, envFilePath = resolveEnvFilePath({ environment }) } = {}) {
  const fileValues = readEnvValues(readEnvFileText(envFilePath), Object.values(ENV_KEYS));
  const values = {};
  for (const key of Object.values(ENV_KEYS)) {
    const fromEnvironment = environment[key];
    const value = fromEnvironment !== undefined && fromEnvironment !== "" ? fromEnvironment : fileValues[key];
    if (value !== undefined && value !== "") values[key] = value;
  }
  return { values, envFilePath, fileValues };
}
