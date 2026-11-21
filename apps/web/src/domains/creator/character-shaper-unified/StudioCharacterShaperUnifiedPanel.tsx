import "./character-shaper-unified.css";

import { useId, useMemo, useState } from "react";

import {
  applyBodyBasePreset,
  applyHandPose15DofPreset,
  buildCharacterShaperHandoffPayload,
  CHARACTER_BODY_BASE_PRESETS,
  CHARACTER_PROPORTION_AXIS_SPECS,
  CHARACTER_SHAPER_HANDOFF_SCHEMA,
  computeMetricHeightMeters,
  countHandPoseDof,
  createCharacterShaperUnifiedState,
  HAIR_SCALP_PRESETS,
  HAND_FINGER_ORDER,
  HAND_POSE_15DOF_PRESETS,
  OUTFIT_BASE_OPTIONS,
  OUTFIT_MID_OPTIONS,
  OUTFIT_OUTER_OPTIONS,
  PAGE_CONSOLIDATION_AUDIT_MAP,
  PROP_ITEM_OPTIONS,
  PROP_SOCKET_OPTIONS,
  summarizePageConsolidationAudit,
  updateHairScalpFit,
  updateOutfitLayers,
  updateProportionAxis,
  updatePropSocket,
  validateCharacterExportCompliance,
  type CharacterExportFormat,
  type CharacterHandoffTarget,
  type CharacterShaperHandoffPayload,
  type CharacterShaperUnifiedState,
  type HairScalpPresetId,
  type HandActiveSide,
  type OutfitBaseLayerId,
  type OutfitMidLayerId,
  type OutfitOuterLayerId,
  type PageConsolidationFilter,
  type PropItemId,
  type PropSocketId,
} from "./character-shaper-unified-engine";
import { CharacterShaperAuditTab } from "./CharacterShaperAuditTab";
import { CharacterShaperSilhouettePreview } from "./CharacterShaperSilhouettePreview";

type UnifiedWorkbenchTab = "shaper" | "page-audit";

const HAND_SIDE_LABELS: Record<HandActiveSide, string> = {
  both: "양손 동시",
  left: "왼손만",
  right: "오른손만",
};

const FINGER_LABELS: Record<(typeof HAND_FINGER_ORDER)[number], string> = {
  thumb: "엄지",
  index: "검지",
  middle: "중지",
  ring: "약지",
  pinky: "새끼",
};

