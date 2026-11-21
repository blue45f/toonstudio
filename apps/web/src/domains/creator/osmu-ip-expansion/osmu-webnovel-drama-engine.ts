/**
 * OSMU IP 확장 엔진 1부 — 웹툰 ↔ 웹소설 양방향 각색 엔진 + 웹드라마/OTT 피칭 재수출.
 * 100% 무과금(₩0) 로컬 결정론적 규칙 엔진이다.
 */
import {
  WEBNOVEL_PLATFORM_SPECS,
  type AlignedSpeakerDialogue,
  type ContiShotSize,
  type NarratorPov,
  type WebnovelAdaptationResult,
  type WebnovelParagraphBlock,
  type WebnovelPlatformId,
  type WebtoonCharacterCard,
  type WebtoonContiPanel,
  type WebtoonCutEmotion,
  type WebtoonCutInput,
  type WebtoonEpisodeSource,
  type WebtoonOutlineFromNovelResult,
  type WebtoonSceneBreakdown,
} from "./osmu-webnovel-drama-types";

export { buildDramaPitchPackage } from "./osmu-drama-pitch-engine";
export {
  DRAMA_BUDGET_TIER_SPECS,
  SAMPLE_DRAMA_PITCH_INPUT,
  SAMPLE_WEBTOON_EPISODE,
  WEBNOVEL_PLATFORM_SPECS,
  type BudgetTierId,
  type DramaFormatId,
  type DramaPitchPackage,
  type DramaPlatformId,
  type NarratorPov,
  type WebnovelAdaptationResult,
  type WebnovelPlatformId,
  type WebtoonOutlineFromNovelResult,
} from "./osmu-webnovel-drama-types";

const EMOTION_LABELS_KO: Readonly<Record<WebtoonCutEmotion, string>> = Object.freeze({
  tension: "긴장",
  wonder: "경이",
  sorrow: "상실감",
  determination: "결의",
  relief: "안도",
  shock: "충격",
});

const EMOTION_SENSORY_BANK: Readonly<Record<WebtoonCutEmotion, readonly string[]>> = Object.freeze({
  tension: [
    "공기가 팽팽하게 당겨진 현처럼 무거워졌고, 숨소리 하나마저 바닥에 떨어지는 소리가 들릴 듯했다.",
    "손끝에 감도는 미세한 진동이 아직 끝나지 않은 위기를 경고하고 있었다.",
    "시야의 가장자리가 좁혀들며, 작은 기척 하나에도 신경이 날카롭게 반응했다.",
  ],
  wonder: [
    "눈앞에 펼쳐진 광경은 말로 정리하기 어려울 만큼 선명했고, 익숙했던 풍경의 경계가 단숨에 뒤집혔다.",
    "빛의 결이 공기 속 먼지마다 내려앉아 시간의 흐름조차 잠시 느려진 듯한 착각을 일으켰다.",
    "낯선 구조와 색채가 시선을 붙잡았고, 처음 마주한 질서가 천천히 윤곽을 드러냈다.",
  ],
  sorrow: [
    "남겨진 침묵이 말보다 더 선명하게 가슴을 눌렀고, 쉽게 지워지지 않는 기억이 발목을 붙잡았다.",
    "식어 버린 온기가 손바닥에 오래 머물러, 끝내 건네지 못한 말의 무게를 되새기게 했다.",
    "시선을 돌린 자리마다 지나간 흔적이 겹쳐 올라와 숨을 고르는 일조차 쉽지 않았다.",
  ],
  determination: [
    "망설임은 이미 지나갔다. 발끝을 단단히 딛자 흩어져 있던 생각이 하나의 방향으로 정렬됐다.",
    "목표가 선명해질수록 호흡은 차분해졌고, 다음 수를 계산하는 눈빛에 흔들림이 사라졌다.",
    "물러설 자리를 스스로 지워 버린 뒤에는 오직 앞으로 나아갈 선택지 하나만 남았다.",
  ],
  relief: [
    "굳어 있던 어깨에서 비로소 힘이 빠지며, 길게 참았던 숨이 천천히 바깥으로 흘러나왔다.",
    "거칠게 뛰던 맥박이 제자리를 찾아가자 주변의 소음과 온도가 다시 선명하게 들려오기 시작했다.",
    "위기의 파고가 한 발 물러난 자리에 짧은 정적이 내려앉았고, 비로소 서로의 얼굴이 눈에 들어왔다.",
  ],
  shock: [
    "예상했던 전제가 한순간에 무너져 내렸다. 귀를 의심하며 바라본 장면은 부정할 여지가 없었다.",
    "심장이 한 박자 늦게 내려앉았고, 머릿속에 세워 둔 모든 계산이 백지로 돌아갔다.",
    "단 한 줄의 진실이 지금까지 믿어 온 서사를 뿌리째 흔들어 놓았다.",
  ],
});

