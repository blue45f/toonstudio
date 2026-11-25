import type { PapercraftDielineResult, PaperFoldPreviewResult, OklchColor, Vec2, DielineEdge2D } from "./papercraft-unfold-engine";

export const MOUNTAIN_FOLD_DASH = "6 3";
export const VALLEY_FOLD_DASH = "8 3 1.5 3";
const ZERO2: Vec2 = { x: 0, y: 0 };
const r2 = (n: number): number => Math.round(n * 100) / 100;
const clamp = (n: number, min: number, max: number): number => Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;

/** 외부 JSON을 검사한 뒤 재계산·문자열 생성을 시작한다. 원문을 자르지 않는다. */
export function assertExportBudget(value: unknown): void {
  let remaining = 20_000;
  const ancestors = new WeakSet<object>();
  function visit(item: unknown, depth: number): void {
    if (--remaining < 0 || depth > 20) throw new RangeError("내보내기 데이터가 너무 큽니다.");
    if (item === null || typeof item === "boolean") return;
    if (typeof item === "number") {
      if (!Number.isFinite(item) || Math.abs(item) > 1_000_000) throw new RangeError("내보내기 수치 범위를 벗어났습니다.");
      return;
    }
    if (typeof item === "string") {
      if (item.length > 2048) throw new RangeError("내보내기 원문이 너무 깁니다.");
      for (const char of item) {
        const code = char.codePointAt(0) ?? 0;
        if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || (code >= 0xd800 && code <= 0xdfff)) throw new RangeError("XML에서 표현할 수 없는 문자입니다.");
      }
      return;
    }
    if (typeof item !== "object" || ancestors.has(item)) throw new RangeError("순환 또는 지원하지 않는 내보내기 데이터입니다.");
    ancestors.add(item);
    if (Array.isArray(item)) {
      if (item.length > 2048) throw new RangeError("내보내기 배열이 너무 큽니다.");
      for (let index = 0; index < item.length; index++) {
        if (!Object.hasOwn(item, index)) throw new RangeError("희소 배열은 내보낼 수 없습니다.");
        visit(item[index], depth + 1);
      }
    } else {
      const entries = Object.entries(item);
      if (entries.length > 64) throw new RangeError("내보내기 속성이 너무 많습니다.");
      for (const [key, child] of entries) {
        if (key === "totalPages" && (typeof child !== "number" || !Number.isInteger(child) || child < 1 || child > 128)) throw new RangeError("인쇄 쪽수는 1~128이어야 합니다.");
        visit(child, depth + 1);
      }
    }
    ancestors.delete(item);
  }
  visit(value, 0);
}

/** 표제·면 이름은 보존하고 형상·ID·감사 수치는 원래 산식과 일치해야 한다. */
export function assertGeneratedResult(actual: unknown, expected: unknown, key = ""): void {
  if (["nameKo", "nameEn", "labelKo", "labelEn"].includes(key) && typeof actual === "string" && typeof expected === "string") return;
  if (actual === expected) return;
  if (typeof actual !== "object" || actual === null || typeof expected !== "object" || expected === null || Array.isArray(actual) !== Array.isArray(expected)) throw new RangeError("계산 결과와 내보내기 데이터가 일치하지 않습니다.");
  const a: [string, unknown][] = Object.entries(actual); const b: [string, unknown][] = Object.entries(expected);
  if (a.length !== b.length) throw new RangeError("내보내기 데이터 구조가 일치하지 않습니다.");
  const values = new Map(a);
  for (const [name, value] of b) {
    if (!values.has(name)) throw new RangeError("내보내기 속성이 누락됐습니다.");
    assertGeneratedResult(values.get(name), value, name);
  }
}

function xml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

/** 같은 타일 묶음의 모든 교차 조각을 그린다. 원점이 같은 별도 용지는 섞지 않는다. */
export function getDielinePageGeometry(dieline: PapercraftDielineResult, pageIndex: number): {
  readonly origin: Vec2; readonly faces: PapercraftDielineResult["faces"];
  readonly tabs: PapercraftDielineResult["glueTabs"]; readonly targetTabs: PapercraftDielineResult["glueTabs"];
  readonly cuts: PapercraftDielineResult["cutEdges"]; readonly mountains: PapercraftDielineResult["mountainFoldEdges"];
  readonly valleys: PapercraftDielineResult["valleyFoldEdges"];
} {
  const origin = dieline.pages[pageIndex]?.sheetOriginMm ?? ZERO2;
  const spec = dieline.paperSpec;
  function group(index: number): number {
    for (let page = index; page >= 0; page--) {
      const at = dieline.pages[page]?.sheetOriginMm;
      if (at?.x === 0 && at.y === 0) return page;
    }
    return 0;
  }
  const targetGroup = group(pageIndex);
  function intersects(points: readonly Vec2[], owner: number): boolean {
    if (group(owner) !== targetGroup) return false;
    const xs = points.map((point) => point.x); const ys = points.map((point) => point.y);
    return Math.max(...xs) >= origin.x + spec.printableMarginMm && Math.min(...xs) <= origin.x + spec.widthMm - spec.printableMarginMm
      && Math.max(...ys) >= origin.y + spec.printableMarginMm && Math.min(...ys) <= origin.y + spec.heightMm - spec.printableMarginMm;
  }
  const edgeVisible = (edge: DielineEdge2D): boolean => intersects([edge.startMm, edge.endMm], edge.pageIndex);
  return {
    origin,
    faces: dieline.faces.filter((face) => intersects(face.polygonMm, face.pageIndex)),
    tabs: dieline.glueTabs.filter((tab) => intersects(tab.polygonMm, tab.pageIndex)),
    targetTabs: dieline.glueTabs.filter((tab) => intersects([tab.targetLabelPosMm], tab.targetPageIndex)),
    cuts: dieline.cutEdges.filter(edgeVisible), mountains: dieline.mountainFoldEdges.filter(edgeVisible), valleys: dieline.valleyFoldEdges.filter(edgeVisible),
  };
}

