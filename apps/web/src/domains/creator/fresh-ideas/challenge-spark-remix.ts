/**
 * challenge-spark-remix.ts — 창작 챌린지 주제 → 3컷 콘티 스파크 리믹서 순수 모델.
 *
 * 외부 API 없이 선택된 챌린지(id/title/theme) + 분위기 4종 + 카메라 구도 3종 + 리믹스 시드를
 * 결정론적으로 결합해 1컷 도입 · 2컷 전환 · 3컷 여운/반전 콘티 스파크, 추천 컷 비율,
 * 클립보드 복사용 메모 텍스트, 스튜디오 딥링크를 생성한다.
 */

import type { ChallengeSummary } from "@/platform/creator-client";

import { buildStudioHref } from "../creator-studio-links";

export type SparkMoodId = "flutter" | "tension" | "humor" | "afterglow";
export type SparkCameraId = "closeup-twist" | "high-angle-isolation" | "one-take-rush";
export type SparkCutStageId = "setup" | "turn" | "payoff";
export type SparkLocale = "ko" | "en";

export type ChallengeSparkInput = Pick<ChallengeSummary, "id" | "title" | "theme">;

export interface SparkMoodSpec {
  readonly id: SparkMoodId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly hintKo: string;
  readonly hintEn: string;
  readonly toneVar: string;
}

export interface SparkCameraSpec {
  readonly id: SparkCameraId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly ratioLabelKo: string;
  readonly ratioLabelEn: string;
  readonly frameRatios: readonly [string, string, string];
  readonly shotTagsKo: readonly [string, string, string];
  readonly shotTagsEn: readonly [string, string, string];
}

export interface SparkCutBeat {
  readonly index: 1 | 2 | 3;
  readonly stage: SparkCutStageId;
  readonly stageLabelKo: string;
  readonly stageLabelEn: string;
  readonly shotTagKo: string;
  readonly shotTagEn: string;
  readonly frameRatio: string;
  readonly visualDirectionKo: string;
  readonly visualDirectionEn: string;
  readonly dialogueHookKo: string;
  readonly dialogueHookEn: string;
  readonly toneVar: string;
}

export interface ChallengeSparkPlan {
  readonly challengeId: string;
  readonly challengeTitle: string;
  readonly challengeTheme: string;
  readonly mood: SparkMoodSpec;
  readonly camera: SparkCameraSpec;
  readonly seed: number;
  readonly ratioLabelKo: string;
  readonly ratioLabelEn: string;
  readonly cuts: readonly [SparkCutBeat, SparkCutBeat, SparkCutBeat];
  readonly clipboardTextKo: string;
  readonly clipboardTextEn: string;
  readonly studioHref: string;
}

export const SPARK_MOODS: readonly SparkMoodSpec[] = [
  {
    id: "flutter",
    labelKo: "설렘",
    labelEn: "Flutter",
    hintKo: "시선 교차 · 온도 상승",
    hintEn: "Locked gaze · rising warmth",
    toneVar: "var(--color-accent)",
  },
  {
    id: "tension",
    labelKo: "긴장",
    labelEn: "Tension",
    hintKo: "정적 균열 · 숨 막히는 틈",
    hintEn: "Cracked silence · taut beat",
    toneVar: "var(--color-cool)",
  },
  {
    id: "humor",
    labelKo: "유머",
    labelEn: "Humor",
    hintKo: "허를 찌르는 박자 반전",
    hintEn: "Deadpan beat · comic flip",
    toneVar: "var(--color-warn)",
  },
  {
    id: "afterglow",
    labelKo: "여운",
    labelEn: "Afterglow",
    hintKo: "빈 여백 · 오래 남는 잔상",
    hintEn: "Quiet space · lingering echo",
    toneVar: "var(--color-good)",
  },
] as const;

