import { spawnSync } from "node:child_process";

const sessionUnavailable = "로컬 Wrangler OAuth 세션을 확인할 수 없습니다. wrangler whoami로 로그인 상태를 확인해 주세요.";

export function isLocalWranglerOAuthAllowed(env) {
  return !env.CI && !env.GITHUB_ACTIONS;
}

export function isCloudflareAccountId(value) {
  return typeof value === "string" && /^[a-f0-9]{32}$/iu.test(value);
}

/** 로컬 CLI는 기본 프로필과 운영 API를 사용한다. 셸의 다른 인증·로그·엔드포인트 설정은 전달하지 않는다. */
export function localWranglerOAuthEnvironment(env) {
  const child = {};
  for (const key of ["HOME", "PATH", "USER", "LOGNAME", "TMPDIR", "LANG", "LC_ALL", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "CLOUDFLARE_ACCOUNT_ID"]) {
    if (env[key]) child[key] = env[key];
  }
  return { ...child, WRANGLER_WRITE_LOGS: "false", WRANGLER_LOG: "log", WRANGLER_SEND_METRICS: "false" };
}

export function readLocalWranglerOAuthToken(env = process.env, run = spawnSync) {
  if (!isLocalWranglerOAuthAllowed(env)) throw new Error(sessionUnavailable);
  try {
    const result = run("pnpm", ["exec", "wrangler", "auth", "token", "--json", "--env-file", "/dev/null"], {
      env: localWranglerOAuthEnvironment(env),
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      timeout: 20_000,
      maxBuffer: 64 * 1024,
    });
    if (result.status === 0) {
      const auth = JSON.parse(result.stdout);
      if (auth?.type === "oauth" && typeof auth.token === "string" && /^[!-~]+$/u.test(auth.token)) return auth.token;
    }
  } catch {
    // CLI 진단과 JSON 파싱 오류에는 인증 정보가 들어갈 수 있다.
  }
  throw new Error(sessionUnavailable);
}

/** 조회 허용 여부만 검사한다. Worker 배포나 R2 쓰기 권한까지 증명하지 않는다. */
export async function inspectLocalCloudflareOAuth({ accountId, env = process.env, readToken = readLocalWranglerOAuthToken, fetchImpl = fetch } = {}) {
  const unavailable = { auth: "unavailable", workerStatus: null, r2Status: null };
  if (!isCloudflareAccountId(accountId) || !isLocalWranglerOAuthAllowed(env)) return unavailable;
  let token;
  try {
    token = readToken(env);
  } catch {
    return unavailable;
  }
  async function inspect(path) {
    try {
      const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/${path}?per_page=1`, {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      await response.body?.cancel();
      return response.status;
    } catch {
      return null;
    }
  }
  const [workerStatus, r2Status] = await Promise.all([
    inspect("workers/scripts/toonspectrum-web/versions"),
    inspect("r2/buckets/toonspectrum-public-assets/objects"),
  ]);
  return { auth: "oauth", workerStatus, r2Status };
}
