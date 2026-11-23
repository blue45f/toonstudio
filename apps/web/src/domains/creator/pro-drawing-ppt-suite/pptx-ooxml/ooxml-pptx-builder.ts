/**
 * 실제 Microsoft PowerPoint · Keynote · LibreOffice Impress 호환
 * OOXML `.pptx` 바이너리 생성기(`buildPptxArchive`) 및 가져오기 파서(`parsePptxArchive`).
 * 외부 라이브러리 없이 순수 TypeScript + `ooxml-zip-codec`만으로 완전한 패키지 구조를 생성·복원한다.
 */

import type { PptxDeckInput, PptxSlideInput } from "./ooxml-pptx-types";
import {
  buildChartOoxmlShapes,
  buildShapeTextBoxXml,
  buildSmartArtOoxmlShapes,
  buildTableGraphicFrameXml,
  buildTextRunXml,
  buildTimingXml,
  buildTransitionXml,
  resolveToneFillHex,
  resolveToneTextHex,
  shapeKindToOoxmlPreset,
  type ShapeIdTracker,
} from "./ooxml-slide-elements";
import {
  OOXML_NS,
  OOXML_REL_TYPES,
  PPTX_SLIDE_SIZES,
  XML_DECL,
  buildAppPropsXml,
  buildCorePropsXml,
  buildNotesMasterRelsXml,
  buildNotesMasterXml,
  buildPresPropsXml,
  buildSlideLayoutRelsXml,
  buildSlideLayoutXml,
  buildSlideMasterRelsXml,
  buildSlideMasterXml,
  buildTableStylesXml,
  buildThemeXml,
  buildViewPropsXml,
  getOoxmlThemeSpec,
  type OoxmlThemeSpec,
  type PptxSlideDimensions,
} from "./ooxml-theme-spec";
import { buildZipArchive, type ZipArchiveEntryInput } from "./ooxml-zip-codec";

export { parsePptxArchive, parsePptxArchiveAsync } from "./ooxml-pptx-parser";

export type {
  BuildAnimationEntry,
  BuildAnimationKind,
  BuildAnimationTarget,
  NativeChartDatum,
  NativeChartVariant,
  ParsedPptxDeck,
  PptxChartBlock,
  PptxDeckInput,
  PptxDeckPresetId,
  PptxShapeKind,
  PptxShapeTone,
  PptxSlideInput,
  PptxSmartArtBlock,
  PptxTableModel,
  PptxTransitionKind,
  PptxVectorShape,
  SmartArtItem,
  SmartArtVariant,
} from "./ooxml-pptx-types";

export {
  OOXML_THEMES,
  PPTX_SLIDE_SIZES,
  escapeXml,
  getOoxmlThemeSpec,
  unescapeXml,
  type OoxmlThemeId,
  type OoxmlThemeSpec,
  type PptxSlideDimensions,
  type PptxSlideSizePreset,
} from "./ooxml-theme-spec";

function pctToEmu(pct: number, totalEmu: number): number {
  const clamped = Math.min(100, Math.max(0, pct));
  return Math.round((clamped / 100) * totalEmu);
}

