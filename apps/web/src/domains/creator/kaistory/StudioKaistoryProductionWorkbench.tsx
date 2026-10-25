/**
 * StudioKaistoryProductionWorkbench.tsx — KAISTORY 만화 제작 플랫폼 4대 프로덕트
 * (`conti · 콘티 저작`, `design · 편집·변환`, `editor · 렌더·내보내기`, `story · 독자·학습카드 동기화`)
 * 통합 워크벤치 패널.
 */

import {
  BookOpen,
  CheckCircle2,
  Film,
  Layers,
  Languages,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  StudioKaistoryDesignTabPanel,
  StudioKaistoryEditorTabPanel,
  StudioKaistoryStoryTabPanel,
} from "./StudioKaistoryEditorStoryPanels";

import {
  classifyCharacterAgeGroup,
  compileAnimationFirstFramePrompt,
  compileAnimationMotionPrompt,
  compileStudyCardCharacterPrompt,
  configureContiPageSpread,
  formatContiDialogueDirective,
  KAISTORY_CAMERA_MOTION_DESCRIPTIONS,
  KAISTORY_LANG_CODES,
  KAISTORY_LANG_LABELS,
  matchContiEmotionCategory,
  resolveCharacterAutoColor,
  validateContiKeywords,
  type KaistoryAnimationCameraMotion,
  type KaistoryContiDialogue,
  type KaistoryContiPage,
  type KaistoryDialogueDeliveryMode,
  type KaistoryLangCode,
  type KaistorySpeakerDisplayMode,
  type KaistorySpreadMode,
} from "./kaistory-conti-model";
import {
  buildBubbleTailGeometry,
  buildFiveLangDialogueSheetRows,
  relinkOrphanedBubblesByLevenshtein,
  resolveWebtoonSpeakerVisuals,
  rotateEffectBy15Degrees,
  snapBubbleToOverlapPrevious,
  type KaistoryBubbleTailProfile,
} from "./kaistory-design-engine";
import {
  applyNaverGrammarBubbleLayout,
  autoAssignCastTtsVoices,
  buildTtsAudioScriptManifest,
  compileGraphicNovelManuscript,
  evaluateFiveLanguageQaSheet,
  generateDialogueInspectionReport,
  KAISTORY_A4_HEIGHT_PT,
  KAISTORY_A4_WIDTH_PT,
  planInterleavedEpisodeExport,
  type KaistoryEditorBubbleBox,
} from "./kaistory-editor-compositor";
import {
  evaluateStudentExposureStatus,
  resolveStudyCardForViewer,
  validateAppVersionPolicy,
} from "./kaistory-story-platform";

export type KaistoryWorkbenchTabId = "conti" | "design" | "editor" | "story";

const INITIAL_DIALOGUES: readonly KaistoryContiDialogue[] = Object.freeze([
  {
    id: "dlg-1",
    speakerName: "지수",
    speakerId: "char-1",
    kind: "dialogue",
    deliveryMode: "normal",
    text: "관성의 법칙 때문에 버스가 급정거하면 몸이 앞으로 쏠려!",
    translations: {
      ko: "관성의 법칙 때문에 버스가 급정거하면 몸이 앞으로 쏠려!",
      en: "Because of the law of inertia, our bodies lean forward when the bus stops suddenly!",
      ja: "慣性の法則のせいで、バスが急停車すると体が前に傾くんだ！",
      zh: "因为惯性定律，公交车急刹车时身体会向前倾！",
      ru: "Из-за закона инерции тело наклоняется вперёд при резком торможении автобуса!",
    },
  },
  {
    id: "dlg-2",
    speakerName: "민준",
    speakerId: "char-2",
    kind: "monologue",
    deliveryMode: "thought_vo",
    text: "아하, 알짜힘이 0이면 운동 상태를 유지하려는 성질이구나.",
    translations: {
      ko: "아하, 알짜힘이 0이면 운동 상태를 유지하려는 성질이구나.",
      en: "Aha, when net force is zero, an object keeps its state of motion.",
      ja: "なるほど、合力が0なら運動状態を保とうとする性質なんだね。",
      zh: "啊哈，合力为零时物体会保持原有的运动状态。",
      ru: "Ага, когда равнодействующая сила равна нулю, тело сохраняет состояние движения.",
    },
  },
]);

