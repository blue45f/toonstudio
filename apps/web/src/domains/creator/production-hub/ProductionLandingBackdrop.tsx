import { Sparkles } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/**
 * 제작 허브 랜딩 히어로의 배경 클립 — 제작 공정 보드의 분위기를 그린
 * 생성형 AI 영상이라 실제 제품 화면이 아니다. 소리 없는 장식 영상이라
 * 본문 흐름에서 빼고(aria-hidden), 움직임 최소화를 선호하면 숨긴다.
 * 그라데이션 스크림은 원래 히어로의 그라데이션 밴드를 옮긴 것으로,
 * 영상 위에서도 본문 대비를 지키고, 영상이 숨겨진 경우에도 히어로의
 * 인상이 유지된다. 클립 인벤토리의 정본은 domains/marketing/tool-clips.ts다.
 */
const PRODUCTION_LANDING_BACKDROP_CLIP = {
  src: "/brand/tool-clips/tool-production.mp4",
  width: 1344,
  height: 768,
} as const;

export function ProductionLandingBackdropMedia() {
  return (
    <>
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
        tabIndex={-1}
        src={PRODUCTION_LANDING_BACKDROP_CLIP.src}
        width={PRODUCTION_LANDING_BACKDROP_CLIP.width}
        height={PRODUCTION_LANDING_BACKDROP_CLIP.height}
        className="absolute inset-0 h-full w-full object-cover opacity-40 motion-reduce:hidden"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-br from-accent-soft via-panel/85 to-canvas/75"
      />
    </>
  );
}

/** 배경이 생성형 AI 영상임을 밝히는 배지 — 다른 장식 영상 표면과 같은 문구. */
export function ProductionLandingBackdropBadge() {
  const bt = useBilingual("ProductionLandingBackdrop");
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-xs font-bold text-white">
      <Sparkles size={13} aria-hidden="true" />
      {bt("생성형 AI 배경 영상", "AI-generated backdrop")}
    </span>
  );
}
