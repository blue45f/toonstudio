import { useMemo, useState } from "react";

import {
  DEFAULT_CRITIQUE_SESSION_INPUT,
  DEFAULT_DEVICE_HANDOFF_STATE,
  DEFAULT_HIATUS_CHARACTER_BIBLE,
  answerHiatusFanQuestion,
  appendCritiqueRedlineStroke,
  buildCritiqueReplayFrame,
  createDeviceHandoffSnapshot,
  createLiveCritiqueSession,
  restoreDeviceHandoff,
  type DeviceHandoffRestoreResult,
  type HandoffDeviceKind,
} from "./growth-five-engines";
import type { GrowthWorkbenchTabId } from "./toonstudio-vision-ecosystem-map";

const DEVICE_LABELS: Record<HandoffDeviceKind, string> = {
  "ipad-pro": "아이패드 프로",
  "galaxy-tab": "갤럭시탭 S 울트라",
  "desktop-pc": "데스크톱 PC 스튜디오",
};

export interface GrowthWorkbenchSecondaryTabsProps {
  readonly activeTab: GrowthWorkbenchTabId;
  readonly uid: string;
}

/**
 * 성장 5대 워크벤치 탭 3·4·5 (라이브 첨삭 교실 · 오프라인 이어 그리기 · 휴재기 캐릭터 Q&A).
 */
