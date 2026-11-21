import { BookmarkPlus, Lock, Sun, Unlock, UserCheck } from "lucide-react";
import { useState } from "react";

import {
  CHARACTER_DNA_ANGLES,
  CHARACTER_DNA_EXPRESSIONS,
  type CharacterAngleId,
  type CharacterDnaProfile,
  type CharacterExpressionId,
  type LightballShadingState,
} from "./character-dna-lightball-engine";
import type { ArtistAutonomyPreset } from "./hyper-automation-catalog";

interface HyperAutoDnaLightballSectionProps {
  readonly presets: readonly ArtistAutonomyPreset[];
  readonly averageAutonomyPercent: number;
  readonly characterDna: CharacterDnaProfile;
  readonly lightball: LightballShadingState;
  readonly onApplyPreset: (preset: ArtistAutonomyPreset) => void;
  readonly onSavePreset: (name: string) => void;
  readonly onUpdateDna: (patch: {
    readonly selectedAngleId?: CharacterAngleId;
    readonly selectedExpressionId?: CharacterExpressionId;
    readonly consistencyLock?: boolean;
  }) => void;
  readonly onUpdateLightball: (patch: {
    readonly azimuthDeg?: number;
    readonly elevationDeg?: number;
    readonly keyIntensity?: number;
  }) => void;
}

