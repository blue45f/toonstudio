/** 배포된 키트 판별과 각 판의 정본 파일명. */
export const KIT_DEFAULT_ID = "toonstudio-kit-v1" as const;
export const KIT_ASSET_ROOT = "/assets/characters/toonstudio-kit-v1" as const;
export const KIT_MANIFEST_FILENAME = "kit.json" as const;
/** 키트 `kitVersion`. 이름·구조가 호환되지 않게 바뀌면 올리고 레시피 `source.kitVersion`과 맞춘다(불일치는 `kit-version-mismatch`). */
export const KIT_CURRENT_VERSION = 1 as const;
/** 신규 인물 키트. 저장한 1판 레시피는 기존 원장을 계속 조회한다. */
export const KIT_PORTRAIT_VERSION = 2 as const;

export function kitManifestFilename(kitId: string, version: number): string {
  return kitId === KIT_DEFAULT_ID && version === KIT_PORTRAIT_VERSION ? "kit-portrait.json" : KIT_MANIFEST_FILENAME;
}
