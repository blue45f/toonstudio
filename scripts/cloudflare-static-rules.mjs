import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const RESPONSE_POLICY_PATH = "config/http-response-headers.json";
const CLOUDFLARE_HEADERS_PATH = "apps/web/public/_headers";
const CLOUDFLARE_WORKER_PATH = "deploy/cloudflare-static/src/index.ts";
const CONTENT_SECURITY_POLICY_KEY = "Content-Security-Policy";
const WORKER_CSP_PATTERN = /("Content-Security-Policy":\s*)"[^"]*",/u;

function mapPattern(source) {
  if (source === "/(.*)") return "/*";
  return source.replace(/\/\(\.\*\)$/u, "/*");
}

export function renderCloudflareHeaders(responsePolicy) {
  const blocks = [
    `# Generated from ${RESPONSE_POLICY_PATH} by scripts/cloudflare-static-rules.mjs.`,
    "# Run `pnpm run generate:cloudflare-static-rules` after changing response headers.",
  ];
  for (const rule of responsePolicy.headers ?? []) {
    if (!rule || typeof rule.source !== "string" || !Array.isArray(rule.headers)) continue;
    blocks.push("", mapPattern(rule.source));
    for (const header of rule.headers) {
      if (typeof header?.key !== "string" || typeof header?.value !== "string") {
        throw new Error(`invalid response header rule for ${rule.source}`);
      }
      blocks.push(`  ${header.key}: ${header.value}`);
    }
  }
  return `${blocks.join("\n")}\n`;
}

function rootResponseHeader(responsePolicy, key) {
  const rootRule = responsePolicy.headers?.find((rule) => rule?.source === "/(.*)");
  const header = rootRule?.headers?.find((candidate) => candidate?.key === key);
  if (typeof header?.value !== "string" || header.value.trim() === "") {
    throw new Error(`${RESPONSE_POLICY_PATH} must define ${key} for /(.*)`);
  }
  return header.value;
}

function sha256Token(text) {
  return `'sha256-${createHash("sha256").update(text).digest("base64")}'`;
}

/**
 * 공개 페이지가 주입하는 /studio 프리렌더 규칙 문자열. 앱의 `buildSpeculationRulesJson(STUDIO_PRERENDER_URLS)`
 * (apps/web/src/shared/lib/speculation-rules.ts)와 바이트까지 같아야 하며 시험이 일치를 고정한다.
 * script-src 에 해시가 하나라도 있으면 'inline-speculation-rules' 키워드는 무시되므로(2026-10-23 Chromium 156
 * 실측: 키워드만으로는 프리렌더 요청조차 나가지 않음) 규칙 해시로 허용한다.
 */
export const STUDIO_SPECULATION_RULES_JSON = JSON.stringify({
  prerender: [{ source: "list", urls: ["/studio"], eagerness: "moderate" }],
});

// 전역 script-src의 인라인 해시를 apps/web JSON-LD 해시와 /studio 프리렌더 규칙 해시로 정규화한다.
// _headers는 경로별 제외가 안 돼 모든 문서에 전역 정책이 함께 강제되므로,
// 인라인 허용은 해시로만 푼다. 3D 무대(Godot) 임베드가 제거되면서 무대
// 부트스트랩 해시는 더 이상 주입하지 않고, 낡은 해시는 갈아끼운다.
export function withInlineScriptHashes(responsePolicy, root = process.cwd()) {
  const ldJson = readFileSync(resolve(root, "apps/web/index.html"), "utf8")
    .match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/u);
  if (!ldJson) {
    throw new Error("apps/web/index.html JSON-LD data block is missing");
  }
  const keep = new Set([sha256Token(ldJson[1]), sha256Token(STUDIO_SPECULATION_RULES_JSON)]);
  const policy = JSON.parse(JSON.stringify(responsePolicy));
  const rootRule = policy.headers?.find((rule) => rule?.source === "/(.*)");
  const csp = rootRule?.headers?.find((header) => header?.key === CONTENT_SECURITY_POLICY_KEY);
  if (typeof csp?.value !== "string" || csp.value.trim() === "") {
    throw new Error(`${RESPONSE_POLICY_PATH} must define ${CONTENT_SECURITY_POLICY_KEY} for /(.*)`);
  }
  const directives = csp.value.split(";").map((directive) => directive.trim());
  const scriptSrc = directives.find(
    (directive) => directive === "script-src" || directive.startsWith("script-src "),
  );
  if (!scriptSrc) {
    throw new Error(`${RESPONSE_POLICY_PATH} must define a script-src directive for /(.*)`);
  }
  const tokens = scriptSrc.split(/\s+/).filter(
    (token, index) => index === 0 || !token.startsWith("'sha256-") || keep.has(token),
  );
  csp.value = directives
    .map((directive) => directive === scriptSrc ? tokens.join(" ") : directive)
    .join("; ");
  return policy;
}