export const SPARK_CAMERAS: readonly SparkCameraSpec[] = [
  {
    id: "closeup-twist",
    labelKo: "클로즈업 반전",
    labelEn: "Close-up twist",
    ratioLabelKo: "세로 9:16 · 1:1.4:2 점층 줌",
    ratioLabelEn: "Vertical 9:16 · 1:1.4:2 push-in",
    frameRatios: ["4:3", "3:4", "9:16"],
    shotTagsKo: ["미디엄 · 일상 고정", "오버숄더 · 미세한 틈", "익스트림 클로즈업 · 반전"],
    shotTagsEn: ["Medium · calm baseline", "Over-shoulder · subtle crack", "Extreme close-up · twist"],
  },
  {
    id: "high-angle-isolation",
    labelKo: "하이앵글 고립",
    labelEn: "High-angle isolation",
    ratioLabelKo: "세로 9:16 · 2:1:1.6 여백 대비",
    ratioLabelEn: "Vertical 9:16 · 2:1:1.6 scale contrast",
    frameRatios: ["9:16", "4:3", "16:9"],
    shotTagsKo: ["부감 풀샷 · 공간 압도", "아이레벨 · 결정적 소품", "와이드 틸트 · 잔상 여백"],
    shotTagsEn: ["Top-down wide · spatial scale", "Eye-level · key prop", "Wide tilt · lingering void"],
  },
  {
    id: "one-take-rush",
    labelKo: "원테이크 질주",
    labelEn: "One-take rush",
    ratioLabelKo: "세로 9:16 · 1:1.8:1.2 사선 질주",
    ratioLabelEn: "Vertical 9:16 · 1:1.8:1.2 kinetic sweep",
    frameRatios: ["16:9", "9:16", "4:5"],
    shotTagsKo: ["로우 트래킹 · 출발 신호", "사선 패닝 · 속도 정점", "스톱 프레임 · 착지 한 컷"],
    shotTagsEn: ["Low tracking · launch cue", "Diagonal pan · peak speed", "Freeze frame · landing beat"],
  },
] as const;

interface MoodScriptPool {
  readonly setupKo: readonly ((subject: string, cameraTag: string) => string)[];
  readonly setupEn: readonly ((subject: string, cameraTag: string) => string)[];
  readonly turnKo: readonly ((subject: string, title: string) => string)[];
  readonly turnEn: readonly ((subject: string, title: string) => string)[];
  readonly payoffKo: readonly ((subject: string, title: string) => string)[];
  readonly payoffEn: readonly ((subject: string, title: string) => string)[];
  readonly hooksKo: readonly [readonly string[], readonly string[], readonly string[]];
  readonly hooksEn: readonly [readonly string[], readonly string[], readonly string[]];
}

