import { PRESET_CATALOG } from "../../engine/presets/catalog";
import { useDrawSelector, useLab, useLabSelector } from "../shell/lab-context";
import { FAMILY_LABELS } from "../state/draw-program";
import { findDescriptor } from "../state/lane-helpers";

import { ExperimentalBadge } from "./ExperimentalBadge";
import { ReceiptMapping } from "./ReceiptMapping";


function fmt(v: number | null, digits = 2): string {
  return v === null ? "—" : v.toFixed(digits);
}

/**
 * 레인 전용 영수증(예: MPM의 `notesKo`)이 한글 사유를 달고 있으면 꺼낸다. 예산 가드·한도로 일부를 진행하지 않았다면 사용자에게 보여야 한다(무음 절단 금지).
 * 공통 `StrokeReceipt`에는 이 필드가 없어 구조를 확인하고 읽는다.
 */
function laneNotesOf(receipt: unknown): string[] {
  if (typeof receipt !== "object" || receipt === null) return [];
  const notes = (receipt as { notesKo?: unknown }).notesKo;
  return Array.isArray(notes) ? notes.filter((n): n is string => typeof n === "string") : [];
}

/** 습식 매체 가족: 레인이 건조 상태를 제공하지 않으므로 상태 표시는 생략하고 안내만 한다. */
const WET_FAMILIES: ReadonlySet<string> = new Set(["watercolor", "sumi", "gouache", "oil", "acrylic"]);

/**
 * 표시/성능 HUD: 레인·브러시, 획당 addSamples p50/p95, endStroke·readback 소요, dab 수, 소프트웨어 렌더러 경고.
 * 값은 마지막 획 기준이며 `env.clock`(브라우저에서는 performance.now)으로 잰 호스트 측 소요다(GPU 실행 시간이 아니다).
 */
export function DrawHud() {
  const { registry } = useLab();
  const laneId = useDrawSelector((s) => s.laneId);
  const presetId = useDrawSelector((s) => s.presetId);
  const stats = useDrawSelector((s) => s.lastStroke);
  const strokes = useDrawSelector((s) => s.strokes);
  const status = useDrawSelector((s) => s.sessionStatus);
  const docSize = useDrawSelector((s) => s.documentSize);
  const capability = useLabSelector((s) => s.capability);
  const desc = laneId ? findDescriptor(registry, laneId) : null;
  const cap = laneId ? capability[laneId] : null;
  const preset = PRESET_CATALOG.find((p) => p.id === presetId) ?? null;
  const software = cap?.softwareRenderer === true;
  const unverified = desc?.status === "browser-verification-required";
  const wet = preset ? preset.wet !== null || WET_FAMILIES.has(preset.family) : false;
  const laneNotes = laneNotesOf(stats?.receipt);
  return (
    <div className="lab-draw-hud" data-testid="lab-draw-hud" aria-label="표시·성능 HUD">
      <p className="lab-draw-hud-line">
        <strong>{desc ? desc.label : laneId ?? "레인 미정"}</strong> <span className="lab-mono">{laneId ?? "—"}</span>
        {" · "}
        <strong>{preset ? preset.name : presetId}</strong>
        {preset ? <span className="lab-muted"> ({FAMILY_LABELS[preset.family]})</span> : null}
        {docSize ? <span className="lab-muted"> · 문서 {docSize.width}×{docSize.height}</span> : null}
        {" · "}
        <span data-testid="lab-draw-status" aria-live="polite">
          {status === "ready" ? "준비됨" : status === "starting" ? "레인 시작 중…" : status === "error" ? "레인 시작 실패" : "대기"}
        </span>
      </p>
      <p className="lab-draw-hud-badges">
        <ExperimentalBadge desc={desc} />
        {unverified ? (
          <span className="lab-badge lab-badge--warn" data-testid="lab-draw-badge-unverified">
            browser-verification-required · 브라우저 미검증
          </span>
        ) : null}
        {software ? (
          <span className="lab-badge lab-badge--warn" data-testid="lab-draw-badge-software">
            소프트웨어 렌더러 — 속도는 성능 증거가 아니다
          </span>
        ) : null}
      </p>
      <dl className="lab-stats" aria-label="마지막 획 지표">
        <div>
          <dt>획 수</dt>
          <dd data-testid="lab-draw-hud-strokes">{strokes}</dd>
        </div>
        <div>
          <dt>addSamples p50 / p95 (ms)</dt>
          <dd data-testid="lab-draw-hud-add">{stats ? `${fmt(stats.addSamplesP50Ms)} / ${fmt(stats.addSamplesP95Ms)}` : "—"}</dd>
        </div>
        <div>
          <dt>endStroke (ms)</dt>
          <dd data-testid="lab-draw-hud-end">{stats ? fmt(stats.endStrokeMs) : "—"}</dd>
        </div>
        <div>
          <dt>readback (ms)</dt>
          <dd data-testid="lab-draw-hud-readback">{stats ? fmt(stats.readbackMs) : "—"}</dd>
        </div>
        <div>
          <dt>dab 수</dt>
          <dd data-testid="lab-draw-hud-dabs">{stats ? stats.dabCount : "—"}</dd>
        </div>
        <div>
          <dt>비닝 초과 dab</dt>
          <dd className={stats && stats.overflowDabs > 0 ? "lab-verdict-FAIL" : undefined}>{stats ? stats.overflowDabs : "—"}</dd>
        </div>
      </dl>
      {laneNotes.length > 0 ? (
        <ul className="lab-muted" data-testid="lab-draw-hud-lane-notes" aria-label="레인 알림(마지막 획)">
          {laneNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      <ReceiptMapping receipt={stats?.receipt} />
      {wet ? (
        <p className="lab-muted" data-testid="lab-draw-hud-wet">
          습식 매체: 마르는 중/건조 상태는 레인이 제공하지 않아 표시를 생략한다(문서의 번짐은 획 사이에 진행된다).
        </p>
      ) : null}
    </div>
  );
}
