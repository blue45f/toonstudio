import { describe, expect, it } from "vitest";

import {
  SUPPORT_MAX_ATTACHMENT_BYTES,
  SUPPORT_QUICK_TEMPLATES,
  classifySupportIntent,
  formatSupportMessageWithAttachments,
  validateSupportImageAttachment,
} from "./customer-support-realtime";

describe("customer-support-realtime", () => {
  it("문의 내용을 의도별로 정확히 분류하고 즉시 자가진단 체크리스트를 제공한다", () => {
    expect(SUPPORT_QUICK_TEMPLATES.length).toBeGreaterThanOrEqual(5);
    expect(classifySupportIntent("OPFS 저장 복구가 필요해요").category).toBe("manuscript-recovery");
    expect(classifySupportIntent("환불 및 결제 영수증 확인").suggestHumanEscalation).toBe(true);
    expect(classifySupportIntent("RBAC 권한 및 워터마크 보안 설정").category).toBe("rbac-security");
    expect(classifySupportIntent("MCP CLI 연동 방법").category).toBe("mcp-cli-api");
  });

  it("허용 MIME·용량·개수 한도 내에서 이미지 첨부를 검증하고 포맷한다", () => {
    const ok = validateSupportImageAttachment({
      fileName: "bug-screen.png",
      mimeType: "image/png",
      sizeBytes: 20480,
      dataUrl: "data:image/png;base64,iVBORw0KGgo=",
      existingCount: 0,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      const formatted = formatSupportMessageWithAttachments("화면 오류입니다", [ok.attachment]);
      expect(formatted).toContain("화면 오류입니다");
      expect(formatted).toContain("bug-screen.png");
    }

    const oversized = validateSupportImageAttachment({
      fileName: "huge.png",
      mimeType: "image/png",
      sizeBytes: SUPPORT_MAX_ATTACHMENT_BYTES + 1,
      dataUrl: "data:image/png;base64,AAAA",
      existingCount: 0,
    });
    expect(oversized.ok).toBe(false);
  });
});
