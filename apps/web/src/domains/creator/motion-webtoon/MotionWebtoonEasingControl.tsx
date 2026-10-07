/**
 * 모션 웹툰 이징 선택 컨트롤.
 *
 * 프리셋 선택 + 곡선 미리보기(SVG) 수준의 경량 편집 표면이다.
 * 풀 그래프 편집기는 두지 않는다 — 프리셋 9종으로 연출 의도를 고르고,
 * 곡선 모양과 cubic-bezier 값을 눈으로 확인하는 데까지만 책임진다.
 */

import type { JSX } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  buildEasingCurvePath,
  MOTION_EASING_PRESETS,
  motionEasingPreset,
  type MotionEasingPresetId,
} from "./motion-webtoon-easing";
import { MOTION_WEBTOON_UI_LABELS as L } from "./motion-webtoon-labels";

export interface MotionWebtoonEasingControlProps {
  /** 현재 유효 프리셋 ID (resolveCutEasingPresetId로 해석해 넘긴다). */
  readonly value: MotionEasingPresetId;
  readonly onChange: (id: MotionEasingPresetId) => void;
}

const PREVIEW_WIDTH = 96;
const PREVIEW_HEIGHT = 64;

export function MotionWebtoonEasingControl(props: MotionWebtoonEasingControlProps): JSX.Element {
  const { value, onChange } = props;
  const t = useBilingual("motion-webtoon");
  const preset = motionEasingPreset(value);
  const curvePath = buildEasingCurvePath(preset.easing, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  const curveText =
    preset.easing.kind === "bezier"
      ? `cubic-bezier(${preset.easing.curve.x1}, ${preset.easing.curve.y1}, ${preset.easing.curve.x2}, ${preset.easing.curve.y2})`
      : preset.easing.kind === "hold"
        ? "steps(1, end)"
        : "linear";

  return (
    <div className="mw-easing-control">
      <label className="mw-field mw-easing-field">
        <span>{t(L.easingLabel.titleKo, L.easingLabel.titleEn)}</span>
        <select
          value={preset.id}
          onChange={(e) => onChange(e.target.value as MotionEasingPresetId)}
          aria-label={t(L.easingLabel.titleKo, L.easingLabel.titleEn)}
        >
          {MOTION_EASING_PRESETS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {t(entry.labelKo, entry.labelEn)}
            </option>
          ))}
        </select>
        <span className="mw-easing-curve">{curveText}</span>
      </label>
      <svg
        className="mw-easing-preview"
        viewBox={`0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}`}
        role="img"
        aria-label={t(preset.labelKo, preset.labelEn)}
      >
        <line x1={0} y1={PREVIEW_HEIGHT / 2} x2={PREVIEW_WIDTH} y2={PREVIEW_HEIGHT / 2} className="mw-easing-grid" />
        <line x1={PREVIEW_WIDTH / 2} y1={0} x2={PREVIEW_WIDTH / 2} y2={PREVIEW_HEIGHT} className="mw-easing-grid" />
        <path d={curvePath} className="mw-easing-path" fill="none" />
      </svg>
    </div>
  );
}
