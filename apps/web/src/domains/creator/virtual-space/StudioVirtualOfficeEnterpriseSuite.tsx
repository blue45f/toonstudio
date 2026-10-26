import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { StudioVirtualOfficeHolisticMasterPanel } from "./StudioVirtualOfficeHolisticMasterPanel";
import { StudioVirtualOfficePairingXrPanel } from "./StudioVirtualOfficePairingXrPanel";
import { StudioVirtualOfficeSpatialCanvasHud } from "./StudioVirtualOfficeSpatialCanvasHud";
import { StudioVirtualOfficeStageSprintHoloPanel } from "./StudioVirtualOfficeStageSprintHoloPanel";
import { StudioVirtualOfficeWarroomAsyncStagePanel } from "./StudioVirtualOfficeWarroomAsyncStagePanel";
import {
  acknowledgeAsyncDeskNote, completeAiAgentDeskTask, computeWeeklyOfficePulseInsights,
  createDefaultVirtualOfficeEnterpriseState, dispatchTaskToAiAgentDesk, executeHostModerationCommand,
  executeVirtualOfficeMcpQuery, formatCreatorDccTrueStatusBadge, leaveAsyncDeskNote,
  MAX_SIMULTANEOUS_SCREEN_SHARE_SLOTS, moveScreenShareLaserPointer, pinCanvasReferenceMedia,
  searchVirtualOfficeMeetingMemories, spinVirtualOfficeRoulette, startSimultaneousScreenShareSlot,
  stopSimultaneousScreenShareSlot, toggleMeetingActionItemDone, togglePinCanvasReferenceMediaLock,
  updateCreatorDccTrueStatus, type StudioCreatorDccAppId, type StudioHostModerationCommand,
  type StudioMcpQueryIntent, type StudioVirtualOfficeEnterpriseState,
} from "./studio-virtual-office-ai-agents-memory-model";
import {
  computeDirectionalVoiceConeGain, createDefaultVirtualOfficeBuildingState, filterVisibleFloorChatMessages,
  getRoomPersistentTableSnapshot, moveParticipantToFloor, pinRoomTableApp, postFloorScopedChatMessage,
  requestRoomKnock, resolveRoomKnock, sendShoulderTap, toggleVirtualOfficeRoomLock, unpinRoomTableApp,
  type StudioFloorChatScope, type StudioShoulderTapReasonCategory, type StudioVirtualOfficeBuildingState,
  type StudioVirtualOfficeFloorId,
} from "./studio-virtual-office-spatial-floors-model";

export interface StudioVirtualOfficeEnterpriseSuiteProps {
  readonly className?: string;
}

type EnterpriseSuiteTabId =
  | "spatial-floors-knock-audio"
  | "ai-agents-memory-mcp"
  | "dcc-presence-aikido-multishare"
  | "host-canvas-pulse-matrix"
  | "pairing-xr-floor-coaching"
  | "stage-sprint-holo-lounge"
  | "warroom-async-stage"
  | "holistic-master-command";

const SUITE_TABS: readonly {
  readonly id: EnterpriseSuiteTabId;
  readonly labelKo: string;
  readonly platformsBadge: string;
}[] = [
  { id: "spatial-floors-knock-audio", labelKo: "다층 빌딩 · 노크 · 영구 테이블 · 지향성 음향", platformsBadge: "Kumospace · Roam · oVice · Teamflow" },
  { id: "ai-agents-memory-mcp", labelKo: "AI 에이전트 데스크 · 회의 메모리 · MCP 브리지", platformsBadge: "SoWork · Spot Virtual · Cosmos Replay" },
  { id: "dcc-presence-aikido-multishare", labelKo: "DCC 작업 프레즌스 · 데스크 비동기 노트 · 4화면 동시공유", platformsBadge: "Tandem · Roam Aikido · Cosmos Video" },
  { id: "host-canvas-pulse-matrix", labelKo: "호스트 관제 · 공간 미디어 핀 · 주간 인사이트", platformsBadge: "ZEP · SpatialChat · SoWork Insights" },
  { id: "pairing-xr-floor-coaching", labelKo: "원격페어링 · 상태모자 · 리셉션 · 3D페데스탈", platformsBadge: "Teemyco · Sococo · Tuple · Pop · Nooks · FrameVR · Arthur · Virbela" },
  { id: "stage-sprint-holo-lounge", labelKo: "그린룸 · 품평로테이션 · 3D홀로그램 · 딥스프린트", platformsBadge: "Remo · Spatial.io · ENGAGE XR · Airmeet · Bramble · Focusmate · Flow Club" },
  { id: "warroom-async-stage", labelKo: "워룸투표 · 비동기컷핀 · Go-Live시어터 · 바이오필릭", platformsBadge: "Welo · Claap · Miro · FigJam · Discord · Kosy · Slack" },
  { id: "holistic-master-command", labelKo: "플로팅PiP · AI소음번역 · 캘린더동기화 · 40대총괄", platformsBadge: "Whereby · Pumble · Krisp · Airtime/mmhmm · Cal.com" },
];

