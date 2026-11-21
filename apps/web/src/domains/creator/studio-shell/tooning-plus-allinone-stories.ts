import type {
  TooningBeatStageId,
  TooningBubbleStyleId,
  TooningCameraId,
  TooningExpressionId,
  TooningGenreId,
  TooningPoseId,
  TooningSfxId,
  TooningSpeakerPosition,
  TooningToneId,
} from "./tooning-plus-allinone-catalog";

export interface TooningBeatTemplate {
  readonly stage: TooningBeatStageId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly poseId: TooningPoseId;
  readonly expressionId: TooningExpressionId;
  readonly cameraId: TooningCameraId;
  readonly position: TooningSpeakerPosition;
  readonly bubbleStyle: TooningBubbleStyleId;
  readonly sfxId: TooningSfxId;
}

export const BEAT_STAGE_LABELS: Readonly<Record<TooningBeatStageId, { ko: string; en: string }>> = {
  intro: { ko: "기 · 도입", en: "Act 1 · Setup" },
  rise: { ko: "승 · 전개", en: "Act 2 · Rising" },
  twist: { ko: "전 · 전환", en: "Act 3 · Twist" },
  climax: { ko: "결 · 클라이맥스", en: "Act 4 · Payoff" },
};

export const GENRE_BEAT_PRESETS: Readonly<Record<TooningGenreId, readonly TooningBeatTemplate[]>> = {
  rofan: [
    { stage: "intro", labelKo: "기 · 무도회 진입", labelEn: "Setup · Hall Entrance", poseId: "walk", expressionId: "focus", cameraId: "full-wide", position: "left", bubbleStyle: "narration", sfxId: "seureureuk" },
    { stage: "rise", labelKo: "승 · 시선 교차", labelEn: "Rising · Crossing Gaze", poseId: "lean-whisper", expressionId: "smirk", cameraId: "over-shoulder", position: "right", bubbleStyle: "normal", sfxId: "dugeun" },
    { stage: "twist", labelKo: "전 · 계약 공개", labelEn: "Twist · Secret Revealed", poseId: "surprise", expressionId: "shock", cameraId: "dutch-tilt", position: "left", bubbleStyle: "shout", sfxId: "kwang" },
    { stage: "climax", labelKo: "결 · 운명의 맹세", labelEn: "Payoff · Vow Sealed", poseId: "kneel-plea", expressionId: "sparkle-awe", cameraId: "close-up", position: "center", bubbleStyle: "normal", sfxId: "banjjak" },
  ],
  school: [
    { stage: "intro", labelKo: "기 · 방과 후 옥상", labelEn: "Setup · Sunset Rooftop", poseId: "wave-hi", expressionId: "bright-smile", cameraId: "full-wide", position: "left", bubbleStyle: "normal", sfxId: "seureureuk" },
    { stage: "rise", labelKo: "승 · 사건 발생", labelEn: "Rising · Sudden Hiccup", poseId: "point", expressionId: "panic", cameraId: "medium-bust", position: "right", bubbleStyle: "shout", sfxId: "ungseong" },
    { stage: "twist", labelKo: "전 · 숨겨둔 단서", labelEn: "Twist · Hidden Clue", poseId: "run", expressionId: "focus", cameraId: "dutch-tilt", position: "left", bubbleStyle: "thought", sfxId: "beonjjeok" },
    { stage: "climax", labelKo: "결 · 설레는 해결", labelEn: "Payoff · Bright Finish", poseId: "victory-cheer", expressionId: "shy", cameraId: "close-up", position: "center", bubbleStyle: "normal", sfxId: "dugeun" },
  ],
  action: [
    { stage: "intro", labelKo: "기 · 균열 경보", labelEn: "Setup · Rift Alarm", poseId: "crossed-arms", expressionId: "focus", cameraId: "low-hero", position: "left", bubbleStyle: "narration", sfxId: "seureureuk" },
    { stage: "rise", labelKo: "승 · 발도 태세", labelEn: "Rising · Blade Drawn", poseId: "draw-sword", expressionId: "anger", cameraId: "dutch-tilt", position: "right", bubbleStyle: "shout", sfxId: "beonjjeok" },
    { stage: "twist", labelKo: "전 · 각성 눈빛", labelEn: "Twist · Eyes Awaken", poseId: "surprise", expressionId: "shock", cameraId: "extreme-eyes", position: "center", bubbleStyle: "thought", sfxId: "dugeun" },
    { stage: "climax", labelKo: "결 · 일격 필살", labelEn: "Payoff · Final Strike", poseId: "midair-leap", expressionId: "smirk", cameraId: "low-hero", position: "right", bubbleStyle: "shout", sfxId: "kwang" },
  ],
  daily: [
    { stage: "intro", labelKo: "기 · 평화로운 시작", labelEn: "Setup · Calm Morning", poseId: "desk-sit", expressionId: "bright-smile", cameraId: "medium-bust", position: "left", bubbleStyle: "normal", sfxId: "seureureuk" },
    { stage: "rise", labelKo: "승 · 돌발 변수", labelEn: "Rising · Sudden Request", poseId: "surprise", expressionId: "panic", cameraId: "close-up", position: "right", bubbleStyle: "shout", sfxId: "kwang" },
    { stage: "twist", labelKo: "전 · 번뜩이는 묘안", labelEn: "Twist · Clever Idea", poseId: "point", expressionId: "sparkle-awe", cameraId: "high-overhead", position: "left", bubbleStyle: "thought", sfxId: "beonjjeok" },
    { stage: "climax", labelKo: "결 · 칼퇴 대성공", labelEn: "Payoff · Happy Victory", poseId: "victory-cheer", expressionId: "relief", cameraId: "full-wide", position: "center", bubbleStyle: "normal", sfxId: "banjjak" },
  ],
  edu: [
    { stage: "intro", labelKo: "기 · 궁금증 제시", labelEn: "Setup · Key Question", poseId: "wave-hi", expressionId: "bright-smile", cameraId: "full-wide", position: "left", bubbleStyle: "normal", sfxId: "ungseong" },
    { stage: "rise", labelKo: "승 · 흔한 오해", labelEn: "Rising · Common Mistake", poseId: "desk-sit", expressionId: "panic", cameraId: "medium-bust", position: "right", bubbleStyle: "thought", sfxId: "dugeun" },
    { stage: "twist", labelKo: "전 · 핵심 원리", labelEn: "Twist · Core Rule", poseId: "point", expressionId: "focus", cameraId: "close-up", position: "left", bubbleStyle: "normal", sfxId: "beonjjeok" },
    { stage: "climax", labelKo: "결 · 한 줄 정리", labelEn: "Payoff · Clear Takeaway", poseId: "victory-cheer", expressionId: "sparkle-awe", cameraId: "medium-bust", position: "center", bubbleStyle: "narration", sfxId: "banjjak" },
  ],
};

