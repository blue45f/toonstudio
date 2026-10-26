export type Wave4PlatformId =
  | "welo"
  | "claap"
  | "miro"
  | "figjam"
  | "discord-stage"
  | "kosy-office"
  | "slack-huddles";

export interface Wave4PlatformReaEvidenceEntry {
  readonly platformId: Wave4PlatformId;
  readonly platformName: string;
  readonly url: string;
  readonly captureId: string;
  readonly exportId: string;
  readonly astAnalysisId: string;
  readonly inspectionId: string;
  readonly parsedJavaScriptFiles: number;
  readonly visitedAstNodes: number;
  readonly findingsCount: number;
  readonly internalizedFeaturesKo: readonly string[];
}

export const WAVE4_VIRTUAL_OFFICE_REA_EVIDENCE_CATALOG: readonly Wave4PlatformReaEvidenceEntry[] = [
  {
    platformId: "welo",
    platformName: "Welo Spatial Workplace",
    url: "https://www.welospace.com/",
    captureId: "ev_f74f6bb96775b8e8d83a3a403e89f43ae7f351075231e9554b434a14491e04b8",
    exportId: "ev_6262f27c0315218c86500f6d41ffee5ea57337f37de8114d86c6782c4d9741c9",
    astAnalysisId: "ev_aaa64557300e635afc999f338ab581ca85caa0c8fb3d6325c39bd6d84837a420",
    inspectionId: "ev_82c603a1adeb5481656242f5a507a08837d6fbdd22e496ba0475d997a7e2cc17",
    parsedJavaScriptFiles: 10,
    visitedAstNodes: 197548,
    findingsCount: 985,
    internalizedFeaturesKo: [
      "파트별 네이버후드(Neighborhood) 구역 및 2인 이상 집결 시 자동 방음 경계 잠금",
      "외부 편집자·성우·번역가 전용 임시 방문자 패스(Visitor Pass Portal) 발급",
    ],
  },
  {
    platformId: "claap",
    platformName: "Claap Async Video War-Room",
    url: "https://www.claap.io/",
    captureId: "ev_ed1268cfe5fd57cddffabbf338c93b1f4f441e887d0fa99041c8c96cfe873c34",
    exportId: "ev_9a5fa196f823bbe5de6ffa1a157ff3c47f7a35a06e4cb6913f76da441e3c7ddc",
    astAnalysisId: "ev_cd66cc31cef26ed1213cfddf39fb452e031636e779700eff569340382ae729f1",
    inspectionId: "ev_951c4f705d3cd891b12ca617d9466b445f725b6d0933da3f4504244dcda28270",
    parsedJavaScriptFiles: 11,
    visitedAstNodes: 7573,
    findingsCount: 80,
    internalizedFeaturesKo: [
      "원고 컷 좌표(x%, y%) 연동 타임코드 비동기 비디오 클립 핀 스레드",
      "AI 챕터 요약 및 피드백 승인 상태 머신(Pending → Changes Requested → Approved)",
    ],
  },
  {
    platformId: "miro",
    platformName: "Miro Storyboard War-Room",
    url: "https://miro.com/",
    captureId: "ev_9a87720e3d0a6b3e342a7df93d6abd5f53a8addbee3219a26f1bd7969f5365b2",
    exportId: "ev_9cfa3e1eee515e47ffc08db31dca9948ce1fe23f3258082deb4fdca641b63d20",
    astAnalysisId: "ev_376ed612b43ddd363d2c7a3d31a15d0551f9aca654759429ffaf6c1f41493c20",
    inspectionId: "ev_0a1d30e86ed2b82558fcdcb43f4ddf83061e6f1aeb753a5104b7e5bcdda0a305",
    parsedJavaScriptFiles: 3,
    visitedAstNodes: 49015,
    findingsCount: 79,
    internalizedFeaturesKo: [
      "총괄 PD 뷰포트 강제 동기화(Bring Everyone to Me) 및 프라이빗 브레인스토밍 일괄 공개",
      "차기 에피소드 썸네일·하이라이트 컷 가중치 닷 보팅(Dot Voting) 세션",
    ],
  },
  {
    platformId: "figjam",
    platformName: "Figma FigJam Multiplayer Canvas",
    url: "https://www.figma.com/figjam/",
    captureId: "ev_f1107fa10aa6e424020283cd0d937bc340dacff86b93d2eb65855b75e606d7ec",
    exportId: "ev_cb4e184528dee1ec5b0cde09c5306ce9bbe7997b882eaf8073654c6301a1d3dc",
    astAnalysisId: "ev_aa66cc320ce3b57f0bea24c3fc931a7b0efe8c5f77a5d62ee89bd2992281f73c",
    inspectionId: "ev_459b023f6d9ad8e4a11cdb06849ba5c1f3bb5c18585f8b43df513b3559933954",
    parsedJavaScriptFiles: 4,
    visitedAstNodes: 7286,
    findingsCount: 92,
    internalizedFeaturesKo: [
      "슬래시(/) 즉석 멀티플레이어 커서 챗 버블 및 스탬프 휠(구도 극찬·인체 교정 등)",
      "두 작업자 커서 근접 충돌 시 하이파이브(High-Five) 햅틱 파티클 물리 판정",
    ],
  },
  {
    platformId: "discord-stage",
    platformName: "Discord Stage & Go-Live Theater",
    url: "https://discord.com/",
    captureId: "ev_69589e9d464ac1ccff8c0636bf0dc837df41f1ae393781976a830743ff388631",
    exportId: "ev_f286c64936d5894484c9ada59cff0e69a4d602502ad04e467fee4865b5162721",
    astAnalysisId: "ev_c74e80b77f8ee98d66e4e6ecd1b60bbc0ae2cfb0df7116b100a66627f761439b",
    inspectionId: "ev_57b71c1bd7cb6c72766dd2b5cacd77953e395ea6b82b3b77174aa380f5b698f9",
    parsedJavaScriptFiles: 4,
    visitedAstNodes: 4586,
    findingsCount: 40,
    internalizedFeaturesKo: [
      "4K60 다중 작화 방송 Go-Live 시어터 그리드 및 스포트라이트 전환",
      "스테이지 채널 청중 손들기(Hand-Raise) 발언권 승격 큐 및 사운드보드 스팅어",
    ],
  },
  {
    platformId: "kosy-office",
    platformName: "Kosy Biophilic Virtual Office",
    url: "https://www.kosyoffice.com/",
    captureId: "ev_af93a1c1f8f3de129da03c26d2be14121dcbbd85ae642783d1435f34445b965a",
    exportId: "ev_3e3119a225f8ef63fe7fe34f2a0d3f46d05c3067db061ac1163fba4b67fb5064",
    astAnalysisId: "ev_674ce113037cd936f919180768377812d88ccc5da11d37278c102e7915cfacaf",
    inspectionId: "ev_d4eacdfb90e64b259b7f64ba734af46fc1f2e40602607a21a9f1408e523fdc12",
    parsedJavaScriptFiles: 4,
    visitedAstNodes: 909,
    findingsCount: 0,
    internalizedFeaturesKo: [
      "바이오필릭(Biophilic) 환경 테마 전환 및 크리에이터 데일리 에너지·번아웃 체크인",
      "파트 간 아이스브레이킹 커피 룰렛(Coffee Roulette) 랜덤 매칭",
    ],
  },
  {
    platformId: "slack-huddles",
    platformName: "Slack Thread Huddles & Canvas Sidecar",
    url: "https://slack.com/",
    captureId: "ev_c55ea1f6ba3af48e03602b4deedaa8007cd4616c71971acc8c571a097cf6f8f4",
    exportId: "ev_a8a2442514929250d044c843196bad8f0b125bf7498f166b3cbac1f8a9d6ed46",
    astAnalysisId: "ev_31955775a9b62bcd0c945204a1bb6bc99c73f6ede45414568cc97cd18f318bf9",
    inspectionId: "ev_13b8413c7105a8a7cba0d49ae4cbbdbc022a7640e67a2c42604dd5ffc40c6e30",
    parsedJavaScriptFiles: 3,
    visitedAstNodes: 2687,
    findingsCount: 13,
    internalizedFeaturesKo: [
      "원고 이슈 스레드 직결 경량 오디오 허들(Thread Huddle) 및 공유 캔버스 사이드카 체크리스트",
      "실시간 이모지 리액션 버스트 파운틴(Emoji Burst Fountain) 피드백",
    ],
  },
];

