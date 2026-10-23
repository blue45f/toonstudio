import { spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";

const OPENVSX_KEYWORD_RE = /(?:publisher|ovsx|openvsx)/iu;
const QUOTED_UUID_LITERAL_RE =
  /["'][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}["']/iu;
const CLOUDFLARE_ACCOUNT_TOKEN_RE = /\bcfat_[A-Za-z0-9_-]{40,}\b/u;
const STRIPE_KEY_RE = /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{24,}\b/u;

/**
 * GitHub Secret Scanning이 탐지하지만 기본 secretlint preset에는 없는 패턴을 사전 차단한다.
 * 반환 메시지에는 절대 매칭된 비밀값·토큰 원문을 포함하지 않는다.
 *
 * @param {string} content
 * @returns {Array<{ line: number; ruleId: string; message: string }>}
 */
export function scanGitHubSecretScanningContent(content) {
  const findings = [];
  const lines = content.split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const previousLine = index > 0 ? lines[index - 1] : "";
    if (
      line.includes("secretlint-disable-line")
      || previousLine.includes("secretlint-disable-next-line")
    ) {
      continue;
    }

    if (OPENVSX_KEYWORD_RE.test(line) && QUOTED_UUID_LITERAL_RE.test(line)) {
      findings.push({
        line: index + 1,
        ruleId: "github-secret-scanning/openvsx-access-token",
        message:
          "publisher/ovsx 문맥의 36자 UUID 리터럴은 GitHub Secret Scanning에서 OpenVSX Access Token으로 오탐됩니다. 세그먼트 조립([\"...\", ...].join(\"-\")) 또는 카탈로그 유도값을 사용하세요.",
      });
    }

    if (CLOUDFLARE_ACCOUNT_TOKEN_RE.test(line)) {
      findings.push({
        line: index + 1,
        ruleId: "github-secret-scanning/cloudflare-account-api-token",
        message:
          "Cloudflare Account API Token(cfat_*) 패턴이 감지되었습니다. 실제 토큰은 로컬 전용 시크릿 저장소에만 보관하고 코드·문서에는 환경변수 이름만 적으세요.",
      });
    }

    if (STRIPE_KEY_RE.test(line)) {
      findings.push({
        line: index + 1,
        ruleId: "github-secret-scanning/stripe-api-key",
        message:
          "Stripe API Key(sk_live_*/sk_test_*/rk_live_*/rk_test_*) 패턴이 감지되었습니다. 합성 픽스처는 중립 플레이스홀더 또는 런타임 조립 문자열로 교체하세요.",
      });
    }
  }

  return findings;
}

function gitFiles(gitArgs) {
  const result = spawnSync("git", gitArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout.split("\0").filter(Boolean);
}

function isTextFile(file) {
  if (!existsSync(file)) return false;
  const stat = statSync(file);
  if (!stat.isFile()) return false;
  if (stat.size === 0) return true;

  const fd = openSync(file, "r");
  try {
    const sample = Buffer.allocUnsafe(Math.min(stat.size, 8192));
    const bytesRead = readSync(fd, sample, 0, sample.length, 0);
    return !sample.subarray(0, bytesRead).includes(0);
  } finally {
    closeSync(fd);
  }
}

function runCli() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const staged = args.includes("--staged");
  const baseArgument = args.find((argument) => argument.startsWith("--base="));
  const base = baseArgument?.slice("--base=".length).trim();
  const separator = args.indexOf("--");
  const explicitFiles = separator >= 0 ? args.slice(separator + 1) : [];

  if ([all, staged, Boolean(base), explicitFiles.length > 0].filter(Boolean).length > 1) {
    process.stderr.write("quality:secrets — --all, --staged, --base와 명시 파일은 함께 사용할 수 없습니다.\n");
    process.exit(2);
  }

  let candidates;
  if (explicitFiles.length > 0) {
    candidates = explicitFiles;
  } else if (all) {
    candidates = gitFiles(["ls-files", "-co", "--exclude-standard", "-z"]);
  } else if (staged) {
    candidates = gitFiles(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z", "--"]);
  } else if (base) {
    candidates = [
      ...gitFiles(["diff", "--name-only", "--diff-filter=ACMR", "-z", `${base}...HEAD`, "--"]),
      ...gitFiles(["diff", "--name-only", "--diff-filter=ACMR", "-z", "HEAD", "--"]),
      ...gitFiles(["ls-files", "--others", "--exclude-standard", "-z"]),
    ];
  } else {
    candidates = [
      ...gitFiles(["diff", "--name-only", "--diff-filter=ACMR", "-z", "HEAD", "--"]),
      ...gitFiles(["ls-files", "--others", "--exclude-standard", "-z"]),
    ];
  }

  const files = [...new Set(candidates)]
    .filter(isTextFile)
    .sort((left, right) => left.localeCompare(right, "en"));

  if (files.length === 0) {
    process.stdout.write("quality:secrets — 검사할 텍스트 파일이 없습니다.\n");
    process.exit(0);
  }

  process.stdout.write(`quality:secrets — 텍스트 파일 ${files.length}개를 검사합니다.\n`);

  let patternViolationCount = 0;
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const findings = scanGitHubSecretScanningContent(content);
    for (const finding of findings) {
      patternViolationCount += 1;
      process.stderr.write(
        `${file}:${finding.line} [${finding.ruleId}] ${finding.message}\n`,
      );
    }
  }
  if (patternViolationCount > 0) {
    process.stderr.write(
      `quality:secrets — GitHub Secret Scanning 패턴 위반 ${patternViolationCount}건이 감지되었습니다.\n`,
    );
    process.exit(1);
  }

  const batches = [];
  let batch = [];
  let batchCharacters = 0;
  for (const file of files) {
    if (batch.length >= 500 || batchCharacters + file.length > 300_000) {
      batches.push(batch);
      batch = [];
      batchCharacters = 0;
    }
    batch.push(file);
    batchCharacters += file.length + 1;
  }
  if (batch.length > 0) batches.push(batch);

  for (const [index, currentBatch] of batches.entries()) {
    if (batches.length > 1) {
      process.stdout.write(`quality:secrets — 배치 ${index + 1}/${batches.length}\n`);
    }
    const result = spawnSync(
      "pnpm",
      ["exec", "secretlint", "--no-glob", ...currentBatch],
      { cwd: process.cwd(), stdio: "inherit" },
    );
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
