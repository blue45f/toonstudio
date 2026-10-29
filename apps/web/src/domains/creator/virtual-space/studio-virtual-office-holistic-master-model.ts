/**
 * Wave 5 Holistic Virtual Office Master Model (Cumulative 40 Platforms)
 *
 * Clean-room synthesis of Wave 5 REA reverse-engineered platforms:
 * 1. Whereby (whereby.com) — Browser-Embedded Hybrid Video Rooms, Floating PiP Camera Bubble & Acoustic Echo Ducking
 * 2. Pumble (pumble.com) — Persistent Team Channels, Scheduled Episode Standup Digest Bot & Thread Rollup
 * 3. Krisp (krisp.ai) — AI Background Voice Cancellation (BVC), Stylus/Keyboard Noise Suppression & Live Multilingual Subtitles
 * 4. Airtime / mmhmm (airtime.com) — Over-the-Shoulder Creator Presentation, Transparent Cutout & Slide-Deck Tablet Overlay
 * 5. Cal.com (cal.com) — Calendar-Driven Virtual Office Auto-Presence Sync & Booking-Linked Room Auto-Unlock
 *
 * Plus the complete 40-Platform Master Matrix across Waves 1–5.
 */

export type Wave5PlatformId =
  | "whereby"
  | "pumble"
  | "krisp"
  | "airtime-mmhmm"
  | "calcom";

export interface Wave5ReaPlatformEvidence {
  readonly id: Wave5PlatformId;
  readonly name: string;
  readonly url: string;
  readonly captureEvidenceId: string;
  readonly exportEvidenceId: string;
  readonly astEvidenceId: string;
  readonly viewEvidenceId: string;
  readonly parsedJsFiles: number;
  readonly visitedAstNodes: number;
  readonly findings: number;
  readonly textBytesRead: number;
  readonly coreMechanics: readonly string[];
  readonly toonStudioInternalizationKo: string;
}

export const VIRTUAL_OFFICE_WAVE5_REA_EVIDENCE_LEDGER: readonly Wave5ReaPlatformEvidence[] = [
  {
    id: "whereby",
    name: "Whereby",
    url: "https://whereby.com/",
    captureEvidenceId: "ev_88ee72ee510fe15d3336d0f6588d0b8e4692dbbee243cfd227215e4114e80cf9",
    exportEvidenceId: "ev_9c9d323ab0877338214e7d2406b16d6f8a0d60ef71fd989a814341ae40933433",
    astEvidenceId: "ev_d331c2e41b8a89f8f5a63593e17a59c6372d84cb1400edfd37b72ae68559addf",
    viewEvidenceId: "ev_74a9509f92be0094eb3462594cbd9ef6e87daedc350ee2f9ae786510f0bcaef4",
    parsedJsFiles: 3,
    visitedAstNodes: 1652,
    findings: 12,
    textBytesRead: 8814,
    coreMechanics: [
      "Zero-Install Browser Embedded Video Room",
      "Floating Picture-in-Picture (PiP) Creator Bubble",
      "Hybrid Guest Knock-Link & Sub-Room Lock",
    ],
    toonStudioInternalizationKo:
      "클립스튜디오·블렌더 작업 위에서도 가리지 않고 떠 있는 플로팅 PiP 아바타 버블 및 외부 편집자 원클릭 게스트 룸",
  },
  {
    id: "pumble",
    name: "Pumble",
    url: "https://pumble.com/",
    captureEvidenceId: "ev_c03777321f4eb47a849a8c9b757fdf781a0223e4a9780845af6c9b877520c6df",
    exportEvidenceId: "ev_e0def067928e289797fa301dc98b40ebfe1a3f081498a7d286365a2084a63f01",
    astEvidenceId: "ev_915ad0d0df6374e02fabdde65da0149ddfe5467d79a5980923dcb4e9bedbc157",
    viewEvidenceId: "ev_a8316ccd362945d269f620e20d6f44bf0b915bb2c8efee5fa4d6da51561404d0",
    parsedJsFiles: 4,
    visitedAstNodes: 64197,
    findings: 605,
    textBytesRead: 210789,
    coreMechanics: [
      "Persistent Episode Production Channels",
      "Automated Daily Standup Digest Bot (Done / Doing / Blockers)",
      "Cross-Floor Thread Search & Voice Huddle Archive",
    ],
    toonStudioInternalizationKo:
      "회차·공정별 영구 채널과 매일 아침 자동 수집되는 비동기 스탠드업 다이제스트 봇(완료 컷·진행 컷·블로커 요약)",
  },
  {
    id: "krisp",
    name: "Krisp AI",
    url: "https://krisp.ai/",
    captureEvidenceId: "ev_1dd9b64ca95aee569a60f6ba9e0b0cde3bfadd863f24e1c461f3a87d457ee2de",
    exportEvidenceId: "ev_e90b5bc0a49b3a8feab46ed45ae704ed847a69fbad72439fdf828b8babce8c83",
    astEvidenceId: "ev_071163afad380416d12606f4cc01d3de8d4412ea8530d603880e7a188b941059",
    viewEvidenceId: "ev_9cf29bbab9236e211d02ded42d16851778c7149374935d1a63055b117d95b2ad",
    parsedJsFiles: 4,
    visitedAstNodes: 37650,
    findings: 94,
    textBytesRead: 161012,
    coreMechanics: [
      "Background Voice Cancellation (BVC) & Stylus/Keyboard Noise Filter",
      "Real-Time Multilingual Subtitle & Accent Clarity Engine",
      "Zero-Latency Client Audio DSP Pipeline",
    ],
    toonStudioInternalizationKo:
      "펜 태블릿 타건음·기계식 키보드 소음 완벽 제거(BVC) 및 한·영·일·중 글로벌 로컬라이제이션 실시간 자막·음성 번역",
  },
  {
    id: "airtime-mmhmm",
    name: "Airtime (mmhmm)",
    url: "https://www.airtime.com/",
    captureEvidenceId: "ev_c37028cbab1502ca4720506fce3834a96becbead05fa7cedc583b6f48f587d9f",
    exportEvidenceId: "ev_8a4eb9639d66e7ea28adccfca6bf9e5164248a7371ea8a082cef755e8986c568",
    astEvidenceId: "ev_013703b2f38d754281b37087beb98dad09ee607a6a22a0cfac373eca4d9157ed",
    viewEvidenceId: "ev_d49bf4eb716e9f5a1e7daee2676478fbe30d0d545d5fa2cb90859ff2f58b85a9",
    parsedJsFiles: 4,
    visitedAstNodes: 44901,
    findings: 93,
    textBytesRead: 159464,
    coreMechanics: [
      "Over-the-Shoulder Storyboard & Slide Deck Overlay",
      "Transparent Presenter Silhouette Cutout",
      "Interactive Lookbook & Live Pen-Tablet Pointer",
    ],
    toonStudioInternalizationKo:
      "작가 실루엣 뒤편이나 어깨 위에 콘티·원고 슬라이드를 띄워 실시간 브리핑하는 오버더숄더(Over-the-Shoulder) 발표 스테이지",
  },
  {
    id: "calcom",
    name: "Cal.com",
    url: "https://cal.com/",
    captureEvidenceId: "ev_4efc58a1e2b9efe9ca83157cb2034dd5443b36f2baf8a064301be28af1945187",
    exportEvidenceId: "ev_a0833cbb9b1b86ea10c42e183738407330ee0d164c8061d7dcd0ed6044098123",
    astEvidenceId: "ev_6237217ce3796f8e1f3eb8c9fc1a1def8c411af6efe63b42ba8e30336fe3d6d7",
    viewEvidenceId: "ev_81934c8ebc94c0c8b0ad5862c2d56e8d5f87c679a218c2dbef12df306fad4c75",
    parsedJsFiles: 4,
    visitedAstNodes: 29573,
    findings: 102,
    textBytesRead: 97782,
    coreMechanics: [
      "Calendar-Driven Virtual Office Auto-Presence Sync",
      "Booking-Linked Critique Room Auto-Unlock (T-5min)",
      "Timezone-Aware Cross-Studio Shift Routing",
    ],
    toonStudioInternalizationKo:
      "연재 일정·편집부 미팅 캘린더와 연동되어 아바타 상태를 자동 전환하고 예약된 피드백 룸을 시작 5분 전 자동 잠금 해제",
  },
] as const;

