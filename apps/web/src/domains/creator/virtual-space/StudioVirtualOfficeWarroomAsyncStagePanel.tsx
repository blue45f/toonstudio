import { useMemo, useState } from "react";
import {
  castWarroomDotVote,
  createDefaultVirtualOfficeWave4State,
  evaluateWave4WarroomAsyncStageCoverage,
  issueWeloVisitorPass,
  postMultiplayerCursorBubble,
  promoteStageHandRaiseToSpeaker,
  revealWarroomPrivateDrafts,
  switchBiophilicHabitatTheme,
  switchGoLiveSpotlightStream,
  toggleThreadHuddleChecklistItem,
  toggleWarroomBringEveryoneToHost,
  triggerThreadHuddleEmojiBurst,
  updateAsyncCutPinDecision,
  WAVE4_VIRTUAL_OFFICE_REA_EVIDENCE_CATALOG,
  type BiophilicHabitatThemeId,
  type FigJamStampKind,
  type StudioVirtualOfficeWave4State,
} from "./studio-virtual-office-warroom-async-stage-model";

export function StudioVirtualOfficeWarroomAsyncStagePanel() {
  const [wave4State, setWave4State] = useState<StudioVirtualOfficeWave4State>(() =>
    createDefaultVirtualOfficeWave4State(),
  );
  const [guestNameDraft, setGuestNameDraft] = useState<string>("외부 사운드 디자이너 (임시 패스)");
  const [cursorBubbleDraft, setCursorBubbleDraft] = useState<string>("/38컷 역광 그라데이션 레이어 오케이!");
  const [selectedStamp, setSelectedStamp] = useState<FigJamStampKind>("fire-composition");
  const [panelNoticeKo, setPanelNoticeKo] = useState<string>(
    "Wave 4 (Welo · Claap · Miro · FigJam · Discord · Kosy · Slack) 7대 플랫폼 역공학 기능이 활성화되었습니다.",
  );

  const wave4Coverage = useMemo(() => evaluateWave4WarroomAsyncStageCoverage(), []);

  return (
    <div
      className="space-y-4 rounded-xl border border-line bg-panel p-4"
      data-testid="virtual-office-wave4-panel"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div>
          <h3 className="text-sm font-semibold">
            Wave 4 — 스토리보드 워룸 · 비동기 컷 비디오 핀 · Go-Live 시어터 · 바이오필릭 네이버후드
          </h3>
          <p className="text-xs text-fg-2">
            누적 {wave4Coverage.totalCumulativePlatformsAcrossAllWaves}대 플랫폼 REA 전수 역공학 내재화 (Wave 4{" "}
            {wave4Coverage.totalWave4Platforms}/{wave4Coverage.totalWave4Platforms} 완료)
          </p>
        </div>
        <span
          role="status"
          aria-live="polite"
          className="rounded border border-accent bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent"
          data-testid="wave4-status-notice"
        >
          {panelNoticeKo}
        </span>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {/* 1. Welo Neighborhood Zones & Visitor Pass */}
        <section className="space-y-2.5 rounded-lg border border-line bg-card p-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold">
              Welo 네이버후드 자동 방음 경계 & 외부 게스트 패스
            </h4>
            <span className="rounded border border-line bg-panel px-2 py-0.5 text-[11px]">
              2인 이상 자동 방음 Lock
            </span>
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              aria-label="외부 방문자 패스 발급 대상 이름"
              value={guestNameDraft}
              onChange={(e) => setGuestNameDraft(e.target.value)}
              className="flex-1 rounded border border-line bg-panel px-2 py-1 text-xs"
            />
            <button
              type="button"
              data-testid="welo-issue-visitor-pass-btn"
              onClick={() => {
                setWave4State((prev) => issueWeloVisitorPass(prev, "nb-bg-3d", guestNameDraft));
                setPanelNoticeKo("3D 배경·라이팅 네이버후드에 외부 방문자 패스를 발급하고 자동 방음 경계를 잠갔습니다.");
              }}
              className="rounded border border-accent bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent"
            >
              3D 네이버후드 패스 발급
            </button>
          </div>
          <ul className="space-y-1.5 text-xs">
            {wave4State.neighborhoods.map((zone) => (
              <li
                key={zone.zoneId}
                data-testid={`welo-zone-${zone.zoneId}`}
                className="flex items-center justify-between rounded border border-line bg-panel p-2"
              >
                <div>
                  <strong>{zone.nameKo}</strong> ({zone.activeMemberCount}명 상주)
                  <p className="text-[11px] text-fg-2">
                    코드: {zone.visitorPassCode} · 게스트: {zone.visitorGuestNameKo ?? "없음"}
                  </p>
                </div>
                <span className="rounded border border-line bg-card px-2 py-0.5 text-[11px] font-medium">
                  {zone.autoBoundaryLocked ? "🔒 자동 방음 잠김" : "🔓 개방됨"}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* 2. Claap Async Video Cut Pin Threads */}
        <section className="space-y-2.5 rounded-lg border border-line bg-card p-3">
          <h4 className="text-xs font-semibold">
            Claap 원고 컷 좌표 비동기 비디오 클립 핀 & 승인 결재
          </h4>
          <ul className="space-y-2 text-xs">
            {wave4State.asyncCutPinThreads.map((thread) => (
              <li
                key={thread.threadId}
                data-testid={`claap-thread-${thread.threadId}`}
                className="space-y-1 rounded border border-line bg-panel p-2"
              >
                <div className="flex items-center justify-between">
                  <strong>
                    {thread.episodeLabel} #{thread.cutNumber}컷 ({thread.xPercent}%, {thread.yPercent}%) —{" "}
                    {thread.authorName} ({thread.durationSec}초)
                  </strong>
                  <span className="rounded border border-line bg-card px-1.5 py-0.5 text-[11px]">
                    {thread.decisionStatus}
                  </span>
                </div>
                <p className="text-[11px] text-fg-2">{thread.aiChapterSummaryKo}</p>
                <div className="flex gap-1.5 pt-1">
                  <button
                    type="button"
                    data-testid={`claap-approve-${thread.threadId}`}
                    onClick={() => {
                      setWave4State((prev) =>
                        updateAsyncCutPinDecision(prev, thread.threadId, "approved-signoff"),
                      );
                      setPanelNoticeKo(`${thread.episodeLabel} #${thread.cutNumber}컷 비동기 비디오 피드백을 최종 승인(Approved)했습니다.`);
                    }}
                    className="rounded border border-accent bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent"
                  >
                    최종 승인(Sign-Off)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWave4State((prev) =>
                        updateAsyncCutPinDecision(prev, thread.threadId, "changes-requested"),
                      );
                      setPanelNoticeKo(`${thread.episodeLabel} #${thread.cutNumber}컷에 재수정 요청(Changes Requested)을 표시했습니다.`);
                    }}
                    className="rounded border border-line bg-card px-2 py-0.5 text-[11px]"
                  >
                    재수정 요청
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* 3. Miro Storyboard War-Room & Dot Voting */}
        <section className="space-y-2.5 rounded-lg border border-line bg-card p-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold">
              Miro 스토리보드 워룸 · 총괄 PD 뷰포트 동기화 & 닷 보팅
            </h4>
            <span className="rounded border border-line bg-panel px-2 py-0.5 text-[11px] tabular-nums">
              잔여 투표권: {wave4State.warroomBoard.remainingDots}점
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              data-testid="miro-bring-everyone-btn"
              onClick={() => {
                setWave4State((prev) => toggleWarroomBringEveryoneToHost(prev, 42));
                setPanelNoticeKo("전원 뷰포트를 총괄 PD의 42컷 콘티 프레임으로 동기화(Bring Everyone to Me)했습니다.");
              }}
              className="rounded border border-accent bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent"
            >
              {wave4State.warroomBoard.bringEveryoneToHost
                ? `뷰포트 동기화 켜짐 (#${wave4State.warroomBoard.hostViewportTargetCut}컷)`
                : "전원 뷰포트 내 위치로 소환"}
            </button>
            <button
              type="button"
              data-testid="miro-reveal-private-btn"
              onClick={() => {
                setWave4State((prev) => revealWarroomPrivateDrafts(prev));
                setPanelNoticeKo("프라이빗 브레인스토밍 포스트잇 초안을 전원에게 일괄 공개했습니다.");
              }}
              className="rounded border border-line bg-panel px-2.5 py-1 text-xs"
            >
              {wave4State.warroomBoard.privateDraftsRevealed
                ? "초안 일괄 공개 완료"
                : "프라이빗 메모 일괄 공개"}
            </button>
          </div>
          <ul className="space-y-1 text-xs">
            {wave4State.warroomBoard.votingOptions.map((option) => (
              <li
                key={option.optionId}
                className="flex items-center justify-between rounded border border-line bg-panel p-2"
              >
                <span>
                  <strong>{option.labelKo}</strong> — 득표:{" "}
                  <span className="tabular-nums font-semibold">{option.votes}표</span>
                </span>
                <button
                  type="button"
                  data-testid={`miro-vote-${option.optionId}`}
                  onClick={() => {
                    setWave4State((prev) => castWarroomDotVote(prev, option.optionId));
                    setPanelNoticeKo(`${option.labelKo}에 닷 보팅(Dot Vote) 1점을 행사했습니다.`);
                  }}
                  className="rounded border border-line bg-card px-2 py-0.5 text-[11px]"
                >
                  +1 닷 투표
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* 4. FigJam Multiplayer Cursor Chat & High-Five Physics */}
        <section className="space-y-2.5 rounded-lg border border-line bg-card p-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold">
              FigJam 멀티플레이어 커서 챗(/) · 스탬프 휠 · 하이파이브 물리
            </h4>
            <span className="rounded border border-line bg-panel px-2 py-0.5 text-[11px]">
              {wave4State.lastHighFiveEffectKo}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <select
              aria-label="커서 스탬프 종류"
              value={selectedStamp}
              onChange={(e) => setSelectedStamp(e.target.value as FigJamStampKind)}
              className="rounded border border-line bg-panel px-2 py-1 text-xs"
            >
              <option value="fire-composition">🔥 구도 극찬</option>
              <option value="approved-star">⭐ 작화 승인</option>
              <option value="fix-anatomy">📐 인체·투시 교정</option>
              <option value="dialogue-polish">💬 대사 호흡 조율</option>
            </select>
            <input
              type="text"
              aria-label="멀티플레이어 커서 챗 메시지"
              value={cursorBubbleDraft}
              onChange={(e) => setCursorBubbleDraft(e.target.value)}
              className="flex-1 rounded border border-line bg-panel px-2 py-1 text-xs"
            />
            <button
              type="button"
              data-testid="figjam-send-cursor-bubble-btn"
              onClick={() => {
                setWave4State((prev) =>
                  postMultiplayerCursorBubble(prev, {
                    bubbleId: `fjam-bubble-${Date.now()}`,
                    authorName: "수석 배경 아티스트",
                    messageKo: cursorBubbleDraft,
                    x: 224,
                    y: 184,
                    stampKind: selectedStamp,
                  }),
                );
                setPanelNoticeKo("캔버스 위에 즉석 커서 챗 버블을 띄우고 인접 작업자와 하이파이브 스파크를 발동했습니다.");
              }}
              className="rounded border border-accent bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent"
            >
              커서 버블 발송 & 하이파이브
            </button>
          </div>
          <ul className="space-y-1 text-xs">
            {wave4State.cursorBubbles.map((bubble) => (
              <li
                key={bubble.bubbleId}
                className="flex items-center justify-between rounded border border-line bg-panel p-2"
              >
                <span>
                  <strong>{bubble.authorName}</strong>: {bubble.messageKo}
                </span>
                <span className="rounded border border-line bg-card px-1.5 py-0.5 text-[10px]">
                  {bubble.stampKind} · ({bubble.x}, {bubble.y})
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* 5. Discord Stage & Go-Live Multi-Stream Theater */}
        <section className="space-y-2.5 rounded-lg border border-line bg-card p-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold">
              Discord Go-Live 4K60 작화 방송 그리드 & 스테이지 손들기 큐
            </h4>
            <span className="rounded border border-line bg-panel px-2 py-0.5 text-[11px]">
              {wave4State.stageTheater.lastStingerPlayedKo}
            </span>
          </div>
          <div className="space-y-1.5 text-xs">
            {wave4State.stageTheater.streams.map((stream) => (
              <div
                key={stream.streamId}
                className="flex items-center justify-between rounded border border-line bg-panel p-2"
              >
                <div>
                  <strong>{stream.streamerName}</strong> — {stream.dccAppLabel} ({stream.resolution})
                  <p className="text-[11px] text-fg-2">시청 크리에이터 {stream.viewersCount}명</p>
                </div>
                <button
                  type="button"
                  data-testid={`discord-spotlight-${stream.streamId}`}
                  onClick={() => {
                    setWave4State((prev) => switchGoLiveSpotlightStream(prev, stream.streamId));
                    setPanelNoticeKo(`${stream.streamerName}의 ${stream.resolution} 스트림을 시어터 메인 스포트라이트로 전환했습니다.`);
                  }}
                  className="rounded border border-line bg-card px-2 py-0.5 text-[11px]"
                >
                  {stream.spotlighted ? "🌟 메인 스포트라이트" : "스포트라이트 전환"}
                </button>
              </div>
            ))}
          </div>
          <div className="rounded border border-line bg-panel p-2 text-xs">
            <p className="font-medium">
              스테이지 발언자: {wave4State.stageTheater.activeSpeakers.join(", ")}
            </p>
            {wave4State.stageTheater.handRaiseQueue.map((req) => (
              <div key={req.memberId} className="mt-1.5 flex items-center justify-between">
                <span>
                  ✋ <strong>{req.memberName}</strong>: {req.topicKo}
                </span>
                <button
                  type="button"
                  data-testid={`discord-promote-${req.memberId}`}
                  onClick={() => {
                    setWave4State((prev) => promoteStageHandRaiseToSpeaker(prev, req.memberId));
                    setPanelNoticeKo(`${req.memberName} 님을 스테이지 공식 발언자로 승격했습니다.`);
                  }}
                  className="rounded border border-accent bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent"
                >
                  발언자 승격
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* 6. Kosy Biophilic Habitat & Slack Thread Huddle Sidecar */}
        <section className="space-y-2.5 rounded-lg border border-line bg-card p-3">
          <h4 className="text-xs font-semibold">
            Kosy 바이오필릭 환경 웰니스 & Slack 스레드 허들 캔버스 사이드카
          </h4>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-fg-2">바이오필릭 테마:</span>
            {(
              [
                ["sunlit-greenhouse", "🌿 햇살 온실 아틀리에"],
                ["rainy-seoul-loft", "🌧️ 비 오는 서울 로프트"],
                ["jeju-coastal-terrace", "🌊 제주 해안 테라스"],
                ["cyberpunk-neon-den", "⚡ 네온 야간 작화실"],
              ] as const
            ).map(([themeId, labelKo]) => (
              <button
                key={themeId}
                type="button"
                data-testid={`kosy-theme-${themeId}`}
                onClick={() => {
                  setWave4State((prev) =>
                    switchBiophilicHabitatTheme(prev, themeId as BiophilicHabitatThemeId),
                  );
                  setPanelNoticeKo(`스튜디오 바이오필릭 환경을 '${labelKo}' 테마로 전환했습니다.`);
                }}
                className={`rounded border px-2 py-0.5 text-[11px] ${
                  wave4State.biophilicWellness.activeThemeId === themeId
                    ? "border-accent bg-accent-soft font-semibold text-accent"
                    : "border-line bg-panel"
                }`}
              >
                {labelKo}
              </button>
            ))}
          </div>
          <div className="rounded border border-line bg-panel p-2 text-xs">
            <div className="flex items-center justify-between">
              <strong>{wave4State.threadHuddleSidecar.threadTitleKo}</strong>
              <span className="text-[11px]">
                이모지 버스트: {wave4State.threadHuddleSidecar.emojiBurstHistory.join(" ")}
              </span>
            </div>
            <ul className="mt-1.5 space-y-1">
              {wave4State.threadHuddleSidecar.checklistItems.map((item) => (
                <li key={item.itemId} className="flex items-center justify-between">
                  <span>
                    {item.completed ? "✅" : "⬜"} {item.textKo}
                  </span>
                  <button
                    type="button"
                    data-testid={`slack-check-${item.itemId}`}
                    onClick={() => {
                      setWave4State((prev) => toggleThreadHuddleChecklistItem(prev, item.itemId));
                      setPanelNoticeKo(`스레드 허들 사이드카 체크리스트(${item.textKo}) 상태를 갱신했습니다.`);
                    }}
                    className="rounded border border-line bg-card px-2 py-0.5 text-[11px]"
                  >
                    {item.completed ? "완료 취소" : "체크 완료"}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-1.5">
              {["🚀", "🎉", "💡", "👏"].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  data-testid={`slack-burst-${emoji}`}
                  onClick={() => {
                    setWave4State((prev) => triggerThreadHuddleEmojiBurst(prev, emoji));
                    setPanelNoticeKo(`스레드 허들에 ${emoji} 이모지 파운틴 리액션을 발사했습니다.`);
                  }}
                  className="rounded border border-line bg-card px-2 py-0.5 text-xs"
                >
                  {emoji} 버스트
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Wave 4 REA Evidence Summary Table */}
      <section className="rounded-lg border border-line bg-card p-3">
        <h4 className="mb-2 text-xs font-semibold">
          Wave 4 REA 정적·동적 역공학 증거 체인 (총 35대 플랫폼 전수 검증)
        </h4>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {WAVE4_VIRTUAL_OFFICE_REA_EVIDENCE_CATALOG.map((entry) => (
            <article
              key={entry.platformId}
              className="rounded border border-line bg-panel p-2 text-[11px]"
            >
              <div className="flex items-center justify-between">
                <strong>{entry.platformName}</strong>
                <span className="tabular-nums text-fg-2">
                  AST {entry.visitedAstNodes.toLocaleString()}
                </span>
              </div>
              <p className="mt-1 truncate text-[10px] text-fg-2" title={entry.astAnalysisId}>
                AST: {entry.astAnalysisId.slice(0, 18)}…
              </p>
              <p className="mt-1 text-fg-2">{entry.internalizedFeaturesKo[0]}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