export function GrowthWorkbenchSecondaryTabs({
  activeTab,
  uid,
}: GrowthWorkbenchSecondaryTabsProps) {
  // 3. 라이브 첨삭 교실 상태
  const [critiqueSession, setCritiqueSession] = useState(() =>
    createLiveCritiqueSession(DEFAULT_CRITIQUE_SESSION_INPUT),
  );
  const [replayPct, setReplayPct] = useState<number>(100);
  const [redlineNote, setRedlineNote] = useState<string>(
    "손목 각도를 12도 꺾어 검 끝 시선을 모읍니다.",
  );
  const replayFrame = useMemo(
    () => buildCritiqueReplayFrame(critiqueSession, replayPct),
    [critiqueSession, replayPct],
  );

  // 4. 오프라인 이어 그리기 핸드오프 상태
  const [sourceDevice, setSourceDevice] = useState<HandoffDeviceKind>(
    DEFAULT_DEVICE_HANDOFF_STATE.sourceDevice,
  );
  const [targetDevice, setTargetDevice] = useState<HandoffDeviceKind>(
    DEFAULT_DEVICE_HANDOFF_STATE.targetDevice,
  );
  const [zoomPct, setZoomPct] = useState<number>(DEFAULT_DEVICE_HANDOFF_STATE.viewport.zoomPct);
  const [rotationDeg, setRotationDeg] = useState<number>(
    DEFAULT_DEVICE_HANDOFF_STATE.viewport.rotationDeg,
  );
  const [handoffSnapshot, setHandoffSnapshot] = useState(() =>
    createDeviceHandoffSnapshot(DEFAULT_DEVICE_HANDOFF_STATE),
  );
  const [tokenInput, setTokenInput] = useState<string>(() =>
    createDeviceHandoffSnapshot(DEFAULT_DEVICE_HANDOFF_STATE).token,
  );
  const [restoreResult, setRestoreResult] = useState<DeviceHandoffRestoreResult>(() =>
    restoreDeviceHandoff(
      createDeviceHandoffSnapshot(DEFAULT_DEVICE_HANDOFF_STATE).token,
      DEFAULT_DEVICE_HANDOFF_STATE.targetDevice,
    ),
  );

  // 5. 휴재기 무스포일러 캐릭터 Q&A 상태
  const [fanQuestion, setFanQuestion] = useState<string>(
    "세레나가 쓰는 회중시계 소품에 숨긴 설정이 있나요?",
  );
  const [qaResult, setQaResult] = useState(() =>
    answerHiatusFanQuestion(
      DEFAULT_HIATUS_CHARACTER_BIBLE,
      "세레나가 쓰는 회중시계 소품에 숨긴 설정이 있나요?",
    ),
  );

  const handleAddRedline = () => {
    const nextIndex = critiqueSession.redlineLayer.strokes.length + 1;
    const updated = appendCritiqueRedlineStroke(critiqueSession, {
      id: `red-${nextIndex}`,
      authorName: critiqueSession.instructorName,
      timestampMs: critiqueSession.createdAtMs + nextIndex * 25_000,
      tool: "redline-pen",
      points: [
        { x: 140 + nextIndex * 12, y: 110, pressure: 0.88 },
        { x: 240 + nextIndex * 10, y: 175, pressure: 0.92 },
      ],
      note: redlineNote.trim() || "강사 추가 레드라인 시연 스트로크",
    });
    setCritiqueSession(updated);
    setReplayPct(100);
  };

  const handleIssueHandoff = () => {
    const snapshot = createDeviceHandoffSnapshot({
      ...DEFAULT_DEVICE_HANDOFF_STATE,
      sourceDevice,
      targetDevice,
      viewport: {
        ...DEFAULT_DEVICE_HANDOFF_STATE.viewport,
        zoomPct,
        rotationDeg,
      },
    });
    setHandoffSnapshot(snapshot);
    setTokenInput(snapshot.token);
    setRestoreResult(restoreDeviceHandoff(snapshot.token, targetDevice));
  };

  const handleAskQuestion = (overrideQuestion?: string) => {
    const query = overrideQuestion ?? fanQuestion;
    if (overrideQuestion !== undefined) setFanQuestion(overrideQuestion);
    setQaResult(answerHiatusFanQuestion(DEFAULT_HIATUS_CHARACTER_BIBLE, query));
  };

  if (activeTab === "live-critique") {
    return (
      <div
        role="tabpanel"
        id={`${uid}-panel-live-critique`}
        aria-labelledby={`${uid}-tab-live-critique`}
        data-testid="gvos-panel-live-critique"
        className="gvos-panel-grid"
      >
        <div className="gvos-card">
          <h4 className="gvos-card-title">
            {critiqueSession.classTitle} · {critiqueSession.episodeLabel}
          </h4>
          <div className="gvos-list-item">
            <div className="gvos-list-item-row">
              <strong>수강생 원본 레이어 ({critiqueSession.studentName})</strong>
              <span className="gvos-status-pill" data-tone="good" data-testid="gvos-original-lock-badge">
                원본 잠금 무결성 보호
              </span>
            </div>
            <span className="gvos-code-inline">
              원본 해시: {critiqueSession.studentOriginalLayer.integrityHash}
            </span>
          </div>

          <div className="gvos-field-group">
            <label htmlFor={`${uid}-redline-note`} className="gvos-field-label">
              강사 레드라인 첨삭 코멘트
            </label>
            <input
              id={`${uid}-redline-note`}
              type="text"
              className="gvos-input"
              value={redlineNote}
              onChange={(event) => setRedlineNote(event.target.value)}
            />
          </div>
          <div className="gvos-actions">
            <button
              type="button"
              className="gvos-btn gvos-btn-primary"
              data-testid="gvos-add-redline-btn"
              onClick={handleAddRedline}
            >
              강사 레드라인 스트로크 기록
            </button>
          </div>
        </div>

        <div className="gvos-card">
          <div className="gvos-list-item-row">
            <h4 className="gvos-card-title">Before / After 브러시 시연 리플레이</h4>
            <span className="gvos-status-pill gvos-num" data-testid="gvos-replay-mode-badge">
              {replayFrame.mode.toUpperCase()} · {replayFrame.progressPct}%
            </span>
          </div>

          <div className="gvos-field-group">
            <label htmlFor={`${uid}-replay-range`} className="gvos-field-label gvos-num">
              리플레이 타임라인 ({replayFrame.visibleRedlineStrokes.length}/{replayFrame.totalRedlineCount} 스트로크)
            </label>
            <input
              id={`${uid}-replay-range`}
              type="range"
              min={0}
              max={100}
              step={5}
              value={replayPct}
              className="gvos-range"
              onChange={(event) => setReplayPct(Number(event.target.value))}
            />
          </div>

          <div className="gvos-actions">
            <button type="button" className="gvos-btn" onClick={() => setReplayPct(0)}>
              Before (원본 0%)
            </button>
            <button type="button" className="gvos-btn" onClick={() => setReplayPct(50)}>
              시연 중간 (50%)
            </button>
            <button type="button" className="gvos-btn gvos-btn-primary" onClick={() => setReplayPct(100)}>
              After (첨삭 100%)
            </button>
          </div>

          <p className="gvos-live-banner" data-testid="gvos-replay-note">
            {replayFrame.activeNote}
          </p>
        </div>
      </div>
    );
  }

  if (activeTab === "device-handoff") {
    return (
      <div
        role="tabpanel"
        id={`${uid}-panel-device-handoff`}
        aria-labelledby={`${uid}-tab-device-handoff`}
        data-testid="gvos-panel-device-handoff"
        className="gvos-panel-grid"
      >
        <div className="gvos-card">
          <h4 className="gvos-card-title">오프라인 이어 그리기 토큰 발급</h4>
          <div className="gvos-field-group">
            <label htmlFor={`${uid}-src-dev`} className="gvos-field-label">
              출발 기기
            </label>
            <select
              id={`${uid}-src-dev`}
              className="gvos-select"
              value={sourceDevice}
              onChange={(event) => setSourceDevice(event.target.value as HandoffDeviceKind)}
            >
              <option value="ipad-pro">{DEVICE_LABELS["ipad-pro"]}</option>
              <option value="galaxy-tab">{DEVICE_LABELS["galaxy-tab"]}</option>
              <option value="desktop-pc">{DEVICE_LABELS["desktop-pc"]}</option>
            </select>
          </div>
          <div className="gvos-field-group">
            <label htmlFor={`${uid}-dst-dev`} className="gvos-field-label">
              도착 기기
            </label>
            <select
              id={`${uid}-dst-dev`}
              className="gvos-select"
              value={targetDevice}
              onChange={(event) => setTargetDevice(event.target.value as HandoffDeviceKind)}
            >
              <option value="desktop-pc">{DEVICE_LABELS["desktop-pc"]}</option>
              <option value="ipad-pro">{DEVICE_LABELS["ipad-pro"]}</option>
              <option value="galaxy-tab">{DEVICE_LABELS["galaxy-tab"]}</option>
            </select>
          </div>
          <div className="gvos-actions">
            <button
              type="button"
              className="gvos-btn gvos-num"
              onClick={() => setZoomPct((prev) => (prev === 162.5 ? 215 : 162.5))}
            >
              줌 배율 전환 ({zoomPct}%)
            </button>
            <button
              type="button"
              className="gvos-btn gvos-num"
              onClick={() => setRotationDeg((prev) => (prev === -14.5 ? 22.5 : -14.5))}
            >
              회전각 전환 ({rotationDeg}°)
            </button>
            <button
              type="button"
              className="gvos-btn gvos-btn-primary"
              data-testid="gvos-issue-handoff-btn"
              onClick={handleIssueHandoff}
            >
              핸드오프 토큰 발급
            </button>
          </div>
          <span className="text-xs text-fg-2 gvos-num">
            압축 크기 {handoffSnapshot.byteLength}B · QR 전송 {handoffSnapshot.qrPayloadSafe ? "가능" : "초과"} · 미저장 차분{" "}
            {handoffSnapshot.summary.deltaOpCount}건
          </span>
        </div>

        <div className="gvos-card">
          <h4 className="gvos-card-title">도착 기기 무손실 복원 검증</h4>
          <div className="gvos-field-group">
            <label htmlFor={`${uid}-handoff-token`} className="gvos-field-label">
              압축 핸드오프 토큰 (TSHO1)
            </label>
            <textarea
              id={`${uid}-handoff-token`}
              className="gvos-textarea"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
            />
          </div>
          <div className="gvos-actions">
            <button
              type="button"
              className="gvos-btn gvos-btn-primary"
              data-testid="gvos-restore-handoff-btn"
              onClick={() => setRestoreResult(restoreDeviceHandoff(tokenInput, targetDevice))}
            >
              토큰 무손실 복원
            </button>
            <button
              type="button"
              className="gvos-btn"
              data-testid="gvos-tamper-handoff-btn"
              onClick={() => {
                const tampered = `${handoffSnapshot.token.slice(0, -4)}0000`;
                setTokenInput(tampered);
                setRestoreResult(restoreDeviceHandoff(tampered, targetDevice));
              }}
            >
              변조 토큰 차단 시험
            </button>
          </div>

          <div className="gvos-list-item" data-testid="gvos-handoff-restore-result">
            {restoreResult.ok ? (
              <>
                <div className="gvos-list-item-row">
                  <strong>{DEVICE_LABELS[restoreResult.restoredOnDevice]} 복원 완료</strong>
                  <span className="gvos-status-pill" data-tone="good">
                    무손실 일치
                  </span>
                </div>
                <span className="text-xs text-fg-2 gvos-num">
                  브러시: {restoreResult.state.activeBrush.name} ({restoreResult.state.activeBrush.sizePx}px) · 줌{" "}
                  {restoreResult.state.viewport.zoomPct}% · 회전 {restoreResult.state.viewport.rotationDeg}° · 레이어{" "}
                  {restoreResult.state.selectedLayerId}
                </span>
                <span className="gvos-code-inline">차분 해시: {restoreResult.unsavedDeltaHash}</span>
              </>
            ) : (
              <>
                <div className="gvos-list-item-row">
                  <strong>복원 거부 ({restoreResult.errorCode})</strong>
                  <span className="gvos-status-pill" data-tone="bad">
                    무결성 차단
                  </span>
                </div>
                <span className="text-xs text-fg-2">{restoreResult.messageKo}</span>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === "hiatus-qa") {
    return (
      <div
        role="tabpanel"
        id={`${uid}-panel-hiatus-qa`}
        aria-labelledby={`${uid}-tab-hiatus-qa`}
        data-testid="gvos-panel-hiatus-qa"
        className="gvos-panel-grid"
      >
        <div className="gvos-card">
          <div className="gvos-list-item-row">
            <h4 className="gvos-card-title">
              {DEFAULT_HIATUS_CHARACTER_BIBLE.characterName} Q&amp;A 봇
            </h4>
            <span className="gvos-status-pill gvos-num" data-tone="good">
              승인 상한 1~{DEFAULT_HIATUS_CHARACTER_BIBLE.approvedUpToEpisode}화
            </span>
          </div>

          <div className="gvos-field-group">
            <label htmlFor={`${uid}-fan-q`} className="gvos-field-label">
              독자 질문 입력 (승인 범위 초과 스포일러 자동 우회)
            </label>
            <input
              id={`${uid}-fan-q`}
              type="text"
              className="gvos-input"
              value={fanQuestion}
              onChange={(event) => setFanQuestion(event.target.value)}
            />
          </div>

          <div className="gvos-actions">
            <button
              type="button"
              className="gvos-btn gvos-btn-primary"
              data-testid="gvos-ask-qa-btn"
              onClick={() => handleAskQuestion()}
            >
              질문 보내기
            </button>
            <button
              type="button"
              className="gvos-btn"
              data-testid="gvos-preset-safe-qa"
              onClick={() => handleAskQuestion("세레나가 밤샘 수리할 때 마시는 홍차 취향이 궁금해요!")}
            >
              안전 질문 (9화 홍차)
            </button>
            <button
              type="button"
              className="gvos-btn"
              data-testid="gvos-preset-spoiler-qa"
              onClick={() => handleAskQuestion("30화에 나오는 흑막 정체랑 50화 결말 알려 주세요!")}
            >
              스포일러 차단 시험 (30화 흑막)
            </button>
          </div>
        </div>

        <div className="gvos-card">
          <div className="gvos-list-item-row">
            <h4 className="gvos-card-title">캐릭터 응답 &amp; 자동 비하인드 카드</h4>
            <span
              className="gvos-status-pill"
              data-tone={qaResult.spoilerBlocked ? "warn" : "good"}
              data-testid="gvos-qa-status-badge"
            >
              {qaResult.spoilerBlocked ? "스포일러 안전 우회" : "공식 승인 응답"}
            </span>
          </div>
          <p className="gvos-live-banner" data-testid="gvos-qa-reply">
            {qaResult.reply}
          </p>
          {qaResult.blockedReason ? (
            <p className="text-xs text-fg-2" data-testid="gvos-qa-blocked-reason">
              차단 사유: {qaResult.blockedReason}
            </p>
          ) : null}

          <article className="gvos-behind-card" data-testid="gvos-behind-card">
            <div className="gvos-list-item-row">
              <strong>{qaResult.behindCard.title}</strong>
              <span className="gvos-status-pill gvos-num">{qaResult.behindCard.episodeBadge}</span>
            </div>
            <p className="m-0 text-xs text-fg-2">{qaResult.behindCard.fact}</p>
          </article>
        </div>
      </div>
    );
  }

  return null;
}
