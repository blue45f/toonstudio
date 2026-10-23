/**
 * Composition → AI image generation brief.
 *
 * 투닝 플러스 3D Studio의 간판 동선("3D로 구도를 잡으면 그 구도 그대로 AI 이미지가
 * 나온다")을 흡수한 연결 계약. 우리에게는 3D 부품(포저·bg3d·씬팩)과 텍스트→3D 모델
 * 생성은 있지만, 3D 구도를 조건으로 2D 이미지를 생성하는 다리가 없었다.
 *
 * 이 모듈은 그 다리의 우리 쪽 절반이다: 포저/bg3d 스냅샷(캐릭터·포즈·카메라·조명·배경)을
 * 제공자 중립적인 생성 요청 패킷으로 결정적으로 조립한다. AI 제공자 실연결은 비용
 * 원칙에 따라 별도 항목이며, 이 계약이 그 입력 명세가 된다. 제공자가 없을 때도
 * 브리프는 그 자체로 가치가 있다 — 작가가 외부 생성 도구나 협업자에게 구도를
 * 정확히 전달할 수 있고, 폴백은 "캡처를 컷에 그대로 삽입"이다.
 */

import { getArtistStyleDnaPreset } from "./studio-artist-style-dna";

export const STUDIO_COMPOSITION_GENERATION_BRIEF_VERSION = 1 as const;

export type CompositionFraming =
  | "full-body"
  | "upper-body"
  | "bust"
  | "close-up"
  | "wide-shot";

export interface CompositionCameraSnapshot {
  /** 화각 (도). bg3d StudioBg3dCameraSettings.fovDegrees와 같은 의미. */
  readonly fovDegrees: number;
  /** 방위각 (도, 0=정면). 씬팩 썸네일 메타의 방위와 같은 규약. */
  readonly azimuthDegrees: number;
  /** 고도각 (도, 양수=하이앵글). */
  readonly elevationDegrees: number;
  readonly framing: CompositionFraming;
}

export interface CompositionGenerationSnapshot {
  readonly characterId: string;
  readonly characterName?: string;
  /** 캐릭터 외형 일관성 키 (헤어·의상 등 셰이퍼 기술자). */
  readonly characterAppearance?: readonly string[];
  readonly posePresetId?: string;
  readonly poseDescription?: string;
  readonly expressionDescription?: string;
  readonly camera: CompositionCameraSnapshot;
  /** bg3d HDRI 조명 프리셋 id 또는 씬팩 조명 참조. */
  readonly lightingPresetId?: string;
  readonly environmentId?: string;
  readonly environmentDescription?: string;
  /** 작가 그림체 DNA 프리셋 ID (선택). */
  readonly styleDnaId?: string;
  /** 웹툰 세로 스크롤 호흡 힌트 (선택). */
  readonly scrollPacingHint?: "fast-action" | "emotional-pause" | "standard";
  /** 사용자가 덧붙인 스타일·연출 문구. */
  readonly userPrompt?: string;
}

export interface CompositionGenerationRequest {
  readonly version: typeof STUDIO_COMPOSITION_GENERATION_BRIEF_VERSION;
  /** 제공자에게 보낼 조립 프롬프트 (영문 — 대부분 이미지 제공자의 최적 언어). */
  readonly prompt: string;
  /** 사람이 읽는 한국어 브리프 (협업 전달·외부 도구 붙여넣기용). */
  readonly briefKo: string;
  /** 일관성 유지에 반드시 실어야 하는 키들. */
  readonly consistencyKeys: readonly string[];
  /** 구도 조건 이미지(포저/bg3d 캡처)가 필요한지. 이 동선에서는 항상 필요. */
  readonly requiresCompositionReference: true;
  readonly negativePrompt: string;
  readonly aspectHint: "vertical-webtoon" | "square" | "landscape";
  /** 제공자 미연결 시 폴백 동작. */
  readonly fallback: "insert-capture-as-is";
}

export type CompositionBriefError =
  | "missing-character"
  | "missing-camera"
  | "invalid-fov";

export type CompositionBriefResult =
  | { readonly ok: true; readonly request: CompositionGenerationRequest }
  | { readonly ok: false; readonly errors: readonly CompositionBriefError[] };

const FRAMING_PROMPT: Readonly<Record<CompositionFraming, string>> = Object.freeze({
  "full-body": "full body shot, head to toe visible",
  "upper-body": "upper body shot, waist up",
  bust: "bust shot, chest up",
  "close-up": "close-up face shot",
  "wide-shot": "wide shot, character small in frame, environment dominant",
});

