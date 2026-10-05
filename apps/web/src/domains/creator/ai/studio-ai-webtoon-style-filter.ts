/**
 * studio-ai-webtoon-style-filter.ts
 *
 * Webtoon AI Style Transfer & Toon Filter Engine.
 * Benchmarks Naver Webtoon Toon Filter, Krea AI, and ComfyUI Webtoon pipelines.
 *
 * - 5 Archetypal webtoon art styles:
 *   1. `romance-manhwa` (화사한 순정/로판 - 파스텔 톤, 반짝이는 눈망울, 맑은 피부)
 *   2. `action-shonen-ink` (역동적 소년/액션 - 묵직한 먹선, 강렬한 명암비, 속도선)
 *   3. `fantasy-noble-cel` (판타지 웹소설 표지 - 금장 디테일, 웅장한 극화체)
 *   4. `thriller-noir-grit` (다크 스릴러/좀비 - 거친 해칭, 음산한 청회색조)
 *   5. `anime-cel` (일본 애니메이션 셀 작화 - 균일한 선화, 평탄한 셀 음영, 맑은 색면.
 *      기기 ONNX 변환(AnimeGANv2)의 클라우드 대응 프리셋으로, img2img 변환
 *      프롬프트와 디노이즈 권장값을 같은 값으로 맞춘다)
 *
 * Synthesizes style-specific prompt prefixes, negative prompts, lineart weights,
 * and color grading lookups for generative AI backends.
 */

export type WebtoonArtStyleId =
  | "romance-manhwa"
  | "action-shonen-ink"
  | "fantasy-noble-cel"
  | "thriller-noir-grit"
  | "anime-cel";

export interface WebtoonArtStyleMeta {
  readonly id: WebtoonArtStyleId;
  readonly name: string;
  readonly genre: string;
  readonly description: string;
  readonly promptKeywords: readonly string[];
  readonly negativeKeywords: readonly string[];
  readonly lineThicknessFactor: number; // 0.5 (thin) ~ 2.0 (heavy ink)
  readonly contrastBoost: number; // 1.0 (neutral) ~ 1.5 (high contrast)
  readonly saturationMultiplier: number;
  readonly recommendedDenoiserStrength: number; // 0.35 (preserve original structure) ~ 0.75 (heavy restyle)
}

export const WEBTOON_ART_STYLES: Record<WebtoonArtStyleId, WebtoonArtStyleMeta> = {
  "romance-manhwa": {
    id: "romance-manhwa",
    name: "로맨스 판타지 / 순정만화 화풍",
    genre: "로맨스 / 순정 / 로판",
    description: "투명하고 맑은 피부톤, 파스텔조 환경광, 반짝이는 눈동자 하이라이트가 돋보이는 화사한 화풍",
    promptKeywords: [
      "Korean romance manhwa style",
      "sparkling luminous eyes",
      "delicate fine ink lineart",
      "soft pastel lighting",
      "glowing rim light",
      "elegant aesthetic",
      "clean digital webtoon illustration",
    ],
    negativeKeywords: [
      "rough heavy hatching",
      "dark muddy shadows",
      "grim expressions",
      "dirty skin texture",
      "hyper-realistic pores",
    ],
    lineThicknessFactor: 0.8,
    contrastBoost: 1.05,
    saturationMultiplier: 1.15,
    recommendedDenoiserStrength: 0.55,
  },
  "action-shonen-ink": {
    id: "action-shonen-ink",
    name: "소년 액션 / 역동적 극화체",
    genre: "액션 / 소년 / 무협",
    description: "굵직하고 거친 브러시 잉크 먹선, 극적인 명암 대비, 충격파 및 속도선이 강조된 액션 화풍",
    promptKeywords: [
      "Korean action webtoon style",
      "dynamic perspective",
      "heavy brush ink linework",
      "dramatic cel shading",
      "high contrast chiaroscuro",
      "intense expression",
      "speedlines and motion blast",
    ],
    negativeKeywords: [
      "soft blur",
      "weak lines",
      "pastel colors",
      "dull flat lighting",
      "childish look",
    ],
    lineThicknessFactor: 1.6,
    contrastBoost: 1.35,
    saturationMultiplier: 1.0,
    recommendedDenoiserStrength: 0.65,
  },
  "fantasy-noble-cel": {
    id: "fantasy-noble-cel",
    name: "고급 판타지 / 웹소설 표지풍",
    genre: "판타지 / 영애물 / 성좌물",
    description: "화려한 금장 의상과 보석 렌더링, 입체감 넘치는 완성도 높은 하이엔드 웹툰 표지 작화",
    promptKeywords: [
      "luxurious fantasy webtoon cover art",
      "detailed ornate royal clothing and jewelry",
      "masterpiece cel shading",
      "cinematic volumetric lighting",
      "sharp crystal details",
      "regal atmosphere",
    ],
    negativeKeywords: [
      "sloppy lines",
      "flat coloring",
      "pixelated artifacts",
      "cluttered messy background",
    ],
    lineThicknessFactor: 1.1,
    contrastBoost: 1.2,
    saturationMultiplier: 1.25,
    recommendedDenoiserStrength: 0.6,
  },
  "thriller-noir-grit": {
    id: "thriller-noir-grit",
    name: "스릴러 누아르 / 다크 판타지",
    genre: "스릴러 / 미스터리 / 아포칼립스",
    description: "음산한 청회색 모노톤, 섬뜩한 사선 해칭선, 서스펜스를 고조시키는 극단적 하이라이트",
    promptKeywords: [
      "dark webtoon thriller noir style",
      "dense cross-hatching pen strokes",
      "shadowy moody ambient",
      "cold desaturated color palette with intense focal accent",
      "psychological tension",
    ],
    negativeKeywords: [
      "cute",
      "bright sunny",
      "vibrant rainbow colors",
      "smooth airbrush shading",
    ],
    lineThicknessFactor: 1.3,
    contrastBoost: 1.45,
    saturationMultiplier: 0.7,
    recommendedDenoiserStrength: 0.7,
  },
  "anime-cel": {
    id: "anime-cel",
    name: "애니메이션 셀 / 애니풍",
    genre: "애니메이션 / 일상 / 학원",
    description: "일본 TV 애니메이션 셀 작화 — 또렷하고 균일한 선화, 평탄한 셀 음영, 맑고 선명한 색면",
    promptKeywords: [
      "Japanese anime style",
      "cel shading with flat color planes",
      "clean uniform lineart",
      "anime screencap look",
      "bright clear colors",
      "two-tone cel shadow",
    ],
    negativeKeywords: [
      "photorealistic",
      "semi-realistic painterly rendering",
      "3d render",
      "oil painting texture",
      "soft airbrush gradients",
      "realistic skin texture",
    ],
    lineThicknessFactor: 1.0,
    contrastBoost: 1.15,
    saturationMultiplier: 1.2,
    recommendedDenoiserStrength: 0.65,
  },
};