export function applyToneToDialogue(
  koText: string,
  enText: string,
  toneId: TooningToneId,
  cutNumber: number,
): { readonly ko: string; readonly en: string } {
  const cleanKo = koText
    .replace(/^\[(긴박|코믹|감동|진지)\]\s*/u, "")
    .replace(/\s*\(헉!?\)$/u, "")
    .replace(/\s*—$/u, "");
  const cleanEn = enText
    .replace(/^\[(Urgent|Comedy|Warm|Serious)\]\s*/u, "")
    .replace(/\s*\(Wait, what!?\)$/u, "");

  if (toneId === "comic") {
    return {
      ko: cutNumber % 2 === 0 ? `${cleanKo} (헉!)` : `어이쿠! ${cleanKo}`,
      en: cutNumber % 2 === 0 ? `${cleanEn} (Wait, what?!)` : `Whoa! ${cleanEn}`,
    };
  }
  if (toneId === "tense") {
    return {
      ko: cutNumber >= 3 ? `서둘러… ${cleanKo}` : `${cleanKo} 시간이 없어!`,
      en: cutNumber >= 3 ? `Hurry... ${cleanEn}` : `${cleanEn} We are out of time!`,
    };
  }
  if (toneId === "touching") {
    return {
      ko: cutNumber === 1 ? `마음이 닿기를… ${cleanKo}` : `${cleanKo} 고마워.`,
      en: cutNumber === 1 ? `From the heart... ${cleanEn}` : `${cleanEn} Thank you.`,
    };
  }
  return {
    ko: cleanKo,
    en: cleanEn,
  };
}

