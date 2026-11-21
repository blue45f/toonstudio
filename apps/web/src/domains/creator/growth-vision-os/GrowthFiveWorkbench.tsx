import {
  Globe2,
  GraduationCap,
  MessageSquareHeart,
  Radio,
  ShieldCheck,
  TabletSmartphone,
} from "lucide-react";
import { useId, useMemo, useState } from "react";

import {
  DEFAULT_BUYER_PITCH_INPUT,
  DEFAULT_LIVE_BROADCAST_INPUT,
  createGlobalBuyerPitchRoom,
  prepareCreatorLiveBroadcast,
  verifyBuyerPitchAccess,
  type BuyerPitchAccessResult,
  type LiveBroadcastStreamPreset,
  type PitchLanguage,
} from "./growth-five-engines";
import { GrowthWorkbenchSecondaryTabs } from "./GrowthWorkbenchSecondaryTabs";
import type { GrowthWorkbenchTabId } from "./toonstudio-vision-ecosystem-map";

export interface GrowthFiveWorkbenchProps {
  readonly activeTab: GrowthWorkbenchTabId;
  readonly onSelectTab: (tab: GrowthWorkbenchTabId) => void;
}

const WORKBENCH_TABS: readonly {
  readonly id: GrowthWorkbenchTabId;
  readonly label: string;
}[] = [
  { id: "live-broadcast", label: "① 라이브 방송·블러" },
  { id: "buyer-pitch", label: "② 해외 바이어 피치 룸" },
  { id: "live-critique", label: "③ 라이브 첨삭 교실" },
  { id: "device-handoff", label: "④ 오프라인 이어 그리기" },
  { id: "hiatus-qa", label: "⑤ 휴재기 캐릭터 Q&A" },
];

function renderTabIcon(tabId: GrowthWorkbenchTabId) {
  switch (tabId) {
    case "live-broadcast":
      return <Radio className="size-4 shrink-0" aria-hidden="true" />;
    case "buyer-pitch":
      return <Globe2 className="size-4 shrink-0" aria-hidden="true" />;
    case "live-critique":
      return <GraduationCap className="size-4 shrink-0" aria-hidden="true" />;
    case "device-handoff":
      return <TabletSmartphone className="size-4 shrink-0" aria-hidden="true" />;
    case "hiatus-qa":
      return <MessageSquareHeart className="size-4 shrink-0" aria-hidden="true" />;
  }
}

