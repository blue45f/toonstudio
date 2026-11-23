/**
 * 탭 1: 양방향 IP 트랜스포머 (웹툰↔웹소설↔드라마↔Remotion 애니↔게임 에셋/비주얼 노벨) 패널.
 * 모든 색상은 OKLCH 시맨틱 토큰/CSS 클래스로만 표현한다.
 */

import { useMemo, useState } from "react";

import {
  buildCrossMediaTransformPlan,
  CROSS_MEDIA_DIRECTION_CATALOG,
  DEFAULT_IP_RIGHTS_BOM,
  GAME_ENGINE_PROFILES,
  type CrossMediaTransformDirection,
  type DialogueExportFormat,
  type GameAssetRightsEntry,
  type GameEngineTarget,
} from "./ip-game-transformer-engine";

export interface IpGameTransformTabPanelProps {
  readonly projectTitle: string;
  readonly onNotify?: (message: string) => void;
}

const ENGINE_OPTIONS: readonly GameEngineTarget[] = ["unity", "unreal", "godot", "phaser"];

const DIALOGUE_FORMAT_OPTIONS: readonly { readonly value: DialogueExportFormat; readonly labelKo: string }[] = [
  { value: "ink", labelKo: "Ink JSON" },
  { value: "yarn", labelKo: "Yarn JSON" },
  { value: "unity-localization", labelKo: "Unity Localization" },
];

