import { useId, useMemo, useState } from "react";
import {
  buildShortformTrailerPlan,
  formatTimecodeSec,
  generateAudioCueSheet,
  localizeWebtoonDialogue,
  packageLocalLoraDataset,
  runCopyrightCleanroomAudit,
  TARGET_LOCALES,
  type ShortformPlatform,
  type TargetLocale,
} from "./audio-localize-cleanroom-engine";
import {
  DEFAULT_AUDIO_SCRIPT_LINES,
  DEFAULT_CLEANROOM_ASSETS,
  DEFAULT_LOCALIZE_INPUT,
  DEFAULT_LORA_SAMPLES,
  DEFAULT_TRAILER_CANDIDATES,
} from "./ip-creative-presets";

const PLATFORM_LABELS: Readonly<Record<ShortformPlatform, string>> = {
  "youtube-shorts": "유튜브 쇼츠 (9:16)",
  "instagram-reels": "인스타그램 릴스 (9:16)",
  tiktok: "틱톡 (9:16)",
};

export function AudioTrailerTab() {
  const idPrefix = useId();
  const [platform, setPlatform] = useState<ShortformPlatform>("youtube-shorts");
  const [targetSec, setTargetSec] = useState(18);
  const [allowSpoilers, setAllowSpoilers] = useState(false);

  const cueSheet = useMemo(
    () => generateAudioCueSheet("18화 · 빗속의 비밀 공조", DEFAULT_AUDIO_SCRIPT_LINES),
    [],
  );

  const trailerPlan = useMemo(
    () =>
      buildShortformTrailerPlan({
        episodeTitle: "18화 · 빗속의 비밀 공조",
        platform,
        targetDurationSec: targetSec,
        allowSpoilers,
        candidates: DEFAULT_TRAILER_CANDIDATES,
      }),
    [platform, targetSec, allowSpoilers],
  );

  return (
    <div className="ipce-panel" data-testid="ipce-panel-media">
      <div className="ipce-grid ipce-grid-2">
        <section className="ipce-card" aria-label="오디오 웹툰 성우 큐시트">
          <div className="ipce-header">
            <h4 className="ipce-card-title">오디오 웹툰·보이스 드라마 성우 큐시트</h4>
            <span className="ipce-pill" data-testid="ipce-cue-total">총 {cueSheet.totalTimecode}</span>
          </div>
          <p className="ipce-subtitle">
            성우 {cueSheet.speakerStats.length}명 · BGM 전환 {cueSheet.bgmTransitions.length}회 · 대사 구간 자동 덕킹(-12dB)
          </p>
          <ul className="ipce-list">
            {cueSheet.rows.map((row) => (
              <li key={row.cueNumber} className="ipce-list-item">
                <div className="ipce-header">
                  <strong>#{row.cueNumber} {row.speaker} · {row.emotionTag}</strong>
                  <span className="ipce-pill">{row.timecodeRange}</span>
                </div>
                <span>{row.textKo}</span>
                <span className="ipce-subtitle">
                  BGM: {row.bgmTrack} ({row.bgmDuckingDb}dB){row.sfxCue ? ` · SFX: ${row.sfxCue}` : ""} · 연출: {row.actorDirectionKo}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="ipce-card" aria-label="9:16 숏폼 모션 트레일러 디렉터">
          <div className="ipce-header">
            <h4 className="ipce-card-title">9:16 숏폼 모션 트레일러 디렉터</h4>
            <span className="ipce-pill" data-testid="ipce-trailer-meta">
              {trailerPlan.canvasSpec.widthPx}×{trailerPlan.canvasSpec.heightPx} · {trailerPlan.beatSyncBpm} BPM
            </span>
          </div>
          <div className="ipce-controls-row">
            <div className="ipce-field">
              <label className="ipce-label" htmlFor={`${idPrefix}-plat`}>배포 플랫폼</label>
              <select
                id={`${idPrefix}-plat`}
                className="ipce-select"
                value={platform}
                onChange={(event) => setPlatform(event.target.value as ShortformPlatform)}
              >
                {(Object.keys(PLATFORM_LABELS) as ShortformPlatform[]).map((key) => (
                  <option key={key} value={key}>{PLATFORM_LABELS[key]}</option>
                ))}
              </select>
            </div>
            <div className="ipce-field">
              <label className="ipce-label" htmlFor={`${idPrefix}-dur`}>목표 길이 ({targetSec}초)</label>
              <input
                id={`${idPrefix}-dur`}
                className="ipce-input"
                type="range"
                min={10}
                max={30}
                value={targetSec}
                onChange={(event) => setTargetSec(Number(event.target.value))}
              />
            </div>
          </div>

          <div className="ipce-controls-row">
            <button
              type="button"
              className="ipce-btn"
              onClick={() => setAllowSpoilers((prev) => !prev)}
            >
              {allowSpoilers ? "스포일러 컷 다시 차단" : `스포일러 컷 차단 중 (${trailerPlan.excludedSpoilerCount}컷 제외)`}
            </button>
            <span className="ipce-pill">
              안전영역 상단 {trailerPlan.safeZoneInsetPx.top}px / 하단 {trailerPlan.safeZoneInsetPx.bottom}px
            </span>
          </div>

          <ul className="ipce-list" data-testid="ipce-trailer-shots">
            {trailerPlan.shots.map((shot) => (
              <li key={shot.sourceCutId} className="ipce-list-item">
                <div className="ipce-header">
                  <strong>샷 {shot.sequenceIndex} · CUT {shot.cutNumber} ({shot.cameraMove})</strong>
                  <span className="ipce-pill">{formatTimecodeSec(shot.startSec)} ~ {formatTimecodeSec(shot.endSec)}</span>
                </div>
                <span>{shot.subtitleOverlayKo}</span>
                <span className="ipce-subtitle">
                  배율 {shot.startScale}→{shot.endScale} · 포커스 ({shot.startX}, {shot.startY})→({shot.endX}, {shot.endY})
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

export function CulturalLocalizationTab() {
  const idPrefix = useId();
  const [sourceTextKo, setSourceTextKo] = useState(DEFAULT_LOCALIZE_INPUT.sourceTextKo);
  const [targetLocale, setTargetLocale] = useState<TargetLocale>(DEFAULT_LOCALIZE_INPUT.targetLocale);
  const [balloonWidth, setBalloonWidth] = useState(DEFAULT_LOCALIZE_INPUT.originalBalloonWidthPx);

  const result = useMemo(
    () =>
      localizeWebtoonDialogue({
        sourceTextKo,
        targetLocale,
        originalBalloonWidthPx: balloonWidth,
        originalBalloonHeightPx: DEFAULT_LOCALIZE_INPUT.originalBalloonHeightPx,
        baseFontSizePx: DEFAULT_LOCALIZE_INPUT.baseFontSizePx,
      }),
    [sourceTextKo, targetLocale, balloonWidth],
  );

  return (
    <div className="ipce-panel" data-testid="ipce-panel-l10n">
      <div className="ipce-controls-row">
        <div className="ipce-field">
          <label className="ipce-label" htmlFor={`${idPrefix}-locale`}>대상 언어·문화권</label>
          <select
            id={`${idPrefix}-locale`}
            className="ipce-select"
            value={targetLocale}
            onChange={(event) => setTargetLocale(event.target.value as TargetLocale)}
          >
            {TARGET_LOCALES.map((spec) => (
              <option key={spec.code} value={spec.code}>
                {spec.labelKo} ({spec.nativeLabel})
              </option>
            ))}
          </select>
        </div>

        <div className="ipce-field">
          <label className="ipce-label" htmlFor={`${idPrefix}-width`}>원본 말풍선 폭 ({balloonWidth}px)</label>
          <input
            id={`${idPrefix}-width`}
            className="ipce-input"
            type="range"
            min={140}
            max={340}
            value={balloonWidth}
            onChange={(event) => setBalloonWidth(Number(event.target.value))}
          />
        </div>
      </div>

      <div className="ipce-field">
        <label className="ipce-label" htmlFor={`${idPrefix}-src`}>한국어 원문 대사·의성어</label>
        <textarea
          id={`${idPrefix}-src`}
          className="ipce-textarea"
          value={sourceTextKo}
          onChange={(event) => setSourceTextKo(event.target.value)}
        />
      </div>

      <div className="ipce-grid ipce-grid-2">
        <section className="ipce-card" aria-label="현지화 말풍선 실시간 미리보기">
          <div className="ipce-header">
            <h4 className="ipce-card-title">현지화 말풍선 자동 교정 미리보기</h4>
            <span className="ipce-pill" data-status={result.overflowRiskAfter === "safe" ? "pass" : "warning"} data-testid="ipce-l10n-mode">
              {result.adjustedBalloon.writingMode === "vertical-rl" ? "세로쓰기 (vertical-rl)" : "가로쓰기 (horizontal-tb)"}
            </span>
          </div>
          <div className="ipce-balloon-stage">
            <div
              className="ipce-balloon-preview"
              data-testid="ipce-l10n-output"
              style={{
                width: `${Math.min(340, result.adjustedBalloon.widthPx)}px`,
                minHeight: `${Math.min(260, result.adjustedBalloon.heightPx)}px`,
                padding: `${result.adjustedBalloon.paddingYPx}px ${result.adjustedBalloon.paddingXPx}px`,
                fontSize: `${result.adjustedBalloon.fontSizePx}px`,
                lineHeight: result.adjustedBalloon.lineHeight,
                writingMode: result.adjustedBalloon.writingMode,
              }}
            >
              {result.localizedText}
            </div>
          </div>
          <p className="ipce-subtitle">
            교정 크기 <strong>{result.adjustedBalloon.widthPx}×{result.adjustedBalloon.heightPx}px</strong> · 권장 폰트 {result.adjustedBalloon.fontFamily} · 넘침 위험 {result.overflowRiskBefore} → {result.overflowRiskAfter}
          </p>
        </section>

        <section className="ipce-card" aria-label="문화 치환 해설">
          <h4 className="ipce-card-title">
            문화 적응 치환 노트 (매칭 관용구·의성어 {result.matchedIdioms.length}건)
          </h4>
          <ul className="ipce-list">
            {result.adaptationNotesKo.map((note) => (
              <li key={note} className="ipce-list-item">{note}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

export function LocalLoraCleanroomTab() {
  const idPrefix = useId();
  const [triggerToken, setTriggerToken] = useState("ts_seoul_noir_ink");
  const [minResolutionPx, setMinResolutionPx] = useState(1024);
  const [cleanroomFixed, setCleanroomFixed] = useState(false);

  const loraManifest = useMemo(
    () =>
      packageLocalLoraDataset({
        styleName: "서울 누아르 수묵 화풍 v1",
        triggerToken,
        authorId: "author-han-seojin",
        minResolutionPx,
        samples: DEFAULT_LORA_SAMPLES,
      }),
    [triggerToken, minResolutionPx],
  );

  const effectiveAssets = useMemo(
    () =>
      DEFAULT_CLEANROOM_ASSETS.map((asset) => {
        if (!cleanroomFixed) return asset;
        return {
          ...asset,
          attributionProvided: true,
          similarityScore: Math.min(asset.similarityScore, 34),
        };
      }),
    [cleanroomFixed],
  );

  const cleanroomReport = useMemo(
    () => runCopyrightCleanroomAudit({ cutId: "EP018-CUT005", assets: effectiveAssets }),
    [effectiveAssets],
  );

  return (
    <div className="ipce-panel" data-testid="ipce-panel-cleanroom">
      <div className="ipce-grid ipce-grid-2">
        <section className="ipce-card" aria-label="작가 화풍 전용 로컬 LoRA 데이터셋 패키저">
          <div className="ipce-header">
            <h4 className="ipce-card-title">작가 화풍 로컬 LoRA 패키저 (ComfyUI / Kohya · ₩0)</h4>
            <span className="ipce-pill" data-status="pass" data-testid="ipce-lora-counts">
              채택 {loraManifest.acceptedSamples.length} / 제외 {loraManifest.excludedSamples.length}
            </span>
          </div>

          <div className="ipce-controls-row">
            <div className="ipce-field">
              <label className="ipce-label" htmlFor={`${idPrefix}-trigger`}>트리거 토큰</label>
              <input
                id={`${idPrefix}-trigger`}
                className="ipce-input"
                type="text"
                value={triggerToken}
                onChange={(event) => setTriggerToken(event.target.value)}
              />
            </div>
            <div className="ipce-field">
              <label className="ipce-label" htmlFor={`${idPrefix}-res`}>최소 해상도 기준</label>
              <select
                id={`${idPrefix}-res`}
                className="ipce-select"
                value={minResolutionPx}
                onChange={(event) => setMinResolutionPx(Number(event.target.value))}
              >
                <option value={768}>768px 이상</option>
                <option value={1024}>1024px 이상 (SDXL/Flux 권장)</option>
                <option value={1280}>1280px 이상 (고정밀)</option>
              </select>
            </div>
          </div>

          <ul className="ipce-list">
            {loraManifest.excludedSamples.map((ex) => (
              <li key={ex.id} className="ipce-list-item">
                <strong>제외: {ex.id} ({ex.reason})</strong>
                <span>{ex.reasonKo}</span>
              </li>
            ))}
          </ul>

          <pre className="ipce-code" data-testid="ipce-lora-json">{loraManifest.manifestJson}</pre>
        </section>

        <section className="ipce-card" aria-label="저작권 클린룸 유사도·출처 사전 검증기">
          <div className="ipce-header">
            <h4 className="ipce-card-title">저작권 클린룸 유사도·출처 사전 검증</h4>
            <span
              className="ipce-pill"
              data-status={cleanroomReport.cleanroomPassed ? "pass" : cleanroomReport.verdict === "review-required" ? "warning" : "critical"}
              data-testid="ipce-cleanroom-verdict"
            >
              {cleanroomReport.cleanroomPassed ? "클린룸 통과" : cleanroomReport.verdict === "review-required" ? "출처 보완 필요" : "내보내기 차단"}
            </span>
          </div>
          <p className="ipce-subtitle">
            인증서 ID <strong>{cleanroomReport.certificateId}</strong> · 위험도 {cleanroomReport.riskScore}/100 · BOM(폰트 {cleanroomReport.bomCounts.font} · 3D {cleanroomReport.bomCounts["3d-asset"]} · 브러시 {cleanroomReport.bomCounts.brush} · 레퍼런스 {cleanroomReport.bomCounts.reference})
          </p>

          <ul className="ipce-list">
            {cleanroomReport.findings.map((finding) => (
              <li key={finding.assetId} className="ipce-list-item">
                <div className="ipce-header">
                  <strong>{finding.assetNameKo}</strong>
                  <span className="ipce-pill" data-status={finding.severity === "blocked" ? "critical" : finding.severity}>
                    {finding.severity === "pass" ? "안전" : finding.severity === "warning" ? "검토" : "차단"}
                  </span>
                </div>
                <span>{finding.messageKo}</span>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="ipce-btn"
            onClick={() => setCleanroomFixed((prev) => !prev)}
          >
            {cleanroomFixed ? "원본 위험 상태로 되돌리기" : "출처 표기·구도 변형 반영 후 재검증"}
          </button>
        </section>
      </div>
    </div>
  );
}
