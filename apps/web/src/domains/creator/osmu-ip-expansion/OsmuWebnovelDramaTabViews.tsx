import {
  ArrowLeftRight,
  BookOpen,
  Clapperboard,
  Copy,
  FileCode2,
  FileText,
  Users,
} from "lucide-react";

import {
  DRAMA_BUDGET_TIER_SPECS,
  WEBNOVEL_PLATFORM_SPECS,
  type BudgetTierId,
  type DramaFormatId,
  type DramaPitchPackage,
  type DramaPlatformId,
  type NarratorPov,
  type WebnovelAdaptationResult,
  type WebnovelPlatformId,
  type WebtoonOutlineFromNovelResult,
} from "./osmu-webnovel-drama-engine";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export type WebnovelDirectionMode = "webtoon-to-novel" | "novel-to-webtoon";
export type ExportPreviewFormat = "none" | "markdown" | "json";

interface WebnovelBidirectionalTabViewProps {
  readonly direction: WebnovelDirectionMode;
  readonly platform: WebnovelPlatformId;
  readonly pov: NarratorPov;
  readonly novelResult: WebnovelAdaptationResult;
  readonly reverseInput: string;
  readonly reverseOutline: WebtoonOutlineFromNovelResult;
  readonly exportPreview: ExportPreviewFormat;
  readonly onDirectionChange: (mode: WebnovelDirectionMode) => void;
  readonly onPlatformChange: (platform: WebnovelPlatformId) => void;
  readonly onPovChange: (pov: NarratorPov) => void;
  readonly onReverseInputChange: (value: string) => void;
  readonly onSyncRoundTrip: () => void;
  readonly onToggleExport: (format: ExportPreviewFormat) => void;
  readonly onCopyText: (label: string, text: string) => void;
}