export type CreatorPresentationOverlayMode =
  | "floating-pip-bubble"
  | "over-the-shoulder-tablet"
  | "transparent-silhouette-cutout"
  | "split-storyboard-stage";

export interface StoryboardBriefingSlide {
  readonly slideId: string;
  readonly cutRangeLabel: string;
  readonly titleKo: string;
  readonly directorNoteKo: string;
}

export interface FloatingCreatorPresentationState {
  readonly mode: CreatorPresentationOverlayMode;
  readonly alwaysOnTopPip: boolean;
  readonly acousticEchoDuckingDb: number;
  readonly hybridGuestRoomLocked: boolean;
  readonly activeSlideIndex: number;
  readonly slides: readonly StoryboardBriefingSlide[];
}

export type TranslationLocaleCode = "ko" | "en" | "ja" | "zh";

export interface LiveTranslatedTranscriptItem {
  readonly id: string;
  readonly speakerName: string;
  readonly sourceLocale: TranslationLocaleCode;
  readonly targetLocale: TranslationLocaleCode;
  readonly originalText: string;
  readonly translatedText: string;
  readonly suppressedNoiseTypes: readonly string[];
}

export interface KrispVoiceClarityTranslationState {
  readonly bvcNoiseCancellationEnabled: boolean;
  readonly stylusAndKeyboardFilterEnabled: boolean;
  readonly accentClarityBoostPct: number;
  readonly targetTranslationLocale: TranslationLocaleCode;
  readonly liveTranscripts: readonly LiveTranslatedTranscriptItem[];
}

export interface CalendarScheduledStudioBlock {
  readonly bookingId: string;
  readonly titleKo: string;
  readonly startMinuteOfDay: number;
  readonly endMinuteOfDay: number;
  readonly autoMappedStatus: "available" | "focused" | "reviewing" | "in-meeting";
  readonly autoMappedHat: string;
  readonly targetRoomId: string;
  readonly roomUnlocked: boolean;
}

export interface CalendarAutoPresenceSyncState {
  readonly calendarSyncEnabled: boolean;
  readonly currentMinuteOfDay: number;
  readonly activeSyncedStatus: "available" | "focused" | "reviewing" | "in-meeting";
  readonly activeSyncedHat: string;
  readonly scheduledBlocks: readonly CalendarScheduledStudioBlock[];
}