const INITIAL_PAGES: readonly KaistoryContiPage[] = Object.freeze([
  {
    id: "page-1",
    pageNumber: 1,
    templateId: "A/B1-2_2row",
    keywords: ["관성", "운동법칙"],
    b5GuideEnabled: true,
    borderCropPx: 0,
    spreadMode: "none",
    isSpreadHost: false,
    cuts: [
      {
        id: "cut-1",
        cutNumber: 1,
        shotType: "half",
        timeText: "오후",
        directorNote: "버스 손잡이를 잡는 지수",
        colorReferenceMode: "like_sheet",
        aiColorDirective: "따뜻한 오후 채광",
        keywords: ["관성"],
        placements: [],
        dialogues: INITIAL_DIALOGUES,
        outOfFrameCharacterImageUrls: [],
        webtoonDedicatedCutCountAfter: 0,
        aspectRatioWidth: 3,
        aspectRatioHeight: 4,
      },
    ],
  },
  {
    id: "page-2",
    pageNumber: 2,
    templateId: "A/B/C_3row",
    keywords: ["가속도"],
    b5GuideEnabled: true,
    borderCropPx: 0,
    spreadMode: "none",
    isSpreadHost: false,
    cuts: [
      {
        id: "cut-2",
        cutNumber: 2,
        shotType: "full",
        timeText: "오후",
        directorNote: "칠판 앞 설명 장면",
        colorReferenceMode: "like_original",
        aiColorDirective: "",
        keywords: ["가속도"],
        placements: [],
        dialogues: [],
        outOfFrameCharacterImageUrls: [],
        webtoonDedicatedCutCountAfter: 0,
        aspectRatioWidth: 16,
        aspectRatioHeight: 9,
      },
    ],
  },
]);

