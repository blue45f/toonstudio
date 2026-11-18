import { useEffect, useState } from "react";

import type { HudRow } from "./viewport-interactions";
import type { CharacterEngine, HudSample } from "../../../contracts";

/** HUD가 켜진 동안만 읽고 엔진·주기 변경과 해제 시 타이머를 정리한다. */
export function useViewportHud(
  engine: CharacterEngine | null,
  enabled: boolean,
  intervalMs: number,
  reportFailure: (error: unknown) => void,
): HudSample | null {
  const [hud, setHud] = useState<HudSample | null>(null);
  useEffect(() => {
    if (!engine || !enabled) {
      setHud(null);
      return undefined;
    }
    const read = (): void => {
      try {
        setHud(engine.readHud());
      } catch (error) {
        setHud(null);
        reportFailure(error);
      }
    };
    read();
    if (!(intervalMs > 0)) return undefined;
    const timer = window.setInterval(read, intervalMs);
    return () => window.clearInterval(timer);
  }, [engine, enabled, intervalMs, reportFailure]);
  return hud;
}

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
