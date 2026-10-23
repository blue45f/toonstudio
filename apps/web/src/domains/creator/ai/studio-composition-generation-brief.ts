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
 * 사람이 읽는 한국어 브리프용 앵글 표현. 제공자 프롬프트(anglePrompt)와 같은 구간 경계를 쓰되
 * 문장은 한국어로만 낸다 — 예전에는 한국어 브리프에 "three-quarter view …"가 그대로 섞였다.
 * 방위 규약: 0 = 정면, +X 쪽(오른쪽)으로 돈다.
 */
function angleLabelKo(camera: CompositionCameraSnapshot): string {
  const azimuth = ((camera.azimuthDegrees % 360) + 360) % 360;
  const horizontal =
    azimuth < 22.5 || azimuth >= 337.5
      ? "정면"
      : azimuth < 67.5
        ? "오른쪽 3/4 앞모습"
        : azimuth < 112.5
          ? "오른쪽 옆모습"
          : azimuth < 157.5
            ? "오른쪽 3/4 뒷모습"
            : azimuth < 202.5
              ? "뒷모습"
              : azimuth < 247.5
                ? "왼쪽 3/4 뒷모습"
                : azimuth < 292.5
                  ? "왼쪽 옆모습"
                  : "왼쪽 3/4 앞모습";
  const vertical =
    camera.elevationDegrees >= 15
      ? "하이앵글(내려다봄)"
      : camera.elevationDegrees <= -15
        ? "로우앵글(올려다봄)"
        : "눈높이";
  return `${horizontal} · ${vertical}`;
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
  if (snapshot.userPrompt?.trim()) promptParts.push(snapshot.userPrompt.trim());
  promptParts.push("keep the exact pose and camera angle of the composition reference");

  // 한국어 브리프는 사람이 읽는다 — 이름이 있으면 이름만 쓰고 내부 id는 일관성 키·프롬프트에만 남긴다.
  const briefKoParts: string[] = [
    `캐릭터: ${snapshot.characterName?.trim() || snapshot.characterId}`,
    `구도: ${FRAMING_LABEL_KO[camera.framing]} · ${angleLabelKo(camera)} · 화각 ${Math.round(camera.fovDegrees)}도`,
  ];
  if (snapshot.poseDescription?.trim()) briefKoParts.push(`포즈: ${snapshot.poseDescription.trim()}`);
  if (snapshot.expressionDescription?.trim()) briefKoParts.push(`표정: ${snapshot.expressionDescription.trim()}`);
  if (appearance.length > 0) briefKoParts.push(`외형: ${appearance.join(", ")}`);
  if (snapshot.environmentDescription?.trim()) briefKoParts.push(`배경: ${snapshot.environmentDescription.trim()}`);
  if (snapshot.lightingPresetId) briefKoParts.push(`조명: ${snapshot.lightingPresetId}`);

  const consistencyKeys: string[] = [`character:${snapshot.characterId}`];
  if (snapshot.posePresetId) consistencyKeys.push(`pose:${snapshot.posePresetId}`);
  if (snapshot.environmentId) consistencyKeys.push(`environment:${snapshot.environmentId}`);
  if (snapshot.lightingPresetId) consistencyKeys.push(`lighting:${snapshot.lightingPresetId}`);

  return Object.freeze({
    ok: true as const,
    request: Object.freeze({
      version: STUDIO_COMPOSITION_GENERATION_BRIEF_VERSION,
      prompt: promptParts.join(", "),
      briefKo: briefKoParts.join("\n"),
      consistencyKeys: Object.freeze(consistencyKeys),
      requiresCompositionReference: true as const,
      negativePrompt:
        "different pose, different camera angle, extra characters, deformed hands, inconsistent outfit",
      aspectHint:
        camera.framing === "wide-shot"
          ? ("landscape" as const)
          : ("vertical-webtoon" as const),
      fallback: "insert-capture-as-is" as const,
    }),
  });
}
