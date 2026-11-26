import { ApprovedDialoguePairSchema, parseGroundedDialogueReview } from "@toonstudio/contracts/studio-approved-dialogue-review";
import { describe, expect, it, vi } from "vitest";

import { StudioOpenAiCreativeAssistService } from "../studio-openai-creative-assist.service";

const pair = { approvedDialogue: "내가 금요일까지 보내지 않을게.", currentDialogue: "네가 목요일까지 보내 줘." };
const findings = [
  { kind: "actor", approvedQuote: "내가", currentQuote: "네가", explanation: "보낼 사람이 화자에서 상대방으로 바뀌었어요." },
  { kind: "deadline", approvedQuote: "금요일까지", currentQuote: "목요일까지", explanation: "시한이 하루 앞당겨졌어요." },
  { kind: "negation", approvedQuote: "보내지 않을게", currentQuote: "보내 줘", explanation: "보내지 않겠다는 말이 보내 달라는 요청으로 바뀌었어요." },
];
const env = { OPENAI_API_KEY: "synthetic-test", OPENAI_MODEL: "gpt-4.1-mini" };
function completion(content: string, finish_reason = "stop") {
  return new Response(JSON.stringify({ choices: [{ finish_reason, message: { content } }] }));
}
describe("승인 대사 의미 비교", () => {
  it("두 대사의 근거를 확인하고 마스킹한 원문과 제한된 요청만 전송한다", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => completion(JSON.stringify({ findings })));
    const service = new StudioOpenAiCreativeAssistService();
    const reply = await service.reviewApprovedDialogue("synthetic", { ...pair, currentDialogue: pair.currentDialogue + " example@example.test" }, { env, fetchImpl });
    expect(reply.result.findings).toEqual(findings);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, request] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(request?.method).toBe("POST");
    const body = JSON.parse(String(request?.body));
    expect(body).toMatchObject({
      model: env.OPENAI_MODEL,
      store: false,
      max_completion_tokens: 850,
      temperature: 0.65,
      response_format: {
        type: "json_schema",
        json_schema: { name: "toonstudio_approved_dialogue_review", strict: true },
      },
    });
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(body.messages[1].content).not.toContain("example@example.test");
    expect(JSON.parse(body.messages[1].content).approvedDialogue).toEqual(pair.approvedDialogue);
  });

  it("긴 대사와 추론 모델은 더 많은 출력 토큰을 확보한다", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => completion(JSON.stringify({ findings: [] })));
    const service = new StudioOpenAiCreativeAssistService();
    const longPair = {
      ...pair,
      currentDialogue: pair.currentDialogue + " 내일 아침에 회의실에서 원고를 같이 확인하자.".repeat(40),
    };

    await service.reviewApprovedDialogue("synthetic", longPair, { env, fetchImpl });
    await service.reviewApprovedDialogue("synthetic", pair, {
      env: { ...env, OPENAI_MODEL: "gpt-5.5" },
      fetchImpl,
    });

    const [longBody, reasoningBody] = fetchImpl.mock.calls.map(([, request]) => JSON.parse(String(request?.body)));
    expect(longBody).toMatchObject({ max_completion_tokens: 3_200, temperature: 0.65 });
    expect(reasoningBody).toMatchObject({ model: "gpt-5.5", max_completion_tokens: 4_000, reasoning_effort: "low" });
    expect(reasoningBody).not.toHaveProperty("temperature");
  });

  it.each([
    ["없는 인용", JSON.stringify({ findings: [{ ...findings[0], approvedQuote: "그녀가" }] }), "stop"],
    ["근거 없는 생략", JSON.stringify({ findings: [{ ...findings[0], currentQuote: "" }] }), "stop"],
    ["잘린 출력", JSON.stringify({ findings: [] }), "length"],
    ["형식 오류", "{", "stop"],
  ])("%s는 사용자에게 제시하지 않는다", async (_label, content, finish) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => completion(content, finish));
    await expect(new StudioOpenAiCreativeAssistService().reviewApprovedDialogue("synthetic", pair, { env, fetchImpl })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("대사 추가·삭제와 의미 변화 없음은 허용하고 같은 대사와 초과 입력을 거른다", () => {
    const addition = { approvedDialogue: "", currentDialogue: "아니." };
    expect(parseGroundedDialogueReview(addition, { findings: [{ ...findings[0], approvedQuote: "", currentQuote: "아니." }] })).not.toBeNull();
    expect(parseGroundedDialogueReview({ approvedDialogue: "가자!", currentDialogue: "" }, { findings: [{ ...findings[0], approvedQuote: "가자!", currentQuote: "" }] })).not.toBeNull();
    expect(parseGroundedDialogueReview(pair, { findings: [] })).toEqual({ findings: [] });
    expect(ApprovedDialoguePairSchema.safeParse({ approvedDialogue: " 가자!", currentDialogue: "가자!" }).success).toBe(false);
    expect(ApprovedDialoguePairSchema.safeParse({ ...pair, currentDialogue: "가".repeat(2_001) }).success).toBe(false);
  });
});
