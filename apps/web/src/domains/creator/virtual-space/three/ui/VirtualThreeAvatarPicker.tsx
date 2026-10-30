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
}

function stopStudioWorldKeyPropagation(event: KeyboardEvent<HTMLButtonElement>): void {
  if (event.key !== "Escape" && event.key !== "Tab") event.stopPropagation();
}

/** 선택형 3D build 패널에서만 지연 로드하며 Scene이 허용한 기존 VRM 슬롯 순서를 유지한다. */
export function VirtualThreeAvatarPicker({ avatarIndex, onSelect }: VirtualThreeAvatarPickerProps) {
  const bt = useBilingual("StudioVirtualThreeAvatarPicker");
  const [failedThumbnails, setFailedThumbnails] = useState<ReadonlySet<string>>(() => new Set());
  const activeUrl = resolveStudioThreeVrmUrl(avatarIndex);
  const choices = STUDIO_THREE_VRM_URLS.flatMap((url, index) => {
    if (!isVerifiedStudioThreeVrmUrl(url) || isBundledVrmUrlRightsBlocked(url)) return [];
    const sample = SAMPLE_VRMS.find(candidate => candidate.url === url);
    if (!sample) return [];
    const thumbnail = isStudioVrmProductionThumbnailUrl(sample.thumbnailUrl)
      && isStudioVrmTechnicallyAdmittedThumbnail(sample.id) && !failedThumbnails.has(url) ? sample.thumbnailUrl : null;
    return [{ avatarIndex: index, id: sample.id, name: sample.name, url, thumbnail }];
  });
  return <fieldset className="virtual-three-avatar-picker">
    <legend>{bt("3D 아바타", "3D avatar")}</legend>
    <p>{bt("모델을 고르면 현재 3D 공간의 내 아바타에 바로 반영됩니다.", "Choose a model to update your avatar in the current 3D space.")}</p>
    <div className="virtual-three-avatar-picker__list">
      {choices.map(choice => <button key={choice.id} type="button" aria-label={choice.name}
        onKeyDown={stopStudioWorldKeyPropagation} onKeyUp={stopStudioWorldKeyPropagation}
        aria-pressed={choice.url === activeUrl} data-three-avatar-index={choice.avatarIndex}
        onClick={() => {
          if (isVerifiedStudioThreeVrmUrl(choice.url) && !isBundledVrmUrlRightsBlocked(choice.url)) onSelect(choice.avatarIndex);
        }}>
        {choice.thumbnail ? <img src={choice.thumbnail} alt="" loading="lazy" decoding="async" draggable={false}
          onError={() => setFailedThumbnails(current => new Set([...current, choice.url]))} /> : null}
        <strong>{choice.name}</strong>
      </button>)}
    </div>
    {choices.length === 0 ? <p role="status">{bt("선택할 수 있는 3D 아바타가 없습니다.", "No 3D avatars are available for selection.")}</p> : null}
  </fieldset>;
}