export interface PumbleStandupDigestEntry {
  readonly creatorId: string;
  readonly creatorName: string;
  readonly roleKo: string;
  readonly completedCutsKo: string;
  readonly inProgressCutsKo: string;
  readonly blockerKo: string | null;
  readonly submittedAtLabel: string;
}

export interface HolisticPlatformCatalogItem {
  readonly index: number;
  readonly id: string;
  readonly name: string;
  readonly wave: 1 | 2 | 3 | 4 | 5;
  readonly domainCategory:
    | "spatial-floor-proximity"
    | "ai-memory-presence"
    | "pairing-xr-cockpit"
    | "stage-sprint-holo"
    | "warroom-async-canvas"
    | "pip-voice-calendar-standup";
  readonly signatureFeatureKo: string;
  readonly internalizedModule: string;
}

export const HOLISTIC_40_VIRTUAL_OFFICE_PLATFORMS: readonly HolisticPlatformCatalogItem[] = [
  { index: 1, id: "gather", name: "Gather 2.0", wave: 1, domainCategory: "spatial-floor-proximity", signatureFeatureKo: "근접 음성 감쇠·Quiet 모드·상태 만료·미니맵 레이더", internalizedModule: "SpaceDock / SpaceMinimap / spatial-floors-model" },
  { index: 2, id: "workadventure", name: "WorkAdventure", wave: 1, domainCategory: "spatial-floor-proximity", signatureFeatureKo: "TMJ 타일맵 Zone 트리거·동행 펫(Companion)·버블 사운드", internalizedModule: "SpaceStatusMenu / SpaceSelfCard / spatial-floors-model" },
  { index: 3, id: "zep", name: "ZEP", wave: 1, domainCategory: "spatial-floor-proximity", signatureFeatureKo: "스포트라이트 방송·미니게임 앱·다인원 컨퍼런스 홀", internalizedModule: "StudioVirtualSpaceTownProgramPanel" },
  { index: 4, id: "ovice", name: "oVice", wave: 1, domainCategory: "spatial-floor-proximity", signatureFeatureKo: "지향성 음성 원뿔(Voice Cone)·메가폰·어깨 톡톡·긴급도 배지", internalizedModule: "SpaceStatusMenu / spatial-floors-model" },
  { index: 5, id: "topia", name: "Topia", wave: 1, domainCategory: "spatial-floor-proximity", signatureFeatureKo: "월드 포털 링크·공간 미디어 동기화·보물찾기 퀘스트", internalizedModule: "StudioVirtualSpaceTownProgramPanel" },
  { index: 6, id: "kumospace", name: "Kumospace", wave: 1, domainCategory: "spatial-floor-proximity", signatureFeatureKo: "다층 엘리베이터(1F~5F)·룸 프리셋·친환경 오디오 범위", internalizedModule: "spatial-floors-model / SpatialCanvasHud" },
  { index: 7, id: "sowork", name: "SoWork", wave: 1, domainCategory: "ai-memory-presence", signatureFeatureKo: "AI 미팅 요약 봇·타임코드 액션아이템·공간 메모리 볼트", internalizedModule: "ai-agents-memory-model" },
  { index: 8, id: "roam", name: "Roam", wave: 1, domainCategory: "ai-memory-presence", signatureFeatureKo: "노크 후 입장(Knock-to-Enter)·Aikido 비동기 데스크 노트·Stage", internalizedModule: "spatial-floors-model / ai-agents-memory-model" },
  { index: 9, id: "spatialchat", name: "SpatialChat", wave: 1, domainCategory: "spatial-floor-proximity", signatureFeatureKo: "카메라 버블 클러스터·멀티 핀 화면공유·브레이크아웃 룸", internalizedModule: "spatial-floors-model / SpatialCanvasHud" },
  { index: 10, id: "teamflow", name: "Teamflow", wave: 1, domainCategory: "spatial-floor-proximity", signatureFeatureKo: "공간 플로팅 앱 독(테트리스·화이트보드·작업표)·포켓 룸", internalizedModule: "StudioVirtualSpaceAppHost" },
  { index: 11, id: "tandem", name: "Tandem", wave: 1, domainCategory: "ai-memory-presence", signatureFeatureKo: "실행 중인 창작 앱(CSP·블렌더) True Status 자동 감지·원클릭 톡", internalizedModule: "SpaceStatusMenu / SpaceSelfCard / ai-agents-memory-model" },
  { index: 12, id: "spotvirtual", name: "Spot Virtual", wave: 1, domainCategory: "spatial-floor-proximity", signatureFeatureKo: "3D 보드룸 아바타 포즈·공간 화이트보드·포커스 데스크", internalizedModule: "StudioVirtualSpace3DView" },
  { index: 13, id: "cosmos", name: "Cosmos Video", wave: 1, domainCategory: "ai-memory-presence", signatureFeatureKo: "방해금지 Deep Work 게이트·비동기 음성 DM·작업 툴 상태", internalizedModule: "ai-agents-memory-model" },
  { index: 14, id: "teemyco", name: "Teemyco", wave: 2, domainCategory: "pairing-xr-cockpit", signatureFeatureKo: "아바타 상태 모자(Status Hat)·방 잠금·Kudos 칭찬 카드", internalizedModule: "SpaceStatusMenu / SpaceSelfCard / pairing-xr-floor-model" },
  { index: 15, id: "sococo", name: "Sococo", wave: 2, domainCategory: "pairing-xr-cockpit", signatureFeatureKo: "5색 도어 상태 표시등·전 사원 부서 조감도(Bird's-Eye Radar)", internalizedModule: "pairing-xr-floor-model / SpatialCanvasHud" },
  { index: 16, id: "nooks", name: "Nooks", wave: 2, domainCategory: "pairing-xr-cockpit", signatureFeatureKo: "AI 공동 작화 کال링 플로어·실시간 코칭 위스퍼(Whisper)", internalizedModule: "pairing-xr-floor-model" },
  { index: 17, id: "tuple", name: "Tuple", wave: 2, domainCategory: "pairing-xr-cockpit", signatureFeatureKo: "5K 60fps 초저지연 페어링·듀얼 펜 태블릿 원격 드로잉 제어", internalizedModule: "pairing-xr-floor-model" },
  { index: 18, id: "virbela", name: "Virbela", wave: 2, domainCategory: "pairing-xr-cockpit", signatureFeatureKo: "대형 오디토리움 스테이지·전시 부스·팀 빌딩 캠퍼스", internalizedModule: "pairing-xr-floor-model" },
  { index: 19, id: "framevr", name: "Frame VR", wave: 2, domainCategory: "pairing-xr-cockpit", signatureFeatureKo: "WebXR 브라우저 3D 갤러리·360도 배경 구체·원고 전시", internalizedModule: "pairing-xr-floor-model" },
  { index: 20, id: "arthur", name: "Arthur Digital", wave: 2, domainCategory: "pairing-xr-cockpit", signatureFeatureKo: "Spatial 3D 핀보드·에피소드 컷 카드 공간 클러스터링", internalizedModule: "pairing-xr-floor-model" },
  { index: 21, id: "pop", name: "Pop", wave: 2, domainCategory: "pairing-xr-cockpit", signatureFeatureKo: "멀티 유저 레이저 펜 동시 판서·원클릭 화면 제어권 위임", internalizedModule: "pairing-xr-floor-model" },
  { index: 22, id: "remo", name: "Remo", wave: 3, domainCategory: "stage-sprint-holo", signatureFeatureKo: "6인 원탁 테이블 도면·스테이지 전환 시 테이블 자동 음소거", internalizedModule: "stage-sprint-holo-model" },
  { index: 23, id: "spatial-io", name: "Spatial.io", wave: 3, domainCategory: "stage-sprint-holo", signatureFeatureKo: "WebGL 3D 포털 이동·웹툰 IP 쇼케이스 홀·박수 파티클", internalizedModule: "stage-sprint-holo-model" },
  { index: 24, id: "engage-xr", name: "ENGAGE XR", wave: 3, domainCategory: "stage-sprint-holo", signatureFeatureKo: "공간 타임라인 녹화(Spatial Replay)·홀로그램 작화 강연", internalizedModule: "stage-sprint-holo-model" },
  { index: 25, id: "airmeet", name: "Airmeet", wave: 3, domainCategory: "stage-sprint-holo", signatureFeatureKo: "그린룸 백스테이지 리허설·1:1 스피드 매칭·Q&A 업보트", internalizedModule: "stage-sprint-holo-model" },
  { index: 26, id: "bramble", name: "Bramble", wave: 3, domainCategory: "stage-sprint-holo", signatureFeatureKo: "계절·테마 앰비언트 사운드스케이프·유기적 근접 산책로", internalizedModule: "stage-sprint-holo-model" },
  { index: 27, id: "focusmate", name: "Focusmate", wave: 3, domainCategory: "stage-sprint-holo", signatureFeatureKo: "25/50/75분 1:1 마감 버디 매칭·목표 선언·무소음 카메라 스프린트", internalizedModule: "stage-sprint-holo-model" },
  { index: 28, id: "flow-club", name: "Flow Club", wave: 3, domainCategory: "stage-sprint-holo", signatureFeatureKo: "호스트 진행 다인원 작화 스프린트·Check-in/Celebrate 루프", internalizedModule: "stage-sprint-holo-model" },
  { index: 29, id: "welo", name: "Welo", wave: 4, domainCategory: "warroom-async-canvas", signatureFeatureKo: "Neighborhood 부서 존·외부인 Auto-Lock·앰비언트 헬스 인디케이터", internalizedModule: "warroom-async-stage-model / SpatialCanvasHud" },
  { index: 30, id: "claap", name: "Claap", wave: 4, domainCategory: "warroom-async-canvas", signatureFeatureKo: "비동기 비디오 클립·원고 (x,y) 핀 타임코드 코멘트·투표 결정", internalizedModule: "warroom-async-stage-model" },
  { index: 31, id: "miro", name: "Miro", wave: 4, domainCategory: "warroom-async-canvas", signatureFeatureKo: "무한 스토리보드 캔버스·Bring-Everyone-to-Me·타이머·닷보팅", internalizedModule: "warroom-async-stage-model" },
  { index: 32, id: "figjam", name: "FigJam", wave: 4, domainCategory: "warroom-async-canvas", signatureFeatureKo: "실시간 커서 챗(Cursor Chat)·스탬프 휠·와시 테이프 스티커", internalizedModule: "warroom-async-stage-model" },
  { index: 33, id: "discord-stage", name: "Discord Stage & Go-Live", wave: 4, domainCategory: "warroom-async-canvas", signatureFeatureKo: "1080p 60fps 작화 Go-Live·Request-to-Speak·사운드보드", internalizedModule: "warroom-async-stage-model" },
  { index: 34, id: "kosy-office", name: "Kosy Office", wave: 4, domainCategory: "warroom-async-canvas", signatureFeatureKo: "테이블 내 문서·화이트보드 멀티 앱 도킹·커피 루렛", internalizedModule: "warroom-async-stage-model" },
  { index: 35, id: "slack-huddles", name: "Slack Huddles & Canvas", wave: 4, domainCategory: "warroom-async-canvas", signatureFeatureKo: "초경량 음성 허들·스레드 노크·회차 런북 Canvas 자동 링크", internalizedModule: "warroom-async-stage-model" },
  { index: 36, id: "whereby", name: "Whereby", wave: 5, domainCategory: "pip-voice-calendar-standup", signatureFeatureKo: "클립스튜디오 위 플로팅 PiP 카메라 버블·외부 편집자 게스트 룸", internalizedModule: "SpaceStatusMenu / holistic-master-model" },
  { index: 37, id: "pumble", name: "Pumble", wave: 5, domainCategory: "pip-voice-calendar-standup", signatureFeatureKo: "회차·공정 영구 채널 및 일일 자동 스탠드업 다이제스트 봇", internalizedModule: "holistic-master-model" },
  { index: 38, id: "krisp", name: "Krisp AI", wave: 5, domainCategory: "pip-voice-calendar-standup", signatureFeatureKo: "펜 태블릿·키보드 소음 제거(BVC) 및 한·영·일·중 실시간 자막 번역", internalizedModule: "SpaceStatusMenu / holistic-master-model" },
  { index: 39, id: "airtime-mmhmm", name: "Airtime (mmhmm)", wave: 5, domainCategory: "pip-voice-calendar-standup", signatureFeatureKo: "작가 실루엣 오버더숄더(Over-the-Shoulder) 콘티 브리핑 스테이지", internalizedModule: "holistic-master-model" },
  { index: 40, id: "calcom", name: "Cal.com", wave: 5, domainCategory: "pip-voice-calendar-standup", signatureFeatureKo: "연재·회의 캘린더 연동 아바타 상태 자동 전환 및 T-5분 룸 잠금 해제", internalizedModule: "holistic-master-model" },
] as const;

