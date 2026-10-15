import { describe, expect, it, vi } from "vitest";

import { buildMyStoryDraft } from "./my-story-draft";
import {
  buildMyStoryAiPrompt,
  createMyStoryOperationId,
  myStoryAiTargets,
  parseMyStoryAiResponse,
  requestMyStoryAiNarration,
  type MyStoryTextCompleter,
} from "./my-story-ai";
import { FIXTURE_ANSWERS, emptySession, fullSession } from "./my-story-test-fixture";

function promptCutIndexes(user: string): number[] {
  const parsed: unknown = JSON.parse(user);
  if (typeof parsed !== "object" || parsed === null || !("cuts" in parsed) || !Array.isArray(parsed.cuts)) return [];
  return parsed.cuts.flatMap((cut: unknown) =>
    typeof cut === "object" && cut !== null && "index" in cut && typeof cut.index === "number" ? [cut.index] : []);
}

function draftOf(session = fullSession("retrospective")) {
  const draft = buildMyStoryDraft(session, "ko");
  if (!draft) throw new Error("expected a draft");
  return draft;
}

describe("AI 보강 프롬프트", () => {
  it("나레이션 후보를 만들 칸의 답변 원문만 보내고 다른 데이터는 싣지 않는다", () => {
    const prompt = buildMyStoryAiPrompt(draftOf(), "ko");
    expect(prompt).not.toBeNull();
    expect(promptCutIndexes(prompt?.user ?? "{}")).toEqual([1, 2, 4, 5, 6, 7, 8]);
    // 나레이션 계획이 없는 '등장'(who) 컷은 AI로 보내지 않는다.
    expect(prompt?.user).not.toContain(FIXTURE_ANSWERS.who);
    expect(prompt?.user).toContain(FIXTURE_ANSWERS.when);
    expect(prompt?.user).not.toContain("projectId");
  });

  it("지어내지 말라는 규칙·글자 수·톤·JSON 형식을 지시한다", () => {
    const prompt = buildMyStoryAiPrompt(draftOf(), "ko");
    expect(prompt?.system).toContain("새로 만들지 않습니다");
    expect(prompt?.system).toContain("maxChars");
    expect(prompt?.system).toContain("담담한 회고체");
    expect(prompt?.system).toContain('{"cuts":[');
  });

  it("보낼 답변이 하나도 없으면 프롬프트가 없다", () => {
    const draft = draftOf(emptySession("retrospective"));
    expect(myStoryAiTargets(draft, "ko")).toEqual([]);
    expect(buildMyStoryAiPrompt(draft, "ko")).toBeNull();
  });
});

describe("AI 응답 파서 — 후보 검증", () => {
  const prompt = buildMyStoryAiPrompt(draftOf(), "ko");
  const targets = prompt?.targets ?? [];

  it("정상 응답은 컷별 후보가 된다(코드 펜스로 감싸도 읽는다)", () => {
    const content = "```json\n" + JSON.stringify({ cuts: [{ index: 1, narration: "열두 살의 여름" }, { index: 6, narration: "배불러서 든든했다" }] }) + "\n```";
    const parsed = parseMyStoryAiResponse(content, targets);
    expect(parsed?.candidates).toEqual([
      { cutIndex: 1, slot: "when", text: "열두 살의 여름" },
      { cutIndex: 6, slot: "feeling", text: "배불러서 든든했다" },
    ]);
    expect(parsed?.rejected).toEqual([]);
  });

  it("원문에 없던 숫자가 생긴 문장·한도를 넘은 문장·빈 문장·모르는 컷은 버린다", () => {
    const parsed = parseMyStoryAiResponse(JSON.stringify({
      cuts: [
        { index: 1, narration: "열두 살 1998년 여름" },
        { index: 2, narration: "가".repeat(60) },
        { index: 4, narration: "   " },
        { index: 99, narration: "없는 컷" },
        { index: 5, narration: "할머니가 많이 먹으라며 웃으셨다" },
      ],
    }), targets);
    expect(parsed?.candidates.map((candidate) => candidate.cutIndex)).toEqual([5]);
    expect(parsed?.rejected).toEqual([
      { cutIndex: 1, reason: "new-number" },
      { cutIndex: 2, reason: "too-long" },
      { cutIndex: 4, reason: "empty" },
      { cutIndex: 99, reason: "unknown-cut" },
    ]);
  });

  it("원문에 있던 숫자는 그대로 써도 된다", () => {
    const withNumber = buildMyStoryAiPrompt(draftOf(fullSession("retrospective", { answers: { when: "1998년 여름방학" } })), "ko");
    const parsed = parseMyStoryAiResponse(JSON.stringify({ cuts: [{ index: 1, narration: "1998년의 여름" }] }), withNumber?.targets ?? []);
    expect(parsed?.candidates).toHaveLength(1);
  });

  it("원문과 같은 문장·같은 컷의 두 번째 항목은 후보로 세지 않는다", () => {
    const parsed = parseMyStoryAiResponse(JSON.stringify({
      cuts: [
        { index: 1, narration: FIXTURE_ANSWERS.when },
        { index: 6, narration: "첫 번째" },
        { index: 6, narration: "두 번째" },
      ],
    }), targets);
    expect(parsed?.candidates).toEqual([{ cutIndex: 6, slot: "feeling", text: "첫 번째" }]);
  });

  it("JSON이 아니거나 cuts 배열이 없으면 null이다", () => {
    expect(parseMyStoryAiResponse("죄송하지만 도와드릴 수 없어요", targets)).toBeNull();
    expect(parseMyStoryAiResponse("{broken", targets)).toBeNull();
    expect(parseMyStoryAiResponse(JSON.stringify({ result: [] }), targets)).toBeNull();
    expect(parseMyStoryAiResponse(JSON.stringify({ cuts: "x" }), targets)).toBeNull();
  });
});

