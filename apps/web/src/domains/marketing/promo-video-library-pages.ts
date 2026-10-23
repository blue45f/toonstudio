/**
 * 홍보 영상 자료실의 페이지 카테고리 레지스트리 — 페이지 표면을 위해 만든
 * 클립 21편의 정본이다 (public/brand/page-clips/).
 *
 * promo-video-library.ts가 소스 파일 800줄 상한에 닿아 페이지 카테고리만
 * 이 파일로 분리했다. 전부 생성형 AI로 만든 개념 영상이고, 아직 표면에
 * 배선하지 않은 자료실 보관분이다. 홈 무드는 결함본을 교체한 v2가 정본이며
 * 계절 변형 4편(봄·여름·가을·겨울)과 세로 변형 8편을 함께 둔다.
 */
import type { PromoVideoItem } from "./promo-video-library";

/** promo-video-library.ts의 LIBRARY_ONLY와 같은 값 — 순환 import를 피하려고 이 파일에 따로 둔다. */
const LIBRARY_ONLY = { ko: "자료실 보관", en: "Library only" } as const;

const pageItem = (
  id: string,
  file: string,
  durationLabel: string,
  ko: { readonly title: string; readonly body: string },
  en: { readonly title: string; readonly body: string },
  note?: { readonly ko: string; readonly en: string },
  usage: { readonly ko: string; readonly en: string } = LIBRARY_ONLY,
): PromoVideoItem => ({
  id: `page-${id}`,
  categoryId: "pages",
  src: `/brand/page-clips/${file}`,
  width: 1344,
  height: 768,
  durationLabel,
  ko,
  en,
  usage,
  ...(note ? { note } : {}),
});

const PAGE_VERTICAL_USAGE = {
  ko: "자료실 보관 · 소셜/페이지 세로 소재",
  en: "Library only · Vertical material for social and pages",
} as const;

const pageVerticalItem = (
  id: string,
  file: string,
  durationLabel: string,
  ko: { readonly title: string; readonly body: string },
  en: { readonly title: string; readonly body: string },
): PromoVideoItem => ({
  id: `page-${id}`,
  categoryId: "pages",
  src: `/brand/page-clips/${file}`,
  width: 768,
  height: 1344,
  durationLabel,
  ko,
  en,
  usage: PAGE_VERTICAL_USAGE,
});

