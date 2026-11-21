import "./global-plaza-physics.css";

import {
  BellOff,
  Compass,
  FileSignature,
  Globe2,
  Radio,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useId, useMemo, useState } from "react";

import {
  buildCrowdSpatialHash,
  createDivisionOsCutSliceHandoff,
  createGlobalPlazaCrowd,
  createInitialOutsourcingQuests,
  filterPlazaFreelancers,
  negotiateFreelancerRate,
  publishOutsourcingQuest,
  queryVisibleCrowdWithLod,
  summarizeHybridCrowdPresence,
  type DivisionOsCutSliceHandoffPayload,
  type GlobalRegionTimezoneId,
  type HybridCrowdFilterMode,
  type OutsourcingQuestPost,
  type PlazaCurrencyCode,
  type PlazaFreelancerAvatar,
  type PlazaGuildZoneId,
  type RateNegotiationResult,
} from "./mmorpg-global-outsourcing-plaza";
import {
  createInitialGlobalPlazaChatMessages,
  createInitialVoiceSession,
  createTranslatedChatMessage,
  setTypingStatus,
  setVoicePresenceMode,
  syncVoiceChannelWithRoom,
  toggleHandRaise,
  toggleScreenShare,
  toggleVoiceMute,
  type PlazaChatMessage,
  type PlazaLanguageCode,
  type PlazaPresenceMode,
  type VoiceSessionState,
} from "./realtime-meeting-voice-chat-engine";
import { StudioGlobalPlazaMapStage } from "./StudioGlobalPlazaMapStage";
import {
  GlobalFreelancerDirectoryView,
  OutsourcingQuestHandoffView,
} from "./StudioGlobalPlazaRecruitViews";
import { StudioGlobalPlazaVoiceChatDock } from "./StudioGlobalPlazaVoiceChatDock";
import {
  ACOUSTIC_ROOMS,
  STUDIO_WORLD_HEIGHT,
  STUDIO_WORLD_WIDTH,
  createDefaultStudioPhysicsWorld,
  findNearestInteractable,
  interactWithStudioObject,
  setPhysicsTargetPoint,
  stepStudioPhysicsWorld,
  type AcousticRoomId,
  type StudioPhysicsWorldState,
  type Vec2,
} from "./vspace-physics-interactions-engine";

export type PlazaWorkspaceTabId = "map-physics" | "global-directory" | "quest-handoff";

export interface StudioGlobalMmorpgPlazaPanelProps {
  readonly entryContext?: "virtual-space" | "production-hub";
  readonly projectId?: string;
  readonly episodeId?: string;
  readonly className?: string;
}

const FIXED_BASE_ISO = "2026-11-21T15:00:00.000Z";
const DEFAULT_CROWD_COUNT = 60;

