// 기존 QA DB와 시드 계정을 준비한 뒤 전용 API 한 개만 포그라운드에서 실행한다.
// root가 준비할 환경 변수: TOONSTUDIO_LOCAL_DATABASE_URL, TOONSTUDIO_LOCAL_AUTH_SESSION_SECRET,
// TOONSTUDIO_LOCAL_AUTH_STATE_SECRET. S1에만 OPENAI_API_KEY/ORG_ID/PROJECT_ID 및 OPENAI_MODEL 추가.
// 외부 송신을 차단한 격리 환경에서 아래 API로만 웹 프록시를 연결한다. 합성 계정의 S1 동작으로
// 서버 차단 메시지를 확인하고, OS 연결 추적에서 API와 자식의 비로컬 연결 시도가 없는지 대조한다.
// 브라우저 가드는 로컬 라우트 전달만 센다. node:http(s), net/tls, 직접 가져온 undici,
// SDK/네이티브 모듈, 자식·워커, loopback 중계는 전역 fetch 바깥이므로 별도로 확인한다.
// 추적은 PID·목적지·연결 수만 수집한다. 확인할 수 없는 전송 경로가 있으면 --deny를 유지한다.
// 초기 점검: node scripts/two-cut-local-api.mjs --deny (공급자 키 전달 없음)
// 승인 후: node scripts/two-cut-local-api.mjs S1. 웹 origin 5273, API 4101, DB는 확인된 loopback만 허용.
import { spawnSync } from "node:child_process";
import { lstatSync } from "node:fs";
import { join } from "node:path";
import { directory, keyBinding, readApproval } from "./two-cut-server-egress.mjs";
import { ENV_KEYS, REPOSITORY_ROOT } from "./local-fullstack/lib/config.mjs";
import { buildApiEnvironment, resolveTsxLoader } from "./local-fullstack/lib/stack.mjs";

try {
  const phase = process.argv[2];
  if (process.argv.length !== 3 || !["--deny", "S1"].includes(phase)) throw new Error();
  const values = {
    [ENV_KEYS.apiOrigin]: "http://127.0.0.1:4101",
    [ENV_KEYS.webOrigin]: "http://127.0.0.1:5273",
  };
  for (const key of [ENV_KEYS.databaseUrl, ENV_KEYS.sessionSecret, ENV_KEYS.stateSecret]) {
    if (!process.env[key]) throw new Error();
    values[key] = process.env[key];
  }
  const env = buildApiEnvironment(values, { base: { PATH: process.env.PATH } });
  env.NODE_ENV = "test";
  env.TWO_CUT_QA_PHASE = phase;
  if (phase === "S1") {
    const gate = readApproval(directory);
    if (lstatSync(join(directory, "S1.spent.jsonl"), { throwIfNoEntry: false })) throw new Error();
    const binding = keyBinding(process.env.OPENAI_API_KEY, process.env.OPENAI_ORG_ID, process.env.OPENAI_PROJECT_ID);
    if (gate.model !== process.env.OPENAI_MODEL || binding !== gate.keyBinding) throw new Error();
    for (const key of ["OPENAI_API_KEY", "OPENAI_ORG_ID", "OPENAI_PROJECT_ID", "OPENAI_MODEL"]) env[key] = process.env[key];
  }
  if (phase === "--deny") {
    env.OPENAI_API_KEY = "offline-placeholder";
    env.OPENAI_MODEL = "gpt-4o-mini";
  }
  const result = spawnSync(process.execPath, [
    "--import", join(REPOSITORY_ROOT, "scripts/two-cut-server-egress.mjs"),
    "--import", resolveTsxLoader(REPOSITORY_ROOT), "src/main.ts",
  ], { cwd: join(REPOSITORY_ROOT, "apps/api"), stdio: "inherit", env });
  process.exitCode = result.status ?? 1;
} catch {
  console.error("로컬 API 기동 차단. --deny 또는 S1과 로컬 QA 전용 설정을 확인하세요.");
  process.exitCode = 1;
}