export function HyperAutoDnaLightballSection({
  presets,
  averageAutonomyPercent,
  characterDna,
  lightball,
  onApplyPreset,
  onSavePreset,
  onUpdateDna,
  onUpdateLightball,
}: HyperAutoDnaLightballSectionProps) {
  const [presetName, setPresetName] = useState("");

  const activeAngle = characterDna.lockedAngles.find((item) => item.id === characterDna.selectedAngleId)
    ?? characterDna.lockedAngles[0];
  const activeExpr = characterDna.lockedExpressions.find((item) => item.id === characterDna.selectedExpressionId)
    ?? characterDna.lockedExpressions[0];

  const sphereBackground = `radial-gradient(circle at ${lightball.highlightSpot.xPercent}% ${lightball.highlightSpot.yPercent}%, ${lightball.keyColorOklch} 0%, ${lightball.shadowColorOklch} 68%, ${lightball.rimColorOklch} 100%)`;

  return (
    <div className="hyper-auto-os__advanced-stack">
      <div className="hyper-auto-os__panel-box" data-testid="hyper-auto-preset-bar">
        <div className="hyper-auto-os__section-head">
          <h4>공정별 0~99% 작가 커스텀 프리셋 저장 · 불러오기</h4>
          <small>현재 9단계 평균 AI 비중: {averageAutonomyPercent}%</small>
        </div>

        <div className="hyper-auto-os__preset-chips">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="hyper-auto-os__btn"
              data-testid={`hyper-auto-preset-${preset.id}`}
              onClick={() => onApplyPreset(preset)}
            >
              <span>{preset.name}</span>
              <span className="hyper-auto-os__metric-chip">평균 {preset.averagePercent}%</span>
            </button>
          ))}
        </div>

        <div className="hyper-auto-os__preset-save-row">
          <input
            type="text"
            className="hyper-auto-os__idea-input"
            aria-label="새 작가 프리셋 이름"
            data-testid="hyper-auto-preset-name-input"
            placeholder="예: 내 주간 마감 조합 (선화 0 · 채색 85 · 배경 95)"
            value={presetName}
            onChange={(event) => setPresetName(event.target.value)}
          />
          <button
            type="button"
            className="hyper-auto-os__btn hyper-auto-os__btn--primary"
            data-testid="hyper-auto-preset-save-button"
            onClick={() => {
              onSavePreset(presetName);
              setPresetName("");
            }}
          >
            <BookmarkPlus size={15} aria-hidden />
            현재 9단계 비중 프리셋 저장
          </button>
        </div>
      </div>

      <div className="hyper-auto-os__workbench">
        <div className="hyper-auto-os__panel-box" data-testid="hyper-auto-dna-card">
          <div className="hyper-auto-os__section-head">
            <h4>
              <UserCheck size={15} aria-hidden /> 캐릭터 DNA 고정 (8각도 · 12표정)
            </h4>
            <button
              type="button"
              className={`hyper-auto-os__btn ${characterDna.consistencyLock ? "hyper-auto-os__btn--locked" : ""}`}
              aria-pressed={characterDna.consistencyLock}
              data-testid="hyper-auto-dna-lock-btn"
              onClick={() => onUpdateDna({ consistencyLock: !characterDna.consistencyLock })}
            >
              {characterDna.consistencyLock ? <Lock size={14} aria-hidden /> : <Unlock size={14} aria-hidden />}
              {characterDna.consistencyLock ? "DNA 일관성 락 ON" : "DNA 일관성 락 OFF"}
            </button>
          </div>

          <p className="hyper-auto-os__stage-summary">
            <code className="hyper-auto-os__layer-code">{characterDna.dnaCode}</code>{" "}
            {characterDna.proportionSpec} · 총 {characterDna.totalTurnaroundCells}셀 고정
          </p>

          <div className="hyper-auto-os__dna-group">
            <span className="hyper-auto-os__dna-label">8각도 턴어라운드 ({CHARACTER_DNA_ANGLES.length}각)</span>
            <div className="hyper-auto-os__cut-strip" role="group" aria-label="캐릭터 DNA 8각도 선택">
              {characterDna.lockedAngles.map((angle) => (
                <button
                  key={angle.id}
                  type="button"
                  className="hyper-auto-os__cut-btn"
                  aria-pressed={angle.id === characterDna.selectedAngleId}
                  data-testid={`hyper-auto-dna-angle-${angle.id}`}
                  onClick={() => onUpdateDna({ selectedAngleId: angle.id })}
                >
                  {angle.label}
                </button>
              ))}
            </div>
          </div>

          <div className="hyper-auto-os__dna-group">
            <span className="hyper-auto-os__dna-label">12표정 매트릭스 ({CHARACTER_DNA_EXPRESSIONS.length}표정)</span>
            <div className="hyper-auto-os__cut-strip" role="group" aria-label="캐릭터 DNA 12표정 선택">
              {characterDna.lockedExpressions.map((expr) => (
                <button
                  key={expr.id}
                  type="button"
                  className="hyper-auto-os__cut-btn"
                  aria-pressed={expr.id === characterDna.selectedExpressionId}
                  data-testid={`hyper-auto-dna-expr-${expr.id}`}
                  onClick={() => onUpdateDna({ selectedExpressionId: expr.id })}
                >
                  {expr.label}
                </button>
              ))}
            </div>
          </div>

          {activeAngle && activeExpr ? (
            <p className="hyper-auto-os__status-note" data-testid="hyper-auto-dna-summary">
              선택 턴어라운드: <strong>{activeAngle.label}</strong> (Yaw {activeAngle.yawDeg}°) ·{" "}
              <strong>{activeExpr.label}</strong> (눈썹 기울기 {activeExpr.browTiltDeg}° · 눈 개방 {Math.round(activeExpr.eyeOpenRatio * 100)}%)
            </p>
          ) : null}
        </div>

        <div className="hyper-auto-os__panel-box" data-testid="hyper-auto-lightball-card">
          <div className="hyper-auto-os__section-head">
            <h4>
              <Sun size={15} aria-hidden /> 3D 라이트볼 실시간 명암 제어
            </h4>
            <small>{lightball.lightingMoodLabel}</small>
          </div>

          <div className="hyper-auto-os__lightball-layout">
            <div
              className="hyper-auto-os__lightball-sphere"
              style={{ background: sphereBackground }}
              role="img"
              aria-label={`3D 라이트볼 미리보기: 방위각 ${lightball.azimuthDeg}도, 고도각 ${lightball.elevationDeg}도`}
              data-testid="hyper-auto-lightball-preview"
            />

            <div className="hyper-auto-os__lightball-sliders">
              <label className="hyper-auto-os__dial-row">
                <span>방위각 (Azimuth): <strong>{lightball.azimuthDeg}°</strong></span>
                <input
                  type="range"
                  min={0}
                  max={360}
                  aria-label="3D 라이트볼 방위각"
                  data-testid="hyper-auto-lightball-azimuth"
                  value={lightball.azimuthDeg}
                  onChange={(event) => onUpdateLightball({ azimuthDeg: Number(event.target.value) })}
                />
              </label>

              <label className="hyper-auto-os__dial-row">
                <span>고도각 (Elevation): <strong>{lightball.elevationDeg}°</strong></span>
                <input
                  type="range"
                  min={-30}
                  max={90}
                  aria-label="3D 라이트볼 고도각"
                  data-testid="hyper-auto-lightball-elevation"
                  value={lightball.elevationDeg}
                  onChange={(event) => onUpdateLightball({ elevationDeg: Number(event.target.value) })}
                />
              </label>

              <label className="hyper-auto-os__dial-row">
                <span>주광 강도 (Key): <strong>{lightball.keyIntensity}%</strong></span>
                <input
                  type="range"
                  min={10}
                  max={100}
                  aria-label="3D 라이트볼 주광 강도"
                  data-testid="hyper-auto-lightball-intensity"
                  value={lightball.keyIntensity}
                  onChange={(event) => onUpdateLightball({ keyIntensity: Number(event.target.value) })}
                />
              </label>
            </div>
          </div>

          <div className="hyper-auto-os__metrics" data-testid="hyper-auto-lightball-telemetry">
            <span className="hyper-auto-os__metric-chip">
              광원 벡터 ({lightball.lightVector.x}, {lightball.lightVector.y}, {lightball.lightVector.z})
            </span>
            <span className="hyper-auto-os__metric-chip">
              그림자 {lightball.shadowDirectionDeg}° · 길이 {lightball.shadowLengthRatio}x
            </span>
            <span className="hyper-auto-os__metric-chip">림 라이트 {lightball.rimLightPercent}%</span>
            <span className="hyper-auto-os__metric-chip">접촉 그림자 {lightball.contactShadowPercent}%</span>
            <span className="hyper-auto-os__metric-chip">명암 경계 {lightball.terminatorSoftness}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