export function renderDielineSvg(
  dieline: PapercraftDielineResult,
  options: { readonly pageIndex?: number; readonly includeLegend?: boolean } | undefined,
  formatOklch: (color: OklchColor, alpha?: number) => string,
): string {
  const { widthMm, heightMm, printableMarginMm } = dieline.paperSpec;
  const pageIndices = options?.pageIndex === undefined
    ? Array.from({ length: dieline.totalPages }, (_, idx) => idx) : [clamp(Math.floor(options.pageIndex), 0, dieline.totalPages - 1)];
  const gapMm = 8;
  const totalW = r2(pageIndices.length * widthMm + (pageIndices.length - 1) * gapMm);
  const paperBg = formatOklch({ l: 0.98, c: 0.006, h: 92 }); const guide = formatOklch({ l: 0.72, c: 0.012, h: 230 }, 0.55);
  const tabFill = formatOklch({ l: 0.92, c: 0.025, h: 82 }, 0.9); const cutInk = formatOklch({ l: 0.2, c: 0.015, h: 240 });
  const mtnInk = formatOklch({ l: 0.55, c: 0.18, h: 28 }); const valInk = formatOklch({ l: 0.5, c: 0.145, h: 226 });
  const lblInk = formatOklch({ l: 0.26, c: 0.016, h: 240 });

  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}mm" height="${heightMm}mm" viewBox="0 0 ${totalW} ${heightMm}" data-schema="toonstudio.papercraft-dieline-svg.v1" data-preset="${xml(dieline.preset.id)}" data-paper="${xml(dieline.paperSpec.id)}" data-gsm="${dieline.paperCompensation.gsm}" data-pages="${pageIndices.length}">`,
    `  <title>${xml(dieline.preset.nameKo)} (${xml(dieline.paperSpec.id)} · ${dieline.paperCompensation.gsm}gsm · ${dieline.scale}x)</title>`,
  ];
  for (let slot = 0; slot < pageIndices.length; slot += 1) {
    const pIdx = pageIndices[slot] ?? 0;
    const { origin, faces, tabs, targetTabs, cuts, mountains, valleys } = getDielinePageGeometry(dieline, pIdx);
    const sh = (p: Vec2): Vec2 => ({ x: r2(p.x - origin.x), y: r2(p.y - origin.y) });
    const pts = (arr: readonly Vec2[]): string => arr.map((p) => { const s = sh(p); return `${s.x},${s.y}`; }).join(" ");
    const ln = (e: DielineEdge2D): string => { const a = sh(e.startMm); const b = sh(e.endMm); return `      <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`; };
    out.push(
      `  <g id="page-${pIdx + 1}" transform="translate(${r2(slot * (widthMm + gapMm))}, 0)">`,
      `    <rect x="0" y="0" width="${widthMm}" height="${heightMm}" fill="${paperBg}" stroke="${guide}" stroke-width="0.4" />`,
      `    <rect x="${printableMarginMm}" y="${printableMarginMm}" width="${widthMm - printableMarginMm * 2}" height="${heightMm - printableMarginMm * 2}" fill="none" stroke="${guide}" stroke-width="0.35" stroke-dasharray="3 3" />`,
      `    <defs><clipPath id="print-area-${pIdx + 1}"><rect x="${printableMarginMm}" y="${printableMarginMm}" width="${widthMm - printableMarginMm * 2}" height="${heightMm - printableMarginMm * 2}" /></clipPath></defs>`,
      `    <g clip-path="url(#print-area-${pIdx + 1})"><g id="faces-${pIdx + 1}">`,
      ...faces.map((f) => `      <polygon data-face="${xml(f.faceId)}" points="${pts(f.polygonMm)}" fill="${formatOklch(f.colorOklch, 0.38)}" stroke="none" />`),
      `    </g><g id="glue-tabs-${pIdx + 1}">`,
      ...tabs.map((t) => `      <polygon data-tab="${xml(t.tabId)}" data-pair="${t.pairNumber}" points="${pts(t.polygonMm)}" fill="${tabFill}" stroke="${cutInk}" stroke-width="0.45" />`),
      `    </g><g id="mountain-folds-${pIdx + 1}" fill="none" stroke="${mtnInk}" stroke-width="0.55" stroke-dasharray="${MOUNTAIN_FOLD_DASH}">`,
      ...mountains.map(ln),
      `    </g><g id="valley-folds-${pIdx + 1}" fill="none" stroke="${valInk}" stroke-width="0.55" stroke-dasharray="${VALLEY_FOLD_DASH}">`,
      ...valleys.map(ln),
      `    </g><g id="cut-lines-${pIdx + 1}" fill="none" stroke="${cutInk}" stroke-width="0.7" stroke-linecap="round">`,
      ...cuts.map(ln),
      `    </g><g id="tab-numbers-${pIdx + 1}" fill="${lblInk}" font-family="monospace" font-size="3.2" font-weight="700" text-anchor="middle" dominant-baseline="central">`,
      ...tabs.map((t) => { const c = sh(t.labelPosMm); return `      <text x="${c.x}" y="${c.y}">${t.pairNumber}</text>`; }),
      ...targetTabs.map((t) => { const c = sh(t.targetLabelPosMm); return `      <text x="${c.x}" y="${c.y}" fill-opacity="0.72">${t.pairNumber}</text>`; }),
      `    </g></g>`,
      ...(options?.includeLegend === false ? [] : [`    <text x="${printableMarginMm}" y="${heightMm - 4.2}" font-family="sans-serif" font-size="3.2" fill="${lblInk}">ToonStudio · ${xml(dieline.preset.nameKo)} · ${xml(dieline.paperSpec.id)} (${pIdx + 1}/${dieline.totalPages}) · ${dieline.paperCompensation.gsm}gsm (+${dieline.paperCompensation.foldAllowanceMm}mm) · 실선=재단 · 파선=산접기 · 일점쇄선=골접기</text>`]),
      `  </g>`,
    );
  }
  out.push(`</svg>`);
  return out.join("\n");
}


