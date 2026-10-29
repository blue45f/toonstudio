#!/usr/bin/env node

import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runExperiments, type ExperimentExecutor } from "./studio-ai-experiments-core";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const HELP = "사용법: pnpm exec tsx scripts/studio-ai-experiments.mts [--dry-run | --execute] [--model claude-haiku-5-5] [--budget-usd 0.5] [--label baseline] [--report /tmp/result.json]";

interface Arguments {
  execute: boolean;
  model: string;
  budgetUsd: number;
  label: string;
  report?: string;
}

function parseArguments(args: readonly string[]): Arguments {
  const options: Arguments = { execute: false, model: "claude-haiku-5-5", budgetUsd: 0.5, label: "baseline" };
  let dryRun = false;
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === "--dry-run") { dryRun = true; continue; }
    if (name === "--execute") { options.execute = true; continue; }
    if (!["--model", "--budget-usd", "--label", "--report"].includes(name ?? "")) throw new Error(HELP);
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(HELP);
    if (name === "--model") options.model = value;
    if (name === "--budget-usd") options.budgetUsd = Number(value);
    if (name === "--label") options.label = value;
    if (name === "--report") options.report = value;
  }
  if (dryRun && options.execute) throw new Error("--dry-run과 --execute를 함께 지정할 수 없습니다.");
  return options;
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) { process.stdout.write(`${HELP}\n`); return; }
  const options = parseArguments(process.argv.slice(2));
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    let executor: ExperimentExecutor | undefined;
    if (options.execute) {
      const apiKey = process.env.ANTHROPIC_API_KEY?.trim() || process.env.STUDIO_AI_ANTHROPIC_API_KEY?.trim();
      if (!apiKey) throw new Error("실행하려면 현재 프로세스에 ANTHROPIC_API_KEY를 안전하게 주입하세요. 키를 명령 인자에 넣지 마세요.");
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey, baseURL: "https://api.anthropic.com", maxRetries: 0, timeout: 90_000, openTelemetry: false, logLevel: "off" });
      executor = async (request, signal) => {
        const { data, response } = await client.messages.create(request, { signal, maxRetries: 0, timeout: 90_000 }).withResponse();
        return {
          model: data.model, messageId: data.id, requestId: response.headers.get("request-id"),
          stopReason: data.stop_reason, usage: data.usage,
          text: data.content.filter((block) => block.type === "text").map((block) => block.text).join("\n"),
        };
      };
    }
    const report = await runExperiments({ model: options.model, execute: options.execute, budgetUsd: options.budgetUsd, runLabel: options.label, signal: controller.signal }, executor);
    const json = `${JSON.stringify(report, null, 2)}\n`;
    if (options.report) {
      const path = resolve(REPO_ROOT, options.report);
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${process.pid}.tmp`;
      await writeFile(temporary, json, { encoding: "utf8", mode: 0o600 });
      await rename(temporary, path);
    }
    // 입력·응답 전문과 키는 보고서와 stdout에 포함하지 않는다.
    process.stdout.write(json);
    process.exitCode = options.execute && !report.passed ? 1 : 0;
  } finally {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}

main().catch((error: unknown) => {
  // 이 경로의 오류는 위 인자·설정·파일 작업에서 발생한다. 외부 응답 원문은 core에서 고정 코드로 바꾼다.
  const message = error instanceof Error ? error.message : "실험 실행기에 오류가 발생했습니다.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 2;
});