export const PROMO_VIDEO_PAGE_ITEMS: readonly PromoVideoItem[] = [
  pageItem(
    "about",
    "page-about.mp4",
    "0:14",
    { title: "서비스 소개 무드", body: "서비스를 소개하는 자리에 깔기 위해 만든 분위기 클립입니다." },
    { title: "About mood", body: "A mood clip made to sit behind the service introduction." },
  ),
  pageItem(
    "pricing",
    "page-pricing.mp4",
    "0:14",
    { title: "요금 안내 무드", body: "요금과 멤버십을 안내하는 자리에 깔기 위해 만든 분위기 클립입니다." },
    { title: "Pricing mood", body: "A mood clip made to sit behind pricing and membership." },
  ),
  pageItem(
    "workflow",
    "page-workflow.mp4",
    "0:14",
    { title: "제작 과정 무드", body: "제작 과정이 흘러가는 자리에 깔기 위해 만든 분위기 클립입니다." },
    { title: "Workflow mood", body: "A mood clip made to sit behind the production workflow." },
  ),
  pageItem(
    "ir",
    "page-ir.mp4",
    "0:15",
    { title: "IR 무드", body: "투자 소개 자리의 배경으로 쓰기 위해 만든 분위기 클립입니다." },
    { title: "IR mood", body: "A mood clip made as a backdrop for the investor brief." },
  ),
  pageItem(
    "start",
    "page-start.mp4",
    "0:14",
    { title: "시작하기 무드", body: "처음 시작하는 창작자를 맞는 자리에 깔기 위해 만든 분위기 클립입니다." },
    { title: "Getting-started mood", body: "A mood clip made to welcome creators who are just starting." },
  ),
  pageItem(
    "home-v2",
    "page-home-v2.mp4",
    "0:14",
    {
      title: "홈 무드",
      body: "창작 홈의 배경으로 쓰기 위해 만든 분위기 클립입니다. 달력 글자가 또렷하던 앞선 버전을 교체한 정본입니다.",
    },
    {
      title: "Home mood",
      body: "A mood clip made as a backdrop for the creator home — the canonical version, replacing the earlier take whose calendar text was too legible.",
    },
  ),
  pageItem(
    "home",
    "page-home.mp4",
    "0:14",
    { title: "홈 무드 · 이전 버전", body: "창작 홈 배경용으로 먼저 만들었던 버전입니다." },
    { title: "Home mood · Earlier version", body: "The first take made as a backdrop for the creator home." },
    {
      ko: "품질 메모: 달력 숫자와 'EPISODE' 글자가 또렷하게 보여, 위의 교체본(v2)으로 대체했습니다. 비교용으로만 남깁니다.",
      en: "Quality note: the calendar numbers and the word 'EPISODE' are clearly visible, so the v2 above supersedes this one. Kept for comparison only.",
    },
    { ko: "자료실 보관 · 대체됨", en: "Library only · Superseded" },
  ),
  pageItem(
    "help",
    "page-help.mp4",
    "0:14",
    { title: "도움말 무드", body: "도움말과 안내 자리에 깔기 위해 만든 분위기 클립입니다." },
    { title: "Help mood", body: "A mood clip made to sit behind help and guidance." },
  ),
  pageItem(
    "tour-stinger",
    "page-tour-stinger.mp4",
    "0:14",
    { title: "투어 스팅어", body: "짧게 분위기를 열고 닫는 스팅어 용도로 만든 클립입니다." },
    { title: "Tour stinger", body: "A short stinger clip for opening and closing on a mood." },
  ),
  pageItem(
    "season-spring",
    "season-spring.mp4",
    "0:14",
    {
      title: "계절 · 봄 스튜디오",
      body: "벚꽃잎이 창가로 흩날리는 봄의 작업실을 그린 계절 변형입니다. 이벤트·시즌 배너를 교체할 때 쓰는 소재로 보관합니다.",
    },
    {
      title: "Season · Spring studio",
      body: "Cherry blossom petals drifting past the window of a spring studio — a seasonal variant kept for swapping event and season banners.",
    },
  ),
  pageItem(
    "season-summer",
    "season-summer.mp4",
    "0:14",
    {
      title: "계절 · 여름 스튜디오",
      body: "여름 햇살이 가득 들어오는 작업실을 그린 계절 변형입니다. 이벤트·시즌 배너를 교체할 때 쓰는 소재로 보관합니다.",
    },
    {
      title: "Season · Summer studio",
      body: "A studio filled with summer sunlight — a seasonal variant kept for swapping event and season banners.",
    },
  ),
  pageItem(
    "season-autumn",
    "season-autumn.mp4",
    "0:14",
    {
      title: "계절 · 가을 스튜디오",
      body: "가을빛이 드는 작업실을 그린 계절 변형입니다. 이벤트·시즌 배너를 교체할 때 쓰는 소재로 보관합니다.",
    },
    {
      title: "Season · Autumn studio",
      body: "An autumn-lit studio — a seasonal variant kept for swapping event and season banners.",
    },
  ),
  pageItem(
    "season-winter",
    "season-winter.mp4",
    "0:14",
    {
      title: "계절 · 겨울 스튜디오",
      body: "눈 오는 창밖과 따뜻한 실내를 그린 계절 변형입니다. 이벤트·시즌 배너를 교체할 때 쓰는 소재로 보관합니다.",
    },
    {
      title: "Season · Winter studio",
      body: "Snow outside the window and warmth inside — a seasonal variant kept for swapping event and season banners.",
    },
  ),
  pageVerticalItem(
    "start-vertical",
    "page-start-vertical.mp4",
    "0:14",
    { title: "시작하기 무드 · 세로", body: "시작하기 가로본을 세로(9:16)로 다시 그린 변형입니다." },
    { title: "Getting-started mood · Vertical", body: "The getting-started clip redrawn vertically (9:16)." },
  ),
  pageVerticalItem(
    "tour-stinger-vertical",
    "tour-stinger-vertical.mp4",
    "0:15",
    { title: "투어 스팅어 · 세로", body: "투어 스팅어 가로본을 세로(9:16)로 다시 그린 변형입니다." },
    { title: "Tour stinger · Vertical", body: "The tour stinger redrawn vertically (9:16)." },
  ),
  pageVerticalItem(
    "about-vertical",
    "page-about-vertical.mp4",
    "0:14",
    { title: "서비스 소개 무드 · 세로", body: "서비스 소개 가로본을 세로(9:16)로 다시 그린 변형입니다." },
    { title: "About mood · Vertical", body: "The about clip redrawn vertically (9:16)." },
  ),
  pageVerticalItem(
    "help-vertical",
    "page-help-vertical.mp4",
    "0:14",
    { title: "도움말 무드 · 세로", body: "도움말 가로본을 세로(9:16)로 다시 그린 변형입니다." },
    { title: "Help mood · Vertical", body: "The help clip redrawn vertically (9:16)." },
  ),
  pageVerticalItem(
    "tour-outro-vertical",
    "tour-outro-vertical.mp4",
    "0:14",
    { title: "투어 마무리 · 세로", body: "제품 투어의 마무리 장면을 세로(9:16)로 다시 그린 변형입니다." },
    { title: "Tour closing · Vertical", body: "The product tour's closing scene redrawn vertically (9:16)." },
  ),
  pageVerticalItem(
    "pricing-vertical",
    "page-pricing-vertical.mp4",
    "0:14",
    { title: "요금 안내 무드 · 세로", body: "요금 안내 가로본을 세로(9:16)로 다시 그린 변형입니다." },
    { title: "Pricing mood · Vertical", body: "The pricing clip redrawn vertically (9:16)." },
  ),
  pageVerticalItem(
    "workflow-vertical",
    "page-workflow-vertical.mp4",
    "0:14",
    { title: "제작 과정 무드 · 세로", body: "제작 과정 가로본을 세로(9:16)로 다시 그린 변형입니다." },
    { title: "Workflow mood · Vertical", body: "The workflow clip redrawn vertically (9:16)." },
  ),
  pageVerticalItem(
    "ir-vertical",
    "page-ir-vertical.mp4",
    "0:14",
    { title: "IR 무드 · 세로", body: "IR 가로본을 세로(9:16)로 다시 그린 변형입니다." },
    { title: "IR mood · Vertical", body: "The IR clip redrawn vertically (9:16)." },
  ),
];
