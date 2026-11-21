import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  MessageSquareQuote,
  Package,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Vibrate,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  SAMPLE_LONG_SERIAL_EPISODES,
  SAMPLE_STROKE_AUDIT_EVENTS,
  SAMPLE_WEBTOON_SCRIPT_LINES,
  auditLongSeriesContinuity,
  buildC2paCopyrightPackage,
  generateAutoLetteringLayout,
  verifyC2paStrokeChain,
  type LetteringLocale,
  type SeriesEpisodeRecord,
  type StrokeAuditEvent,
} from "./c2pa-sfx-continuity-engine";
import {
  buildIpGoodsExportBundle,
  createPhoneRemoteDispatcher,
  createPhoneRemoteSession,
  type PhoneRemoteDispatchEvent,
  type RemoteShortcutId,
} from "./ip-goods-phone-remote-engine";

import "./creator-superpowers.css";

export type SuperpowerTabId = "c2pa" | "lettering" | "continuity" | "goods" | "remote";

export interface StudioCreatorSuperpowersPanelProps {
  readonly projectId?: string | null;
  readonly initialTab?: SuperpowerTabId;
  readonly onRemoteCommand?: (shortcutId: RemoteShortcutId) => void;
}

const SUPERPOWER_TABS: readonly {
  readonly id: SuperpowerTabId;
  readonly labelKo: string;
}[] = Object.freeze([
  { id: "c2pa", labelKo: "C2PA 저작권 증빙" },
  { id: "lettering", labelKo: "감정 자동 식자·SFX" },
  { id: "continuity", labelKo: "연재 떡밥·오류 감지" },
  { id: "goods", labelKo: "IP 굿즈·이모티콘" },
  { id: "remote", labelKo: "폰 QR 리모컨" },
]);

const LOCALE_OPTIONS: readonly { readonly id: LetteringLocale; readonly label: string }[] = Object.freeze([
  { id: "ko", label: "한국어" },
  { id: "ja", label: "日本語" },
  { id: "en", label: "English" },
]);

function TabIcon({ id }: { readonly id: SuperpowerTabId }) {
  switch (id) {
    case "c2pa":
      return <ShieldCheck size={15} strokeWidth={1.9} aria-hidden="true" />;
    case "lettering":
      return <MessageSquareQuote size={15} strokeWidth={1.9} aria-hidden="true" />;
    case "continuity":
      return <BookOpenCheck size={15} strokeWidth={1.9} aria-hidden="true" />;
    case "goods":
      return <Package size={15} strokeWidth={1.9} aria-hidden="true" />;
    case "remote":
      return <Smartphone size={15} strokeWidth={1.9} aria-hidden="true" />;
  }
}

/**
 * 웹툰 작가 초격차 창작 슈퍼파워 5종 제어판:
 * #7 C2PA·타임랩스 저작권 증빙 / #8 감정 자동 식자·SFX / #9 장기 연재 떡밥·설정 오류 감지기 /
 * #10 IP 굿즈·이모티콘 1클릭 추출 / #11 스마트폰 QR 무료 왼손 단축키 리모컨.
 */