const MOOD_POOLS: Readonly<Record<SparkMoodId, MoodScriptPool>> = {
  flutter: {
    setupKo: [
      (subject, tag) => `${tag}으로 ‘${subject}’ 한가운데 멈춰 선 두 사람의 거리감을 따뜻하게 잡아요.`,
      (subject, tag) => `${tag} 구도로 ‘${subject}’ 속 작은 소품 하나에 빛이 떨어지는 순간부터 열어요.`,
      (subject, tag) => `${tag}으로 ‘${subject}’의 바람결에 흔들리는 머리카락과 망설이는 손끝을 담아요.`,
    ],
    setupEn: [
      (subject, tag) => `Open in ${tag} framing the quiet distance between two figures inside "${subject}".`,
      (subject, tag) => `Start with ${tag} as warm light catches a single small detail within "${subject}".`,
      (subject, tag) => `Use ${tag} to trace a hesitant hand and drifting breeze inside "${subject}".`,
    ],
    turnKo: [
      (subject) => `말을 꺼내려던 찰나, ‘${subject}’ 풍경 너머로 먼저 시선이 마주치며 공기가 바뀌어요.`,
      (_subject, title) => `우산·소매 끝이 스치는 0.5초 정적 위로 ‘${title}’의 온도가 번지기 시작해요.`,
      (subject) => `무심한 척 건넨 메모나 미소 하나가 ‘${subject}’의 리듬을 단숨에 뒤집어요.`,
    ],
    turnEn: [
      (subject) => `Right before speaking, their eyes lock across "${subject}" and shift the air.`,
      (_subject, title) => `A half-second brush of sleeves lets the warmth of "${title}" spill across the frame.`,
      (subject) => `One casual note or half-smile flips the entire rhythm of "${subject}".`,
    ],
    payoffKo: [
      (_subject, title) => `말풍선 없이 표정과 붉어진 귀끝만 크게 남겨 ‘${title}’의 설렘을 여백으로 완성해요.`,
      (subject) => `두 그림자가 하나로 포개지는 구도 위에 ‘${subject}’의 마지막 한 마디를 작게 띄워요.`,
      (_subject, title) => `뒤돌아보는 찰나의 빛망울로 ‘${title}’ 다음 화를 기다리게 만드는 엔딩 컷을 찍어요.`,
    ],
    payoffEn: [
      (_subject, title) => `Drop speech bubbles and hold on a flushed expression to seal "${title}" in open space.`,
      (subject) => `Overlap their shadows and float one quiet closing line over "${subject}".`,
      (_subject, title) => `End on a backlit glance back that makes "${title}" linger past the scroll.`,
    ],
    hooksKo: [
      ["“오늘따라 발걸음이 느리네.”", "“잠깐만, 여기 바람 좋다.”", "“먼저 가도 되는데.”"],
      ["“방금 나 부른 거야?”", "“어, 손이 왜 이렇게 따뜻해.”", "“사실 아까부터 보고 있었어.”"],
      ["“다음에도 같이 걸을까.”", "“이 길, 생각보다 짧다.”", "“…안 잊어버릴게, 오늘.”"],
    ],
    hooksEn: [
      ["“You're walking slower than usual.”", "“Hold on—the breeze feels nice here.”", "“You can go ahead if you want.”"],
      ["“Did you just call my name?”", "“Wait—why are your hands so warm?”", "“I noticed you a while ago.”"],
      ["“Walk with me again next time?”", "“This street felt way too short.”", "“I won't forget tonight.”"],
    ],
  },
  tension: {
    setupKo: [
      (subject, tag) => `${tag}으로 ‘${subject}’의 익숙한 공간에 어울리지 않는 그림자 하나를 먼저 심어요.`,
      (subject, tag) => `${tag} 구도로 ‘${subject}’ 속 멈춰 선 시계나 굳은 손가락에 시선을 고정해요.`,
      (subject, tag) => `${tag}으로 ‘${subject}’의 고요한 배경을 넓게 깔아 두고 불길한 틈을 하나 남겨요.`,
    ],
    setupEn: [
      (subject, tag) => `Use ${tag} to plant one out-of-place shadow inside the familiar scene of "${subject}".`,
      (subject, tag) => `Lock ${tag} onto a frozen clock or tense fingers set against "${subject}".`,
      (subject, tag) => `Lay down the stillness of "${subject}" in ${tag} while leaving one unsettling gap.`,
    ],
    turnKo: [
      (subject) => `정적을 가르는 짧은 효과음과 함께 ‘${subject}’ 뒤에 숨어 있던 진실의 단서가 드러나요.`,
      (_subject, title) => `주인공의 동공이 좁아지는 찰나, ‘${title}’의 전제가 완전히 뒤집히는 물체가 프레임에 들어와요.`,
      (subject) => `방금까지 안전하다고 믿었던 ‘${subject}’의 경계선이 한 컷 만에 무너져요.`,
    ],
    turnEn: [
      (subject) => `A crisp sound cue slices the silence and exposes the clue hidden behind "${subject}".`,
      (_subject, title) => `As pupils narrow, an unexpected object enters frame and flips the premise of "${title}".`,
      (subject) => `The safe boundary established inside "${subject}" fractures in a single beat.`,
    ],
    payoffKo: [
      (_subject, title) => `강한 명암 대비와 짧은 독백 한 줄로 ‘${title}’의 다음 순간을 숨 멈추게 끊어요.`,
      (subject) => `프레임 가장자리로 사라지는 실루엣만 남겨 ‘${subject}’의 의문을 강렬하게 박아 넣어요.`,
      (_subject, title) => `정면을 똑바로 응시하는 눈빛 컷으로 ‘${title}’의 반전을 차갑게 마무리해요.`,
    ],
    payoffEn: [
      (_subject, title) => `Cut on sharp contrast and one terse inner line that freezes "${title}" mid-breath.`,
      (subject) => `Leave only a silhouette slipping off-frame so "${subject}" ends on a sharp question.`,
      (_subject, title) => `Close with a dead-center stare that locks in the cold twist of "${title}".`,
    ],
    hooksKo: [
      ["“분명 혼자 들어왔는데.”", "“발소리가 하나 더 들렸다.”", "“아까 문, 잠갔던가.”"],
      ["“그건 여기 있을 리가 없어.”", "“잠깐… 뒤돌아보지 마.”", "“이미 시작된 거였어.”"],
      ["“이제 진짜 이름이 뭐야.”", "“늦었어. 이미 열렸거든.”", "“그 약속, 내가 한 적 없어.”"],
    ],
    hooksEn: [
      ["“I definitely walked in alone.”", "“There's an extra set of footsteps.”", "“Did I actually lock that door?”"],
      ["“That shouldn't be here.”", "“Wait—don't turn around.”", "“It started before we arrived.”"],
      ["“Tell me your real name.”", "“Too late. It's already open.”", "“I never made that promise.”"],
    ],
  },
  humor: {
    setupKo: [
      (subject, tag) => `${tag}으로 ‘${subject}’을 지나치게 비장하고 진지한 명장면처럼 과장해 열어요.`,
      (subject, tag) => `${tag} 구도로 ‘${subject}’ 앞에서 완벽한 계획을 자신하는 주인공의 표정을 잡아요.`,
      (subject, tag) => `${tag}으로 ‘${subject}’ 속 평화로운 분위기와 대비되는 엉뚱한 준비물을 슬쩍 보여 줘요.`,
    ],
    setupEn: [
      (subject, tag) => `Open "${subject}" in ${tag} like an overly dramatic epic film scene.`,
      (subject, tag) => `Frame a wildly overconfident expression facing "${subject}" using ${tag}.`,
      (subject, tag) => `Pair the calm mood of "${subject}" in ${tag} with one absurdly misplaced prop.`,
    ],
    turnKo: [
      (subject) => `진지한 내레이션이 끝나기도 전에 ‘${subject}’ 한복판에서 1초 만에 계획이 어긋나요.`,
      (_subject, title) => `멋진 대사를 날린 직후, ‘${title}’과 전혀 상관없는 사소한 사고가 컷을 점령해요.`,
      (subject) => `주변 인물의 무표정한 한마디가 ‘${subject}’의 장엄한 분위기를 와르르 깨뜨려요.`,
    ],
    turnEn: [
      (subject) => `Before the heroic narration finishes, the entire plan unravels inside "${subject}".`,
      (_subject, title) => `Right after a cool line, a tiny mundane mishap hijacks "${title}".`,
      (subject) => `One deadpan remark from a bystander shatters the grand mood of "${subject}".`,
    ],
    payoffKo: [
      (_subject, title) => `텅 빈 눈동자와 작은 효과음 하나만으로 ‘${title}’의 체념 웃음을 깔끔하게 터뜨려요.`,
      (subject) => `아무 일 없었다는 듯 태연하게 수습하는 뒷모습으로 ‘${subject}’의 개그 박자를 닫아요.`,
      (_subject, title) => `최초의 비장한 1컷과 똑같은 구도로 망가진 결과를 대비시켜 ‘${title}’ 펀치라인을 완성해요.`,
    ],
    payoffEn: [
      (_subject, title) => `Land the punchline of "${title}" with blank eyes and one tiny deadpan SFX.`,
      (subject) => `Close on a stiff, pretending-nothing-happened walk away from "${subject}".`,
      (_subject, title) => `Mirror Cut 1's grand framing over the chaotic aftermath to nail "${title}".`,
    ],
    hooksKo: [
      ["“완벽해. 이번엔 실수 없다.”", "“분위기 잡는 건 내 전문이지.”", "“자, 역사에 남을 한 걸음.”"],
      ["“어… 잠깐, 이건 계산에 없는데.”", "“지금 방금 소리 들었지.”", "“그걸 왜 거기다 뒀어?”"],
      ["“계획대로야. 아무튼 계획대로야.”", "“모른 척하고 집이나 가자.”", "“다음 주엔 진짜 멋있게 한다.”"],
    ],
    hooksEn: [
      ["“Flawless. Zero chance of error.”", "“Setting the mood is my specialty.”", "“Behold—a historic step.”"],
      ["“Wait… that wasn't in the plan.”", "“Please tell me nobody heard that.”", "“Why was that sitting there?”"],
      ["“Totally intentional. Probably.”", "“Let's just walk home quietly.”", "“Next week I'll look cool, promise.”"],
    ],
  },
  afterglow: {
    setupKo: [
      (subject, tag) => `${tag}으로 ‘${subject}’이 지나간 뒤 남은 온기와 조용한 풍경을 천천히 펼쳐요.`,
      (subject, tag) => `${tag} 구도로 ‘${subject}’ 속 누군가 남기고 간 흔적 하나를 담담하게 비춰요.`,
      (subject, tag) => `${tag}으로 ‘${subject}’의 계절감과 빛의 각도를 크게 열어 호흡을 낮춰요.`,
    ],
    setupEn: [
      (subject, tag) => `Unfold the quiet warmth left behind in "${subject}" with unhurried ${tag} framing.`,
      (subject, tag) => `Use ${tag} to rest gently on a single trace someone left inside "${subject}".`,
      (subject, tag) => `Open wide in ${tag} on light and season inside "${subject}" to slow the breath.`,
    ],
    turnKo: [
      (subject) => `잠시 멈춰 선 주인공이 ‘${subject}’ 속에서 예전과 달라진 자신의 표정을 깨달아요.`,
      (_subject, title) => `지나칠 뻔한 작은 디테일이 ‘${title}’에 담긴 오래된 기억을 조용히 불러내요.`,
      (subject) => `누군가의 짧은 한마디가 ‘${subject}’의 공기 속에 천천히 가라앉으며 의미를 바꿔요.`,
    ],
    turnEn: [
      (subject) => `Pausing inside "${subject}", the character notices how gently their own mood has changed.`,
      (_subject, title) => `An almost-missed detail quietly summons an old memory woven into "${title}".`,
      (subject) => `One understated sentence settles into "${subject}" and reframes the whole moment.`,
    ],
    payoffKo: [
      (_subject, title) => `넓은 하늘·창밖 여백을 3분의 2 이상 비워 ‘${title}’의 잔상이 독자 머릿속에 머물게 해요.`,
      (subject) => `작은 미소와 함께 걸음을 옮기는 롱샷으로 ‘${subject}’의 하루를 포근하게 닫아요.`,
      (_subject, title) => `대사 대신 짧은 손글씨 캡션 한 줄만 얹어 ‘${title}’의 여운을 길게 남겨요.`,
    ],
    payoffEn: [
      (_subject, title) => `Leave two-thirds of the panel as open sky or window light so "${title}" lingers.`,
      (subject) => `End on a long shot walking forward with a soft smile to gently close "${subject}".`,
      (_subject, title) => `Skip dialogue and place one handwritten caption to stretch the afterglow of "${title}".`,
    ],
    hooksKo: [
      ["“계절이 바뀌는 줄도 몰랐네.”", "“여긴 아직 그대로구나.”", "“그날 공기가 생각났다.”"],
      ["“별일 아니었는데 오래 남았어.”", "“이제는 조금 웃을 수 있겠다.”", "“네가 말한 뜻, 이제 알겠어.”"],
      ["“천천히 가도 괜찮은 밤이었다.”", "“내일은 조금 가벼울 것 같아.”", "“고마워, 여기까지 같이 와 줘서.”"],
    ],
    hooksEn: [
      ["“I didn't even notice the season turning.”", "“This corner hasn't changed at all.”", "“The air reminded me of that day.”"],
      ["“It was small, yet it stayed with me.”", "“I think I can smile about it now.”", "“I finally get what you meant.”"],
      ["“A night where walking slow felt right.”", "“Tomorrow might feel a little lighter.”", "“Thanks for walking with me this far.”"],
    ],
  },
};

