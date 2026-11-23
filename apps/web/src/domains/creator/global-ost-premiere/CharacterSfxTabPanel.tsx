/**
 * 탭 1: `@캐릭터` 바이블 일관성 멘션 · 실시간 렌더 미러 + 글로벌 20개국 원클릭 SFX 리페인팅 뷰.
 */

import { Globe2, Sliders } from "lucide-react";

import {
  GLOBAL_20_LOCALIZATION_LOCALES,
  GLOBAL_OST_PREMIERE_SPRITE_PATHS,
  type CharacterBibleMentionResolution,
  type GlobalLocaleCode,
  type GlobalSfxRepaintBatchPlan,
  type LiveMirrorCompareMode,
} from "./character-mention-and-sfx-repaint";

const QUICK_LOCALE_CODES: readonly GlobalLocaleCode[] = [
  "ko-KR",
  "en-US",
  "ja-JP",
  "ar-SA",
  "es-ES",
  "zh-TW",
  "fr-FR",
  "de-DE",
  "th-TH",
  "he-IL",
];

export interface CharacterSfxTabPanelProps {
  readonly promptText: string;
  readonly onPromptTextChange: (value: string) => void;
  readonly renderInfluence: number;
  readonly onRenderInfluenceChange: (value: number) => void;
  readonly mirrorMode: LiveMirrorCompareMode;
  readonly onMirrorModeChange: (mode: LiveMirrorCompareMode) => void;
  readonly mentionResult: CharacterBibleMentionResolution;
  readonly selectedLocales: readonly GlobalLocaleCode[];
  readonly onToggleLocale: (code: GlobalLocaleCode) => void;
  readonly onSelectAll20Locales: () => void;
  readonly sfxPlan: GlobalSfxRepaintBatchPlan;
}