export function StudioGlobalMmorpgPlazaPanel({
  entryContext = "virtual-space",
  projectId = "sample-project",
  episodeId = "episode-12",
  className,
}: StudioGlobalMmorpgPlazaPanelProps) {
  const tabBaseId = useId();
  const [activeTab, setActiveTab] = useState<PlazaWorkspaceTabId>("map-physics");
  const [presenceMode, setPresenceMode] = useState<PlazaPresenceMode>("plaza-open");

  // 1. 가상 스튜디오 물리 & 10종 오브젝트 & 4개 음향 회의실 상태
  const [world, setWorld] = useState<StudioPhysicsWorldState>(() =>
    createDefaultStudioPhysicsWorld(),
  );

  // 2. 실시간 회의실/근접 음성 & 6개국어 자동 번역 채팅 상태
  const [voice, setVoice] = useState<VoiceSessionState>(() =>
    createInitialVoiceSession(createDefaultStudioPhysicsWorld(), "plaza-open"),
  );
  const [messages, setMessages] = useState<readonly PlazaChatMessage[]>(() =>
    createInitialGlobalPlazaChatMessages(),
  );
  const [viewerLang, setViewerLang] = useState<PlazaLanguageCode>("ko");
  const [composerLang, setComposerLang] = useState<PlazaLanguageCode>("ko");

  // 3. 60명+ 대규모 글로벌 외주 광장 군중 & 필터 & 퀘스트 상태
  const allCrowd = useMemo(() => createGlobalPlazaCrowd(DEFAULT_CROWD_COUNT), []);
  const crowdSummary = useMemo(() => summarizeHybridCrowdPresence(allCrowd), [allCrowd]);
  const [guildZoneFilter, setGuildZoneFilter] = useState<PlazaGuildZoneId | "all">("all");
  const [timezoneFilter, setTimezoneFilter] = useState<GlobalRegionTimezoneId | "all">("all");
  const [languageFilter, setLanguageFilter] = useState<PlazaLanguageCode | "all">("all");
  const [presenceFilter, setPresenceFilter] = useState<HybridCrowdFilterMode>("hybrid-all");
  const [onlyImmediate, setOnlyImmediate] = useState(false);
  const [maxRateKrw, setMaxRateKrw] = useState(26000);
  const [searchQuery, setSearchQuery] = useState("");
  const [targetCurrency, setTargetCurrency] = useState<PlazaCurrencyCode>("VND");
  const [calcCutCount, setCalcCutCount] = useState(20);

  const [selectedFreelancerId, setSelectedFreelancerId] = useState<string>(
    allCrowd[0]?.id ?? "plaza-freelancer-001",
  );
  const [quests, setQuests] = useState<readonly OutsourcingQuestPost[]>(() =>
    createInitialOutsourcingQuests(),
  );
  const [negotiationResult, setNegotiationResult] = useState<RateNegotiationResult | null>(null);
  const [handoffPayload, setHandoffPayload] =
    useState<DivisionOsCutSliceHandoffPayload | null>(null);

  const filteredFreelancers = useMemo(
    () =>
      filterPlazaFreelancers(allCrowd, {
        guildZoneId: guildZoneFilter,
        timezoneId: timezoneFilter,
        language: languageFilter,
        presenceMode: presenceFilter,
        onlyImmediate,
        maxRateKrw,
        searchQuery,
      }),
    [
      allCrowd,
      guildZoneFilter,
      timezoneFilter,
      languageFilter,
      presenceFilter,
      onlyImmediate,
      maxRateKrw,
      searchQuery,
    ],
  );

  const spatialGrid = useMemo(
    () => buildCrowdSpatialHash(filteredFreelancers, 120),
    [filteredFreelancers],
  );

  const visibleCrowd = useMemo(
    () =>
      queryVisibleCrowdWithLod(
        spatialGrid,
        { minX: 0, minY: 0, maxX: STUDIO_WORLD_WIDTH, maxY: STUDIO_WORLD_HEIGHT },
        world.player,
      ),
    [spatialGrid, world.player],
  );

  const nearestObject = useMemo(() => findNearestInteractable(world, 28), [world]);

  const selectedFreelancer = useMemo(
    () => allCrowd.find((item) => item.id === selectedFreelancerId) ?? allCrowd[0]!,
    [allCrowd, selectedFreelancerId],
  );

  const commitWorldAndVoice = (nextWorld: StudioPhysicsWorldState) => {
    setWorld(nextWorld);
    setVoice((prev) => syncVoiceChannelWithRoom(prev, nextWorld, nextWorld.player));
  };

  const handleTogglePresenceMode = () => {
    const nextMode: PlazaPresenceMode =
      presenceMode === "plaza-open" ? "focus-dnd" : "plaza-open";
    setPresenceMode(nextMode);
    setVoice((prev) => setVoicePresenceMode(prev, world, nextMode));
  };

  const handleClickFloor = (point: Vec2) => {
    let next = setPhysicsTargetPoint(world, point);
    for (let i = 0; i < 6; i += 1) {
      next = stepStudioPhysicsWorld(next, { dtSec: 0.04, subSteps: 2 });
    }
    commitWorldAndVoice(next);
  };

  const handleStepDirection = (dx: number, dy: number) => {
    let next = world;
    for (let i = 0; i < 4; i += 1) {
      next = stepStudioPhysicsWorld(next, { moveX: dx, moveY: dy, dtSec: 0.04, subSteps: 2 });
    }
    commitWorldAndVoice(next);
  };

  const handleEnterRoom = (roomId: AcousticRoomId) => {
    const room = ACOUSTIC_ROOMS.find((r) => r.id === roomId);
    if (!room) return;
    const targetX = Math.round((room.bounds.minX + room.bounds.maxX) / 2);
    const targetY =
      roomId === "open-lounge" ? 296 : Math.round((room.bounds.minY + room.bounds.maxY) / 2 + 42);
    const teleported: StudioPhysicsWorldState = {
      ...world,
      player: { ...world.player, x: targetX, y: targetY, vx: 0, vy: 0 },
      targetPoint: null,
      seatedObjectId: null,
      activeRoomId: roomId,
      lastInteractionLog: `${room.nameKo}에 입장했습니다. 음성 채널이 자동 동기화되었습니다.`,
    };
    commitWorldAndVoice(teleported);
  };

  const handleInteractObject = (objectId: string) => {
    const outcome = interactWithStudioObject(world, objectId);
    let nextWorld = outcome.world;
    if (outcome.sideEffect === "projectile-launched") {
      nextWorld = stepStudioPhysicsWorld(nextWorld, { dtSec: 0.04, subSteps: 2 });
    }
    commitWorldAndVoice(nextWorld);
    if (outcome.sideEffect === "open-quest-board") {
      setActiveTab("quest-handoff");
    }
  };

  const handleSendMessage = (text: string) => {
    const msg = createTranslatedChatMessage({
      id: `msg-user-${messages.length + 1}`,
      channelId: voice.activeChannelId,
      roomId: world.activeRoomId,
      senderId: "player-self",
      senderName: "나 (스튜디오 PD)",
      senderLang: composerLang,
      text,
      createdAtIso: FIXED_BASE_ISO,
    });
    setMessages((prev) => [...prev, msg]);
  };

  const handleWalkAndNegotiate = (freelancer: PlazaFreelancerAvatar) => {
    setSelectedFreelancerId(freelancer.id);
    setNegotiationResult(null);
    let next = setPhysicsTargetPoint(world, { x: freelancer.x, y: freelancer.y });
    for (let i = 0; i < 6; i += 1) {
      next = stepStudioPhysicsWorld(next, { dtSec: 0.04, subSteps: 2 });
    }
    commitWorldAndVoice({
      ...next,
      lastInteractionLog: `${freelancer.displayName} (${freelancer.countryNameKo})에게 이동해 1:1 단가 협의를 열었습니다.`,
    });
    setActiveTab("quest-handoff");
  };

  const handleNegotiate = (proposedRateKrw: number, cutCount: number) => {
    const result = negotiateFreelancerRate(selectedFreelancer, proposedRateKrw, cutCount);
    setNegotiationResult(result);
    const chatMsg = createTranslatedChatMessage({
      id: `msg-neg-${messages.length + 1}`,
      channelId: voice.activeChannelId,
      roomId: world.activeRoomId,
      senderId: "player-self",
      senderName: `나 → ${selectedFreelancer.displayName}`,
      senderLang: "ko",
      text: `단가 협의 · 단계별 에스크로 정산 (${cutCount}컷)`,
      createdAtIso: FIXED_BASE_ISO,
      messageKind: "negotiation",
    });
    setMessages((prev) => [...prev, chatMsg]);
  };

  const handlePublishQuest = (input: {
    readonly titleKo: string;
    readonly guildZoneId: PlazaGuildZoneId;
    readonly cutRangeStart: number;
    readonly cutRangeEnd: number;
    readonly budgetPerCutKrw: number;
    readonly targetCurrency: PlazaCurrencyCode;
  }) => {
    const created = publishOutsourcingQuest({
      ...input,
      roleKey: selectedFreelancer.roleKey,
      episodeId,
      targetLanguages: ["ko", "en", selectedFreelancer.primaryLang],
      existingCount: quests.length,
      nowIso: FIXED_BASE_ISO,
    });
    setQuests((prev) => [created, ...prev]);
  };

  const handleHandoffQuest = (quest: OutsourcingQuestPost) => {
    const payload = createDivisionOsCutSliceHandoff({
      projectId,
      quest,
      freelancer: selectedFreelancer,
      agreedRatePerCutKrw: negotiationResult?.agreedRatePerCutKrw ?? quest.budgetPerCutKrw,
      nowIso: FIXED_BASE_ISO,
    });
    setHandoffPayload(payload);
    setQuests((prev) =>
      prev.map((q) =>
        q.questId === quest.questId
          ? { ...q, status: "handed-off", matchedFreelancerId: selectedFreelancer.id }
          : q,
      ),
    );
  };

  const isFocusDnd = presenceMode === "focus-dnd";

  return (
    <section
      className={`gpp-shell space-y-4 p-4 sm:p-5 ${className ?? ""}`}
      data-testid="studio-global-mmorpg-plaza-panel"
      data-entry-context={entryContext}
      data-lighting-mood={world.lightingMood}
      data-focus-mode={presenceMode}
      aria-label="글로벌 MMORPG 외주 광장 및 가상 스튜디오 물리·회의실 워크스페이스"
    >
      {/* 최상단 헤더 + 포커스 타임 격리(1클릭 방해 금지) 토글 */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3.5">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-fg">
              글로벌 MMORPG 외주 모집 광장 · 가상 스튜디오 물리/회의실
            </h2>
            <span className="gpp-pill" data-tone="accent">
              {entryContext === "virtual-space" ? "가상 스튜디오 연동" : "제작 허브 독립 진입"}
            </span>
          </div>
          <p className="text-xs text-fg-2">
            물리 충돌·10종 스튜디오 오브젝트·방음 회의실 음성·6개국어 자동번역과 동남아·글로벌 프리랜서 즉시 매칭을 한 화면에서 운용합니다.
          </p>
        </div>

        {/* 1클릭 포커스 타임 격리 스위치 (사용자·코디네이터 #413 최우선 요구) */}
        <button
          type="button"
          className="gpp-btn shrink-0"
          data-variant={isFocusDnd ? "warn" : "good"}
          aria-pressed={isFocusDnd}
          data-testid="gpp-focus-mode-toggle"
          onClick={handleTogglePresenceMode}
        >
          {isFocusDnd ? (
            <>
              <BellOff className="size-4" aria-hidden="true" />
              <span>집중 작업 모드 (방해 금지 활성) → 광장 열기</span>
            </>
          ) : (
            <>
              <Radio className="size-4" aria-hidden="true" />
              <span>광장 오픈 모드 → 집중 작업 모드(방해 금지)</span>
            </>
          )}
        </button>
      </header>

      {/* 콜드스타트 방어(하이브리드 실시간 + 상시 비동기 검증 풀) + 신뢰 가드레일 요약 바 */}
      <div
        className="grid gap-2 rounded-xl border border-line bg-canvas p-3 text-xs sm:grid-cols-3"
        data-testid="gpp-hybrid-coldstart-bar"
      >
        <div className="flex items-center gap-2">
          <Users className="size-4 shrink-0 text-good" aria-hidden="true" />
          <div>
            <p className="gpp-num font-bold text-fg">
              실시간 접속 {crowdSummary.liveOnlineCount}명 + 상시 검증 풀 {crowdSummary.asyncStandbyCount}명
            </p>
            <p className="text-fg-2">심야·초기에도 24시간 비동기 퀘스트 즉시 제안 가능</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Globe2 className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <div>
            <p className="gpp-num font-bold text-fg">
              동남아 파트너 {crowdSummary.seaPartnerCount}명 · 즉시 투입 {crowdSummary.immediateCount}명
            </p>
            <p className="text-fg-2">베트남·태국·인도네시아·필리핀·일본·미국 6개국어 번역</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 shrink-0 text-warn" aria-hidden="true" />
          <div>
            <p className="font-bold text-fg">신뢰·먹튀 방지 4중 가드레일</p>
            <p className="text-fg-2">포트폴리오 검증 · 납기율 · 30/40/30 에스크로 · Zero-Leak</p>
          </div>
        </div>
      </div>

      {/* 워크스페이스 서브 탭 */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="글로벌 외주 광장 작업 모드">
        {(
          [
            ["map-physics", "광장 맵 · 물리/회의실 · 10종 오브젝트", Compass],
            ["global-directory", "동남아·글로벌 프리랜서 · 시차/환율", Globe2],
            ["quest-handoff", "1클릭 외주 퀘스트 · Cut-Slice 인계", FileSignature],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`${tabBaseId}-${id}`}
            aria-selected={activeTab === id}
            data-testid={`gpp-tab-${id}`}
            className="gpp-tab-btn"
            onClick={() => setActiveTab(id)}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* 메인 콘텐츠 영역 */}
      {activeTab === "map-physics" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,1fr)]">
          <StudioGlobalPlazaMapStage
            world={world}
            visibleCrowd={visibleCrowd}
            totalCrowdCount={allCrowd.length}
            selectedGuildZone={guildZoneFilter}
            selectedFreelancerId={selectedFreelancerId}
            nearestObject={nearestObject}
            onSelectGuildZone={setGuildZoneFilter}
            onClickFloor={handleClickFloor}
            onStepDirection={handleStepDirection}
            onEnterRoom={handleEnterRoom}
            onInteractObject={handleInteractObject}
            onSelectFreelancer={handleWalkAndNegotiate}
          />
          <StudioGlobalPlazaVoiceChatDock
            voice={voice}
            messages={messages}
            viewerLang={viewerLang}
            composerLang={composerLang}
            onChangeViewerLang={setViewerLang}
            onChangeComposerLang={setComposerLang}
            onToggleMute={() => setVoice((prev) => toggleVoiceMute(prev))}
            onToggleHandRaise={() => setVoice((prev) => toggleHandRaise(prev))}
            onToggleScreenShare={() => setVoice((prev) => toggleScreenShare(prev))}
            onTypingChange={(isTyping) =>
              setVoice((prev) => setTypingStatus(prev, "나 (PD)", isTyping))
            }
            onSendMessage={handleSendMessage}
          />
        </div>
      ) : null}

      {activeTab === "global-directory" ? (
        <GlobalFreelancerDirectoryView
          freelancers={filteredFreelancers}
          selectedFreelancer={selectedFreelancer}
          guildZoneFilter={guildZoneFilter}
          timezoneFilter={timezoneFilter}
          languageFilter={languageFilter}
          presenceFilter={presenceFilter}
          onlyImmediate={onlyImmediate}
          maxRateKrw={maxRateKrw}
          searchQuery={searchQuery}
          targetCurrency={targetCurrency}
          calcCutCount={calcCutCount}
          onChangeGuildZone={setGuildZoneFilter}
          onChangeTimezone={setTimezoneFilter}
          onChangeLanguage={setLanguageFilter}
          onChangePresenceFilter={setPresenceFilter}
          onChangeOnlyImmediate={setOnlyImmediate}
          onChangeMaxRateKrw={setMaxRateKrw}
          onChangeSearchQuery={setSearchQuery}
          onChangeTargetCurrency={setTargetCurrency}
          onChangeCalcCutCount={setCalcCutCount}
          onWalkAndNegotiate={handleWalkAndNegotiate}
        />
      ) : null}

      {activeTab === "quest-handoff" ? (
        <OutsourcingQuestHandoffView
          episodeId={episodeId}
          selectedFreelancer={selectedFreelancer}
          quests={quests}
          targetCurrency={targetCurrency}
          negotiationResult={negotiationResult}
          handoffPayload={handoffPayload}
          onNegotiate={handleNegotiate}
          onPublishQuest={handlePublishQuest}
          onHandoffQuestToDivisionOs={handleHandoffQuest}
        />
      ) : null}
    </section>
  );
}
