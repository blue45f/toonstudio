import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

const UNIT_PATTERN = /^[a-z0-9-]+$/u;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;

function resolveCommonGitDirectory(cwd) {
  const dotGit = resolve(cwd, ".git");
  if (!existsSync(dotGit)) return null;
  const stat = statSync(dotGit);
  if (stat.isDirectory()) return dotGit;
  if (!stat.isFile()) return null;

  const rawPointer = readFileSync(dotGit, "utf8").trim();
  if (!rawPointer.startsWith("gitdir:")) return null;
  const rawGitDir = rawPointer.slice("gitdir:".length).trim();
  if (!rawGitDir) return null;
  const gitDir = isAbsolute(rawGitDir) ? rawGitDir : resolve(cwd, rawGitDir);
  const commonDirFile = resolve(gitDir, "commondir");
  if (existsSync(commonDirFile) && statSync(commonDirFile).isFile()) {
    const rawCommon = readFileSync(commonDirFile, "utf8").trim();
    if (rawCommon) {
      return isAbsolute(rawCommon) ? rawCommon : resolve(gitDir, rawCommon);
    }
  }
  return gitDir;
}

export function resolveLocalDeployLedgerPath({
  cwd = process.cwd(),
  env = process.env,
  unit,
  sha,
}) {
  if (!UNIT_PATTERN.test(unit ?? "") || !SHA_PATTERN.test(sha ?? "")) {
    return null;
  }
  const configuredRoot = env.TOONSPECTRUM_DEPLOY_LEDGER_DIR?.trim();
  if (configuredRoot) {
    return resolve(cwd, configuredRoot, unit, `${sha}.json`);
  }
  const commonGitDir = resolveCommonGitDirectory(cwd);
  if (!commonGitDir) return null;
  return resolve(commonGitDir, "toonstudio-deploy-ledger", unit, `${sha}.json`);
}

export function assertNoDuplicateDeploy(ledgerPath, unit, sha) {
  if (ledgerPath && existsSync(ledgerPath)) {
    throw new Error(
      `duplicate production deploy blocked for ${unit}: SHA ${sha} is already recorded in ${ledgerPath}`,
    );
  }
}

export function recordCompletedDeploy(ledgerPath, metadata) {
  if (!ledgerPath) return null;
  mkdirSync(dirname(ledgerPath), { recursive: true, mode: 0o700 });
  writeFileSync(
    ledgerPath,
    `${JSON.stringify({ ...metadata, recordedAt: new Date().toISOString() }, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600, flag: "wx" },
  );
  return ledgerPath;
}
