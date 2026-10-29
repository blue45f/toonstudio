import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { DrizzleStudioCrdtTransaction } from "./studio-crdt.repository";
import { loadStudioScopedCrdtReferenceSources } from "./studio-scoped-crdt-reference-sources";
import { scopedDocument } from "./studio-scoped-write.test-fixture";

const descriptor = { version: 1, element: { id: "fresh", type: "image", x: 10, y: 20, width: 100, height: 100, rotation: 0 } };
function reference() {
  const doc = new Y.Doc(), record = doc.getMap<unknown>("scene-element:fresh");
  doc.getMap("scene-elements").set("fresh", true);
  for (const [key, value] of Object.entries({ id: "fresh", pageId: "page", layerId: "page-root", payloadVersion: 1, type: "reference", deleted: false,
    "prop:elementType": "image", "prop:x": 10, "prop:y": 20, "prop:width": 30, "prop:height": 30, "prop:rotation": 0 })) record.set(key, value);
  return doc;
}
describe("신규 CRDT 자산 원본의 서버 권위", () => {
  it("baseline에 없는 활성 참조는 같은 work의 불변 descriptor로만 해석한다", async () => {
    const doc = reference(), execute = vi.fn().mockResolvedValue({ rows: [{ assetId: "fresh", elementType: "image", descriptor }] });
    try {
      const result = await loadStudioScopedCrdtReferenceSources({ execute } as unknown as DrizzleStudioCrdtTransaction, "work", scopedDocument(), [doc]);
      expect(result.get("fresh")).toEqual({ ...descriptor.element, src: "work-asset://image/fresh" }); expect(execute).toHaveBeenCalledTimes(1);
    } finally { doc.destroy(); }
  });
  it("이미 baseline에 있는 본문을 새 후보나 upload descriptor로 덮지 않는다", async () => {
    const doc = reference(), execute = vi.fn();
    try {
      const baseline = scopedDocument([{ ...descriptor.element, src: "immutable-original", opaque: { preserve: true } }]);
      expect((await loadStudioScopedCrdtReferenceSources({ execute } as unknown as DrizzleStudioCrdtTransaction, "work", baseline, [doc])).size).toBe(0);
      expect(execute).not.toHaveBeenCalled(); expect(baseline.pagesList[0]?.elements[0]).toHaveProperty("opaque.preserve", true);
    } finally { doc.destroy(); }
  });
  it("서버 원본 누락·다른 ID·다른 type은 geometry를 추정하지 않고 거절한다", async () => {
    const doc = reference();
    try {
      for (const rows of [[], [{ assetId: "fresh", elementType: "vrm", descriptor }],
        [{ assetId: "fresh", elementType: "image", descriptor: { ...descriptor, element: { ...descriptor.element, id: "other" } } }]]) {
        const execute = vi.fn().mockResolvedValue({ rows });
        await expect(loadStudioScopedCrdtReferenceSources({ execute } as unknown as DrizzleStudioCrdtTransaction, "work", scopedDocument(), [doc])).rejects.toThrow();
      }
    } finally { doc.destroy(); }
  });
});
