/**
 * 브랜드 키트·폰트 페어링 탭 및 포토 마스크 프레임·한글 타이포 효과 탭 컴포넌트
 */

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  BRAND_KIT_PRESETS,
  FONT_PAIRING_PRESETS,
  KOREAN_TYPO_EFFECTS,
  PHOTO_MASK_FRAMES,
  type BrandKitId,
  type FontPairingId,
  type KoreanTypoEffectId,
  type PhotoMaskFrameId,
} from "./brand-kit-templates-catalog";

export interface DesignBrandKitTabProps {
  readonly panelId: string;
  readonly labelledBy: string;
  readonly isEnglish: boolean;
  readonly activeBrandKitId: string;
  readonly activeFontPairingId: string;
  readonly onApplyBrandKit: (kitId: BrandKitId) => void;
  readonly onSelectFontPairing: (fontId: FontPairingId) => void;
}

export function DesignBrandKitTab({
  panelId,
  labelledBy,
  isEnglish,
  activeBrandKitId,
  activeFontPairingId,
  onApplyBrandKit,
  onSelectFontPairing,
}: DesignBrandKitTabProps) {
  const bt = useBilingual("DesignBrandKitTab");

  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledBy}
      className="des-panel-body"
      data-testid="des-brand-panel"
    >
      <div className="des-subsection">
        <h3 className="des-subsection-title">
          {bt("브랜드 키트 1클릭 전역 리스킨 (8종)", "One-Click Brand Kit Reskin (8 Kits)")}
        </h3>
        <div className="des-kit-grid" data-testid="des-brand-kit-grid">
          {BRAND_KIT_PRESETS.map((kit) => {
            const active = kit.id === activeBrandKitId;
            return (
              <button
                key={kit.id}
                type="button"
                className={`des-kit-card ${kit.themeClass}`}
                aria-pressed={active}
                data-active={active ? "true" : "false"}
                data-testid={`des-kit-${kit.id}`}
                onClick={() => onApplyBrandKit(kit.id)}
              >
                <span className="des-kit-swatches" aria-hidden="true">
                  <span className="des-swatch des-swatch-bg" />
                  <span className="des-swatch des-swatch-accent" />
                  <span className="des-swatch des-swatch-accent-2" />
                </span>
                <span className="des-kit-name">{isEnglish ? kit.nameEn : kit.nameKo}</span>
                <span className="des-kit-mood">{isEnglish ? kit.moodEn : kit.moodKo}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="des-subsection">
        <h3 className="des-subsection-title">
          {bt("한영 추천 폰트 페어링 (6종)", "KO/EN Font Pairings (6)")}
        </h3>
        <div className="des-font-grid" data-testid="des-font-pairing-grid">
          {FONT_PAIRING_PRESETS.map((pair) => {
            const active = pair.id === activeFontPairingId;
            return (
              <button
                key={pair.id}
                type="button"
                className="des-template-card"
                aria-pressed={active}
                data-active={active ? "true" : "false"}
                data-testid={`des-font-${pair.id}`}
                onClick={() => onSelectFontPairing(pair.id)}
              >
                <span className="des-template-title">{isEnglish ? pair.nameEn : pair.nameKo}</span>
                <span className="des-template-summary">{isEnglish ? pair.vibeEn : pair.vibeKo}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export interface DesignFramesEffectsTabProps {
  readonly panelId: string;
  readonly labelledBy: string;
  readonly isEnglish: boolean;
  readonly activePhotoFrameId: string;
  readonly activeTypoEffectId: string;
  readonly onSelectPhotoFrame: (frameId: PhotoMaskFrameId) => void;
  readonly onSelectTypoEffect: (effectId: KoreanTypoEffectId) => void;
}

export function DesignFramesEffectsTab({
  panelId,
  labelledBy,
  isEnglish,
  activePhotoFrameId,
  activeTypoEffectId,
  onSelectPhotoFrame,
  onSelectTypoEffect,
}: DesignFramesEffectsTabProps) {
  const bt = useBilingual("DesignFramesEffectsTab");

  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledBy}
      className="des-panel-body"
      data-testid="des-effects-panel"
    >
      <div className="des-subsection">
        <h3 className="des-subsection-title">
          {bt("포토 마스크 프레임 (8종)", "Photo Mask Frames (8)")}
        </h3>
        <div className="des-format-grid" data-testid="des-photo-frame-grid">
          {PHOTO_MASK_FRAMES.map((frame) => {
            const active = frame.id === activePhotoFrameId;
            return (
              <button
                key={frame.id}
                type="button"
                className="des-format-btn"
                aria-pressed={active}
                data-active={active ? "true" : "false"}
                data-testid={`des-frame-${frame.id}`}
                onClick={() => onSelectPhotoFrame(frame.id)}
              >
                <span className="des-format-name">{isEnglish ? frame.nameEn : frame.nameKo}</span>
                <span className="des-format-dim">{isEnglish ? frame.hintEn : frame.hintKo}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="des-subsection">
        <h3 className="des-subsection-title">
          {bt("한글 타이포 효과 (6종)", "Display Typography Effects (6)")}
        </h3>
        <div className="des-template-grid" data-testid="des-typo-effect-grid">
          {KOREAN_TYPO_EFFECTS.map((effect) => {
            const active = effect.id === activeTypoEffectId;
            return (
              <button
                key={effect.id}
                type="button"
                className="des-template-card"
                aria-pressed={active}
                data-active={active ? "true" : "false"}
                data-testid={`des-typo-${effect.id}`}
                onClick={() => onSelectTypoEffect(effect.id)}
              >
                <span className="des-template-title">{isEnglish ? effect.nameEn : effect.nameKo}</span>
                <span className="des-template-summary">
                  {isEnglish ? effect.descriptionEn : effect.descriptionKo}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