function fnv1aHash(source: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function pickVariant<T>(items: readonly T[], hash: number, salt: number): T {
  const mixed = ((hash >>> salt) ^ Math.imul(hash, salt + 17)) >>> 0;
  return items[mixed % items.length] as T;
}

export function nextSparkCamera(current: SparkCameraId): SparkCameraId {
  const index = SPARK_CAMERAS.findIndex((item) => item.id === current);
  const next = SPARK_CAMERAS[(index + 1) % SPARK_CAMERAS.length];
  return next ? next.id : "closeup-twist";
}

export function buildChallengeSparkPlan(params: {
  readonly challenge: ChallengeSparkInput;
  readonly moodId: SparkMoodId;
  readonly cameraId: SparkCameraId;
  readonly seed: number;
}): ChallengeSparkPlan {
  const safeSeed = Number.isFinite(params.seed) ? Math.max(0, Math.floor(params.seed)) : 0;
  const mood = SPARK_MOODS.find((item) => item.id === params.moodId) ?? SPARK_MOODS[0]!;
  const camera = SPARK_CAMERAS.find((item) => item.id === params.cameraId) ?? SPARK_CAMERAS[0]!;
  const rawTitle = params.challenge.title.trim();
  const rawTheme = params.challenge.theme.trim();
  const cleanTitleKo = rawTitle || "주간 챌린지";
  const cleanTitleEn = rawTitle || "Weekly challenge";
  const cleanThemeKo = rawTheme || cleanTitleKo;
  const cleanThemeEn = rawTheme || cleanTitleEn;
  const hash = fnv1aHash(
    `${params.challenge.id}|${cleanTitleKo}|${cleanThemeKo}|${mood.id}|${camera.id}|${safeSeed}`,
  );
  const pool = MOOD_POOLS[mood.id];

  const setupDirKo = pickVariant(pool.setupKo, hash, 1)(cleanThemeKo, camera.shotTagsKo[0]);
  const setupDirEn = pickVariant(pool.setupEn, hash, 1)(cleanThemeEn, camera.shotTagsEn[0]);
  const turnDirKo = pickVariant(pool.turnKo, hash, 5)(cleanThemeKo, cleanTitleKo);
  const turnDirEn = pickVariant(pool.turnEn, hash, 5)(cleanThemeEn, cleanTitleEn);
  const payoffDirKo = pickVariant(pool.payoffKo, hash, 9)(cleanThemeKo, cleanTitleKo);
  const payoffDirEn = pickVariant(pool.payoffEn, hash, 9)(cleanThemeEn, cleanTitleEn);

  const hook1Index = ((hash >>> 2) ^ (safeSeed * 3)) >>> 0;
  const hook2Index = ((hash >>> 7) ^ (safeSeed * 5 + 1)) >>> 0;
  const hook3Index = ((hash >>> 13) ^ (safeSeed * 7 + 2)) >>> 0;

  const cutTones: readonly [string, string, string] = [
    "var(--color-cool)",
    mood.toneVar,
    "var(--color-good)",
  ];

  const cuts: readonly [SparkCutBeat, SparkCutBeat, SparkCutBeat] = [
    {
      index: 1,
      stage: "setup",
      stageLabelKo: "1컷 도입",
      stageLabelEn: "Cut 1 · Setup",
      shotTagKo: camera.shotTagsKo[0],
      shotTagEn: camera.shotTagsEn[0],
      frameRatio: camera.frameRatios[0],
      visualDirectionKo: setupDirKo,
      visualDirectionEn: setupDirEn,
      dialogueHookKo: pool.hooksKo[0][hook1Index % pool.hooksKo[0].length] ?? "",
      dialogueHookEn: pool.hooksEn[0][hook1Index % pool.hooksEn[0].length] ?? "",
      toneVar: cutTones[0],
    },
    {
      index: 2,
      stage: "turn",
      stageLabelKo: "2컷 전환",
      stageLabelEn: "Cut 2 · Turn",
      shotTagKo: camera.shotTagsKo[1],
      shotTagEn: camera.shotTagsEn[1],
      frameRatio: camera.frameRatios[1],
      visualDirectionKo: turnDirKo,
      visualDirectionEn: turnDirEn,
      dialogueHookKo: pool.hooksKo[1][hook2Index % pool.hooksKo[1].length] ?? "",
      dialogueHookEn: pool.hooksEn[1][hook2Index % pool.hooksEn[1].length] ?? "",
      toneVar: cutTones[1],
    },
    {
      index: 3,
      stage: "payoff",
      stageLabelKo: "3컷 여운·반전",
      stageLabelEn: "Cut 3 · Payoff",
      shotTagKo: camera.shotTagsKo[2],
      shotTagEn: camera.shotTagsEn[2],
      frameRatio: camera.frameRatios[2],
      visualDirectionKo: payoffDirKo,
      visualDirectionEn: payoffDirEn,
      dialogueHookKo: pool.hooksKo[2][hook3Index % pool.hooksKo[2].length] ?? "",
      dialogueHookEn: pool.hooksEn[2][hook3Index % pool.hooksEn[2].length] ?? "",
      toneVar: cutTones[2],
    },
  ];

  const clipboardTextKo = [
    `[챌린지 3컷 스파크] ${cleanTitleKo}`,
    `주제: ${cleanThemeKo}`,
    `분위기: ${mood.labelKo} · 카메라 구도: ${camera.labelKo} · 추천 컷 비율: ${camera.ratioLabelKo} (시드 #${safeSeed + 1})`,
    "",
    ...cuts.map(
      (cut) =>
        `${cut.stageLabelKo} [${cut.shotTagKo} · ${cut.frameRatio}]\n- 연출: ${cut.visualDirectionKo}\n- 대사 힌트: ${cut.dialogueHookKo}`,
    ),
  ].join("\n");

  const clipboardTextEn = [
    `[Challenge 3-Cut Spark] ${cleanTitleEn}`,
    `Theme: ${cleanThemeEn}`,
    `Mood: ${mood.labelEn} · Camera: ${camera.labelEn} · Ratio: ${camera.ratioLabelEn} (Seed #${safeSeed + 1})`,
    "",
    ...cuts.map(
      (cut) =>
        `${cut.stageLabelEn} [${cut.shotTagEn} · ${cut.frameRatio}]\n- Staging: ${cut.visualDirectionEn}\n- Line hook: ${cut.dialogueHookEn}`,
    ),
  ].join("\n");

  return {
    challengeId: params.challenge.id,
    challengeTitle: cleanTitleKo,
    challengeTheme: cleanThemeKo,
    mood,
    camera,
    seed: safeSeed,
    ratioLabelKo: camera.ratioLabelKo,
    ratioLabelEn: camera.ratioLabelEn,
    cuts,
    clipboardTextKo,
    clipboardTextEn,
    studioHref: buildStudioHref({ challengeId: params.challenge.id }),
  };
}
