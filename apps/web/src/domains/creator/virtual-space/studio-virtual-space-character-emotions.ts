/**
 * 캐릭터 감정 표정 기본 타입과 표정 매핑 리프 모듈.
 * `studio-virtual-space-character-procedural.ts`와 `studio-virtual-space-character-motion.ts` 간
 * 순환 의존성을 제거하기 위해 분리되었다.
 */

export type StudioEmotionKind = "neutral" | "joy" | "sadness" | "surprise" | "sleep" | "focus";

export const STUDIO_EMOTION_KINDS: readonly StudioEmotionKind[] = Object.freeze([
  "neutral", "joy", "sadness", "surprise", "sleep", "focus",
]);

/**
 * 표정 세트 이름 규칙. 아트 트랙이 스킨에 공급하는 전신 표정 시트는
 * `face-<감정>` 이름으로 조회한다 (`face-joy`, `face-sleep` 등).
 * 세트가 없는 스킨·감정은 기존 표정 경로로 폴백한다.
 */
export type StudioFaceSetName = `face-${StudioEmotionKind}`;

export function studioFaceSetName(emotion: StudioEmotionKind): StudioFaceSetName {
  return `face-${emotion}`;
}

export const STUDIO_EMOTION_LABELS: Readonly<Record<StudioEmotionKind, { readonly ko: string; readonly en: string }>> = Object.freeze({
  neutral: { ko: "평온", en: "Neutral" },
  joy: { ko: "기쁨", en: "Joy" },
  sadness: { ko: "슬픔", en: "Sadness" },
  surprise: { ko: "놀람", en: "Surprise" },
  sleep: { ko: "수면", en: "Sleep" },
  focus: { ko: "집중", en: "Focus" },
});

/** 프로시저럴 얼굴 표정 변형 데이터. */
export interface StudioEmotionFace {
  readonly eyes: "open" | "joyful" | "sad" | "surprised" | "closed" | "focused";
  readonly mouth: "smile" | "grin" | "frown" | "open" | "flat" | "sleepy";
  readonly blush: boolean;
  readonly tear: boolean;
  readonly sweat: boolean;
  readonly zzz: boolean;
}

export function studioEmotionFace(emotion: StudioEmotionKind): StudioEmotionFace {
  switch (emotion) {
    case "joy":
      return Object.freeze({ eyes: "joyful", mouth: "grin", blush: true, tear: false, sweat: false, zzz: false });
    case "sadness":
      return Object.freeze({ eyes: "sad", mouth: "frown", blush: false, tear: true, sweat: false, zzz: false });
    case "surprise":
      return Object.freeze({ eyes: "surprised", mouth: "open", blush: false, tear: false, sweat: true, zzz: false });
    case "sleep":
      return Object.freeze({ eyes: "closed", mouth: "sleepy", blush: false, tear: false, sweat: false, zzz: true });
    case "focus":
      return Object.freeze({ eyes: "focused", mouth: "flat", blush: false, tear: false, sweat: false, zzz: false });
    case "neutral":
    default:
      return Object.freeze({ eyes: "open", mouth: "smile", blush: false, tear: false, sweat: false, zzz: false });
  }
}
