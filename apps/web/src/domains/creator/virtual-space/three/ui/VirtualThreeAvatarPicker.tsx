import { useState, type KeyboardEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { isBundledVrmUrlRightsBlocked, SAMPLE_VRMS } from "../../../vrm/vrm-library";
import { isStudioVrmTechnicallyAdmittedThumbnail } from "../../../vrm/studio-vrm-thumbnail-technical-denylist.generated";
import { isStudioVrmProductionThumbnailUrl } from "../../../vrm/studio-vrm-thumbnail-quality";
import { isVerifiedStudioThreeVrmUrl, resolveStudioThreeVrmUrl, STUDIO_THREE_VRM_URLS } from "../studio-virtual-space-three-scene";
import "./virtual-three-avatar-picker.css";

export interface VirtualThreeAvatarPickerProps {
  readonly avatarIndex: number;
  readonly onSelect: (avatarIndex: number) => void;
  readonly entry?: boolean;
}

function stopStudioWorldKeyPropagation(event: KeyboardEvent<HTMLButtonElement>): void {
  if (event.key !== "Escape" && event.key !== "Tab") event.stopPropagation();
}

function threeAvatarChoice(url: string) {
  if (!isVerifiedStudioThreeVrmUrl(url) || isBundledVrmUrlRightsBlocked(url)) return null;
  const sample = SAMPLE_VRMS.find(candidate => candidate.url === url);
  if (!sample) return null;
  const thumbnail = isStudioVrmProductionThumbnailUrl(sample.thumbnailUrl)
    && isStudioVrmTechnicallyAdmittedThumbnail(sample.id) ? sample.thumbnailUrl : null;
  return { name: sample.name, id: sample.id, url, thumbnail };
}

export function VirtualThreeAvatarPortrait({ avatarIndex }: { readonly avatarIndex: number }) {
  const bt = useBilingual("StudioVirtualThreeAvatarPicker");
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const choice = threeAvatarChoice(resolveStudioThreeVrmUrl(avatarIndex));
  if (!choice) return null;
  return choice.thumbnail && failedUrl !== choice.thumbnail
    ? <img className="space-lobby__character" src={choice.thumbnail} alt={choice.name}
        draggable={false} onError={() => setFailedUrl(choice.thumbnail)} />
    : <span className="space-lobby__placeholder">{choice.name}<small>{bt("모델 미리보기 없음", "No model preview")}</small></span>;
}

/** 입장 로비와 꾸미기에서 실제 3D 무대가 쓰는 VRM 슬롯을 같은 순서로 표시한다. */
export function VirtualThreeAvatarPicker({ avatarIndex, onSelect, entry = false }: VirtualThreeAvatarPickerProps) {
  const bt = useBilingual("StudioVirtualThreeAvatarPicker");
  const [failedThumbnails, setFailedThumbnails] = useState<ReadonlySet<string>>(() => new Set());
  const activeUrl = entry && avatarIndex < 0 ? null : resolveStudioThreeVrmUrl(avatarIndex);
  const choices = STUDIO_THREE_VRM_URLS.flatMap((url, index) => {
    const choice = threeAvatarChoice(url);
    return choice ? [{ ...choice, avatarIndex: index }] : [];
  });
  return <fieldset className="virtual-three-avatar-picker">
    <legend>{bt("3D 아바타", "3D avatar")}</legend>
    <p>{entry ? bt("입장할 때 사용할 모델을 고르세요.", "Choose the model you will use in the studio.") : bt("모델을 고르면 현재 3D 공간의 내 아바타에 바로 반영됩니다.", "Choose a model to update your avatar in the current 3D space.")}</p>
    <div className="virtual-three-avatar-picker__list">
      {choices.map(choice => <button key={choice.id} type="button" aria-label={choice.name}
        onKeyDown={stopStudioWorldKeyPropagation} onKeyUp={stopStudioWorldKeyPropagation}
        aria-pressed={choice.url === activeUrl} data-three-avatar-index={choice.avatarIndex}
        onClick={() => {
          if (isVerifiedStudioThreeVrmUrl(choice.url) && !isBundledVrmUrlRightsBlocked(choice.url)) onSelect(choice.avatarIndex);
        }}>
        {choice.thumbnail && !failedThumbnails.has(choice.url) ? <img src={choice.thumbnail} alt="" loading="lazy" decoding="async" draggable={false}
          onError={() => setFailedThumbnails(current => new Set([...current, choice.url]))} /> : null}
        <strong>{choice.name}</strong>
      </button>)}
    </div>
    {choices.length === 0 ? <p role="status">{bt("선택할 수 있는 3D 아바타가 없습니다.", "No 3D avatars are available for selection.")}</p> : null}
  </fieldset>;
}
