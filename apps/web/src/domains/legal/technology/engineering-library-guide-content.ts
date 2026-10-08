import { LIBRARY_GUIDE_AREAS_A } from "./engineering-library-guide-areas-a";
import { LIBRARY_GUIDE_AREAS_B } from "./engineering-library-guide-areas-b";
import type { LibraryGuideArea } from "./engineering-library-guide-types";

/** 라이브러리 해설의 모든 영역(번호 순서). 화면·문서·테스트가 이 배열 하나를 쓴다. */
export const LIBRARY_GUIDE_AREAS: readonly LibraryGuideArea[] = [...LIBRARY_GUIDE_AREAS_A, ...LIBRARY_GUIDE_AREAS_B];