export type IllustratedCharacterDirection = "down" | "left" | "right" | "up";
export type IllustratedCharacterPose = "idle" | "drawing";

export interface IllustratedDecorPropItem {
  readonly id: string;
  readonly decorType: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly zoneKo: string;
  readonly reaInspiration: string;
  readonly assetUrl: string;
}

export interface IllustratedCharacterFrameItem {
  readonly id: string;
  readonly direction: IllustratedCharacterDirection;
  readonly pose: IllustratedCharacterPose;
  readonly labelKo: string;
  readonly assetUrl: string;
  readonly mirroredForDirectionConsistency: boolean;
}

export interface IllustratedStudioArtPackState {
  readonly packId: "studio-art-v10";
  readonly panoramaAssetUrl: string;
  readonly decorAtlasAssetUrl: string;
  readonly characterCleanAtlasUrl: string;
  readonly characterReferenceSheetUrl: string;
  readonly activeCharacterDirection: IllustratedCharacterDirection;
  readonly activeCharacterPose: IllustratedCharacterPose;
  readonly equippedDecorPropIds: readonly string[];
  readonly props: readonly IllustratedDecorPropItem[];
  readonly characterFrames: readonly IllustratedCharacterFrameItem[];
}

export const ILLUSTRATED_V10_DECOR_PROPS: readonly IllustratedDecorPropItem[] = [
  {
    id: "cintiq-drawing-desk",
    decorType: "drawing-desk",
    labelKo: "와콤 신티크 듀얼 작화 데스크",
    labelEn: "Wacom Cintiq Dual Drawing Desk",
    zoneKo: "2F 집중 작화 포드",
    reaInspiration: "Tandem · Gather · Teemyco",
    assetUrl: "/assets/virtual-studio/studio-art-v10/props/cintiq-drawing-desk.webp",
  },
  {
    id: "hologram-pedestal",
    decorType: "portal",
    labelKo: "3D 캐릭터 홀로그램 페데스탈",
    labelEn: "3D Character Hologram Pedestal",
    zoneKo: "2F 3D 레퍼런스 검수 홀",
    reaInspiration: "Spatial · FrameVR · Arthur VR",
    assetUrl: "/assets/virtual-studio/studio-art-v10/props/hologram-pedestal.webp",
  },
  {
    id: "lofi-bookshelf-lounge",
    decorType: "bookshelf",
    labelKo: "로파이 북셸프 & 캣 독서 코너",
    labelEn: "Lo-Fi Bookshelf & Cat Reading Nook",
    zoneKo: "1F 스토리 라이브러리",
    reaInspiration: "SoWork · Kumospace · Cozy Cafe",
    assetUrl: "/assets/virtual-studio/studio-art-v10/props/lofi-bookshelf-lounge.webp",
  },
  {
    id: "on-air-critique-booth",
    decorType: "review-board",
    labelKo: "ON AIR 방음 라이브 합평 부스",
    labelEn: "ON AIR Soundproof Critique Booth",
    zoneKo: "1F 타운홀 · 라이브 부스",
    reaInspiration: "Roam · Airtime · Krisp BVC",
    assetUrl: "/assets/virtual-studio/studio-art-v10/props/on-air-critique-booth.webp",
  },
  {
    id: "biophilic-planter-set",
    decorType: "tree",
    labelKo: "바이오필릭 플랜테리어 컬렉션",
    labelEn: "Biophilic Studio Planter Collection",
    zoneKo: "3F 바이오필릭 웰니스 테라스",
    reaInspiration: "Breakroom · Virbela · Topia",
    assetUrl: "/assets/virtual-studio/studio-art-v10/props/biophilic-planter-set.webp",
  },
] as const;