const FRAMING_LABEL_KO: Readonly<Record<CompositionFraming, string>> = Object.freeze({
  "full-body": "전신",
  "upper-body": "상반신",
  bust: "바스트",
  "close-up": "얼굴 클로즈업",
  "wide-shot": "와이드(배경 중심)",
});

function anglePrompt(camera: CompositionCameraSnapshot): string {
  const azimuth = ((camera.azimuthDegrees % 360) + 360) % 360;
  const horizontal =
    azimuth < 22.5 || azimuth >= 337.5
      ? "front view"
      : azimuth < 67.5
        ? "three-quarter view from the right"
        : azimuth < 112.5
          ? "right side view"
          : azimuth < 157.5
            ? "three-quarter back view from the right"
            : azimuth < 202.5
              ? "back view"
              : azimuth < 247.5
                ? "three-quarter back view from the left"
                : azimuth < 292.5
                  ? "left side view"
                  : "three-quarter view from the left";
  const vertical =
    camera.elevationDegrees >= 15
      ? "high angle looking down"
      : camera.elevationDegrees <= -15
        ? "low angle looking up"
        : "eye-level angle";
  return `${horizontal}, ${vertical}`;
}

/**
 * 스냅샷을 생성 요청 패킷으로 조립한다. 순수·결정적.
 * 캐릭터나 카메라가 없으면 부분 패킷을 만들지 않고 실패를 반환한다(fail-closed).
 */
