/**
 * §15.3 Filter 그룹 커버리지.
 *
 * Help 그룹처럼 자기 모듈로 나눴다. Filter 메뉴는 필터 레지스트리에서 종류마다 행을 만들기 때문에
 * 이 그룹의 귀속 목록은 §15.3 명세가 아니라 필터 카탈로그를 따라 자란다(60269e38 은 한 번에 9행을
 * 더했다). 공유 표에 그대로 두면 선언 파일이 자신을 지키는 줄 예산을 넘는다. creator 루트는 파일 수
 * 예산(config/architecture-source-ratchet.json)에 닿아 있어, 필터 메뉴 분류 모듈 옆인 filter/ 에 둔다.
 *
 * 순수 선언만 둔다 — React·브라우저·페이지 상태 없음.
 */
import { gap, has, ours, part } from "../studio-main-menu-group-spec-model";

import type { StudioMenuGroupSpec } from "../studio-main-menu-group-spec-model";

export const STUDIO_MENU_FILTER_GROUP_SPEC: StudioMenuGroupSpec = {
  id: "filter",
  labelKo: "필터",
  specName: "Filter",
  inV5Spec: true,
  rows: [
    part("Adjustment Layer", "레벨·톤 커브만 레이어 파라미터라 비파괴다. 보정 레이어 개체는 없고 나머지 58개 필터는 파괴적이다.", "filter/levels", "filter/tone-curve"),
    has(
      "Color/Blur/Sharpen",
      "filter/gaussian-blur",
      "filter/motion-blur",
      "filter/hue-saturation-brightness",
      "filter/brightness-contrast",
      "filter/color-curves",
      "filter/radial-blur",
      "filter/zoom-blur",
      "filter/surface-blur",
      "filter/lens-blur",
      "filter/field-iris-blur",
      "filter/tilt-shift-blur",
      "filter/selective-gaussian-blur",
      "filter/tileable-blur",
      "filter/sharp-strong",
      "filter/solarize",
      "filter/threshold",
      "filter/color-to-alpha",
      "filter/duotone",
      "filter/film-camera-style",
    ),
    part(
      "Distort/Liquify",
      "웨이브·리플·어안·트월·핀치/블로트·렌즈 왜곡·극좌표·구면화·지그재그·파노라마까지 기하 왜곡 10종이 메뉴에 있다. 리퀴파이(브러시로 미는 대화형 왜곡)만 툴레일 도구로 남아 있다.",
      "filter/glitch",
      "filter/chromatic-aberration",
      "filter/wave-warp",
      "filter/ripple-warp",
      "filter/fisheye",
      "filter/twirl",
      "filter/pinch-bloat",
      "filter/lens-distortion",
      "filter/polar-coordinates",
      "filter/sphere-warp",
      "filter/zigzag-warp",
      "filter/panorama-warp",
    ),
    has(
      "Line/Tone/Webtoon",
      "filter/line-cleanup",
      "filter/screentone-removal",
      "filter/difference-of-gaussians",
      "filter/smoothing",
      "filter/line-width-correct",
      "filter/photocopy",
      "filter/poster-edges",
    ),
    has(
      "Texture/Style",
      "filter/mosaic",
      "filter/emboss",
      "filter/oil-paint",
      "filter/scanline",
      "filter/vignette",
      "filter/lens-flare",
      "filter/noise-add",
      "filter/film-grain-pro",
      "filter/salt-pepper",
      "filter/rgb-noise",
      "filter/perlin-texture",
      "filter/pointillize",
      "filter/stained-glass",
      "filter/flow-based-abstraction",
      "filter/pencil-art",
    ),
    part(
      "Depth/Normal Effects",
      "휘도에서 노멀 맵을 굽고 광원 기준 볼류메트릭 광선을 낸다. 깊이 맵 입력이나 재조명(relight)은 없다.",
      "filter/normal-map",
      "filter/god-rays",
    ),
    gap("Filter Gallery"),
    gap("EffectGraph Editor"),
    gap("Bake/Proxy"),
  ],
  extras: [
    ours("filter/last-filter", "마지막 필터 다시 열기 — §15.3 Edit 의 ‘명령 반복’에 가까운 필터 전용판."),
    ours("filter/jpeg-artifact-reduction", "복원 계열 — §15.3 행이 없다."),
    ours("filter/edge-aware-denoise", "복원 계열."),
    ours("filter/dust-scratches", "복원 계열."),
  ],
};
