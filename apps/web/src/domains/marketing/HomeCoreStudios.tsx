import { ArrowRight, Boxes, Brush, ChevronRight, Map as MapIcon, Users, type LucideIcon } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

import { HOME_CORE_STUDIOS, type HomeCoreStudioId } from "./reference-home-content";

const ICONS: Readonly<Record<HomeCoreStudioId, LucideIcon>> = {
  drawing: Brush,
  "three-d": Boxes,
  collaboration: Users,
  "virtual-studio": MapIcon,
};

/**
 * 드로잉·3D·협업·가상 스튜디오를 홈에서 바로 여는 입구.
 *
 * 카드마다 꽉 찬 주 버튼을 두지 않는다(한 화면에 주 행동이 넷이면 아무것도 주 행동이 아니다).
 * 카드 전체가 목적지를 설명하고, 행동은 화살표가 달린 글자 링크 하나와 보조 링크 하나다.
 * 장면 그림은 스크롤에 맞춰 칸이 열리듯 자리를 잡는다(ink-motion: zoom).
 */
export function HomeCoreStudios() {
  const bi = useBilingualLocalizer("domains.marketing.HomeCoreStudios");
  return (
    <section className="rd-core-studios" aria-labelledby="rd-core-studios-title">
      <div className="rd-core-heading">
        <h2 id="rd-core-studios-title" data-ink="line">{bi("핵심 작업실, 바로 들어가기", "Jump into the core studios")}</h2>
        <p>{bi("그리기, 3D, 팀 제작, 가상 스튜디오", "Drawing, 3D, team production and the virtual studio")}</p>
      </div>
      <ul className="rd-core-grid" data-ink-stagger="panel">
        {HOME_CORE_STUDIOS.map((studio) => {
          const Icon = ICONS[studio.id];
          const copy = bi(studio.ko, studio.en);
          return (
            <li key={studio.id} className="rd-core-card ink-frame" data-core-studio={studio.id}>
              <div className="rd-core-media ink-cover" data-ink="zoom">
                <img src={studio.image} srcSet={studio.imageSet} sizes="(max-width: 599px) 90vw, 25vw" alt="" width={640} height={400} loading="lazy" decoding="async" />
              </div>
              <div className="rd-core-copy">
                <h3><Icon size={16} strokeWidth={1.5} aria-hidden="true" />{copy.title}</h3>
                <p>{copy.body}</p>
                <div className="rd-core-actions">
                  <Link href={studio.href} className="rd-core-primary ink-arrow">{copy.action}<ArrowRight size={15} strokeWidth={1.5} aria-hidden="true" /></Link>
                  <Link href={studio.secondary.href} className="rd-core-secondary ink-arrow">{bi(studio.secondary.ko, studio.secondary.en)}<ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" /></Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
