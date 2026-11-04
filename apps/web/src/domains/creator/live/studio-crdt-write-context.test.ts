import { describe, expect, it, vi } from "vitest";
import { StudioCrdtDocument } from "./studio-crdt-document";
import { captureStudioCrdtWriteContext } from "./studio-crdt-write-context";

describe("전체 편집과 제한 편집의 CRDT 문맥 선택", () => {
  it("전체 편집은 opt-in 변경 문맥만 소비하고 기존 제한 편집 문맥을 차용하지 않는다", () => {
    const document = new StudioCrdtDocument(), context = { version: 1 as const, policyVersion: 3, grantIds: ["grant"], creations: [], restorations: [] };
    const publisher = { captureWriteContext: vi.fn(() => context), captureFullEditWriteContext: vi.fn(() => undefined), bindFlushBoundary: () => () => {} };
    try {
      expect(captureStudioCrdtWriteContext(publisher, true, document)).toBeUndefined();
      expect(publisher.captureWriteContext).not.toHaveBeenCalled();
      expect(captureStudioCrdtWriteContext(publisher, false, document)).toBe(context);
      expect(publisher.captureWriteContext).toHaveBeenCalledTimes(1);
    } finally { document.destroy(); }
  });
});
