import { PROMOTION_KINDS, PROMOTION_STAGES } from "../../../../../packages/core/src/promotion";

/** 홍보 유형·단계·장르의 영어 표시 라벨. 보드와 카드가 같은 표기를 쓰도록 한곳에 둔다. */
export const KIND_EN: Record<keyof typeof PROMOTION_KINDS, string> = {
  series: "Series · new work",
  trailer: "Promo video",
  process: "Work in progress",
  feedback: "Feedback request",
};
export const STAGE_EN: Record<keyof typeof PROMOTION_STAGES, string> = {
  amateur: "Amateur",
  debut: "Debut · new work",
  serializing: "Serializing creator",
};
export const GENRE_EN: Record<string, string> = {
  "판타지": "Fantasy",
  "로맨스": "Romance",
  "드라마": "Drama",
  "액션": "Action",
  "일상": "Slice of life",
  "코미디": "Comedy",
  "스릴러": "Thriller",
  "SF": "Sci-fi",
  "무협": "Martial arts",
  "기타": "Other",
};