export function renderCloudflareWorkerSecurityPolicy(source, responsePolicy) {
  const contentSecurityPolicy = rootResponseHeader(
    responsePolicy,
    CONTENT_SECURITY_POLICY_KEY,
  );
  if (!WORKER_CSP_PATTERN.test(source)) {
    throw new Error(
      `${CLOUDFLARE_WORKER_PATH} must expose COMMON_SECURITY_HEADERS.${CONTENT_SECURITY_POLICY_KEY}`,
    );
  }
  return source.replace(
    WORKER_CSP_PATTERN,
    (_match, prefix) => `${prefix}${JSON.stringify(contentSecurityPolicy)},`,
  );
}

export function loadResponseHeaderPolicy(root = process.cwd()) {
  const policy = JSON.parse(
    readFileSync(resolve(root, RESPONSE_POLICY_PATH), "utf8"),
  );
  if (policy?.version !== 1 || !Array.isArray(policy.headers)) {
    throw new Error(`${RESPONSE_POLICY_PATH} must contain version 1 header rules`);
  }
  return policy;
}

export function verifyCloudflareStaticRules(root = process.cwd()) {
  const policy = withInlineScriptHashes(loadResponseHeaderPolicy(root), root);
  const expectedHeaders = renderCloudflareHeaders(policy);
  const actualHeaders = readFileSync(resolve(root, CLOUDFLARE_HEADERS_PATH), "utf8");
  const workerSource = readFileSync(resolve(root, CLOUDFLARE_WORKER_PATH), "utf8");
  const expectedWorkerSource = renderCloudflareWorkerSecurityPolicy(workerSource, policy);
  const issues = [];
  if (actualHeaders !== expectedHeaders) {
    issues.push(
      `${CLOUDFLARE_HEADERS_PATH} is stale; run pnpm run generate:cloudflare-static-rules`,
    );
  }
  if (workerSource !== expectedWorkerSource) {
    issues.push(
      `${CLOUDFLARE_WORKER_PATH} has a stale Content-Security-Policy; run pnpm run generate:cloudflare-static-rules`,
    );
  }

  return issues;
}

const invoked = process.argv[1]
  && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (invoked) {
  const root = process.cwd();
  const headersTarget = resolve(root, CLOUDFLARE_HEADERS_PATH);
  const workerTarget = resolve(root, CLOUDFLARE_WORKER_PATH);
  const policy = withInlineScriptHashes(loadResponseHeaderPolicy(root), root);
  const renderedHeaders = renderCloudflareHeaders(policy);
  if (process.argv.includes("--check")) {
    const issues = verifyCloudflareStaticRules(root);
    if (issues.length > 0) {
      for (const issue of issues) console.error(issue);
      process.exit(1);
    }
    console.log("Cloudflare headers and edge worker match the provider-neutral response policy");
  } else {
    writeFileSync(headersTarget, renderedHeaders);
    const workerSource = readFileSync(workerTarget, "utf8");
    writeFileSync(
      workerTarget,
      renderCloudflareWorkerSecurityPolicy(workerSource, policy),
    );
    console.log(`wrote ${headersTarget}`);
    console.log(`updated ${workerTarget}`);
  }
}
