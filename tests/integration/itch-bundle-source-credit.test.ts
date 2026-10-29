import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { hasValidStudioCrdtRootSchema } from "../../apps/api/src/modules/creator/studio-crdt-root-schema";
import { studioBundleCreditFixture } from "../../apps/web/src/domains/creator/catalog/studio-bundle-source-credit.test-fixture";
import { StudioCrdtDocument } from "../../apps/web/src/domains/creator/live/studio-crdt-document";
import { studioCrdtElementToSceneElement, studioElementToCrdtSceneElement } from "../../apps/web/src/domains/creator/live/studio-crdt-page-bridge";
import { validateStudioCrdtSceneElementPayload } from "../../apps/web/src/domains/creator/live/studio-crdt-scene-schema";

const CREDIT = studioBundleCreditFixture();
const FRAME = { id: "bundle-frame", type: "frame", x: 0, y: 0, width: 200, height: 120, bg: CREDIT.renderPath, bundleSourceCredit: CREDIT };

function serverFrame() {
  const local = new StudioCrdtDocument();
  const server = new Y.Doc();
  local.addSceneElement(studioElementToCrdtSceneElement("page", FRAME));
  Y.applyUpdate(server, local.encodeStateAsUpdate());
  local.destroy();
  return server;
}

describe("번들 출처의 Web/API canonical 경계", () => {
  it("실제 프레임 CRDT 직렬화→API schema→피어 재열기에서 출처·CC0·해시가 유지된다", () => {
    const server = serverFrame();
    const peer = new StudioCrdtDocument(Y.encodeStateAsUpdate(server));
    try {
      expect(hasValidStudioCrdtRootSchema(server)).toBe(true);
      expect(peer.getSceneElement(FRAME.id)?.payload.props.bundleSourceCredit).toEqual(CREDIT);
    } finally { peer.destroy(); server.destroy(); }
  });

  it("admitted 이미지의 credit은 descriptor에서 복원하고 원격 envelope의 출처 교체를 사용하지 않는다", () => {
    const source = { id: "placed-image", type: "image", src: "work-asset://image/placed-image", x: 0, y: 0, width: 10, height: 10, rotation: 0, bundleSourceCredit: CREDIT };
    const local = new StudioCrdtDocument();
    const server = new Y.Doc();
    local.addSceneElement(studioElementToCrdtSceneElement("page", source));
    Y.applyUpdate(server, local.encodeStateAsUpdate());
    const peer = new StudioCrdtDocument(Y.encodeStateAsUpdate(server));
    try {
      expect(hasValidStudioCrdtRootSchema(server)).toBe(true);
      const record = peer.getSceneElement(source.id);
      expect(record).not.toBeNull();
      if (!record) throw new Error("저장된 이미지 참조가 없습니다.");
      expect(studioCrdtElementToSceneElement(record, source)).toMatchObject({ bundleSourceCredit: CREDIT });
      const { bundleSourceCredit: _credit, ...plainSource } = source;
      expect(studioCrdtElementToSceneElement(record, plainSource)).not.toHaveProperty("bundleSourceCredit");
      const changed = { ...record, payload: { ...record.payload, props: { ...record.payload.props, bundleSourceCredit: { ...CREDIT, contentHash: `sha256:${"b".repeat(64)}` } } } };
      expect(studioCrdtElementToSceneElement(changed, source)).toMatchObject({ bundleSourceCredit: CREDIT });
    } finally { peer.destroy(); local.destroy(); server.destroy(); }
  });

  it("프런트와 API 양쪽에서 잘못된 credit·hash·sourceURL을 거부한다", () => {
    const payload = studioElementToCrdtSceneElement("page", FRAME).payload;
    for (const patch of [{ contentHash: "wrong" }, { serve: "hold" }, { licenseUrl: "https://example.test/deed" }, { sourceUrl: "https://itch.io/download/private" }]) {
      const invalid = { ...CREDIT, ...patch };
      expect(() => validateStudioCrdtSceneElementPayload({ ...payload, props: { ...payload.props, bundleSourceCredit: invalid } })).toThrow();
      const server = serverFrame();
      try {
        server.getMap(`scene-element:${FRAME.id}`).set("prop:bundleSourceCredit", invalid);
        expect(hasValidStudioCrdtRootSchema(server)).toBe(false);
      } finally { server.destroy(); }
    }
  });

  it("유효한 prop override 아래에 숨은 잘못된 frame baseline credit도 거부한다", () => {
    const server = serverFrame();
    try {
      const frame = server.getMap(`scene-element:${FRAME.id}`);
      frame.set("base:bundleSourceCredit", { ...CREDIT, contentHash: "wrong" });
      frame.set("prop:bundleSourceCredit", CREDIT);
      expect(hasValidStudioCrdtRootSchema(server)).toBe(false);
    } finally { server.destroy(); }
  });

  it("벡터 text에 번들 이미지 출처를 붙여 통과시키지 않는다", () => {
    expect(() => studioElementToCrdtSceneElement("page", { id: "text", type: "text", text: "본문", x: 0, y: 0, width: 20, fontSize: 12, bundleSourceCredit: CREDIT })).toThrow();
    const server = serverFrame();
    try {
      const frame = server.getMap(`scene-element:${FRAME.id}`);
      frame.set("type", "text");
      expect(hasValidStudioCrdtRootSchema(server)).toBe(false);
    } finally { server.destroy(); }
  });
});