export function StudioVirtualOfficeEnterpriseSuite({ className }: StudioVirtualOfficeEnterpriseSuiteProps) {
  const [activeTab, setActiveTab] = useState<EnterpriseSuiteTabId>("spatial-floors-knock-audio");
  const [buildingState, setBuildingState] = useState<StudioVirtualOfficeBuildingState>(() => createDefaultVirtualOfficeBuildingState());
  const [enterpriseState, setEnterpriseState] = useState<StudioVirtualOfficeEnterpriseState>(() => createDefaultVirtualOfficeEnterpriseState());
  const [statusNotice, setStatusNotice] = useState<string>("40개 글로벌·국내 가상 오피스 역공학 기능이 툰스튜디오 제작 워크플로에 활성화되었습니다.");

  const [selectedRoomId, setSelectedRoomId] = useState<string>("room-2f-color-booth");
  const [knockMessageDraft, setKnockMessageDraft] = useState<string>("15화 피날레 배경 톤앤매너 조율차 입장 요청합니다.");
  const [shoulderTapReason, setShoulderTapReason] = useState<StudioShoulderTapReasonCategory>("conte-confirm");
  const [shoulderTapMessage, setShoulderTapMessage] = useState<string>("14화 34컷 역광 레이어 확인 부탁드립니다!");
  const [tableAppTitleDraft, setTableAppTitleDraft] = useState<string>("14화 컷 45~52 배경 컬러 교정 시트");
  const [chatScope, setChatScope] = useState<StudioFloorChatScope>("floor");
  const [chatInputDraft, setChatInputDraft] = useState<string>("");
  const [speakerHeadingDeg, setSpeakerHeadingDeg] = useState<number>(0);
  const [listenerX, setListenerX] = useState<number>(290);
  const [megaphoneActive, setMegaphoneActive] = useState<boolean>(false);

  const [selectedAgentId, setSelectedAgentId] = useState<string>("agent-sophia-scribe");
  const [agentTaskDraft, setAgentTaskDraft] = useState<string>("14화 최종 편집본 말풍선 세로 여백 및 식자 폰트 일관성 전수 검사");
  const [memorySearchQuery, setMemorySearchQuery] = useState<string>("");
  const [mcpIntent, setMcpIntent] = useState<StudioMcpQueryIntent>("who-is-around");

  const [selfDccApp, setSelfDccApp] = useState<StudioCreatorDccAppId>("blender-3d");
  const [selfDocTitle, setSelfDocTitle] = useState<string>("EP14_Rooftop_Night_v4.blend");
  const [selfPrivacyMasked, setSelfPrivacyMasked] = useState<boolean>(false);
  const [deskNoteSummaryDraft, setDeskNoteSummaryDraft] = useState<string>("14화 40컷 캐릭터 시선 방향 수정 가이드를 45초 음성 메모로 남깁니다.");
  const [newShareTitleDraft, setNewShareTitleDraft] = useState<string>("Photoshop 14화 후보정 LUT 비교 뷰");

  const [newPinTitleDraft, setNewPinTitleDraft] = useState<string>("15화 지하철역 공간 레퍼런스 무드보드");
  const [rouletteSeed, setRouletteSeed] = useState<number>(1);

  const floorTableRegionLabelId = useId();
  const agentTableRegionLabelId = useId();

  const currentSelfFloorId = buildingState.participantFloorMap["creator-self"] ?? buildingState.activeFloorId;
  const currentSelfRoomId = buildingState.participantRoomMap["creator-self"] ?? "room-2f-main-atelier";

  const selectedRoomTableSnapshot = useMemo(
    () => getRoomPersistentTableSnapshot(buildingState, selectedRoomId),
    [buildingState, selectedRoomId],
  );
  const visibleFloorChatMessages = useMemo(
    () => filterVisibleFloorChatMessages(buildingState, currentSelfFloorId, currentSelfRoomId),
    [buildingState, currentSelfFloorId, currentSelfRoomId],
  );
  const voiceConeResult = useMemo(
    () =>
      computeDirectionalVoiceConeGain({
        speakerPoint: { x: 200, y: 200 },
        speakerHeadingDeg,
        listenerPoint: { x: listenerX, y: 200 },
        maxRadius: 320,
        coneHalfAngleDeg: 60,
        rearGainFloor: 0.28,
        megaphoneActive,
        differentSoundproofRoom: false,
      }),
    [speakerHeadingDeg, listenerX, megaphoneActive],
  );
  const filteredMeetingMemories = useMemo(
    () => searchVirtualOfficeMeetingMemories(enterpriseState, memorySearchQuery),
    [enterpriseState, memorySearchQuery],
  );
  const mcpQueryResult = useMemo(() => executeVirtualOfficeMcpQuery(enterpriseState, mcpIntent), [enterpriseState, mcpIntent]);
  const weeklyPulse = useMemo(() => computeWeeklyOfficePulseInsights(enterpriseState), [enterpriseState]);

  const handleElevatorFloorMove = (floorId: StudioVirtualOfficeFloorId, roomId?: string) => {
    const res = moveParticipantToFloor(buildingState, "creator-self", floorId, roomId);
    setBuildingState(res.state);
    if (res.ok) setStatusNotice(`엘리베이터 이동 완료: ${floorId.toUpperCase()} (${res.state.participantRoomMap["creator-self"]})`);
    else if (res.reason === "room-locked") setStatusNotice("잠긴 방음 회의실입니다. Knock-to-Enter(노크 요청)로 입장을 요청해 주세요.");
    else setStatusNotice(`이동 제한: ${res.reason}`);
  };

  const handleSubmitKnock = () => {
    const trimmed = knockMessageDraft.trim();
    if (!trimmed) return;
    setBuildingState((prev) =>
      requestRoomKnock(prev, {
        id: `knock-${Date.now()}`,
        roomId: "room-3f-conte-vault",
        requesterId: "creator-self",
        requesterName: "수석 배경 아티스트",
        messageKo: trimmed,
        urgency: "urgent-deadline",
        nowMs: Date.now(),
      }),
    );
    setStatusNotice("3F 스포일러 보안 콘티 회의실에 노크(Knock-to-Enter) 요청을 전송했습니다.");
  };

  const handleKnockInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmitKnock();
    }
  };

  const handleSendFloorChat = () => {
    const trimmed = chatInputDraft.trim();
    if (!trimmed) return;
    setBuildingState((prev) =>
      postFloorScopedChatMessage(prev, {
        id: `fchat-${Date.now()}`,
        scope: chatScope,
        floorId: currentSelfFloorId,
        roomId: currentSelfRoomId,
        authorId: "creator-self",
        authorName: "수석 배경 아티스트",
        text: trimmed,
        nowMs: Date.now(),
      }),
    );
    setChatInputDraft("");
    setStatusNotice(`${chatScope} 범위로 채팅 메시지를 발송했습니다.`);
  };

  const handleFloorChatKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSendFloorChat();
    }
  };

  const handleDispatchAgentTask = () => {
    const trimmed = agentTaskDraft.trim();
    if (!trimmed) return;
    setEnterpriseState((prev) => dispatchTaskToAiAgentDesk(prev, selectedAgentId, trimmed, "EP.14", Date.now()));
    setStatusNotice(`AI 에이전트(${selectedAgentId}) 데스크에 신규 자동 검수 태스크를 배정했습니다.`);
  };

  const handleAgentTaskKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleDispatchAgentTask();
    }
  };

  const handleAddScreenShareSlot = () => {
    const slotNum = enterpriseState.screenShareSlots.length + 1;
    const res = startSimultaneousScreenShareSlot(enterpriseState, {
      slotId: `share-slot-${Date.now()}`,
      presenterId: `creator-peer-${slotNum}`,
      presenterName: `파트 리드 #${slotNum}`,
      streamTitleKo: newShareTitleDraft.trim() || `동시 비교 화면 #${slotNum}`,
      dccApp: "photoshop",
      resolutionLabel: "1440p-color-calibrated",
      laserPointer: { active: true, xNorm: 0.5, yNorm: 0.5, pointerOwnerName: "수석 배경 아티스트" },
    });
    setEnterpriseState(res.state);
    if (res.ok) setStatusNotice(`다중 화면 공유 슬롯 추가 완료 (현재 ${res.state.screenShareSlots.length}/${MAX_SIMULTANEOUS_SCREEN_SHARE_SLOTS} 화면)`);
    else setStatusNotice(`동시 화면 공유는 최대 ${MAX_SIMULTANEOUS_SCREEN_SHARE_SLOTS}개까지 지원합니다.`);
  };

  const handleHostModeration = (command: StudioHostModerationCommand) => {
    setEnterpriseState((prev) => executeHostModerationCommand(prev, command, "room-1f-townhall", Date.now()));
    setStatusNotice(`호스트 관제 명령 실행: ${command}`);
  };

  return (
    <section
      className={`space-y-4 rounded-xl border border-line bg-card p-4 text-fg ${className ?? ""}`}
      data-testid="studio-virtual-office-enterprise-suite"
      aria-label="13대 글로벌·국내 가상 오피스 통합 고도화 스위트"
    >
      <header className="space-y-2 border-b border-line pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">13대 글로벌·국내 가상 오피스 내재화·고도화 통합 스위트</h3>
            <p className="text-xs text-fg-2">
              Gather · ZEP · oVice · WorkAdventure · Topia · Kumospace · SoWork · Roam · SpatialChat · Teamflow · Tandem · Spot Virtual · Cosmos Video 핵심 아키텍처 내재화
            </p>
          </div>
          <span role="status" aria-live="polite" className="rounded-md border border-accent bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
            {statusNotice}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="가상 오피스 엔터프라이즈 기능 도메인 탭">
          {SUITE_TABS.map((tab) => (
            <button
              key={tab.id} type="button" role="tab" id={`tab-${tab.id}`} aria-selected={activeTab === tab.id} aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${activeTab === tab.id ? "border-accent bg-accent-soft font-semibold text-accent shadow-xs" : "border-line bg-panel text-fg-2 hover:text-fg"}`}
            >
              <div>{tab.labelKo}</div>
              <div className="text-[11px] opacity-80">{tab.platformsBadge}</div>
            </button>
          ))}
        </div>
      </header>
      <StudioVirtualOfficeSpatialCanvasHud onNavigateToTab={(tabId, msg) => { setActiveTab(tabId); setStatusNotice(msg); }} />

      {activeTab === "spatial-floors-knock-audio" ? (
        <div id="panel-spatial-floors-knock-audio" role="tabpanel" aria-labelledby="tab-spatial-floors-knock-audio" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-3 rounded-lg border border-line bg-panel p-3">
              <div className="flex items-center justify-between">
                <h4 id={floorTableRegionLabelId} className="text-xs font-semibold">다층 오피스 엘리베이터 (1F~3F) 및 방음 룸 잠금 현황</h4>
                <span className="rounded border border-line bg-card px-2 py-0.5 text-xs tabular-nums">
                  내 위치: {currentSelfFloorId.toUpperCase()} · {currentSelfRoomId}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {buildingState.floors.map((floor) => (
                  <button
                    key={floor.id}
                    type="button"
                    onClick={() => handleElevatorFloorMove(floor.id)}
                    className={`rounded border px-2.5 py-1 text-xs font-medium ${
                      currentSelfFloorId === floor.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg"
                    }`}
                  >
                    {floor.badgeText} 이동 ({floor.nameKo})
                  </button>
                ))}
              </div>
              <div role="region" aria-labelledby={floorTableRegionLabelId} className="overflow-x-auto rounded border border-line bg-card">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-line bg-panel">
                      <th scope="col" className="sticky left-0 bg-panel px-2.5 py-1.5 font-semibold">방 이름 (층)</th>
                      <th scope="col" className="px-2.5 py-1.5 font-semibold">보안·방음 상태</th>
                      <th scope="col" className="px-2.5 py-1.5 text-right font-semibold tabular-nums">재실/정원</th>
                      <th scope="col" className="px-2.5 py-1.5 font-semibold">동작</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buildingState.rooms.map((room) => (
                      <tr key={room.id} className="border-b border-line last:border-b-0">
                        <th scope="row" className="sticky left-0 bg-card px-2.5 py-1.5 font-medium">{room.nameKo}</th>
                        <td className="px-2.5 py-1.5">
                          <span className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[11px]">
                            {room.locked ? "잠김 (노크 필요)" : room.soundproof ? "방음 열림" : "오픈 존"}
                          </span>
                        </td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{room.occupantIds.length}/{room.capacity}명</td>
                        <td className="space-x-1 px-2.5 py-1.5">
                          <button type="button" onClick={() => handleElevatorFloorMove(room.floorId, room.id)} className="rounded border border-line bg-panel px-2 py-0.5 text-[11px]">입장</button>
                          <button
                            type="button"
                            onClick={() => setBuildingState((prev) => toggleVirtualOfficeRoomLock(prev, room.id, !room.locked, "집중 검수 잠금"))}
                            className="rounded border border-line bg-panel px-2 py-0.5 text-[11px]"
                          >
                            {room.locked ? "잠금 해제" : "방 잠그기"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-line bg-panel p-3">
              <h4 className="text-xs font-semibold">Knock-to-Enter(잠긴 방 노크 큐) & Shoulder Tap(어깨 톡)</h4>
              <div className="space-y-2 rounded border border-line bg-card p-2.5">
                <label className="block text-xs font-medium" htmlFor="knock-message-input">잠긴 회의실(3F 스포일러 보안 콘티실) 노크 메시지</label>
                <div className="flex gap-1.5">
                  <input
                    id="knock-message-input"
                    type="text"
                    value={knockMessageDraft}
                    onChange={(e) => setKnockMessageDraft(e.target.value)}
                    onKeyDown={handleKnockInputKeyDown}
                    className="flex-1 rounded border border-line bg-panel px-2 py-1 text-xs"
                  />
                  <button type="button" onClick={handleSubmitKnock} className="rounded border border-accent bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">노크하기</button>
                </div>
                <ul className="space-y-1.5 text-xs">
                  {buildingState.knockQueue.map((knock) => (
                    <li key={knock.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-panel p-2">
                      <div>
                        <strong>{knock.requesterName}</strong> · <span className="text-fg-2">{knock.messageKo}</span>{" "}
                        <span className="rounded border border-line px-1.5 py-0.5 text-[11px]">상태: {knock.status}</span>
                      </div>
                      {knock.status === "pending" ? (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setBuildingState((prev) => resolveRoomKnock(prev, knock.id, "approved", "creator-edit-sora", Date.now()));
                              setStatusNotice(`${knock.requesterName}님의 노크 입장을 승인했습니다.`);
                            }}
                            className="rounded border border-accent bg-accent-soft px-2 py-0.5 text-[11px] text-accent"
                          >
                            입장 승인
                          </button>
                          <button
                            type="button"
                            onClick={() => setBuildingState((prev) => resolveRoomKnock(prev, knock.id, "wait-5m", "creator-edit-sora", Date.now()))}
                            className="rounded border border-line bg-card px-2 py-0.5 text-[11px]"
                          >
                            5분 대기 안내
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2 rounded border border-line bg-card p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-medium" htmlFor="shoulder-tap-reason">동료 어깨 톡(Shoulder Tap) 사유</label>
                  <select
                    id="shoulder-tap-reason"
                    value={shoulderTapReason}
                    onChange={(e) => setShoulderTapReason(e.target.value as StudioShoulderTapReasonCategory)}
                    className="rounded border border-line bg-panel px-2 py-1 text-xs"
                  >
                    <option value="conte-confirm">콘티 연출 확인</option>
                    <option value="layer-missing">PSD 레이어 누락 문의</option>
                    <option value="color-guide">채색 LUT 가이드</option>
                    <option value="urgent-publish">마감 긴급 출고 (DND 관통)</option>
                  </select>
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    aria-label="어깨 톡 메시지"
                    value={shoulderTapMessage}
                    onChange={(e) => setShoulderTapMessage(e.target.value)}
                    className="flex-1 rounded border border-line bg-panel px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setBuildingState((prev) =>
                        sendShoulderTap(prev, {
                          id: `tap-${Date.now()}`,
                          fromId: "creator-self",
                          fromName: "수석 배경 아티스트",
                          toId: "creator-art-jun",
                          toName: "준 작가",
                          targetStatus: "focusing",
                          reasonCategory: shoulderTapReason,
                          messageKo: shoulderTapMessage,
                          nowMs: Date.now(),
                        }),
                      );
                      setStatusNotice("준 작가에게 어깨 톡(Shoulder Tap)을 보냈습니다.");
                    }}
                    className="rounded border border-line bg-panel px-2.5 py-1 text-xs font-medium"
                  >
                    어깨 톡 전송
                  </button>
                </div>
                {buildingState.shoulderTaps.length > 0 ? (
                  <p className="text-xs text-fg-2">
                    최근 전송: <strong>{buildingState.shoulderTaps[0]?.toName}</strong> — 전달 방식: <span>{buildingState.shoulderTaps[0]?.deliveryMode}</span>
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-3 rounded-lg border border-line bg-panel p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-semibold">영구 회의실 테이블 상태 (Teamflow Persistent Table Apps)</h4>
                <label className="text-xs">
                  대상 룸{" "}
                  <select
                    aria-label="영구 테이블 조회 대상 룸"
                    value={selectedRoomId}
                    onChange={(e) => setSelectedRoomId(e.target.value)}
                    className="rounded border border-line bg-card px-2 py-0.5 text-xs"
                  >
                    {buildingState.rooms.map((r) => (
                      <option key={r.id} value={r.id}>{r.nameKo}</option>
                    ))}
                  </select>
                </label>
              </div>
              {selectedRoomTableSnapshot ? (
                <div className="space-y-2 text-xs">
                  <p className="text-fg-2">
                    현재 재실 <strong>{selectedRoomTableSnapshot.occupantCount}명</strong> ·{" "}
                    {selectedRoomTableSnapshot.isPersistedWhileEmpty
                      ? "전원 퇴실 상태에서도 테이블 위 원고·검수표가 영구 보존 중입니다"
                      : "참석자가 테이블 문서를 실시간 공유 중입니다"}
                  </p>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      aria-label="테이블에 새로 고정할 원고·문서 제목"
                      value={tableAppTitleDraft}
                      onChange={(e) => setTableAppTitleDraft(e.target.value)}
                      className="flex-1 rounded border border-line bg-card px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const title = tableAppTitleDraft.trim();
                        if (!title) return;
                        setBuildingState((prev) =>
                          pinRoomTableApp(prev, selectedRoomId, {
                            id: `table-app-${Date.now()}`,
                            kind: "manuscript-viewer",
                            titleKo: title,
                            titleEn: title,
                            episodeLabel: "EP.14",
                            pinnedByName: "수석 배경 아티스트",
                            updatedAtMs: Date.now(),
                            stateSummaryKo: "방 테이블에 영구 고정됨 (퇴실 후 자동 유지)",
                          }),
                        );
                        setStatusNotice(`${selectedRoomTableSnapshot.roomNameKo} 테이블에 문서를 고정했습니다.`);
                      }}
                      className="rounded border border-accent bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent"
                    >
                      테이블에 문서 고정
                    </button>
                  </div>
                  <ul className="space-y-1.5">
                    {selectedRoomTableSnapshot.tableApps.map((app) => (
                      <li key={app.id} className="flex items-center justify-between gap-2 rounded border border-line bg-card p-2">
                        <div>
                          <strong>[{app.episodeLabel}] {app.titleKo}</strong>
                          <div className="text-[11px] text-fg-2">고정자: {app.pinnedByName} · {app.stateSummaryKo}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setBuildingState((prev) => unpinRoomTableApp(prev, selectedRoomId, app.id))}
                          className="rounded border border-line bg-panel px-2 py-0.5 text-[11px]"
                        >
                          고정 해제
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="space-y-3 rounded-lg border border-line bg-panel p-3">
              <h4 className="text-xs font-semibold">지향성 음성 콘(Directional Voice Cone) & 다층 분리 채팅</h4>
              <div className="space-y-2 rounded border border-line bg-card p-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    화자 시선 각도: <strong className="tabular-nums">{speakerHeadingDeg}°</strong> · 청자 거리:{" "}
                    <strong className="tabular-nums">{voiceConeResult.distancePx}px</strong>
                  </span>
                  <span className="rounded border border-line bg-panel px-2 py-0.5 font-semibold tabular-nums">
                    최종 음향 게인: {Math.round(voiceConeResult.gain * 100)}% ({voiceConeResult.inFrontCone ? "정면 콘 내부" : "후방 감쇠 적용"})
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setSpeakerHeadingDeg(0)} className="rounded border border-line bg-panel px-2 py-1 text-xs">정면 응시 (0°)</button>
                  <button type="button" onClick={() => setSpeakerHeadingDeg(180)} className="rounded border border-line bg-panel px-2 py-1 text-xs">뒤돌아보기 (180° 후방 감쇠)</button>
                  <button type="button" onClick={() => setListenerX((x) => (x > 360 ? 250 : x + 40))} className="rounded border border-line bg-panel px-2 py-1 text-xs">청자 거리 이동 ({listenerX}px)</button>
                  <button type="button" onClick={() => setMegaphoneActive((m) => !m)} className="rounded border border-accent bg-accent-soft px-2 py-1 text-xs text-accent">
                    {megaphoneActive ? "메가폰 방송 끄기" : "메가폰 전체 방송 켜기"}
                  </button>
                </div>
              </div>

              <div className="space-y-2 rounded border border-line bg-card p-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <label htmlFor="floor-chat-scope" className="font-medium">층·룸 스코프 채팅 ({currentSelfFloorId.toUpperCase()})</label>
                  <select
                    id="floor-chat-scope"
                    value={chatScope}
                    onChange={(e) => setChatScope(e.target.value as StudioFloorChatScope)}
                    className="rounded border border-line bg-panel px-2 py-0.5 text-xs"
                  >
                    <option value="room">현재 방음 룸 전용</option>
                    <option value="floor">현재 층(Floor) 전체</option>
                    <option value="building-announcement">전 층 빌딩 공지</option>
                  </select>
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    aria-label="층별 스코프 채팅 입력"
                    placeholder="메시지 입력 (한글 조합 중 Enter 안전 보호)"
                    value={chatInputDraft}
                    onChange={(e) => setChatInputDraft(e.target.value)}
                    onKeyDown={handleFloorChatKeyDown}
                    className="flex-1 rounded border border-line bg-panel px-2 py-1 text-xs"
                  />
                  <button type="button" onClick={handleSendFloorChat} className="rounded border border-line bg-panel px-2.5 py-1 text-xs font-medium">전송</button>
                </div>
                <ul className="space-y-1 text-[11px]">
                  {visibleFloorChatMessages.slice(0, 3).map((msg) => (
                    <li key={msg.id} className="rounded border border-line bg-panel px-2 py-1">
                      <strong>[{msg.scope}] {msg.authorName}:</strong> {msg.text}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "ai-agents-memory-mcp" ? (
        <div id="panel-ai-agents-memory-mcp" role="tabpanel" aria-labelledby="tab-ai-agents-memory-mcp" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-3 rounded-lg border border-line bg-panel p-3">
              <h4 id={agentTableRegionLabelId} className="text-xs font-semibold">AI 에이전트 상주 데스크 (Spot Virtual `/ai-agents` · SoWork `06 Agents`)</h4>
              <div role="region" aria-labelledby={agentTableRegionLabelId} className="overflow-x-auto rounded border border-line bg-card">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-line bg-panel">
                      <th scope="col" className="sticky left-0 bg-panel px-2.5 py-1.5 font-semibold">에이전트 데스크</th>
                      <th scope="col" className="px-2.5 py-1.5 font-semibold">가동 상태</th>
                      <th scope="col" className="px-2.5 py-1.5 font-semibold">최근 산출물</th>
                      <th scope="col" className="px-2.5 py-1.5 text-right font-semibold tabular-nums">누적 완료</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enterpriseState.aiAgentDesks.map((agent) => (
                      <tr key={agent.id} className="border-b border-line last:border-b-0">
                        <th scope="row" className="sticky left-0 bg-card px-2.5 py-1.5 font-medium">[{agent.deskCode}] {agent.nameKo}</th>
                        <td className="px-2.5 py-1.5">
                          <span className="rounded border border-line px-1.5 py-0.5 text-[11px]">
                            {agent.status === "working" ? "작업 수행 중" : agent.status === "completed" ? "검수 완료" : "대기 중"}
                          </span>
                        </td>
                        <td className="px-2.5 py-1.5 text-fg-2">{agent.lastOutputKo}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{agent.completedCount}건</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2 rounded border border-line bg-card p-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="select-ai-agent" className="font-medium">태스크 배정 대상 에이전트</label>
                  <select
                    id="select-ai-agent"
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                    className="rounded border border-line bg-panel px-2 py-0.5 text-xs"
                  >
                    {enterpriseState.aiAgentDesks.map((a) => (
                      <option key={a.id} value={a.id}>[{a.deskCode}] {a.nameKo}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    aria-label="AI 에이전트 지시 태스크"
                    value={agentTaskDraft}
                    onChange={(e) => setAgentTaskDraft(e.target.value)}
                    onKeyDown={handleAgentTaskKeyDown}
                    className="flex-1 rounded border border-line bg-panel px-2 py-1 text-xs"
                  />
                  <button type="button" onClick={handleDispatchAgentTask} className="rounded border border-accent bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">태스크 지시</button>
                  <button
                    type="button"
                    onClick={() => {
                      setEnterpriseState((prev) => completeAiAgentDeskTask(prev, selectedAgentId, `${agentTaskDraft} — 결함 0건 자동 승인`, Date.now()));
                      setStatusNotice("선택한 AI 에이전트 태스크가 완료 처리되었습니다.");
                    }}
                    className="rounded border border-line bg-panel px-2 py-1 text-xs"
                  >
                    즉시 완료 산출
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-line bg-panel p-3">
              <h4 className="text-xs font-semibold">AI 회의 메모리(Cosmos AI Replay · SoWork Memory) & MCP/API 브리지</h4>
              <div className="space-y-2 rounded border border-line bg-card p-2.5 text-xs">
                <label htmlFor="memory-search-input" className="block font-medium">회의록·결정사항·액션아이템 시맨틱 검색</label>
                <input
                  id="memory-search-input"
                  type="search"
                  placeholder="예: 림라이트, EP.14, 콘티"
                  value={memorySearchQuery}
                  onChange={(e) => setMemorySearchQuery(e.target.value)}
                  className="w-full rounded border border-line bg-panel px-2 py-1 text-xs"
                />
                <div className="space-y-2">
                  {filteredMeetingMemories.map((mem) => (
                    <article key={mem.id} className="space-y-1.5 rounded border border-line bg-panel p-2">
                      <div className="flex items-center justify-between">
                        <strong>[{mem.episodeCode}] {mem.titleKo}</strong>
                        <span className="text-[11px] text-fg-2">{mem.roomNameKo}</span>
                      </div>
                      <p className="text-fg-2">{mem.summaryKo}</p>
                      <ul className="space-y-1">
                        {mem.actionItems.map((act) => (
                          <li key={act.id} className="flex items-center justify-between gap-2">
                            <span>[{act.done ? "완료" : "진행중"}] <strong>{act.assigneeName}</strong>: {act.taskKo}</span>
                            <button
                              type="button"
                              onClick={() => setEnterpriseState((prev) => toggleMeetingActionItemDone(prev, mem.id, act.id))}
                              className="rounded border border-line bg-card px-2 py-0.5 text-[11px]"
                            >
                              {act.done ? "미완료 전환" : "완료 체크"}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </div>

              <div className="space-y-2 rounded border border-line bg-card p-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">MCP / OpenClaw 오피스 컨텍스트 쿼리 (`{mcpQueryResult.protocolVersion}`)</span>
                  <select
                    aria-label="MCP 오피스 쿼리 인텐트"
                    value={mcpIntent}
                    onChange={(e) => setMcpIntent(e.target.value as StudioMcpQueryIntent)}
                    className="rounded border border-line bg-panel px-2 py-0.5 text-xs"
                  >
                    <option value="who-is-around">who-is-around (접속자·DCC 작업 현황)</option>
                    <option value="last-meeting-decisions">last-meeting-decisions (최근 결정사항)</option>
                    <option value="active-bottlenecks">active-bottlenecks (대기 중 병목)</option>
                    <option value="agent-desk-status">agent-desk-status (AI 데스크 현황)</option>
                  </select>
                </div>
                <p className="font-medium text-accent">{mcpQueryResult.headlineKo}</p>
                <ul className="list-inside list-disc space-y-0.5 text-[11px] text-fg-2">
                  {mcpQueryResult.bulletsKo.map((bullet, idx) => (
                    <li key={idx}>{bullet}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "dcc-presence-aikido-multishare" ? (
        <div id="panel-dcc-presence-aikido-multishare" role="tabpanel" aria-labelledby="tab-dcc-presence-aikido-multishare" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-3 rounded-lg border border-line bg-panel p-3">
              <h4 className="text-xs font-semibold">실시간 창작 앱 프레즌스 (Tandem · Cosmos True Status) & 비동기 데스크 노트</h4>
              <div className="space-y-2 rounded border border-line bg-card p-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="self-dcc-select" className="font-medium">내 활성 DCC 창작 툴</label>
                  <select
                    id="self-dcc-select"
                    value={selfDccApp}
                    onChange={(e) => setSelfDccApp(e.target.value as StudioCreatorDccAppId)}
                    className="rounded border border-line bg-panel px-2 py-0.5 text-xs"
                  >
                    <option value="blender-3d">Blender 4.2 LTS</option>
                    <option value="clip-studio-paint">Clip Studio Paint EX</option>
                    <option value="photoshop">Adobe Photoshop</option>
                    <option value="sketchup-pro">SketchUp Pro</option>
                    <option value="toonstudio-storyboarder">ToonStudio 콘티 보드</option>
                  </select>
                  <label className="inline-flex items-center gap-1">
                    <input type="checkbox" checked={selfPrivacyMasked} onChange={(e) => setSelfPrivacyMasked(e.target.checked)} />
                    파일명 보안 마스킹
                  </label>
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    aria-label="내 작업 문서 파일명"
                    value={selfDocTitle}
                    onChange={(e) => setSelfDocTitle(e.target.value)}
                    className="flex-1 rounded border border-line bg-panel px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setEnterpriseState((prev) => updateCreatorDccTrueStatus(prev, "creator-self", selfDccApp, selfDocTitle, selfPrivacyMasked, Date.now()));
                      setStatusNotice("내 실시간 DCC 작업 앱 상태(True Status)를 갱신했습니다.");
                    }}
                    className="rounded border border-accent bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent"
                  >
                    상태 반영
                  </button>
                </div>
                <ul className="space-y-1.5">
                  {enterpriseState.creatorTrueStatuses.map((entry) => (
                    <li key={entry.participantId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-panel p-2">
                      <div>
                        <strong>{entry.participantName}</strong> ({entry.roleKo} · {entry.deskLabelKo})
                        <div className="text-[11px] text-fg-2">{formatCreatorDccTrueStatusBadge(entry)}</div>
                      </div>
                      <span className="rounded border border-line px-1.5 py-0.5 text-[11px]">{entry.availability}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2 rounded border border-line bg-card p-2.5 text-xs">
                <h5 className="font-semibold">비동기 데스크 비디오·보이스 드롭 (Roam Aikido Desk Note)</h5>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    aria-label="데스크 비동기 노트 요약"
                    value={deskNoteSummaryDraft}
                    onChange={(e) => setDeskNoteSummaryDraft(e.target.value)}
                    className="flex-1 rounded border border-line bg-panel px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setEnterpriseState((prev) =>
                        leaveAsyncDeskNote(prev, {
                          id: `dnote-${Date.now()}`,
                          fromName: "수석 배경 아티스트",
                          targetDeskOwnerId: "creator-art-jun",
                          targetDeskOwnerName: "준 작가",
                          mediaKind: "voice-memo",
                          durationSec: 45,
                          summaryKo: deskNoteSummaryDraft,
                          episodeCutRef: "EP.14 · Cut 40",
                          nowMs: Date.now(),
                        }),
                      );
                      setStatusNotice("준 작가 책상에 비동기 보이스 노트를 남겼습니다.");
                    }}
                    className="rounded border border-line bg-panel px-2.5 py-1 text-xs font-medium"
                  >
                    책상에 노트 드롭
                  </button>
                </div>
                <ul className="space-y-1.5">
                  {enterpriseState.asyncDeskNotes.map((note) => (
                    <li key={note.id} className="flex items-center justify-between gap-2 rounded border border-line bg-panel p-2">
                      <div>
                        <strong>[{note.episodeCutRef}] {note.fromName} → {note.targetDeskOwnerName}</strong> ({note.durationSec}초 {note.mediaKind})
                        <div className="text-[11px] text-fg-2">{note.summaryKo}</div>
                      </div>
                      {note.acknowledged ? (
                        <span className="rounded border border-line px-1.5 py-0.5 text-[11px]">확인 완료</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEnterpriseState((prev) => acknowledgeAsyncDeskNote(prev, note.id, Date.now()))}
                          className="rounded border border-accent bg-accent-soft px-2 py-0.5 text-[11px] text-accent"
                        >
                          수신 확인
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-line bg-panel p-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold">다중 화면 동시 비교 그리드 (최대 {MAX_SIMULTANEOUS_SCREEN_SHARE_SLOTS}화면 · 레이저 포인터 동기화)</h4>
                <span className="rounded border border-line bg-card px-2 py-0.5 text-xs tabular-nums">
                  활성 스트림: {enterpriseState.screenShareSlots.length}/{MAX_SIMULTANEOUS_SCREEN_SHARE_SLOTS}
                </span>
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  aria-label="추가할 화면 공유 스트림 제목"
                  value={newShareTitleDraft}
                  onChange={(e) => setNewShareTitleDraft(e.target.value)}
                  className="flex-1 rounded border border-line bg-card px-2 py-1 text-xs"
                />
                <button type="button" onClick={handleAddScreenShareSlot} className="rounded border border-accent bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">동시 화면 추가</button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {enterpriseState.screenShareSlots.map((slot) => (
                  <article key={slot.slotId} className="space-y-1.5 rounded border border-line bg-card p-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <strong>{slot.streamTitleKo}</strong>
                      <span className="rounded border border-line px-1.5 py-0.5 text-[10px]">{slot.resolutionLabel}</span>
                    </div>
                    <p className="text-[11px] text-fg-2">
                      발표자: {slot.presenterName} · 레이저 포인터:{" "}
                      <span className="tabular-nums">({slot.laserPointer.xNorm}, {slot.laserPointer.yNorm})</span> by {slot.laserPointer.pointerOwnerName}
                    </p>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setEnterpriseState((prev) =>
                            moveScreenShareLaserPointer(prev, slot.slotId, slot.laserPointer.xNorm + 0.12, slot.laserPointer.yNorm + 0.08, "수석 배경 아티스트"),
                          )
                        }
                        className="rounded border border-line bg-panel px-2 py-0.5 text-[11px]"
                      >
                        레이저 포인터 지시
                      </button>
                      <button
                        type="button"
                        onClick={() => setEnterpriseState((prev) => stopSimultaneousScreenShareSlot(prev, slot.slotId))}
                        className="rounded border border-line bg-panel px-2 py-0.5 text-[11px]"
                      >
                        공유 종료
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "host-canvas-pulse-matrix" ? (
        <div id="panel-host-canvas-pulse-matrix" role="tabpanel" aria-labelledby="tab-host-canvas-pulse-matrix" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-3 rounded-lg border border-line bg-panel p-3">
              <h4 className="text-xs font-semibold">호스트 진행 관제 (ZEP Host Controls) & 공간 레퍼런스 미디어 핀 (SpatialChat)</h4>
              <div className="space-y-2 rounded border border-line bg-card p-2.5 text-xs">
                <p className="text-fg-2">
                  현재 관제 상태: <strong>{enterpriseState.hostModeration.lastCommandLabelKo}</strong> · 전체 음소거:{" "}
                  {enterpriseState.hostModeration.allMuted ? "켜짐" : "꺼짐"} · 이동 잠금: {enterpriseState.hostModeration.movementFrozen ? "켜짐" : "꺼짐"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => handleHostModeration("summon-all")} className="rounded border border-accent bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
                    1F 타운홀로 전원 소환
                  </button>
                  <button
                    type="button"
                    onClick={() => handleHostModeration(enterpriseState.hostModeration.allMuted ? "unmute-all" : "mute-all")}
                    className="rounded border border-line bg-panel px-2.5 py-1 text-xs"
                  >
                    {enterpriseState.hostModeration.allMuted ? "전체 음소거 해제" : "전체 일괄 음소거"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleHostModeration(enterpriseState.hostModeration.movementFrozen ? "unfreeze-movement" : "freeze-movement")}
                    className="rounded border border-line bg-panel px-2.5 py-1 text-xs"
                  >
                    {enterpriseState.hostModeration.movementFrozen ? "이동 잠금 해제" : "아바타 이동 잠금"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const res = spinVirtualOfficeRoulette(enterpriseState, ["수석 배경 아티스트", "민 프로듀서", "준 작가", "소라 편집자"], rouletteSeed);
                      setRouletteSeed((s) => s + 1);
                      setEnterpriseState(res.state);
                      setStatusNotice(`데일리 스탠드업 발표자 룰렛 추첨 결과: ${res.winner}`);
                    }}
                    className="rounded border border-line bg-panel px-2.5 py-1 text-xs"
                  >
                    발표 순서 룰렛 돌리기 (최근: {enterpriseState.hostModeration.rouletteHistory[0]})
                  </button>
                </div>
              </div>

              <div className="space-y-2 rounded border border-line bg-card p-2.5 text-xs">
                <h5 className="font-semibold">공간 캔버스 레퍼런스 보드 다중 핀 고정</h5>
                <div className="flex gap-1.5">
                  <input type="text" aria-label="공간 캔버스에 고정할 레퍼런스 제목" value={newPinTitleDraft} onChange={(e) => setNewPinTitleDraft(e.target.value)} className="flex-1 rounded border border-line bg-panel px-2 py-1 text-xs" />
                  <button
                    type="button"
                    onClick={() => {
                      setEnterpriseState((prev) =>
                        pinCanvasReferenceMedia(prev, { id: `pin-media-${Date.now()}`, titleKo: newPinTitleDraft, mediaType: "reference-sheet", x: 240, y: 160, scale: 1, lockedOnCanvas: true, pinnedByName: "수석 배경 아티스트" }),
                      );
                      setStatusNotice("공간 캔버스에 신규 레퍼런스 미디어를 핀 고정했습니다.");
                    }}
                    className="rounded border border-line bg-panel px-2.5 py-1 text-xs font-medium"
                  >
                    캔버스 핀 추가
                  </button>
                </div>
                <ul className="space-y-1">
                  {enterpriseState.pinnedCanvasMedia.map((media) => (
                    <li key={media.id} className="flex items-center justify-between gap-2 rounded border border-line bg-panel p-2">
                      <span><strong>{media.titleKo}</strong> ({media.mediaType}) — {media.lockedOnCanvas ? "위치 잠김" : "이동 가능"}</span>
                      <button type="button" onClick={() => setEnterpriseState((prev) => togglePinCanvasReferenceMediaLock(prev, media.id))} className="rounded border border-line bg-card px-2 py-0.5 text-[11px]">
                        {media.lockedOnCanvas ? "잠금 해제" : "위치 잠금"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-line bg-panel p-3">
              <h4 className="text-xs font-semibold">주간 워크 인사이트 & 집중 작화 밸런스 (SoWork `04 Insights` · Kumospace Analytics)</h4>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded border border-line bg-card p-2.5"><dt className="text-fg-2">주간 딥 포커스(집중 작화) 시간</dt><dd className="text-sm font-semibold tabular-nums">{weeklyPulse.deepFocusHours}시간</dd></div>
                <div className="rounded border border-line bg-card p-2.5"><dt className="text-fg-2">주간 실시간 회의 시간</dt><dd className="text-sm font-semibold tabular-nums">{weeklyPulse.meetingHours}시간</dd></div>
                <div className="rounded border border-line bg-card p-2.5"><dt className="text-fg-2">집중 대 회의 비율 (Focus/Meeting)</dt><dd className="text-sm font-semibold tabular-nums">{weeklyPulse.focusToMeetingRatio}배</dd></div>
                <div className="rounded border border-line bg-card p-2.5"><dt className="text-fg-2">AI 에이전트 절감 시간</dt><dd className="text-sm font-semibold tabular-nums">{weeklyPulse.aiMinutesSaved}분 절감</dd></div>
              </dl>
              <p className="rounded border border-line bg-card p-2.5 text-xs text-fg-2">{weeklyPulse.recommendationKo}</p>
            </div>
          </div>
        </div>
      ) : null}
      {activeTab === "pairing-xr-floor-coaching" ? (
        <div role="tabpanel" id="enterprise-tabpanel-pairing-xr-floor-coaching" aria-label="원격페어링 · 상태모자 · 리셉션 · 3D페데스탈">
          <StudioVirtualOfficePairingXrPanel />
        </div>
      ) : null}
      {activeTab === "stage-sprint-holo-lounge" ? (
        <div role="tabpanel" id="enterprise-tabpanel-stage-sprint-holo-lounge" aria-label="그린룸 · 품평로테이션 · 3D홀로그램 · 딥스프린트">
          <StudioVirtualOfficeStageSprintHoloPanel />
        </div>
      ) : null}
      {activeTab === "warroom-async-stage" ? (
        <div role="tabpanel" id="enterprise-tabpanel-warroom-async-stage" aria-label="워룸투표 · 비동기컷핀 · Go-Live시어터 · 바이오필릭">
          <StudioVirtualOfficeWarroomAsyncStagePanel />
        </div>
      ) : null}
      {activeTab === "holistic-master-command" ? (
        <div role="tabpanel" id="enterprise-tabpanel-holistic-master-command" aria-label="플로팅PiP · AI소음번역 · 캘린더동기화 · 40대총괄">
          <StudioVirtualOfficeHolisticMasterPanel onBannerChange={setStatusNotice} />
        </div>
      ) : null}
    </section>
  );
}
