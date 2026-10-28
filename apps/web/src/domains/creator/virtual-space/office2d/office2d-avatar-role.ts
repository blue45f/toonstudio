/**
 * 로비에서 고른 캐릭터 → ToonOffice 2D 직군 시트.
 *
 * 로비 캐릭터 이름에는 직함이 들어 있다("누르 · 식자 담당", "테오 · 3D 아티스트", "민재 · 편집 PD"). 예전에는 아바타 번호를 시트 수로
 * 나눈 나머지로 골라 식자 담당을 골라도 사무실에서는 PD 모습으로 보였다. 직함으로 직군을 맞추고, 직함이 없는 캐릭터("하늘" 등)는
 * 스킨 키 해시로 고정 배정해 같은 캐릭터를 고른 사람은 언제나 같은 모습으로 보이게 한다.
 */
import { studioCharacterSkinForAvatarIndex } from "../studio-virtual-space-character-skins";
import { OFFICE2D_CHARACTERS, office2dCharacterForRoleText, office2dHashIndex, type Office2dCharacterKey } from "./office2d-sprite-catalog";

export function office2dCharacterForAvatarSkin(avatarIndex: number, identity: string): Office2dCharacterKey {
  const skin = studioCharacterSkinForAvatarIndex(avatarIndex, identity);
  return office2dCharacterForRoleText(`${skin.labelKo} ${skin.labelEn}`)
    ?? OFFICE2D_CHARACTERS[office2dHashIndex(skin.key, OFFICE2D_CHARACTERS.length)]
    ?? "artist";
}
