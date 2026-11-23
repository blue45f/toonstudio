/**
 * OOXML 슬라이드 내부 요소 직렬화기: 텍스트 프레임, 네이티브 표(<a:tbl>), SmartArt 도형, 차트 도형, 전환(<p:transition>), 빌드 애니메이션(<p:timing>).
 */

import type {
  BuildAnimationEntry,
  BuildAnimationTarget,
  PptxChartBlock,
  PptxShapeKind,
  PptxShapeTone,
  PptxSmartArtBlock,
  PptxTableModel,
  PptxTransitionKind,
} from "./ooxml-pptx-types";
import { OOXML_NS, escapeXml, type OoxmlThemeSpec } from "./ooxml-theme-spec";

export interface ShapeIdTracker {
  nextId: number;
  readonly targetSpids: Partial<Record<BuildAnimationTarget, number>>;
}

export interface TextBoxSpec {
  readonly id: number;
  readonly name: string;
  readonly placeholderType?: "title" | "subTitle" | "body";
  readonly x: number;
  readonly y: number;
  readonly cx: number;
  readonly cy: number;
  readonly paragraphs: readonly string[];
  readonly fontSizePt: number;
  readonly colorHex: string;
  readonly bold?: boolean;
  readonly bulleted?: boolean;
  readonly fillHex?: string;
  readonly borderHex?: string;
  readonly presetGeom?: string;
  readonly align?: "l" | "ctr" | "r";
}

export function resolveToneFillHex(tone: PptxShapeTone, theme: OoxmlThemeSpec): string {
  if (tone === "accent") return theme.palette.accent1;
  if (tone === "secondary") return theme.palette.accent3;
  if (tone === "highlight") return theme.palette.accent2;
  return theme.palette.surface;
}

export function resolveToneTextHex(tone: PptxShapeTone, theme: OoxmlThemeSpec): string {
  if (tone === "surface") return theme.palette.textPrimary;
  return "FFFFFF";
}

export function shapeKindToOoxmlPreset(kind: PptxShapeKind): string {
  return kind === "arrow" ? "rightArrow" : kind;
}

export function buildTextRunXml(
  text: string,
  fontSizePt: number,
  colorHex: string,
  bold: boolean,
  theme: OoxmlThemeSpec,
): string {
  const sz = Math.round(fontSizePt * 100);
  const bAttr = bold ? ' b="1"' : "";
  return `<a:r><a:rPr lang="ko-KR" altLang="en-US" sz="${sz}"${bAttr} dirty="0"><a:solidFill><a:srgbClr val="${colorHex}"/></a:solidFill><a:latin typeface="${escapeXml(theme.minorFontLatin)}"/><a:ea typeface="${escapeXml(theme.minorFontEastAsian)}"/></a:rPr><a:t>${escapeXml(text)}</a:t></a:r>`;
}

export function buildShapeTextBoxXml(spec: TextBoxSpec, theme: OoxmlThemeSpec): string {
  const phXml = spec.placeholderType ? `<p:ph type="${spec.placeholderType}"/>` : "";
  const fillXml = spec.fillHex
    ? `<a:solidFill><a:srgbClr val="${spec.fillHex}"/></a:solidFill>`
    : "<a:noFill/>";
  const lineXml = spec.borderHex
    ? `<a:ln w="12700"><a:solidFill><a:srgbClr val="${spec.borderHex}"/></a:solidFill></a:ln>`
    : "<a:ln><a:noFill/></a:ln>";
  const prst = spec.presetGeom ?? "rect";
  const algn = spec.align ?? "l";
  const lines = spec.paragraphs.length > 0 ? spec.paragraphs : [""];

  const paragraphsXml = lines
    .map((line) => {
      const pPr = spec.bulleted
        ? `<a:pPr algn="${algn}" marL="228600" indent="-228600"><a:spcBef><a:spcPts val="600"/></a:spcBef><a:buClr><a:srgbClr val="${theme.palette.accent1}"/></a:buClr><a:buChar char="•"/></a:pPr>`
        : `<a:pPr algn="${algn}"/>`;
      const run =
        line.length > 0
          ? buildTextRunXml(line, spec.fontSizePt, spec.colorHex, Boolean(spec.bold), theme)
          : `<a:endParaRPr lang="ko-KR" sz="${Math.round(spec.fontSizePt * 100)}"/>`;
      return `<a:p>${pPr}${run}</a:p>`;
    })
    .join("");

  return `<p:sp>
    <p:nvSpPr>
      <p:cNvPr id="${spec.id}" name="${escapeXml(spec.name)}"/>
      <p:cNvSpPr${spec.placeholderType ? "" : ' txBox="1"'}/>
      <p:nvPr>${phXml}</p:nvPr>
    </p:nvSpPr>
    <p:spPr>
      <a:xfrm><a:off x="${spec.x}" y="${spec.y}"/><a:ext cx="${spec.cx}" cy="${spec.cy}"/></a:xfrm>
      <a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>
      ${fillXml}
      ${lineXml}
    </p:spPr>
    <p:txBody>
      <a:bodyPr wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720" anchor="${spec.align === "ctr" ? "ctr" : "t"}"/>
      <a:lstStyle/>
      ${paragraphsXml}
    </p:txBody>
  </p:sp>`;
}