export const ILLUSTRATED_V10_CHARACTER_FRAMES: readonly IllustratedCharacterFrameItem[] = [
  { id: "idle-down", direction: "down", pose: "idle", labelKo: "정면 대기 (Front Idle)", assetUrl: "/assets/virtual-studio/studio-art-v10/frames/idle-down.webp", mirroredForDirectionConsistency: false },
  { id: "idle-left", direction: "left", pose: "idle", labelKo: "좌측 대기 (Left Idle · 방향 보정)", assetUrl: "/assets/virtual-studio/studio-art-v10/frames/idle-left.webp", mirroredForDirectionConsistency: true },
  { id: "idle-right", direction: "right", pose: "idle", labelKo: "우측 대기 (Right Idle)", assetUrl: "/assets/virtual-studio/studio-art-v10/frames/idle-right.webp", mirroredForDirectionConsistency: false },
  { id: "idle-up", direction: "up", pose: "idle", labelKo: "후면 대기 (Back Idle)", assetUrl: "/assets/virtual-studio/studio-art-v10/frames/idle-up.webp", mirroredForDirectionConsistency: false },
  { id: "drawing-down", direction: "down", pose: "drawing", labelKo: "정면 태블릿 작화 (Front Drawing)", assetUrl: "/assets/virtual-studio/studio-art-v10/frames/drawing-down.webp", mirroredForDirectionConsistency: false },
  { id: "drawing-left", direction: "left", pose: "drawing", labelKo: "좌측 태블릿 작화 (Left Drawing)", assetUrl: "/assets/virtual-studio/studio-art-v10/frames/drawing-left.webp", mirroredForDirectionConsistency: false },
  { id: "drawing-right", direction: "right", pose: "drawing", labelKo: "우측 태블릿 작화 (Right Drawing)", assetUrl: "/assets/virtual-studio/studio-art-v10/frames/drawing-right.webp", mirroredForDirectionConsistency: false },
  { id: "drawing-up", direction: "up", pose: "drawing", labelKo: "후면 듀얼모니터 작화 (Back Drawing)", assetUrl: "/assets/virtual-studio/studio-art-v10/frames/drawing-up.webp", mirroredForDirectionConsistency: false },
] as const;

