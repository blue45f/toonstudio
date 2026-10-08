import { useDrawSelector, useLab, useLabSelector } from "../shell/lab-context";
import { lanePresentsLive } from "../state/draw-program";
import {
  capabilityBadge,
  findDescriptor,
  isLaneId,
  KIND_LABELS,
  laneAvailability,
  STATUS_LABELS,
} from "../state/lane-helpers";

/**
 * 엔진(레인) 선택. 레지스트리 기반이며 미지원 레인은 비활성 옵션 + 한글 사유 코드로 남긴다.
 * 초기 선택은 능력 탐지로 정하지만(`decideInitialLane`) 사용자가 고른 뒤에는 어떤 이유로도 자동 전환하지 않는다(ADR-0018).
 * 레인을 바꾸면 문서가 레인 안에 있으므로 캔버스가 비워진다.
 */
export function DrawLaneSelect() {
  const { registry, drawActions } = useLab();
  const laneId = useDrawSelector((s) => s.laneId);
  const chosenByUser = useDrawSelector((s) => s.laneChosenByUser);
  const strokes = useDrawSelector((s) => s.strokes);
  const capability = useLabSelector((s) => s.capability);
  const desc = laneId ? findDescriptor(registry, laneId) : null;
  const cap = laneId ? capability[laneId] : null;
  const badgeClass =
    cap === null || cap === undefined
      ? "lab-badge"
      : cap.status === "supported"
        ? "lab-badge lab-badge--pass"
        : "lab-badge lab-badge--fail";
  return (
    <section className="lab-draw-section" aria-label="엔진 선택" data-testid="lab-draw-lane">
      <h3>엔진(레인)</h3>
      <div className="lab-field">
        <label htmlFor="lab-draw-lane-select">
          <span>레인</span>
        </label>
        <select
          id="lab-draw-lane-select"
          value={laneId ?? ""}
          onChange={(e) => {
            const next = e.target.value;
            if (!isLaneId(next) || next === laneId) return;
            // 비활성 옵션은 브라우저가 막지만, 프로그램적 변경으로 들어와도 불가 레인으로 바꾸지 않는다.
            const target = findDescriptor(registry, next);
            if (!target || !laneAvailability(target, capability[next]).enabled) return;
            drawActions.chooseLane(next);
          }}
        >
          {laneId === null ? <option value="">능력 탐지 중…</option> : null}
          {registry.map((d) => {
            const { enabled, reason } = laneAvailability(d, capability[d.id]);
            return (
              <option key={d.id} value={d.id} disabled={!enabled}>
                {d.label} ({d.id}){reason ? ` — ${reason}` : ""}
              </option>
            );
          })}
        </select>
      </div>
      <p className="lab-muted" data-testid="lab-draw-lane-badge">
        <span className={badgeClass}>{capabilityBadge(cap ?? null)}</span>{" "}
        {desc ? `${KIND_LABELS[desc.kind]} · ${STATUS_LABELS[desc.status]}` : "레인 선택 대기"}
      </p>
      <p className="lab-muted" data-testid="lab-draw-lane-origin">
        {laneId === null
          ? "능력 탐지 결과로 시작 레인을 정한다(WebGPU compute → wasm CPU → CPU 참조 순)."
          : chosenByUser
            ? "직접 고른 레인이다. 어떤 이유로도 다른 레인으로 자동 전환하지 않는다."
            : "시작 시 능력 탐지로 정한 레인이다. 한 번 정한 뒤에는 자동으로 바꾸지 않는다."}
      </p>
      {laneId && lanePresentsLive(laneId) ? (
        <p className="lab-muted">이 레인은 GPU로 획 도중 결과를 직접 표시한다.</p>
      ) : laneId ? (
        <p className="lab-muted">이 레인은 획이 끝나야 실제 결과를 표시한다(획 도중에는 입력 궤적 미리보기).</p>
      ) : null}
      <p className="lab-draw-note" role="note">
        문서는 레인 안에 있다. 레인(또는 캔버스 크기)을 바꾸면 캔버스가 비워진다{strokes > 0 ? ` (지금 ${strokes}획이 사라진다)` : ""}.
      </p>
    </section>
  );
}
