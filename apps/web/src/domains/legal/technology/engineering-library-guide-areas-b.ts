import { LIBRARY_AREA_AI_ON_DEVICE } from "./engineering-library-guide-areas-b-ai";
import { LIBRARY_AREA_BUILD_QUALITY_MEDIA } from "./engineering-library-guide-areas-b-build";
import { LIBRARY_AREA_SERVER_DATA } from "./engineering-library-guide-areas-b-server";
import { LIBRARY_AREA_LOCAL_STORAGE_PWA } from "./engineering-library-guide-areas-b-storage";
import type { LibraryGuideArea } from "./engineering-library-guide-types";

/**
 * 라이브러리 해설 · 영역 5~8(내 기기에 저장하기 · 기기 안의 AI · 서버와 데이터 · 만들고 검사하고 내보내기).
 * 번호는 영역 4의 다음(5)부터 잇는다. 영역마다 파일을 나눠(`engineering-library-guide-areas-b-*.ts`) 한 파일이 600줄을 넘지 않게 한다.
 */
export const LIBRARY_GUIDE_AREAS_B: readonly LibraryGuideArea[] = [
  LIBRARY_AREA_LOCAL_STORAGE_PWA,
  LIBRARY_AREA_AI_ON_DEVICE,
  LIBRARY_AREA_SERVER_DATA,
  LIBRARY_AREA_BUILD_QUALITY_MEDIA,
];
