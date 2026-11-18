/**
 * 에피소드 콘티 큐시트 내장 쇼케이스 템플릿 카탈로그 (`webtoon-episode-templates.ts`).
 *
 * - 외부 파일 업로드 없이 원클릭으로 즉시 불러와 장편 스트립 PNG · 연속 9:16 WebM · 통합 WebVTT · 단행본 표지/목차를
 *   테스트하거나 주간 연재 콘티 골격으로 활용할 수 있는 순수 결정적 템플릿 모음이다.
 * - `src/architecture.test.ts` 도메인 경계 준수를 위해 `app/**` 참조 없이 순수 `export/` 타입으로만 구성된다.
 */
import {
  EPISODE_CUTSHEET_SCHEMA,
  DEFAULT_EPISODE_CUTSHEET_SNAPSHOT,
  formatBeatCutRangeLabel,
} from "./webtoon-episode-cutsheet";

import type {
  EpisodeCutsheetBeat,
  EpisodeCutsheetDirectorSnapshot,
  EpisodeCutsheetDocument,
} from "./webtoon-episode-cutsheet";

export type EpisodeCutsheetTemplateId =
  | "template-12genre-omnibus-48cuts"
  | "template-trilogy-climax-12cuts"
  | "template-ja-tankobon-8cuts";

export interface EpisodeCutsheetTemplateSpec {
  readonly id: EpisodeCutsheetTemplateId;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly episodeTitleKo: string;
  readonly beats: readonly {
    readonly beatId: string;
    readonly titleKo: string;
    readonly snapshot: EpisodeCutsheetDirectorSnapshot;
  }[];
}

function makeBeatSnapshot(
  patch: Partial<EpisodeCutsheetDirectorSnapshot>,
): EpisodeCutsheetDirectorSnapshot {
  return {
    ...DEFAULT_EPISODE_CUTSHEET_SNAPSHOT,
    bakeStripFx: true,
    includePsdMangaFx: true,
    ...patch,
  };
}