export interface StudioVirtualOfficeHolisticMasterState {
  readonly presentation: FloatingCreatorPresentationState;
  readonly voiceClarity: KrispVoiceClarityTranslationState;
  readonly calendarSync: CalendarAutoPresenceSyncState;
  readonly standupDigest: readonly PumbleStandupDigestEntry[];
  readonly illustratedStudioPack: IllustratedStudioArtPackState;
}

export function createInitialHolisticMasterState(): StudioVirtualOfficeHolisticMasterState {
  return {
    presentation: {
      mode: "over-the-shoulder-tablet",
      alwaysOnTopPip: true,
      acousticEchoDuckingDb: -18,
      hybridGuestRoomLocked: true,
      activeSlideIndex: 0,
      slides: [
        {
          slideId: "slide-ep43-cut01",
          cutRangeLabel: "EP.43 · C01~C12",
          titleKo: "오프닝 추격전 앵글 및 속도선 밀도 가이드",
          directorNoteKo: "1컷 하이앵글 전경 3D 스냅툰 배경 안개 레이어 35% 유지",
        },
        {
          slideId: "slide-ep43-cut13",
          cutRangeLabel: "EP.43 · C13~C28",
          titleKo: "주인공 각성 이펙트 발광 레이어(Color Dodge) 규격",
          directorNoteKo: "선화 레이어 위 보라색 서브 라이트 OKLCH 토큰 기준 통일",
        },
        {
          slideId: "slide-ep43-cut29",
          cutRangeLabel: "EP.43 · C29~C45",
          titleKo: "클리프행어 엔딩 식자(타이포) 및 여백 연출",
          directorNoteKo: "모바일 스크롤 체류 시간 2.5초 확보를 위한 하단 그라데이션 여백",
        },
      ],
    },
    voiceClarity: {
      bvcNoiseCancellationEnabled: true,
      stylusAndKeyboardFilterEnabled: true,
      accentClarityBoostPct: 92,
      targetTranslationLocale: "ja",
      liveTranscripts: [
        {
          id: "tr-1",
          speakerName: "김민서 총괄PD",
          sourceLocale: "ko",
          targetLocale: "ja",
          originalText: "14컷 역광 레이어는 일본판 연재본에서도 식자 위치와 겹치지 않게 조정해 주세요.",
          translatedText: "[JA 번역] 14コマ目の逆光レイヤーは、日本版連載でも写植位置と重ならないよう調整してください。",
          suppressedNoiseTypes: ["펜 태블릿 탭 소음 제거", "기계식 키보드 타건음 제거"],
        },
        {
          id: "tr-2",
          speakerName: "박하준 선화작가",
          sourceLocale: "ko",
          targetLocale: "ja",
          originalText: "네, 클립스튜디오 EX 벡터 레이어로 분리해서 오늘 17시 전에 공유하겠습니다.",
          translatedText: "[JA 번역] はい、CLIP STUDIO EXのベクターレイヤーに分離して本日17時前に共有します。",
          suppressedNoiseTypes: ["배경 대화 음성(BVC) 차단"],
        },
      ],
    },
    calendarSync: {
      calendarSyncEnabled: true,
      currentMinuteOfDay: 14 * 60, // 14:00
      activeSyncedStatus: "focused",
      activeSyncedHat: "🧢 집중 캡",
      scheduledBlocks: [
        {
          bookingId: "cal-morning-standup",
          titleKo: "EP.43 데일리 작화 스탠드업 & 블로커 점검",
          startMinuteOfDay: 10 * 60, // 10:00
          endMinuteOfDay: 10 * 60 + 30, // 10:30
          autoMappedStatus: "in-meeting",
          autoMappedHat: "🎙️ 녹화·더빙 중",
          targetRoomId: "room-main-stage",
          roomUnlocked: false,
        },
        {
          bookingId: "cal-deep-drawing",
          titleKo: "EP.43 킬링파트 선화·밑색 딥포커스 스프린트",
          startMinuteOfDay: 13 * 60 + 30, // 13:30
          endMinuteOfDay: 16 * 60, // 16:00
          autoMappedStatus: "focused",
          autoMappedHat: "🧢 집중 캡",
          targetRoomId: "room-quiet-pod-2f",
          roomUnlocked: true,
        },
        {
          bookingId: "cal-editorial-critique",
          titleKo: "글로벌 연재처(한·미·일) 동시 검수 피드백 세션",
          startMinuteOfDay: 16 * 60 + 30, // 16:30
          endMinuteOfDay: 17 * 60 + 30, // 17:30
          autoMappedStatus: "reviewing",
          autoMappedHat: "👑 페어 작화",
          targetRoomId: "room-review-warroom",
          roomUnlocked: false,
        },
      ],
    },
    standupDigest: [
      {
        creatorId: "cr-lead",
        creatorName: "박하준 (메인 선화)",
        roleKo: "캐릭터 펜선·표정 연출",
        completedCutsKo: "EP.43 C01~C18 펜선 완료",
        inProgressCutsKo: "EP.43 C19~C32 액션신 선화",
        blockerKo: null,
        submittedAtLabel: "09:52 KST",
      },
      {
        creatorId: "cr-bg",
        creatorName: "최윤아 (3D 배경)",
        roleKo: "스케치업·블렌더 후보정",
        completedCutsKo: "황궁 연회장 3D 라이팅 프리셋 4종 배포",
        inProgressCutsKo: "C22 복도 추격전 카메라 화각 매칭",
        blockerKo: "C25 창문 스테인드글라스 텍스처 에셋 공동 사용권 시트 1개 추가 필요",
        submittedAtLabel: "09:55 KST",
      },
      {
        creatorId: "cr-color",
        creatorName: "정다은 (채색·식자)",
        roleKo: "밑색·명암·후보정",
        completedCutsKo: "EP.42 최종 납품본 60컷 컬러 프로파일 검수 완료",
        inProgressCutsKo: "EP.43 C01~C15 밑색 지정",
        blockerKo: null,
        submittedAtLabel: "09:58 KST",
      },
    ],
    illustratedStudioPack: {
      packId: "studio-art-v10",
      panoramaAssetUrl:
        "/assets/virtual-studio/studio-art-v10/studio-theme-floor-panorama.webp",
      decorAtlasAssetUrl:
        "/assets/virtual-studio/studio-art-v10/studio-theme-decor-atlas.webp",
      characterCleanAtlasUrl:
        "/assets/virtual-studio/studio-art-v10/creator-character-clean-atlas.webp",
      characterReferenceSheetUrl:
        "/assets/virtual-studio/studio-art-v10/creator-character-spritesheet.webp",
      activeCharacterDirection: "down",
      activeCharacterPose: "drawing",
      equippedDecorPropIds: [
        "cintiq-drawing-desk",
        "hologram-pedestal",
        "on-air-critique-booth",
      ],
      props: ILLUSTRATED_V10_DECOR_PROPS,
      characterFrames: ILLUSTRATED_V10_CHARACTER_FRAMES,
    },
  };
}

