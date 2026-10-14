import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const ROOT = resolve(import.meta.dirname, "..");
const WORKFLOW_PATH = ".github/workflows/studio-competitor-replacement-certification.yml";

async function readRepoFile(relativePath) {
  return readFile(resolve(ROOT, relativePath), "utf8");
}

function triggerPaths(workflow, sectionStart, sectionEnd) {
  const start = workflow.indexOf(sectionStart);
  const end = workflow.indexOf(sectionEnd, start);
  assert.ok(start >= 0 && end > start, `workflow section missing: ${sectionStart}`);
  const section = workflow.slice(start, end);
  return [...section.matchAll(/^\s+- "([^"]+)"$/gmu)].map((match) => match[1]);
}

function patternMatches(pattern, path) {
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  if (!pattern.includes("*")) return pattern === path;
  const source = pattern
    .split("**")
    .map((part) => part.split("*").map((segment) =>
      segment.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("[^/]*"))
    .join(".*");
  return new RegExp(`^${source}$`, "u").test(path);
}

function coveredBy(patterns, path) {
  return patterns.some((pattern) => patternMatches(pattern, path));
}

async function certificationEvidence() {
  const program = JSON.parse(await readRepoFile(
    "docs/benchmarks/studio-competitor-replacement-program.json",
  ));
  const reference = JSON.parse(await readRepoFile(
    "docs/benchmarks/studio-reference-project-certification.json",
  ));
  const competitorEvidence = program.program.flatMap((item) => item.evidence);
  const referenceEvidence = reference.projects.flatMap((project) =>
    project.criteria.flatMap((criterion) => criterion.evidence));
  return [...new Set([...competitorEvidence, ...referenceEvidence])]
    .map((path) => path.replaceAll("\\", "/"));
}

function expandScript(scripts, name, seen = new Set()) {
  const command = scripts[name];
  assert.equal(typeof command, "string", `package.json script missing: ${name}`);
  assert.ok(!seen.has(name), `package.json script cycle: ${name}`);
  seen.add(name);
  return command.split(" && ").flatMap((part) => {
    const nested = /^pnpm run (\S+)$/u.exec(part);
    return nested ? expandScript(scripts, nested[1], seen) : [part];
  });
}

test("every certification evidence path triggers the gate on pull request and push", async () => {
  const workflow = await readRepoFile(WORKFLOW_PATH);
  const pullRequestPaths = triggerPaths(workflow, "pull_request:", "  push:");
  const pushPaths = triggerPaths(workflow, "  push:", "  workflow_dispatch:");
  assert.ok(pullRequestPaths.length > 0, "pull_request trigger paths missing");
  assert.deepEqual(pushPaths, pullRequestPaths, "push and pull_request trigger paths drifted");
  const uncovered = (await certificationEvidence())
    .filter((path) => !coveredBy(pullRequestPaths, path));
  assert.deepEqual(uncovered, [], `evidence paths that never trigger the gate: ${uncovered.join(", ")}`);
});

test("gate legs run as separate named steps in the original order", async () => {
  const workflow = await readRepoFile(WORKFLOW_PATH);
  const runLines = [...workflow.matchAll(/^\s+run: (.+)$/gmu)].map((match) => match[1].trim());
  const legSteps = [
    "pnpm run verify:studio-competitor-replacement:program",
    "pnpm run verify:studio-competitor-replacement:desktop-sync",
    "pnpm run verify:studio-professional-validation-kit",
    "pnpm run test:desktop-sync-release",
    "node --test scripts/studio-competitor-replacement-certification-workflow.test.mjs",
    "node scripts/verify-studio-reference-projects.mjs --run --receipt qa-results/studio-reference-projects/receipt.json",
  ];
  let previousIndex = -1;
  for (const step of legSteps) {
    const index = runLines.indexOf(step);
    assert.ok(index > previousIndex, `gate step missing or out of order: ${step}`);
    previousIndex = index;
  }
  assert.ok(!runLines.includes("pnpm run verify:studio-competitor-replacement"),
    "workflow must not collapse the legs back into the composite script");
  assert.doesNotMatch(workflow, /continue-on-error/u);
});

test("granular scripts expand to the original composite leg sequence", async () => {
  const pkg = JSON.parse(await readRepoFile("package.json"));
  assert.deepEqual(expandScript(pkg.scripts, "verify:studio-competitor-replacement"), [
    "tsx scripts/verify-studio-competitor-replacement.mts",
    "vitest run scripts/verify-studio-competitor-replacement.test.ts",
    "pnpm --filter @toonstudio/desktop-sync test",
    "pnpm --filter @toonstudio/desktop-sync typecheck",
    "node scripts/verify-studio-professional-validation.mjs --check",
    "node --test scripts/verify-studio-professional-validation.test.mjs",
    "pnpm --filter @toonstudio/desktop-sync run build",
    "node --test scripts/desktop-sync-release.test.mjs",
  ]);
});