function buildSlideXml(
  slide: PptxSlideInput,
  dims: PptxSlideDimensions,
  theme: OoxmlThemeSpec,
): string {
  const tracker: ShapeIdTracker = { nextId: 2, targetSpids: {} };
  const elements: string[] = [];

  // 1. 제목 프레임
  const titleId = tracker.nextId;
  tracker.nextId += 1;
  tracker.targetSpids.title = titleId;
  elements.push(
    buildShapeTextBoxXml(
      {
        id: titleId,
        name: "Title",
        placeholderType: "title",
        x: pctToEmu(5, dims.cxEmu),
        y: pctToEmu(5, dims.cyEmu),
        cx: pctToEmu(90, dims.cxEmu),
        cy: pctToEmu(11, dims.cyEmu),
        paragraphs: [slide.title],
        fontSizePt: 26,
        colorHex: theme.palette.textPrimary,
        bold: true,
      },
      theme,
    ),
  );

  // 2. 부제목 프레임
  if (slide.subtitle && slide.subtitle.trim().length > 0) {
    const subId = tracker.nextId;
    tracker.nextId += 1;
    elements.push(
      buildShapeTextBoxXml(
        {
          id: subId,
          name: "Subtitle",
          placeholderType: "subTitle",
          x: pctToEmu(5, dims.cxEmu),
          y: pctToEmu(16.5, dims.cyEmu),
          cx: pctToEmu(90, dims.cxEmu),
          cy: pctToEmu(7, dims.cyEmu),
          paragraphs: [slide.subtitle],
          fontSizePt: 14,
          colorHex: theme.palette.textMuted,
        },
        theme,
      ),
    );
  }

  const bullets = (slide.bullets ?? []).filter((line) => line.trim().length > 0);
  const hasBullets = bullets.length > 0;
  const hasVisual = Boolean(slide.smartArt || slide.chart);
  const hasTable = Boolean(slide.table);

  // 3. 본문 글머리 프레임
  if (hasBullets) {
    const bulletId = tracker.nextId;
    tracker.nextId += 1;
    tracker.targetSpids.bullets = bulletId;
    elements.push(
      buildShapeTextBoxXml(
        {
          id: bulletId,
          name: "Bullets",
          placeholderType: "body",
          x: pctToEmu(5, dims.cxEmu),
          y: pctToEmu(26, dims.cyEmu),
          cx: pctToEmu(hasVisual || hasTable ? 41 : 88, dims.cxEmu),
          cy: pctToEmu(58, dims.cyEmu),
          paragraphs: bullets,
          fontSizePt: 15,
          colorHex: theme.palette.textPrimary,
          bulleted: true,
        },
        theme,
      ),
    );
  }

  // 4. SmartArt / 차트 시각 블록
  const visualXPct = hasBullets ? 49 : 5;
  const visualWPct = hasBullets ? 46 : hasTable ? 44 : 90;
  const visualHPct = hasBullets && hasTable ? 30 : 56;

  if (slide.smartArt) {
    elements.push(
      buildSmartArtOoxmlShapes(
        slide.smartArt,
        pctToEmu(visualXPct, dims.cxEmu),
        pctToEmu(26, dims.cyEmu),
        pctToEmu(visualWPct, dims.cxEmu),
        pctToEmu(visualHPct, dims.cyEmu),
        theme,
        tracker,
      ),
    );
  } else if (slide.chart) {
    elements.push(
      buildChartOoxmlShapes(
        slide.chart,
        pctToEmu(visualXPct, dims.cxEmu),
        pctToEmu(26, dims.cyEmu),
        pctToEmu(visualWPct, dims.cxEmu),
        pctToEmu(visualHPct, dims.cyEmu),
        theme,
        tracker,
      ),
    );
  }

  // 5. OOXML 네이티브 표 (<a:tbl>)
  if (slide.table) {
    const tableId = tracker.nextId;
    tracker.nextId += 1;
    tracker.targetSpids.table = tableId;
    elements.push(
      buildTableGraphicFrameXml(
        tableId,
        slide.table,
        pctToEmu(hasBullets ? 49 : hasVisual ? 52 : 5, dims.cxEmu),
        pctToEmu(hasBullets && hasVisual ? 59 : 26, dims.cyEmu),
        pctToEmu(hasBullets ? 46 : hasVisual ? 43 : 90, dims.cxEmu),
        pctToEmu(hasBullets && hasVisual ? 29 : 54, dims.cyEmu),
        theme,
      ),
    );
  }

  // 6. 벡터 도형 (rect / roundRect / ellipse / arrow)
  for (const shape of slide.shapes ?? []) {
    const spId = tracker.nextId;
    tracker.nextId += 1;
    if (tracker.targetSpids.shapes === undefined) tracker.targetSpids.shapes = spId;
    elements.push(
      buildShapeTextBoxXml(
        {
          id: spId,
          name: `Shape:${shape.kind}:${shape.id}`,
          x: pctToEmu(shape.xPct, dims.cxEmu),
          y: pctToEmu(shape.yPct, dims.cyEmu),
          cx: pctToEmu(shape.wPct, dims.cxEmu),
          cy: pctToEmu(shape.hPct, dims.cyEmu),
          paragraphs: [shape.label],
          fontSizePt: 12,
          colorHex: resolveToneTextHex(shape.tone, theme),
          bold: true,
          fillHex: resolveToneFillHex(shape.tone, theme),
          borderHex: shape.tone === "surface" ? theme.palette.border : undefined,
          presetGeom: shapeKindToOoxmlPreset(shape.kind),
          align: "ctr",
        },
        theme,
      ),
    );
  }

  return `${XML_DECL}
<p:sld xmlns:a="${OOXML_NS.a}" xmlns:r="${OOXML_NS.r}" xmlns:p="${OOXML_NS.p}">
  <p:cSld>
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="${theme.palette.canvas}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${elements.join("\n")}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
  ${buildTransitionXml(slide.transition)}
  ${buildTimingXml(slide.animations, tracker.targetSpids)}
</p:sld>`;
}