// ---------------------------------------------------------------------------
// 용도 축 — 화풍(어떻게 그릴까)과 직교하는 "어디에 쓸까"의 축.
// 경쟁 서비스(지니어스 캔버스)의 프리셋이 화풍 이름이 아니라 용도 단위
// (본편용 2D / 굿즈용 SD·스티커 / 소장용 피규어 / 스케치)로 나뉘어 있던
// 관점을 차용하되, 실제 파라미터 차이(키워드·네거티브·디노이즈·변환
// 지시문)가 있는 용도만 둔다. 지어낸 변형(예: SD 크래용 같은 매체 결합)은
// 양산하지 않는다.
//
// 경계: "스티커"의 알파 테두리(다이컷 아웃라인) 후처리는 이 축에 없다.
// outline은 알파 경계 바깥에만 그려지는 스티커 테두리라 불투명 이미지에는
// no-op이라는 사유가 studio-photo-webtoon-preset.ts에 명시돼 있고, 실제
// 스티커 경로는 피사체 알파 추출→투명 래스터 아웃라인 렌더라는 별도
// 파이프라인이 필요하다. 여기 sd-sticker는 프롬프트 화풍까지만이다.
// ---------------------------------------------------------------------------

export type WebtoonStylePurposeId =
  | "episode"
  | "sd-sticker"
  | "figure"
  | "sketch";

export interface WebtoonStylePurposeMeta {
  readonly id: WebtoonStylePurposeId;
  readonly name: string;
  readonly description: string;
  readonly promptKeywords: readonly string[];
  readonly negativeKeywords: readonly string[];
  /** null이면 화풍 프리셋의 권장 디노이즈를 그대로 쓴다. */
  readonly denoiseStrength: number | null;
  /** img2img 변환 시 포지티브에 함께 실리는 용도 지시문 (없으면 빈 문자열). */
  readonly editInstruction: string;
}

