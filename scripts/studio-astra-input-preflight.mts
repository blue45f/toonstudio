import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { z } from "zod";

import { StudioOpenAiCreativeAssistService } from "../apps/api/src/modules/studio-ai/studio-openai-creative-assist.service";

import { ASTRA_INPUT_FIXTURES } from "./studio-astra-input-fixtures";

type Mode = (typeof ASTRA_INPUT_FIXTURES)[number]["input"]["mode"];
const MODEL = "gpt-6.2-astra";
const COUNT_URL = "https://api.openai.com/v1/responses/input_tokens";
const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const HELP = [
  "사용법: pnpm exec tsx --tsconfig apps/api/tsconfig.json scripts/studio-astra-input-preflight.mts [--offline | --count]",
  "기본 실행은 합성 원고로 실제 서비스의 메시지와 출력 스키마를 조립해 요청 해시를 출력합니다.",
  "--count는 OPENAI_API_KEY를 사용해 공식 무료 입력 토큰 계산만 수행합니다. 생성 요청은 0회입니다.",
  "계산 API의 수락 여부와 토큰 수를 기록합니다. 생성 품질·실제 추론량·프로모션 잔액은 측정하지 않습니다.",
].join("\n");

const chatContract = z.object({
  model: z.literal(MODEL),
  store: z.literal(false),
  messages: z.tuple([
    z.object({ role: z.literal("system"), content: z.string().min(1) }),
    z.object({ role: z.literal("user"), content: z.string().min(1) }),
  ]),
  response_format: z.object({
    type: z.literal("json_schema"),
    json_schema: z.object({ name: z.string().min(1), strict: z.literal(true), schema: z.record(z.string(), z.unknown()) }),
  }),
});

export async function buildAstraInputPlan() {
  const service = new StudioOpenAiCreativeAssistService();
  const plan = [];
  for (const { id, input } of ASTRA_INPUT_FIXTURES) {
    let wireBody: string | undefined;
    try {
      await service.assist("astra-input-preflight", input, {
        env: { OPENAI_API_KEY: "offline-placeholder", OPENAI_MODEL: MODEL },
        fetchImpl: async (url, init) => {
          if (wireBody || url !== CHAT_URL || init?.method !== "POST" || typeof init.body !== "string") {
            throw new Error("예상한 창작 보조 요청 형식과 다릅니다.");
          }
          wireBody = init.body;
          // 로컬 대역만 사용한다. 503을 반환하면 서비스가 호출 예약을 해제한다.
          return new Response(null, { status: 503 });
        },
      });
    } catch (error) {
      if (!(error instanceof Error && "getStatus" in error && typeof error.getStatus === "function" && error.getStatus() === 503 && wireBody)) {
        throw new Error("오프라인 창작 보조 요청을 수집하지 못했습니다. 서비스 계약을 확인하세요.", { cause: error });
      }
    }
    const captured = chatContract.safeParse(wireBody && JSON.parse(wireBody));
    if (!captured.success) throw new Error("실제 창작 보조 요청의 모델·메시지·출력 스키마를 확인하세요.");
    const { messages, response_format: format } = captured.data;
    // Responses는 Chat Completions의 response_format.json_schema를 text.format으로 받는다.
    const payload = {
      model: MODEL, input: messages, reasoning: { effort: "max" },
      text: { format: { type: format.type, ...format.json_schema } },
    };
    const body = JSON.stringify(payload);
    plan.push({ id, mode: input.mode, schemaName: format.json_schema.name, sha256: createHash("sha256").update(body).digest("hex"), body });
  }
  return plan;
}

type Measurement =
  | { status: "offline" | "unattempted" }
  | { status: "counted"; inputTokens: number }
  | { status: "http-error"; httpStatus: number }
  | { status: "transport-error" | "invalid-count" };

const countResponse = z.object({
  object: z.literal("response.input_tokens"), input_tokens: z.int().positive(),
});

async function measure(body: string, apiKey: string, transport: typeof fetch): Promise<Measurement> {
  // https://developers.openai.com/api/reference/resources/responses/subresources/input_tokens/methods/count
  try {
    const response = await transport(COUNT_URL, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body,
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { status: "http-error", httpStatus: response.status };
    }
    const count = countResponse.safeParse(await response.json().catch(() => null));
    return count.success ? { status: "counted", inputTokens: count.data.input_tokens } : { status: "invalid-count" };
  } catch {
    return { status: "transport-error" };
  }
}

type Options =
  | { mode: "offline" }
  | { mode: "count"; apiKey: string; transport?: typeof fetch };

interface CaseResult {
  id: string;
  mode: Mode;
  schemaName: string;
  sha256: string;
  measurement: Measurement;
}

export async function runAstraInputPreflight(options: Options = { mode: "offline" }) {
  if (options.mode === "count" && !options.apiKey.trim()) throw new Error("--count 실행에는 OPENAI_API_KEY가 필요합니다.");
  const plan = await buildAstraInputPlan();
  const cases: CaseResult[] = [];
  let attempts = 0;
  let counted = 0;
  let total = 0;
  let stopped = false;
  for (const { body, ...metadata } of plan) {
    let measurement: Measurement = { status: options.mode === "offline" ? "offline" : "unattempted" };
    if (options.mode === "count" && !stopped) {
      attempts += 1;
      measurement = await measure(body, options.apiKey.trim(), options.transport ?? fetch);
      if (measurement.status === "counted") {
        total += measurement.inputTokens;
        counted += 1;
      } else {
        stopped = true;
      }
    }
    cases.push({ ...metadata, measurement });
  }
  return {
    mode: options.mode, model: MODEL, requestedReasoningEffort: "max", generationRequests: 0,
    countAttempts: attempts, countedCases: counted, countedInputTokens: counted ? total : null,
    allInputsCounted: counted === plan.length, cases,
  };
}

export function parseAstraInputArgs(args: readonly string[]): "offline" | "count" | "help" {
  if (!args.length || (args.length === 1 && args[0] === "--offline")) return "offline";
  if (args.length === 1 && args[0] === "--count") return "count";
  if (args.length === 1 && args[0] === "--help") return "help";
  throw new Error(HELP);
}

async function main() {
  const mode = parseAstraInputArgs(process.argv.slice(2));
  if (mode === "help") { process.stdout.write(`${HELP}\n`); return; }
  const report = await runAstraInputPreflight(mode === "count" ? { mode, apiKey: process.env.OPENAI_API_KEY ?? "" } : { mode });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (mode === "count" && !report.allInputsCounted) {
    process.stderr.write("입력 계산이 중단되었습니다. 해당 사례의 상태와 모델 접근 권한을 확인한 뒤 --count를 다시 실행하세요.\n");
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error: unknown) => {
    // 잘못된 인자와 키 값, 제공자 오류 본문을 출력하지 않는다.
    process.stderr.write(`${error instanceof Error && [HELP, "--count 실행에는 OPENAI_API_KEY가 필요합니다."].includes(error.message) ? error.message : "입력 계약 검증에 실패했습니다. --offline으로 서비스 계약을 확인하세요."}\n`);
    process.exitCode = 2;
  });
}