function formatAxisReadout(axisId: string, value: number): string {
  if (axisId === "headRatio") return `${value.toFixed(1)}등신`;
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value * 100)}%`;
}

/**
 * 툰스튜디오 내부 통합 3D 캐릭터 셰이퍼 & 사이트 페이지 중복 정리 정본 지도 패널.
 *
 * - 탭 1: 한국 웹툰 6종 체형 베이스 · 8축 비율 · 헤어 밀착 · 의상 레이어 · 15-DOF 손 포즈 ·
 *   소품 소켓 · VRM 1.0/GLB 규격 검증 · 원클릭 스튜디오 투입 워크벤치
 * - 탭 2: 실제 툰스튜디오 4대 중복 구간(탐색 · 고객센터 · 소재/에셋 · 협업) 단일 정본 지도
 */
export function StudioCharacterShaperUnifiedPanel() {
  const uid = useId();
  const [activeTab, setActiveTab] = useState<UnifiedWorkbenchTab>("shaper");
  const [shaperState, setShaperState] = useState<CharacterShaperUnifiedState>(() =>
    createCharacterShaperUnifiedState("rofan-noble"),
  );
  const [exportFormat, setExportFormat] = useState<CharacterExportFormat>("vrm-1.0");
  const [lastHandoff, setLastHandoff] = useState<CharacterShaperHandoffPayload | null>(null);
  const [auditFilter, setAuditFilter] = useState<PageConsolidationFilter>("all");

  const sanitizedHeightMeters = useMemo(
    () => computeMetricHeightMeters(shaperState.proportions),
    [shaperState.proportions],
  );
  const exportReport = useMemo(
    () => validateCharacterExportCompliance(shaperState, exportFormat),
    [shaperState, exportFormat],
  );
  const handDofSummary = useMemo(
    () => countHandPoseDof(shaperState.handPose15Dof),
    [shaperState.handPose15Dof],
  );
  const auditSummary = useMemo(
    () => summarizePageConsolidationAudit(PAGE_CONSOLIDATION_AUDIT_MAP),
    [],
  );

  const activePreset =
    CHARACTER_BODY_BASE_PRESETS.find((preset) => preset.id === shaperState.bodyBaseId) ??
    CHARACTER_BODY_BASE_PRESETS[0]!;

  const handleDispatchHandoff = (target: CharacterHandoffTarget) => {
    setLastHandoff(buildCharacterShaperHandoffPayload(shaperState, target, exportFormat));
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    setActiveTab((current) => (current === "shaper" ? "page-audit" : "shaper"));
  };

  return (
    <div className="csu-shell" data-testid="studio-character-shaper-unified-panel">
      <div className="csu-body">
        <header className="csu-header">
          <div>
            <p className="csu-kicker">
              툰스튜디오 내장 3D 워크벤치 · 앱 경계 독립 (`appsToLabs: 0/0`)
            </p>
            <h2 className="csu-title">통합 3D 캐릭터 셰이퍼 &amp; 페이지 구조 정본 지도</h2>
            <p className="csu-subtitle">
              외부 랩 의존 없이 툰스튜디오 안에서 한국 웹툰 6종 체형과 8축 비율·헤어 밀착·15-DOF 손 포즈를
              바로 다듬어 캔버스나 3D 배경 스테이지로 넘기고, 중복된 사이트 라우트의 정본 구조도 함께 점검합니다.
            </p>
          </div>
          <div className="csu-header-badges">
            <span className="csu-badge csu-num" data-testid="csu-height-badge">
              {activePreset.labelKo} · {sanitizedHeightMeters.toFixed(2)}m
            </span>
            <span
              className="csu-badge csu-num"
              data-tone={exportReport.passed ? "good" : "warn"}
              data-testid="csu-compliance-badge"
            >
              {exportReport.passed
                ? `${exportFormat === "vrm-1.0" ? "VRM 1.0" : "GLB 2.0"} 규격 통과 · 0 non-manifold · 0 NaN`
                : "규격 점검 필요"}
            </span>
          </div>
        </header>

        <div className="csu-tablist" role="tablist" aria-label="통합 3D 셰이퍼 및 페이지 정본 지도 탭">
          <button
            id={`${uid}-tab-shaper`}
            type="button"
            role="tab"
            className="csu-tab"
            aria-selected={activeTab === "shaper"}
            aria-controls={`${uid}-panel-shaper`}
            tabIndex={activeTab === "shaper" ? 0 : -1}
            onClick={() => setActiveTab("shaper")}
            onKeyDown={handleTabKeyDown}
          >
            통합 3D 캐릭터 셰이퍼
          </button>
          <button
            id={`${uid}-tab-audit`}
            type="button"
            role="tab"
            className="csu-tab"
            aria-selected={activeTab === "page-audit"}
            aria-controls={`${uid}-panel-audit`}
            tabIndex={activeTab === "page-audit" ? 0 : -1}
            onClick={() => setActiveTab("page-audit")}
            onKeyDown={handleTabKeyDown}
          >
            페이지 중복 정리 · 단일 정본 지도 ({auditSummary.groupCount}대 구간)
          </button>
        </div>

        {activeTab === "shaper" ? (
          <section
            id={`${uid}-panel-shaper`}
            role="tabpanel"
            aria-labelledby={`${uid}-tab-shaper`}
            data-testid="csu-shaper-tabpanel"
            className="csu-shaper-grid"
          >
            <aside className="csu-card">
              <div>
                <h3 className="csu-section-heading">실시간 비율 · 접지 미리보기</h3>
                <p className="csu-section-caption">{activePreset.summaryKo}</p>
              </div>

              <CharacterShaperSilhouettePreview state={shaperState} heightMeters={sanitizedHeightMeters} />

              <div className="csu-stage-meta csu-num">
                <div className="csu-stat-cell">
                  <span className="csu-stat-label">등신 · 신장</span>
                  <span className="csu-stat-value">
                    {shaperState.proportions.headRatio.toFixed(1)}등신 · {sanitizedHeightMeters.toFixed(2)}m
                  </span>
                </div>
                <div className="csu-stat-cell">
                  <span className="csu-stat-label">손 포즈 자유도</span>
                  <span className="csu-stat-value">
                    {handDofSummary.finiteDof}-DOF · 평균 {handDofSummary.averageCurlDeg}°
                  </span>
                </div>
                <div className="csu-stat-cell">
                  <span className="csu-stat-label">헤어 두피 간격</span>
                  <span className="csu-stat-value">
                    {shaperState.hair.scalpOffsetMm.toFixed(1)}mm · ×{shaperState.hair.volumeScale.toFixed(2)}
                  </span>
                </div>
                <div className="csu-stat-cell">
                  <span className="csu-stat-label">의상 클리핑 여유</span>
                  <span className="csu-stat-value">{shaperState.outfit.clothClearanceMm.toFixed(1)}mm</span>
                </div>
              </div>

              <button
                type="button"
                className="csu-btn"
                onClick={() => setShaperState(createCharacterShaperUnifiedState(shaperState.bodyBaseId))}
              >
                현재 베이스 기본값 복원
              </button>
            </aside>

            <div className="flex min-w-0 flex-col gap-4">
              <div className="csu-card">
                <div>
                  <h3 className="csu-section-heading">1. 한국 웹툰 대표 6종 체형 베이스</h3>
                  <p className="csu-section-caption">
                    장르에 맞는 기준 체형을 고르면 8축 비율·헤어·의상·15-DOF 손 포즈·소품이 함께 맞춰집니다.
                  </p>
                </div>
                <div className="csu-preset-grid" role="group" aria-label="웹툰 체형 베이스 프리셋">
                  {CHARACTER_BODY_BASE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className="csu-chip"
                      aria-pressed={shaperState.bodyBaseId === preset.id}
                      data-testid={`csu-base-${preset.id}`}
                      onClick={() => setShaperState((current) => applyBodyBasePreset(current, preset.id))}
                    >
                      <span>{preset.labelKo}</span>
                      <span className="csu-chip-sub">
                        {preset.genreTagKo} · {preset.proportions.headRatio.toFixed(1)}등신
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="csu-card">
                <div>
                  <h3 className="csu-section-heading">2. 체형·비율 8축 정밀 조절</h3>
                  <p className="csu-section-caption">
                    등신(5.5~8.5)과 상·하체, 얼굴 비율 8축을 조정하면 미터 신장과 접지 규격이 자동 재계산됩니다.
                  </p>
                </div>
                <div className="csu-slider-grid">
                  {CHARACTER_PROPORTION_AXIS_SPECS.map((spec) => {
                    const inputId = `${uid}-axis-${spec.id}`;
                    const value = shaperState.proportions[spec.id];
                    return (
                      <div key={spec.id} className="csu-slider-item">
                        <div className="csu-slider-head">
                          <label htmlFor={inputId}>{spec.labelKo}</label>
                          <span className="csu-num" data-testid={`csu-axis-value-${spec.id}`}>
                            {formatAxisReadout(spec.id, value)}
                          </span>
                        </div>
                        <input
                          id={inputId}
                          type="range"
                          className="csu-range"
                          min={spec.min}
                          max={spec.max}
                          step={spec.step}
                          value={value}
                          aria-label={spec.labelKo}
                          onChange={(event) =>
                            setShaperState((current) =>
                              updateProportionAxis(current, spec.id, Number(event.target.value)),
                            )
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="csu-detail-grid">
                <div className="csu-card">
                  <h3 className="csu-section-heading">3. 헤어 두피 밀착 · 의상 3단 레이어</h3>
                  <div className="csu-field-row">
                    <label className="csu-field-label" htmlFor={`${uid}-hair-preset`}>
                      헤어 스타일
                    </label>
                    <select
                      id={`${uid}-hair-preset`}
                      className="csu-select"
                      value={shaperState.hair.presetId}
                      onChange={(event) =>
                        setShaperState((current) =>
                          updateHairScalpFit(current, {
                            presetId: event.target.value as HairScalpPresetId,
                          }),
                        )
                      }
                    >
                      {HAIR_SCALP_PRESETS.map((hair) => (
                        <option key={hair.id} value={hair.id}>
                          {hair.labelKo}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="csu-slider-item">
                    <div className="csu-slider-head">
                      <label htmlFor={`${uid}-scalp-offset`}>두피 밀착 간격</label>
                      <span className="csu-num">{shaperState.hair.scalpOffsetMm.toFixed(1)}mm</span>
                    </div>
                    <input
                      id={`${uid}-scalp-offset`}
                      type="range"
                      className="csu-range"
                      min={0.5}
                      max={8}
                      step={0.1}
                      value={shaperState.hair.scalpOffsetMm}
                      onChange={(event) =>
                        setShaperState((current) =>
                          updateHairScalpFit(current, { scalpOffsetMm: Number(event.target.value) }),
                        )
                      }
                    />
                  </div>

                  <div className="csu-field-row">
                    <label className="csu-field-label" htmlFor={`${uid}-outfit-base`}>
                      이너 레이어
                    </label>
                    <select
                      id={`${uid}-outfit-base`}
                      className="csu-select"
                      value={shaperState.outfit.baseLayer}
                      onChange={(event) =>
                        setShaperState((current) =>
                          updateOutfitLayers(current, {
                            baseLayer: event.target.value as OutfitBaseLayerId,
                          }),
                        )
                      }
                    >
                      {OUTFIT_BASE_OPTIONS.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.labelKo}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="csu-field-row">
                    <label className="csu-field-label" htmlFor={`${uid}-outfit-mid`}>
                      미들 레이어
                    </label>
                    <select
                      id={`${uid}-outfit-mid`}
                      className="csu-select"
                      value={shaperState.outfit.midLayer}
                      onChange={(event) =>
                        setShaperState((current) =>
                          updateOutfitLayers(current, {
                            midLayer: event.target.value as OutfitMidLayerId,
                          }),
                        )
                      }
                    >
                      {OUTFIT_MID_OPTIONS.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.labelKo}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="csu-field-row">
                    <label className="csu-field-label" htmlFor={`${uid}-outfit-outer`}>
                      아우터 레이어
                    </label>
                    <select
                      id={`${uid}-outfit-outer`}
                      className="csu-select"
                      value={shaperState.outfit.outerLayer}
                      onChange={(event) =>
                        setShaperState((current) =>
                          updateOutfitLayers(current, {
                            outerLayer: event.target.value as OutfitOuterLayerId,
                          }),
                        )
                      }
                    >
                      {OUTFIT_OUTER_OPTIONS.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.labelKo}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="csu-card">
                  <h3 className="csu-section-heading">4. 15-DOF 손 포즈 · 소품 소켓 장착</h3>
                  <div className="csu-chip-row" role="group" aria-label="15-DOF 손 포즈 프리셋">
                    {HAND_POSE_15DOF_PRESETS.map((pose) => (
                      <button
                        key={pose.id}
                        type="button"
                        className="csu-chip csu-chip--inline"
                        aria-pressed={shaperState.handPose15Dof.presetId === pose.id}
                        data-testid={`csu-hand-${pose.id}`}
                        onClick={() =>
                          setShaperState((current) => applyHandPose15DofPreset(current, pose.id))
                        }
                      >
                        {pose.labelKo}
                      </button>
                    ))}
                  </div>

                  <div className="csu-chip-row" role="group" aria-label="활성 손 방향">
                    {(["both", "left", "right"] as const).map((side) => (
                      <button
                        key={side}
                        type="button"
                        className="csu-chip csu-chip--inline"
                        aria-pressed={shaperState.handPose15Dof.activeHand === side}
                        onClick={() =>
                          setShaperState((current) =>
                            applyHandPose15DofPreset(current, current.handPose15Dof.presetId, side),
                          )
                        }
                      >
                        {HAND_SIDE_LABELS[side]}
                      </button>
                    ))}
                  </div>

                  <p className="csu-section-caption csu-num" data-testid="csu-finger-summary">
                    {HAND_FINGER_ORDER.map(
                      (finger) =>
                        `${FINGER_LABELS[finger]} ${shaperState.handPose15Dof.fingers[finger].proximalCurlDeg}°`,
                    ).join(" · ")}
                  </p>

                  <div className="csu-field-row">
                    <label className="csu-field-label" htmlFor={`${uid}-prop-socket`}>
                      소품 부착 소켓
                    </label>
                    <select
                      id={`${uid}-prop-socket`}
                      className="csu-select"
                      value={shaperState.propSocket.socketId}
                      onChange={(event) =>
                        setShaperState((current) =>
                          updatePropSocket(current, { socketId: event.target.value as PropSocketId }),
                        )
                      }
                    >
                      {PROP_SOCKET_OPTIONS.map((socket) => (
                        <option key={socket.id} value={socket.id}>
                          {socket.labelKo}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="csu-field-row">
                    <label className="csu-field-label" htmlFor={`${uid}-prop-item`}>
                      장착 소품
                    </label>
                    <select
                      id={`${uid}-prop-item`}
                      className="csu-select"
                      value={shaperState.propSocket.propId}
                      onChange={(event) =>
                        setShaperState((current) =>
                          updatePropSocket(current, { propId: event.target.value as PropItemId }),
                        )
                      }
                    >
                      {PROP_ITEM_OPTIONS.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.labelKo}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="csu-slider-item">
                    <div className="csu-slider-head">
                      <label htmlFor={`${uid}-prop-scale`}>소품 배율</label>
                      <span className="csu-num">×{shaperState.propSocket.scale.toFixed(2)}</span>
                    </div>
                    <input
                      id={`${uid}-prop-scale`}
                      type="range"
                      className="csu-range"
                      min={0.5}
                      max={1.8}
                      step={0.05}
                      value={shaperState.propSocket.scale}
                      onChange={(event) =>
                        setShaperState((current) =>
                          updatePropSocket(current, { scale: Number(event.target.value) }),
                        )
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="csu-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="csu-section-heading">
                      5. VRM 1.0 / GLB 규격 검증 &amp; 원클릭 스튜디오 투입
                    </h3>
                    <p className="csu-section-caption">
                      표준 계약 `{CHARACTER_SHAPER_HANDOFF_SCHEMA}`로 캔버스나 3D 배경 스테이지에 바로 넘깁니다.
                    </p>
                  </div>
                  <div className="csu-chip-row" role="group" aria-label="내보내기 규격 선택">
                    {(["vrm-1.0", "glb-2.0"] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        className="csu-chip csu-chip--inline"
                        aria-pressed={exportFormat === fmt}
                        onClick={() => setExportFormat(fmt)}
                      >
                        {fmt === "vrm-1.0" ? "VRM 1.0" : "GLB 2.0"}
                      </button>
                    ))}
                  </div>
                </div>

                <ul className="csu-check-list" aria-label="내보내기 규격 검증 목록">
                  {exportReport.checks.map((check) => (
                    <li key={check.id} className="csu-check-item" data-passed={check.passed}>
                      <strong>
                        {check.passed ? "통과" : "주의"} · {check.labelKo}
                      </strong>
                      <span className="csu-chip-sub csu-num">{check.detailKo}</span>
                    </li>
                  ))}
                </ul>

                <div className="csu-action-bar">
                  <button
                    type="button"
                    className="csu-btn csu-btn--primary"
                    data-testid="csu-handoff-canvas-btn"
                    onClick={() => handleDispatchHandoff("studio-canvas-2d")}
                  >
                    스튜디오 2D 캔버스에 바로 투입
                  </button>
                  <button
                    type="button"
                    className="csu-btn csu-btn--secondary"
                    data-testid="csu-handoff-bg3d-btn"
                    onClick={() => handleDispatchHandoff("studio-bg3d-stage")}
                  >
                    3D 배경 스테이지에 배치
                  </button>
                </div>

                {lastHandoff ? (
                  <div className="csu-handoff-banner" role="status" data-testid="csu-handoff-status">
                    <p className="m-0 font-bold">
                      {lastHandoff.target === "studio-canvas-2d"
                        ? "스튜디오 2D 캔버스 투입 페이로드를 생성했습니다."
                        : "3D 배경 스테이지 배치 페이로드를 생성했습니다."}{" "}
                      ({lastHandoff.targetRoute} · {lastHandoff.checksum})
                    </p>
                    <p className="mt-1 mb-0 text-xs text-fg-2 csu-num">
                      스키마: {lastHandoff.schema} · 포맷: {lastHandoff.exportSpec.format} · 신장{" "}
                      {lastHandoff.metricHeightMeters.toFixed(2)}m · 손{" "}
                      {lastHandoff.exportSpec.handDofCount}-DOF · 비다양체{" "}
                      {lastHandoff.exportSpec.nonManifoldEdges} · NaN {lastHandoff.exportSpec.nanCount}
                    </p>
                    <pre className="csu-code-preview">{JSON.stringify(lastHandoff, null, 2)}</pre>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : (
          <CharacterShaperAuditTab
            panelId={`${uid}-panel-audit`}
            tabId={`${uid}-tab-audit`}
            auditSummary={auditSummary}
            auditFilter={auditFilter}
            onSelectFilter={setAuditFilter}
          />
        )}
      </div>
    </div>
  );
}
