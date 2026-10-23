/**
 * 2인 포즈 카드 썸네일(B-14) — 1인 실루엣과 구분되게 두 인물을 마주 보게 그리고 "2인" 배지를 단다.
 *
 * 실루엣은 측면(왼쪽이 정면) 스틱 피규어라, 주인공은 오른쪽에 두고 좌우를 뒤집은 상대를 왼쪽에
 * 두면 두 인물이 서로를 향한다. 상대 사본은 장식이라 화면 읽기에서 숨기고, 이름은 원본 실루엣의
 * aria-label 하나만 읽힌다. 이미지 에셋 없는 SVG 조합이라 다크/라이트·모바일에서 그대로 동작한다.
 */

import { Users } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import "./studio-mannequin-duo-i18n";

import { useT } from "@/shared/lib/i18n";

export function StudioPoseDuoThumbnail({
  children,
}: {
  /** 1인 실루엣(SVG). 같은 노드를 상대 자리에 좌우 반전해 한 번 더 그린다. */
  readonly children: ReactNode;
}): ReactElement {
  const t = useT();
  return (
    <div data-studio-pose-duo-thumbnail="true" className="relative flex h-16 w-full items-end justify-center">
      <div aria-hidden className="h-full w-1/2 -scale-x-100 opacity-60 [&>svg]:h-full [&>svg]:w-full">
        {children}
      </div>
      <div className="-ml-2 h-full w-1/2 [&>svg]:h-full [&>svg]:w-full">{children}</div>
      <span
        aria-hidden
        className="absolute bottom-0 right-0.5 inline-flex items-center gap-0.5 rounded-full bg-accent-soft px-1 text-[0.55rem] font-bold text-accent"
      >
        <Users size={9} />
        {t("studio.mannequinDuo.badge", "2인")}
      </span>
    </div>
  );
}
