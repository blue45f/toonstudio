import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

// GitHub Actions 의 `${{ }}` 식은 셸이 실행되기 전에 문자열로 치환된다. 그래서 공격자가 값을 정할 수
// 있는 컨텍스트를 `run:` 스크립트(또는 actions/github-script 의 script)에 직접 넣으면, 값에 들어 있는
// 따옴표·`$()`·세미콜론이 그대로 명령이 된다(스크립트 주입). 안전한 방식은 값을 `env:` 로 넘기고
// 스크립트에서는 "$NAME" 으로 읽는 것이다.
const EXPRESSION = /\$\{\{\s*([\s\S]*?)\s*\}\}/gu;

// 저장소 쓰기 권한자나 외부 기여자가 임의 문자열로 채울 수 있는 컨텍스트.
const UNTRUSTED_CONTEXTS = Object.freeze([
  /^github\.event\.inputs\./u,
  /^github\.event\.client_payload\b/u,
  /^github\.event\.(?:issue|pull_request|discussion|comment|review|review_comment|pages|release)\b.*\.(?:title|body|name|label|ref|message|email|login|head_ref|default_branch|homepage|tag_name)\b/u,
  /^github\.event\.(?:commits|head_commit)\b/u,
  /^github\.event\.workflow_run\.(?:head_branch|display_title|head_commit|head_repository|pull_requests)\b/u,
  /^github\.head_ref\b/u,
  /^github\.ref_name\b/u,
  /^github\.event\.pull_request\.head\./u,
]);

function isUntrustedExpression(expression, declaredInputs) {
  const normalized = expression.replace(/\s+/gu, "");
  if (UNTRUSTED_CONTEXTS.some((pattern) => pattern.test(normalized))) return true;
  const input = /^inputs\.([A-Za-z0-9_-]+)\b/u.exec(normalized);
  if (input) {
    // 불리언·숫자·선택지 입력은 값 공간이 닫혀 있어 주입 경로가 아니다.
    const type = declaredInputs.get(input[1]);
    return !["boolean", "number", "choice", "environment"].includes(type ?? "string");
  }
  return false;
}

function declaredWorkflowInputs(workflow) {
  const inputs = new Map();
  const triggers = workflow?.on ?? workflow?.[true];
  for (const trigger of ["workflow_dispatch", "workflow_call"]) {
    const declared = triggers && typeof triggers === "object" ? triggers[trigger]?.inputs : undefined;
    if (!declared || typeof declared !== "object") continue;
    for (const [name, definition] of Object.entries(declared)) {
      inputs.set(name, typeof definition?.type === "string" ? definition.type : "string");
    }
  }
  return inputs;
}

function scriptBodies(step) {
  const bodies = [];
  if (typeof step?.run === "string") bodies.push({ kind: "run", body: step.run });
  if (
    typeof step?.uses === "string"
    && step.uses.startsWith("actions/github-script@")
    && typeof step.with?.script === "string"
  ) {
    bodies.push({ kind: "github-script", body: step.with.script });
  }
  return bodies;
}

/**
 * 워크플로 YAML 하나에서 스크립트 주입 위험이 있는 보간을 모두 찾는다.
 * 반환: [{ file, job, step, kind, expression }]
 */
export function findWorkflowInjectionRisks(source, file = "workflow.yml") {
  const workflow = parse(source);
  const declaredInputs = declaredWorkflowInputs(workflow);
  const risks = [];
  for (const [jobName, job] of Object.entries(workflow?.jobs ?? {})) {
    const steps = Array.isArray(job?.steps) ? job.steps : [];
    steps.forEach((step, index) => {
      for (const { kind, body } of scriptBodies(step)) {
        for (const match of body.matchAll(EXPRESSION)) {
          const expression = match[1];
          if (!isUntrustedExpression(expression, declaredInputs)) continue;
          risks.push({
            file,
            job: jobName,
            step: step?.name ?? `#${index + 1}`,
            kind,
            expression: expression.replace(/\s+/gu, " "),
          });
        }
      }
    });
  }
  return risks;
}

export function findRepositoryWorkflowInjectionRisks(
  workflowsDirectory = fileURLToPath(new URL("../.github/workflows/", import.meta.url)),
) {
  return readdirSync(workflowsDirectory)
    .filter((name) => /\.ya?ml$/u.test(name))
    .sort()
    .flatMap((name) =>
      findWorkflowInjectionRisks(readFileSync(join(workflowsDirectory, name), "utf8"), name));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const risks = findRepositoryWorkflowInjectionRisks();
  if (risks.length === 0) {
    console.log("워크플로 스크립트 주입 위험 없음");
  } else {
    for (const risk of risks) {
      console.error(
        `${risk.file} [${risk.job} / ${risk.step}] ${risk.kind} 에 신뢰할 수 없는 값 \${{ ${risk.expression} }} 을 직접 보간합니다. env 로 넘기고 "$NAME" 으로 읽으세요.`,
      );
    }
    process.exitCode = 1;
  }
}