export function setCreatorPresentationMode(
  state: StudioVirtualOfficeHolisticMasterState,
  mode: CreatorPresentationOverlayMode,
): StudioVirtualOfficeHolisticMasterState {
  return {
    ...state,
    presentation: {
      ...state.presentation,
      mode,
    },
  };
}

export function toggleFloatingPipAlwaysOnTop(
  state: StudioVirtualOfficeHolisticMasterState,
): StudioVirtualOfficeHolisticMasterState {
  return {
    ...state,
    presentation: {
      ...state.presentation,
      alwaysOnTopPip: !state.presentation.alwaysOnTopPip,
    },
  };
}

export function advancePresentationSlideDeck(
  state: StudioVirtualOfficeHolisticMasterState,
  direction: "next" | "prev",
): StudioVirtualOfficeHolisticMasterState {
  const total = state.presentation.slides.length;
  if (total === 0) return state;
  const delta = direction === "next" ? 1 : -1;
  const nextIndex = (state.presentation.activeSlideIndex + delta + total) % total;
  return {
    ...state,
    presentation: {
      ...state.presentation,
      activeSlideIndex: nextIndex,
    },
  };
}

const LOCALE_PREFIX_MAP: Readonly<Record<TranslationLocaleCode, string>> = {
  ko: "[KO 원문]",
  en: "[EN Translation]",
  ja: "[JA 번역]",
  zh: "[ZH 翻译]",
};