export function buildTableGraphicFrameXml(
  id: number,
  table: PptxTableModel,
  x: number,
  y: number,
  cx: number,
  cy: number,
  theme: OoxmlThemeSpec,
): string {
  const colCount = Math.max(1, table.headers.length);
  const colWidth = Math.max(457200, Math.floor(cx / colCount));
  const allRows: readonly { readonly cells: readonly string[]; readonly isHeader: boolean }[] = [
    ...(table.headers.length > 0 ? [{ cells: table.headers, isHeader: table.showHeaderRow }] : []),
    ...table.rows.map((cells) => ({ cells, isHeader: false })),
  ];
  const rowCount = Math.max(1, allRows.length);
  const rowHeight = Math.max(285750, Math.floor(cy / rowCount));
  const gridCols = Array.from({ length: colCount }, () => `<a:gridCol w="${colWidth}"/>`).join("");
  const borderColor = theme.palette.border;

  const rowsXml = allRows
    .map((row, rowIdx) => {
      const cellsXml = Array.from({ length: colCount }, (_, colIdx) => {
        const text = row.cells[colIdx] ?? "";
        const isHeader = row.isHeader;
        const isBand = !isHeader && table.bandedRows && rowIdx % 2 === 0;
        const fillHex = isHeader
          ? theme.palette.tableHeaderBg
          : isBand
            ? theme.palette.tableBandBg
            : theme.palette.canvas;
        const textHex = isHeader ? theme.palette.tableHeaderText : theme.palette.textPrimary;
        const run = buildTextRunXml(text, isHeader ? 12 : 11, textHex, isHeader, theme);
        const borderLn = `<a:solidFill><a:srgbClr val="${borderColor}"/></a:solidFill>`;
        return `<a:tc>
          <a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="l"/>${run}</a:p></a:txBody>
          <a:tcPr marL="73152" marR="73152" marT="45720" marB="45720" anchor="ctr">
            <a:lnL w="6350">${borderLn}</a:lnL><a:lnR w="6350">${borderLn}</a:lnR>
            <a:lnT w="6350">${borderLn}</a:lnT><a:lnB w="6350">${borderLn}</a:lnB>
            <a:solidFill><a:srgbClr val="${fillHex}"/></a:solidFill>
          </a:tcPr>
        </a:tc>`;
      }).join("");
      return `<a:tr h="${rowHeight}">${cellsXml}</a:tr>`;
    })
    .join("");

  return `<p:graphicFrame>
    <p:nvGraphicFramePr>
      <p:cNvPr id="${id}" name="${escapeXml(table.title ?? "Table")}"/>
      <p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr>
      <p:nvPr/>
    </p:nvGraphicFramePr>
    <p:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></p:xfrm>
    <a:graphic>
      <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
        <a:tbl>
          <a:tblPr firstRow="${table.showHeaderRow ? "1" : "0"}" bandRow="${table.bandedRows ? "1" : "0"}"/>
          <a:tblGrid>${gridCols}</a:tblGrid>
          ${rowsXml}
        </a:tbl>
      </a:graphicData>
    </a:graphic>
  </p:graphicFrame>`;
}