export function GrowthFiveWorkbench({ activeTab, onSelectTab }: GrowthFiveWorkbenchProps) {
  const uid = useId();

  // 1. 라이브 드로잉 방송 상태
  const [streamPreset, setStreamPreset] = useState<LiveBroadcastStreamPreset>("chzzk-1080p60");
  const [blurRadiusPx, setBlurRadiusPx] = useState<number>(26);
  const [shortsTargetSec, setShortsTargetSec] = useState<number>(15);
  const [extraSpoilerLocked, setExtraSpoilerLocked] = useState<boolean>(false);

  const livePlan = useMemo(() => {
    const layers = extraSpoilerLocked
      ? [
          ...DEFAULT_LIVE_BROADCAST_INPUT.layers,
          {
            id: "layer-ep25-draft",
            name: "25화 차기 엔딩 콘티",
            kind: "spoiler-prop" as const,
            episodeRef: 25,
            isMarkedSpoiler: true,
            bounds: { x: 240, y: 1200, width: 620, height: 320 },
          },
        ]
      : DEFAULT_LIVE_BROADCAST_INPUT.layers;

    return prepareCreatorLiveBroadcast({
      ...DEFAULT_LIVE_BROADCAST_INPUT,
      layers,
      streamPreset,
      blurRadiusPx,
      shortsTargetSec,
    });
  }, [streamPreset, blurRadiusPx, shortsTargetSec, extraSpoilerLocked]);

  // 2. 해외 바이어 피치 룸 상태
  const [buyerOrg, setBuyerOrg] = useState<string>(DEFAULT_BUYER_PITCH_INPUT.buyerOrg);
  const [roomPasscode, setRoomPasscode] = useState<string>(DEFAULT_BUYER_PITCH_INPUT.passcode);
  const [expiresInHours, setExpiresInHours] = useState<number>(72);
  const [pitchRoom, setPitchRoom] = useState(() => createGlobalBuyerPitchRoom(DEFAULT_BUYER_PITCH_INPUT));
  const [verifyPasscode, setVerifyPasscode] = useState<string>(DEFAULT_BUYER_PITCH_INPUT.passcode);
  const [verifyLang, setVerifyLang] = useState<PitchLanguage>("en");
  const [accessResult, setAccessResult] = useState<BuyerPitchAccessResult>(() =>
    verifyBuyerPitchAccess(createGlobalBuyerPitchRoom(DEFAULT_BUYER_PITCH_INPUT), {
      passcode: DEFAULT_BUYER_PITCH_INPUT.passcode,
      nowMs: DEFAULT_BUYER_PITCH_INPUT.createdAtMs + 3_600_000,
      preferredLanguage: "en",
    }),
  );

  const handleRebuildPitchRoom = () => {
    const safeCode = roomPasscode.trim().length >= 6 ? roomPasscode.trim() : "SILVER2026";
    const created = createGlobalBuyerPitchRoom({
      ...DEFAULT_BUYER_PITCH_INPUT,
      buyerOrg: buyerOrg.trim() || DEFAULT_BUYER_PITCH_INPUT.buyerOrg,
      passcode: safeCode,
      expiresInHours,
    });
    setPitchRoom(created);
    setVerifyPasscode(safeCode);
    setAccessResult(
      verifyBuyerPitchAccess(created, {
        passcode: safeCode,
        nowMs: created.createdAtMs + 3_600_000,
        preferredLanguage: verifyLang,
      }),
    );
  };

  const handleVerifyPitch = (simulateExpired: boolean) => {
    const checkNow = simulateExpired
      ? pitchRoom.expiresAtMs + 60_000
      : pitchRoom.createdAtMs + 3_600_000;
    setAccessResult(
      verifyBuyerPitchAccess(pitchRoom, {
        passcode: verifyPasscode,
        nowMs: checkNow,
        preferredLanguage: verifyLang,
      }),
    );
  };

  return (
    <section aria-labelledby={`${uid}-wb-heading`} className="gvos-workbench">
      <div className="gvos-workbench-head">
        <h3 id={`${uid}-wb-heading`} className="gvos-title">
          성장 단계 5대 인터랙티브 워크벤치
        </h3>
        <p className="gvos-subtitle">
          드로잉 방송 스포일러 자동 블러, 해외 바이어 영·일문 피치 룸, 멘토 라이브 첨삭, 오프라인 이어 그리기, 휴재기 캐릭터 Q&amp;A를 바로 시험하고 검증합니다.
        </p>
      </div>

      <div className="gvos-tablist" role="tablist" aria-label="성장 단계 5대 기능 선택">
        {WORKBENCH_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${uid}-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`${uid}-panel-${tab.id}`}
            data-testid={`gvos-tab-${tab.id}`}
            className="gvos-tab"
            onClick={() => onSelectTab(tab.id)}
          >
            {renderTabIcon(tab.id)}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === "live-broadcast" ? (
        <div
          role="tabpanel"
          id={`${uid}-panel-live-broadcast`}
          aria-labelledby={`${uid}-tab-live-broadcast`}
          data-testid="gvos-panel-live-broadcast"
          className="gvos-panel-grid"
        >
          <div className="gvos-card">
            <h4 className="gvos-card-title">방송 송출·자동 블러 마스크 설정</h4>
            <div className="gvos-field-group">
              <label htmlFor={`${uid}-stream-preset`} className="gvos-field-label">
                방송 플랫폼 송출 프리셋
              </label>
              <select
                id={`${uid}-stream-preset`}
                className="gvos-select"
                value={streamPreset}
                onChange={(event) => setStreamPreset(event.target.value as LiveBroadcastStreamPreset)}
              >
                <option value="chzzk-1080p60">치지직 1080p 60fps 저지연</option>
                <option value="youtube-1080p60">유튜브 라이브 1080p 60fps</option>
                <option value="soop-1080p60">SOOP 1080p 60fps</option>
              </select>
            </div>

            <div className="gvos-field-group">
              <label htmlFor={`${uid}-blur-px`} className="gvos-field-label gvos-num">
                미공개 대사·스포일러 블러 강도: {blurRadiusPx}px
              </label>
              <input
                id={`${uid}-blur-px`}
                type="range"
                min={12}
                max={48}
                step={2}
                value={blurRadiusPx}
                className="gvos-range"
                onChange={(event) => setBlurRadiusPx(Number(event.target.value))}
              />
            </div>

            <div className="gvos-actions">
              {[15, 30, 45].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  className={`gvos-btn gvos-num ${shortsTargetSec === sec ? "gvos-btn-primary" : ""}`}
                  onClick={() => setShortsTargetSec(sec)}
                >
                  타임랩스 {sec}초 쇼츠
                </button>
              ))}
              <button
                type="button"
                className="gvos-btn"
                data-testid="gvos-toggle-extra-spoiler"
                onClick={() => setExtraSpoilerLocked((prev) => !prev)}
              >
                {extraSpoilerLocked ? "25화 콘티 레이어 제거" : "25화 미공개 콘티 추가 시험"}
              </button>
            </div>
          </div>

          <div className="gvos-card">
            <div className="gvos-list-item-row">
              <h4 className="gvos-card-title">자동 블러 &amp; 9:16 30fps 쇼츠 추출 결과</h4>
              <span className="gvos-status-pill" data-tone="good" data-testid="gvos-live-protection-badge">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                누출 {livePlan.spoilerLeakCount}건 · 보호 통과
              </span>
            </div>
            <p className="text-xs text-fg-2 gvos-num">
              {livePlan.streamSpec.label} ({livePlan.streamSpec.bitrateKbps} kbps) · 공개 레이어{" "}
              {livePlan.visibleLayerIds.length}개 · 자동 블러 {livePlan.blurMasks.length}개
            </p>
            <ul className="gvos-list" data-testid="gvos-blur-mask-list">
              {livePlan.blurMasks.map((mask) => (
                <li key={mask.layerId} className="gvos-list-item">
                  <div className="gvos-list-item-row">
                    <strong>{mask.layerName}</strong>
                    <span className="gvos-status-pill gvos-num" data-tone="warn">
                      블러 {mask.blurRadiusPx}px
                    </span>
                  </div>
                  <span className="text-xs text-fg-2">
                    {mask.reason} · 마스크 영역 {mask.rect.width}×{mask.rect.height}
                  </span>
                </li>
              ))}
            </ul>
            <div className="gvos-list-item gvos-num" data-testid="gvos-shorts-summary">
              <strong>
                쇼츠 패키지: {livePlan.shortsExport.aspectRatio} ({livePlan.shortsExport.width}×
                {livePlan.shortsExport.height}) · {livePlan.shortsExport.fps}fps ·{" "}
                {livePlan.shortsExport.durationSec}초 ({livePlan.shortsExport.totalFrames}프레임)
              </strong>
              <span className="text-xs text-fg-2">
                {livePlan.shortsExport.speedupFactor}배속 · 스포일러 구간{" "}
                {livePlan.shortsExport.excludedSpoilerSliceIds.length}개 자동 제외 · 하이라이트{" "}
                {livePlan.shortsExport.highlightSegments.length}구간
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "buyer-pitch" ? (
        <div
          role="tabpanel"
          id={`${uid}-panel-buyer-pitch`}
          aria-labelledby={`${uid}-tab-buyer-pitch`}
          data-testid="gvos-panel-buyer-pitch"
          className="gvos-panel-grid"
        >
          <div className="gvos-card">
            <h4 className="gvos-card-title">1클릭 영·일문 바이어 피치 룸 발급</h4>
            <div className="gvos-field-group">
              <label htmlFor={`${uid}-buyer-org`} className="gvos-field-label">
                초대 해외 바이어 기관명
              </label>
              <input
                id={`${uid}-buyer-org`}
                type="text"
                className="gvos-input"
                value={buyerOrg}
                onChange={(event) => setBuyerOrg(event.target.value)}
              />
            </div>
            <div className="gvos-field-group">
              <label htmlFor={`${uid}-room-pass`} className="gvos-field-label">
                피치 룸 접근 비밀번호 (6자 이상 · 해시 저장)
              </label>
              <input
                id={`${uid}-room-pass`}
                type="text"
                className="gvos-input"
                value={roomPasscode}
                onChange={(event) => setRoomPasscode(event.target.value)}
              />
            </div>
            <div className="gvos-actions">
              {[24, 72, 168].map((hours) => (
                <button
                  key={hours}
                  type="button"
                  className={`gvos-btn gvos-num ${expiresInHours === hours ? "gvos-btn-primary" : ""}`}
                  onClick={() => setExpiresInHours(hours)}
                >
                  만료 {hours}시간
                </button>
              ))}
              <button
                type="button"
                className="gvos-btn gvos-btn-primary"
                data-testid="gvos-create-pitch-btn"
                onClick={handleRebuildPitchRoom}
              >
                피치 룸 패키지 갱신
              </button>
            </div>

            <div className="gvos-list-item">
              <strong>{pitchRoom.sharePath}</strong>
              <span className="text-xs text-fg-2">워터마크: {pitchRoom.watermark.text}</span>
              <span className="gvos-code-inline" data-testid="gvos-pitch-hash">
                해시: {pitchRoom.passcodeHash}
              </span>
            </div>
          </div>

          <div className="gvos-card">
            <h4 className="gvos-card-title">바이어 접근 검증 &amp; EN/JA 패키지 미리보기</h4>
            <div className="gvos-field-group">
              <label htmlFor={`${uid}-verify-pass`} className="gvos-field-label">
                바이어 입력 비밀번호 검증
              </label>
              <input
                id={`${uid}-verify-pass`}
                type="text"
                className="gvos-input"
                value={verifyPasscode}
                onChange={(event) => setVerifyPasscode(event.target.value)}
              />
            </div>
            <div className="gvos-actions">
              <button
                type="button"
                className={`gvos-btn ${verifyLang === "en" ? "gvos-btn-primary" : ""}`}
                onClick={() => setVerifyLang("en")}
              >
                English (EN)
              </button>
              <button
                type="button"
                className={`gvos-btn ${verifyLang === "ja" ? "gvos-btn-primary" : ""}`}
                onClick={() => setVerifyLang("ja")}
              >
                日本語 (JA)
              </button>
              <button
                type="button"
                className="gvos-btn gvos-btn-primary"
                data-testid="gvos-verify-pitch-btn"
                onClick={() => handleVerifyPitch(false)}
              >
                열람 검증 실행
              </button>
              <button
                type="button"
                className="gvos-btn"
                data-testid="gvos-verify-expired-btn"
                onClick={() => handleVerifyPitch(true)}
              >
                만료 링크 차단 시험
              </button>
            </div>

            <div className="gvos-list-item" data-testid="gvos-pitch-access-result">
              <div className="gvos-list-item-row">
                <strong>접근 판정</strong>
                <span className="gvos-status-pill" data-tone={accessResult.granted ? "good" : "bad"}>
                  {accessResult.granted ? "열람 허용" : `차단 (${accessResult.reason})`}
                </span>
              </div>
              <span className="text-xs text-fg-2">{accessResult.messageKo}</span>
              <span className="text-xs text-fg-2 gvos-num">
                샘플 {pitchRoom.sampleEpisodes.length}화 · 캐릭터 시트 {pitchRoom.characterSheets.length}종 · 완독률{" "}
                {pitchRoom.metricsSummary.completionRatePct}%
              </span>
              <span className="text-xs font-semibold">
                {verifyLang === "en"
                  ? pitchRoom.metricsSummary.pitchHeadlineEn
                  : pitchRoom.metricsSummary.pitchHeadlineJa}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      <GrowthWorkbenchSecondaryTabs activeTab={activeTab} uid={uid} />
    </section>
  );
}