export function CharacterSfxTabPanel({
  promptText,
  onPromptTextChange,
  renderInfluence,
  onRenderInfluenceChange,
  mirrorMode,
  onMirrorModeChange,
  mentionResult,
  selectedLocales,
  onToggleLocale,
  onSelectAll20Locales,
  sfxPlan,
}: CharacterSfxTabPanelProps) {
  return (
    <div
      className="ts-gop-stack"
      role="tabpanel"
      aria-label="@캐릭터·글로벌 SFX 탭"
      data-testid="gop-tab-panel-character-sfx"
    >
      <div className="ts-gop-grid-2">
        <article className="ts-gop-card">
          <div className="ts-gop-card-head">
            <div className="ts-gop-hero-id">
              <img
                src={GLOBAL_OST_PREMIERE_SPRITE_PATHS.gpen}
                alt=""
                aria-hidden="true"
                className="ts-gop-sprite-sm"
                width={28}
                height={28}
              />
              <div>
                <h3 className="ts-gop-card-title">@캐릭터 바이블 일관성 멘션 &amp; 실시간 미러</h3>
                <p className="ts-gop-subtitle">
                  대본에 @유진·@세라·@카이를 적으면 머리색·의상·팔레트·VRM ID·비율 락이 자동 고정됩니다.
                </p>
              </div>
            </div>
            <span
              className="ts-gop-pill"
              data-tone={mentionResult.consistencyScore >= 85 ? "good" : "warn"}
              data-testid="gop-consistency-score"
            >
              일관성 {mentionResult.consistencyScore}점
            </span>
          </div>

          <label className="ts-gop-label">
            컷 대본 / 프롬프트 (@캐릭터명 입력)
            <textarea
              className="ts-gop-textarea"
              aria-label="@캐릭터 대본 프롬프트"
              value={promptText}
              onChange={(event) => onPromptTextChange(event.target.value)}
            />
          </label>

          <label className="ts-gop-label">
            <span className="ts-gop-between">
              <span>
                <Sliders size={13} aria-hidden="true" /> 단일 렌더 영향도 슬라이더 (Vizcom 방식)
              </span>
              <strong className="ts-gop-num" data-testid="gop-render-influence-value">
                {renderInfluence}% · {mentionResult.mirrorState.stageLabelKo}
              </strong>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={renderInfluence}
              aria-label="렌더 영향도 슬라이더"
              className="ts-gop-range"
              onChange={(event) => onRenderInfluenceChange(Number(event.target.value))}
            />
          </label>

          <div className="ts-gop-row" role="group" aria-label="실시간 미러 비교 모드">
            {(
              [
                ["split-side-by-side", "좌/우 실시간 미러"],
                ["slider-wipe", "경계 와이프"],
                ["onion-diff", "윤곽 어니언 비교"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className="ts-gop-chip"
                aria-pressed={mirrorMode === mode}
                onClick={() => onMirrorModeChange(mode)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="ts-gop-mirror-grid" data-testid="gop-realtime-mirror-preview">
            <div className="ts-gop-mirror-pane">
              <strong>{mentionResult.mirrorState.leftPaneLabelKo}</strong>
              <p className="ts-gop-subtitle ts-gop-num">
                원화 선화 보존 {mentionResult.mirrorState.sketchPreservationPercent}%
              </p>
            </div>
            <div className="ts-gop-mirror-pane">
              <strong>{mentionResult.mirrorState.rightPaneLabelKo}</strong>
              <p className="ts-gop-subtitle ts-gop-num">
                렌더 가중치 {mentionResult.mirrorState.aiFinishWeightPercent}% ·{" "}
                {mentionResult.mirrorState.estimatedFrameLatencyMs}ms
              </p>
            </div>
          </div>

          <div className="ts-gop-stack" data-testid="gop-locked-character-list">
            {mentionResult.uniqueEntries.map((entry) => (
              <div key={entry.id} className="ts-gop-subcard">
                <div className="ts-gop-between">
                  <strong>
                    @{entry.mentionHandle} · {entry.displayNameKo} ({entry.roleKo})
                  </strong>
                  <span className="ts-gop-pill" data-tone="cool">
                    {entry.vrmAssetId}
                  </span>
                </div>
                <span className="ts-gop-subtitle">
                  머리: {entry.hairColorKo} · 의상: {entry.outfitSummaryKo}
                </span>
                <span className="ts-gop-subtitle ts-gop-num">
                  비율 락: {entry.proportionLock.lockSummaryKo}
                </span>
                <div className="ts-gop-swatch-row">
                  {entry.signaturePalette.map((swatch) => (
                    <span key={`${entry.id}-${swatch.tokenId}`} className="ts-gop-swatch-chip">
                      <span
                        className="ts-gop-swatch-dot"
                        data-swatch={swatch.tokenId}
                        aria-hidden="true"
                      />
                      {swatch.roleKo} · {swatch.colorNameKo}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="ts-gop-card">
          <div className="ts-gop-card-head">
            <div className="ts-gop-hero-id">
              <img
                src={GLOBAL_OST_PREMIERE_SPRITE_PATHS.bubbleSfx}
                alt=""
                aria-hidden="true"
                className="ts-gop-sprite-sm"
                width={28}
                height={28}
              />
              <div>
                <h3 className="ts-gop-card-title">글로벌 20개국 원클릭 SFX 리페인팅 계획기</h3>
                <p className="ts-gop-subtitle">{sfxPlan.summaryKo}</p>
              </div>
            </div>
            <button
              type="button"
              className="ts-gop-btn"
              data-variant="primary"
              data-testid="gop-select-all-20-locales"
              onClick={onSelectAll20Locales}
            >
              <Globe2 size={14} aria-hidden="true" />
              20개국 전체 선택
            </button>
          </div>

          <div className="ts-gop-row" role="group" aria-label="주요 글로벌 언어 선택">
            {QUICK_LOCALE_CODES.map((code) => {
              const profile = GLOBAL_20_LOCALIZATION_LOCALES.find((item) => item.code === code);
              if (!profile) return null;
              const active = selectedLocales.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  className="ts-gop-chip"
                  aria-pressed={active}
                  onClick={() => onToggleLocale(code)}
                >
                  {profile.languageKo}
                  {profile.direction === "rtl"
                    ? " (RTL)"
                    : profile.writingMode === "vertical-rl"
                      ? " (세로)"
                      : ""}
                </button>
              );
            })}
          </div>

          <div className="ts-gop-stack" data-testid="gop-sfx-locale-plans">
            {sfxPlan.plans.slice(0, 6).map((plan) => (
              <div key={plan.locale.code} className="ts-gop-subcard">
                <div className="ts-gop-between">
                  <strong>
                    {plan.locale.countryKo} · {plan.locale.languageKo} ({plan.locale.nativeName})
                  </strong>
                  <div className="ts-gop-row">
                    <span
                      className="ts-gop-pill"
                      data-tone={plan.rtlMirrored ? "warn" : plan.verticalTypeset ? "cool" : "good"}
                    >
                      {plan.rtlMirrored
                        ? "RTL 미러링"
                        : plan.verticalTypeset
                          ? "세로쓰기 vertical-rl"
                          : "LTR 가로쓰기"}
                    </span>
                    <span className="ts-gop-pill">폭 {plan.bubbleWidthScalePercent}%</span>
                  </div>
                </div>
                <span className="ts-gop-subtitle ts-gop-num">
                  손글씨 SFX 인페인팅 영역 {plan.totalInpaintAreaPx2.toLocaleString("ko-KR")}px² · 예상{" "}
                  {plan.estimatedRepaintSeconds}초
                </span>
                <span className="ts-gop-subtitle">
                  효과음 치환 예시: {plan.items[0]?.localizedText ?? ""} · {plan.locale.sfxStyleNoteKo}
                </span>
              </div>
            ))}
            {sfxPlan.plans.length > 6 ? (
              <p className="ts-gop-subtitle ts-gop-num">
                외 {sfxPlan.plans.length - 6}개국 로컬라이징 계획이 배치에 포함되어 총{" "}
                {sfxPlan.plans.length}개국 일괄 출고 준비가 완료되었습니다.
              </p>
            ) : null}
          </div>
        </article>
      </div>
    </div>
  );
}
