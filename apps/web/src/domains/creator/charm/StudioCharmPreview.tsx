/**
 * 참 칩·선택기 타일의 미리보기. 순수 표시 컴포넌트다.
 *
 * SVG·이미지 미리보기는 잉크색 선화가 어두운 테마에서 사라지지 않도록 요소 패널과 같은 밝은 종이 면 위에
 * 그린다. 이모지·글자·아이콘은 테마 표면을 그대로 쓴다. 장식이므로 접근 가능한 이름은 바깥 버튼이 가진다.
 */

import { Box, MessageCircle } from "lucide-react";

import { studioCharmPreviewSrc } from "./studio-charm-preview-src";

import type { StudioCharmDescriptor } from "./studio-charm-descriptor";

const SURFACE_PAPER = "bg-[oklch(0.94_0.01_78)]";
const SURFACE_THEME = "bg-card text-fg";

export function StudioCharmPreview({ descriptor }: { readonly descriptor: StudioCharmDescriptor }) {
  const { preview } = descriptor;
  switch (preview.type) {
    case "svg":
      return (
        <span aria-hidden="true" className={`grid size-full place-items-center overflow-hidden rounded-md p-0.5 ${SURFACE_PAPER}`}>
          <img
            src={studioCharmPreviewSrc(descriptor, preview.svg)}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            className="size-full object-contain"
          />
        </span>
      );
    case "image":
      return (
        <span aria-hidden="true" className={`grid size-full place-items-center overflow-hidden rounded-md p-0.5 ${SURFACE_PAPER}`}>
          <img
            src={preview.src}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            className="size-full object-contain"
          />
        </span>
      );
    case "emoji":
      return (
        <span aria-hidden="true" className={`grid size-full place-items-center rounded-md text-xl leading-none ${SURFACE_THEME}`}>
          {preview.emoji}
        </span>
      );
    case "text":
      return (
        <span
          aria-hidden="true"
          className={`grid size-full place-items-center overflow-hidden rounded-md px-0.5 text-center text-[0.68rem] font-black leading-tight ${SURFACE_THEME}`}
        >
          <span className="line-clamp-2 break-all">{preview.text}</span>
        </span>
      );
    case "icon":
      return (
        <span aria-hidden="true" className={`grid size-full place-items-center rounded-md ${SURFACE_THEME}`}>
          {preview.icon === "bubble" ? <MessageCircle size={18} /> : <Box size={18} />}
        </span>
      );
  }
}