export function IpGameTransformTabPanel({
  projectTitle,
  onNotify,
}: IpGameTransformTabPanelProps) {
  const [direction, setDirection] = useState<CrossMediaTransformDirection>("webtoon-to-game-assets");
  const [targetEngine, setTargetEngine] = useState<GameEngineTarget>("unity");
  const [spriteDirections, setSpriteDirections] = useState<4 | 8>(8);
  const [dialogueFormat, setDialogueFormat] = useState<DialogueExportFormat>("ink");
  const [episodeCount, setEpisodeCount] = useState(6);
  const [includeBlockedDemoAsset, setIncludeBlockedDemoAsset] = useState(false);

  const rightsBom: readonly GameAssetRightsEntry[] = useMemo(() => {
    if (!includeBlockedDemoAsset) return DEFAULT_IP_RIGHTS_BOM;
    return [
      ...DEFAULT_IP_RIGHTS_BOM,
      {
        id: "bom-editorial-restricted",
        assetTitle: "연재 전용 폰트(게임 재배포 불가 샘플)",
        category: "font",
        licenseScope: "editorial-only",
        attributionRequired: true,
        redistributableInBinary: false,
        authorName: "외부 폰트사",
      },
    ];
  }, [includeBlockedDemoAsset]);

  const plan = useMemo(
    () =>
      buildCrossMediaTransformPlan({
        projectTitle,
        direction,
        sourceEpisodeCount: episodeCount,
        panelCountPerEpisode: 60,
        characterCount: 4,
        targetGameEngine: targetEngine,
        spriteDirections,
        dialogueFormat,
        rightsBom,
      }),
    [dialogueFormat, direction, episodeCount, projectTitle, rightsBom, spriteDirections, targetEngine],
  );

  const readinessTone =
    plan.commercialReadiness === "blocked"
      ? "bad"
      : plan.commercialReadiness === "review-needed"
        ? "warn"
        : "good";

  return (
    <div className="img-hub-grid" data-testid="ip-game-transform-panel">
      <section className="img-hub-card" aria-labelledby="ip-dir-heading">
        <div className="img-hub-section-head">
          <h3 id="ip-dir-heading" className="img-hub-section-title">
            <img
              src="/assets/studio/vibrant-sprites/tool-bg3d.webp"
              alt=""
              aria-hidden="true"
              className="img-hub-sprite-img"
            />
            6방향 양방향 IP 변환 선택
          </h3>
          <span className="img-hub-badge img-hub-num" data-tone="cool">
            절감 예상 {plan.estimatedMinutesSaved.toLocaleString("ko-KR")}분
          </span>
        </div>

        <div className="img-hub-pill-row" role="group" aria-label="IP 변환 방향">
          {CROSS_MEDIA_DIRECTION_CATALOG.map((item) => {
            const selected = item.direction === direction;
            return (
              <button
                key={item.direction}
                type="button"
                className="img-hub-pill-btn"
                aria-pressed={selected}
                onClick={() => {
                  setDirection(item.direction);
                  onNotify?.(`${item.labelKo} 변환 파이프라인으로 전환했습니다.`);
                }}
              >
                <img
                  src={item.spritePath}
                  alt=""
                  aria-hidden="true"
                  className="img-hub-sprite-img"
                />
                <span>{item.labelKo}</span>
                <span className="img-hub-badge">{item.shortBadgeKo}</span>
              </button>
            );
          })}
        </div>

        <p className="img-hub-muted">{plan.meta.summaryKo}</p>

        <div className="img-hub-grid img-hub-grid-2">
          <div className="img-hub-subcard">
            <div className="img-hub-section-head">
              <strong className="text-sm font-bold text-fg">대상 엔진 · 스프라이트 · 대사 규격</strong>
              <label className="img-hub-num text-xs font-bold text-fg-2">
                원고 화수
                <select
                  aria-label="변환 대상 원고 화수"
                  className="img-hub-select mt-1"
                  value={episodeCount}
                  onChange={(event) => setEpisodeCount(Number(event.target.value))}
                >
                  <option value={3}>3화 (파일럿)</option>
                  <option value={6}>6화 (단편 시즌)</option>
                  <option value={12}>12화 (정규 시즌)</option>
                </select>
              </label>
            </div>
            <div className="img-hub-pill-row" role="group" aria-label="타깃 게임 엔진">
              {ENGINE_OPTIONS.map((engine) => (
                <button
                  key={engine}
                  type="button"
                  className="img-hub-pill-btn"
                  aria-pressed={targetEngine === engine}
                  onClick={() => setTargetEngine(engine)}
                >
                  {GAME_ENGINE_PROFILES[engine].labelKo}
                </button>
              ))}
            </div>
            <div className="img-hub-pill-row">
              <button
                type="button"
                className="img-hub-pill-btn"
                aria-pressed={spriteDirections === 4}
                onClick={() => setSpriteDirections(4)}
              >
                2D 4방향 아틀라스
              </button>
              <button
                type="button"
                className="img-hub-pill-btn"
                aria-pressed={spriteDirections === 8}
                onClick={() => setSpriteDirections(8)}
              >
                2D 8방향 아틀라스
              </button>
              {DIALOGUE_FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className="img-hub-pill-btn"
                  aria-pressed={dialogueFormat === opt.value}
                  onClick={() => setDialogueFormat(opt.value)}
                >
                  {opt.labelKo}
                </button>
              ))}
            </div>
          </div>

          <div className="img-hub-subcard">
            <div className="img-hub-section-head">
              <strong className="text-sm font-bold text-fg">Rights BOM 상업 출고 자동 감사</strong>
              <span className="img-hub-badge" data-tone={readinessTone}>
                {plan.commercialReadiness === "blocked"
                  ? "출고 차단됨"
                  : plan.commercialReadiness === "review-needed"
                    ? "크레딧 표기 필요"
                    : "상업 출고 승인"}
              </span>
            </div>
            <p className="img-hub-muted">{plan.commercialReadinessSummaryKo}</p>
            <button
              type="button"
              className="img-hub-btn"
              onClick={() => setIncludeBlockedDemoAsset((prev) => !prev)}
            >
              {includeBlockedDemoAsset
                ? "제한 폰트 제거하고 상업 안전 상태로 복원"
                : "연재 전용 폰트 포함해 BOM 차단 시뮬레이션"}
            </button>
            <ul className="img-hub-step-list">
              {plan.continuityChecks.map((check) => (
                <li key={check} className="img-hub-muted">
                  · {check}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="img-hub-card" aria-labelledby="ip-stages-heading">
        <div className="img-hub-section-head">
          <h3 id="ip-stages-heading" className="img-hub-section-title">
            <img
              src="/assets/studio/vibrant-sprites/tech-remotion.webp"
              alt=""
              aria-hidden="true"
              className="img-hub-sprite-img"
            />
            {plan.projectTitle} · {plan.meta.labelKo} 실행 단계
          </h3>
          <span className="img-hub-badge img-hub-num">
            총 {plan.panelCountTotal.toLocaleString("ko-KR")}컷 · 자동 파이프라인 {plan.estimatedPipelineMinutes}분
          </span>
        </div>

        <ol className="img-hub-step-list">
          {plan.stages.map((stage) => (
            <li key={stage.id} className="img-hub-step-item">
              <div>
                <strong className="text-sm font-bold text-fg">
                  {stage.order}단계 · {stage.titleKo}
                </strong>
                <p className="img-hub-muted">{stage.detailKo}</p>
              </div>
              <div className="img-hub-pill-row">
                <span className="img-hub-badge">{stage.artifactKo}</span>
                <span className="img-hub-badge img-hub-num" data-tone="good">
                  자동화 {stage.automatedRatioPercent}%
                </span>
              </div>
            </li>
          ))}
        </ol>

        {plan.gameManifest ? (
          <div className="img-hub-grid img-hub-grid-2">
            <div className="img-hub-subcard">
              <strong className="text-sm font-bold text-fg">
                3단계 LOD + {plan.gameManifest.spriteAtlasSpec.directions}방향 스프라이트 아틀라스
              </strong>
              <ul className="img-hub-step-list">
                {plan.gameManifest.lodTiers.map((lod) => (
                  <li key={lod.tier} className="img-hub-step-item">
                    <span className="text-xs font-bold text-fg">{lod.labelKo}</span>
                    <span className="img-hub-badge img-hub-num">
                      {lod.triangleCount.toLocaleString("ko-KR")} tris · {lod.textureSizePx}px · DC {lod.maxDrawCalls}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="img-hub-muted img-hub-num">
                아틀라스 {plan.gameManifest.spriteAtlasSpec.atlasWidthPx}×
                {plan.gameManifest.spriteAtlasSpec.atlasHeightPx}px (
                {plan.gameManifest.spriteAtlasSpec.totalFrames}프레임 · VRAM 약{" "}
                {plan.gameManifest.spriteAtlasSpec.estimatedVramMb}MB)
              </p>
            </div>

            <div className="img-hub-subcard">
              <div className="img-hub-section-head">
                <strong className="text-sm font-bold text-fg">
                  {plan.gameManifest.dialogueBundle.formatLabelKo}
                </strong>
                <span className="img-hub-badge">{plan.gameManifest.dialogueBundle.fileName}</span>
              </div>
              {plan.visualNovelGraph ? (
                <p className="img-hub-muted img-hub-num">
                  비주얼 노벨 {plan.visualNovelGraph.sceneCount}씬 · {plan.visualNovelGraph.branchCount}분기 ·
                  표정 {plan.visualNovelGraph.standingExpressionSlots.length}종(
                  {plan.visualNovelGraph.standingExpressionSlots.slice(0, 4).join("·")} 등)
                </p>
              ) : null}
              <pre className="img-hub-code-preview">{plan.gameManifest.dialogueBundle.samplePayloadJson}</pre>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
