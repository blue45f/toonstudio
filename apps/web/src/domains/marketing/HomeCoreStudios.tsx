import { ArrowRight, Boxes, Brush, ChevronRight, Map as MapIcon, Users, type LucideIcon } from "lucide-react";

import { useReducedMotionPreference } from "@/shared/ambient/useAmbientExperience";
import Link from "@/shared/navigation/router-link";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

import { HOME_CORE_STUDIO_3D_BACKDROP_CLIP } from "./brand-clips";
import { HOME_CORE_STUDIOS, type HomeCoreStudioId } from "./reference-home-content";

const ICONS: Readonly<Record<HomeCoreStudioId, LucideIcon>> = {
  drawing: Brush,
  "three-d": Boxes,
  collaboration: Users,
  "virtual-studio": MapIcon,
};

/** 드로잉·3D·협업·가상 스튜디오를 홈 첫 화면 가까이에서 바로 여는 입구. */
export function HomeCoreStudios() {
  const bi = useBilingualLocalizer("domains.marketing.HomeCoreStudios");
  const reducedMotion = useReducedMotionPreference();
  return (
    <section className="rd-core-studios" aria-labelledby="rd-core-studios-title">
      <div className="rd-core-heading">
        <h2 id="rd-core-studios-title">{bi("핵심 작업실, 바로 들어가기", "Jump into the core studios")}</h2>
        <p>{bi("그리기·3D·협업·가상 스튜디오를 한곳에 모았습니다.", "Drawing, 3D, team production and the virtual studio in one place.")}</p>
      </div>
      <ul className="rd-core-grid">
        {HOME_CORE_STUDIOS.map((studio) => {
          const Icon = ICONS[studio.id];
          const copy = bi(studio.ko, studio.en);
          // 3D 카드에만 배경 클립을 깐다 — 3D 카페 거리를 비행하는 생성형 AI
          // 영상으로, 카드 이미지(콘셉트 아트)와는 별개의 장식 배경이다.
          const backdrop = studio.id === HOME_CORE_STUDIO_3D_BACKDROP_CLIP.studioId
            ? HOME_CORE_STUDIO_3D_BACKDROP_CLIP
            : null;
          return (
            <li key={studio.id} className="rd-core-card" data-core-studio={studio.id}>
              {/* 움직임 최소화를 선호하면 영상 요소를 만들지 않는다 — CSS 로 숨기기만 하면 <video> 와 내려받기가 남는다. */}
              {backdrop && !reducedMotion ? (
                <div className="rd-core-card-media" aria-hidden="true">
                  <video
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    tabIndex={-1}
                    src={backdrop.src}
                    width={backdrop.width}
                    height={backdrop.height}
                  />
                </div>
              ) : null}
              <img src={studio.image} srcSet={studio.imageSet} sizes="(max-width: 599px) 90vw, 25vw" alt="" width={640} height={400} loading="lazy" decoding="async" />
              <div className="rd-core-copy">
                <span className="rd-core-eyebrow"><Icon size={14} aria-hidden="true" />{studio.eyebrow}</span>
                <h3>{copy.title}</h3>
                <p>{copy.body}</p>
                <Link href={studio.href} className="rd-core-primary">{copy.action}<ArrowRight size={15} aria-hidden="true" /></Link>
                <Link href={studio.secondary.href} className="rd-core-secondary">{bi(studio.secondary.ko, studio.secondary.en)}<ChevronRight size={14} aria-hidden="true" /></Link>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="rd-core-note">{bi("3D 작업실 카드 본문 뒤로 흐르는 영상은 3D 배경 거리를 그린 생성형 AI 장식 배경입니다. 카드 위 이미지는 콘셉트 아트입니다.", "The video flowing behind the 3D studio card's text is an AI-generated decorative backdrop of a 3D set street. The card image itself is concept art.")}</p>
    </section>
  );
}
