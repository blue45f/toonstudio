/**
 * 제품 투어 페이지 하단의 세로 쇼츠 4편.
 * 네 편 모두 생성형 AI로 만든 개념 영상이라 실제 제품 화면 캡처가 아니다.
 * 화면에서도 그 성격을 밝힌다(섹션 안내 문구와 카드의 '개념 영상' 배지).
 */
export interface ProductTourShort {
  readonly id: "drawing-autocolor" | "bg3d-collab" | "serial-deadline" | "shaper-3d";
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly durationLabel: string;
  readonly ko: { readonly title: string; readonly body: string };
  readonly en: { readonly title: string; readonly body: string };
}

export const PRODUCT_TOUR_SHORTS: readonly ProductTourShort[] = [
  {
    id: "drawing-autocolor",
    src: "/brand/promo-shorts/shorts-1-drawing-autocolor.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:29",
    ko: {
      title: "그리고, 색까지",
      body: "펜으로 선을 긋는 순간부터 AI 자동 채색으로 컷이 완성되는 흐름을 담았습니다.",
    },
    en: {
      title: "From line to color",
      body: "From the first pen stroke to a finished panel with AI auto-coloring.",
    },
  },
  {
    id: "bg3d-collab",
    src: "/brand/promo-shorts/shorts-2-bg3d-collab.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:29",
    ko: {
      title: "3D 배경과 함께 만드는 협업",
      body: "3D로 구도를 잡은 배경 위에 여러 창작자가 함께 컷을 다듬는 모습을 그렸습니다.",
    },
    en: {
      title: "3D backgrounds, made together",
      body: "A scene composed in 3D, refined by several creators working on the same panel.",
    },
  },
  {
    id: "serial-deadline",
    src: "/brand/promo-shorts/shorts-3-serial-deadline.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:29",
    ko: {
      title: "연재와 마감, 놓치지 않게",
      body: "에피소드 캘린더에 마감을 채우고 스토리보드를 쌓아 가며 연재를 이어 가는 흐름을 담았습니다.",
    },
    en: {
      title: "Deadlines on the calendar",
      body: "Filling the episode calendar and stacking storyboards to keep a series on schedule.",
    },
  },
  {
    id: "shaper-3d",
    src: "/brand/promo-shorts/shorts-4-shaper.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:29",
    ko: {
      title: "포즈는 3D로 잡는다",
      body: "턴테이블 위 3D 캐릭터 마네킹의 포즈를 바꿔 가며 컷의 구도를 잡는 모습을 그렸습니다.",
    },
    en: {
      title: "Posing in 3D first",
      body: "A 3D character mannequin on a turntable, shifting poses to lock in each panel's composition.",
    },
  },
];