export type AsyncCutDecisionStatus = "pending-review" | "changes-requested" | "approved-signoff";

export interface AsyncVideoCutPinThread {
  readonly threadId: string;
  readonly episodeLabel: string;
  readonly cutNumber: number;
  readonly xPercent: number;
  readonly yPercent: number;
  readonly authorName: string;
  readonly durationSec: number;
  readonly aiChapterSummaryKo: string;
  readonly decisionStatus: AsyncCutDecisionStatus;
}

export interface WeloNeighborhoodZone {
  readonly zoneId: string;
  readonly nameKo: string;
  readonly activeMemberCount: number;
  readonly autoBoundaryLocked: boolean;
  readonly visitorPassCode: string;
  readonly visitorGuestNameKo: string | null;
}

export interface DotVotingOption {
  readonly optionId: string;
  readonly labelKo: string;
  readonly votes: number;
}

export interface StoryboardWarroomBoardState {
  readonly bringEveryoneToHost: boolean;
  readonly hostViewportTargetCut: number;
  readonly privateWritingMode: boolean;
  readonly privateDraftsRevealed: boolean;
  readonly remainingDots: number;
  readonly votingOptions: readonly DotVotingOption[];
}

export type FigJamStampKind =
  | "approved-star"
  | "fire-composition"
  | "fix-anatomy"
  | "dialogue-polish";