const TONE_BEATS: Readonly<Record<string, string>> = Object.freeze({
  냉정: "낮고 단단한 목소리로",
  다급: "숨을 몰아쉬며 다급하게",
  속삭임: "목소리를 한껏 낮춘 채",
  분노: "억눌렀던 감정을 터뜨리듯",
  결연: "흔들림 없는 시선으로",
  경악: "목소리가 미세하게 떨린 채",
  차분: "표정을 감춘 채 담담하게",
});

/** 한글 받침 유무에 따라 올바른 조사(은/는, 이/가, 을/를 등)를 붙인다. */
function withParticle(word: string, withBatchim: string, withoutBatchim: string): string {
  const trimmed = word.trim();
  if (!trimmed) return "";
  const lastCode = trimmed.charCodeAt(trimmed.length - 1);
  if (lastCode >= 0xac00 && lastCode <= 0xd7a3) {
    const hasBatchim = (lastCode - 0xac00) % 28 !== 0;
    return `${trimmed}${hasBatchim ? withBatchim : withoutBatchim}`;
  }
  return `${trimmed}${withoutBatchim}`;
}

function subjectRef(pov: NarratorPov, protagonistName: string): string {
  return pov === "first-person" ? "나는" : withParticle(protagonistName, "은", "는");
}

function possessiveRef(pov: NarratorPov, protagonistName: string): string {
  return pov === "first-person" ? "내" : `${protagonistName}의`;
}

function buildSensoryExpansionParagraph(
  cut: WebtoonCutInput,
  pov: NarratorPov,
  protagonistName: string,
  genre: string,
  passIndex: number,
): string {
  const bank = EMOTION_SENSORY_BANK[cut.emotion];
  const sensoryLine = bank[passIndex % bank.length] ?? bank[0];
  const subject = subjectRef(pov, protagonistName);
  const poss = possessiveRef(pov, protagonistName);
  const sfxText =
    cut.sfx && cut.sfx.length > 0
      ? `귓가에는 ‘${cut.sfx.join(" · ")}’ 하는 잔향이 낮게 울려 퍼졌다.`
      : `${cut.timeOfDay}의 공기가 ${cut.location} 바닥 위로 차갑게 가라앉아 있었다.`;
  const templates = [
    `${cut.location}의 ${cut.timeOfDay} 풍경 속에서 ${subject} 잠시 발걸음을 멈추고 호흡을 가다듬었다. ${sensoryLine} ${sfxText} ${poss} 머릿속에는 방금 지나간 ${cut.sceneHeading}의 단서들이 빠르게 겹쳐졌다.`,
    `${cut.cameraCue} 구도처럼 시선이 한 점으로 모이자, ${cut.backgroundDescription} 사이로 미처 보지 못했던 결이 드러났다. ${sensoryLine} ${genre} 서사의 분기점이 바로 이 장면에서 열리고 있다는 직감이 또렷했다.`,
    `${subject} ${cut.location}의 공기를 깊게 들이마시며 다음 움직임을 가늠했다. ${cut.actionStageDirection} 직후 찾아온 짧은 정적 속에서 ${EMOTION_LABELS_KO[cut.emotion]}의 밀도가 한층 더 짙어졌다. ${sfxText}`,
  ];
  return templates[passIndex % templates.length] ?? templates[0];
}

function formatChapterTitle(
  platform: WebnovelPlatformId,
  episodeNumber: number,
  episodeTitle: string,
): string {
  if (platform === "munpia") return `[${episodeNumber}화] ${episodeTitle}`;
  if (platform === "naver-series") return `${episodeNumber}화. ${episodeTitle}`;
  return `제${episodeNumber}화. ${episodeTitle}`;
}

