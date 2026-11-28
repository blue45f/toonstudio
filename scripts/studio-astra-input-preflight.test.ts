import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildModeSystemInstruction, MODE_JSON_SCHEMAS } from "../apps/api/src/modules/studio-ai/openai-assist/studio-openai-prompt-catalog";
import { StudioOpenAiAssistModeSchema } from "../apps/api/src/modules/studio-ai/studio-openai-creative-assist.dto";

import { ASTRA_INPUT_FIXTURES } from "./studio-astra-input-fixtures";
import { parseAstraInputArgs, runAstraInputPreflight } from "./studio-astra-input-preflight.mts";

const key = "evaluation-placeholder";
const countUrl = "https://api.openai.com/v1/responses/input_tokens";
const counted = (tokens: number) => Response.json({ object: "response.input_tokens", input_tokens: tokens });
afterEach(() => vi.unstubAllGlobals());

describe("Astra 무료 입력 검증", () => {
  it("기본 실행은 키·네트워크 없이 모든 모드에 재현 가능한 요청 해시를 만든다", async () => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    expect(parseAstraInputArgs([])).toBe("offline");
    expect(parseAstraInputArgs(["--count"])).toBe("count");
    for (const args of [["--generate"], ["--count", "--offline"], ["--count", "--count"]]) {
      expect(() => parseAstraInputArgs(args)).toThrow("사용법");
    }
    const first = await runAstraInputPreflight();
    expect(await runAstraInputPreflight()).toEqual(first);
    expect(first.cases.map((item) => item.mode)).toEqual(StudioOpenAiAssistModeSchema.options);
    expect(first.cases.every((item) => item.measurement.status === "offline")).toBe(true);
    expect(new Set(first.cases.map((item) => item.sha256)).size).toBe(first.cases.length);
    expect(first).toMatchObject({ countAttempts: 0, countedInputTokens: null, allInputsCounted: false, generationRequests: 0 });
    await expect(runAstraInputPreflight({ mode: "count", apiKey: " " })).rejects.toThrow("OPENAI_API_KEY");
    expect(network).not.toHaveBeenCalled();
  });

  it("14개 실제 모드의 시스템 문구·마스킹된 사용자 입력·스키마를 그대로 한정된 계산 요청에 사용한다", async () => {
    const requests: string[] = [];
    const transport: typeof fetch = async (url, init) => {
      expect(url).toBe(countUrl);
      expect(init?.method).toBe("POST");
      expect(init?.redirect).toBe("error");
      expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${key}`);
      const fixture = ASTRA_INPUT_FIXTURES[requests.length];
      const body = String(init?.body);
      const request = JSON.parse(body);
      const schema = MODE_JSON_SCHEMAS[fixture.input.mode];
      expect(request).toEqual({
        model: "gpt-6.2-astra",
        reasoning: { effort: "max" },
        input: [
          { role: "system", content: buildModeSystemInstruction(fixture.input.mode) },
          { role: "user", content: expect.stringContaining("[창작자 입력]") },
        ],
        text: { format: { type: "json_schema", name: schema.name, schema: schema.schema, strict: true } },
      });
      expect(request.input[1].content).toContain(fixture.input.inputText);
      expect(request.input[1].content).toContain(fixture.input.projectTitle);
      requests.push(body);
      return counted(requests.length);
    };
    const report = await runAstraInputPreflight({ mode: "count", apiKey: key, transport });
    const length = StudioOpenAiAssistModeSchema.options.length;
    expect(report).toMatchObject({
      countAttempts: length, countedCases: length, allInputsCounted: true, generationRequests: 0,
      countedInputTokens: length * (length + 1) / 2,
    });
    expect(report.cases.map((item) => item.sha256)).toEqual(requests.map((body) => createHash("sha256").update(body).digest("hex")));
    const output = JSON.stringify(report);
    expect(output).not.toContain(key);
    expect(output).not.toContain("[창작자 입력]");
  });

  it.each([
    [() => Response.json({ error: { message: key } }, { status: 403 }), { status: "http-error", httpStatus: 403 }],
    [() => Response.redirect("https://example.org"), { status: "http-error", httpStatus: 302 }],
    [() => counted(1.5), { status: "invalid-count" }],
    [() => Response.json({ object: "response", input_tokens: 42 }), { status: "invalid-count" }],
    [() => new Response("broken JSON"), { status: "invalid-count" }],
    [() => { throw new Error(key); }, { status: "transport-error" }],
  ] as const)("실패 후 재전송을 멈추고 응답 원문 없이 완료된 계산을 보존한다 (%#)", async (failure, expected) => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(counted(28)).mockImplementation(async () => failure());
    const report = await runAstraInputPreflight({ mode: "count", apiKey: key, transport });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(report).toMatchObject({ countAttempts: 2, countedCases: 1, countedInputTokens: 28, allInputsCounted: false, generationRequests: 0 });
    expect(report.cases[1]?.measurement).toEqual(expected);
    expect(report.cases.slice(2).every((entry) => entry.measurement.status === "unattempted")).toBe(true);
    expect(JSON.stringify(report)).not.toContain(key);
  });
});
