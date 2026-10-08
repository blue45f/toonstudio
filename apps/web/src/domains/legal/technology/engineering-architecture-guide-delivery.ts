import { ARCHITECTURE_DELIVERY_ALIGN_SECTIONS } from "./engineering-architecture-guide-delivery-align";
import { ARCHITECTURE_DELIVERY_GUARD_SECTIONS } from "./engineering-architecture-guide-delivery-guard";
import { ARCHITECTURE_DELIVERY_LAYOUT_SECTIONS } from "./engineering-architecture-guide-delivery-layout";

import type { ArchitectureGuideSection } from "./engineering-architecture-guide-types";

/**
 * 아키텍처 해설 · 만들고 지키는 구조(코드 구성·빌드·배포·품질) 구간들.
 * 번호는 실행 구조 구간의 마지막 번호 다음부터 이어 붙인다(8~12).
 * 구간 본문은 한 파일 600줄 이하로 나눠 두고 여기서 순서대로 펼친다.
 */
export const ARCHITECTURE_DELIVERY_SECTIONS: readonly ArchitectureGuideSection[] = [
  ...ARCHITECTURE_DELIVERY_LAYOUT_SECTIONS,
  ...ARCHITECTURE_DELIVERY_ALIGN_SECTIONS,
  ...ARCHITECTURE_DELIVERY_GUARD_SECTIONS,
];
