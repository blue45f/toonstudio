import type { HudRow } from "./viewport-interactions";

/** 캔버스 입력을 가리지 않고 기존 HUD 행의 이름·값을 표시한다. */
export function ViewportHud({ rows }: { readonly rows: readonly HudRow[] }) {
  if (!rows.length) return null;
  return (
    <dl className="cl-viewport-hud" aria-label="성능 HUD" style={{ position: "absolute", top: 8, right: 8, margin: 0, pointerEvents: "none" }}>
      {rows.map((row) => (
        <div key={row.key} className="cl-viewport-hud-row" data-key={row.key} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <dt>{row.label}</dt>
          <dd style={{ margin: 0 }}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
