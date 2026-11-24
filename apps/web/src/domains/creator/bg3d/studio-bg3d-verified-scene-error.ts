export const VERIFIED_SCENE_ERRORS = {
  size: "선택한 파일의 크기가 검증한 모델과 다릅니다.",
  hash: "선택한 파일의 SHA-256이 검증한 모델과 다릅니다.",
  missing: "이 기기에 연결된 모델이 없습니다. 아래에서 GLB 파일을 선택하세요.",
  credit: "기기 모델의 이용 권리 기록에 다음 출처 표기가 필요합니다.",
  integrity: "기기 모델의 해시나 크기가 검증 장면과 일치하지 않습니다.",
} as const;

export class VerifiedSceneLinkError extends Error {
  constructor(readonly code: keyof typeof VERIFIED_SCENE_ERRORS, readonly credit?: string) {
    super(VERIFIED_SCENE_ERRORS[code]);
  }
}