export function buildSmartArtOoxmlShapes(
  smartArt: PptxSmartArtBlock,
  x: number,
  y: number,
  cx: number,
  cy: number,
  theme: OoxmlThemeSpec,
  tracker: ShapeIdTracker,
): string {
  const items = smartArt.items.slice(0, 6);
  if (items.length === 0) return "";
  const accentHexes = [
    theme.palette.accent1,
    theme.palette.accent2,
    theme.palette.accent3,
    theme.palette.accent4,
  ];
  const parts: string[] = [];

  if (smartArt.variant === "swot-quadrant") {
    const gap = Math.round(cx * 0.03);
    const cellW = Math.floor((cx - gap) / 2);
    const cellH = Math.floor((cy - gap) / 2);
    items.slice(0, 4).forEach((item, idx) => {
      const spId = tracker.nextId;
      tracker.nextId += 1;
      if (tracker.targetSpids.visual === undefined) tracker.targetSpids.visual = spId;
      parts.push(
        buildShapeTextBoxXml(
          {
            id: spId,
            name: `SmartArt:${smartArt.variant}:${idx + 1}`,
            x: x + (idx % 2) * (cellW + gap),
            y: y + Math.floor(idx / 2) * (cellH + gap),
            cx: cellW,
            cy: cellH,
            paragraphs: item.detail ? [item.label, item.detail] : [item.label],
            fontSizePt: 11,
            colorHex: "FFFFFF",
            bold: true,
            fillHex: accentHexes[idx % accentHexes.length],
            presetGeom: "roundRect",
            align: "l",
          },
          theme,
        ),
      );
    });
    return parts.join("\n");
  }

  if (smartArt.variant === "pyramid-tiers") {
    const gap = Math.round(cy * 0.03);
    const tierH = Math.floor((cy - gap * (items.length - 1)) / items.length);
    items.forEach((item, idx) => {
      const tierW = Math.floor(cx * (0.45 + (0.55 * (idx + 1)) / items.length));
      const spId = tracker.nextId;
      tracker.nextId += 1;
      if (tracker.targetSpids.visual === undefined) tracker.targetSpids.visual = spId;
      parts.push(
        buildShapeTextBoxXml(
          {
            id: spId,
            name: `SmartArt:${smartArt.variant}:${idx + 1}`,
            x: x + Math.floor((cx - tierW) / 2),
            y: y + idx * (tierH + gap),
            cx: tierW,
            cy: tierH,
            paragraphs: item.detail ? [`${item.label} — ${item.detail}`] : [item.label],
            fontSizePt: 11,
            colorHex: "FFFFFF",
            bold: true,
            fillHex: accentHexes[idx % accentHexes.length],
            presetGeom: "trapezoid",
            align: "ctr",
          },
          theme,
        ),
      );
    });
    return parts.join("\n");
  }

  const gap = Math.round(cx * 0.02);
  const itemW = Math.floor((cx - gap * (items.length - 1)) / items.length);
  const itemH = Math.floor(cy * 0.66);
  const topY = y + Math.floor((cy - itemH) / 2);
  const prst =
    smartArt.variant === "process-chevron"
      ? "chevron"
      : smartArt.variant === "cycle-loop"
        ? "ellipse"
        : "roundRect";

  items.forEach((item, idx) => {
    const spId = tracker.nextId;
    tracker.nextId += 1;
    if (tracker.targetSpids.visual === undefined) tracker.targetSpids.visual = spId;
    parts.push(
      buildShapeTextBoxXml(
        {
          id: spId,
          name: `SmartArt:${smartArt.variant}:${idx + 1}`,
          x: x + idx * (itemW + gap),
          y: topY,
          cx: itemW,
          cy: itemH,
          paragraphs: item.detail ? [item.label, item.detail] : [item.label],
          fontSizePt: 11,
          colorHex: "FFFFFF",
          bold: true,
          fillHex: accentHexes[idx % accentHexes.length],
          presetGeom: prst,
          align: "ctr",
        },
        theme,
      ),
    );
  });
  return parts.join("\n");
}