describe("requestMyStoryAiNarration — 실패해도 초안은 그대로", () => {
  const ok = (content: string): MyStoryTextCompleter => vi.fn(async () => ({ ok: true as const, data: { content } }));

  it("성공하면 후보를 돌려주고, 요청에는 멱등 키 규격의 식별자가 실린다", async () => {
    const complete = ok(JSON.stringify({ cuts: [{ index: 1, narration: "열두 살의 여름" }] }));
    const outcome = await requestMyStoryAiNarration(draftOf(), { locale: "ko", complete });
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.candidates).toHaveLength(1);
    const request = vi.mocked(complete).mock.calls[0]?.[0];
    expect(request?.operationId).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u);
    expect(request?.user).toContain("열두 살 여름");
  });

  it("호출자가 준 중단 신호를 그대로 넘긴다", async () => {
    const controller = new AbortController();
    const complete = ok(JSON.stringify({ cuts: [] }));
    await requestMyStoryAiNarration(draftOf(), { locale: "ko", complete, signal: controller.signal });
    expect(vi.mocked(complete).mock.calls[0]?.[1]).toBe(controller.signal);
  });

  it("로그인 필요·무료 소진 같은 실패 코드를 그대로 전달한다", async () => {
    for (const code of ["login_required", "free_exhausted", "network_error", "http_error"] as const) {
      const complete: MyStoryTextCompleter = async () => ({ ok: false, code, error: `${code} message` });
      expect(await requestMyStoryAiNarration(draftOf(), { locale: "ko", complete }))
        .toEqual({ ok: false, code, message: `${code} message` });
    }
  });

  it("호출자가 예외를 던져도 throw 하지 않고 network_error로 돌려준다", async () => {
    const complete: MyStoryTextCompleter = async () => {
      throw new Error("boom");
    };
    expect(await requestMyStoryAiNarration(draftOf(), { locale: "ko", complete }))
      .toEqual({ ok: false, code: "network_error", message: "boom" });
  });

  it("형식이 깨진 응답은 parse_error이고 문구는 초안이 그대로임을 알린다", async () => {
    const outcome = await requestMyStoryAiNarration(draftOf(), { locale: "ko", complete: ok("not json") });
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.code).toBe("parse_error");
    expect(!outcome.ok && outcome.message).toContain("그대로");
  });

  it("보낼 답변이 없으면 호출 자체를 하지 않는다", async () => {
    const complete = ok("{}");
    const outcome = await requestMyStoryAiNarration(draftOf(emptySession("family")), { locale: "ko", complete });
    expect(outcome).toMatchObject({ ok: false, code: "invalid_input" });
    expect(complete).not.toHaveBeenCalled();
  });

  it("후보가 하나도 없어도 성공(빈 후보)으로 알린다 — 화면이 빈 상태를 안내한다", async () => {
    const outcome = await requestMyStoryAiNarration(draftOf(), { locale: "ko", complete: ok(JSON.stringify({ cuts: [] })) });
    expect(outcome).toEqual({ ok: true, candidates: [], rejected: [] });
  });

  it("식별자 생성기는 서버 규격을 만족한다", () => {
    expect(createMyStoryOperationId()).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u);
    expect(createMyStoryOperationId()).not.toBe(createMyStoryOperationId());
  });
});
