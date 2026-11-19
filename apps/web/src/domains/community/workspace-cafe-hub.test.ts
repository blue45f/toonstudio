import { describe, expect, it } from "vitest";

import {
  CAFE_MAX_IMAGES_PER_POST,
  createDefaultWorkspaceCafes,
  createWorkspaceCafePost,
  validateCafeImageAttachment,
} from "./workspace-cafe-hub";

describe("workspace-cafe-hub", () => {
  it("작품·팀·스튜디오·프로젝트 4대 스코프 카페를 모두 제공한다", () => {
    const cafes = createDefaultWorkspaceCafes();
    expect(cafes.map((c) => c.scope)).toEqual(["work", "team", "studio", "project"]);
  });

  it("이미지 첨부를 검증하고 첨부가 포함된 게시글을 생성한다", () => {
    const cafe = createDefaultWorkspaceCafes()[1];
    const att = validateCafeImageAttachment({
      fileName: "cut-04-feedback.png",
      mimeType: "image/png",
      sizeBytes: 51200,
      dataUrl: "data:image/png;base64,iVBORw0KGgo=",
      caption: "4컷 조명 수정안",
      spoilerBlur: true,
      existingCount: 0,
    });
    expect(att.ok).toBe(true);
    if (!att.ok) return;

    const postRes = createWorkspaceCafePost({
      cafe,
      channel: "manuscript-feedback",
      authorName: "작감",
      authorRoleBadge: "팀별 카페",
      title: "4컷 조명 피드백",
      body: "역광 강도를 20% 올려주세요.",
      attachments: [att.attachment],
    });
    expect(postRes.ok).toBe(true);
    if (postRes.ok) {
      expect(postRes.post.attachments).toHaveLength(1);
      expect(postRes.post.attachments[0]?.spoilerBlur).toBe(true);
    }

    const overflow = validateCafeImageAttachment({
      fileName: "over.png",
      mimeType: "image/png",
      sizeBytes: 1000,
      dataUrl: "data:image/png;base64,AAAA",
      existingCount: CAFE_MAX_IMAGES_PER_POST,
    });
    expect(overflow.ok).toBe(false);
  });
});