/**
 * 1-A. 웹툰 컷 원고 → 카카오페이지/문피아/네이버시리즈 규격 1화 산문 초안 생성.
 * 모든 컷의 대사·화자·지문·배경 묘사를 손실 없이 반영하고 목표 분량(4,500~5,500자)에 맞춘다.
 */
export function adaptWebtoonToWebnovel(episode: WebtoonEpisodeSource): WebnovelAdaptationResult {
  const spec = WEBNOVEL_PLATFORM_SPECS[episode.platform];
  const targetChars = Math.min(
    spec.targetMaxChars,
    Math.max(spec.targetMinChars, episode.targetCharCount ?? spec.recommendedChars),
  );
  const chapterTitle = formatChapterTitle(
    episode.platform,
    episode.episodeNumber,
    episode.episodeTitle,
  );
  const cuts = episode.cuts;

  if (cuts.length === 0) {
    const emptyHook = `${episode.seriesTitle} ${chapterTitle} — 등록된 웹툰 컷이 없어 산문 초안을 생성할 수 없습니다.`;
    return {
      seriesTitle: episode.seriesTitle,
      episodeNumber: episode.episodeNumber,
      chapterTitle,
      platform: episode.platform,
      platformSpec: spec,
      pov: episode.pov,
      openingHook: emptyHook,
      endingHook: emptyHook,
      paragraphs: [],
      fullProse: `${chapterTitle}\n\n${emptyHook}`,
      charCountWithSpaces: emptyHook.length + chapterTitle.length + 2,
      charCountWithoutSpaces: (chapterTitle + emptyHook).replace(/\s+/gu, "").length,
      meetsPlatformRange: false,
      readingTimeMinutes: 0,
      dialogueRatioPercent: 0,
      speakerDialogueAlignment: [],
      preservedCutCount: 0,
      preservedDialogueCount: 0,
      markdownExport: `# ${chapterTitle}\n\n${emptyHook}\n`,
    };
  }

  const firstCut = cuts[0];
  const lastCut = cuts[cuts.length - 1];
  const openingHook = `${firstCut.timeOfDay}, ${firstCut.location}. ${firstCut.backgroundDescription} 그 정적을 깨며 ${subjectRef(episode.pov, episode.protagonistName)} 마침내 움직이기 시작했다.`;
  const lastDialogue = lastCut.dialogues[lastCut.dialogues.length - 1];
  const endingHook = lastDialogue
    ? `${spec.quoteOpen}${lastDialogue.line}${spec.quoteClose} — ${lastCut.location}에 남은 그 한마디가 다음 화의 판도를 완전히 뒤집어 놓을 참이었다.`
    : `${lastCut.actionStageDirection} 그리고 ${lastCut.location}의 어둠 너머에서 다음 화를 여는 낯선 신호가 번쩍였다.`;

  const blocks: WebnovelParagraphBlock[] = [];
  const alignedDialogues: AlignedSpeakerDialogue[] = [];
  let prevSceneHeading = "";

  const pushBlock = (
    sceneHeading: string,
    cutNumbers: readonly number[],
    kind: WebnovelParagraphBlock["kind"],
    text: string,
    speaker?: string,
  ) => {
    blocks.push({
      index: blocks.length + 1,
      sceneHeading,
      sourceCutNumbers: cutNumbers,
      kind,
      ...(speaker ? { speaker } : {}),
      text,
    });
  };

  pushBlock(firstCut.sceneHeading, [firstCut.cutNumber], "scene-setting", openingHook);

  for (const cut of cuts) {
    if (cut.sceneHeading !== prevSceneHeading) {
      if (prevSceneHeading !== "") {
        pushBlock(cut.sceneHeading, [cut.cutNumber], "scene-setting", `***\n[장면 전환 · ${cut.sceneHeading}] ${cut.location} (${cut.timeOfDay})`);
      } else {
        pushBlock(cut.sceneHeading, [cut.cutNumber], "scene-setting", `[장면 · ${cut.sceneHeading}] ${cut.location} (${cut.timeOfDay})`);
      }
      prevSceneHeading = cut.sceneHeading;
    }

    const sfxNote =
      cut.sfx && cut.sfx.length > 0 ? ` 사방에 ‘${cut.sfx.join(", ")}’ 소리가 번졌다.` : "";
    const actionProse = `${cut.backgroundDescription} ${cut.actionStageDirection} (${cut.cameraCue} 시선)${sfxNote}`;
    pushBlock(cut.sceneHeading, [cut.cutNumber], "action", actionProse);

    for (const dlg of cut.dialogues) {
      const toneKey = dlg.tone ?? "차분";
      const tonePhrase = TONE_BEATS[toneKey] ?? `${toneKey} 어조로`;
      const quoted = `${spec.quoteOpen}${dlg.line}${spec.quoteClose}`;
      const formattedLine = `${withParticle(dlg.speaker, "이", "가")} ${tonePhrase} 말했다.\n${quoted}`;
      alignedDialogues.push({
        cutNumber: cut.cutNumber,
        speaker: dlg.speaker,
        tone: toneKey,
        originalLine: dlg.line,
        formattedLine,
      });
      pushBlock(cut.sceneHeading, [cut.cutNumber], "dialogue", formattedLine, dlg.speaker);
    }

    if (cut.narration && cut.narration.trim().length > 0) {
      const sensory = EMOTION_SENSORY_BANK[cut.emotion][cut.cutNumber % 3] ?? "";
      pushBlock(
        cut.sceneHeading,
        [cut.cutNumber],
        "inner-monologue",
        `${cut.narration.trim()} ${sensory}`,
      );
    }
  }

  // 목표 연재 분량(4,500~5,500자)에 미달할 때 컷별 배경·감정·호흡 묘사를 균등 보강한다.
  const measureProse = (items: readonly WebnovelParagraphBlock[], hookText: string): number =>
    chapterTitle.length +
    2 +
    items.reduce((sum, block) => sum + block.text.length + 2, 0) +
    hookText.length;

  let pass = 0;
  while (measureProse(blocks, endingHook) < targetChars - 180 && pass < 24) {
    const cut = cuts[pass % cuts.length];
    const expansion = buildSensoryExpansionParagraph(
      cut,
      episode.pov,
      episode.protagonistName,
      episode.genre,
      pass,
    );
    const projected = measureProse(blocks, endingHook) + expansion.length + 2;
    if (projected > spec.targetMaxChars - 40) break;

    // 해당 컷의 마지막 블록 바로 뒤에 삽입해 장면 흐름을 유지한다.
    let insertAt = blocks.length;
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      if (blocks[i].sourceCutNumbers.includes(cut.cutNumber)) {
        insertAt = i + 1;
        break;
      }
    }
    blocks.splice(insertAt, 0, {
      index: 0,
      sceneHeading: cut.sceneHeading,
      sourceCutNumbers: [cut.cutNumber],
      kind: "inner-monologue",
      text: expansion,
    });
    pass += 1;
  }

  pushBlock(lastCut.sceneHeading, [lastCut.cutNumber], "cliffhanger", endingHook);

  const normalizedBlocks = blocks.map((block, idx) => ({
    ...block,
    index: idx + 1,
  }));

  const fullProse = [chapterTitle, ...normalizedBlocks.map((b) => b.text)].join("\n\n");
  const charCountWithSpaces = fullProse.length;
  const charCountWithoutSpaces = fullProse.replace(/\s+/gu, "").length;
  const dialogueChars = normalizedBlocks
    .filter((b) => b.kind === "dialogue")
    .reduce((sum, b) => sum + b.text.length, 0);
  const dialogueRatioPercent =
    charCountWithSpaces > 0 ? Math.round((dialogueChars / charCountWithSpaces) * 100) : 0;
  const readingTimeMinutes = Number(Math.max(1, charCountWithSpaces / 780).toFixed(1));
  const meetsPlatformRange =
    charCountWithSpaces >= spec.targetMinChars && charCountWithSpaces <= spec.targetMaxChars;

  const markdownExport = [
    `# ${episode.seriesTitle} — ${chapterTitle}`,
    "",
    `- **플랫폼 규격**: ${spec.labelKo} (${spec.targetMinChars.toLocaleString("ko-KR")}~${spec.targetMaxChars.toLocaleString("ko-KR")}자)`,
    `- **분량**: 공백 포함 ${charCountWithSpaces.toLocaleString("ko-KR")}자 / 공백 제외 ${charCountWithoutSpaces.toLocaleString("ko-KR")}자 (예상 읽기 ${readingTimeMinutes}분)`,
    `- **보존 검증**: 원본 컷 ${cuts.length}컷 · 대사 ${alignedDialogues.length}건 100% 정렬`,
    "",
    "---",
    "",
    fullProse,
    "",
  ].join("\n");

  return {
    seriesTitle: episode.seriesTitle,
    episodeNumber: episode.episodeNumber,
    chapterTitle,
    platform: episode.platform,
    platformSpec: spec,
    pov: episode.pov,
    openingHook,
    endingHook,
    paragraphs: normalizedBlocks,
    fullProse,
    charCountWithSpaces,
    charCountWithoutSpaces,
    meetsPlatformRange,
    readingTimeMinutes,
    dialogueRatioPercent,
    speakerDialogueAlignment: alignedDialogues,
    preservedCutCount: cuts.length,
    preservedDialogueCount: alignedDialogues.length,
    markdownExport,
  };
}

