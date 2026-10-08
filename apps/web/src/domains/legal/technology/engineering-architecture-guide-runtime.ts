import { ARCHITECTURE_RUNTIME_SECTIONS_A } from "./engineering-architecture-guide-runtime-a";
import { ARCHITECTURE_RUNTIME_SECTIONS_B } from "./engineering-architecture-guide-runtime-b";
import { ARCHITECTURE_RUNTIME_SECTIONS_C } from "./engineering-architecture-guide-runtime-c";
import type { ArchitectureGuideSection } from "./engineering-architecture-guide-types";

/**
 * 아키텍처 해설 · 앱이 돌아가는 구조(실행 구조) 구간들.
 * 번호는 1부터, 이어지는 `engineering-architecture-guide-delivery.ts` 의 구간이 그 뒤 번호를 잇는다.
 * 한 파일을 600줄 안에 두려고 구간을 `-runtime-a`(1·2) `-runtime-b`(3·4) `-runtime-c`(5·6·7)로 나눠 이 배열이 펼쳐 담는다.
 */
export const ARCHITECTURE_RUNTIME_SECTIONS: readonly ArchitectureGuideSection[] = [
  ...ARCHITECTURE_RUNTIME_SECTIONS_A,
  ...ARCHITECTURE_RUNTIME_SECTIONS_B,
  ...ARCHITECTURE_RUNTIME_SECTIONS_C,
];