export function buildDialogueForBeat(
  genreId: TooningGenreId,
  toneId: TooningToneId,
  stage: TooningBeatStageId,
  keywordKo: string,
  keywordEn: string,
  speakerNameKo: string,
  speakerNameEn: string,
  partnerNameKo: string,
  partnerNameEn: string,
  cutNumber: number,
): { readonly ko: string; readonly en: string } {
  const safeKwKo = keywordKo.trim() || "비밀 에피소드";
  const safeKwEn = keywordEn.trim() || "Secret Episode";

  const baseLines: Readonly<Record<TooningGenreId, Readonly<Record<TooningBeatStageId, { ko: string; en: string }>>>> = {
    rofan: {
      intro: {
        ko: `오늘 밤 연회장에서 '${safeKwKo}'의 주인이 가려진다.`,
        en: `Tonight in the grand hall, the truth behind "${safeKwEn}" comes to light.`,
      },
      rise: {
        ko: `${partnerNameKo}, 그 '${safeKwKo}'를 먼저 꺼내면 승부가 끝날 텐데요?`,
        en: `${partnerNameEn}, revealing "${safeKwEn}" early changes the whole pact.`,
      },
      twist: {
        ko: `잠깐! '${safeKwKo}' 마지막 줄에 적힌 이름이 내 이름이라고?!`,
        en: `Wait! My own name is signed on the final line of "${safeKwEn}"?!`,
      },
      climax: {
        ko: `이번 생의 '${safeKwKo}'는 내가 직접 다시 쓰겠어.`,
        en: `This time, I will rewrite "${safeKwEn}" on my own terms.`,
      },
    },
    school: {
      intro: {
        ko: `종소리 울리기 전에 '${safeKwKo}'부터 꼭 찾아야 해!`,
        en: `We have to find "${safeKwEn}" before the after-school bell rings!`,
      },
      rise: {
        ko: `${partnerNameKo}, 방금 교실 창문 밖으로 '${safeKwKo}'가 날아갔어!`,
        en: `${partnerNameEn}, "${safeKwEn}" just fluttered out toward the rooftop!`,
      },
      twist: {
        ko: `어라? '${safeKwKo}' 뒷면에 숨겨진 메모가 적혀 있잖아…`,
        en: `Hold on... there is a hidden note on the back of "${safeKwEn}"...`,
      },
      climax: {
        ko: `${speakerNameKo} 덕분에 오늘 '${safeKwKo}' 미션 완벽하게 성공했어!`,
        en: `Thanks to ${speakerNameEn}, our "${safeKwEn}" mission worked out!`,
      },
    },
    action: {
      intro: {
        ko: `수정 균열 한가운데서 '${safeKwKo}'의 파동이 깨어났다.`,
        en: `Inside the crystal rift, the pulse of "${safeKwEn}" just awakened.`,
      },
      rise: {
        ko: `물러서, ${partnerNameKo}! '${safeKwKo}'의 봉인은 내가 끊는다!`,
        en: `Stand back, ${partnerNameEn}! I will shatter the seal on "${safeKwEn}"!`,
      },
      twist: {
        ko: `이 공명… '${safeKwKo}'가 내 호흡에 맞춰 반응하고 있어.`,
        en: `This resonance... "${safeKwEn}" is syncing with my breathing.`,
      },
      climax: {
        ko: `지금이다! '${safeKwKo}' 전출력 해방!`,
        en: `Now! Full release of "${safeKwEn}"!`,
      },
    },
    daily: {
      intro: {
        ko: `오늘의 목표는 딱 하나, '${safeKwKo}' 챙기고 여유롭게 시작하기.`,
        en: `One simple goal today: grab "${safeKwEn}" and keep a calm pace.`,
      },
      rise: {
        ko: `방금 '${safeKwKo}' 얘기하자마자 마감 수정 요청이 떴다고요?!`,
        en: `A surprise revision dropped the exact second "${safeKwEn}" arrived?!`,
      },
      twist: {
        ko: `잠깐만, '${safeKwKo}' 템플릿으로 정리하면 10분이면 끝나잖아?`,
        en: `Wait—using our "${safeKwEn}" checklist cuts the work down to ten minutes!`,
      },
      climax: {
        ko: `드디어 완료! '${safeKwKo}' 버프 받고 오늘도 정시 퇴근!`,
        en: `Done at last! Powered by "${safeKwEn}", heading home right on time!`,
      },
    },
    edu: {
      intro: {
        ko: `오늘은 4컷으로 '${safeKwKo}' 핵심을 쉽게 알아볼까요?`,
        en: `Let us break down "${safeKwEn}" clearly in four quick panels!`,
      },
      rise: {
        ko: `보통 '${safeKwKo}'를 건너뛰면 나중에 큰 혼란이 생기곤 해요.`,
        en: `Skipping "${safeKwEn}" is the most common mistake beginners make.`,
      },
      twist: {
        ko: `핵심은 간단해요! '${safeKwKo}' 세 가지 기준만 먼저 확인하세요.`,
        en: `The core rule is simple: verify these three checks for "${safeKwEn}".`,
      },
      climax: {
        ko: `기억하세요: '${safeKwKo}' 습관이 안전하고 당당한 창작의 시작입니다.`,
        en: `Key takeaway: practicing "${safeKwEn}" protects every creator's work.`,
      },
    },
  };

  const base = baseLines[genreId][stage];
  return applyToneToDialogue(base.ko, base.en, toneId, cutNumber);
}

