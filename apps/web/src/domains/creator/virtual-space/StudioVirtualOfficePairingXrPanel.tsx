import { useMemo, useState } from "react";
import {
  addStudioScreenInkStroke,
  buildStudioPairingXrFloorSummary,
  createInitialStudioPairingXrFloorState,
  equipStudioMemberStatusHat,
  handoffRemoteAppControlDriver,
  joinFloorShadowingSession,
  postStudioKudosShoutout,
  pruneExpiredFadingInkStrokes,
  reactToStudioKudosShoutout,
  resolveReceptionLobbyGuest,
  respondToTeammateSummon,
  sendDirectorWhisperDirective,
  toggleStudioRoomDoorLock,
  update3dAssetPedestalInspection,
  type StudioAuditoriumCameraPreset,
  type StudioAvatarStatusHatId,
} from "./studio-virtual-office-pairing-xr-floor-model";

export function StudioVirtualOfficePairingXrPanel() {
  const [floorState, setFloorState] = useState(() =>
    createInitialStudioPairingXrFloorState(),
  );
  const [kudosDraft, setKudosDraft] = useState("");
  const [inkNoteDraft, setInkNoteDraft] = useState("");
  const [whisperDraft, setWhisperDraft] = useState("");
  const [spatialPinDraft, setSpatialPinDraft] = useState("");

  const summary = useMemo(
    () => buildStudioPairingXrFloorSummary(floorState),
    [floorState],
  );

  const primaryCoaching = floorState.floorCoachingSessions[0];
  const primaryPedestal = floorState.assetPedestals[0];

  return (
    <div
      className="space-y-4 rounded-xl border border-line bg-panel p-4 text-fg"
      data-testid="studio-virtual-office-pairing-xr-panel"
    >
      {/* Top KPI Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div>
          <h4 className="text-sm font-semibold text-accent">
            Wave 2 · 원격 페어링 · 상태 모자 · 리셉션 매트릭스 · 3D XR 페데스탈
          </h4>
          <p className="text-xs text-fg-2">
            Teemyco · Sococo · Tuple · Pop · Nooks · Virbela · Frame VR · Arthur
            전기능 클린룸 내재화 워크벤치
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span
            className="rounded border border-line bg-card px-2.5 py-1 text-fg"
            data-testid="wave2-kpi-hats"
          >
            착용 상태모자 {summary.activeHatsCount}개 (방해금지{" "}
            {summary.interruptProtectedMemberCount}명)
          </span>
          <span
            className="rounded border border-line bg-card px-2.5 py-1 text-fg"
            data-testid="wave2-kpi-kudos"
          >
            칭찬 Kudos {summary.totalKudosCount}건 (공감{" "}
            {summary.totalKudosReactions})
          </span>
          <span
            className="rounded border border-line bg-card px-2.5 py-1 text-fg"
            data-testid="wave2-kpi-ink"
          >
            화면 잉크 레이저 {summary.activeFadingInkCount} / 레드라인{" "}
            {summary.activePersistentRedlineCount}
          </span>
          <span
            className="rounded border border-line bg-card px-2.5 py-1 text-fg"
            data-testid="wave2-kpi-pedestal"
          >
            3D 페데스탈 공간핀 {summary.totalPedestalSpatialPins}개
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 1. Teemyco Status Hats & Kudos Shoutout Wall */}
        <section className="space-y-3 rounded-lg border border-line bg-card p-3">
          <div className="flex items-center justify-between">
            <h5 className="text-xs font-semibold uppercase tracking-wider text-accent">
              1. 아바타 상태 모자(Status Hats) & 마감 칭찬 Kudos 월 (Teemyco)
            </h5>
            <span className="text-[11px] text-fg-2">
              모자 착용 시 집중 상태 자동 브로드캐스트
            </span>
          </div>

          <div className="space-y-2">
            {floorState.memberHats.map((member) => (
              <div
                key={member.memberId}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-panel p-2 text-xs"
              >
                <div>
                  <span className="font-medium text-fg">
                    {member.displayName}
                  </span>{" "}
                  <span className="text-fg-2">({member.roleLabel})</span>
                  <p className="text-[11px] text-fg-2">
                    {member.customStatusNote}
                  </p>
                </div>
                <select
                  aria-label={`${member.displayName} 상태 모자 선택`}
                  data-testid={`select-status-hat-${member.memberId}`}
                  value={member.equippedHatId}
                  onChange={(e) =>
                    setFloorState((prev) =>
                      equipStudioMemberStatusHat(
                        prev,
                        member.memberId,
                        e.target.value as StudioAvatarStatusHatId,
                      ),
                    )
                  }
                  className="rounded border border-line bg-raised px-2 py-1 text-xs text-fg"
                >
                  {floorState.hatCatalog.map((hat) => (
                    <option key={hat.hatId} value={hat.hatId}>
                      [{hat.badgeText}] {hat.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t border-line pt-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={kudosDraft}
                onChange={(e) => setKudosDraft(e.target.value)}
                placeholder="마감 완주 동료에게 칭찬 샤우트아웃 메시지 입력..."
                data-testid="kudos-shoutout-input"
                className="flex-1 rounded border border-line bg-panel px-2.5 py-1 text-xs text-fg"
              />
              <button
                type="button"
                data-testid="post-kudos-shoutout-btn"
                onClick={() => {
                  const message =
                    kudosDraft.trim() ||
                    "EP.42 야간 식자·배경 마감 사수 최고였습니다!";
                  setFloorState((prev) =>
                    postStudioKudosShoutout(prev, {
                      fromMemberId: "mem-pd-review",
                      fromDisplayName: "이피디 총괄PD",
                      toMemberId: "mem-bg-3d",
                      toDisplayName: "박배경 3D디렉터",
                      episodeCode: "EP.42",
                      category: "deadline-hero",
                      message,
                    }),
                  );
                  setKudosDraft("");
                }}
                className="rounded border border-line bg-accent px-3 py-1 text-xs font-medium text-fg"
              >
                Kudos 발송
              </button>
            </div>
            <div className="space-y-1.5">
              {floorState.kudosWall.slice(0, 3).map((card) => (
                <div
                  key={card.kudosId}
                  className="flex items-center justify-between gap-2 rounded border border-line bg-panel px-2.5 py-1.5 text-xs"
                >
                  <div className="truncate">
                    <span className="font-semibold text-accent">
                      [{card.episodeCode}] {card.fromDisplayName} →{" "}
                      {card.toDisplayName}:
                    </span>{" "}
                    <span className="text-fg">{card.message}</span>
                  </div>
                  <button
                    type="button"
                    data-testid={`react-kudos-${card.kudosId}`}
                    onClick={() =>
                      setFloorState((prev) =>
                        reactToStudioKudosShoutout(prev, card.kudosId),
                      )
                    }
                    className="shrink-0 rounded border border-line bg-raised px-2 py-0.5 text-[11px] text-fg"
                  >
                    응원 +{card.reactionsCount}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 2. Sococo Floorplan Media Matrix, Get Teammate Summon & Guest Reception */}
        <section className="space-y-3 rounded-lg border border-line bg-card p-3">
          <div className="flex items-center justify-between">
            <h5 className="text-xs font-semibold uppercase tracking-wider text-good">
              2. 플로어플랜 미디어 매트릭스 · 동료 호출 · 게스트 리셉션 (Sococo)
            </h5>
            <span className="text-[11px] text-fg-2">
              잠금 룸 {summary.lockedRoomCount}개 · 대기 게스트{" "}
              {summary.waitingReceptionGuestCount}명
            </span>
          </div>

          <div className="space-y-1.5">
            {floorState.floorplanMediaMatrix.map((room) => (
              <div
                key={room.roomId}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-panel px-2.5 py-1.5 text-xs"
              >
                <div>
                  <span className="font-medium text-fg">{room.roomName}</span>{" "}
                  <span className="text-[11px] text-fg-2">
                    (인원 {room.occupantMemberIds.length}/{room.capacity} ·
                    마이크 {room.activeMicCount} · 캠 {room.activeCameraCount} ·
                    화면스트림 {room.activeScreenStreams.length})
                  </span>
                </div>
                <button
                  type="button"
                  data-testid={`toggle-room-lock-${room.roomId}`}
                  onClick={() =>
                    setFloorState((prev) =>
                      toggleStudioRoomDoorLock(prev, room.roomId),
                    )
                  }
                  className="rounded border border-line bg-raised px-2 py-0.5 text-[11px] text-fg"
                >
                  {room.doorLocked ? "잠금 해제" : "룸 잠금"}
                </button>
              </div>
            ))}
          </div>

          {/* Pending Get-Teammate Summons & Reception Lobby Queue */}
          <div className="grid grid-cols-1 gap-2 border-t border-line pt-2 sm:grid-cols-2">
            <div className="space-y-1 rounded border border-line bg-panel p-2 text-xs">
              <div className="font-medium text-good">
                Get Teammate 룸 호출 ({summary.pendingSummonCount}건 대기)
              </div>
              {floorState.summonRequests.map((req) => (
                <div key={req.summonId} className="space-y-1 text-[11px]">
                  <p className="text-fg-2">
                    {req.toDisplayName} → {req.targetRoomName} ({req.status})
                  </p>
                  {req.status === "pending" && (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        data-testid={`accept-summon-${req.summonId}`}
                        onClick={() =>
                          setFloorState((prev) =>
                            respondToTeammateSummon(
                              prev,
                              req.summonId,
                              "accepted",
                            ),
                          )
                        }
                        className="rounded border border-line bg-good px-2 py-0.5 text-fg"
                      >
                        즉시 합류 수락
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setFloorState((prev) =>
                            respondToTeammateSummon(
                              prev,
                              req.summonId,
                              "declined",
                            ),
                          )
                        }
                        className="rounded border border-line bg-raised px-2 py-0.5 text-fg-2"
                      >
                        거절
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-1 rounded border border-line bg-panel p-2 text-xs">
              <div className="font-medium text-warn">
                외부 게스트 리셉션 대기열 ({summary.waitingReceptionGuestCount}
                명)
              </div>
              {floorState.receptionGuests.map((guest) => (
                <div key={guest.guestId} className="space-y-1 text-[11px]">
                  <p className="text-fg-2">
                    {guest.guestName} ({guest.organization}) · 상태:{" "}
                    {guest.status}
                  </p>
                  {guest.status === "waiting-in-lobby" && (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        data-testid={`admit-guest-${guest.guestId}`}
                        onClick={() =>
                          setFloorState((prev) =>
                            resolveReceptionLobbyGuest(
                              prev,
                              guest.guestId,
                              "admitted",
                            ),
                          )
                        }
                        className="rounded border border-line bg-warn px-2 py-0.5 text-fg"
                      >
                        오디토리움 입장 승인
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 3. Tuple & Pop 5K Pair Drawing, Ephemeral Fading Ink & Remote Control Handoff */}
        <section className="space-y-3 rounded-lg border border-line bg-card p-3">
          <div className="flex items-center justify-between">
            <h5 className="text-xs font-semibold uppercase tracking-wider text-warn">
              3. 5K 페어 드로잉 · 자동소멸 레이저 잉크 · 제어권 이양 (Tuple ·
              Pop)
            </h5>
            <span className="text-[11px] text-fg-2">
              공동 제어 활성 세션 {summary.sharedControlActiveSessionCount}개
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={inkNoteDraft}
              onChange={(e) => setInkNoteDraft(e.target.value)}
              placeholder="컷 번호·펜터치 주석 입력 (예: EP42-CUT29 눈동자 하이라이트)..."
              data-testid="screen-ink-note-input"
              className="flex-1 rounded border border-line bg-panel px-2.5 py-1 text-xs text-fg"
            />
            <button
              type="button"
              data-testid="add-fading-laser-ink-btn"
              onClick={() => {
                setFloorState((prev) =>
                  addStudioScreenInkStroke(prev, {
                    authorMemberId: "mem-lead-line",
                    authorDisplayName: "김선화 메인작가",
                    mode: "fading-laser-ink",
                    targetCutCode: "EP42-CUT29",
                    noteLabel:
                      inkNoteDraft.trim() || "3.5초 자동소멸 레이저 포인터",
                  }),
                );
                setInkNoteDraft("");
              }}
              className="rounded border border-line bg-cool px-2.5 py-1 text-xs font-medium text-fg"
            >
              + 레이저 잉크(3.5s 소멸)
            </button>
            <button
              type="button"
              data-testid="add-persistent-redline-btn"
              onClick={() => {
                setFloorState((prev) =>
                  addStudioScreenInkStroke(prev, {
                    authorMemberId: "mem-pd-review",
                    authorDisplayName: "이피디 총괄PD",
                    mode: "persistent-redline-ink",
                    targetCutCode: "EP42-CUT29",
                    noteLabel:
                      inkNoteDraft.trim() || "영구 보존 데생 레드라인 주석",
                  }),
                );
                setInkNoteDraft("");
              }}
              className="rounded border border-line bg-bad px-2.5 py-1 text-xs font-medium text-fg"
            >
              + 영구 레드라인
            </button>
            <button
              type="button"
              data-testid="prune-fading-ink-btn"
              onClick={() =>
                setFloorState((prev) =>
                  pruneExpiredFadingInkStrokes(prev, Date.now() + 10000),
                )
              }
              className="rounded border border-line bg-raised px-2 py-1 text-xs text-fg"
            >
              만료 레이저 정리
            </button>
          </div>

          <div className="space-y-1.5">
            {floorState.remoteControlSessions.map((session) => (
              <div
                key={session.sessionId}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-panel px-2.5 py-1.5 text-xs"
              >
                <div>
                  <span className="font-semibold text-fg">
                    {session.targetAppName}
                  </span>{" "}
                  <span className="text-fg-2">
                    ({session.resolutionLabel} · {session.latencyMs}ms · 제어자:{" "}
                    {session.activeControllerMemberId})
                  </span>
                </div>
                <button
                  type="button"
                  data-testid={`handoff-control-${session.sessionId}`}
                  onClick={() =>
                    setFloorState((prev) =>
                      handoffRemoteAppControlDriver(
                        prev,
                        session.sessionId,
                        session.activeControllerMemberId ===
                          session.hostMemberId
                          ? "mem-pd-review"
                          : session.hostMemberId,
                      ),
                    )
                  }
                  className="rounded border border-line bg-raised px-2 py-0.5 text-[11px] text-fg"
                >
                  마우스·펜 제어권 교대
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* 4. Nooks AI Floor Coaching & Virbela/FrameVR/Arthur 3D Asset Pedestal */}
        <section className="space-y-3 rounded-lg border border-line bg-card p-3">
          <div className="flex items-center justify-between">
            <h5 className="text-xs font-semibold uppercase tracking-wider text-cool">
              4. AI 플로어 귓속말 코칭 & 3D 에셋 페데스탈 (Nooks · FrameVR ·
              Arthur)
            </h5>
            <span className="text-[11px] text-fg-2">
              섀도잉 참관 {summary.activeShadowingTraineeCount}명
            </span>
          </div>

          {primaryCoaching && (
            <div className="space-y-2 rounded border border-line bg-panel p-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-fg">
                  {primaryCoaching.roomName} · 발표:{" "}
                  {primaryCoaching.leadDisplayName}
                </span>
                <button
                  type="button"
                  data-testid="join-shadowing-trainee-btn"
                  onClick={() =>
                    setFloorState((prev) =>
                      joinFloorShadowingSession(
                        prev,
                        primaryCoaching.coachingId,
                        `mem-trainee-${summary.activeShadowingTraineeCount + 1}`,
                      ),
                    )
                  }
                  className="rounded border border-line bg-raised px-2 py-0.5 text-[11px] text-fg"
                >
                  + 신입 어시 섀도잉 참관
                </button>
              </div>
              <p
                className="text-[11px] text-warn"
                data-testid="coaching-whisper-banner"
              >
                {primaryCoaching.lastWhisperDirective}
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={whisperDraft}
                  onChange={(e) => setWhisperDraft(e.target.value)}
                  placeholder="발표 작가에게만 들리는 PD 귓속말 코칭 입력..."
                  data-testid="whisper-directive-input"
                  className="flex-1 rounded border border-line bg-card px-2 py-1 text-xs text-fg"
                />
                <button
                  type="button"
                  data-testid="send-whisper-directive-btn"
                  onClick={() => {
                    setFloorState((prev) =>
                      sendDirectorWhisperDirective(
                        prev,
                        primaryCoaching.coachingId,
                        whisperDraft.trim() ||
                          "PD 귓속말: 42화 성채 3D 역광 포인트를 강조해 주세요.",
                      ),
                    );
                    setWhisperDraft("");
                  }}
                  className="rounded border border-line bg-cool px-2.5 py-1 text-xs font-medium text-fg"
                >
                  귓속말 전송
                </button>
              </div>
            </div>
          )}

          {primaryPedestal && (
            <div className="space-y-2 rounded border border-line bg-panel p-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-fg">
                    {primaryPedestal.title}
                  </span>{" "}
                  <span
                    className="text-[11px] text-cool"
                    data-testid="pedestal-angle-readout"
                  >
                    ({primaryPedestal.assetFormat.toUpperCase()} · 회전각{" "}
                    {primaryPedestal.turntableAngleDeg}° · 카메라:{" "}
                    {primaryPedestal.selectedAuditoriumCameraPreset})
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    data-testid="rotate-pedestal-45-btn"
                    onClick={() =>
                      setFloorState((prev) =>
                        update3dAssetPedestalInspection(
                          prev,
                          primaryPedestal.pedestalId,
                          {
                            turntableAngleDeg:
                              primaryPedestal.turntableAngleDeg + 45,
                          },
                        ),
                      )
                    }
                    className="rounded border border-line bg-raised px-2 py-0.5 text-[11px] text-fg"
                  >
                    턴테이블 +45°
                  </button>
                  <select
                    aria-label="오디토리움 카메라 프리셋"
                    data-testid="select-auditorium-camera-preset"
                    value={primaryPedestal.selectedAuditoriumCameraPreset}
                    onChange={(e) =>
                      setFloorState((prev) =>
                        update3dAssetPedestalInspection(
                          prev,
                          primaryPedestal.pedestalId,
                          {
                            selectedAuditoriumCameraPreset: e.target
                              .value as StudioAuditoriumCameraPreset,
                          },
                        ),
                      )
                    }
                    className="rounded border border-line bg-raised px-1.5 py-0.5 text-[11px] text-fg"
                  >
                    <option value="stage-wide">Stage Wide</option>
                    <option value="presenter-closeup">Presenter Closeup</option>
                    <option value="pedestal-macro-orbit">
                      Pedestal Macro Orbit
                    </option>
                    <option value="audience-qna-split">
                      Audience Q&A Split
                    </option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={spatialPinDraft}
                  onChange={(e) => setSpatialPinDraft(e.target.value)}
                  placeholder="3D 페데스탈 공간 핀 메모 추가..."
                  data-testid="pedestal-spatial-pin-input"
                  className="flex-1 rounded border border-line bg-card px-2 py-1 text-xs text-fg"
                />
                <button
                  type="button"
                  data-testid="add-pedestal-spatial-pin-btn"
                  onClick={() => {
                    setFloorState((prev) =>
                      update3dAssetPedestalInspection(
                        prev,
                        primaryPedestal.pedestalId,
                        {
                          appendSpatialPinNote:
                            spatialPinDraft.trim() ||
                            "제단 우측 기둥 그림자 투시선 고정",
                        },
                      ),
                    );
                    setSpatialPinDraft("");
                  }}
                  className="rounded border border-line bg-good px-2.5 py-1 text-xs font-medium text-fg"
                >
                  + 공간 핀 고정
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
