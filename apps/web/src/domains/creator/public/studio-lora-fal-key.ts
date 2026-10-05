/**
 * 창작 도메인의 공개 경계 — 통합 API 키 허브가 fal.ai BYOK 키 보관 함수를
 * 가져다 쓰는 유일한 진입점. 도메인 내부 파일로의 deep import는 아키텍처
 * 래칫이 금지한다.
 *
 * 키 원문은 이 경계를 넘어도 화면·로그에 남기지 않는 것이 호출부의 책임이다
 * (마스킹 표시는 키 허브의 maskApiKey가 담당).
 */
export {
  STUDIO_FAL_API_KEY_STORAGE_KEY,
  STUDIO_FAL_API_KEYS_URL,
  browserStudioFalSessionStorage,
  isStudioFalConfigured,
  loadStudioFalApiKey,
  saveStudioFalApiKey,
} from "../ai/studio-lora-fal";
export type { StudioFalKeyStorage } from "../ai/studio-lora-fal";
