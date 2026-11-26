/** 배포된 키트 판별과 각 판의 정본 파일명. */
export const KIT_DEFAULT_ID = "toonstudio-kit-v1" as const;
export const KIT_ASSET_ROOT = "/assets/characters/toonstudio-kit-v1" as const;
export const KIT_MANIFEST_FILENAME = "kit.json" as const;
/** 키트 `kitVersion`. 이름·구조가 호환되지 않게 바뀌면 올리고 레시피 `source.kitVersion`과 맞춘다(불일치는 `kit-version-mismatch`). */
export const KIT_CURRENT_VERSION = 1 as const;
/** 얼굴과 표정 리그를 다듬은 2판. */
export const KIT_PORTRAIT_VERSION = 2 as const;
/** 옆머리를 넘긴 3판. 구판 레시피는 각 판의 원본을 읽는다. */
export const KIT_SWEPT_HAIR_VERSION = 3 as const;

export function kitManifestFilename(kitId: string, version: number): string {
  if (kitId === KIT_DEFAULT_ID && version === KIT_SWEPT_HAIR_VERSION) return "kit-swept.json";
  return kitId === KIT_DEFAULT_ID && version === KIT_PORTRAIT_VERSION ? "kit-portrait.json" : KIT_MANIFEST_FILENAME;
}
