/**
 * 6종 웹툰 장르 통합 카탈로그 진입점.
 */

import { FANTASY_MURIM_GENRE_PACKS } from "./genre-packs-fantasy-murim";
import { NOIR_COMEDY_THRILLER_GENRE_PACKS } from "./genre-packs-noir-comedy-thriller";
import type { WebtoonGenreSpec } from "./idea-to-episode-catalog-shared";
import type { WebtoonGenreId } from "./idea-to-episode-types";

export {
  IDEA_PROMPT_PRESETS,
  SPEECH_REGISTER_LABELS,
  STORY_ACT_LABELS,
  TIME_OF_DAY_LABELS,
  type GenreBg3dPreset,
  type GenreCharacterSeed,
  type GenreOstProfile,
  type WebtoonGenreSpec,
} from "./idea-to-episode-catalog-shared";

export const WEBTOON_GENRE_CATALOG: Readonly<Record<WebtoonGenreId, WebtoonGenreSpec>> = {
  ...FANTASY_MURIM_GENRE_PACKS,
  ...NOIR_COMEDY_THRILLER_GENRE_PACKS,
};
