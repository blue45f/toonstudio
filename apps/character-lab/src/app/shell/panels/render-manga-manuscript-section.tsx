/** 만화 원고의 색상·망점·해칭 프리셋과 밀도·채도 조절 섹션. */
import type { LabCommand, ShadingProfile } from "../../../contracts";

interface RenderMangaManuscriptSectionProps {
  readonly isToon: boolean;
  readonly ids: string;
  readonly look: ShadingProfile["look"];
  readonly dispatch: (command: LabCommand) => void;
}

export function RenderMangaManuscriptSection({ isToon, ids, look, dispatch }: RenderMangaManuscriptSectionProps) {
  return (
    <fieldset className="cl-render-group" data-testid="render-manga-manuscript-group" disabled={!isToon}>
      <legend>만화 원고 흑백 선화 · 망점 스크린톤 연출</legend>
      <div className="cl-render-row" role="group" aria-label="만화 원고 스크린톤 빠른 모드">
        <button
          type="button"
          className="cl-preset-chip"
          data-testid="render-manga-mode-color"
          aria-pressed={look.tone.kind === "none" && look.grade.saturation >= 0.9}
          onClick={() =>
            dispatch({
              type: "look/set",
              patch: { tone: { kind: "none", strength: 0 }, grade: { saturation: 1, lightness: 0 } },
            })
          }
        >
          풀컬러 웹툰 기본
        </button>
        <button
          type="button"
          className="cl-preset-chip"
          data-testid="render-manga-mode-halftone"
          aria-pressed={look.tone.kind === "halftone"}
          onClick={() =>
            dispatch({
              type: "look/set",
              patch: {
                tone: { kind: "halftone", cellPerHead: 44, angleDeg: 45, strength: 0.88, ink: "line" },
                grade: { saturation: 0.04, lightness: 0.02 },
              },
            })
          }
        >
          45° 망점 스크린톤
        </button>
        <button
          type="button"
          className="cl-preset-chip"
          data-testid="render-manga-mode-crosshatch"
          aria-pressed={look.tone.kind === "crosshatch"}
          onClick={() =>
            dispatch({
              type: "look/set",
              patch: {
                tone: { kind: "crosshatch", cellPerHead: 52, angleDeg: 35, strength: 0.86, ink: "line" },
                grade: { saturation: 0, lightness: 0.04 },
              },
            })
          }
        >
          흑백 잉크 크로스해칭
        </button>
      </div>
      <div className="cl-render-row">
        <label htmlFor={`${ids}-manga-cell-density`}>스크린톤 밀도(cell/head)</label>
        <input
          id={`${ids}-manga-cell-density`}
          data-testid="render-manga-density-slider"
          type="range"
          min={12}
          max={96}
          step={4}
          value={look.tone.cellPerHead}
          onChange={(event) =>
            dispatch({
              type: "look/set",
              patch: { tone: { cellPerHead: Number(event.target.value) } },
              coalesceKey: "look:tone.cellPerHead",
            })
          }
        />
        <output htmlFor={`${ids}-manga-cell-density`}>{look.tone.cellPerHead}</output>
      </div>
      <div className="cl-render-row">
        <label htmlFor={`${ids}-manga-saturation`}>원고 채도</label>
        <input
          id={`${ids}-manga-saturation`}
          data-testid="render-manga-saturation-slider"
          type="range"
          min={0}
          max={1.2}
          step={0.05}
          value={look.grade.saturation}
          onChange={(event) =>
            dispatch({
              type: "look/set",
              patch: { grade: { saturation: Number(event.target.value) } },
              coalesceKey: "look:grade.saturation",
            })
          }
        />
        <output htmlFor={`${ids}-manga-saturation`}>{`${Math.round(look.grade.saturation * 100)}%`}</output>
      </div>
    </fieldset>
  );
}
