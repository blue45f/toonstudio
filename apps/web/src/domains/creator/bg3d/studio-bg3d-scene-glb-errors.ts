export type StudioBg3dSceneGlbGraphErrorCode = "aborted" | "invalid-document" | "model-unavailable" | "asset-mismatch"
  | "texture-unavailable" | "paint-unavailable" | "animation-unavailable" | "unsupported-feature" | "build-failed";
const MESSAGES: Readonly<Record<StudioBg3dSceneGlbGraphErrorCode, string>> = {
  aborted: "현재 표시 장면 GLB 생성을 취소했습니다.",
  "invalid-document": "현재 장면을 손실 없는 정본으로 확인하지 못했습니다.",
  "model-unavailable": "표시 중인 모델 원본을 준비하지 못했습니다.",
  "asset-mismatch": "모델 원본 파일과 장면의 해시·바이트 정보가 다릅니다.",
  "texture-unavailable": "장면의 텍스처가 준비되지 않았거나 GLB에 보존할 수 없는 형식입니다.",
  "paint-unavailable": "현재 표면 페인트를 같은 색과 해상도로 만들지 못했습니다.",
  "animation-unavailable": "현재 관절·표정·애니메이션을 같은 상태로 보존하지 못했습니다.",
  "unsupported-feature": "표시 중인 장면에 아직 GLB로 재현하지 못하는 기능이 있습니다.",
  "build-failed": "현재 표시 장면의 독립 GLB 그래프를 만들지 못했습니다.",
};
export class StudioBg3dSceneGlbGraphError extends Error {
  constructor(readonly code: StudioBg3dSceneGlbGraphErrorCode, readonly nodeIds: readonly string[] = [], readonly reason?: string) { super(MESSAGES[code]); }
}
export function assertSceneGlbActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new StudioBg3dSceneGlbGraphError("aborted");
}