export function serializePapercraftManifest(dieline: PapercraftDielineResult, preview: PaperFoldPreviewResult): string {
  return JSON.stringify({
    schema: "toonstudio.papercraft-unfold-goods.v1",
    evidence: { geometry: "cpu-fixed-mesh-unfold-and-rigid-fold", printerCalibrated: false, materialMeasured: false, assemblyVerified: false, persisted: false, paperValues: "illustrative-assumptions", assemblyMinutes: "heuristic-estimate" },
    preset: { id: dieline.preset.id, nameKo: dieline.preset.nameKo, nameEn: dieline.preset.nameEn, categoryKo: dieline.preset.categoryKo, recommendedPaperWeight: dieline.preset.recommendedPaperWeight },
    sheet: { paperSize: dieline.paperSpec.id, widthMm: dieline.paperSpec.widthMm, heightMm: dieline.paperSpec.heightMm, printableMarginMm: dieline.paperSpec.printableMarginMm, scale: dieline.scale, totalPages: dieline.totalPages, paperUtilizationPercent: dieline.paperUtilizationPercent },
    paperCompensation: dieline.paperCompensation,
    dielineMetrics: {
      faceCount: dieline.faces.length, cutEdgeCount: dieline.cutEdges.length, mountainFoldCount: dieline.mountainFoldEdges.length,
      valleyFoldCount: dieline.valleyFoldEdges.length, glueTabCount: dieline.glueTabs.length,
      totalCutLengthMm: dieline.totalCutLengthMm, totalFoldLengthMm: dieline.totalFoldLengthMm,
      boundingBoxMm: dieline.boundingBoxMm, assemblyDifficulty: dieline.assemblyDifficulty,
      estimatedAssemblyMinutes: dieline.estimatedAssemblyMinutes, pairIntegrity: dieline.pairIntegrity,
    },
    glueTabPairs: dieline.glueTabs.map((t) => ({
      pairNumber: t.pairNumber, tabId: t.tabId, hostFaceId: t.hostFaceId, targetFaceId: t.targetFaceId,
      edgeLengthMm: t.edgeLengthMm, tabWidthMm: t.tabWidthMm, pageIndex: t.pageIndex,
    })),
    foldPreview: {
      foldProgress: preview.foldProgress, foldAngleDeg: preview.foldAngleDeg, cameraYawDeg: preview.cameraYawDeg,
      cameraPitchDeg: preview.cameraPitchDeg, paperThicknessPx: preview.paperThicknessPx, maxElevationMm: preview.maxElevationMm,
    },
  }, null, 2);
}