const TWELVE_GENRE_BEATS: readonly {
  readonly beatId: string;
  readonly titleKo: string;
  readonly snapshot: EpisodeCutsheetDirectorSnapshot;
}[] = Object.freeze([
  {
    beatId: "omnibus-01-rofan",
    titleKo: "로판 황실 대관식",
    snapshot: makeBeatSnapshot({
      activeDirectorId: "director-rofan-coronation",
      manuscriptMood: "daylight-paper",
      actingArc: "arc-confident-smirk",
      stripFxLines: "romance-sparkle",
      gutterPaces: ["standard", "dramatic-pause", "standard"],
      screentones: ["rose-duotone-dots", "none", "rose-duotone-dots", "classic-ink-45"],
      dialogueLines: [
        "황실의 검과 왕관, 오늘부로 내가 거둔다.",
        "감히 고개를 들어 내 눈을 마주 봐.",
        "오래 기다렸지? 이제 반격의 시간이야.",
        "내 제국에 온 걸 환영해.",
      ],
      bubbleShapes: ["monologue-box", "oval", "shout-burst", "oval"],
      bubbleFontScales: ["md", "md", "lg", "md"],
      sfxStamps: ["seureung", "none", "pat", "dugeun"],
      speakerTargets: ["protagonist", "partner", "protagonist", "protagonist"],
      cutCameraPresets: ["low-full", "side-bust", "dutch-right-face", "high-bust"],
    }),
  },
  {
    beatId: "omnibus-02-noir",
    titleKo: "느와르 취조실 반전",
    snapshot: makeBeatSnapshot({
      activeDirectorId: "director-noir-interrogation",
      manuscriptMood: "midnight-noir",
      actingArc: "arc-thriller-shock",
      stripFxLines: "focus-radial",
      gutterPaces: ["standard", "dramatic-pause", "cliffhanger"],
      screentones: ["shadow-fade-mono", "classic-ink-45", "cyan-noir-dots", "shadow-fade-mono"],
      dialogueLines: [
        "사건 기록 14페이지, 비어 있던 시간 말인데.",
        "어젯밤 11시, 그 현장에 당신도 있었지?",
        "설마 진짜 배후가 내부에 있었다고?",
        "증거는 충분해. 여기서 끝내자.",
      ],
      bubbleShapes: ["monologue-box", "oval", "shout-burst", "whisper-dashed"],
      bubbleFontScales: ["md", "md", "lg", "sm"],
      sfxStamps: ["none", "pat", "kugugung", "none"],
      speakerTargets: ["protagonist", "protagonist", "partner", "protagonist"],
      cutCameraPresets: ["side-bust", "duo-wide", "dutch-left-bust", "front-face"],
    }),
  },
  {
    beatId: "omnibus-03-campus-cafe",
    titleKo: "캠퍼스 로스터리 오후",
    snapshot: makeBeatSnapshot({
      activeDirectorId: "director-campus-cafe",
      manuscriptMood: "daylight-paper",
      actingArc: "arc-romance-flutter",
      stripFxLines: "romance-sparkle",
      gutterPaces: ["standard", "standard", "dramatic-pause"],
      screentones: ["none", "rose-duotone-dots", "rose-duotone-dots", "none"],
      dialogueLines: [
        "혹시 아까부터 여기 앉아 있었어?",
        "네가 좋아하는 로스터리 원두로 골라 봤어.",
        "왜 자꾸 그렇게 가까이서 쳐다봐…",
        "오늘 오후는 천천히 같이 걷자.",
      ],
      bubbleShapes: ["oval", "oval", "whisper-dashed", "oval"],
      bubbleFontScales: ["md", "md", "sm", "md"],
      sfxStamps: ["none", "dugeun", "dugeun", "none"],
      speakerTargets: ["partner", "protagonist", "protagonist", "partner"],
      cutCameraPresets: ["low-full", "side-bust", "front-face", "high-bust"],
    }),
  },
  {
    beatId: "omnibus-04-murim",
    titleKo: "무협 청운 검기 각성",
    snapshot: makeBeatSnapshot({
      activeDirectorId: "director-murim-awakening",
      manuscriptMood: "backlit-awakening",
      actingArc: "arc-awakening-climax",
      stripFxLines: "speed-diagonal",
      gutterPaces: ["compact", "compact", "cliffhanger"],
      screentones: ["cyan-noir-dots", "classic-ink-45", "cyan-noir-dots", "shadow-fade-mono"],
      dialogueLines: [
        "봉인된 청운의 검기가 다시 깨어난다.",
        "물러서라, 지금부터는 진검승부다.",
        "보인다, 모든 검로의 빈틈이.",
        "단 일검으로 승부를 매듭짓겠다.",
      ],
      bubbleShapes: ["monologue-box", "oval", "shout-burst", "shout-burst"],
      bubbleFontScales: ["md", "md", "lg", "lg"],
      sfxStamps: ["seureung", "none", "kugugung", "seureung"],
      speakerTargets: ["protagonist", "partner", "protagonist", "protagonist"],
      cutCameraPresets: ["low-full", "duo-wide", "dutch-right-face", "dutch-left-bust"],
    }),
  },
  {
    beatId: "omnibus-05-rooftop",
    titleKo: "옥상 황혼 비밀 독대",
    snapshot: makeBeatSnapshot({
      activeDirectorId: "director-rooftop-twilight",
      manuscriptMood: "twilight-amber",
      actingArc: "arc-thriller-shock",
      stripFxLines: "speed-diagonal",
      gutterPaces: ["standard", "dramatic-pause", "cliffhanger"],
      screentones: ["rose-duotone-dots", "classic-ink-45", "shadow-fade-mono", "rose-duotone-dots"],
      dialogueLines: [
        "방과 후 옥상 난간, 발신자 미상의 음성 파일.",
        "학생회 서버에서 지워진 기록을 네가 갖고 있었군.",
        "이 녹음이 공개되면 학원 전체가 뒤집힐 거야.",
        "해가 지기 전에 선택해, 공범이 될지 증인이 될지.",
      ],
      bubbleShapes: ["monologue-box", "oval", "shout-burst", "whisper-dashed"],
      bubbleFontScales: ["md", "md", "lg", "sm"],
      sfxStamps: ["ssaa", "none", "dugeun", "beonjjeok"],
      speakerTargets: ["protagonist", "partner", "protagonist", "partner"],
      cutCameraPresets: ["low-full", "duo-wide", "dutch-left-bust", "front-face"],
    }),
  },
  {
    beatId: "omnibus-06-heist",
    titleKo: "괴도 달빛 보석 예고장",
    snapshot: makeBeatSnapshot({
      activeDirectorId: "director-phantom-heist",
      manuscriptMood: "midnight-noir",
      actingArc: "arc-confident-smirk",
      stripFxLines: "focus-radial",
      gutterPaces: ["standard", "dramatic-pause", "cliffhanger"],
      screentones: ["cyan-noir-dots", "shadow-fade-mono", "classic-ink-45", "cyan-noir-dots"],
      dialogueLines: [
        "자정 정각, 예고한 푸른 사파이어를 거두러 왔습니다.",
        "보안 레이저를 전부 통과했다고? 거기 멈춰.",
        "진품은 이미 제 손안의 장미와 바뀌었거든요.",
        "다음 보름달 밤에 다시 뵙죠, 형사님.",
      ],
      bubbleShapes: ["monologue-box", "shout-burst", "oval", "whisper-dashed"],
      bubbleFontScales: ["md", "lg", "md", "sm"],
      sfxStamps: ["ssaa", "pat", "beonjjeok", "dugeun"],
      speakerTargets: ["protagonist", "partner", "protagonist", "protagonist"],
      cutCameraPresets: ["low-full", "duo-wide", "dutch-right-face", "high-bust"],
    }),
  },
  {
    beatId: "omnibus-07-tribunal",
    titleKo: "법정 메디컬 반대신문",
    snapshot: makeBeatSnapshot({
      activeDirectorId: "director-legal-medical-tribunal",
      manuscriptMood: "daylight-paper",
      actingArc: "arc-thriller-shock",
      stripFxLines: "focus-radial",
      gutterPaces: ["compact", "dramatic-pause", "cliffhanger"],
      screentones: ["classic-ink-45", "shadow-fade-mono", "cyan-noir-dots", "classic-ink-45"],
      dialogueLines: [
        "재판장님, 수술실 활력징후 원본 차트를 제출합니다.",
        "이의 있습니다, 그 기록은 사전 승인되지 않았소.",
        "심전도 파형 3분 공백이 의료 과실의 결정적 증거입니다.",
        "의사봉이 내려치기 전에 진실부터 답하시죠.",
      ],
      bubbleShapes: ["monologue-box", "shout-burst", "shout-burst", "oval"],
      bubbleFontScales: ["md", "lg", "lg", "md"],
      sfxStamps: ["pat", "kugugung", "beonjjeok", "ssaa"],
      speakerTargets: ["protagonist", "partner", "protagonist", "protagonist"],
      cutCameraPresets: ["low-full", "duo-wide", "dutch-left-bust", "front-face"],
    }),
  },
  {
    beatId: "omnibus-08-idol",
    titleKo: "아이돌 앙코르 센터 무대",
    snapshot: makeBeatSnapshot({
      activeDirectorId: "director-idol-encore-stage",
      manuscriptMood: "backlit-awakening",
      actingArc: "arc-romance-flutter",
      stripFxLines: "romance-sparkle",
      gutterPaces: ["compact", "dramatic-pause", "cliffhanger"],
      screentones: ["rose-duotone-dots", "none", "rose-duotone-dots", "cyan-noir-dots"],
      dialogueLines: [
        "조명이 꺼진 뒤에도 객석의 별빛은 멈추지 않아.",
        "마지막 곡, 센터 마이크는 네 자리야.",
        "이 무대를 위해 수천 번을 다시 불렀어.",
        "들리니? 우리 이름을 부르는 함성이.",
      ],
      bubbleShapes: ["monologue-box", "oval", "shout-burst", "oval"],
      bubbleFontScales: ["md", "md", "lg", "md"],
      sfxStamps: ["pat", "dugeun", "beonjjeok", "dugeun"],
      speakerTargets: ["protagonist", "partner", "protagonist", "protagonist"],
      cutCameraPresets: ["low-full", "duo-wide", "dutch-right-face", "front-face"],
    }),
  },
  {
    beatId: "omnibus-09-varsity",
    titleKo: "학원 코트 결승 버저비터",
    snapshot: makeBeatSnapshot({
      activeDirectorId: "director-varsity-court-rival",
      manuscriptMood: "twilight-amber",
      actingArc: "arc-awakening-climax",
      stripFxLines: "speed-diagonal",
      gutterPaces: ["compact", "compact", "cliffhanger"],
      screentones: ["classic-ink-45", "none", "cyan-noir-dots", "shadow-fade-mono"],
      dialogueLines: [
        "4쿼터 종료 3초 전, 점수 차는 단 2점.",
        "더블팀 수비야, 여기서 슛을 던진다고?",
        "림 끝까지 궤적은 이미 머릿속에 그렸어.",
        "버저가 울리기 전에 승부를 뒤집는다.",
      ],
      bubbleShapes: ["monologue-box", "shout-burst", "oval", "shout-burst"],
      bubbleFontScales: ["md", "lg", "md", "lg"],
      sfxStamps: ["ssaa", "pat", "beonjjeok", "kugugung"],
      speakerTargets: ["protagonist", "partner", "protagonist", "protagonist"],
      cutCameraPresets: ["low-full", "duo-wide", "dutch-right-face", "dutch-left-bust"],
    }),
  },
  {
    beatId: "omnibus-10-apocalypse",
    titleKo: "생존자 제3방벽 전초기지",
    snapshot: makeBeatSnapshot({
      activeDirectorId: "director-apocalypse-outpost",
      manuscriptMood: "midnight-noir",
      actingArc: "arc-awakening-climax",
      stripFxLines: "speed-diagonal",
      gutterPaces: ["compact", "dramatic-pause", "cliffhanger"],
      screentones: ["cyan-noir-dots", "shadow-fade-mono", "classic-ink-45", "cyan-noir-dots"],
      dialogueLines: [
        "제3방벽 교신 복구 완료, 웨이브까지 90초 남았다.",
        "보급선은 끊겼어, 옥상 저격 각도 확보됐나?",
        "회귀 전엔 여기서 무너졌지만 이번엔 달라.",
        "전원 무전 채널 고정해, 신호탄과 동시에 돌파한다.",
      ],
      bubbleShapes: ["monologue-box", "oval", "shout-burst", "shout-burst"],
      bubbleFontScales: ["md", "md", "lg", "lg"],
      sfxStamps: ["ssaa", "pat", "beonjjeok", "kugugung"],
      speakerTargets: ["protagonist", "partner", "protagonist", "protagonist"],
      cutCameraPresets: ["low-full", "duo-wide", "dutch-left-bust", "front-face"],
    }),
  },
  {
    beatId: "omnibus-11-atelier",
    titleKo: "힐링 로스터리 빗밤 공방",
    snapshot: makeBeatSnapshot({
      activeDirectorId: "director-healing-barista-atelier",
      manuscriptMood: "twilight-amber",
      actingArc: "arc-romance-flutter",
      stripFxLines: "romance-sparkle",
      gutterPaces: ["standard", "standard", "dramatic-pause"],
      screentones: ["none", "rose-duotone-dots", "rose-duotone-dots", "none"],
      dialogueLines: [
        "마감 시간 지났는데, 비 피하러 들어온 거야?",
        "따뜻한 예가체프 한 잔 내리는 동안만 쉬어 가.",
        "김 서린 창가보다 네 눈빛이 더 따뜻한 것 같아.",
        "내일도 이 시간엔 네 자리 비워 둘게.",
      ],
      bubbleShapes: ["oval", "oval", "whisper-dashed", "oval"],
      bubbleFontScales: ["md", "md", "sm", "md"],
      sfxStamps: ["ssaa", "dugeun", "dugeun", "none"],
      speakerTargets: ["protagonist", "protagonist", "partner", "protagonist"],
      cutCameraPresets: ["low-full", "side-bust", "front-face", "high-bust"],
    }),
  },
  {
    beatId: "omnibus-12-sanctuary",
    titleKo: "대신전 성녀 백년 신탁식",
    snapshot: makeBeatSnapshot({
      activeDirectorId: "director-sanctuary-oracle",
      manuscriptMood: "backlit-awakening",
      actingArc: "arc-confident-smirk",
      stripFxLines: "romance-sparkle",
      gutterPaces: ["standard", "dramatic-pause", "cliffhanger"],
      screentones: ["rose-duotone-dots", "none", "cyan-noir-dots", "rose-duotone-dots"],
      dialogueLines: [
        "백대리석 성수 제단 위, 백 년 만의 신탁이 내린다.",
        "가짜 성녀의 거짓 축복은 이 성배 앞에서 부서질 뿐.",
        "보아라, 성좌가 누구의 이름을 부르고 있는지.",
        "오늘부로 대신전의 성광은 내가 직접 집행한다.",
      ],
      bubbleShapes: ["monologue-box", "oval", "shout-burst", "oval"],
      bubbleFontScales: ["md", "md", "lg", "md"],
      sfxStamps: ["pat", "none", "beonjjeok", "dugeun"],
      speakerTargets: ["protagonist", "protagonist", "protagonist", "partner"],
      cutCameraPresets: ["low-full", "duo-wide", "dutch-right-face", "high-bust"],
    }),
  },
]);