export function WebnovelBidirectionalTabView({
  direction,
  platform,
  pov,
  novelResult,
  reverseInput,
  reverseOutline,
  exportPreview,
  onDirectionChange,
  onPlatformChange,
  onPovChange,
  onReverseInputChange,
  onSyncRoundTrip,
  onToggleExport,
  onCopyText,
}: WebnovelBidirectionalTabViewProps) {
  const bt = useBilingual("StudioOsmuIpExpansionPanel");
  const rangeRatio = Math.min(
    100,
    Math.round((novelResult.charCountWithSpaces / novelResult.platformSpec.targetMaxChars) * 100),
  );

  return (
    <div
      id="osmu-tabpanel-webnovel"
      role="tabpanel"
      aria-labelledby="osmu-tab-webnovel"
      className="mt-4 space-y-4"
    >
      <div className="osmu-card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="osmu-chip"
              data-testid="osmu-direction-to-novel"
              aria-pressed={direction === "webtoon-to-novel"}
              onClick={() => onDirectionChange("webtoon-to-novel")}
            >
              <BookOpen className="size-4" aria-hidden="true" />
              {bt("웹툰 → 웹소설 산문 생성", "Webtoon → Webnovel Prose")}
            </button>
            <button
              type="button"
              className="osmu-chip"
              data-testid="osmu-direction-to-webtoon"
              aria-pressed={direction === "novel-to-webtoon"}
              onClick={() => onDirectionChange("novel-to-webtoon")}
            >
              <ArrowLeftRight className="size-4" aria-hidden="true" />
              {bt("웹소설 → 웹툰 콘티 추출", "Webnovel → Webtoon Conti")}
            </button>
          </div>
          <span
            className="osmu-pill"
            data-tone={novelResult.meetsPlatformRange ? "good" : "warn"}
            data-testid="osmu-novel-range-pill"
          >
            {novelResult.meetsPlatformRange
              ? bt("1화 연재 규격 충족", "Meets 1-Ep Spec")
              : bt("분량 보정 필요", "Length Check")}
            · {novelResult.charCountWithSpaces.toLocaleString("ko-KR")}자
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(["kakaopage", "munpia", "naver-series"] as const).map((platformId) => (
            <button
              key={platformId}
              type="button"
              className="osmu-chip"
              data-testid={`osmu-novel-platform-${platformId}`}
              aria-pressed={platform === platformId}
              onClick={() => onPlatformChange(platformId)}
            >
              {WEBNOVEL_PLATFORM_SPECS[platformId].labelKo}
            </button>
          ))}
          <button
            type="button"
            className="osmu-chip"
            data-testid="osmu-novel-pov-toggle"
            aria-pressed={pov === "first-person"}
            onClick={() =>
              onPovChange(pov === "first-person" ? "third-person-limited" : "first-person")
            }
          >
            {pov === "first-person"
              ? bt("시점: 1인칭 주인공", "POV: First Person")
              : bt("시점: 3인칭 제한", "POV: Third-Person Limited")}
          </button>
        </div>

        <div className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-2">
            <span>{novelResult.platformSpec.pacingGuideKo}</span>
            <span className="osmu-num font-semibold text-fg">
              목표 {novelResult.platformSpec.targetMinChars.toLocaleString("ko-KR")}~
              {novelResult.platformSpec.targetMaxChars.toLocaleString("ko-KR")}자 · 예상 읽기{" "}
              {novelResult.readingTimeMinutes}분
            </span>
          </div>
          <div className="osmu-meter-track" aria-hidden="true">
            <div className="osmu-meter-fill" style={{ width: `${rangeRatio}%` }} />
          </div>
        </div>
      </div>

      {direction === "webtoon-to-novel" ? (
        <div className="space-y-3" data-testid="osmu-webtoon-to-novel-view">
          <div className="osmu-split-grid">
            <section className="osmu-card space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-fg" data-testid="osmu-novel-chapter-title">
                  {novelResult.chapterTitle}
                </h4>
                <span className="osmu-pill" data-tone="accent">
                  대사 비중 {novelResult.dialogueRatioPercent}%
                </span>
              </div>
              <div className="osmu-banner" data-tone="warn">
                <p className="text-xs font-bold text-fg">{bt("독자 몰입 엔딩 훅", "Cliffhanger Hook")}</p>
                <p className="mt-1 text-xs leading-5 text-fg-2" data-testid="osmu-novel-ending-hook">
                  {novelResult.endingHook}
                </p>
              </div>
              <div className="osmu-prose-box" data-testid="osmu-novel-prose-preview">
                {novelResult.fullProse}
              </div>
            </section>

            <section className="osmu-card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-fg">
                  {bt("화자 대사 인용 자동 정렬표", "Speaker Dialogue Alignment")}
                </h4>
                <span className="osmu-pill" data-tone="good">
                  원본 {novelResult.preservedCutCount}컷 · 대사 {novelResult.preservedDialogueCount}건 보존
                </span>
              </div>
              <ul className="space-y-2 text-xs">
                {novelResult.speakerDialogueAlignment.map((item, idx) => (
                  <li
                    key={`${item.cutNumber}-${idx}`}
                    className="rounded-xl border border-line bg-panel p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-fg">{item.speaker}</strong>
                      <span className="osmu-num text-[0.6875rem] text-fg-3">
                        컷 #{item.cutNumber} · {item.tone}
                      </span>
                    </div>
                    <p className="mt-1 leading-5 text-fg-2">“{item.originalLine}”</p>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  className="osmu-btn"
                  data-testid="osmu-novel-roundtrip-btn"
                  onClick={onSyncRoundTrip}
                >
                  <ArrowLeftRight className="size-4" aria-hidden="true" />
                  {bt("이 산문으로 웹툰 콘티 역추출", "Reverse-Extract Conti")}
                </button>
                <button
                  type="button"
                  className="osmu-btn"
                  data-testid="osmu-novel-md-toggle"
                  aria-pressed={exportPreview === "markdown"}
                  onClick={() =>
                    onToggleExport(exportPreview === "markdown" ? "none" : "markdown")
                  }
                >
                  <FileText className="size-4" aria-hidden="true" />
                  {bt("Markdown 미리보기", "Markdown Preview")}
                </button>
                <button
                  type="button"
                  className="osmu-btn"
                  data-testid="osmu-novel-copy-md"
                  onClick={() => onCopyText("웹소설 1화 원고 Markdown", novelResult.markdownExport)}
                >
                  <Copy className="size-4" aria-hidden="true" />
                  {bt("원고 복사", "Copy Manuscript")}
                </button>
              </div>
            </section>
          </div>

          {exportPreview === "markdown" ? (
            <pre className="osmu-code-box" data-testid="osmu-novel-export-box">
              {novelResult.markdownExport}
            </pre>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3" data-testid="osmu-novel-to-webtoon-view">
          <div className="osmu-split-grid">
            <section className="osmu-card space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="osmu-reverse-novel-input" className="text-sm font-bold text-fg">
                  {bt("웹소설 원문 입력 (자동 콘티·캐릭터 추출)", "Webnovel Source Input")}
                </label>
                <button
                  type="button"
                  className="osmu-btn"
                  data-testid="osmu-reverse-copy-md"
                  onClick={() => onCopyText("웹툰 콘티 시트 Markdown", reverseOutline.markdownExport)}
                >
                  <Copy className="size-4" aria-hidden="true" />
                  {bt("콘티 시트 복사", "Copy Conti Sheet")}
                </button>
              </div>
              <textarea
                id="osmu-reverse-novel-input"
                data-testid="osmu-reverse-novel-textarea"
                className="osmu-textarea"
                value={reverseInput}
                onChange={(event) => onReverseInputChange(event.target.value)}
              />
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="osmu-pill" data-tone="good" data-testid="osmu-reverse-total-cuts">
                  총 {reverseOutline.scenes.length}씬 · {reverseOutline.totalAllocatedCuts}컷 배분
                </span>
                <span className="osmu-pill" data-tone="accent">
                  대사 {reverseOutline.dialogueBlocks.length}건 · 나레이션{" "}
                  {reverseOutline.narrationBlocks.length}건 분리
                </span>
                <span className="osmu-pill" data-tone="warn">
                  보존율 {reverseOutline.roundTripCoverage.preservedTextRatioPercent}%
                </span>
              </div>
            </section>

            <section className="osmu-card space-y-3">
              <h4 className="flex items-center gap-2 text-sm font-bold text-fg">
                <Users className="size-4 text-accent" aria-hidden="true" />
                {bt("추출 등장인물 카드 & 씬별 컷 배분", "Extracted Characters & Scene Cuts")}
              </h4>
              <div className="flex flex-wrap gap-2" data-testid="osmu-reverse-character-cards">
                {reverseOutline.characterCards.map((card) => (
                  <div
                    key={card.name}
                    className="rounded-xl border border-line bg-panel px-3 py-2 text-xs"
                  >
                    <p className="font-bold text-fg">
                      {card.name} · <span className="text-fg-2">{card.roleHint}</span>
                    </p>
                    <p className="osmu-num text-[0.6875rem] text-fg-3">
                      대사 {card.dialogueCount}회 · 첫 등장 씬 #{card.firstAppearanceScene}
                    </p>
                  </div>
                ))}
              </div>
              <ul className="space-y-2 text-xs" data-testid="osmu-reverse-scene-list">
                {reverseOutline.scenes.map((scene) => (
                  <li
                    key={scene.sceneNumber}
                    className="rounded-xl border border-line bg-panel p-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-fg">
                        Scene {scene.sceneNumber}. {scene.heading}
                      </strong>
                      <span className="osmu-pill" data-tone="accent">
                        컷 #{scene.cutStart}~#{scene.cutEnd} ({scene.allocatedCutCount}컷)
                      </span>
                    </div>
                    <p className="mt-1 text-fg-2">
                      패널 {scene.panels.length}개 · 대사{" "}
                      {scene.panels.reduce((sum, p) => sum + p.dialogues.length, 0)}건 · 첫 샷{" "}
                      {scene.panels[0]?.shotSize ?? "WIDE"}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

interface DramaOttPitchTabViewProps {
  readonly platform: DramaPlatformId;
  readonly format: DramaFormatId;
  readonly budgetTier: BudgetTierId;
  readonly pitch: DramaPitchPackage;
  readonly exportPreview: ExportPreviewFormat;
  readonly onPlatformChange: (platform: DramaPlatformId) => void;
  readonly onFormatChange: (format: DramaFormatId) => void;
  readonly onBudgetTierChange: (tier: BudgetTierId) => void;
  readonly onToggleExport: (format: ExportPreviewFormat) => void;
  readonly onCopyText: (label: string, text: string) => void;
}

export function DramaOttPitchTabView({
  platform,
  format,
  budgetTier,
  pitch,
  exportPreview,
  onPlatformChange,
  onFormatChange,
  onBudgetTierChange,
  onToggleExport,
  onCopyText,
}: DramaOttPitchTabViewProps) {
  const bt = useBilingual("StudioOsmuIpExpansionPanel");
  const fitTone =
    pitch.budgetSummary.tierFitAssessment === "예산 상향 권고"
      ? "bad"
      : pitch.budgetSummary.tierFitAssessment === "여유"
        ? "good"
        : "accent";

  return (
    <div
      id="osmu-tabpanel-drama"
      role="tabpanel"
      aria-labelledby="osmu-tab-drama"
      className="mt-4 space-y-4"
      data-testid="osmu-drama-panel"
    >
      <div className="osmu-card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["netflix", "넷플릭스"],
              ["tving", "티빙"],
              ["disney-plus", "디즈니+"],
              ["shortform-drama", "숏폼 드라마"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="osmu-chip"
              data-testid={`osmu-drama-platform-${id}`}
              aria-pressed={platform === id}
              onClick={() => onPlatformChange(id)}
            >
              <Clapperboard className="size-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="osmu-chip"
              data-testid="osmu-drama-format-ott-12ep"
              aria-pressed={format === "ott-12ep"}
              onClick={() => onFormatChange("ott-12ep")}
            >
              {bt("OTT 12부작 (52분)", "OTT 12-Ep (52m)")}
            </button>
            <button
              type="button"
              className="osmu-chip"
              data-testid="osmu-drama-format-shortform-50ep"
              aria-pressed={format === "shortform-50ep"}
              onClick={() => onFormatChange("shortform-50ep")}
            >
              {bt("숏폼 50부작 (2분)", "Shortform 50-Ep (2m)")}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["low", "mid", "tentpole"] as const).map((tier) => (
              <button
                key={tier}
                type="button"
                className="osmu-chip"
                data-testid={`osmu-drama-tier-${tier}`}
                aria-pressed={budgetTier === tier}
                onClick={() => onBudgetTierChange(tier)}
              >
                {DRAMA_BUDGET_TIER_SPECS[tier].labelKo}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="osmu-split-grid">
        <section className="osmu-card space-y-2.5" data-testid="osmu-drama-onepage">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-fg">{bt("1-Page 영상화 기획서", "1-Page Pitch Proposal")}</h4>
            <span className="osmu-pill" data-tone="accent" data-testid="osmu-drama-episode-badge">
              {pitch.onePageProposal.episodeCount}부작 · 회당 {pitch.onePageProposal.runtimePerEpisodeMin}분
            </span>
          </div>
          <p className="rounded-xl border border-line bg-panel p-3 text-xs leading-6 text-fg">
            <strong>로그라인:</strong> {pitch.onePageProposal.logline}
          </p>
          <p className="text-xs leading-5 text-fg-2">
            <strong>타겟 시청층:</strong> {pitch.onePageProposal.targetAudience.primary} ·{" "}
            {pitch.onePageProposal.targetAudience.secondary}
          </p>
          <ul className="list-disc space-y-1 pl-4 text-xs leading-5 text-fg-2">
            {pitch.onePageProposal.differentiators.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="osmu-card space-y-2.5" data-testid="osmu-drama-budget-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-fg">{bt("제작비 티어 · VFX 적합성", "Budget Tier & VFX Fit")}</h4>
            <span className="osmu-pill" data-tone={fitTone} data-testid="osmu-drama-tier-fit">
              {pitch.budgetSummary.tierFitAssessment}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-line bg-panel p-2.5">
              <dt className="text-fg-3">회당 제작비</dt>
              <dd className="osmu-num mt-1 text-sm font-black text-fg">
                {pitch.budgetSummary.perEpisodeMillionKrw.toLocaleString("ko-KR")}백만 원
              </dd>
            </div>
            <div className="rounded-xl border border-line bg-panel p-2.5">
              <dt className="text-fg-3">시즌 총 예산</dt>
              <dd className="osmu-num mt-1 text-sm font-black text-fg">
                {pitch.budgetSummary.totalSeasonMillionKrw.toLocaleString("ko-KR")}백만 원
              </dd>
            </div>
          </dl>
          <p className="text-xs leading-5 text-fg-2">{pitch.budgetSummary.recommendationNote}</p>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="osmu-pill" data-tone="warn">
              VFX 비중 {pitch.budgetSummary.vfxBudgetSharePercent}%
            </span>
            <span className="osmu-pill" data-tone="accent">
              로케이션 {pitch.budgetSummary.locationBudgetSharePercent}%
            </span>
            <span className="osmu-pill" data-tone="good">
              캐스팅·스태프 {pitch.budgetSummary.castAndCrewSharePercent}%
            </span>
          </div>
        </section>
      </div>

      <section className="osmu-card space-y-2.5">
        <h4 className="text-sm font-bold text-fg">
          {bt("씬별 로케이션 · VFX 난이도 · 제작비 매트릭스", "Scene Location & VFX Matrix")}
        </h4>
        <div className="osmu-table-wrap">
          <table className="osmu-table">
            <thead>
              <tr>
                <th>씬</th>
                <th>로케이션 구분</th>
                <th>VFX 난이도</th>
                <th>권장 티어</th>
                <th>추정 제작비</th>
                <th>촬영일</th>
              </tr>
            </thead>
            <tbody>
              {pitch.sceneProductionMatrix.map((row) => (
                <tr key={row.sceneId}>
                  <td>
                    <strong>{row.sceneId}</strong> {row.title}
                  </td>
                  <td>
                    {row.locationTag} ({row.locationTier})
                  </td>
                  <td className="osmu-num">
                    {row.vfxDifficulty} ({row.vfxScore}점)
                  </td>
                  <td>{DRAMA_BUDGET_TIER_SPECS[row.recommendedBudgetTier].labelKo}</td>
                  <td className="osmu-num">{row.estimatedSceneCostMillionKrw}백만 원</td>
                  <td className="osmu-num">{row.shootingDays}일</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="osmu-split-grid">
        <section className="osmu-card space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-fg">
              {bt("4막 시즌 아크 미리보기", "4-Act Season Arc Preview")} ({pitch.seasonArc.length}부작)
            </h4>
          </div>
          <ul className="max-h-64 space-y-2 overflow-y-auto pr-1 text-xs" data-testid="osmu-drama-arc-list">
            {pitch.seasonArc.slice(0, 12).map((ep) => (
              <li key={ep.episodeNumber} className="rounded-xl border border-line bg-panel p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-fg">{ep.title}</strong>
                  <span className="osmu-num text-[0.6875rem] text-fg-3">
                    {ep.actNumber}막 · 텐션 {ep.tensionScore}
                  </span>
                </div>
                <p className="mt-1 leading-5 text-fg-2">{ep.beatSummary}</p>
              </li>
            ))}
          </ul>
          {pitch.seasonArc.length > 12 ? (
            <p className="text-[0.6875rem] text-fg-3">
              총 {pitch.seasonArc.length}화 전체 시즌 아크가 JSON 패키지에 포함됩니다.
            </p>
          ) : null}
        </section>

        <section className="osmu-card space-y-2.5">
          <h4 className="text-sm font-bold text-fg">{bt("주조연 캐스팅 프로필 시트", "Casting Profile Sheet")}</h4>
          <ul className="space-y-2 text-xs" data-testid="osmu-drama-casting-list">
            {pitch.castingProfiles.map((profile) => (
              <li key={profile.characterName} className="rounded-xl border border-line bg-panel p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-fg">
                    {profile.characterName} ({profile.roleLabelKo} · {profile.ageRange})
                  </strong>
                  <span className="osmu-pill" data-tone="accent">
                    분량 {profile.screenTimeSharePercent}%
                  </span>
                </div>
                <p className="mt-1 text-fg-2">{profile.visualVibe}</p>
                <p className="mt-1 text-[0.6875rem] text-fg-3">{profile.auditionSidePrompt}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="osmu-btn"
          data-testid="osmu-drama-export-md-btn"
          aria-pressed={exportPreview === "markdown"}
          onClick={() => onToggleExport(exportPreview === "markdown" ? "none" : "markdown")}
        >
          <FileText className="size-4" aria-hidden="true" />
          {bt("피칭 바이블 Markdown", "Pitch Bible Markdown")}
        </button>
        <button
          type="button"
          className="osmu-btn"
          data-testid="osmu-drama-export-json-btn"
          aria-pressed={exportPreview === "json"}
          onClick={() => onToggleExport(exportPreview === "json" ? "none" : "json")}
        >
          <FileCode2 className="size-4" aria-hidden="true" />
          {bt("제작 패키지 JSON", "Production JSON")}
        </button>
        <button
          type="button"
          className="osmu-btn"
          data-testid="osmu-drama-copy-json"
          onClick={() => onCopyText("웹드라마 피칭 패키지 JSON", pitch.jsonExport)}
        >
          <Copy className="size-4" aria-hidden="true" />
          {bt("JSON 복사", "Copy JSON")}
        </button>
      </div>

      {exportPreview !== "none" ? (
        <pre className="osmu-code-box" data-testid="osmu-drama-export-box">
          {exportPreview === "json" ? pitch.jsonExport : pitch.markdownExport}
        </pre>
      ) : null}
    </div>
  );
}
