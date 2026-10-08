import { LIBRARY_AREA_BRUSH_ENGINES } from "./engineering-library-guide-areas-a-brush";
import { LIBRARY_AREA_VRM_3D } from "./engineering-library-guide-areas-a-3d";
import { LIBRARY_AREA_CANVAS_2D } from "./engineering-library-guide-areas-a-canvas";
import { LIBRARY_AREA_COLLAB_REALTIME } from "./engineering-library-guide-areas-a-collab";
import type { LibraryGuideArea } from "./engineering-library-guide-types";

/**
 * 라이브러리 해설 · 영역 1~4(브러시 엔진 · VRM·3D·캐릭터 · 2D 편집·가상 스튜디오 · 협업·실시간).
 * 번호는 1부터, `engineering-library-guide-areas-b.ts` 의 영역이 그 뒤 번호를 잇는다.
 * 영역마다 파일을 나눠(`engineering-library-guide-areas-a-*.ts`) 한 파일이 600줄을 넘지 않게 한다.
 */
export const LIBRARY_GUIDE_AREAS_A: readonly LibraryGuideArea[] = [
  LIBRARY_AREA_BRUSH_ENGINES,
  LIBRARY_AREA_VRM_3D,
  LIBRARY_AREA_CANVAS_2D,
  LIBRARY_AREA_COLLAB_REALTIME,
];