export const EPISODE_CUTSHEET_TEMPLATES: readonly EpisodeCutsheetTemplateSpec[] = Object.freeze([
  {
    id: "template-12genre-omnibus-48cuts",
    labelKo: "12대 장르 플래그십 옴니버스 (12비트 · 48컷)",
    summaryKo: "로판·느와르·캠퍼스·무협·옥상·괴도·법정·아이돌·스포츠·아포칼립스·힐링공방·성녀신탁 12대 장르 전체 쇼케이스",
    episodeTitleKo: "툰스튜디오 12대 장르 대표 옴니버스",
    beats: TWELVE_GENRE_BEATS,
  },
  {
    id: "template-trilogy-climax-12cuts",
    labelKo: "3막 기승전결 하이라이트 (3비트 · 12컷)",
    summaryKo: "도입 대립(법정) → 황혼 독대(옥상) → 신탁 역전(대신전)으로 이어지는 고속 렌더링 12컷 연재 콘티",
    episodeTitleKo: "특별편 진실과 신탁의 3막",
    beats: [TWELVE_GENRE_BEATS[6]!, TWELVE_GENRE_BEATS[4]!, TWELVE_GENRE_BEATS[11]!],
  },
  {
    id: "template-ja-tankobon-8cuts",
    labelKo: "일본어 세로쓰기 단행본 특집 (2비트 · 8컷)",
    summaryKo: "우→좌 단행본 조판과 일본어 전통 세로쓰기(縦書き) 식자가 즉시 세팅된 글로벌 출판용 샘플",
    episodeTitleKo: "特別編 蒼雲と聖杯の章",
    beats: [
      {
        beatId: "ja-tankobon-01",
        titleKo: "제1장 청운의 검기",
        snapshot: makeBeatSnapshot({
          ...TWELVE_GENRE_BEATS[3]!.snapshot,
          locale: "ja",
          jaWritingMode: "vertical-tategaki",
          tankobonOrder: "rtl-tankobon",
          dialogueLines: [
            "封じられた青雲の剣気が目覚める。",
            "下がれ、真剣勝負だ。",
            "すべての剣路の隙が見える。",
            "一太刀で決着をつける。",
          ],
        }),
      },
      {
        beatId: "ja-tankobon-02",
        titleKo: "제2장 대신전의 신탁",
        snapshot: makeBeatSnapshot({
          ...TWELVE_GENRE_BEATS[11]!.snapshot,
          locale: "ja",
          jaWritingMode: "vertical-tategaki",
          tankobonOrder: "rtl-tankobon",
          dialogueLines: [
            "白大理石の祭壇に神託が降りる。",
            "偽りの祝福は砕け散るだけ。",
            "星座が誰の名を呼ぶか見よ。",
            "大神殿の聖光は私が執り行う。",
          ],
        }),
      },
    ],
  },
]);

export function findEpisodeCutsheetTemplate(templateId: string): EpisodeCutsheetTemplateSpec | null {
  return EPISODE_CUTSHEET_TEMPLATES.find((item) => item.id === templateId) ?? null;
}

export function buildEpisodeCutsheetDocumentFromTemplate(
  templateId: EpisodeCutsheetTemplateId,
  savedAtIso = "2026-11-19T00:00:00.000Z",
): EpisodeCutsheetDocument {
  const spec = findEpisodeCutsheetTemplate(templateId) ?? EPISODE_CUTSHEET_TEMPLATES[0]!;
  const beats: EpisodeCutsheetBeat[] = spec.beats.map((b, idx) => ({
    beatId: b.beatId,
    titleKo: b.titleKo,
    cutRangeLabel: formatBeatCutRangeLabel(idx),
    snapshot: b.snapshot,
  }));
  return {
    schema: EPISODE_CUTSHEET_SCHEMA,
    episodeTitleKo: spec.episodeTitleKo,
    savedAtIso,
    beats,
  };
}