export interface CursorChatBubble {
  readonly bubbleId: string;
  readonly authorName: string;
  readonly messageKo: string;
  readonly x: number;
  readonly y: number;
  readonly stampKind: FigJamStampKind;
}

export interface CursorHighFiveCollisionResult {
  readonly collided: boolean;
  readonly distancePx: number;
  readonly midpoint: { readonly x: number; readonly y: number };
  readonly effectLabelKo: string;
}

export interface GoLiveStreamSlot {
  readonly streamId: string;
  readonly streamerName: string;
  readonly dccAppLabel: string;
  readonly resolution: "1080p60" | "1440p60" | "4K60";
  readonly viewersCount: number;
  readonly spotlighted: boolean;
}

export interface StageHandRaiseRequest {
  readonly memberId: string;
  readonly memberName: string;
  readonly topicKo: string;
}

export interface StageGoLiveTheaterState {
  readonly streams: readonly GoLiveStreamSlot[];
  readonly activeSpeakers: readonly string[];
  readonly handRaiseQueue: readonly StageHandRaiseRequest[];
  readonly lastStingerPlayedKo: string;
}

export type BiophilicHabitatThemeId =
  | "sunlit-greenhouse"
  | "rainy-seoul-loft"
  | "jeju-coastal-terrace"
  | "cyberpunk-neon-den";

export interface CreatorEnergyCheckIn {
  readonly memberId: string;
  readonly memberName: string;
  readonly energyScore: 1 | 2 | 3 | 4 | 5;
  readonly moodTagKo: string;
}

export interface BiophilicHabitatWellnessState {
  readonly activeThemeId: BiophilicHabitatThemeId;
  readonly energyCheckIns: readonly CreatorEnergyCheckIn[];
  readonly coffeeRoulettePair: readonly [string, string];
  readonly icebreakerPromptKo: string;
}

export interface ThreadHuddleChecklistItem {
  readonly itemId: string;
  readonly textKo: string;
  readonly completed: boolean;
}

export interface ThreadHuddleCanvasSidecarState {
  readonly threadId: string;
  readonly threadTitleKo: string;
  readonly huddleActive: boolean;
  readonly activeParticipants: readonly string[];
  readonly checklistItems: readonly ThreadHuddleChecklistItem[];
  readonly emojiBurstHistory: readonly string[];
}

export interface StudioVirtualOfficeWave4State {
  readonly neighborhoods: readonly WeloNeighborhoodZone[];
  readonly asyncCutPinThreads: readonly AsyncVideoCutPinThread[];
  readonly warroomBoard: StoryboardWarroomBoardState;
  readonly cursorBubbles: readonly CursorChatBubble[];
  readonly lastHighFiveEffectKo: string;
  readonly stageTheater: StageGoLiveTheaterState;
  readonly biophilicWellness: BiophilicHabitatWellnessState;
  readonly threadHuddleSidecar: ThreadHuddleCanvasSidecarState;
}