function buildSlideRelsXml(n: number): string {
  return `${XML_DECL}
<Relationships xmlns="${OOXML_NS.pkgRel}">
  <Relationship Id="rId1" Type="${OOXML_REL_TYPES.slideLayout}" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="${OOXML_REL_TYPES.notesSlide}" Target="../notesSlides/notesSlide${n}.xml"/>
</Relationships>`;
}

function buildNotesSlideXml(notesText: string, theme: OoxmlThemeSpec): string {
  const lines = notesText.length > 0 ? notesText.split(/\r?\n/) : [""];
  const paragraphsXml = lines
    .map(
      (line) =>
        `<a:p>${
          line.length > 0
            ? buildTextRunXml(line, 12, theme.palette.textPrimary, false, theme)
            : '<a:endParaRPr lang="ko-KR"/>'
        }</a:p>`,
    )
    .join("");

  return `${XML_DECL}
<p:notes xmlns:a="${OOXML_NS.a}" xmlns:r="${OOXML_NS.r}" xmlns:p="${OOXML_NS.p}">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="685800" y="1143000"/><a:ext cx="5486400" cy="3086100"/></a:xfrm></p:spPr>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="685800" y="4572000"/><a:ext cx="5486400" cy="3657600"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/>${paragraphsXml}</p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:notes>`;
}

function buildNotesSlideRelsXml(n: number): string {
  return `${XML_DECL}
<Relationships xmlns="${OOXML_NS.pkgRel}">
  <Relationship Id="rId1" Type="${OOXML_REL_TYPES.notesMaster}" Target="../notesMasters/notesMaster1.xml"/>
  <Relationship Id="rId2" Type="${OOXML_REL_TYPES.slide}" Target="../slides/slide${n}.xml"/>
</Relationships>`;
}

function buildContentTypesXml(slideCount: number): string {
  const slideOverrides = Array.from({ length: slideCount }, (_, idx) => {
    const n = idx + 1;
    return [
      `  <Override PartName="/ppt/slides/slide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
      `  <Override PartName="/ppt/notesSlides/notesSlide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`,
    ].join("\n");
  }).join("\n");

  return `${XML_DECL}
<Types xmlns="${OOXML_NS.ct}">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>
  <Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>
  <Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
${slideOverrides}
</Types>`;
}

function buildRootRelsXml(): string {
  return `${XML_DECL}
<Relationships xmlns="${OOXML_NS.pkgRel}">
  <Relationship Id="rId1" Type="${OOXML_REL_TYPES.officeDocument}" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="${OOXML_REL_TYPES.coreProperties}" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="${OOXML_REL_TYPES.extendedProperties}" Target="docProps/app.xml"/>
</Relationships>`;
}

