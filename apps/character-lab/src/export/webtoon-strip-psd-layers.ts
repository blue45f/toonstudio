/**
 * 레이어 PSD 내보내기용 만화 연출(효과선·말풍선 프레임·대사 식자·효과음 스탬프) 투명 분리 레이어 빌더.
 */
import { resolveSpeakerBubblePlacement } from "./webtoon-strip-composer";
import {
  bakePanelActionLines,
  bakePanelSfxStamp,
  bakeSpeechBubbleDialogueText,
  bakeSpeechBubbleFrame,
} from "./webtoon-strip-raster-fx";

import type {
  WebtoonDialogueLocale,
  WebtoonSfxStampOption,
  WebtoonStripBubbleFontScale,
  WebtoonStripBubbleShape,
  WebtoonStripFxLinesKind,
  WebtoonStripSpeakerTarget,
} from "./webtoon-strip-composer";
import type { CapturedRaster } from "../contracts";

// ---------------------------------------------------------------- 레이어 PSD 만화 연출 투명 분리 레이어 빌더

export function renderTransparentActionLinesLayer(
  width: number,
  height: number,
  kind: WebtoonStripFxLinesKind,
  intensity = 0.78,
  cutIndex = 0,
): CapturedRaster {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const safeIntensity = Math.min(1, Math.max(0.2, Number.isFinite(intensity) ? intensity : 0.78));
  bakePanelActionLines(rgba, width, 0, 0, width, height, kind, safeIntensity, cutIndex);
  return { width, height, rgba };
}

export function renderTransparentSpeechBubbleFrameLayer(
  width: number,
  height: number,
  options: {
    readonly shape?: WebtoonStripBubbleShape;
    readonly speakerTarget?: WebtoonStripSpeakerTarget;
    readonly partnerSide?: "left" | "right";
    readonly locale?: WebtoonDialogueLocale;
    readonly dialogueText?: string;
    readonly cutIndex?: number;
  } = {},
): CapturedRaster {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const placement = resolveSpeakerBubblePlacement(
    options.cutIndex ?? 0,
    options.speakerTarget ?? "auto",
    options.partnerSide ?? "right",
  );
  bakeSpeechBubbleFrame(
    rgba,
    width,
    0,
    0,
    width,
    height,
    placement,
    options.shape ?? "oval",
    options.locale ?? "ko",
    options.dialogueText,
  );
  return { width, height, rgba };
}

export function renderTransparentDialogueTextLayer(
  width: number,
  height: number,
  options: {
    readonly dialogueText?: string;
    readonly shape?: WebtoonStripBubbleShape;
    readonly fontScale?: WebtoonStripBubbleFontScale;
    readonly speakerTarget?: WebtoonStripSpeakerTarget;
    readonly partnerSide?: "left" | "right";
    readonly locale?: WebtoonDialogueLocale;
    readonly cutIndex?: number;
  } = {},
): CapturedRaster {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const placement = resolveSpeakerBubblePlacement(
    options.cutIndex ?? 0,
    options.speakerTarget ?? "auto",
    options.partnerSide ?? "right",
  );
  bakeSpeechBubbleDialogueText(
    rgba,
    width,
    0,
    0,
    width,
    height,
    placement,
    options.dialogueText,
    options.shape ?? "oval",
    options.fontScale ?? "md",
    options.locale ?? "ko",
  );
  return { width, height, rgba };
}

export function renderTransparentSfxStampLayer(
  width: number,
  height: number,
  options: {
    readonly stamp?: WebtoonSfxStampOption;
    readonly speakerTarget?: WebtoonStripSpeakerTarget;
    readonly partnerSide?: "left" | "right";
    readonly locale?: WebtoonDialogueLocale;
    readonly cutIndex?: number;
  } = {},
): CapturedRaster {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const placement = resolveSpeakerBubblePlacement(
    options.cutIndex ?? 0,
    options.speakerTarget ?? "auto",
    options.partnerSide ?? "right",
  );
  bakePanelSfxStamp(
    rgba,
    width,
    0,
    0,
    width,
    height,
    !placement.placeRight,
    options.stamp ?? "none",
    options.locale ?? "ko",
  );
  return { width, height, rgba };
}
