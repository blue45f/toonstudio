/**
 * 썸네일 임시 리그 전용 레이어 마스크. 메인 카메라(기본 0x0fffffff)가 그리지 않으므로 캡처 중 비동기 구간에도
 * 뷰포트에 임시 리그가 보이지 않는다. 캡처 RTT는 `renderList`를 쓰므로 레이어 마스크를 검사하지 않는다.
 */
export const THUMBNAIL_LAYER_MASK = 0x10000000;

/** 얼굴 SDF 임계 맵 해상도 */
export const FACE_SDF_SIZE = 128;
/** 툰 외곽선(hull) 폭(월드 단위, m) */
export const TOON_OUTLINE_WIDTH = 0.004;
/** 엣지 외곽선 각도 임계(cos) */
export const TOON_EDGE_EPSILON = 0.95;