export function createDefaultVirtualOfficeWave4State(): StudioVirtualOfficeWave4State {
  return {
    neighborhoods: [
      {
        zoneId: "nb-story-conte",
        nameKo: "콘티·스토리 네이버후드",
        activeMemberCount: 3,
        autoBoundaryLocked: true,
        visitorPassCode: "WELO-EP15-GUEST",
        visitorGuestNameKo: "외부 웹소설 원작자 (임시 패스)",
      },
      {
        zoneId: "nb-bg-3d",
        nameKo: "3D 배경·라이팅 네이버후드",
        activeMemberCount: 1,
        autoBoundaryLocked: false,
        visitorPassCode: "WELO-BG3D-PASS",
        visitorGuestNameKo: null,
      },
    ],
    asyncCutPinThreads: [
      {
        threadId: "claap-pin-14-38",
        episodeLabel: "EP.14",
        cutNumber: 38,
        xPercent: 64,
        yPercent: 42,
        authorName: "민 프로듀서",
        durationSec: 52,
        aiChapterSummaryKo: "0:00 역광 채도 조율 → 0:28 말풍선 꼬리 위치 교정 요청",
        decisionStatus: "pending-review",
      },
      {
        threadId: "claap-pin-14-44",
        episodeLabel: "EP.14",
        cutNumber: 44,
        xPercent: 32,
        yPercent: 71,
        authorName: "수석 배경 아티스트",
        durationSec: 35,
        aiChapterSummaryKo: "0:00 지하철 스크린도어 반사광 블렌딩 완료 보고",
        decisionStatus: "approved-signoff",
      },
    ],
    warroomBoard: {
      bringEveryoneToHost: false,
      hostViewportTargetCut: 38,
      privateWritingMode: true,
      privateDraftsRevealed: false,
      remainingDots: 3,
      votingOptions: [
        { optionId: "vote-opt-a", labelKo: "A안: 옥상 역광 클로즈업 썸네일", votes: 5 },
        { optionId: "vote-opt-b", labelKo: "B안: 빗속 대치 와이드 샷 썸네일", votes: 4 },
        { optionId: "vote-opt-c", labelKo: "C안: 타이포그래피 중심 티저 썸네일", votes: 2 },
      ],
    },
    cursorBubbles: [
      {
        bubbleId: "fjam-bubble-1",
        authorName: "준 작가",
        messageKo: "/여기 39컷 대사 호흡을 한 템포 끊어갈까요?",
        x: 220,
        y: 180,
        stampKind: "dialogue-polish",
      },
    ],
    lastHighFiveEffectKo: "대기 중 (커서 근접 시 하이파이브 발동)",
    stageTheater: {
      streams: [
        {
          streamId: "golive-clipstudio-1",
          streamerName: "수석 선화 작가",
          dccAppLabel: "Clip Studio Paint EX — EP.15 펜선 라이브",
          resolution: "4K60",
          viewersCount: 7,
          spotlighted: true,
        },
        {
          streamId: "golive-blender-2",
          streamerName: "수석 배경 아티스트",
          dccAppLabel: "Blender 4.3 — 지하철역 볼류메트릭 안개 셰이더",
          resolution: "1440p60",
          viewersCount: 5,
          spotlighted: false,
        },
      ],
      activeSpeakers: ["민 프로듀서", "수석 선화 작가"],
      handRaiseQueue: [
        {
          memberId: "member-color-lead",
          memberName: "채색 팀장",
          topicKo: "15화 야간 씬 그림자 멀티플라이 레이어 통일안 제안",
        },
      ],
      lastStingerPlayedKo: "🎬 컷 오케이 시네마틱 차임",
    },
    biophilicWellness: {
      activeThemeId: "rainy-seoul-loft",
      energyCheckIns: [
        { memberId: "creator-self", memberName: "수석 배경 아티스트", energyScore: 4, moodTagKo: "몰입 호조" },
        { memberId: "creator-line", memberName: "수석 선화 작가", energyScore: 3, moodTagKo: "카페인 충전 필요" },
      ],
      coffeeRoulettePair: ["수석 배경 아티스트", "어시스턴트 다은"],
      icebreakerPromptKo: "이번 주 작업 중 가장 마음에 들었던 배경 연출 컷 하나를 공유해 보세요!",
    },
    threadHuddleSidecar: {
      threadId: "thread-ep14-qc",
      threadTitleKo: "#ep14-최종식자-및-모바일가독성-검수",
      huddleActive: true,
      activeParticipants: ["민 프로듀서", "수석 배경 아티스트", "소라 편집자"],
      checklistItems: [
        { itemId: "chk-1", textKo: "38컷 효과음 외곽선 가독성 보강", completed: true },
        { itemId: "chk-2", textKo: "45컷 모바일 다크모드 여백 클리핑 확인", completed: false },
      ],
      emojiBurstHistory: ["🔥", "🎨", "✅"],
    },
  };
}

