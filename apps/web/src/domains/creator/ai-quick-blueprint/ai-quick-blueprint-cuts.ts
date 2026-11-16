import type {
  AiBlueprintCut,
  AiBlueprintFormatId,
  AiBlueprintLocale,
  AiBlueprintToneId,
} from "./ai-quick-blueprint-engine";

export function deriveShortCoreTopic(idea: string, locale: AiBlueprintLocale): string {
  const trimmed = idea.replace(/[.!?~]+$/gu, "").trim();
  if (locale === "ko") {
    const tokens = trimmed.split(/\s+/u).filter(Boolean);
    if (tokens.length <= 4) return trimmed;
    return tokens.slice(0, 4).join(" ");
  }
  const words = trimmed.split(/\s+/u).filter(Boolean);
  if (words.length <= 6) return trimmed;
  return words.slice(0, 6).join(" ");
}

export function buildInitialCuts(
  idea: string,
  formatId: AiBlueprintFormatId,
  toneId: AiBlueprintToneId,
  locale: AiBlueprintLocale,
): readonly AiBlueprintCut[] {
  const isSix = formatId === "webtoon-6";
  const isMoving = formatId === "movingtoon-4";
  const topic = deriveShortCoreTopic(idea, locale);

  if (locale === "ko") {
    const toneFlavor: Record<AiBlueprintToneId, { sfxOpen: string; sfxTurn: string; endLine: string }> = {
      romance: {
        sfxOpen: "토독, 사르르",
        sfxTurn: "두근—",
        endLine: "이 순간부터 우리의 내일이 달라지기 시작했다.",
      },
      action: {
        sfxOpen: "쿠구궁—!",
        sfxTurn: "파직!",
        endLine: "멈춰 있던 시간이 지금 다시 움직이기 시작했다.",
      },
      comedy: {
        sfxOpen: "타닥타닥… 띠용?!",
        sfxTurn: "두둥탁!",
        endLine: "잠깐만요, 제 평화로운 일상은 어디로 간 거죠?!",
      },
      mystery: {
        sfxOpen: "째깍… 끼익",
        sfxTurn: "섬뜩—",
        endLine: "분명 아무도 몰라야 할 기록에 내 이름이 적혀 있었다.",
      },
    };
    const flavor = toneFlavor[toneId];

    if (isSix) {
      return [
        {
          id: "cut-1",
          index: 1,
          beatKind: "setup",
          beatLabel: "1컷 · 오프닝 훅",
          shotAngle: "익스트림 와이드 전경 → 시선 유도 스크롤",
          scene: `공간 전경과 분위기 제시 — ${idea}`,
          dialogue: "오늘도 평소랑 다를 게 없는 하루라고 생각했는데…",
          narration: "모든 시작은 뜻밖의 순간에서 열렸다.",
          sfx: flavor.sfxOpen,
          stage3dHint: "3D 거리/실내 프리셋 + 창가 주광 조명",
          remixRevision: 0,
        },
        {
          id: "cut-2",
          index: 2,
          beatKind: "dialogue",
          beatLabel: "2컷 · 일상 균열",
          shotAngle: "미디엄 바스트 샷 (주인공 시선 포착)",
          scene: `주인공이 ‘${topic}’의 결정적 흔적을 처음 마주하고 멈춰 선다.`,
          dialogue: "잠깐… 이게 왜 지금 내 눈앞에 있는 거지?",
          narration: "그냥 지나칠 수도 있었다. 호기심이 손을 뻗기 전까지는.",
          sfx: "스륵",
          stage3dHint: "소품 클로즈업 + 얕은 피사계 심도",
          remixRevision: 0,
        },
        {
          id: "cut-3",
          index: 3,
          beatKind: "reaction",
          beatLabel: "3컷 · 첫 조우",
          shotAngle: "오버 더 숄더 투샷 (인물 거리감 강조)",
          scene: "예상치 못한 상대역이 등장해 주인공에게 의미심장한 말을 건넨다.",
          dialogue: "드디어 찾았네. 그거, 아무나 열 수 있는 게 아니거든.",
          narration: "낯선 목소리가 정적을 갈랐다.",
          sfx: "타박",
          stage3dHint: "2인 대치 카메라 프리셋 · 역광 림라이트",
          remixRevision: 0,
        },
        {
          id: "cut-4",
          index: 4,
          beatKind: "action",
          beatLabel: "4컷 · 갈등 고조",
          shotAngle: "더치 앵글 클로즈업 (긴장감 상승)",
          scene: "돌이킬 수 없는 규칙이나 조건이 밝혀지며 선택의 기로에 선다.",
          dialogue: "지금 결정해야 해. 여기서 덮을래, 아니면 끝까지 가 볼래?",
          narration: "주어진 시간은 단 한 번뿐이었다.",
          sfx: flavor.sfxTurn,
          stage3dHint: "강한 명암 대비 · 집중선 레이어",
          remixRevision: 0,
        },
        {
          id: "cut-5",
          index: 5,
          beatKind: "reveal",
          beatLabel: "5컷 · 결정적 선택",
          shotAngle: "로우 앵글 히어로 샷",
          scene: "주인공이 망설임을 거두고 직접 행동으로 답하며 분위기가 반전된다.",
          dialogue: "좋아, 해 보자. 대신 내 방식대로 갈 거야.",
          narration: "두려움보다 먼저 움직인 건 작은 확신이었다.",
          sfx: "탁!",
          stage3dHint: "3D 로우 앵글 카메라 + 역동 포즈 프리셋",
          remixRevision: 0,
        },
        {
          id: "cut-6",
          index: 6,
          beatKind: "transition",
          beatLabel: "6컷 · 엔딩 클리프행어",
          shotAngle: "세로 풀블리드 임팩트 컷 (여백 후 공개)",
          scene: "선택 직후 새롭게 드러난 세계의 단서가 화면 가득 펼쳐진다.",
          dialogue: "이제 진짜 첫 페이지가 열렸어.",
          narration: flavor.endLine,
          sfx: "우웅—",
          stage3dHint: "세로 여백 연출 + 하단 다음 화 훅",
          remixRevision: 0,
        },
      ];
    }

    const motionTag = isMoving ? " · 천천히 줌인(Slow Push-In)" : "";
    return [
      {
        id: "cut-1",
        index: 1,
        beatKind: "setup",
        beatLabel: "1컷 · 기 (도입)",
        shotAngle: `와이드 상황 설정 샷${motionTag}`,
        scene: `첫눈에 상황이 읽히는 도입 — ${idea}`,
        dialogue: "아니, 오늘따라 왜 이런 일이 생기는 건데?",
        narration: `평범했던 하루에 ‘${topic}’이(가) 툭 떨어졌다.`,
        sfx: flavor.sfxOpen,
        stage3dHint: "배경 전체 구도 + 말풍선 상단 안전 영역",
        remixRevision: 0,
      },
      {
        id: "cut-2",
        index: 2,
        beatKind: "dialogue",
        beatLabel: "2컷 · 승 (전개)",
        shotAngle: isMoving ? "미디엄 투샷 · 패닝 전환" : "미디엄 투샷 (표정 대비)",
        scene: "주인공이 상황을 확인하려 다가서자 뜻밖의 반응이 돌아온다.",
        dialogue: "설마 진짜로 작동할 줄은 몰랐지?",
        narration: "그 말을 듣는 순간 직감했다.",
        sfx: "움찔",
        stage3dHint: "인물 상반신 포즈 + 표정 포커스",
        remixRevision: 0,
      },
      {
        id: "cut-3",
        index: 3,
        beatKind: "reveal",
        beatLabel: "3컷 · 전 (반전 포인트)",
        shotAngle: isMoving ? "익스트림 클로즈업 · 퀵 줌" : "익스트림 클로즈업 (하이라이트)",
        scene: "예상을 뒤집는 핵심 반전이 드러나며 공기가 단숨에 바뀐다.",
        dialogue: "잠깐만… 처음부터 나를 기다리고 있었던 거야?!",
        narration: "모든 조각이 한 줄로 맞춰졌다.",
        sfx: flavor.sfxTurn,
        stage3dHint: "강조 배경 톤 + 반전 클로즈업",
        remixRevision: 0,
      },
      {
        id: "cut-4",
        index: 4,
        beatKind: "reaction",
        beatLabel: "4컷 · 결 (여운·공유 포인트)",
        shotAngle: isMoving ? "풀샷 아웃트로 · 페이드 홀드" : "여운 남는 미디엄 풀샷",
        scene: "새로운 일상을 받아들인 주인공의 한마디로 다음 이야기를 기대하게 만든다.",
        dialogue: "좋아, 이왕 이렇게 된 거 끝까지 가 보자!",
        narration: flavor.endLine,
        sfx: "반짝",
        stage3dHint: "따뜻한 마무리 조명 + 다음 편 예고 여백",
        remixRevision: 0,
      },
    ];
  }

  const flavorEn: Record<AiBlueprintToneId, { sfxOpen: string; sfxTurn: string; endLine: string }> = {
    romance: {
      sfxOpen: "Pitter-patter",
      sfxTurn: "Ba-dump",
      endLine: "From that quiet moment on, tomorrow stopped looking ordinary.",
    },
    action: {
      sfxOpen: "RUMBLE—!",
      sfxTurn: "CRACK!",
      endLine: "The clock that had been frozen finally started moving again.",
    },
    comedy: {
      sfxOpen: "Tap-tap… Huh?!",
      sfxTurn: "TA-DA!",
      endLine: "Wait a second—where did my peaceful routine just go?!",
    },
    mystery: {
      sfxOpen: "Tick… creak",
      sfxTurn: "CHILL—",
      endLine: "Written on a page nobody could have touched was my own name.",
    },
  };
  const fEn = flavorEn[toneId];

  if (isSix) {
    return [
      {
        id: "cut-1",
        index: 1,
        beatKind: "setup",
        beatLabel: "Panel 1 · Opening Hook",
        shotAngle: "Wide establishing shot → vertical scroll lead-in",
        scene: `Establishing mood and setting — ${idea}`,
        dialogue: "I really thought today would be just another quiet day…",
        narration: "Every turning point begins one beat before you notice it.",
        sfx: fEn.sfxOpen,
        stage3dHint: "3D street/interior preset + window key light",
        remixRevision: 0,
      },
      {
        id: "cut-2",
        index: 2,
        beatKind: "dialogue",
        beatLabel: "Panel 2 · Inciting Spark",
        shotAngle: "Medium portrait shot (eye-line focus)",
        scene: `The lead spots the unmistakable sign of "${topic}" and stops short.`,
        dialogue: "Hold on… why is this sitting right in front of me?",
        narration: "Walking past was still an option—until curiosity reached out first.",
        sfx: "Rustle",
        stage3dHint: "Prop close-up + shallow depth of field",
        remixRevision: 0,
      },
      {
        id: "cut-3",
        index: 3,
        beatKind: "reaction",
        beatLabel: "Panel 3 · First Encounter",
        shotAngle: "Over-the-shoulder two-shot",
        scene: "The counterpart steps into frame with a calm, knowing remark.",
        dialogue: "So you finally found it. Not just anyone can open that.",
        narration: "An unfamiliar voice cut straight through the silence.",
        sfx: "Step",
        stage3dHint: "Two-character staging + rim backlight",
        remixRevision: 0,
      },
      {
        id: "cut-4",
        index: 4,
        beatKind: "action",
        beatLabel: "Panel 4 · Rising Stakes",
        shotAngle: "Tilted close-up (rising tension)",
        scene: "The hidden condition comes to light, forcing an immediate choice.",
        dialogue: "Choose right now—walk away here, or see what's on the other side?",
        narration: "There would not be a second invitation.",
        sfx: fEn.sfxTurn,
        stage3dHint: "High-contrast shadow + focus speedlines",
        remixRevision: 0,
      },
      {
        id: "cut-5",
        index: 5,
        beatKind: "reveal",
        beatLabel: "Panel 5 · Decisive Turn",
        shotAngle: "Low-angle hero shot",
        scene: "Setting hesitation aside, the lead commits and flips the momentum.",
        dialogue: "Count me in. Just don't expect me to play by the old rules.",
        narration: "Conviction moved half a step faster than fear.",
        sfx: "SNAP!",
        stage3dHint: "Low-angle 3D camera + dynamic action pose",
        remixRevision: 0,
      },
      {
        id: "cut-6",
        index: 6,
        beatKind: "transition",
        beatLabel: "Panel 6 · Cliffhanger Reveal",
        shotAngle: "Full-bleed vertical reveal panel",
        scene: "A wider truth unfolds across the frame right after the decision.",
        dialogue: "Looks like page one just opened for real.",
        narration: fEn.endLine,
        sfx: "HUMMM—",
        stage3dHint: "Vertical scroll pause + episode hook framing",
        remixRevision: 0,
      },
    ];
  }

  const motionSuffixEn = isMoving ? " · Slow push-in" : "";
  return [
    {
      id: "cut-1",
      index: 1,
      beatKind: "setup",
      beatLabel: "Panel 1 · Setup",
      shotAngle: `Wide establishing frame${motionSuffixEn}`,
      scene: `Instant visual hook — ${idea}`,
      dialogue: "Okay, seriously—how did my day turn into this?",
      narration: `Out of nowhere, "${topic}" landed right in the middle of my routine.`,
      sfx: fEn.sfxOpen,
      stage3dHint: "Clean room/street layout + top balloon safe zone",
      remixRevision: 0,
    },
    {
      id: "cut-2",
      index: 2,
      beatKind: "dialogue",
      beatLabel: "Panel 2 · Escalation",
      shotAngle: isMoving ? "Medium two-shot · gentle pan" : "Medium two-shot (expression contrast)",
      scene: "Testing the situation triggers an unexpectedly real reaction.",
      dialogue: "Wait… you didn't think it would actually answer back, did you?",
      narration: "That single look told me there was no turning back.",
      sfx: "Flinch",
      stage3dHint: "Upper-body pose pair + clear eye-line",
      remixRevision: 0,
    },
    {
      id: "cut-3",
      index: 3,
      beatKind: "reveal",
      beatLabel: "Panel 3 · Twist",
      shotAngle: isMoving ? "Tight close-up · quick zoom" : "Tight close-up (twist beat)",
      scene: "The core twist lands and reframes the opening clue.",
      dialogue: "Hold on—it was waiting for me from the very beginning?!",
      narration: "Every scattered clue clicked into a single line.",
      sfx: fEn.sfxTurn,
      stage3dHint: "Accent lighting + dramatic close-up",
      remixRevision: 0,
    },
    {
      id: "cut-4",
      index: 4,
      beatKind: "reaction",
      beatLabel: "Panel 4 · Payoff",
      shotAngle: isMoving ? "Full-frame outro · hold" : "Warm medium-full payoff shot",
      scene: "Accepting the new reality leaves readers eager for the next episode.",
      dialogue: "Fine! Since we're already here, let's see this through!",
      narration: fEn.endLine,
      sfx: "Sparkle",
      stage3dHint: "Warm key light + clean closing composition",
      remixRevision: 0,
    },
  ];
}
