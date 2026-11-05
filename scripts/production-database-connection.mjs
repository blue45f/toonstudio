import { spawnSync } from "node:child_process";
import { createHash, X509Certificate } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPsqlEnvironment, validateProductionDatabaseUrl } from "./validate-production-database-url.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contexts = new WeakSet();
const CERTIFICATE = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/gu;

export function validatePublicCaFile(file) {
  if (typeof file !== "string" || !isAbsolute(file)) throw new Error("공개 CA는 명시적인 절대 파일 경로로 지정해야 합니다.");
  let source;
  try {
    const state = lstatSync(file);
    if (!state.isFile() || state.size > 1024 * 1024) throw new Error("invalid");
    source = readFileSync(file, "utf8");
  } catch {
    throw new Error("공개 CA 파일을 안전하게 읽을 수 없습니다.");
  }
  const certificates = source.match(CERTIFICATE) ?? [];
  if (certificates.length === 0 || source.replace(CERTIFICATE, "").trim() !== "") {
    throw new Error("공개 CA 파일에는 PEM 인증서만 포함해야 하며 private key는 허용하지 않습니다.");
  }
  try {
    for (const value of certificates) {
      const certificate = new X509Certificate(value);
      if (!certificate.ca || Date.parse(certificate.validFrom) > Date.now() || Date.parse(certificate.validTo) < Date.now()) {
        throw new Error("invalid");
      }
    }
  } catch {
    throw new Error("공개 CA 인증서의 형식·CA 제약·유효기간이 올바르지 않습니다.");
  }
  return createHash("sha256").update(source).digest("hex");
}

/** 신뢰 파일은 호출자가 검증된 관리 채널에서 확보해야 한다. peer 인증서를 자동으로 신뢰하지 않는다. */
export function createProductionMigrationConnection(databaseUrl, { allowLoopback = false, publicCaFile } = {}) {
  const transport = validateProductionDatabaseUrl(databaseUrl, { allowLoopback });
  const caSha256 = publicCaFile === undefined ? null : validatePublicCaFile(publicCaFile);
  if (caSha256) {
    const query = new URL(databaseUrl).searchParams;
    if (query.size !== 2 || query.get("sslmode") !== "verify-full" || query.get("channel_binding") !== "require") {
      throw new Error("공개 CA 연결은 verify-full과 channel_binding=require를 정확히 지정해야 합니다.");
    }
  }
  const context = Object.freeze({ databaseUrl, allowLoopback, publicCaFile, caSha256, disposableLoopback: allowLoopback && !transport.tlsVerified });
  contexts.add(context);
  return context;
}

export function isDisposableMigrationConnection(connection) {
  return contexts.has(connection) && connection.disposableLoopback;
}

export function createMigrationPsqlEnvironment(connection, baseEnvironment = process.env) {
  if (typeof connection === "string") {
    return createPsqlEnvironment(connection, { allowLoopback: true, baseEnvironment });
  }
  if (!contexts.has(connection)) throw new Error("정본에서 검증한 명시적 DB 연결 context가 필요합니다.");
  const environment = createPsqlEnvironment(connection.databaseUrl, {
    allowLoopback: connection.allowLoopback, baseEnvironment,
  });
  if (!connection.caSha256) return environment;
  if (validatePublicCaFile(connection.publicCaFile) !== connection.caSha256) {
    throw new Error("검증 이후 공개 CA 파일이 변경되어 연결을 거절합니다.");
  }
  return { ...environment, PGSSLMODE: "verify-full", PGCHANNELBINDING: "require", PGSSLROOTCERT: connection.publicCaFile };
}

/** 비밀번호와 CA 본문은 인자·로그에 넣지 않고 매 명령의 전용 libpq 환경으로만 전달한다. */
export function psql(databaseUrl, sql, { tuplesOnly = false } = {}) {
  const arguments_ = ["-X", "-v", "ON_ERROR_STOP=1"];
  if (tuplesOnly) arguments_.push("-A", "-q", "-t");
  const result = spawnSync("psql", arguments_, {
    cwd: ROOT, encoding: "utf8",
    env: createMigrationPsqlEnvironment(databaseUrl, { ...process.env, PSQLRC: "/dev/null" }),
    input: sql, maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw new Error("psql 실행에 실패했습니다.", { cause: result.error });
  if (result.status !== 0) {
    const details = (result.stderr || result.stdout || "").trim();
    throw new Error(details ? "PostgreSQL command failed: " + details : "PostgreSQL command failed");
  }
  return (result.stdout || "").trim();
}

export function queryScalar(databaseUrl, sql) {
  return psql(databaseUrl, sql, { tuplesOnly: true }).split(/\r?\n/u)[0]?.trim() ?? "";
}
