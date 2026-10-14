import { describe, expect, it } from "vitest";

import {
  guardMentorInput,
  MENTOR_REPLY_LENGTH_LIMIT,
  sanitizeMentorReply,
} from "./creator-mentor-filter";
import { getMentorPersona } from "./creator-mentor-personas";

const persona = getMentorPersona("story-mentor");

describe("입력 가드", () => {
  it("금지 주제를 건드리면 전송 전에 막고 주제를 알린다", () => {
    const guard = guardMentorInput(persona, "유명 작품 표절 방법을 알려줘");
    expect(guard.allowed).toBe(false);
    if (!guard.allowed) expect(guard.topic).toBe("표절 방법");
  });

  it("일반 질문은 통과한다", () => {
    expect(guardMentorInput(persona, "클리프행어를 강하게 만드는 법").allowed).toBe(true);
  });
});

describe("응답 새니타이즈", () => {
  it("정상 응답은 그대로 통과한다", () => {
    const result = sanitizeMentorReply(persona, "  좋은 질문이에요.  ");
    expect(result.text).toBe("좋은 질문이에요.");
    expect(result.replacedForbidden).toBe(false);
  });

  it("금지 주제가 섞인 응답은 회피 문구로 통째 교체된다", () => {
    const result = sanitizeMentorReply(persona, "이건 표절 방법으로 해결하면 돼요.");
    expect(result.replacedForbidden).toBe(true);
    expect(result.text).not.toContain("표절 방법");
  });

  it("길이 상한을 넘기면 잘린다", () => {
    const long = "가".repeat(MENTOR_REPLY_LENGTH_LIMIT + 100);
    expect(sanitizeMentorReply(persona, long).text.length).toBe(MENTOR_REPLY_LENGTH_LIMIT);
  });
});
