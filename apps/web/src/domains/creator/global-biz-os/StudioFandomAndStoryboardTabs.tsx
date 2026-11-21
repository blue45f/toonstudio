import { Camera, CheckCircle2, Coins } from "lucide-react";

import {
  DIRECTOR_STYLE_OPTIONS,
  FANDOM_LICENSE_TIERS,
  FANDOM_LICENSE_TIER_LIST,
  OMNIBUS_VIRTUAL_STUDIO_EVENT,
  type DirectedStoryboardShot,
  type FandomLicenseLedgerEntry,
  type FandomLicenseTierId,
  type FandomRevenueSplitShares,
  type FandomSplitInvariantCheck,
  type OmnibusVirtualStudioPresetPayload,
  type StoryboardDirectionPlan,
  type StoryboardDirectorStyle,
} from "./fandom-ip-storyboard-omnibus-engine";
import { formatCurrencyAmount } from "./studio-bep-crossborder-tax-engine";

function parseNumericInput(raw: string, fallback = 0): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface StudioFandomIpTabViewProps {
  readonly fandomTierId: FandomLicenseTierId;
  readonly derivativeProjectTitle: string;
  readonly derivativeCreatorName: string;
  readonly fandomUnitsSold: number;
  readonly fandomGrossSalesKrw: number;
  readonly fandomShares: FandomRevenueSplitShares;
  readonly fandomInvariant: FandomSplitInvariantCheck;
  readonly fandomPreviewEntry: FandomLicenseLedgerEntry;
  readonly fandomEntries: readonly FandomLicenseLedgerEntry[];
  readonly fandomStatusBanner: string | null;
  readonly showFandomCsvPreview: boolean;
  readonly fandomCsvText: string;
  readonly onSelectTier: (tierId: FandomLicenseTierId) => void;
  readonly onChangeProjectTitle: (value: string) => void;
  readonly onChangeCreatorName: (value: string) => void;
  readonly onChangeUnitsSold: (value: number) => void;
  readonly onChangeGrossSales: (value: number) => void;
  readonly onChangeShares: (updater: (prev: FandomRevenueSplitShares) => FandomRevenueSplitShares) => void;
  readonly onRebalanceShares: () => void;
  readonly onRegisterEntry: () => void;
  readonly onToggleCsvPreview: () => void;
}