export function buildCompositionGenerationBrief(
  snapshot: CompositionGenerationSnapshot,
): CompositionBriefResult {
  const errors: CompositionBriefError[] = [];
  if (!snapshot.characterId.trim()) errors.push("missing-character");
  if (!snapshot.camera) {
    errors.push("missing-camera");
  } else if (
    !Number.isFinite(snapshot.camera.fovDegrees) ||
    snapshot.camera.fovDegrees < 10 ||
    snapshot.camera.fovDegrees > 120
  ) {
    errors.push("invalid-fov");
  }
  if (errors.length > 0) {
    return Object.freeze({ ok: false as const, errors: Object.freeze(errors) });
  }

  const camera = snapshot.camera;
  const appearance = (snapshot.characterAppearance ?? []).filter(
    (part) => part.trim() !== "",
  );
  const characterLabel = snapshot.characterName?.trim()
    ? `${snapshot.characterName.trim()} (${snapshot.characterId})`
    : snapshot.characterId;

  const stylePreset = snapshot.styleDnaId?.trim()
    ? getArtistStyleDnaPreset(snapshot.styleDnaId.trim())
    : undefined;

  const promptParts: string[] = [
    "webtoon panel illustration",
    `character: ${characterLabel}`,
  ];
  if (appearance.length > 0) promptParts.push(`appearance: ${appearance.join(", ")}`);
  if (snapshot.poseDescription?.trim()) {
    promptParts.push(`pose: ${snapshot.poseDescription.trim()}`);
  } else if (snapshot.posePresetId) {
    promptParts.push(`pose preset: ${snapshot.posePresetId}`);
  }
  if (snapshot.expressionDescription?.trim()) {
    promptParts.push(`expression: ${snapshot.expressionDescription.trim()}`);
  }
  promptParts.push(`composition: ${FRAMING_PROMPT[camera.framing]}, ${anglePrompt(camera)}`);
  promptParts.push(`lens: ${Math.round(camera.fovDegrees)}mm-equivalent field of view`);
  if (snapshot.environmentDescription?.trim()) {
    promptParts.push(`setting: ${snapshot.environmentDescription.trim()}`);
  } else if (snapshot.environmentId) {
    promptParts.push(`setting preset: ${snapshot.environmentId}`);
  }
  if (snapshot.lightingPresetId) {
    promptParts.push(`lighting preset: ${snapshot.lightingPresetId}`);
  }
  if (stylePreset) {
    promptParts.push(`artist style DNA: ${stylePreset.promptTokens.join(", ")}`);
  }
  if (snapshot.scrollPacingHint === "fast-action") {
    promptParts.push("dynamic vertical webtoon action framing, high kinetic flow");
  } else if (snapshot.scrollPacingHint === "emotional-pause") {
    promptParts.push("generous negative space for vertical scroll emotional pause");
  }
  if (snapshot.userPrompt?.trim()) promptParts.push(snapshot.userPrompt.trim());
  promptParts.push("keep the exact pose and camera angle of the composition reference");

  const briefKoParts: string[] = [
    `캐릭터: ${characterLabel}`,
    `구도: ${FRAMING_LABEL_KO[camera.framing]} · ${anglePrompt(camera)} · 화각 ${Math.round(camera.fovDegrees)}도`,
  ];
  if (snapshot.poseDescription?.trim()) briefKoParts.push(`포즈: ${snapshot.poseDescription.trim()}`);
  if (snapshot.expressionDescription?.trim()) briefKoParts.push(`표정: ${snapshot.expressionDescription.trim()}`);
  if (appearance.length > 0) briefKoParts.push(`외형: ${appearance.join(", ")}`);
  if (snapshot.environmentDescription?.trim()) briefKoParts.push(`배경: ${snapshot.environmentDescription.trim()}`);
  if (snapshot.lightingPresetId) briefKoParts.push(`조명: ${snapshot.lightingPresetId}`);
  if (stylePreset) briefKoParts.push(`화풍 DNA: ${stylePreset.name}`);
  if (snapshot.scrollPacingHint === "fast-action") {
    briefKoParts.push("호흡: 빠른 액션 스크롤");
  } else if (snapshot.scrollPacingHint === "emotional-pause") {
    briefKoParts.push("호흡: 감정 여백 강조");
  }

  const consistencyKeys: string[] = [`character:${snapshot.characterId}`];
  if (snapshot.posePresetId) consistencyKeys.push(`pose:${snapshot.posePresetId}`);
  if (snapshot.environmentId) consistencyKeys.push(`environment:${snapshot.environmentId}`);
  if (snapshot.lightingPresetId) consistencyKeys.push(`lighting:${snapshot.lightingPresetId}`);
  if (stylePreset) consistencyKeys.push(`style-dna:${stylePreset.id}`);

  const negativeBase =
    "different pose, different camera angle, extra characters, deformed hands, inconsistent outfit";
  const negativePrompt = stylePreset
    ? `${negativeBase}, ${stylePreset.negativeTokens.join(", ")}`
    : negativeBase;

  return Object.freeze({
    ok: true as const,
    request: Object.freeze({
      version: STUDIO_COMPOSITION_GENERATION_BRIEF_VERSION,
      prompt: promptParts.join(", "),
      briefKo: briefKoParts.join("\n"),
      consistencyKeys: Object.freeze(consistencyKeys),
      requiresCompositionReference: true as const,
      negativePrompt,
      aspectHint:
        camera.framing === "wide-shot"
          ? ("landscape" as const)
          : ("vertical-webtoon" as const),
      fallback: "insert-capture-as-is" as const,
    }),
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

/**
 * 외부 AI 이미지 제공자 없이도 3D 구도 스냅샷과 브리프를 시각적 구도 가이드 SVG data URL로 렌더링한다.
 */
export function renderCompositionBriefPreviewDataUrl(
  snapshot: CompositionGenerationSnapshot,
  request: CompositionGenerationRequest,
): string {
  const width = request.aspectHint === "landscape" ? 640 : 480;
  const height = request.aspectHint === "landscape" ? 360 : 640;
  const characterTitle = escapeXml(
    snapshot.characterName?.trim() || snapshot.characterId.trim() || "Character",
  );
  const framingLabel = escapeXml(FRAMING_LABEL_KO[snapshot.camera.framing]);
  const angleLabel = escapeXml(anglePrompt(snapshot.camera));
  const fovLabel = `${Math.round(snapshot.camera.fovDegrees)}° FOV`;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#111827"/>`,
    `<rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="16" fill="none" stroke="#38bdf8" stroke-width="2" stroke-dasharray="8 6"/>`,
    `<line x1="${width / 2}" y1="24" x2="${width / 2}" y2="${height - 24}" stroke="#334155" stroke-width="1"/>`,
    `<line x1="24" y1="${height / 2}" x2="${width - 24}" y2="${height / 2}" stroke="#334155" stroke-width="1"/>`,
    `<circle cx="${width / 2}" cy="${Math.round(height * 0.42)}" r="48" fill="#1e293b" stroke="#60a5fa" stroke-width="2.5"/>`,
    `<text x="40" y="58" fill="#f8fafc" font-family="sans-serif" font-size="16" font-weight="700">${characterTitle}</text>`,
    `<text x="40" y="84" fill="#93c5fd" font-family="sans-serif" font-size="13">${framingLabel} · ${escapeXml(fovLabel)}</text>`,
    `<text x="40" y="106" fill="#cbd5e1" font-family="sans-serif" font-size="12">${angleLabel}</text>`,
    `</svg>`,
  ].join("");
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