export function getBeatStagesForCutCount(cutCount: 4 | 6 | 8): readonly TooningBeatStageId[] {
  if (cutCount === 4) {
    return ["intro", "rise", "twist", "climax"];
  }
  if (cutCount === 6) {
    return ["intro", "rise", "rise", "twist", "twist", "climax"];
  }
  return ["intro", "intro", "rise", "rise", "twist", "twist", "climax", "climax"];
}

export function resolveToneOverrides(
  base: TooningBeatTemplate,
  toneId: TooningToneId,
  cutIndex: number,
): {
  readonly expressionId: TooningExpressionId;
  readonly cameraId: TooningCameraId;
  readonly bubbleStyle: TooningBubbleStyleId;
  readonly sfxId: TooningSfxId;
} {
  if (toneId === "comic") {
    return {
      expressionId: cutIndex % 2 === 1 ? "panic" : "bright-smile",
      cameraId: cutIndex % 2 === 1 ? "close-up" : base.cameraId,
      bubbleStyle: cutIndex % 2 === 1 ? "shout" : "normal",
      sfxId: cutIndex % 2 === 1 ? "ungseong" : "banjjak",
    };
  }
  if (toneId === "tense") {
    return {
      expressionId: cutIndex >= 2 ? "shock" : "focus",
      cameraId: cutIndex % 2 === 1 ? "dutch-tilt" : cutIndex === 2 ? "extreme-eyes" : "low-hero",
      bubbleStyle: cutIndex >= 2 ? "shout" : base.bubbleStyle,
      sfxId: cutIndex >= 2 ? "kwang" : "dugeun",
    };
  }
  if (toneId === "touching") {
    return {
      expressionId: cutIndex === 2 ? "tears" : cutIndex === 3 ? "bright-smile" : "shy",
      cameraId: cutIndex >= 2 ? "close-up" : "medium-bust",
      bubbleStyle: cutIndex === 2 ? "thought" : "normal",
      sfxId: cutIndex === 3 ? "banjjak" : "dugeun",
    };
  }
  return {
    expressionId: base.expressionId,
    cameraId: base.cameraId,
    bubbleStyle: base.bubbleStyle,
    sfxId: base.sfxId,
  };
}