export function StudioCreatorSuperpowersPanel({
  projectId,
  initialTab = "c2pa",
  onRemoteCommand,
}: StudioCreatorSuperpowersPanelProps) {
  const [activeTab, setActiveTab] = useState<SuperpowerTabId>(initialTab);

  // #7 C2PA + 타임랩스 저작권 증빙 상태
  const [workTitle, setWorkTitle] = useState(projectId ? `작품-${projectId}` : "북부 대공의 비밀 계약");
  const [authorName, setAuthorName] = useState("김작가");
  const [tamperSimulated, setTamperSimulated] = useState(false);

  const c2paPackage = useMemo(() => {
    const basePkg = buildC2paCopyrightPackage({
      workTitle,
      authorName,
      episodeNumber: 55,
      strokes: SAMPLE_STROKE_AUDIT_EVENTS,
    });
    if (!tamperSimulated) return basePkg;
    const tamperedEvents: StrokeAuditEvent[] = basePkg.sourceEvents.map((ev, idx) =>
      idx === 2 ? { ...ev, pointCount: ev.pointCount + 999 } : ev,
    );
    return { ...basePkg, sourceEvents: tamperedEvents };
  }, [authorName, tamperSimulated, workTitle]);

  const c2paVerification = useMemo(() => verifyC2paStrokeChain(c2paPackage), [c2paPackage]);

  // #8 감정 인식 말풍선·폰트·SFX 자동 식자 상태
  const [scriptText, setScriptText] = useState(() => SAMPLE_WEBTOON_SCRIPT_LINES.join("\n"));
  const [letteringLocale, setLetteringLocale] = useState<LetteringLocale>("ko");
  const letteringPlan = useMemo(
    () => generateAutoLetteringLayout(scriptText.split("\n"), { locale: letteringLocale }),
    [letteringLocale, scriptText],
  );

  // #9 장기 연재 떡밥·설정 오류 감지기 상태
  const [episodes, setEpisodes] = useState<readonly SeriesEpisodeRecord[]>(SAMPLE_LONG_SERIAL_EPISODES);
  const [newForeshadowTitle, setNewForeshadowTitle] = useState("");
  const continuityReport = useMemo(() => auditLongSeriesContinuity(episodes), [episodes]);

  // #10 IP 굿즈·이모티콘 1클릭 추출기 상태
  const [characterName, setCharacterName] = useState("엘리시아");
  const [standWidthMm, setStandWidthMm] = useState(70);
  const [standHeightMm, setStandHeightMm] = useState(120);
  const [bleedMm, setBleedMm] = useState(3);

  const goodsBundle = useMemo(
    () =>
      buildIpGoodsExportBundle({
        characterName,
        sourceWidthPx: 1440,
        sourceHeightPx: 1920,
        standWidthMm,
        standHeightMm,
        bleedMm,
      }),
    [bleedMm, characterName, standHeightMm, standWidthMm],
  );

  // #11 스마트폰 QR 무료 왼손 단축키 리모컨 상태
  const [sessionSeed, setSessionSeed] = useState(1);
  const [hapticEnabled, setHapticEnabled] = useState(true);
  const [remoteLog, setRemoteLog] = useState<readonly PhoneRemoteDispatchEvent[]>([]);
  const [remoteStatus, setRemoteStatus] = useState("QR을 스캔하거나 아래 8종 패드로 바로 테스트하세요.");

  const remoteSession = useMemo(() => {
    const origin = typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://toonstudio.app";
    return createPhoneRemoteSession({
      origin,
      workId: projectId ?? "local-canvas",
      nowMs: 1763700000000 + sessionSeed * 60000,
      nonce: `pad-${projectId ?? "local"}-${sessionSeed}`,
    });
  }, [projectId, sessionSeed]);

  const remoteDispatcher = useMemo(() => {
    const handlers: Partial<Record<RemoteShortcutId, () => void>> = {};
    for (const def of remoteSession.shortcuts) {
      handlers[def.id] = () => onRemoteCommand?.(def.id);
    }
    return createPhoneRemoteDispatcher(remoteSession, handlers);
  }, [onRemoteCommand, remoteSession]);

  const handleDispatchShortcut = (shortcutId: RemoteShortcutId) => {
    const res = remoteDispatcher.dispatch(shortcutId, {
      nowMs: remoteSession.createdAtMs + 5000,
      hapticEnabled,
    });
    setRemoteStatus(res.reasonKo);
    if (res.accepted) {
      setRemoteLog(remoteDispatcher.getHistory());
    }
  };

  const handleAddForeshadow = () => {
    const title = newForeshadowTitle.trim();
    if (!title) return;
    const nextEp = (episodes.at(-1)?.episodeNumber ?? 55) + 1;
    setEpisodes((prev) => [
      ...prev,
      {
        episodeNumber: nextEp,
        storyDay: (prev.at(-1)?.storyDay ?? 24) + 1,
        summary: `새 복선 등록: ${title}`,
        foreshadowing: [{ threadId: `fs-custom-${nextEp}`, title, action: "plant" }],
      },
    ]);
    setNewForeshadowTitle("");
  };

  return (
    <section
      className="ts-sp-panel"
      data-testid="studio-creator-superpowers-panel"
      aria-label="창작 슈퍼파워 통합 제어판"
    >
      <header className="ts-sp-head">
        <div className="ts-sp-title-group">
          <p className="ts-sp-kicker">CREATOR SUPERPOWERS · 5-IN-1</p>
          <h4 className="ts-sp-title">저작권 증빙 · 감정 식자 · 떡밥 감지 · IP 굿즈 · 폰 QR 리모컨</h4>
        </div>
        <span className="ts-sp-badge" data-state="ok">
          로컬 즉시 연산 · ₩0
        </span>
      </header>

      <div className="ts-sp-tablist" role="tablist" aria-label="창작 슈퍼파워 도구 선택">
        {SUPERPOWER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`ts-sp-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`ts-sp-panel-${tab.id}`}
            data-superpower-tab={tab.id}
            className="ts-sp-tab"
            onClick={() => setActiveTab(tab.id)}
          >
            <TabIcon id={tab.id} />
            <span>{tab.labelKo}</span>
          </button>
        ))}
      </div>

      {/* ── 탭 1: #7 C2PA + 제작 타임랩스 저작권 증빙 ── */}
      {activeTab === "c2pa" ? (
        <div
          id="ts-sp-panel-c2pa"
          role="tabpanel"
          aria-labelledby="ts-sp-tab-c2pa"
          className="ts-sp-section"
          data-testid="superpower-tabpanel-c2pa"
        >
          <div className="ts-sp-grid">
            <div className="ts-sp-card">
              <h5 className="ts-sp-card-title">작품·작가 증빙 메타데이터</h5>
              <label className="ts-sp-muted">
                작품명
                <input
                  type="text"
                  className="ts-sp-input"
                  value={workTitle}
                  onChange={(e) => setWorkTitle(e.target.value)}
                />
              </label>
              <label className="ts-sp-muted">
                작가명
                <input
                  type="text"
                  className="ts-sp-input"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                />
              </label>
              <div className="ts-sp-row">
                <button
                  type="button"
                  className="ts-sp-btn"
                  data-tone={tamperSimulated ? "primary" : "danger"}
                  data-testid="c2pa-toggle-tamper"
                  onClick={() => setTamperSimulated((prev) => !prev)}
                >
                  {tamperSimulated ? "원본 해시 복구" : "위변조 탐지 테스트"}
                </button>
              </div>
            </div>

            <div className="ts-sp-card">
              <div className="ts-sp-row">
                <h5 className="ts-sp-card-title">SHA-256 해시 체인 검증 결과</h5>
                <span
                  className="ts-sp-badge"
                  data-state={c2paVerification.valid ? "ok" : "error"}
                  data-testid="c2pa-verify-status"
                >
                  {c2paVerification.valid ? <CheckCircle2 size={12} aria-hidden="true" /> : <AlertTriangle size={12} aria-hidden="true" />}
                  {c2paVerification.valid ? "무결성 검증 통과" : "위변조 감지"}
                </span>
              </div>
              <p className="ts-sp-muted" role="status">
                {c2paVerification.reasonKo}
              </p>
              <p className="ts-sp-muted">
                직접 작화 비중 <strong>{Math.round(c2paPackage.humanAuthoredRatio * 100)}%</strong> · AI 보조{" "}
                <strong>{Math.round(c2paPackage.aiAssistRatio * 100)}%</strong> · 타임랩스 체크포인트{" "}
                <strong>{c2paPackage.timelapseFrames.length}단계</strong>
              </p>
              <p className="ts-sp-mono" data-testid="c2pa-final-hash">
                C2PA 최종 해시: {c2paPackage.finalChainHash}
              </p>
            </div>
          </div>

          <div className="ts-sp-card">
            <h5 className="ts-sp-card-title">제작 타임랩스 공정 요약</h5>
            <ul className="ts-sp-list">
              {c2paPackage.timelapseFrames.map((frame) => (
                <li key={frame.frameNumber} className="ts-sp-list-item">
                  <div className="ts-sp-row">
                    <strong>
                      #{frame.frameNumber} {frame.stageLabelKo}
                    </strong>
                    <span className="ts-sp-badge" data-state="ok">
                      누적 {frame.cumulativeStrokes}획 · +{frame.elapsedSeconds}초
                    </span>
                    <span className="ts-sp-mono">#{frame.checkpointHash}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {/* ── 탭 2: #8 감정 인식 말풍선·폰트·효과음(SFX) 자동 식자 ── */}
      {activeTab === "lettering" ? (
        <div
          id="ts-sp-panel-lettering"
          role="tabpanel"
          aria-labelledby="ts-sp-tab-lettering"
          className="ts-sp-section"
          data-testid="superpower-tabpanel-lettering"
        >
          <div className="ts-sp-card">
            <div className="ts-sp-row">
              <h5 className="ts-sp-card-title">대본 입력 · 감정 자동 판별 및 식자</h5>
              <div className="ts-sp-row" role="group" aria-label="식자 언어 선택">
                {LOCALE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className="ts-sp-btn"
                    aria-pressed={letteringLocale === opt.id}
                    data-lettering-locale={opt.id}
                    onClick={() => setLetteringLocale(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              aria-label="웹툰 대본 입력"
              className="ts-sp-textarea"
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
            />
            <p className="ts-sp-muted" role="status">
              총 <strong>{letteringPlan.placements.length}개</strong> 말풍선 · 자동 효과음(SFX){" "}
              <strong>{letteringPlan.sfxCount}개</strong> 배치 산출 완료 (폭 {letteringPlan.canvasWidth}px 기준)
            </p>
          </div>

          <ul className="ts-sp-list" data-testid="lettering-placement-list">
            {letteringPlan.placements.map((item) => (
              <li key={item.index} className="ts-sp-list-item" data-emotion={item.emotion}>
                <div className="ts-sp-row">
                  <strong>{item.speaker ?? "나레이션"}</strong>
                  <span className="ts-sp-badge" data-state={item.emotion === "anger" || item.emotion === "shock" ? "warn" : "ok"}>
                    {item.emotionLabelKo}
                  </span>
                  <span className="ts-sp-badge" data-state="ok">
                    {item.bubbleLabelKo}
                  </span>
                  {item.sfxText ? (
                    <span className="ts-sp-badge" data-state="warn">
                      SFX: {item.sfxText} ({item.sfxRotationDeg}°)
                    </span>
                  ) : null}
                </div>
                <p className="ts-sp-muted">{item.dialogue}</p>
                <p className="ts-sp-mono">
                  폰트: {item.fontFamily} ({item.fontSizePx}px) · 꼬리: {item.tailDirection} · 좌표({item.position.x},{" "}
                  {item.position.y})
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── 탭 3: #9 장기 연재(50화+) 떡밥·설정 오류 감지기 ── */}
      {activeTab === "continuity" ? (
        <div
          id="ts-sp-panel-continuity"
          role="tabpanel"
          aria-labelledby="ts-sp-tab-continuity"
          className="ts-sp-section"
          data-testid="superpower-tabpanel-continuity"
        >
          <div className="ts-sp-card">
            <div className="ts-sp-row">
              <h5 className="ts-sp-card-title">장기 연재 설정 일관성 감사 ({continuityReport.latestEpisode}화 기준)</h5>
              <span
                className="ts-sp-badge"
                data-state={continuityReport.continuityHealthScore >= 80 ? "ok" : "warn"}
                data-testid="continuity-health-score"
              >
                정합성 점수 {continuityReport.continuityHealthScore}/100
              </span>
            </div>
            <div className="ts-sp-row">
              <input
                type="text"
                aria-label="새 복선 메모 추가"
                placeholder="예: 56화 황태자의 반지 문양 단서"
                className="ts-sp-input"
                value={newForeshadowTitle}
                onChange={(e) => setNewForeshadowTitle(e.target.value)}
              />
              <button type="button" className="ts-sp-btn" data-tone="primary" onClick={handleAddForeshadow}>
                복선 추가
              </button>
            </div>
          </div>

          <div className="ts-sp-grid">
            <div className="ts-sp-card">
              <h5 className="ts-sp-card-title">
                미회수 떡밥 ({continuityReport.unresolvedThreads.length}건 / 전체 {continuityReport.totalForeshadowThreads}건)
              </h5>
              <ul className="ts-sp-list">
                {continuityReport.unresolvedThreads.map((thread) => (
                  <li key={thread.threadId} className="ts-sp-list-item">
                    <div className="ts-sp-row">
                      <strong>{thread.title}</strong>
                      <span
                        className="ts-sp-badge"
                        data-state={thread.severity === "critical" ? "error" : "warn"}
                      >
                        {thread.plantedEpisode}화 심음 · {thread.unresolvedSpanEpisodes}화째 미회수
                      </span>
                    </div>
                    <p className="ts-sp-muted">{thread.suggestionKo}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="ts-sp-card">
              <h5 className="ts-sp-card-title">설정 충돌 경고 ({continuityReport.conflicts.length}건)</h5>
              <ul className="ts-sp-list" data-testid="continuity-conflicts-list">
                {continuityReport.conflicts.map((conflict) => (
                  <li key={conflict.id} className="ts-sp-list-item" data-conflict-kind={conflict.kind}>
                    <div className="ts-sp-row">
                      <strong>{conflict.titleKo}</strong>
                      <span className="ts-sp-badge" data-state={conflict.severity === "error" ? "error" : "warn"}>
                        {conflict.previousEpisodeNumber}화 → {conflict.episodeNumber}화
                      </span>
                    </div>
                    <p className="ts-sp-muted">{conflict.detailKo}</p>
                    <p className="ts-sp-muted">해결: {conflict.fixHintKo}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── 탭 4: #10 IP 굿즈·이모티콘 1클릭 추출기 ── */}
      {activeTab === "goods" ? (
        <div
          id="ts-sp-panel-goods"
          role="tabpanel"
          aria-labelledby="ts-sp-tab-goods"
          className="ts-sp-section"
          data-testid="superpower-tabpanel-goods"
        >
          <div className="ts-sp-card">
            <h5 className="ts-sp-card-title">캐릭터 레이어 굿즈 규격 설정</h5>
            <div className="ts-sp-grid">
              <label className="ts-sp-muted">
                캐릭터 이름
                <input
                  type="text"
                  className="ts-sp-input"
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value)}
                />
              </label>
              <label className="ts-sp-muted">
                아크릴 도련선 (mm)
                <input
                  type="number"
                  min={1}
                  max={8}
                  className="ts-sp-input"
                  value={bleedMm}
                  onChange={(e) => setBleedMm(Math.max(1, Number(e.target.value) || 3))}
                />
              </label>
              <label className="ts-sp-muted">
                아크릴 가로 (mm)
                <input
                  type="number"
                  min={30}
                  max={200}
                  className="ts-sp-input"
                  value={standWidthMm}
                  onChange={(e) => setStandWidthMm(Math.max(30, Number(e.target.value) || 70))}
                />
              </label>
              <label className="ts-sp-muted">
                아크릴 세로 (mm)
                <input
                  type="number"
                  min={40}
                  max={250}
                  className="ts-sp-input"
                  value={standHeightMm}
                  onChange={(e) => setStandHeightMm(Math.max(40, Number(e.target.value) || 120))}
                />
              </label>
            </div>
          </div>

          <div className="ts-sp-grid">
            <div className="ts-sp-card">
              <h5 className="ts-sp-card-title">아크릴 스탠드 {goodsBundle.acrylicCutline.bleedMm}mm 칼선 미리보기</h5>
              <div className="ts-sp-cutline-stage">
                <svg
                  className="ts-sp-cutline-svg"
                  viewBox={`0 0 ${goodsBundle.acrylicCutline.totalWidthMm} ${goodsBundle.acrylicCutline.totalHeightMm}`}
                  role="img"
                  aria-label={`${goodsBundle.characterName} 아크릴 스탠드 칼선 SVG`}
                >
                  <rect
                    x={goodsBundle.acrylicCutline.bleedMm}
                    y={goodsBundle.acrylicCutline.bleedMm}
                    width={goodsBundle.acrylicCutline.trimWidthMm}
                    height={goodsBundle.acrylicCutline.trimHeightMm}
                    rx={6}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={0.8}
                    strokeDasharray="2 1.5"
                    opacity={0.55}
                  />
                  <path
                    d={goodsBundle.acrylicCutline.cutlinePathD}
                    fill="none"
                    className="ts-sp-cutline-path"
                    strokeWidth={1.1}
                  />
                </svg>
              </div>
              <p className="ts-sp-muted" data-testid="goods-acrylic-summary">
                전체 칼선 {goodsBundle.acrylicCutline.totalWidthMm}×{goodsBundle.acrylicCutline.totalHeightMm}mm · 받침대 탭{" "}
                {goodsBundle.acrylicCutline.baseSlotWidthMm}×{goodsBundle.acrylicCutline.baseThicknessMm}mm
              </p>
            </div>

            <div className="ts-sp-card">
              <h5 className="ts-sp-card-title">카카오 이모티콘 & 300DPI CMYK 매니페스트</h5>
              <ul className="ts-sp-list">
                <li className="ts-sp-list-item">
                  <strong>카카오톡 이모티콘 규격</strong>
                  <p className="ts-sp-muted" data-testid="goods-kakao-summary">
                    {goodsBundle.kakaoEmoticon.widthPx}×{goodsBundle.kakaoEmoticon.heightPx} {goodsBundle.kakaoEmoticon.format} ·
                    배경 제거 완료(전경 {Math.round(goodsBundle.mask.alphaMaskRatio * 100)}%) · {goodsBundle.kakaoEmoticon.fileName}
                  </p>
                </li>
                <li className="ts-sp-list-item">
                  <strong>인쇄 300DPI CMYK 출력</strong>
                  <p className="ts-sp-muted" data-testid="goods-cmyk-summary">
                    {goodsBundle.printManifest.exportPixelSize.width}×{goodsBundle.printManifest.exportPixelSize.height}px (
                    {goodsBundle.printManifest.dpi}DPI · {goodsBundle.printManifest.colorProfile}) · 최대 잉크 총량{" "}
                    {goodsBundle.printManifest.maxTacPct}%
                  </p>
                </li>
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── 탭 5: #11 스마트폰 QR 무료 왼손 단축키 리모컨 ── */}
      {activeTab === "remote" ? (
        <div
          id="ts-sp-panel-remote"
          role="tabpanel"
          aria-labelledby="ts-sp-tab-remote"
          className="ts-sp-section"
          data-testid="superpower-tabpanel-remote"
        >
          <div className="ts-sp-grid">
            <div className="ts-sp-card">
              <div className="ts-sp-row">
                <h5 className="ts-sp-card-title">스마트폰 QR 페어링 (무료)</h5>
                <span className="ts-sp-badge" data-state="ok" data-testid="remote-session-token">
                  {remoteSession.sessionToken}
                </span>
              </div>
              <div className="ts-sp-qr-box">
                <svg
                  className="ts-sp-qr-svg"
                  viewBox={`0 0 ${remoteSession.qrMatrix.length} ${remoteSession.qrMatrix.length}`}
                  role="img"
                  aria-label="스마트폰 왼손 단축키 리모컨 페어링 QR 코드"
                >
                  {remoteSession.qrMatrix.map((row, rIdx) =>
                    row.map((cell, cIdx) =>
                      cell ? (
                        <rect
                          key={`${rIdx}-${cIdx}`}
                          x={cIdx}
                          y={rIdx}
                          width={1}
                          height={1}
                          fill="currentColor"
                        />
                      ) : null,
                    ),
                  )}
                </svg>
              </div>
              <p className="ts-sp-mono">PIN: {remoteSession.pinCode} · {remoteSession.qrPayloadUrl}</p>
              <div className="ts-sp-row">
                <button
                  type="button"
                  className="ts-sp-btn"
                  onClick={() => {
                    setSessionSeed((prev) => prev + 1);
                    setRemoteLog([]);
                    setRemoteStatus("새 QR 페어링 세션을 발급했습니다.");
                  }}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  <span>새 QR 발급</span>
                </button>
                <button
                  type="button"
                  className="ts-sp-btn"
                  aria-pressed={hapticEnabled}
                  onClick={() => setHapticEnabled((prev) => !prev)}
                >
                  <Vibrate size={14} aria-hidden="true" />
                  <span>{hapticEnabled ? "햅틱 진동 켜짐" : "햅틱 진동 꺼짐"}</span>
                </button>
              </div>
            </div>

            <div className="ts-sp-card">
              <h5 className="ts-sp-card-title">웹툰 왼손 단축키 8종 리모컨 패드</h5>
              <div className="ts-sp-remote-grid">
                {remoteSession.shortcuts.map((shortcut) => (
                  <button
                    key={shortcut.id}
                    type="button"
                    className="ts-sp-remote-key"
                    data-remote-shortcut={shortcut.id}
                    onClick={() => handleDispatchShortcut(shortcut.id)}
                  >
                    <span>{shortcut.labelKo}</span>
                    <small>{shortcut.keyCombo}</small>
                  </button>
                ))}
              </div>
              <p className="ts-sp-muted" role="status" data-testid="remote-dispatch-status">
                {remoteStatus}
              </p>
              {remoteLog.length > 0 ? (
                <p className="ts-sp-mono">
                  최근 실행({remoteLog.length}건): {remoteLog.slice(0, 3).map((ev) => ev.labelKo).join(" → ")}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default StudioCreatorSuperpowersPanel;
