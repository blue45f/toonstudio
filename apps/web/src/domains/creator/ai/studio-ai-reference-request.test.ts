import { describe, expect, it } from "vitest";

import { buildReferenceColorizeRequest } from "./studio-ai-reference-request";

const attachment = (id: string, dataUrl: string) => ({ id, dataUrl });

describe("studio-ai-reference-request", () => {
  it("이미지 첨부만 요청에 묶고 나머지는 경고한다", () => {
    const result = buildReferenceColorizeRequest({
      prompt: "참조 스타일로 채색",
      attachments: [
        attachment("a", "data:image/png;base64,aaa"),
        attachment("b", "data:text/plain,hello"),
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.references).toHaveLength(1);
    expect(result.request.warnings).toHaveLength(1);
  });

  it("빈 프롬프트는 거부한다", () => {
    expect(
      buildReferenceColorizeRequest({ prompt: "  ", attachments: [] }),
    ).toEqual({ ok: false, reason: "empty_prompt" });
  });
});
