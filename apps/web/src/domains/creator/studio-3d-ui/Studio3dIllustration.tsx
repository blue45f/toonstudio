import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import "./studio-3d-illustrated-chrome.css";

const ART_BASE = "/brand/illustrated-20260928";
// 모바일(390px DPR 3)·태블릿(820px DPR 2)·데스크톱 Retina(DPR 2) 전 구간에서
// HTML srcSet 밀도 보정(naturalWidth = sizes)이 표시 픽셀×DPR 2 기준 아래로 떨어지지 않도록
// 좁은 휴대폰은 380px, 태블릿·데스크톱은 640px 슬롯을 선언해 4:5 정본(320·640·960w)과 매칭한다.
const PORTRAIT_SIZES = "(max-width: 479px) 380px, 640px";

function Portrait({ name }: { readonly name: "character-pink" | "character-blue" }) {
  return (
    <img
      src={`${ART_BASE}/${name}.webp`}
      srcSet={`${ART_BASE}/${name}-320.webp 320w, ${ART_BASE}/${name}-640.webp 640w, ${ART_BASE}/${name}-960.webp 960w`}
      sizes={PORTRAIT_SIZES}
      alt=""
      width={960}
      height={1200}
      loading="lazy"
      decoding="async"
    />
  );
}

/**
 * 안내용 아트는 실제 사용자 모델·렌더 결과와 구분해 표시한다.
 * `compact`는 항상 낮은 비율, `responsiveCompact`는 휴대폰 폭에서만 낮은 비율을 쓴다(첫 화면 높이 절약).
 */
export function Studio3dIllustration({
  compact = false,
  responsiveCompact = false,
}: {
  readonly compact?: boolean;
  readonly responsiveCompact?: boolean;
}) {
  const bt = useBilingual("Studio3dIllustration");
  return (
    <figure
      className="studio-3d-illustration"
      data-compact={compact || undefined}
      data-responsive-compact={responsiveCompact || undefined}
    >
      <div className="studio-3d-illustration__portraits" aria-hidden="true">
        <Portrait name="character-pink" />
        <Portrait name="character-blue" />
      </div>
      <figcaption>
        <span>CHARACTER STUDIO</span>
        <strong>{bt("캐릭터의 첫 장면을 준비하세요", "Prepare your character’s first scene")}</strong>
        <small>{bt("창작 영감을 위한 예시 일러스트", "Illustrations for creative inspiration")}</small>
      </figcaption>
    </figure>
  );
}
