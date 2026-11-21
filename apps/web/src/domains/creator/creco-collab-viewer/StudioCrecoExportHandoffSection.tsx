import { useMemo, useState } from "react";

import { getStageMeta } from "./creco-version-compare-engine";
import {
  WEBTOON_PLATFORM_SPECS,
  buildMultiSpecExportManifest,
  type ExportQualityTier,
  type ExportResizeMode,
  type WebtoonPlatformId,
} from "./creco-export-shortcuts-engine";

export interface StudioCrecoExportHandoffSectionProps {
  readonly projectAbbreviation: string;
  readonly episodeNumber: number;
  readonly activeVersionLabel: string;
  readonly activeVersionDigest: string;
  readonly cutCount: number;
  readonly unresolvedPinCount: number;
  readonly onAnnounce: (message: string) => void;
}

export function StudioCrecoExportHandoffSection({
  projectAbbreviation,
  episodeNumber,
  activeVersionLabel,
  activeVersionDigest,
  cutCount,
  unresolvedPinCount,
  onAnnounce,
}: StudioCrecoExportHandoffSectionProps) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<readonly WebtoonPlatformId[]>([
    "naver-webtoon",
    "kakao-webtoon",
    "piccoma-linemanga",
    "webtoon-global",
  ]);
  const [resizeMode, setResizeMode] = useState<ExportResizeMode>("fixed-slice");
  const [quality, setQuality] = useState<ExportQualityTier>("best");
  const [includeThumbnails, setIncludeThumbnails] = useState<boolean>(true);
  const [includeHandoffPack, setIncludeHandoffPack] = useState<boolean>(true);

  const exportManifest = useMemo(
    () =>
      buildMultiSpecExportManifest({
        projectAbbreviation,
        episodeNumber,
        versionLabel: activeVersionLabel,
        versionDigest: activeVersionDigest,
        cutCount,
        unresolvedPinCount,
        platformIds: selectedPlatforms,
        resizeMode,
        quality,
        includeThumbnails,
        includeHandoffPack,
      }),
    [
      activeVersionDigest,
      activeVersionLabel,
      cutCount,
      episodeNumber,
      includeHandoffPack,
      includeThumbnails,
      projectAbbreviation,
      quality,
      resizeMode,
      selectedPlatforms,
      unresolvedPinCount,
    ],
  );

  const togglePlatform = (platformId: WebtoonPlatformId) => {
    setSelectedPlatforms((prev) => {
      if (prev.includes(platformId)) {
        return prev.length > 1 ? prev.filter((item) => item !== platformId) : prev;
      }
      return [...prev, platformId];
    });
  };

  return (
    <section className="ccv-card" aria-label="6대 플랫폼 다중 규격 및 대타 인수인계 내보내기">
      <div className="ccv-card-head">
        <h3 className="ccv-card-title">
          6대 웹툰 플랫폼 다중 규격 내보내기 & 대타·이어그리기 인수인계 번들
        </h3>
        <span className="ccv-pill ccv-pill-accent ccv-num" data-testid="ccv-export-manifest-id">
          매니페스트: {exportManifest.manifestId}
        </span>
      </div>

      <div className="ccv-badge-row">
        {WEBTOON_PLATFORM_SPECS.map((spec) => {
          const active = selectedPlatforms.includes(spec.platformId);
          return (
            <button
              key={spec.platformId}
              type="button"
              className="ccv-btn"
              aria-pressed={active}
              onClick={() => togglePlatform(spec.platformId)}
            >
              {spec.name} ({spec.region} · {spec.widthPx}px)
            </button>
          );
        })}
      </div>

      <div className="ccv-badge-row">
        <select
          aria-label="리사이즈 방식"
          className="ccv-select"
          value={resizeMode}
          onChange={(event) => setResizeMode(event.target.value as ExportResizeMode)}
        >
          <option value="fixed-slice">고정 분할 슬라이스 (플랫폼 표준)</option>
          <option value="fit-width">비율 유지 폭 맞춤</option>
          <option value="original">원본 고해상도 (1600px)</option>
        </select>
        <select
          aria-label="내보내기 품질"
          className="ccv-select"
          value={quality}
          onChange={(event) => setQuality(event.target.value as ExportQualityTier)}
        >
          <option value="best">최고 품질</option>
          <option value="high">고품질</option>
          <option value="standard">일반</option>
        </select>
        <label className="ccv-pill">
          <input
            type="checkbox"
            checked={includeThumbnails}
            onChange={(event) => setIncludeThumbnails(event.target.checked)}
          />
          플랫폼별 표준 썸네일 포함
        </label>
        <label className="ccv-pill">
          <input
            type="checkbox"
            checked={includeHandoffPack}
            onChange={(event) => setIncludeHandoffPack(event.target.checked)}
          />
          대타·이어그리기 인수인계 패키지 포함
        </label>
        <button
          type="button"
          data-testid="ccv-export-build-btn"
          className="ccv-btn ccv-btn-primary"
          onClick={() =>
            onAnnounce(
              `${exportManifest.platforms.length}개 플랫폼 규격(${exportManifest.filePrefix})과 대타 인수인계 매니페스트를 생성했습니다.`,
            )
          }
        >
          다중 규격 패키지 준비
        </button>
      </div>

      <div className="ccv-metrics-grid" data-testid="ccv-export-platform-grid">
        {exportManifest.platforms.map((item) => (
          <div key={item.platformId} className="ccv-metric-card">
            <strong>
              {item.name} ({item.region})
            </strong>
            <span className="ccv-num">
              가로 {item.outputWidthPx}px · 분할 {item.sliceCount}장 · {item.format}
            </span>
            <span className="ccv-subtitle">
              필수 공정: {getStageMeta(item.requiredStage).label} · 썸네일 {item.thumbnailSpec}
            </span>
          </div>
        ))}
      </div>

      {exportManifest.handoffPack.enabled ? (
        <div className="ccv-status-banner" data-testid="ccv-handoff-checklist">
          <strong>대타·이어그리기 인수인계 번들 (게스트 시트 ₩0):</strong>{" "}
          {exportManifest.handoffPack.checklist.join(" / ")}
        </div>
      ) : null}
    </section>
  );
}