export function StudioKaistoryProductionWorkbench({
  projectId,
}: {
  readonly projectId: string;
}) {
  const bt = useBilingual("StudioKaistoryProductionWorkbench");
  const [activeTab, setActiveTab] = useState<KaistoryWorkbenchTabId>("conti");
  const [statusBanner, setStatusBanner] = useState<string>("");

  // 1. Conti 상태
  const [deliveryMode, setDeliveryMode] = useState<KaistoryDialogueDeliveryMode>("thought_vo");
  const [dialogueInput, setDialogueInput] = useState("저 별빛이 100광년 전의 빛이라고?");
  const [cameraMotion, setCameraMotion] = useState<KaistoryAnimationCameraMotion>("push_face");
  const [emotionInput, setEmotionInput] = useState("가슴이 두근거리며 설렘");
  const [spreadMode, setSpreadMode] = useState<Exclude<KaistorySpreadMode, "none">>("merge_webtoon");
  const [pages, setPages] = useState<readonly KaistoryContiPage[]>(INITIAL_PAGES);

  // 2. Design 상태
  const [tailProfile, setTailProfile] = useState<KaistoryBubbleTailProfile>("zigzag");
  const [speakerDisplayMode, setSpeakerDisplayMode] = useState<KaistorySpeakerDisplayMode>("name");
  const [effectRotationDeg, setEffectRotationDeg] = useState(0);
  const [selectedEffectId, setSelectedEffectId] = useState("motion-head-turn");
  const [selectedSfxPresetId, setSelectedSfxPresetId] = useState("gold-impact");
  const [secondBubbleX, setSecondBubbleX] = useState(320);

  // 3. Editor 상태
  const [editorMode, setEditorMode] = useState<"webtoon_manga" | "graphic_novel">("webtoon_manga");
  const [activeLang, setActiveLang] = useState<KaistoryLangCode>("ko");
  const [naverAlternatingApplied, setNaverAlternatingApplied] = useState(false);

  // 4. Story 상태
  const [exposedToStudents, setExposedToStudents] = useState(true);
  const [serviceStartDate, setServiceStartDate] = useState("2026-10-01");
  const [serviceEndDate, setServiceEndDate] = useState("2026-12-31");
  const [viewerMode, setViewerMode] = useState<"webtoon" | "manga">("manga");
  const [latestVersion, setLatestVersion] = useState("1.2.0");
  const [minVersion, setMinVersion] = useState("1.0.0");

  // 파생 계산: Conti
  const matchedEmotion = useMemo(
    () => matchContiEmotionCategory(emotionInput),
    [emotionInput],
  );
  const compiledDirective = useMemo(
    () =>
      formatContiDialogueDirective({
        id: "preview-dlg",
        speakerName: "지수",
        kind: "dialogue",
        deliveryMode,
        text: dialogueInput,
        translations: {},
      }),
    [deliveryMode, dialogueInput],
  );
  const firstFramePrompt = useMemo(
    () =>
      compileAnimationFirstFramePrompt({
        aspectRatioWidth: 3,
        aspectRatioHeight: 4,
        backgroundHint: "과학실 칠판과 오후 창가",
        lightingMood: "따뜻한 파스텔 오후 햇살",
      }),
    [],
  );
  const motionPrompt = useMemo(
    () =>
      compileAnimationMotionPrompt({
        cameraMotion,
        characterAction: "창밖을 바라보며 숨을 고른다",
        dialogues: [
          {
            id: "m-dlg",
            speakerName: "지수",
            kind: "dialogue",
            deliveryMode,
            text: dialogueInput,
            translations: {},
          },
        ],
      }),
    [cameraMotion, deliveryMode, dialogueInput],
  );
  const studyCardCharacterPrompt = useMemo(
    () =>
      compileStudyCardCharacterPrompt({
        basePrompt: "관성의 법칙과 안전벨트의 원리를 설명하는 학습카드 삽화",
        characterName: "지수",
      }),
    [],
  );

  // 파생 계산: Design
  const tailGeometry = useMemo(
    () =>
      buildBubbleTailGeometry({
        id: "design-b1",
        x: 100,
        y: 80,
        width: 220,
        height: 120,
        shape: "ellipse",
        cornerRatio: 0.3,
        polySides: 0,
        strokeWidth: 0,
        tailProfile,
        tailTipX: 210,
        tailTipY: 260,
        tailSpreadPx: 22,
        tailCurveOffset: 16,
        thoughtDotCount: 4,
        thoughtDotShrink: 0.74,
        clipToFrame: true,
        mangaHidden: false,
      }),
    [tailProfile],
  );
  const speakerVisuals = useMemo(
    () =>
      resolveWebtoonSpeakerVisuals({
        speakerName: "지수",
        characterColorHex: resolveCharacterAutoColor(0),
        projectMode: speakerDisplayMode,
      }),
    [speakerDisplayMode],
  );
  const relinkPreview = useMemo(
    () =>
      relinkOrphanedBubblesByLevenshtein({
        bubbles: [
          {
            bubbleId: "bubble-orphan-1",
            currentKontiRef: "stale-ref",
            koText: "관성의 법칙 때문에 버스가 급정거하면 몸이 앞으로 쏠려",
          },
        ],
        contiDialogues: INITIAL_DIALOGUES,
      }),
    [],
  );
  const fiveLangRows = useMemo(
    () => buildFiveLangDialogueSheetRows([{ pageNumber: 1, dialogues: INITIAL_DIALOGUES }]),
    [],
  );

  // 파생 계산: Editor
  const editorBubbles: readonly KaistoryEditorBubbleBox[] = useMemo(() => {
    const raw: readonly KaistoryEditorBubbleBox[] = [
      {
        id: "eb-1",
        cutNumber: 1,
        pageNumber: 1,
        speakerName: "지수",
        shape: "ellipse",
        x: 180,
        y: 60,
        width: 220,
        height: 100,
        fontSizePx: 22,
        fontFamily: "NanumGothic",
        texts: INITIAL_DIALOGUES[0]!.translations,
      },
      {
        id: "eb-2",
        cutNumber: 1,
        pageNumber: 1,
        speakerName: "민준",
        shape: "ellipse",
        x: 200,
        y: 200,
        width: 220,
        height: 100,
        fontSizePx: 22,
        fontFamily: "NanumGothic",
        texts: INITIAL_DIALOGUES[1]!.translations,
      },
    ];
    return naverAlternatingApplied
      ? applyNaverGrammarBubbleLayout({ cutWidth: 800, cutHeight: 1200, bubbles: raw })
      : raw;
  }, [naverAlternatingApplied]);

  const qaSheets = useMemo(() => evaluateFiveLanguageQaSheet(editorBubbles), [editorBubbles]);
  const dialogueReport = useMemo(
    () => generateDialogueInspectionReport({ title: projectId || "툰스튜디오 작품", bubbles: editorBubbles }),
    [editorBubbles, projectId],
  );
  const exportPlan = useMemo(
    () =>
      planInterleavedEpisodeExport({
        mode: "webtoon",
        lang: activeLang,
        cutNumbers: [1, 2],
        pageNumbers: [1, 2],
        studyCards: [
          { cardId: "card-inertia", title: "관성의 법칙", afterCutNumber: 1, afterPageNumber: 1 },
          { cardId: "card-summary", title: "단원 정리", afterCutNumber: null, afterPageNumber: null },
        ],
      }),
    [activeLang],
  );
  const graphicNovelManuscript = useMemo(
    () =>
      compileGraphicNovelManuscript(
        [
          {
            pageNumber: 1,
            widthPt: KAISTORY_A4_WIDTH_PT,
            heightPt: KAISTORY_A4_HEIGHT_PT,
            blocks: [
              { id: "gn-1", kind: "illustration", panelCutId: "cut-1", imageFit: "cover" },
              {
                id: "gn-2",
                kind: "paragraph",
                texts: INITIAL_DIALOGUES[0]!.translations,
              },
            ],
          },
        ],
        activeLang,
      ),
    [activeLang],
  );
  const ttsVoiceAssignments = useMemo(
    () =>
      autoAssignCastTtsVoices({
        lang: activeLang,
        characters: [
          {
            id: "char-1",
            name: "지수",
            gender: "female",
            ageGroup: classifyCharacterAgeGroup("17세 고등학생"),
          },
          {
            id: "char-2",
            name: "민준",
            gender: "male",
            ageGroup: classifyCharacterAgeGroup("17세 고등학생"),
          },
        ],
        availableVoices: [
          { voiceId: "flux-seoyeon-ko", name: "서연(청소녀)", lang: "ko", gender: "female", ageGroup: "teen" },
          { voiceId: "flux-jihoon-ko", name: "지훈(청소년)", lang: "ko", gender: "male", ageGroup: "teen" },
          { voiceId: "flux-narrator-ko", name: "하윤(나레이터)", lang: "ko", gender: "female", ageGroup: "adult" },
        ],
      }),
    [activeLang],
  );
  const ttsManifest = useMemo(
    () =>
      buildTtsAudioScriptManifest(
        INITIAL_DIALOGUES.map((d) => ({
          pageNumber: 1,
          kind: d.kind,
          speakerName: d.speakerName,
          text: d.translations[activeLang] ?? d.text,
        })),
      ),
    [activeLang],
  );

  // 파생 계산: Story
  const exposureEval = useMemo(
    () =>
      evaluateStudentExposureStatus({
        exposedToStudents,
        todayIsoDate: "2026-10-26",
        lang: activeLang,
        defaultWindow: { startDate: serviceStartDate, endDate: serviceEndDate },
      }),
    [activeLang, exposedToStudents, serviceEndDate, serviceStartDate],
  );
  const studyCardResolution = useMemo(
    () =>
      resolveStudyCardForViewer({
        card: {
          cardId: "card-inertia",
          baseQrLink: "https://www.kaion.kr/materials/inertia",
          langQrLinks: {
            en: "https://www.kaion.kr/materials/inertia?lang=en",
          },
          webtoonImageByLang: {
            ko: "/cards/inertia-webtoon-ko.png",
          },
          mangaImageByLang: {},
          kaitoonVisible: true,
          mangaVisible: true,
        },
        viewerMode,
        lang: activeLang,
      }),
    [activeLang, viewerMode],
  );
  const versionPolicy = useMemo(
    () => validateAppVersionPolicy({ latestVersion, minVersion }),
    [latestVersion, minVersion],
  );

  const tabs: readonly {
    readonly id: KaistoryWorkbenchTabId;
    readonly labelKo: string;
    readonly subtitleKo: string;
    readonly icon: typeof Film;
  }[] = [
    {
      id: "conti",
      labelKo: "1. conti · 콘티 저작",
      subtitleKo: "보이스오버 연출·2페이지 펼침·16:9 애니 프롬프트·학습카드 스프라이트",
      icon: Film,
    },
    {
      id: "design",
      labelKo: "2. design · 편집·변환",
      subtitleKo: "6종 말풍선 꼬리·이웃 연결·화자 표시 3모드·외곽 크로마키·kontiRef 복원",
      icon: Layers,
    },
    {
      id: "editor",
      labelKo: "3. editor · 렌더·내보내기",
      subtitleKo: "네이버 좌/우 배치·5언어 QA 시트·그래픽노블 A4·다화자 TTS WAV",
      icon: Languages,
    },
    {
      id: "story",
      labelKo: "4. story · 독자·학습카드",
      subtitleKo: "콘티 서버 비교 동기화·학생 노출 기간·학습카드 폴백·앱 버전 정책",
      icon: BookOpen,
    },
  ];

  const handleApplySpread = () => {
    const res = configureContiPageSpread(pages, 1, spreadMode);
    setPages(res.pages);
    setStatusBanner(res.messageKo);
  };

  const handleSnapSecondBubble = () => {
    const snapped = snapBubbleToOverlapPrevious(
      { x: 100, y: 100, width: 180, height: 100 },
      { x: secondBubbleX, y: 105, width: 180, height: 100 },
      14,
    );
    setSecondBubbleX(snapped.x);
    setStatusBanner(`앞 말풍선에 14px 겹치도록 스냅 완료 (X=${snapped.x}px)`);
  };

  return (
    <section
      className="rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-6"
      aria-labelledby="kaistory-workbench-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            <Sparkles size={14} aria-hidden="true" /> KAISTORY CREATION & PUBLISHING SUITE
          </p>
          <h2 id="kaistory-workbench-heading" className="mt-1 text-xl font-black tracking-tight text-fg sm:text-2xl">
            {bt(
              "KAISTORY 만화 제작·다국어 검수·학습카드 파이프라인",
              "KAISTORY Webtoon Authoring, 5-Language QA & Study Card Pipeline",
            )}
          </h2>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            {bt(
              "conti(콘티 저작) → design(편집·변환) → editor(렌더·그래픽노블·TTS 내보내기) → story(독자 배포·학습카드 동기화) 전 과정을 한 화면에서 실행합니다.",
              "Run the complete conti → design → editor → story pipeline in one workspace.",
            )}
          </p>
        </div>

        <div className="flex items-center gap-1.5" role="group" aria-label="작업 언어 선택">
          {KAISTORY_LANG_CODES.map((lang) => (
            <button
              key={lang}
              type="button"
              aria-pressed={activeLang === lang}
              onClick={() => setActiveLang(lang)}
              className={cn(
                "min-h-9 rounded-lg border px-2.5 text-xs font-bold transition-colors",
                activeLang === lang
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-panel text-fg-2 hover:text-fg",
              )}
            >
              {lang.toUpperCase()} · {KAISTORY_LANG_LABELS[lang]}
            </button>
          ))}
        </div>
      </div>

      {statusBanner ? (
        <p
          role="status"
          className="mt-3 flex items-center gap-2 rounded-xl border border-good/35 bg-good/10 px-3 py-2 text-xs font-semibold text-fg"
        >
          <CheckCircle2 size={14} className="text-good" aria-hidden="true" />
          {statusBanner}
        </p>
      ) : null}

      <div
        role="tablist"
        aria-label="KAISTORY 프로덕트 단계"
        className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`kaistory-tab-${tab.id}`}
              aria-selected={active}
              aria-controls={`kaistory-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex min-h-14 flex-col items-start rounded-2xl border p-3 text-left transition-all",
                active
                  ? "border-accent bg-accent-soft/45 shadow-sm"
                  : "border-line bg-panel/60 text-fg-2 hover:border-accent/40 hover:text-fg",
              )}
            >
              <span className="flex items-center gap-2 text-xs font-black text-fg">
                <Icon size={15} className="text-accent" aria-hidden="true" />
                {tab.labelKo}
              </span>
              <span className="mt-1 text-[0.68rem] leading-4 text-fg-3">{tab.subtitleKo}</span>
            </button>
          );
        })}
      </div>

      {/* 1. CONTI 패널 */}
      {activeTab === "conti" ? (
        <div
          role="tabpanel"
          id="kaistory-panel-conti"
          aria-labelledby="kaistory-tab-conti"
          className="mt-4 grid gap-4 lg:grid-cols-2"
        >
          <div className="space-y-3 rounded-2xl border border-line bg-panel/50 p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-fg">
              <MessageSquare size={15} className="text-accent" aria-hidden="true" />
              보이스오버·대사 6종 표현 & 감정 14종 자동 매칭
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-semibold text-fg-2">
                발화 방식
                <select
                  aria-label="발화 방식"
                  value={deliveryMode}
                  onChange={(e) => setDeliveryMode(e.target.value as KaistoryDialogueDeliveryMode)}
                  className="mt-1 min-h-10 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
                >
                  <option value="normal">일반 대사 (한국어로 말한다)</option>
                  <option value="shout">외침 (한국어로 외친다)</option>
                  <option value="broadcast">스피커 방송 (울리는 목소리)</option>
                  <option value="thought_vo">속마음 보이스오버 (입은 움직이지 않고 표정만)</option>
                  <option value="narration_vo">내레이션 보이스오버 (화면 밖)</option>
                  <option value="sfx_silent">소리만 나는 효과음 (글자 미표시)</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-fg-2">
                표정·분위기 입력 (자동 감정 분류: <strong>{matchedEmotion}</strong>)
                <input
                  type="text"
                  value={emotionInput}
                  onChange={(e) => setEmotionInput(e.target.value)}
                  className="mt-1 min-h-10 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
                />
              </label>
            </div>
            <label className="block text-xs font-semibold text-fg-2">
              대사 원문
              <input
                type="text"
                value={dialogueInput}
                onChange={(e) => setDialogueInput(e.target.value)}
                className="mt-1 min-h-10 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
              />
            </label>
            <p className="rounded-xl border border-line bg-card p-2.5 font-mono text-xs text-fg-2">
              {compiledDirective}
            </p>

            <div className="border-t border-line pt-3">
              <h4 className="text-xs font-bold text-fg">2페이지 펼침 지정 (합침 / 만화 전용 숨김)</h4>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  aria-label="펼침 모드"
                  value={spreadMode}
                  onChange={(e) => setSpreadMode(e.target.value as Exclude<KaistorySpreadMode, "none">)}
                  className="min-h-9 rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
                >
                  <option value="merge_webtoon">펼침 합침 (웹툰뷰에서 하나로 이어 표시)</option>
                  <option value="hide_webtoon">펼침 숨김 (웹툰뷰에서 두 페이지 숨김)</option>
                </select>
                <button
                  type="button"
                  onClick={handleApplySpread}
                  className="min-h-9 rounded-xl bg-accent px-3 text-xs font-bold text-on-accent"
                >
                  1-2쪽 펼침 적용
                </button>
              </div>
              <p className="mt-1.5 text-[0.7rem] text-fg-3">
                현재 1쪽 상태: {pages[0]?.spreadMode ?? "none"} · 키워드 검증:{" "}
                {validateContiKeywords(pages[0]?.keywords ?? []).keywords.join(", ")}
              </p>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-line bg-panel/50 p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-fg">
              <Film size={15} className="text-accent" aria-hidden="true" />
              16:9 애니메이션 첫 장면 리프레이밍 & 모션 프롬프트 컴파일러
            </h3>
            <label className="block text-xs font-semibold text-fg-2">
              카메라 움직임 프리셋
              <select
                aria-label="카메라 움직임 프리셋"
                value={cameraMotion}
                onChange={(e) => setCameraMotion(e.target.value as KaistoryAnimationCameraMotion)}
                className="mt-1 min-h-10 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
              >
                {(
                  Object.entries(KAISTORY_CAMERA_MOTION_DESCRIPTIONS) as [
                    KaistoryAnimationCameraMotion,
                    string,
                  ][]
                ).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {motionPrompt.warningKo ? (
              <p role="alert" className="rounded-lg border border-warning/40 bg-warning-soft/20 px-2.5 py-1.5 text-xs font-semibold text-warning">
                {motionPrompt.warningKo}
              </p>
            ) : null}
            <div className="space-y-1.5 text-[0.7rem]">
              <p className="font-bold text-fg-2">[첫 장면 16:9 리프레이밍 프롬프트]</p>
              <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap rounded-xl border border-line bg-card p-2 text-fg-2">
                {firstFramePrompt.prompt}
              </pre>
              <p className="font-bold text-fg-2">[애니메이션 모션 프롬프트 ({motionPrompt.estimatedSeconds}초)]</p>
              <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap rounded-xl border border-line bg-card p-2 text-fg-2">
                {motionPrompt.prompt}
              </pre>
              <p className="font-bold text-fg-2">[학습카드 인물 일관성 프롬프트]</p>
              <pre className="whitespace-pre-wrap rounded-xl border border-line bg-card p-2 text-fg-2">
                {studyCardCharacterPrompt}
              </pre>
            </div>
          </div>
        </div>
      ) : null}

      {/* 2. DESIGN 패널 */}
      {activeTab === "design" ? (
        <StudioKaistoryDesignTabPanel
          tailProfile={tailProfile}
          onChangeTailProfile={setTailProfile}
          speakerDisplayMode={speakerDisplayMode}
          onChangeSpeakerDisplayMode={setSpeakerDisplayMode}
          tailGeometry={tailGeometry}
          speakerVisuals={speakerVisuals}
          secondBubbleX={secondBubbleX}
          onSnapSecondBubble={handleSnapSecondBubble}
          selectedEffectId={selectedEffectId}
          onChangeSelectedEffectId={setSelectedEffectId}
          effectRotationDeg={effectRotationDeg}
          onRotateEffectBy15={() => setEffectRotationDeg((deg) => rotateEffectBy15Degrees(deg, 1))}
          selectedSfxPresetId={selectedSfxPresetId}
          onChangeSelectedSfxPresetId={setSelectedSfxPresetId}
          relinkPreview={relinkPreview}
          fiveLangRows={fiveLangRows}
        />
      ) : null}

      {/* 3. EDITOR 패널 */}
      {activeTab === "editor" ? (
        <StudioKaistoryEditorTabPanel
          activeLang={activeLang}
          naverAlternatingApplied={naverAlternatingApplied}
          onToggleNaverAlternating={() => {
            setNaverAlternatingApplied((prev) => !prev);
            setStatusBanner("네이버 문법 말풍선 좌/우 번갈아 배치를 전환했습니다.");
          }}
          editorBubbles={editorBubbles}
          initialDialogues={INITIAL_DIALOGUES}
          qaSheets={qaSheets}
          dialogueReport={dialogueReport}
          editorMode={editorMode}
          onChangeEditorMode={setEditorMode}
          graphicNovelManuscript={graphicNovelManuscript}
          exportPlan={exportPlan}
          ttsVoiceAssignments={ttsVoiceAssignments}
          ttsManifest={ttsManifest}
        />
      ) : null}

      {/* 4. STORY 패널 */}
      {activeTab === "story" ? (
        <StudioKaistoryStoryTabPanel
          activeLang={activeLang}
          exposedToStudents={exposedToStudents}
          onChangeExposedToStudents={setExposedToStudents}
          serviceStartDate={serviceStartDate}
          onChangeServiceStartDate={setServiceStartDate}
          serviceEndDate={serviceEndDate}
          onChangeServiceEndDate={setServiceEndDate}
          exposureEval={exposureEval}
          viewerMode={viewerMode}
          onChangeViewerMode={setViewerMode}
          studyCardResolution={studyCardResolution}
          latestVersion={latestVersion}
          onChangeLatestVersion={setLatestVersion}
          minVersion={minVersion}
          onChangeMinVersion={setMinVersion}
          versionPolicy={versionPolicy}
        />
      ) : null}
    </section>
  );
}
