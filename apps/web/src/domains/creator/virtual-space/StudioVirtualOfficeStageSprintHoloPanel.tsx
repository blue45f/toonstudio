import { useMemo, useState } from "react";
import {
  addFocusSprintIntention,
  advanceFocusSprintPhase,
  buildStudioStageSprintHoloSummary,
  createInitialStudioStageSprintHoloState,
  promoteGreenRoomPresenterToMainStage,
  recordNewSpatialGhostClip,
  rotateSpeedCritiqueTables,
  setSpatialGhostPlaybackState,
  toggleFocusSprintIntentionCompleted,
  toggleGreenRoomDeviceCheck,
  traverseSpatialPortal,
  updateAmbientSoundscapeZone,
  upvoteStageQnaItem,
  type StudioAmbientSoundscapePreset,
} from "./studio-virtual-office-stage-sprint-holo-model";

export function StudioVirtualOfficeStageSprintHoloPanel() {
  const [holoState, setHoloState] = useState(() =>
    createInitialStudioStageSprintHoloState(),
  );
  const [ghostTitleDraft, setGhostTitleDraft] = useState("");
  const [sprintGoalDraft, setSprintGoalDraft] = useState("");

  const summary = useMemo(
    () => buildStudioStageSprintHoloSummary(holoState),
    [holoState],
  );

  const primarySprint = holoState.focusSprints[0];

  return (
    <div
      className="space-y-4 rounded-xl border border-line bg-panel p-4 text-fg"
      data-testid="studio-virtual-office-stage-sprint-holo-panel"
    >
      {/* Top KPI Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div>
          <h4 className="text-sm font-semibold text-accent">
            Wave 3 · 그린룸 백스테이지 · 스피드 품평 로테이션 · 3D 홀로그램 리플레이 · 포모도로 스프린트
          </h4>
          <p className="text-xs text-fg-2">
            Remo · Spatial.io · ENGAGE XR · Airmeet · Bramble · Focusmate · Flow Club
            전기능 클린룸 내재화 워크벤치
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span
            className="rounded border border-line bg-card px-2.5 py-1 text-fg"
            data-testid="wave3-kpi-stage"
          >
            스테이지:{" "}
            {summary.isMainStageLive ? "ON-AIR 본무대 송출중" : "그린룸 대기"}
          </span>
          <span
            className="rounded border border-line bg-card px-2.5 py-1 text-fg"
            data-testid="wave3-kpi-rotation"
          >
            품평 테이블 로테이션 {summary.critiqueRotationRound}라운드 (Q&A 추천{" "}
            {summary.totalQnaUpvotes})
          </span>
          <span
            className="rounded border border-line bg-card px-2.5 py-1 text-fg"
            data-testid="wave3-kpi-hologram"
          >
            3D 홀로그램 재생 {summary.activeHologramRecordingCount}개 · 포털 이동{" "}
            {summary.totalPortalTravellersCount}명
          </span>
          <span
            className="rounded border border-line bg-card px-2.5 py-1 text-fg"
            data-testid="wave3-kpi-sprint"
          >
            스프린트 목표 달성 {summary.completedSprintGoalsCount}/
            {summary.totalSprintGoalsCount}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 1. Airmeet Backstage Green Room & Remo Speed-Critique Table Rotation */}
        <section className="space-y-3 rounded-lg border border-line bg-card p-3">
          <div className="flex items-center justify-between">
            <h5 className="text-xs font-semibold uppercase tracking-wider text-accent">
              1. 그린룸 백스테이지 & 스피드 품평 테이블 로테이션 (Airmeet · Remo)
            </h5>
            <span className="text-[11px] text-fg-2">
              손들기 대기 {holoState.greenRoom.handRaiseQueueCount}명
            </span>
          </div>

          <div className="space-y-2 rounded border border-line bg-panel p-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-fg">
                  {holoState.greenRoom.presenterDisplayName}
                </span>{" "}
                <span className="text-fg-2">
                  ({holoState.greenRoom.roleTitle})
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  data-testid="toggle-greenroom-deck-btn"
                  onClick={() =>
                    setHoloState((prev) =>
                      toggleGreenRoomDeviceCheck(prev, "deck"),
                    )
                  }
                  className="rounded border border-line bg-raised px-2 py-0.5 text-[11px] text-fg"
                >
                  콘티덱 동기화:{" "}
                  {holoState.greenRoom.deckSynced ? "준비완료" : "미완료"}
                </button>
                <button
                  type="button"
                  data-testid="promote-main-stage-btn"
                  onClick={() =>
                    setHoloState((prev) =>
                      promoteGreenRoomPresenterToMainStage(prev),
                    )
                  }
                  className="rounded border border-line bg-good px-2.5 py-0.5 text-[11px] font-medium text-fg"
                >
                  본무대 라이브 전환
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-fg">
                Remo 컷별 스피드 품평 테이블 ({summary.critiqueRotationRound}
                라운드)
              </span>
              <button
                type="button"
                data-testid="rotate-critique-tables-btn"
                onClick={() =>
                  setHoloState((prev) => rotateSpeedCritiqueTables(prev))
                }
                className="rounded border border-line bg-accent px-2.5 py-0.5 text-[11px] font-medium text-fg"
              >
                테이블 전원 로테이션
              </button>
            </div>
            {holoState.critiqueTables.map((table) => (
              <div
                key={table.tableId}
                className="flex items-center justify-between rounded border border-line bg-panel px-2.5 py-1.5 text-xs"
              >
                <span>
                  <strong>{table.tableName}</strong> ({table.episodeCutRange})
                </span>
                <span className="text-fg-2">
                  착석: {table.seatedMemberNames.join(", ")}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-1 border-t border-line pt-2">
            {holoState.stageQnaQueue.map((qna) => (
              <div
                key={qna.qnaId}
                className="flex items-center justify-between gap-2 rounded border border-line bg-panel px-2.5 py-1 text-xs"
              >
                <span className="truncate">
                  <strong>{qna.authorName}:</strong> {qna.questionText}
                </span>
                <button
                  type="button"
                  data-testid={`upvote-qna-${qna.qnaId}`}
                  onClick={() =>
                    setHoloState((prev) => upvoteStageQnaItem(prev, qna.qnaId))
                  }
                  className="shrink-0 rounded border border-line bg-raised px-2 py-0.5 text-[11px] text-fg"
                >
                  추천 +{qna.upvotes}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* 2. ENGAGE XR 3D Ghost Avatar Replay & Spatial.io Portal Teleporters */}
        <section className="space-y-3 rounded-lg border border-line bg-card p-3">
          <div className="flex items-center justify-between">
            <h5 className="text-xs font-semibold uppercase tracking-wider text-cool">
              2. 3D 고스트 아바타 홀로그램 녹화 & 월드 포털 (ENGAGE XR · Spatial.io)
            </h5>
            <span className="text-[11px] text-fg-2">
              공간 녹화본 {holoState.ghostRecordings.length}건
            </span>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={ghostTitleDraft}
              onChange={(e) => setGhostTitleDraft(e.target.value)}
              placeholder="신규 3D 고스트 아바타 공간 동선 녹화 제목..."
              data-testid="ghost-recording-title-input"
              className="flex-1 rounded border border-line bg-panel px-2.5 py-1 text-xs text-fg"
            />
            <button
              type="button"
              data-testid="record-ghost-clip-btn"
              onClick={() => {
                setHoloState((prev) =>
                  recordNewSpatialGhostClip(
                    prev,
                    ghostTitleDraft.trim() ||
                      "EP.42 마법진 폭발 카메라 블로킹 홀로그램",
                    "XR 품평회 오디토리움",
                    140,
                  ),
                );
                setGhostTitleDraft("");
              }}
              className="rounded border border-line bg-cool px-2.5 py-1 text-xs font-medium text-fg"
            >
              + 3D 홀로그램 녹화
            </button>
          </div>

          <div className="space-y-1.5">
            {holoState.ghostRecordings.map((rec) => (
              <div
                key={rec.recordingId}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-panel px-2.5 py-1.5 text-xs"
              >
                <div>
                  <span className="font-medium text-fg">{rec.title}</span>{" "}
                  <span className="text-[11px] text-fg-2">
                    ({rec.recordedRoomName} · {rec.playbackState} ·{" "}
                    {rec.currentPlayheadSec}s/{rec.durationSec}s)
                  </span>
                </div>
                <button
                  type="button"
                  data-testid={`toggle-ghost-play-${rec.recordingId}`}
                  onClick={() =>
                    setHoloState((prev) =>
                      setSpatialGhostPlaybackState(
                        prev,
                        rec.recordingId,
                        rec.playbackState === "playing-hologram"
                          ? "paused"
                          : "playing-hologram",
                        rec.currentPlayheadSec + 15,
                      ),
                    )
                  }
                  className="rounded border border-line bg-raised px-2 py-0.5 text-[11px] text-fg"
                >
                  {rec.playbackState === "playing-hologram"
                    ? "홀로그램 일시정지"
                    : "홀로그램 재생"}
                </button>
              </div>
            ))}
          </div>

          <div className="space-y-1.5 border-t border-line pt-2">
            {holoState.spatialPortals.map((portal) => (
              <div
                key={portal.portalId}
                className="flex items-center justify-between gap-2 rounded border border-line bg-panel px-2.5 py-1.5 text-xs"
              >
                <span>
                  <strong>[{portal.targetEpisodeCode}] {portal.label}</strong>{" "}
                  <span className="text-fg-2">
                    ({portal.fromZoneName} → {portal.targetWorldName} · 이동{" "}
                    {portal.activeTravellersCount}명)
                  </span>
                </span>
                <button
                  type="button"
                  data-testid={`traverse-portal-${portal.portalId}`}
                  onClick={() =>
                    setHoloState((prev) =>
                      traverseSpatialPortal(prev, portal.portalId),
                    )
                  }
                  className="rounded border border-line bg-good px-2 py-0.5 text-[11px] text-fg"
                >
                  포털 워프
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* 3. Focusmate & Flow Club Accountability Focus Sprint Pairing */}
        <section className="space-y-3 rounded-lg border border-line bg-card p-3">
          <div className="flex items-center justify-between">
            <h5 className="text-xs font-semibold uppercase tracking-wider text-good">
              3. 호스트 플레이북 & 마감 딥워크 스프린트 (Focusmate · Flow Club)
            </h5>
            {primarySprint && (
              <span
                className="text-[11px] text-accent"
                data-testid="sprint-phase-badge"
              >
                단계: {primarySprint.currentPhase} ({primarySprint.durationMinutes}
                분)
              </span>
            )}
          </div>

          {primarySprint && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-panel p-2 text-xs">
                <div>
                  <span className="font-semibold text-fg">
                    {primarySprint.sprintTitle}
                  </span>
                  <p className="text-[11px] text-fg-2">
                    동기화 BGM: {primarySprint.lofiTrackTitle}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="advance-sprint-phase-btn"
                  onClick={() =>
                    setHoloState((prev) =>
                      advanceFocusSprintPhase(prev, primarySprint.sprintId),
                    )
                  }
                  className="rounded border border-line bg-accent px-2.5 py-1 text-xs font-medium text-fg"
                >
                  다음 스프린트 단계 전환
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={sprintGoalDraft}
                  onChange={(e) => setSprintGoalDraft(e.target.value)}
                  placeholder="이번 50분 스프린트 작화 목표 체크인 입력..."
                  data-testid="sprint-goal-input"
                  className="flex-1 rounded border border-line bg-panel px-2.5 py-1 text-xs text-fg"
                />
                <button
                  type="button"
                  data-testid="add-sprint-goal-btn"
                  onClick={() => {
                    setHoloState((prev) =>
                      addFocusSprintIntention(
                        prev,
                        primarySprint.sprintId,
                        "정어시 배경팀",
                        sprintGoalDraft.trim() ||
                          "EP.42 성채 복도 횃불 광원 후보정 완료",
                      ),
                    );
                    setSprintGoalDraft("");
                  }}
                  className="rounded border border-line bg-good px-2.5 py-1 text-xs font-medium text-fg"
                >
                  + 목표 등록
                </button>
              </div>

              <div className="space-y-1">
                {primarySprint.participantIntentions.map((item) => (
                  <div
                    key={item.memberId}
                    className="flex items-center justify-between gap-2 rounded border border-line bg-panel px-2.5 py-1.5 text-xs"
                  >
                    <span>
                      <strong>{item.displayName}:</strong> {item.goalText}
                    </span>
                    <button
                      type="button"
                      data-testid={`toggle-sprint-goal-${item.memberId}`}
                      onClick={() =>
                        setHoloState((prev) =>
                          toggleFocusSprintIntentionCompleted(
                            prev,
                            primarySprint.sprintId,
                            item.memberId,
                          ),
                        )
                      }
                      className="rounded border border-line bg-raised px-2 py-0.5 text-[11px] text-fg"
                    >
                      {item.completed ? "달성 완료" : "진행중"}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* 4. Bramble Fluid Ambient Soundscape Zones */}
        <section className="space-y-3 rounded-lg border border-line bg-card p-3">
          <div className="flex items-center justify-between">
            <h5 className="text-xs font-semibold uppercase tracking-wider text-warn">
              4. 유체 공간 앰비언트 사운드스케이프 존 (Bramble)
            </h5>
            <span className="text-[11px] text-fg-2">
              보이스 더킹 활성 {summary.voiceDuckingZoneCount}개 존
            </span>
          </div>

          <div className="space-y-2">
            {holoState.soundscapeZones.map((zone) => (
              <div
                key={zone.zoneId}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-panel p-2.5 text-xs"
              >
                <div>
                  <span className="font-semibold text-fg">{zone.zoneName}</span>{" "}
                  <span className="text-fg-2">
                    (볼륨 {zone.ambientVolumePercent}% · 더킹:{" "}
                    {zone.voiceDuckingEnabled ? "ON" : "OFF"})
                  </span>
                </div>
                <select
                  aria-label={`${zone.zoneName} 사운드스케이프 프리셋`}
                  data-testid={`select-soundscape-${zone.zoneId}`}
                  value={zone.soundscapePreset}
                  onChange={(e) =>
                    setHoloState((prev) =>
                      updateAmbientSoundscapeZone(
                        prev,
                        zone.zoneId,
                        e.target.value as StudioAmbientSoundscapePreset,
                      ),
                    )
                  }
                  className="rounded border border-line bg-raised px-2 py-1 text-xs text-fg"
                >
                  <option value="lofi-atelier">Lo-Fi Atelier</option>
                  <option value="rainy-rooftop">Rainy Rooftop</option>
                  <option value="cafe-murmur">Cafe Murmur</option>
                  <option value="cathedral-reverb">Cathedral Reverb</option>
                </select>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
