/**
 * 통합 API 키 허브가 스톡 사진(Unsplash) BYOK 키 저장소와 연결 테스트 함수를
 * 사용할 때 거치는 명시적 공개 경계.
 */
export {
  isStudioStockImageConfigured,
  loadStudioStockImageAccessKey,
  saveStudioStockImageAccessKey,
  searchStockPhotos,
  STUDIO_STOCK_IMAGE_DEVELOPER_SIGNUP_URL,
} from "../studio-stock-image-client";
