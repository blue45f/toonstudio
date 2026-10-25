import { describe, expect, it } from "vitest";

import {
  addReferenceAttachment,
  removeReferenceAttachment,
  STUDIO_AI_REFERENCE_ATTACHMENT_CAP,
  type StudioAiReferenceAttachment,
} from "./studio-ai-reference-attachments";

describe("studio-ai-reference-attachments", () => {
  it("이미지·텍스트 첨부를 추가한다", () => {
    const result = addReferenceAttachment([], {
      kind: "image",
      label: "주인공 레퍼런스",
      ref: "data:image/png;base64,abc",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0]?.id).toBe("ref-1");
  });

  it("빈 라벨·빈 참조·이미지 형식 오류·상한을 거부한다", () => {
    expect(
      addReferenceAttachment([], { kind: "text", label: "  ", ref: "지시" }),
    ).toEqual({ ok: false, reason: "empty_label" });
    expect(
      addReferenceAttachment([], { kind: "text", label: "지시", ref: "  " }),
    ).toEqual({ ok: false, reason: "empty_ref" });
    expect(
      addReferenceAttachment([], { kind: "image", label: "사진", ref: "https://example.com/a.png" }),
    ).toEqual({ ok: false, reason: "invalid_image_ref" });
    let attachments: readonly StudioAiReferenceAttachment[] = [];
    for (let index = 0; index < STUDIO_AI_REFERENCE_ATTACHMENT_CAP; index += 1) {
      const result = addReferenceAttachment(attachments, {
        kind: "text",
        label: `지시 ${index}`,
        ref: "지시",
      });
      expect(result.ok).toBe(true);
      if (result.ok) attachments = result.attachments;
    }
    expect(
      addReferenceAttachment(attachments, { kind: "text", label: "초과", ref: "지시" }),
    ).toEqual({ ok: false, reason: "cap_reached" });
  });

  it("삭제가 동작한다", () => {
    const added = addReferenceAttachment([], {
      kind: "text",
      label: "지시",
      ref: "파랗게",
    });
    if (!added.ok) return;
    expect(removeReferenceAttachment(added.attachments, "ref-1")).toEqual([]);
  });
});
