/** SVG 문자열을 미리보기용 데이터 URL 로 바꾼다. 같은 참은 한 번만 계산한다. */

import { svgToDataUrl } from "../studio-characters";

import type { StudioCharmDescriptor } from "./studio-charm-descriptor";

const svgSrcCache = new WeakMap<StudioCharmDescriptor, string>();

export function studioCharmPreviewSrc(descriptor: StudioCharmDescriptor, svg: string): string {
  let src = svgSrcCache.get(descriptor);
  if (src === undefined) {
    src = svgToDataUrl(svg);
    svgSrcCache.set(descriptor, src);
  }
  return src;
}
