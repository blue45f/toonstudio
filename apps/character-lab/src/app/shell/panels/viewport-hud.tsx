import { hudRows } from "./viewport-interactions";

import type { HudSample } from "../../../contracts";

interface ViewportHudProps {
  readonly hud: HudSample | null;
}

/** 뷰포트가 수집한 성능 표본을 읽기 전용 HUD로 표시한다. */
export function ViewportHud({ hud }: ViewportHudProps) {
  const rows = hud ? hudRows(hud) : [];

  return rows.length > 0 ? (
    <dl className="cl-viewport-hud" aria-label="성능 HUD" style={{ position: "absolute", top: 8, right: 8, margin: 0, pointerEvents: "none" }}>
      {rows.map((row) => (
        <div key={row.key} className="cl-viewport-hud-row" data-key={row.key} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <dt>{row.label}</dt>
          <dd style={{ margin: 0 }}>{row.value}</dd>
        </div>
      ))}
    </dl>
  ) : null;
}
