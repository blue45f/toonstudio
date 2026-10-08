import { ARCHITECTURE_DELIVERY_SECTIONS } from "./engineering-architecture-guide-delivery";
import { ARCHITECTURE_RUNTIME_SECTIONS } from "./engineering-architecture-guide-runtime";
import type { ArchitectureGuideSection } from "./engineering-architecture-guide-types";

/** 아키텍처 해설의 모든 구간(실행 구조 → 만들고 지키는 구조 순서). 화면·문서·테스트가 이 배열 하나를 쓴다. */
export const ARCHITECTURE_GUIDE_SECTIONS: readonly ArchitectureGuideSection[] = [
  ...ARCHITECTURE_RUNTIME_SECTIONS,
  ...ARCHITECTURE_DELIVERY_SECTIONS,
];