export function StudioFandomIpTabView({
  fandomTierId,
  derivativeProjectTitle,
  derivativeCreatorName,
  fandomUnitsSold,
  fandomGrossSalesKrw,
  fandomShares,
  fandomInvariant,
  fandomPreviewEntry,
  fandomEntries,
  fandomStatusBanner,
  showFandomCsvPreview,
  fandomCsvText,
  onSelectTier,
  onChangeProjectTitle,
  onChangeCreatorName,
  onChangeUnitsSold,
  onChangeGrossSales,
  onChangeShares,
  onRebalanceShares,
  onRegisterEntry,
  onToggleCsvPreview,
}: StudioFandomIpTabViewProps) {
  return (
    <div
      id="gbiz-panel-fandom"
      role="tabpanel"
      aria-labelledby="gbiz-tab-fandom"
      className="gbiz-panel"
      data-testid="gbiz-panel-fandom"
    >
      <div className="gbiz-btn-row" role="group" aria-label="팬덤 2차 창작 라이선스 단계">
        {FANDOM_LICENSE_TIER_LIST.map((tier) => (
          <button
            key={tier.id}
            type="button"
            className="gbiz-btn"
            data-testid={`fandom-tier-${tier.id}`}
            data-active={fandomTierId === tier.id ? "true" : "false"}
            onClick={() => onSelectTier(tier.id)}
          >
            {tier.labelKo}
          </button>
        ))}
      </div>

      <div className="gbiz-split-layout">
        <div className="gbiz-card">
          <h4 className="gbiz-card-title">
            {FANDOM_LICENSE_TIERS[fandomTierId].labelKo} · 4자 수익 쉐어 설정
          </h4>
          <p className="gbiz-subtitle">{FANDOM_LICENSE_TIERS[fandomTierId].summaryKo}</p>

          <div className="gbiz-field-grid">
            <label className="gbiz-field">
              <span>2차 창작 프로젝트명</span>
              <input
                type="text"
                className="gbiz-input"
                value={derivativeProjectTitle}
                onChange={(e) => onChangeProjectTitle(e.target.value)}
              />
            </label>
            <label className="gbiz-field">
              <span>2차 창작자 / 팀명</span>
              <input
                type="text"
                className="gbiz-input"
                value={derivativeCreatorName}
                onChange={(e) => onChangeCreatorName(e.target.value)}
              />
            </label>
            <label className="gbiz-field">
              <span>판매 수량 (개)</span>
              <input
                type="number"
                min={0}
                className="gbiz-input"
                value={fandomUnitsSold}
                onChange={(e) => onChangeUnitsSold(parseNumericInput(e.target.value, 0))}
              />
            </label>
            <label className="gbiz-field">
              <span>총 매출 (KRW)</span>
              <input
                type="number"
                min={0}
                step={100000}
                className="gbiz-input"
                value={fandomGrossSalesKrw}
                onChange={(e) => onChangeGrossSales(parseNumericInput(e.target.value, 0))}
              />
            </label>
            <label className="gbiz-field">
              <span>원작자 분배율 (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                aria-label="원작자 분배율 (%)"
                className="gbiz-input"
                value={fandomShares.originalAuthorPercent}
                onChange={(e) =>
                  onChangeShares((prev) => ({
                    ...prev,
                    originalAuthorPercent: parseNumericInput(e.target.value, 0),
                  }))
                }
              />
            </label>
            <label className="gbiz-field">
              <span>스튜디오 분배율 (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                aria-label="스튜디오 분배율 (%)"
                className="gbiz-input"
                value={fandomShares.studioPercent}
                onChange={(e) =>
                  onChangeShares((prev) => ({
                    ...prev,
                    studioPercent: parseNumericInput(e.target.value, 0),
                  }))
                }
              />
            </label>
            <label className="gbiz-field">
              <span>2차 창작자 분배율 (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                aria-label="2차 창작자 분배율 (%)"
                className="gbiz-input"
                value={fandomShares.derivativeCreatorPercent}
                onChange={(e) =>
                  onChangeShares((prev) => ({
                    ...prev,
                    derivativeCreatorPercent: parseNumericInput(e.target.value, 0),
                  }))
                }
              />
            </label>
            <label className="gbiz-field">
              <span>플랫폼 분배율 (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                aria-label="플랫폼 분배율 (%)"
                className="gbiz-input"
                value={fandomShares.platformPercent}
                onChange={(e) =>
                  onChangeShares((prev) => ({
                    ...prev,
                    platformPercent: parseNumericInput(e.target.value, 0),
                  }))
                }
              />
            </label>
          </div>

          <div
            className="gbiz-banner"
            data-testid="fandom-split-invariant-badge"
            data-tone={fandomInvariant.valid ? "good" : "bad"}
          >
            {fandomInvariant.valid
              ? `분배율 합계 ${fandomInvariant.totalPercent}% · 100% 불변식 통과 (원장 코드 미리보기: ${fandomPreviewEntry.ledgerCode})`
              : fandomInvariant.errorKo}
          </div>

          <div className="gbiz-btn-row">
            <button
              type="button"
              className="gbiz-btn"
              data-testid="fandom-rebalance-btn"
              onClick={onRebalanceShares}
            >
              100% 자동 맞춤
            </button>
            <button
              type="button"
              className="gbiz-btn gbiz-btn-primary"
              data-testid="fandom-register-entry-btn"
              onClick={onRegisterEntry}
            >
              <Coins className="size-4" aria-hidden="true" />
              수익 쉐어 원장 등록
            </button>
          </div>

          {fandomStatusBanner ? (
            <div
              className="gbiz-banner"
              data-testid="fandom-status-banner"
              data-tone={fandomStatusBanner.includes("등록 완료") ? "good" : "warn"}
            >
              {fandomStatusBanner}
            </div>
          ) : null}
        </div>

        <div className="gbiz-card">
          <div className="gbiz-btn-row" style={{ justifyContent: "space-between" }}>
            <h4 className="gbiz-card-title">투명 수익 분배 계약 원장 ({fandomEntries.length}건)</h4>
            <button type="button" className="gbiz-btn" onClick={onToggleCsvPreview}>
              {showFandomCsvPreview ? "CSV 닫기" : "원장 CSV 보기"}
            </button>
          </div>

          <div className="gbiz-table-wrap">
            <table className="gbiz-table" aria-label="팬덤 2차 창작 투명 분배 원장">
              <thead>
                <tr>
                  <th>코드</th>
                  <th>프로젝트 · 단계</th>
                  <th>원작자</th>
                  <th>스튜디오</th>
                  <th>2차 창작자</th>
                  <th>플랫폼</th>
                </tr>
              </thead>
              <tbody>
                {fandomEntries.map((entry) => (
                  <tr key={entry.ledgerCode}>
                    <td>{entry.ledgerCode}</td>
                    <td>
                      <strong>{entry.derivativeProjectTitle}</strong>
                      <div>{entry.tierLabelKo}</div>
                    </td>
                    <td>{formatCurrencyAmount(entry.payouts.originalAuthorKrw, "KRW")}</td>
                    <td>{formatCurrencyAmount(entry.payouts.studioKrw, "KRW")}</td>
                    <td>{formatCurrencyAmount(entry.payouts.derivativeCreatorKrw, "KRW")}</td>
                    <td>{formatCurrencyAmount(entry.payouts.platformKrw, "KRW")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {showFandomCsvPreview ? (
            <pre className="gbiz-code-preview" data-testid="fandom-ledger-csv-preview">
              {fandomCsvText}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export interface StudioStoryboardOmnibusTabViewProps {
  readonly episodeLabel: string;
  readonly directorStyle: StoryboardDirectorStyle;
  readonly novelText: string;
  readonly storyboardPlan: StoryboardDirectionPlan;
  readonly syncedPreset: OmnibusVirtualStudioPresetPayload | null;
  readonly onChangeEpisodeLabel: (value: string) => void;
  readonly onChangeDirectorStyle: (style: StoryboardDirectorStyle) => void;
  readonly onChangeNovelText: (value: string) => void;
  readonly onSyncShot: (shot: DirectedStoryboardShot) => void;
}

export function StudioStoryboardOmnibusTabView({
  episodeLabel,
  directorStyle,
  novelText,
  storyboardPlan,
  syncedPreset,
  onChangeEpisodeLabel,
  onChangeDirectorStyle,
  onChangeNovelText,
  onSyncShot,
}: StudioStoryboardOmnibusTabViewProps) {
  return (
    <div
      id="gbiz-panel-storyboard"
      role="tabpanel"
      aria-labelledby="gbiz-tab-storyboard"
      className="gbiz-panel"
      data-testid="gbiz-panel-storyboard"
    >
      <div className="gbiz-split-layout">
        <div className="gbiz-card">
          <h4 className="gbiz-card-title">웹소설 원문 → 씬·컷 스토리보드 디렉터</h4>
          <div className="gbiz-field-grid">
            <label className="gbiz-field">
              <span>회차 라벨</span>
              <input
                type="text"
                className="gbiz-input"
                value={episodeLabel}
                onChange={(e) => onChangeEpisodeLabel(e.target.value)}
              />
            </label>
            <label className="gbiz-field">
              <span>연출 스타일</span>
              <select
                aria-label="연출 스타일"
                className="gbiz-select"
                value={directorStyle}
                onChange={(e) => onChangeDirectorStyle(e.target.value as StoryboardDirectorStyle)}
              >
                {DIRECTOR_STYLE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.labelKo} — {option.summaryKo}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="gbiz-field">
            <span>웹소설 원문 (빈 줄로 컷 단위 분리)</span>
            <textarea
              className="gbiz-textarea"
              value={novelText}
              onChange={(e) => onChangeNovelText(e.target.value)}
            />
          </label>

          <div className="gbiz-banner" data-tone="good">
            총 {storyboardPlan.totalScenes}개 씬 · {storyboardPlan.totalCuts}개 컷 분해 완료 (
            {storyboardPlan.directorStyleLabelKo})
          </div>
        </div>

        <div className="gbiz-card" data-testid="omnibus-sync-bridge-card">
          <h4 className="gbiz-card-title">실시간 옴니버스 가상 스튜디오 프리셋 브리지</h4>
          {syncedPreset ? (
            <>
              <div className="gbiz-banner" data-tone="good" data-testid="omnibus-sync-status">
                <div className="gbiz-btn-row">
                  <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                  <span>
                    <strong>{syncedPreset.shotId}</strong> 프리셋이 가상 스튜디오 채널(
                    <code>{OMNIBUS_VIRTUAL_STUDIO_EVENT}</code>)에 동기화되었습니다 (#
                    {syncedPreset.syncSequence}).
                  </span>
                </div>
              </div>
              <div className="gbiz-swatch-row">
                <span className="gbiz-swatch">
                  <span
                    className="gbiz-swatch-dot"
                    style={{ backgroundColor: syncedPreset.lightingRig.keyLightOklch }}
                  />
                  키 {syncedPreset.lightingRig.kelvin}K · {syncedPreset.lightingRig.keyLightOklch}
                </span>
                <span className="gbiz-swatch">
                  <span
                    className="gbiz-swatch-dot"
                    style={{ backgroundColor: syncedPreset.lightingRig.rimLightOklch }}
                  />
                  림 {syncedPreset.lightingRig.rimLightOklch}
                </span>
              </div>
              <pre className="gbiz-code-preview" data-testid="omnibus-preset-json-preview">
                {JSON.stringify(syncedPreset, null, 2)}
              </pre>
            </>
          ) : (
            <div className="gbiz-banner">
              아래 컷 카드에서 <strong>가상 스튜디오 프리셋 동기화</strong>를 누르면 카메라 렌즈·구도·OKLCH 조명·3D 액터 블로킹이 실시간 가상 스튜디오 채널(
              <code>{OMNIBUS_VIRTUAL_STUDIO_EVENT}</code>)로 즉시 전달됩니다.
            </div>
          )}
        </div>
      </div>

      <div className="gbiz-field-grid" data-testid="storyboard-shot-list">
        {storyboardPlan.shots.map((shot) => {
          const isSynced = syncedPreset?.shotId === shot.shotId;
          return (
            <article
              key={shot.shotId}
              className="gbiz-shot-card"
              data-synced={isSynced ? "true" : "false"}
              data-testid={`storyboard-shot-${shot.shotId}`}
            >
              <div className="gbiz-btn-row" style={{ justifyContent: "space-between" }}>
                <strong>
                  {shot.shotId} · {shot.beatTypeKo}
                </strong>
                <span>
                  {shot.lensLabelKo} · {shot.framingLabelKo}
                </span>
              </div>
              <p className="gbiz-subtitle">{shot.sourceExcerpt}</p>
              <div className="gbiz-swatch-row">
                <span className="gbiz-swatch">
                  <span
                    className="gbiz-swatch-dot"
                    style={{ backgroundColor: shot.lighting.keyLightOklch }}
                  />
                  {shot.lighting.moodLabelKo} ({shot.lighting.kelvin}K)
                </span>
                <span className="gbiz-swatch">
                  3D Cam ({shot.camera3d.position.x}, {shot.camera3d.position.y},{" "}
                  {shot.camera3d.position.z}m · FOV {shot.camera3d.fovDeg}°)
                </span>
              </div>
              <button
                type="button"
                className="gbiz-btn gbiz-btn-primary"
                data-testid={`sync-omnibus-${shot.shotId}`}
                onClick={() => onSyncShot(shot)}
              >
                <Camera className="size-4" aria-hidden="true" />
                {isSynced ? "가상 스튜디오 동기화됨 (다시 동기화)" : "가상 스튜디오 프리셋 동기화"}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