export function buildChartOoxmlShapes(
  chart: PptxChartBlock,
  x: number,
  y: number,
  cx: number,
  cy: number,
  theme: OoxmlThemeSpec,
  tracker: ShapeIdTracker,
): string {
  const points = chart.points.slice(0, 8);
  if (points.length === 0) return "";
  const accentHexes = [
    theme.palette.accent1,
    theme.palette.accent2,
    theme.palette.accent3,
    theme.palette.accent4,
  ];
  const maxVal = Math.max(...points.map((pt) => Math.max(0, pt.value)), 1);
  const headerH = Math.round(cy * 0.16);
  const parts: string[] = [];

  const titleId = tracker.nextId;
  tracker.nextId += 1;
  if (tracker.targetSpids.visual === undefined) tracker.targetSpids.visual = titleId;
  parts.push(
    buildShapeTextBoxXml(
      {
        id: titleId,
        name: `Chart:${chart.variant}:title`,
        x,
        y,
        cx,
        cy: headerH,
        paragraphs: [chart.title],
        fontSizePt: 12,
        colorHex: theme.palette.textPrimary,
        bold: true,
        fillHex: theme.palette.surface,
        borderHex: theme.palette.border,
        presetGeom: "roundRect",
        align: "l",
      },
      theme,
    ),
  );

  const plotY = y + headerH + Math.round(cy * 0.06);
  const plotH = Math.max(300000, cy - headerH - Math.round(cy * 0.24));
  const slotW = Math.floor(cx / points.length);
  const barW = Math.max(220000, Math.floor(slotW * 0.62));

  points.forEach((pt, idx) => {
    const barH = Math.max(120000, Math.round((Math.max(0, pt.value) / maxVal) * plotH));
    const spId = tracker.nextId;
    tracker.nextId += 1;
    parts.push(
      buildShapeTextBoxXml(
        {
          id: spId,
          name: `Chart:${chart.variant}:${idx + 1}`,
          x: x + idx * slotW + Math.floor((slotW - barW) / 2),
          y: plotY + (plotH - barH),
          cx: barW,
          cy: barH,
          paragraphs: [pt.label, `${pt.value}${chart.unit ?? ""}`],
          fontSizePt: 10,
          colorHex: "FFFFFF",
          bold: true,
          fillHex: accentHexes[idx % accentHexes.length],
          presetGeom: "roundRect",
          align: "ctr",
        },
        theme,
      ),
    );
  });
  return parts.join("\n");
}

export function buildTransitionXml(transition: PptxTransitionKind | undefined): string {
  if (!transition || transition === "none") return "";
  if (transition === "fade") return `<p:transition spd="med"><p:fade/></p:transition>`;
  if (transition === "push") return `<p:transition spd="med"><p:push dir="l"/></p:transition>`;
  if (transition === "wipe") return `<p:transition spd="med"><p:wipe dir="l"/></p:transition>`;
  if (transition === "zoom") return `<p:transition spd="med"><p:zoom dir="in"/></p:transition>`;
  return `<mc:AlternateContent xmlns:mc="${OOXML_NS.mc}">
    <mc:Choice xmlns:p159="${OOXML_NS.p159}" Requires="p159">
      <p:transition spd="med"><p159:morph option="byObject"/></p:transition>
    </mc:Choice>
    <mc:Fallback><p:transition spd="med"><p:fade/></p:transition></mc:Fallback>
  </mc:AlternateContent>`;
}

export function buildTimingXml(
  animations: readonly BuildAnimationEntry[] | undefined,
  targetSpids: Partial<Record<BuildAnimationTarget, number>>,
): string {
  if (!animations || animations.length === 0) return "";
  const resolved = [...animations]
    .sort((a, b) => a.order - b.order)
    .map((entry) => ({ entry, spid: targetSpids[entry.target] }))
    .filter((item): item is { readonly entry: BuildAnimationEntry; readonly spid: number } =>
      typeof item.spid === "number",
    );
  if (resolved.length === 0) return "";

  let cTnId = 3;
  const parNodes = resolved
    .map(({ entry, spid }) => {
      const outerId = cTnId;
      const innerId = cTnId + 1;
      const setId = cTnId + 2;
      cTnId += 3;
      const dur = Math.max(80, Math.round(entry.durationMs));
      const delay = Math.max(0, Math.round(entry.delayMs));
      return `<p:par><p:cTn id="${outerId}" fill="hold"><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="${innerId}" presetID="10" presetClass="entr" presetSubtype="0" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:cTn id="${setId}" dur="${dur}" fill="hold"/><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`;
    })
    .join("");

  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${parNodes}</p:childTnLst></p:cTn></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
}