export const WEBTOON_STYLE_PURPOSES: Record<WebtoonStylePurposeId, WebtoonStylePurposeMeta> = {
  "episode": {
    id: "episode",
    name: "본편용",
    description: "연재 컷에 그대로 쓰는 2D 애니메이션 변환 — 용도 보정 없이 화풍만 적용",
    promptKeywords: [],
    negativeKeywords: [],
    denoiseStrength: null,
    editInstruction: "",
  },
  "sd-sticker": {
    id: "sd-sticker",
    name: "굿즈·스티커용 SD",
    description: "비율을 SD(슈퍼 디포메)로 다시 그리는 굿즈·스티커 일러스트용",
    promptKeywords: [
      "super deformed chibi proportions",
      "big head and small body",
      "cute mascot look",
      "die-cut sticker illustration",
      "bold simple shapes",
    ],
    negativeKeywords: [
      "realistic body proportions",
      "long limbs",
      "detailed background scenery",
    ],
    // 비율 자체를 다시 그려야 해서 문서화된 상한(0.75)까지 올린다.
    denoiseStrength: 0.75,
    editInstruction:
      "Redraw the character as a super-deformed chibi sticker illustration, keeping the outfit colors and hairstyle recognizable.",
  },
  "figure": {
    id: "figure",
    name: "소장용 피규어",
    description: "실물 피규어 사진처럼 렌더링하는 소장·홍보용 이미지",
    promptKeywords: [
      "collectible anime figure",
      "PVC figurine",
      "glossy painted statue",
      "product photography of a scale figure",
      "display base",
    ],
    negativeKeywords: [
      "2d illustration",
      "flat drawing",
      "hand-drawn lineart",
    ],
    denoiseStrength: 0.7,
    editInstruction:
      "Render the character as a glossy PVC collectible figure photograph standing on a display base.",
  },
  "sketch": {
    id: "sketch",
    name: "콘티·스케치용",
    description: "러프 연필 스케치로 바꾸는 콘티·참고용 이미지",
    promptKeywords: [
      "rough pencil sketch",
      "monochrome line drawing",
      "storyboard rough",
      "loose construction lines",
    ],
    negativeKeywords: [
      "color",
      "painted rendering",
      "photorealistic",
    ],
    // 구도와 선을 살리는 용도라 화풍 기본값보다 약하게 재해석한다.
    denoiseStrength: 0.55,
    editInstruction:
      "Convert into a rough monochrome pencil sketch like a storyboard rough, keeping the composition and poses.",
  },
};

export class StudioAiWebtoonStyleFilterEngine {
  /**
   * Generates a fully compiled generative AI prompt combining user intent with target art style rules.
   */
  public compilePrompt(
    styleId: WebtoonArtStyleId,
    userDescription: string,
    additionalModifiers: readonly string[] = [],
  ): {
    positivePrompt: string;
    negativePrompt: string;
    denoiseStrength: number;
    recommendedSettings: {
      lineFactor: number;
      contrast: number;
      saturation: number;
    };
  } {
    return this.compileInternal(styleId, undefined, userDescription, additionalModifiers);
  }

  /**
   * 용도 축까지 얹어 컴파일한다. 용도는 화풍과 직교하는 축이라 화풍 키워드 뒤에
   * 용도 키워드·지시문을 겹치고, 디노이즈는 용도가 지정한 값을 우선한다
   * (SD처럼 비율 자체를 다시 그리는 용도는 강한 재해석이 필요해 값이 다르다).
   */
  public compilePromptForPurpose(
    styleId: WebtoonArtStyleId,
    purposeId: WebtoonStylePurposeId,
    userDescription: string,
    additionalModifiers: readonly string[] = [],
  ): {
    positivePrompt: string;
    negativePrompt: string;
    denoiseStrength: number;
    recommendedSettings: {
      lineFactor: number;
      contrast: number;
      saturation: number;
    };
  } {
    return this.compileInternal(
      styleId,
      this.getPurpose(purposeId),
      userDescription,
      additionalModifiers,
    );
  }

  private compileInternal(
    styleId: WebtoonArtStyleId,
    purpose: WebtoonStylePurposeMeta | undefined,
    userDescription: string,
    additionalModifiers: readonly string[],
  ): {
    positivePrompt: string;
    negativePrompt: string;
    denoiseStrength: number;
    recommendedSettings: {
      lineFactor: number;
      contrast: number;
      saturation: number;
    };
  } {
    const style = WEBTOON_ART_STYLES[styleId] ?? WEBTOON_ART_STYLES["romance-manhwa"];
    const baseClean = userDescription.trim();

    const positivePrompt = [
      ...style.promptKeywords,
      ...(purpose?.promptKeywords ?? []),
      baseClean,
      purpose?.editInstruction ?? "",
      ...additionalModifiers,
    ]
      .filter(Boolean)
      .join(", ");

    const negativePrompt = [
      ...style.negativeKeywords,
      ...(purpose?.negativeKeywords ?? []),
      "lowres",
      "bad anatomy",
      "worst quality",
      "watermark",
      "signature",
      "ugly",
      "extra fingers",
    ].join(", ");

    return {
      positivePrompt,
      negativePrompt,
      denoiseStrength: purpose?.denoiseStrength ?? style.recommendedDenoiserStrength,
      recommendedSettings: {
        lineFactor: style.lineThicknessFactor,
        contrast: style.contrastBoost,
        saturation: style.saturationMultiplier,
      },
    };
  }

  public listStyles(): readonly WebtoonArtStyleMeta[] {
    return Object.values(WEBTOON_ART_STYLES);
  }

  public getStyle(id: WebtoonArtStyleId): WebtoonArtStyleMeta {
    return WEBTOON_ART_STYLES[id] ?? WEBTOON_ART_STYLES["romance-manhwa"];
  }

  public listPurposes(): readonly WebtoonStylePurposeMeta[] {
    return Object.values(WEBTOON_STYLE_PURPOSES);
  }

  public getPurpose(id: WebtoonStylePurposeId): WebtoonStylePurposeMeta {
    return WEBTOON_STYLE_PURPOSES[id] ?? WEBTOON_STYLE_PURPOSES["episode"];
  }
}