export function setKrispTranslationLocale(
  state: StudioVirtualOfficeHolisticMasterState,
  targetLocale: TranslationLocaleCode,
): StudioVirtualOfficeHolisticMasterState {
  const prefix = LOCALE_PREFIX_MAP[targetLocale];
  return {
    ...state,
    voiceClarity: {
      ...state.voiceClarity,
      targetTranslationLocale: targetLocale,
      liveTranscripts: state.voiceClarity.liveTranscripts.map((item) => ({
        ...item,
        targetLocale,
        translatedText: `${prefix} ${item.originalText}`,
      })),
    },
  };
}

export function toggleKrispBvcNoiseCancellation(
  state: StudioVirtualOfficeHolisticMasterState,
): StudioVirtualOfficeHolisticMasterState {
  return {
    ...state,
    voiceClarity: {
      ...state.voiceClarity,
      bvcNoiseCancellationEnabled: !state.voiceClarity.bvcNoiseCancellationEnabled,
    },
  };
}

/**
 * Cal.com style Calendar-Driven Auto-Presence Sync:
 * Evaluates scheduled blocks at `minuteOfDay`. Unlocks any room whose block starts within 5 minutes
 * (`startMinuteOfDay - 5 <= minuteOfDay <= endMinuteOfDay`) and updates activeSyncedStatus + activeSyncedHat.
 */
export function evaluateCalendarAutoPresenceAtMinute(
  state: StudioVirtualOfficeHolisticMasterState,
  minuteOfDay: number,
): StudioVirtualOfficeHolisticMasterState {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(minuteOfDay)));
  let matchedStatus: CalendarAutoPresenceSyncState["activeSyncedStatus"] = "available";
  let matchedHat = "👒 질문 환영";

  const updatedBlocks = state.calendarSync.scheduledBlocks.map((block) => {
    const withinPreUnlockWindow =
      clamped >= block.startMinuteOfDay - 5 && clamped <= block.endMinuteOfDay;
    const withinActiveWindow =
      clamped >= block.startMinuteOfDay && clamped <= block.endMinuteOfDay;
    if (withinActiveWindow) {
      matchedStatus = block.autoMappedStatus;
      matchedHat = block.autoMappedHat;
    }
    return {
      ...block,
      roomUnlocked: withinPreUnlockWindow,
    };
  });

  return {
    ...state,
    calendarSync: {
      ...state.calendarSync,
      currentMinuteOfDay: clamped,
      activeSyncedStatus: matchedStatus,
      activeSyncedHat: matchedHat,
      scheduledBlocks: updatedBlocks,
    },
  };
}

export function filterHolistic40Platforms(
  query: string,
  waveFilter: "all" | 1 | 2 | 3 | 4 | 5 = "all",
): readonly HolisticPlatformCatalogItem[] {
  const normalized = query.trim().toLowerCase();
  return HOLISTIC_40_VIRTUAL_OFFICE_PLATFORMS.filter((item) => {
    if (waveFilter !== "all" && item.wave !== waveFilter) return false;
    if (!normalized) return true;
    return (
      item.name.toLowerCase().includes(normalized) ||
      item.id.toLowerCase().includes(normalized) ||
      item.signatureFeatureKo.toLowerCase().includes(normalized) ||
      item.internalizedModule.toLowerCase().includes(normalized)
    );
  });
}

export function selectIllustratedCharacterFrame(
  state: StudioVirtualOfficeHolisticMasterState,
  direction: IllustratedCharacterDirection,
  pose: IllustratedCharacterPose,
): StudioVirtualOfficeHolisticMasterState {
  return {
    ...state,
    illustratedStudioPack: {
      ...state.illustratedStudioPack,
      activeCharacterDirection: direction,
      activeCharacterPose: pose,
    },
  };
}

export function toggleIllustratedDecorPropPlacement(
  state: StudioVirtualOfficeHolisticMasterState,
  propId: string,
): StudioVirtualOfficeHolisticMasterState {
  const current = state.illustratedStudioPack.equippedDecorPropIds;
  const exists = current.includes(propId);
  const nextIds = exists
    ? current.filter((id) => id !== propId)
    : [...current, propId];
  return {
    ...state,
    illustratedStudioPack: {
      ...state.illustratedStudioPack,
      equippedDecorPropIds: nextIds,
    },
  };
}

export function getActiveIllustratedCharacterFrame(
  state: StudioVirtualOfficeHolisticMasterState,
): IllustratedCharacterFrameItem {
  const { activeCharacterDirection, activeCharacterPose, characterFrames } =
    state.illustratedStudioPack;
  return (
    characterFrames.find(
      (f) =>
        f.direction === activeCharacterDirection &&
        f.pose === activeCharacterPose,
    ) ?? characterFrames[0]!
  );
}