export function issueWeloVisitorPass(
  state: StudioVirtualOfficeWave4State,
  zoneId: string,
  guestNameKo: string,
): StudioVirtualOfficeWave4State {
  const trimmed = guestNameKo.trim();
  if (!trimmed) return state;
  return {
    ...state,
    neighborhoods: state.neighborhoods.map((zone) =>
      zone.zoneId === zoneId
        ? {
            ...zone,
            activeMemberCount: zone.activeMemberCount + 1,
            autoBoundaryLocked: zone.activeMemberCount + 1 >= 2,
            visitorGuestNameKo: trimmed,
          }
        : zone,
    ),
  };
}

export function updateAsyncCutPinDecision(
  state: StudioVirtualOfficeWave4State,
  threadId: string,
  decisionStatus: AsyncCutDecisionStatus,
): StudioVirtualOfficeWave4State {
  return {
    ...state,
    asyncCutPinThreads: state.asyncCutPinThreads.map((thread) =>
      thread.threadId === threadId ? { ...thread, decisionStatus } : thread,
    ),
  };
}

export function toggleWarroomBringEveryoneToHost(
  state: StudioVirtualOfficeWave4State,
  targetCut: number,
): StudioVirtualOfficeWave4State {
  return {
    ...state,
    warroomBoard: {
      ...state.warroomBoard,
      bringEveryoneToHost: !state.warroomBoard.bringEveryoneToHost,
      hostViewportTargetCut: Math.max(1, Math.round(targetCut)),
    },
  };
}

export function revealWarroomPrivateDrafts(
  state: StudioVirtualOfficeWave4State,
): StudioVirtualOfficeWave4State {
  return {
    ...state,
    warroomBoard: {
      ...state.warroomBoard,
      privateWritingMode: false,
      privateDraftsRevealed: true,
    },
  };
}

export function castWarroomDotVote(
  state: StudioVirtualOfficeWave4State,
  optionId: string,
): StudioVirtualOfficeWave4State {
  if (state.warroomBoard.remainingDots <= 0) return state;
  const targetExists = state.warroomBoard.votingOptions.some((opt) => opt.optionId === optionId);
  if (!targetExists) return state;
  return {
    ...state,
    warroomBoard: {
      ...state.warroomBoard,
      remainingDots: state.warroomBoard.remainingDots - 1,
      votingOptions: state.warroomBoard.votingOptions.map((opt) =>
        opt.optionId === optionId ? { ...opt, votes: opt.votes + 1 } : opt,
      ),
    },
  };
}

export function detectCursorHighFiveCollision(
  cursorA: { readonly x: number; readonly y: number },
  cursorB: { readonly x: number; readonly y: number },
  thresholdPx = 36,
): CursorHighFiveCollisionResult {
  const dx = cursorA.x - cursorB.x;
  const dy = cursorA.y - cursorB.y;
  const distancePx = Math.round(Math.hypot(dx, dy) * 10) / 10;
  const collided = distancePx <= Math.max(4, thresholdPx);
  return {
    collided,
    distancePx,
    midpoint: {
      x: Math.round((cursorA.x + cursorB.x) / 2),
      y: Math.round((cursorA.y + cursorB.y) / 2),
    },
    effectLabelKo: collided
      ? `🙌 하이파이브 성공! (${distancePx}px 근접 · 햅틱 스파크 발동)`
      : `커서 거리 ${distancePx}px (36px 이내 접근 시 하이파이브)`,
  };
}

