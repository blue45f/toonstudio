import { useEffect, useState } from "react";

import { hsvToRgb, normalizeHex, parseHex, rgbToHsv, toHex } from "../state/color-utils";

import type { Hsv } from "../state/color-utils";

export interface DrawColorPickerProps {
  /** 현재 색 `#rrggbb`. */
  color: string;
  recentColors: readonly string[];
  onChange: (hex: string) => void;
}

/** H/S/V 슬라이더 3개의 그라데이션 배경(트랙에 현재 색 범위를 보여 준다). */
function trackStyle(kind: "h" | "s" | "v", hsv: Hsv): { background: string } {
  if (kind === "h") {
    return { background: "linear-gradient(90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" };
  }
  if (kind === "s") {
    const lo = toHex(hsvToRgb({ h: hsv.h, s: 0, v: hsv.v }));
    const hi = toHex(hsvToRgb({ h: hsv.h, s: 1, v: hsv.v }));
    return { background: `linear-gradient(90deg, ${lo}, ${hi})` };
  }
  const hi = toHex(hsvToRgb({ h: hsv.h, s: hsv.s, v: 1 }));
  return { background: `linear-gradient(90deg, #000, ${hi})` };
}

/**
 * 색 선택: 16진 입력 + H/S/V 슬라이더 + 최근 색 8칸. 16진 입력은 해석할 수 없으면 오류를 표시하고(무음 보정 없음) 색을 바꾸지 않는다.
 * 색상환 대신 H/S/V 슬라이더를 쓴다(키보드·터치 조작이 쉽고 44 px 타깃을 지킨다).
 */
export function DrawColorPicker({ color, recentColors, onChange }: DrawColorPickerProps) {
  const rgb = parseHex(color) ?? { r: 0, g: 0, b: 0 };
  // 채도 0·명도 0에서 색조 정보가 사라지므로 슬라이더가 튀지 않게 마지막 색조를 보관한다.
  const [hue, setHue] = useState(() => rgbToHsv(rgb).h);
  const [hexText, setHexText] = useState(color);
  const [hexError, setHexError] = useState<string | null>(null);
  const hsv = rgbToHsv(rgb);
  const shown: Hsv = { h: hsv.s === 0 || hsv.v === 0 ? hue : hsv.h, s: hsv.s, v: hsv.v };

  useEffect(() => {
    setHexText(color);
    setHexError(null);
  }, [color]);

  const commitHsv = (next: Hsv): void => {
    setHue(next.h);
    onChange(toHex(hsvToRgb(next)));
  };

  const commitHexText = (text: string): void => {
    const normalized = normalizeHex(text);
    if (normalized === null) {
      setHexError(`'${text}'은(는) 색이 아니다. #rgb 또는 #rrggbb 형식으로 입력한다.`);
      return;
    }
    setHexError(null);
    const parsed = parseHex(normalized);
    if (parsed) {
      const h = rgbToHsv(parsed);
      if (h.s > 0 && h.v > 0) setHue(h.h);
    }
    onChange(normalized);
  };

  return (
    <fieldset className="lab-draw-color" data-testid="lab-draw-color">
      <legend>색</legend>
      <div className="lab-draw-color-row">
        <span className="lab-draw-swatch lab-draw-swatch--current" style={{ background: color }} role="img" aria-label={`현재 색 ${color}`} />
        <div className="lab-field lab-draw-hex">
          <label htmlFor="lab-draw-hex">
            <span>16진 색</span>
          </label>
          <input
            id="lab-draw-hex"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={7}
            value={hexText}
            aria-invalid={hexError !== null}
            aria-describedby={hexError ? "lab-draw-hex-error" : undefined}
            onChange={(e) => {
              setHexText(e.target.value);
              // 6자리가 완성되면 바로 반영한다(3자리 약식은 입력 도중 확정되면 타이핑을 방해하므로 Enter·포커스 이탈에서 확정한다).
              if (/^#?[0-9a-fA-F]{6}$/u.test(e.target.value.trim())) commitHexText(e.target.value);
              else setHexError(null);
            }}
            onBlur={() => {
              if (hexText !== color) commitHexText(hexText);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitHexText(hexText);
            }}
          />
        </div>
      </div>
      {hexError ? (
        <p id="lab-draw-hex-error" className="lab-draw-error" role="alert">
          {hexError}
        </p>
      ) : null}
      <div className="lab-field">
        <label htmlFor="lab-draw-h">
          <span>
            색조(H): <span className="lab-mono">{Math.round(shown.h)}°</span>
          </span>
        </label>
        <input
          id="lab-draw-h"
          type="range"
          min={0}
          max={360}
          step={1}
          value={Math.round(shown.h)}
          className="lab-draw-track"
          style={trackStyle("h", shown)}
          onChange={(e) => commitHsv({ ...shown, h: Number(e.target.value) })}
        />
      </div>
      <div className="lab-field">
        <label htmlFor="lab-draw-s">
          <span>
            채도(S): <span className="lab-mono">{Math.round(shown.s * 100)}%</span>
          </span>
        </label>
        <input
          id="lab-draw-s"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(shown.s * 100)}
          className="lab-draw-track"
          style={trackStyle("s", shown)}
          onChange={(e) => commitHsv({ ...shown, s: Number(e.target.value) / 100 })}
        />
      </div>
      <div className="lab-field">
        <label htmlFor="lab-draw-v">
          <span>
            명도(V): <span className="lab-mono">{Math.round(shown.v * 100)}%</span>
          </span>
        </label>
        <input
          id="lab-draw-v"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(shown.v * 100)}
          className="lab-draw-track"
          style={trackStyle("v", shown)}
          onChange={(e) => commitHsv({ ...shown, v: Number(e.target.value) / 100 })}
        />
      </div>
      <div className="lab-draw-recent" role="group" aria-label="최근 색 8칸">
        {Array.from({ length: 8 }, (_, i) => {
          const c = recentColors[i];
          return c ? (
            <button
              key={`${i}-${c}`}
              type="button"
              className="lab-draw-swatch lab-draw-swatch--button"
              style={{ background: c }}
              aria-label={`최근 색 ${i + 1}: ${c}`}
              aria-pressed={c === color}
              data-testid={`lab-draw-recent-${i}`}
              onClick={() => onChange(c)}
            />
          ) : (
            <span key={`empty-${i}`} className="lab-draw-swatch lab-draw-swatch--empty" aria-hidden="true" />
          );
        })}
      </div>
    </fieldset>
  );
}
