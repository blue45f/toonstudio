import { useState, type KeyboardEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { STUDIO_VRM_HERO_V1_ENTRIES } from "../../../vrm/studio-vrm-hero-v1-catalog-entries";
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

const HERO_ENTRY_BY_URL = new Map(
  STUDIO_VRM_HERO_V1_ENTRIES.map((entry) => [entry.sampleVrm.url, entry] as const),
);

function stopStudioWorldKeyPropagation(event: KeyboardEvent<HTMLButtonElement>): void {
  if (event.key !== "Escape" && event.key !== "Tab") event.stopPropagation();
}

function threeAvatarChoice(url: string) {
  if (!isVerifiedStudioThreeVrmUrl(url) || isBundledVrmUrlRightsBlocked(url)) return null;
  const sample = SAMPLE_VRMS.find((candidate) => candidate.url === url);
  if (!sample) return null;
  const heroEntry = HERO_ENTRY_BY_URL.get(url) ?? null;
  const thumbnail = isStudioVrmProductionThumbnailUrl(sample.thumbnailUrl)
    && isStudioVrmTechnicallyAdmittedThumbnail(sample.id) ? sample.thumbnailUrl : null;
  const optionId = heroEntry ? `hero-v1-${heroEntry.archetypeId}` : sample.id;
  return {
    name: sample.name,
    id: sample.id,
    optionId,
    url,
    thumbnail,
    isHero: heroEntry !== null,
    genreKo: heroEntry?.genreKo ?? null,
  };
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

/** 입장 로비와 꾸미기에서 Hero VRM 1.0 8종을 최우선 배치하고 기존 CC0 VRM을 호환 폴백으로 표시한다. */
export function VirtualThreeAvatarPicker({ avatarIndex, onSelect, entry = false }: VirtualThreeAvatarPickerProps) {
  const bt = useBilingual("StudioVirtualThreeAvatarPicker");
  const [failedThumbnails, setFailedThumbnails] = useState<ReadonlySet<string>>(() => new Set());
  const activeUrl = entry && avatarIndex < 0 ? null : resolveStudioThreeVrmUrl(avatarIndex);
  const choices = STUDIO_THREE_VRM_URLS.flatMap((url, index) => {
    const choice = threeAvatarChoice(url);
    return choice ? [{ ...choice, avatarIndex: index }] : [];
  });
  const heroChoices = choices.filter((item) => item.isHero);
  const fallbackChoices = choices.filter((item) => !item.isHero);

  const renderChoice = (choice: (typeof choices)[number]) => (
    <button
      key={choice.id}
      type="button"
      aria-label={choice.name}
      data-testid={`three-avatar-option-${choice.optionId}`}
      data-avatar-id={choice.id}
      data-avatar-tier={choice.isHero ? "hero-v1" : "legacy"}
      onKeyDown={stopStudioWorldKeyPropagation}
      onKeyUp={stopStudioWorldKeyPropagation}
      aria-pressed={choice.url === activeUrl}
      data-three-avatar-index={choice.avatarIndex}
      onClick={() => {
        if (isVerifiedStudioThreeVrmUrl(choice.url) && !isBundledVrmUrlRightsBlocked(choice.url)) onSelect(choice.avatarIndex);
      }}
    >
      {choice.thumbnail && !failedThumbnails.has(choice.url) ? (
        <img
          src={choice.thumbnail}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedThumbnails((current) => new Set([...current, choice.url]))}
        />
      ) : null}
      <strong>{choice.name}</strong>
      {choice.genreKo ? <small>{choice.genreKo}</small> : null}
    </button>
  );

  return (
    <fieldset className="virtual-three-avatar-picker">
      <legend>{bt("3D 아바타", "3D avatar")}</legend>
      <p>{entry ? bt("입장할 때 사용할 모델을 고르세요.", "Choose the model you will use in the studio.") : bt("모델을 고르면 현재 3D 공간의 내 아바타에 바로 반영됩니다.", "Choose a model to update your avatar in the current 3D space.")}</p>
      {heroChoices.length > 0 ? (
        <div className="virtual-three-avatar-picker__group" data-testid="three-avatar-group-hero">
          <h4 className="virtual-three-avatar-picker__group-title">
            {bt("웹툰 히어로 VRM 1.0 (8종)", "Webtoon Hero VRM 1.0 (8)")}
          </h4>
          <div className="virtual-three-avatar-picker__list">
            {heroChoices.map(renderChoice)}
          </div>
        </div>
      ) : null}
      {fallbackChoices.length > 0 ? (
        <div className="virtual-three-avatar-picker__group" data-testid="three-avatar-group-legacy">
          <h4 className="virtual-three-avatar-picker__group-title">
            {bt("클래식 스튜디오 아바타", "Classic Studio Avatars")}
          </h4>
          <div className="virtual-three-avatar-picker__list">
            {fallbackChoices.map(renderChoice)}
          </div>
        </div>
      ) : null}
      {choices.length === 0 ? <p role="status">{bt("선택할 수 있는 3D 아바타가 없습니다.", "No 3D avatars are available for selection.")}</p> : null}
    </fieldset>
  );
}
