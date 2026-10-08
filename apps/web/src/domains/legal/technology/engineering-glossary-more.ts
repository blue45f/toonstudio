import { GLOSSARY_MORE_AI } from "./engineering-glossary-more-ai";
import { GLOSSARY_MORE_BRUSH } from "./engineering-glossary-more-brush";
import { GLOSSARY_MORE_BUILD } from "./engineering-glossary-more-build";
import { GLOSSARY_MORE_COLLAB } from "./engineering-glossary-more-collab";
import { GLOSSARY_MORE_CRAFT } from "./engineering-glossary-more-craft";
import { GLOSSARY_MORE_DATA } from "./engineering-glossary-more-data";
import { GLOSSARY_MORE_INPUT } from "./engineering-glossary-more-input";
import { GLOSSARY_MORE_OSS } from "./engineering-glossary-more-oss";
import { GLOSSARY_MORE_SPATIAL } from "./engineering-glossary-more-spatial";
import { GLOSSARY_MORE_WEB } from "./engineering-glossary-more-web";

import type { GlossaryTerm } from "./engineering-glossary-content";

/**
 * 확장 용어집. 기존 40개 용어(engineering-glossary-content.ts 의 BASE_GLOSSARY)에 이어 발표에 나올 만한 기술 용어를
 * 분야별로 덧붙인다. 규칙은 기존과 같다: 정의는 한 줄, 비유는 일상 사물, "툰스튜디오에서는"은 코드로 확인한 것만.
 * 분야별 본문은 engineering-glossary-more-*.ts 에 나눠 두고 여기서 한 목록으로 합친다.
 */
export const ENGINEERING_GLOSSARY_MORE: readonly GlossaryTerm[] = [
  ...GLOSSARY_MORE_BRUSH,
  ...GLOSSARY_MORE_WEB,
  ...GLOSSARY_MORE_SPATIAL,
  ...GLOSSARY_MORE_COLLAB,
  ...GLOSSARY_MORE_INPUT,
  ...GLOSSARY_MORE_AI,
  ...GLOSSARY_MORE_DATA,
  ...GLOSSARY_MORE_OSS,
  ...GLOSSARY_MORE_CRAFT,
  ...GLOSSARY_MORE_BUILD,
];
