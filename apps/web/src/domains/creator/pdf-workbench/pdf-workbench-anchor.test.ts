import { describe, expect, it } from "vitest";

import {
  addPdfSource,
  createPdfWorkbenchState,
  movePdfPageTo,
  type PdfWorkbenchSource,
} from "./pdf-workbench-model";
import {
  canonicalPdfPageAnchorKey,
  createPdfPageAnchor,
  pdfPageAnchorForEntry,
} from "./pdf-workbench-anchor";

const sourceA: PdfWorkbenchSource = { id: "src-a", name: "a.pdf", sizeBytes: 100, pageCount: 3 };

describe("PDF 페이지 앵커", () => {
  it("페이지 항목에서 원본 기준 앵커를 만든다", () => {
    const state = addPdfSource(createPdfWorkbenchState(), sourceA);
    const entry = state.pages[2];
    if (!entry) throw new Error("페이지 없음");
    const anchor = pdfPageAnchorForEntry(entry, new Map([["src-a", "deadbeef"]]));
    expect(anchor).toEqual({ type: "pdf-page", documentId: "deadbeef", sourcePageIndex: 2 });
  });

  it("지문이 없는 소스는 앵커를 만들지 않는다", () => {
    const state = addPdfSource(createPdfWorkbenchState(), sourceA);
    const entry = state.pages[0];
    if (!entry) throw new Error("페이지 없음");
    expect(pdfPageAnchorForEntry(entry, new Map())).toBeNull();
  });

  it("재배열해도 같은 원본 페이지의 앵커 키는 불변이다 (댓글이 따라 움직이지 않게)", () => {
    const fingerprints = new Map([["src-a", "deadbeef"]]);
    const before = addPdfSource(createPdfWorkbenchState(), sourceA);
    const target = before.pages[0];
    if (!target) throw new Error("페이지 없음");
    const keyBefore = canonicalPdfPageAnchorKey(
      pdfPageAnchorForEntry(target, fingerprints) ?? createPdfPageAnchor({ documentId: "x", sourcePageIndex: -1 }),
    );
    const after = movePdfPageTo(before, target.id, 2);
    const moved = after.pages.find((page) => page.id === target.id);
    if (!moved) throw new Error("이동된 페이지 없음");
    const keyAfter = canonicalPdfPageAnchorKey(
      pdfPageAnchorForEntry(moved, fingerprints) ?? createPdfPageAnchor({ documentId: "x", sourcePageIndex: -1 }),
    );
    expect(keyAfter).toBe(keyBefore);
  });

  it("다른 원본 페이지·다른 문서는 다른 키를 갖는다", () => {
    const a = canonicalPdfPageAnchorKey(createPdfPageAnchor({ documentId: "d1", sourcePageIndex: 0 }));
    const b = canonicalPdfPageAnchorKey(createPdfPageAnchor({ documentId: "d1", sourcePageIndex: 1 }));
    const c = canonicalPdfPageAnchorKey(createPdfPageAnchor({ documentId: "d2", sourcePageIndex: 0 }));
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("좌표는 0..1로 clamp되고 키에서는 네 자리 버킷으로 안정된다", () => {
    const anchor = createPdfPageAnchor({ documentId: "d1", sourcePageIndex: 0, x: 1.4, y: -0.2 });
    expect(anchor.x).toBe(1);
    expect(anchor.y).toBe(0);
    const near = createPdfPageAnchor({ documentId: "d1", sourcePageIndex: 0, x: 0.12341, y: 0.5 });
    const nearSameBucket = createPdfPageAnchor({ documentId: "d1", sourcePageIndex: 0, x: 0.12344, y: 0.5 });
    expect(canonicalPdfPageAnchorKey(near)).toBe(canonicalPdfPageAnchorKey(nearSameBucket));
  });

  it("좌표 없는 페이지 앵커와 좌표 있는 핀 앵커의 키가 구분된다", () => {
    const page = createPdfPageAnchor({ documentId: "d1", sourcePageIndex: 0 });
    const pin = createPdfPageAnchor({ documentId: "d1", sourcePageIndex: 0, x: 0.5, y: 0.5 });
    expect(canonicalPdfPageAnchorKey(page)).not.toBe(canonicalPdfPageAnchorKey(pin));
  });
});