const QUOTE_LINE_REGEX = /[“"「]([^”"」]+)[”"」]/gu;
const SPEAKER_BEFORE_REGEX =
  /([가-힣A-Za-z0-9]{2,10})(?:이|가|은|는)\s+[^.\n]{0,36}?(?:말했다|물었다|외쳤다|속삭였다|대답했다|중얼거렸다|내뱉었다|소리쳤다|덧붙였다|입을 열었다)/u;
const COLON_SPEAKER_REGEX = /^([가-힣A-Za-z0-9]{2,10})\s*[:：]\s*[“"「]?([^”"」\n]+)[”"」]?$/u;

function inferMoodFromText(text: string): WebtoonCutEmotion {
  if (/경악|충격|무너|배신|폭발|진실|뒤집/u.test(text)) return "shock";
  if (/결심|결의|각오|칼날|물러설|정면/u.test(text)) return "determination";
  if (/긴장|경고|숨소리|위기|그림자|추격/u.test(text)) return "tension";
  if (/눈물|상실|침묵|그리움|식어|기억/u.test(text)) return "sorrow";
  if (/안도|미소|숨이|평온|풀렸다/u.test(text)) return "relief";
  return "wonder";
}

function inferSfxFromText(text: string): readonly string[] {
  const sfxMatches = [...text.matchAll(/[‘']([가-힣]{2,8})[’']/gu)].map((m) => m[1]);
  if (sfxMatches.length > 0) return Array.from(new Set(sfxMatches)).slice(0, 3);
  if (/폭발|충돌|깨지/u.test(text)) return ["콰앙!", "쩍—"];
  if (/발걸음|뛰|달려/u.test(text)) return ["타닥", "탁!"];
  if (/문|열리|닫/u.test(text)) return ["끼이익", "철컥"];
  return ["스윽"];
}

function chooseShotSize(
  panelIdx: number,
  totalPanels: number,
  hasDialogue: boolean,
  mood: WebtoonCutEmotion,
): ContiShotSize {
  if (panelIdx === 0) return "EXTREME_WIDE";
  if (panelIdx === totalPanels - 1 && (mood === "shock" || mood === "tension")) {
    return "EXTREME_CLOSE_UP";
  }
  if (hasDialogue) return panelIdx % 2 === 0 ? "CLOSE_UP" : "MEDIUM";
  return panelIdx % 3 === 0 ? "WIDE" : "INSERT";
}

/**
 * 1-B. 웹소설 원문 → 웹툰 씬 분할 · 컷 수 배분 · 등장인물 카드 · 대사/나레이션 분리 콘티 시트 추출.
 */
export function adaptWebnovelToWebtoonOutline(
  novelText: string,
  options?: {
    readonly episodeTitle?: string;
    readonly targetCutsPerEpisode?: number;
  },
): WebtoonOutlineFromNovelResult {
  const rawLines = novelText
    .replace(/\r\n/gu, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (rawLines.length === 0) {
    return {
      episodeTitle: options?.episodeTitle ?? "제목 미정 1화",
      scenes: [],
      characterCards: [],
      totalAllocatedCuts: 0,
      dialogueBlocks: [],
      narrationBlocks: [],
      roundTripCoverage: {
        totalSourceDialogues: 0,
        extractedDialogues: 0,
        totalSourceParagraphs: 0,
        preservedTextRatioPercent: 0,
      },
      markdownExport: "# 웹툰 콘티 시트\n\n입력된 웹소설 본문이 없습니다.\n",
    };
  }

  let startIdx = 0;
  let detectedTitle = options?.episodeTitle ?? "";
  const firstLine = rawLines[0];
  if (/^(?:제?\d+화|\[\d+화\]|#\s*)/u.test(firstLine)) {
    detectedTitle = detectedTitle || firstLine.replace(/^#\s*/u, "");
    startIdx = 1;
  } else if (!detectedTitle) {
    detectedTitle = firstLine.slice(0, 28);
  }

  const bodyLines = rawLines.slice(startIdx);
  const rawSceneBuckets: {
    heading: string;
    locationHint: string;
    lines: string[];
  }[] = [];

  const ensureBucket = (heading: string, locationHint: string) => {
    rawSceneBuckets.push({ heading, locationHint, lines: [] });
  };

  for (const line of bodyLines) {
    if (line === "***" || line === "---") {
      ensureBucket(`씬 ${rawSceneBuckets.length + 1}`, "장면 전환 지점");
      continue;
    }
    const sceneMarker = line.match(/^\[장면(?:\s*전환)?\s*·\s*([^\]]+)\]\s*(.*)$/u);
    if (sceneMarker) {
      const heading = sceneMarker[1].trim();
      const locationHint = sceneMarker[2].trim() || heading;
      const last = rawSceneBuckets[rawSceneBuckets.length - 1];
      if (last && last.lines.length === 0) {
        last.heading = heading;
        last.locationHint = locationHint;
      } else {
        ensureBucket(heading, locationHint);
      }
      continue;
    }
    if (rawSceneBuckets.length === 0) {
      ensureBucket("씬 1 · 오프닝", "도입 배경");
    }
    rawSceneBuckets[rawSceneBuckets.length - 1].lines.push(line);
  }

  // 구분자가 없는 일반 웹소설 텍스트는 문단 수에 맞춰 3~4개 씬으로 자동 분할한다.
  let sceneBuckets = rawSceneBuckets.filter((bucket) => bucket.lines.length > 0);
  if (sceneBuckets.length === 1 && sceneBuckets[0].lines.length >= 6) {
    const allLines = sceneBuckets[0].lines;
    const desiredScenes = Math.min(4, Math.max(2, Math.round(allLines.length / 4)));
    const chunkSize = Math.ceil(allLines.length / desiredScenes);
    const actHints = ["도입 · 공간 설정", "전개 · 대사 충돌", "위기 · 단서 포착", "클라이맥스 · 엔딩 훅"];
    sceneBuckets = [];
    for (let i = 0; i < desiredScenes; i += 1) {
      const slice = allLines.slice(i * chunkSize, (i + 1) * chunkSize);
      if (slice.length > 0) {
        sceneBuckets.push({
          heading: `씬 ${i + 1} · ${actHints[i] ?? "전환"}`,
          locationHint: slice[0].slice(0, 26),
          lines: slice,
        });
      }
    }
  }

  const allDialogueBlocks: { sceneNumber: number; speaker: string; text: string }[] = [];
  const allNarrationBlocks: { sceneNumber: number; text: string }[] = [];
  const characterStats = new Map<
    string,
    { count: number; firstScene: number; sampleQuote: string; emotions: Set<string> }
  >();

  let totalSourceQuotes = 0;
  for (const line of bodyLines) {
    const matches = [...line.matchAll(QUOTE_LINE_REGEX)];
    totalSourceQuotes += matches.length;
    if (matches.length === 0 && COLON_SPEAKER_REGEX.test(line)) {
      totalSourceQuotes += 1;
    }
  }

  const targetTotalCuts = Math.max(
    sceneBuckets.length * 4,
    options?.targetCutsPerEpisode ?? Math.min(68, Math.max(24, bodyLines.length * 2)),
  );

  // 각 씬의 가중치(라인 수 + 대사 수)로 컷 수를 배분하고 정확히 targetTotalCuts에 맞춘다.
  const weights = sceneBuckets.map((bucket) => {
    const quoteCount = bucket.lines.reduce(
      (sum, line) => sum + [...line.matchAll(QUOTE_LINE_REGEX)].length,
      0,
    );
    return Math.max(2, bucket.lines.length + quoteCount * 2);
  });
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const cutAllocations = weights.map((w) => Math.max(4, Math.round((w / totalWeight) * targetTotalCuts)));
  const allocatedDiff = targetTotalCuts - cutAllocations.reduce((sum, c) => sum + c, 0);
  if (cutAllocations.length > 0) {
    cutAllocations[cutAllocations.length - 1] = Math.max(
      4,
      cutAllocations[cutAllocations.length - 1] + allocatedDiff,
    );
  }

  const scenes: WebtoonSceneBreakdown[] = [];
  let runningCutCursor = 1;
  let panelGlobalNumber = 1;
  let preservedChars = 0;

  for (let sIdx = 0; sIdx < sceneBuckets.length; sIdx += 1) {
    const bucket = sceneBuckets[sIdx];
    const sceneNumber = sIdx + 1;
    const allocatedCuts = cutAllocations[sIdx] ?? 4;
    const cutStart = runningCutCursor;
    const cutEnd = runningCutCursor + allocatedCuts - 1;
    runningCutCursor = cutEnd + 1;

    const sceneText = bucket.lines.join(" ");
    const mood = inferMoodFromText(sceneText);
    const panels: WebtoonContiPanel[] = [];
    let pendingSpeaker = "화자 미지정";

    for (let lIdx = 0; lIdx < bucket.lines.length; lIdx += 1) {
      const line = bucket.lines[lIdx];
      const speakerHintMatch = line.match(SPEAKER_BEFORE_REGEX);
      if (speakerHintMatch) {
        pendingSpeaker = speakerHintMatch[1];
      }

      const colonMatch = line.match(COLON_SPEAKER_REGEX);
      const quoteMatches = [...line.matchAll(QUOTE_LINE_REGEX)];

      if (colonMatch) {
        const speaker = colonMatch[1];
        const quoteText = colonMatch[2].trim();
        pendingSpeaker = speaker;
        preservedChars += line.length;
        allDialogueBlocks.push({ sceneNumber, speaker, text: quoteText });
        const prev = characterStats.get(speaker) ?? {
          count: 0,
          firstScene: sceneNumber,
          sampleQuote: quoteText,
          emotions: new Set<string>(),
        };
        prev.count += 1;
        prev.emotions.add(EMOTION_LABELS_KO[mood]);
        characterStats.set(speaker, prev);

        panels.push({
          panelNumber: panelGlobalNumber++,
          shotSize: chooseShotSize(lIdx, bucket.lines.length, true, mood),
          visualDirection: `${speaker} 클로즈업 · 표정 반응 컷`,
          dialogues: [{ speaker, text: quoteText }],
          narrations: [],
          sfxSuggestions: [],
          scrollBeatHeightPx: 1180,
        });
        continue;
      }

      if (quoteMatches.length > 0) {
        const lineDialogues: { speaker: string; text: string }[] = [];
        for (const match of quoteMatches) {
          const quoteText = match[1].trim();
          const speaker = speakerHintMatch ? speakerHintMatch[1] : pendingSpeaker;
          lineDialogues.push({ speaker, text: quoteText });
          allDialogueBlocks.push({ sceneNumber, speaker, text: quoteText });
          const prev = characterStats.get(speaker) ?? {
            count: 0,
            firstScene: sceneNumber,
            sampleQuote: quoteText,
            emotions: new Set<string>(),
          };
          prev.count += 1;
          prev.emotions.add(EMOTION_LABELS_KO[mood]);
          characterStats.set(speaker, prev);
        }
        const strippedNarration = line.replace(QUOTE_LINE_REGEX, "").trim();
        if (strippedNarration.length > 0 && !SPEAKER_BEFORE_REGEX.test(strippedNarration)) {
          allNarrationBlocks.push({ sceneNumber, text: strippedNarration });
        }
        preservedChars += line.length;
        panels.push({
          panelNumber: panelGlobalNumber++,
          shotSize: chooseShotSize(lIdx, bucket.lines.length, true, mood),
          visualDirection:
            strippedNarration.length > 0
              ? strippedNarration
              : `${lineDialogues[0]?.speaker ?? "인물"} 대사 전달 컷`,
          dialogues: lineDialogues,
          narrations: strippedNarration.length > 0 ? [strippedNarration] : [],
          sfxSuggestions: [],
          scrollBeatHeightPx: 1240,
        });
      } else {
        // 순수 화자 지시줄(“OOO가 말했다.”)은 다음 줄 대사에 귀속되고 지문으로도 기록한다.
        preservedChars += line.length;
        if (!SPEAKER_BEFORE_REGEX.test(line)) {
          allNarrationBlocks.push({ sceneNumber, text: line });
          panels.push({
            panelNumber: panelGlobalNumber++,
            shotSize: chooseShotSize(lIdx, bucket.lines.length, false, mood),
            visualDirection: line.slice(0, 120),
            dialogues: [],
            narrations: [line],
            sfxSuggestions: inferSfxFromText(line),
            scrollBeatHeightPx: lIdx === 0 ? 1850 : 1420,
          });
        }
      }
    }

    const pacing: WebtoonSceneBreakdown["pacing"] =
      sIdx === 0
        ? "establishing"
        : sIdx === sceneBuckets.length - 1
          ? "cliffhanger"
          : mood === "shock" || mood === "determination"
            ? "climax"
            : panels.some((p) => p.dialogues.length > 0)
              ? "dialogue-exchange"
              : "tension-build";

    scenes.push({
      sceneNumber,
      heading: bucket.heading,
      locationHint: bucket.locationHint,
      mood,
      allocatedCutCount: allocatedCuts,
      cutStart,
      cutEnd,
      pacing,
      panels,
    });
  }

  const sortedCharacters = [...characterStats.entries()]
    .filter(([name]) => name !== "화자 미지정")
    .sort((a, b) => b[1].count - a[1].count || a[1].firstScene - b[1].firstScene);

  const characterCards: WebtoonCharacterCard[] = sortedCharacters.map(([name, info], idx) => ({
    name,
    roleHint: idx === 0 ? "주연" : info.count >= 2 ? "조연" : "단역",
    dialogueCount: info.count,
    firstAppearanceScene: info.firstScene,
    sampleQuote: info.sampleQuote,
    detectedEmotions: [...info.emotions],
  }));

  const totalBodyChars = bodyLines.reduce((sum, l) => sum + l.length, 0);
  const preservedTextRatioPercent =
    totalBodyChars > 0 ? Math.min(100, Math.round((preservedChars / totalBodyChars) * 100)) : 0;
  const totalAllocatedCuts = scenes.reduce((sum, s) => sum + s.allocatedCutCount, 0);

  const markdownExport = [
    `# 웹소설 → 웹툰 콘티 시트: ${detectedTitle}`,
    "",
    `- **총 씬 수**: ${scenes.length}씬 / **총 배분 컷 수**: ${totalAllocatedCuts}컷`,
    `- **추출 대사**: ${allDialogueBlocks.length}건 / **나레이션·지문**: ${allNarrationBlocks.length}건`,
    `- **등장인물 카드**: ${characterCards.map((c) => `${c.name}(${c.roleHint}, ${c.dialogueCount}회)`).join(", ") || "없음"}`,
    "",
    ...scenes.map(
      (scene) =>
        `## Scene ${scene.sceneNumber}. ${scene.heading} (컷 #${scene.cutStart}~#${scene.cutEnd}, ${scene.allocatedCutCount}컷)\n- 분위기: ${EMOTION_LABELS_KO[scene.mood]} · 전개 템포: ${scene.pacing}\n` +
        scene.panels
          .slice(0, 6)
          .map(
            (panel) =>
              `  - [패널 ${panel.panelNumber} · ${panel.shotSize}] ${panel.visualDirection}` +
              (panel.dialogues.length > 0
                ? ` | 대사: ${panel.dialogues.map((d) => `${d.speaker} “${d.text}”`).join(" / ")}`
                : ""),
          )
          .join("\n"),
    ),
    "",
  ].join("\n");

  return {
    episodeTitle: detectedTitle,
    scenes,
    characterCards,
    totalAllocatedCuts,
    dialogueBlocks: allDialogueBlocks,
    narrationBlocks: allNarrationBlocks,
    roundTripCoverage: {
      totalSourceDialogues: totalSourceQuotes,
      extractedDialogues: allDialogueBlocks.length,
      totalSourceParagraphs: bodyLines.length,
      preservedTextRatioPercent,
    },
    markdownExport,
  };
}
