import { useId } from "react";

import {
  ARCHITECTURE_EDGE_NOTE,
  ARCHITECTURE_LIST_NOTES,
  ARCHITECTURE_P2P_NOTE,
  ARCHITECTURE_ZONES,
} from "./engineering-architecture-data";
import type { LocalizedText } from "./engineering-story-content";
import "./engineering-surfaces.css";

import { cx } from "@/shared/lib/cx";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringArchitectureDiagram", ko, en);

const CONNECTIONS = [
  { id: "https", label: "HTTPS", path: "M 464 173 H 544", both: false },
  { id: "wss", label: "WSS", path: "M 468 365 H 544", both: true },
  { id: "api", label: "API", path: "M 808 173 H 908", both: false },
  { id: "db", label: "", path: "M 1040 248 V 272", both: false },
  { id: "files", label: "", path: "M 1168 205 H 1180 V 436 H 1172", both: false },
] as const;

const LABEL_POSITIONS: Record<string, { readonly x: number; readonly y: number }> = {
  https: { x: 504, y: 162 },
  wss: { x: 506, y: 354 },
  api: { x: 858, y: 162 },
};

export interface EngineeringArchitectureDiagramProps {
  readonly className?: string;
  /** 슬라이드 썸네일·인쇄처럼 폭이 좁아도 도식을 유지해야 할 때 사용한다. */
  readonly fixed?: boolean;
}

export function EngineeringArchitectureDiagram({ className, fixed = false }: EngineeringArchitectureDiagramProps) {
  useBilingualI18nRevision();
  const uid = useId().replace(/:/gu, "");
  const markerId = `eng-arch-arrow-${uid}`;
  const markerStartId = `eng-arch-arrow-start-${uid}`;
  const text = (value: LocalizedText): string => bi(value.ko, value.en);

  return (
    <figure className={cx("eng-arch", className)} data-fixed={fixed ? "true" : undefined}>
      <svg className="eng-arch__svg" viewBox="0 0 1200 540" aria-hidden="true" focusable="false">
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="eng-arch__arrowhead" />
          </marker>
          <marker id={markerStartId} viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="eng-arch__arrowhead" />
          </marker>
        </defs>

        {ARCHITECTURE_ZONES.map((zone) => (
          <g key={zone.id} data-tone={zone.tone} className="eng-arch__zone">
            <rect x={zone.x} y={12} width={zone.width} height={516} rx={26} className="eng-arch__zone-frame" />
            <text x={zone.x + 22} y={52} className="eng-arch__zone-title">{text(zone.title)}</text>
            {zone.caption ? <text x={zone.x + 22} y={78} className="eng-arch__zone-caption">{text(zone.caption)}</text> : null}
            {zone.boxes.map((box) => (
              <g key={box.id} className="eng-arch__box">
                <rect x={box.x} y={box.y} width={box.width} height={box.height} rx={16} className="eng-arch__box-frame" />
                <text x={box.x + 16} y={box.y + 32} className="eng-arch__box-title">{text(box.title)}</text>
                {box.lines.map((line, lineIndex) => (
                  <text key={line.en} x={box.x + 16} y={box.y + 56 + lineIndex * 21} className="eng-arch__box-line">{text(line)}</text>
                ))}
              </g>
            ))}
          </g>
        ))}

        <g className="eng-arch__p2p">
          <rect x={32} y={426} width={412} height={82} rx={16} className="eng-arch__p2p-frame" />
          <text x={50} y={460} className="eng-arch__box-title">{text(ARCHITECTURE_P2P_NOTE.title)}</text>
          <text x={50} y={485} className="eng-arch__box-line">{text(ARCHITECTURE_P2P_NOTE.line)}</text>
        </g>
        <text x={548} y={492} className="eng-arch__zone-caption">{text(ARCHITECTURE_EDGE_NOTE)}</text>

        {CONNECTIONS.map((connection) => (
          <path
            key={connection.id}
            d={connection.path}
            className="eng-arch__link"
            markerEnd={`url(#${markerId})`}
            markerStart={connection.both ? `url(#${markerStartId})` : undefined}
          />
        ))}
        {CONNECTIONS.filter((connection) => connection.label).map((connection) => {
          const position = LABEL_POSITIONS[connection.id];
          return position ? (
            <text key={connection.id} x={position.x} y={position.y} textAnchor="middle" className="eng-arch__link-label">{connection.label}</text>
          ) : null;
        })}
      </svg>

      <div className="eng-arch__list">
        {ARCHITECTURE_ZONES.map((zone) => (
          <div key={zone.id} className="eng-arch__list-zone" data-tone={zone.tone}>
            <p className="eng-arch__list-title">{text(zone.title)}</p>
            <ul>
              {zone.boxes.map((box) => (
                <li key={box.id}>
                  <strong>{text(box.title)}</strong>
                  <span>{box.lines.map(text).join(" · ")}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {ARCHITECTURE_LIST_NOTES.map((note) => (
          <p key={note.en} className="eng-arch__list-note">{bi(note.ko, note.en)}</p>
        ))}
      </div>
    </figure>
  );
}