function buildPresentationXml(slideCount: number, dims: PptxSlideDimensions): string {
  const sldIds = Array.from({ length: slideCount }, (_, idx) =>
    `    <p:sldId id="${256 + idx}" r:id="rId${7 + idx}"/>`,
  ).join("\n");
  const typeAttr = dims.ooxmlTypeAttr ? ` type="${dims.ooxmlTypeAttr}"` : "";

  return `${XML_DECL}
<p:presentation xmlns:a="${OOXML_NS.a}" xmlns:r="${OOXML_NS.r}" xmlns:p="${OOXML_NS.p}" saveSubsetFonts="1">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst>
  <p:sldIdLst>
${sldIds}
  </p:sldIdLst>
  <p:sldSz cx="${dims.cxEmu}" cy="${dims.cyEmu}"${typeAttr}/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;
}

function buildPresentationRelsXml(slideCount: number): string {
  const slideRels = Array.from({ length: slideCount }, (_, idx) =>
    `  <Relationship Id="rId${7 + idx}" Type="${OOXML_REL_TYPES.slide}" Target="slides/slide${idx + 1}.xml"/>`,
  ).join("\n");

  return `${XML_DECL}
<Relationships xmlns="${OOXML_NS.pkgRel}">
  <Relationship Id="rId1" Type="${OOXML_REL_TYPES.slideMaster}" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId2" Type="${OOXML_REL_TYPES.notesMaster}" Target="notesMasters/notesMaster1.xml"/>
  <Relationship Id="rId3" Type="${OOXML_REL_TYPES.presProps}" Target="presProps.xml"/>
  <Relationship Id="rId4" Type="${OOXML_REL_TYPES.viewProps}" Target="viewProps.xml"/>
  <Relationship Id="rId5" Type="${OOXML_REL_TYPES.tableStyles}" Target="tableStyles.xml"/>
  <Relationship Id="rId6" Type="${OOXML_REL_TYPES.theme}" Target="theme/theme1.xml"/>
${slideRels}
</Relationships>`;
}

/**
 * 실제 PowerPoint / Keynote / LibreOffice 호환 `.pptx` OOXML 바이너리 아카이브를 생성한다.
 */
export function buildPptxArchive(deck: PptxDeckInput): Uint8Array {
  const slides =
    deck.slides.length > 0
      ? deck.slides
      : [{ id: "slide-1", title: deck.title || "빈 프레젠테이션" }];
  const dims = PPTX_SLIDE_SIZES[deck.slideSize] ?? PPTX_SLIDE_SIZES["16:9"];
  const theme = getOoxmlThemeSpec(deck.themeId);

  const entries: ZipArchiveEntryInput[] = [
    { path: "[Content_Types].xml", data: buildContentTypesXml(slides.length) },
    { path: "_rels/.rels", data: buildRootRelsXml() },
    { path: "docProps/core.xml", data: buildCorePropsXml(deck.title, deck.author ?? "ToonStudio") },
    { path: "docProps/app.xml", data: buildAppPropsXml(slides.length) },
    { path: "ppt/presentation.xml", data: buildPresentationXml(slides.length, dims) },
    { path: "ppt/_rels/presentation.xml.rels", data: buildPresentationRelsXml(slides.length) },
    { path: "ppt/presProps.xml", data: buildPresPropsXml() },
    { path: "ppt/viewProps.xml", data: buildViewPropsXml() },
    { path: "ppt/tableStyles.xml", data: buildTableStylesXml() },
    { path: "ppt/theme/theme1.xml", data: buildThemeXml(theme) },
    { path: "ppt/slideMasters/slideMaster1.xml", data: buildSlideMasterXml(theme) },
    { path: "ppt/slideMasters/_rels/slideMaster1.xml.rels", data: buildSlideMasterRelsXml() },
    { path: "ppt/slideLayouts/slideLayout1.xml", data: buildSlideLayoutXml() },
    { path: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", data: buildSlideLayoutRelsXml() },
    { path: "ppt/notesMasters/notesMaster1.xml", data: buildNotesMasterXml() },
    { path: "ppt/notesMasters/_rels/notesMaster1.xml.rels", data: buildNotesMasterRelsXml() },
  ];

  slides.forEach((slide, idx) => {
    const n = idx + 1;
    entries.push(
      { path: `ppt/slides/slide${n}.xml`, data: buildSlideXml(slide, dims, theme) },
      { path: `ppt/slides/_rels/slide${n}.xml.rels`, data: buildSlideRelsXml(n) },
      { path: `ppt/notesSlides/notesSlide${n}.xml`, data: buildNotesSlideXml(slide.speakerNotes ?? "", theme) },
      { path: `ppt/notesSlides/_rels/notesSlide${n}.xml.rels`, data: buildNotesSlideRelsXml(n) },
    );
  });

  return buildZipArchive(entries);
}
