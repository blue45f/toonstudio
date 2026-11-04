// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StudioPageThumbnail } from "../StudioPageThumbnails";
import { studioThumbnailNativeBlend, STUDIO_THUMBNAIL_CSS_BLEND_MODES } from "./studio-thumbnail-native-blend";
import type { ThumbPageLike } from "../studio-page-thumbs";

const native = (role: string, blendMode: string) => ({ id: `element-${role}`, type: "image", src: "data:image/png;base64,AA==", x: 0, y: 0, width: 600, height: 411, opacity: .85, blendMode,
  bg3dLtBundleId: "bundle-one", bg3dLtRole: role, bg3dLtRenderMode: "separated",
  bg3dLtBundleReference: { kind: "bg3d-sixpass-bundle", bundleId: "bundle-one", renderRevisionId: "revision-one", manifestHash: `sha256:${"a".repeat(64)}`, role, elementId: `element-${role}` } });
function html(elements: ThumbPageLike["elements"]): string {
  return renderToStaticMarkup(<StudioPageThumbnail page={{ id: "page-one", bg: "#fff", bgGrad: null, canvasH: 1080, elements }} />);
}
describe("새 6패스 SVG thumbnail 합성", () => {
  it("tone multiply와 depth screen을 페이지 내부에서 격리 합성한다", () => {
    const value = html([native("tone", "multiply"), native("depth", "screen")]);
    expect(value).toContain("mix-blend-mode:multiply"); expect(value).toContain("mix-blend-mode:screen");
    expect(value).toContain("isolation:isolate"); expect(value).toContain("opacity=\"0.85\"");
  });
  it("CSS16 모드와 source-over 동등 별칭만 지원하고 저장 문자열은 바꾸지 않는다", () => {
    for (const blendMode of STUDIO_THUMBNAIL_CSS_BLEND_MODES) expect(studioThumbnailNativeBlend(native("tone", blendMode))).toEqual({ mode: blendMode, css: blendMode });
    const source = native("tone", "source-over"); expect(studioThumbnailNativeBlend(source)).toEqual({ mode: "source-over", css: "normal" });
    expect(source.blendMode).toBe("source-over");
  });
  it("지원하지 않는 Canvas composite를 normal로 그리지 않고 명시적으로 안내한다", () => {
    for (const blendMode of ["destination-out", "copy", "lighter", "unknown"]) {
      const value = html([native("tone", blendMode)]);
      expect(value).toContain(`data-raster-blend-unsupported="${blendMode}"`);
      expect(value).toContain("이 레이어의 합성은 원고 캔버스에서 확인해 주세요."); expect(value).not.toContain("<image");
    }
  });
  it("일반 이미지와 위조된 native marker의 기존 thumbnail 동작은 바꾸지 않는다", () => {
    const ordinary = { id: "ordinary", type: "image", src: "data:image/png;base64,AA==", x: 0, y: 0, width: 600, height: 411, blendMode: "multiply" };
    const value = html([ordinary]); expect(value).not.toContain("mix-blend-mode"); expect(value).not.toContain("isolation");
    expect(studioThumbnailNativeBlend({ ...native("tone", "multiply"), id: "forged" })).toBeNull();
  });
});