export function postMultiplayerCursorBubble(
  state: StudioVirtualOfficeWave4State,
  input: {
    readonly bubbleId: string;
    readonly authorName: string;
    readonly messageKo: string;
    readonly x: number;
    readonly y: number;
    readonly stampKind: FigJamStampKind;
  },
): StudioVirtualOfficeWave4State {
  const trimmed = input.messageKo.trim();
  if (!trimmed) return state;
  const collision = detectCursorHighFiveCollision({ x: input.x, y: input.y }, { x: 228, y: 186 });
  return {
    ...state,
    cursorBubbles: [
      {
        bubbleId: input.bubbleId,
        authorName: input.authorName,
        messageKo: trimmed,
        x: input.x,
        y: input.y,
        stampKind: input.stampKind,
      },
      ...state.cursorBubbles,
    ],
    lastHighFiveEffectKo: collision.effectLabelKo,
  };
}

export function promoteStageHandRaiseToSpeaker(
  state: StudioVirtualOfficeWave4State,
  memberId: string,
): StudioVirtualOfficeWave4State {
  const request = state.stageTheater.handRaiseQueue.find((item) => item.memberId === memberId);
  if (!request) return state;
  return {
    ...state,
    stageTheater: {
      ...state.stageTheater,
      activeSpeakers: state.stageTheater.activeSpeakers.includes(request.memberName)
        ? state.stageTheater.activeSpeakers
        : [...state.stageTheater.activeSpeakers, request.memberName],
      handRaiseQueue: state.stageTheater.handRaiseQueue.filter((item) => item.memberId !== memberId),
      lastStingerPlayedKo: `🎙️ ${request.memberName} 스테이지 발언자 승격 차임`,
    },
  };
}

export function switchGoLiveSpotlightStream(
  state: StudioVirtualOfficeWave4State,
  streamId: string,
): StudioVirtualOfficeWave4State {
  return {
    ...state,
    stageTheater: {
      ...state.stageTheater,
      streams: state.stageTheater.streams.map((stream) => ({
        ...stream,
        spotlighted: stream.streamId === streamId,
      })),
    },
  };
}

export function switchBiophilicHabitatTheme(
  state: StudioVirtualOfficeWave4State,
  themeId: BiophilicHabitatThemeId,
): StudioVirtualOfficeWave4State {
  return {
    ...state,
    biophilicWellness: {
      ...state.biophilicWellness,
      activeThemeId: themeId,
    },
  };
}

export function toggleThreadHuddleChecklistItem(
  state: StudioVirtualOfficeWave4State,
  itemId: string,
): StudioVirtualOfficeWave4State {
  return {
    ...state,
    threadHuddleSidecar: {
      ...state.threadHuddleSidecar,
      checklistItems: state.threadHuddleSidecar.checklistItems.map((item) =>
        item.itemId === itemId ? { ...item, completed: !item.completed } : item,
      ),
    },
  };
}

export function triggerThreadHuddleEmojiBurst(
  state: StudioVirtualOfficeWave4State,
  emoji: string,
): StudioVirtualOfficeWave4State {
  const trimmed = emoji.trim();
  if (!trimmed) return state;
  return {
    ...state,
    threadHuddleSidecar: {
      ...state.threadHuddleSidecar,
      emojiBurstHistory: [trimmed, ...state.threadHuddleSidecar.emojiBurstHistory.slice(0, 7)],
    },
  };
}

export interface Wave4CoverageReport {
  readonly totalWave4Platforms: number;
  readonly coveredPlatformIds: readonly Wave4PlatformId[];
  readonly coverageRatio: number;
  readonly totalCumulativePlatformsAcrossAllWaves: number;
}

export function evaluateWave4WarroomAsyncStageCoverage(): Wave4CoverageReport {
  const coveredPlatformIds = WAVE4_VIRTUAL_OFFICE_REA_EVIDENCE_CATALOG.map((item) => item.platformId);
  return {
    totalWave4Platforms: WAVE4_VIRTUAL_OFFICE_REA_EVIDENCE_CATALOG.length,
    coveredPlatformIds,
    coverageRatio: coveredPlatformIds.length === 7 ? 1 : coveredPlatformIds.length / 7,
    totalCumulativePlatformsAcrossAllWaves: 28 + coveredPlatformIds.length,
  };
}
