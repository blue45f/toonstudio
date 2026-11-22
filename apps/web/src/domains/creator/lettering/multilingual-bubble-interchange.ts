/**
 * SFX 비손상 레이어 분리 메타데이터 & 대사 CSV/XLIFF 1.2 왕복 직렬화 엔진 (#089).
 *
 * - SFX 외곽선·아치 변형·배경 비손상 잠금 메타데이터 생성 및 로케일 변형 관리.
 * - 번역가 외부 툴 연동을 위한 RFC 4180 CSV 및 XLIFF 1.2 무손실 1클릭 추출·역주입.
 * - DOM·브라우저 스토리지 의존 없음(순수·결정적).
 */

import {
  BUBBLE_REFLOW_LOCALES,
  type BubbleReflowLocale,
  type BubbleWritingMode,
} from "./multilingual-bubble-tategaki";

export type SfxArchWarpShape = "none" | "arcUp" | "arcDown" | "wave" | "perspective-tilt";

export interface SfxNonDestructiveLayerMetadata {
  readonly schemaVersion: "toonstudio.sfx-layer.v1";
  readonly sfxId: string;
  readonly cutId: string;
  readonly layerRole: "sfx-overlay";
  readonly sourceLocale: BubbleReflowLocale;
  readonly sourceText: string;
  readonly outline: {
    readonly enabled: boolean;
    readonly color: string;
    readonly widthPx: number;
    readonly join: "round" | "miter";
    readonly doubleStrokeColor: string | null;
    readonly doubleStrokeWidthPx: number;
  };
  readonly archWarp: {
    readonly shape: SfxArchWarpShape;
    readonly bendPercent: number;
    readonly envelopeSkewDeg: number;
    readonly baselineScaleY: number;
  };
  readonly backgroundPreservation: {
    readonly nonDestructive: true;
    readonly backgroundLayerId: string;
    readonly inpaintMaskLayerId: string;
    readonly originalArtworkLocked: true;
    readonly blendMode: "normal" | "multiply" | "screen";
  };
  readonly localeVariants: Readonly<
    Partial<Record<BubbleReflowLocale, { readonly text: string; readonly scaleFactor: number }>>
  >;
}

export interface DialogueInterchangeEntry {
  readonly cutId: string;
  readonly bubbleId: string;
  readonly speaker: string;
  readonly kind: "dialogue" | "narration" | "sfx";
  readonly writingMode: BubbleWritingMode;
  readonly sourceLocale: BubbleReflowLocale;
  readonly texts: Readonly<Partial<Record<BubbleReflowLocale, string>>>;
  readonly sfxOutlineWidthPx?: number;
  readonly sfxArchShape?: SfxArchWarpShape;
  readonly notes?: string;
}

export interface DialogueReinjectionReport {
  readonly entries: readonly DialogueInterchangeEntry[];
  readonly updatedCount: number;
  readonly unchangedCount: number;
  readonly unmatchedIds: readonly string[];
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function createSfxNonDestructiveLayerMetadata(input: {
  readonly sfxId: string;
  readonly cutId: string;
  readonly sourceText: string;
  readonly sourceLocale?: BubbleReflowLocale;
  readonly backgroundLayerId: string;
  readonly outlineColor?: string;
  readonly outlineWidthPx?: number;
  readonly doubleStrokeColor?: string | null;
  readonly doubleStrokeWidthPx?: number;
  readonly archShape?: SfxArchWarpShape;
  readonly bendPercent?: number;
  readonly envelopeSkewDeg?: number;
  readonly baselineScaleY?: number;
  readonly blendMode?: "normal" | "multiply" | "screen";
}): SfxNonDestructiveLayerMetadata {
  const sourceLocale = input.sourceLocale ?? "ko";
  return Object.freeze({
    schemaVersion: "toonstudio.sfx-layer.v1",
    sfxId: input.sfxId,
    cutId: input.cutId,
    layerRole: "sfx-overlay",
    sourceLocale,
    sourceText: input.sourceText,
    outline: Object.freeze({
      enabled: (input.outlineWidthPx ?? 5) > 0,
      color: input.outlineColor ?? "#111111",
      widthPx: clamp(input.outlineWidthPx ?? 5, 0, 24),
      join: "round",
      doubleStrokeColor: input.doubleStrokeColor ?? "#ffffff",
      doubleStrokeWidthPx: clamp(input.doubleStrokeWidthPx ?? 2, 0, 12),
    }),
    archWarp: Object.freeze({
      shape: input.archShape ?? "arcUp",
      bendPercent: clamp(input.bendPercent ?? 32, -100, 100),
      envelopeSkewDeg: clamp(input.envelopeSkewDeg ?? -6, -45, 45),
      baselineScaleY: clamp(input.baselineScaleY ?? 1.08, 0.5, 2.0),
    }),
    backgroundPreservation: Object.freeze({
      nonDestructive: true,
      backgroundLayerId: input.backgroundLayerId,
      inpaintMaskLayerId: `${input.backgroundLayerId}__sfx-mask-${input.sfxId}`,
      originalArtworkLocked: true,
      blendMode: input.blendMode ?? "normal",
    }),
    localeVariants: Object.freeze({
      [sourceLocale]: Object.freeze({ text: input.sourceText, scaleFactor: 1 }),
    }),
  });
}

export function updateSfxLocaleVariant(
  layer: SfxNonDestructiveLayerMetadata,
  locale: BubbleReflowLocale,
  patch: { readonly text: string; readonly scaleFactor?: number },
): SfxNonDestructiveLayerMetadata {
  return Object.freeze({
    ...layer,
    localeVariants: Object.freeze({
      ...layer.localeVariants,
      [locale]: Object.freeze({
        text: patch.text,
        scaleFactor: clamp(patch.scaleFactor ?? 1, 0.4, 2.0),
      }),
    }),
  });
}

const CSV_HEADERS = [
  "cutId",
  "bubbleId",
  "speaker",
  "kind",
  "writingMode",
  "sourceLocale",
  "ko",
  "en",
  "ja",
  "es",
  "sfxOutlineWidthPx",
  "sfxArchShape",
  "notes",
] as const;

function escapeCsvCell(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function exportDialogueToCsv(
  entries: readonly DialogueInterchangeEntry[],
  options: { readonly includeUtf8Bom?: boolean } = {},
): string {
  const rows: string[] = [CSV_HEADERS.join(",")];
  for (const entry of entries) {
    const cells = [
      entry.cutId,
      entry.bubbleId,
      entry.speaker,
      entry.kind,
      entry.writingMode,
      entry.sourceLocale,
      entry.texts.ko ?? "",
      entry.texts.en ?? "",
      entry.texts.ja ?? "",
      entry.texts.es ?? "",
      entry.sfxOutlineWidthPx !== undefined ? String(entry.sfxOutlineWidthPx) : "",
      entry.sfxArchShape ?? "",
      entry.notes ?? "",
    ];
    rows.push(cells.map(escapeCsvCell).join(","));
  }
  const body = rows.join("\r\n");
  return options.includeUtf8Bom ? `\uFEFF${body}` : body;
}

function parseCsvRows(rawCsv: string): string[][] {
  const text = rawCsv.startsWith("\uFEFF") ? rawCsv.slice(1) : rawCsv;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function parseLocale(raw: string | undefined): BubbleReflowLocale {
  return raw === "en" || raw === "ja" || raw === "es" ? raw : "ko";
}

function parseKind(raw: string | undefined): DialogueInterchangeEntry["kind"] {
  return raw === "narration" || raw === "sfx" ? raw : "dialogue";
}

function parseWritingMode(raw: string | undefined): BubbleWritingMode {
  return raw === "vertical-rl" ? "vertical-rl" : "horizontal-tb";
}

function parseArchShape(raw: string | undefined): SfxArchWarpShape | undefined {
  return raw === "none" || raw === "arcUp" || raw === "arcDown" || raw === "wave" || raw === "perspective-tilt"
    ? raw
    : undefined;
}

export function importDialogueFromCsv(csvText: string): readonly DialogueInterchangeEntry[] {
  const rows = parseCsvRows(csvText).filter((r) => r.some((cell) => cell.trim() !== ""));
  if (rows.length < 2) return Object.freeze([]);
  const headerIndex = new Map<string, number>();
  rows[0]!.forEach((name, idx) => headerIndex.set(name.trim(), idx));
  const read = (row: readonly string[], key: string): string => {
    const idx = headerIndex.get(key);
    return idx !== undefined ? (row[idx] ?? "") : "";
  };

  const entries: DialogueInterchangeEntry[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i]!;
    const cutId = read(row, "cutId").trim();
    const bubbleId = read(row, "bubbleId").trim();
    if (!cutId || !bubbleId) continue;

    const texts: Partial<Record<BubbleReflowLocale, string>> = {};
    for (const loc of BUBBLE_REFLOW_LOCALES) {
      const val = read(row, loc);
      if (val !== "") texts[loc] = val;
    }
    const outlineRaw = read(row, "sfxOutlineWidthPx").trim();
    const outlineNum = outlineRaw !== "" ? Number(outlineRaw) : undefined;
    const archShape = parseArchShape(read(row, "sfxArchShape").trim());
    const notes = read(row, "notes");

    entries.push(
      Object.freeze({
        cutId,
        bubbleId,
        speaker: read(row, "speaker"),
        kind: parseKind(read(row, "kind").trim()),
        writingMode: parseWritingMode(read(row, "writingMode").trim()),
        sourceLocale: parseLocale(read(row, "sourceLocale").trim()),
        texts: Object.freeze(texts),
        ...(outlineNum !== undefined && Number.isFinite(outlineNum) ? { sfxOutlineWidthPx: outlineNum } : {}),
        ...(archShape ? { sfxArchShape: archShape } : {}),
        ...(notes !== "" ? { notes } : {}),
      }),
    );
  }
  return Object.freeze(entries);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function unescapeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/gu, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/gu, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replaceAll("&apos;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

export function exportDialogueToXliff(
  entries: readonly DialogueInterchangeEntry[],
  options: {
    readonly originalName?: string;
    readonly sourceLocale?: BubbleReflowLocale;
    readonly targetLocale: BubbleReflowLocale;
  },
): string {
  const sourceLocale = options.sourceLocale ?? "ko";
  const targetLocale = options.targetLocale;
  const original = escapeXml(options.originalName ?? "toonstudio-episode.json");
  const units = entries.map((entry) => {
    const unitId = escapeXml(`${entry.cutId}::${entry.bubbleId}`);
    const metaPayload = escapeXml(
      JSON.stringify({
        cutId: entry.cutId,
        bubbleId: entry.bubbleId,
        speaker: entry.speaker,
        kind: entry.kind,
        writingMode: entry.writingMode,
        sfxOutlineWidthPx: entry.sfxOutlineWidthPx,
        sfxArchShape: entry.sfxArchShape,
        notes: entry.notes,
      }),
    );
    return [
      `      <trans-unit id="${unitId}" resname="${escapeXml(entry.bubbleId)}">`,
      `        <source xml:space="preserve">${escapeXml(entry.texts[sourceLocale] ?? "")}</source>`,
      `        <target xml:space="preserve">${escapeXml(entry.texts[targetLocale] ?? "")}</target>`,
      `        <note from="toonstudio-meta">${metaPayload}</note>`,
      `      </trans-unit>`,
    ].join("\n");
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">`,
    `  <file original="${original}" datatype="plaintext" source-language="${sourceLocale}" target-language="${targetLocale}">`,
    `    <body>`,
    ...units,
    `    </body>`,
    `  </file>`,
    `</xliff>`,
  ].join("\n");
}

export function importDialogueFromXliff(xliffXml: string): {
  readonly sourceLocale: BubbleReflowLocale;
  readonly targetLocale: BubbleReflowLocale;
  readonly entries: readonly DialogueInterchangeEntry[];
} {
  const fileAttrs = /<file\b([^>]*)>/u.exec(xliffXml)?.[1] ?? "";
  const sourceLocale = parseLocale(/source-language="([^"]+)"/u.exec(fileAttrs)?.[1]);
  const targetLocale = parseLocale(/target-language="([^"]+)"/u.exec(fileAttrs)?.[1]);
  const entries: DialogueInterchangeEntry[] = [];

  const unitRe = /<trans-unit\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/trans-unit>/gu;
  let match: RegExpExecArray | null;
  while ((match = unitRe.exec(xliffXml)) !== null) {
    const unitId = unescapeXml(match[1] ?? "");
    const body = match[2] ?? "";
    const srcMatch = /<source\b[^>]*>([\s\S]*?)<\/source>/u.exec(body);
    const tgtMatch = /<target\b[^>]*>([\s\S]*?)<\/target>/u.exec(body);
    const noteMatch = /<note\b[^>]*from="toonstudio-meta"[^>]*>([\s\S]*?)<\/note>/u.exec(body);

    const [fallbackCutId = "cut-001", fallbackBubbleId = unitId] = unitId.split("::");
    let meta: Partial<{
      cutId: string;
      bubbleId: string;
      speaker: string;
      kind: string;
      writingMode: string;
      sfxOutlineWidthPx: number;
      sfxArchShape: string;
      notes: string;
    }> = {};
    if (noteMatch?.[1]) {
      try {
        meta = JSON.parse(unescapeXml(noteMatch[1])) as typeof meta;
      } catch {
        meta = {};
      }
    }

    const texts: Partial<Record<BubbleReflowLocale, string>> = {};
    if (srcMatch) texts[sourceLocale] = unescapeXml(srcMatch[1] ?? "");
    if (tgtMatch) texts[targetLocale] = unescapeXml(tgtMatch[1] ?? "");
    const archShape = parseArchShape(meta.sfxArchShape);

    entries.push(
      Object.freeze({
        cutId: meta.cutId ?? fallbackCutId,
        bubbleId: meta.bubbleId ?? fallbackBubbleId,
        speaker: meta.speaker ?? "",
        kind: parseKind(meta.kind),
        writingMode: parseWritingMode(meta.writingMode),
        sourceLocale,
        texts: Object.freeze(texts),
        ...(typeof meta.sfxOutlineWidthPx === "number" ? { sfxOutlineWidthPx: meta.sfxOutlineWidthPx } : {}),
        ...(archShape ? { sfxArchShape: archShape } : {}),
        ...(meta.notes ? { notes: meta.notes } : {}),
      }),
    );
  }

  return Object.freeze({ sourceLocale, targetLocale, entries: Object.freeze(entries) });
}

export function reinjectLocalizedDialogueEntries(
  baseEntries: readonly DialogueInterchangeEntry[],
  importedEntries: readonly DialogueInterchangeEntry[],
  targetLocale?: BubbleReflowLocale,
): DialogueReinjectionReport {
  const keyOf = (entry: Pick<DialogueInterchangeEntry, "cutId" | "bubbleId">) =>
    `${entry.cutId}::${entry.bubbleId}`;
  const importedByKey = new Map(importedEntries.map((entry) => [keyOf(entry), entry]));
  const matchedKeys = new Set<string>();
  let updatedCount = 0;
  let unchangedCount = 0;

  const merged = baseEntries.map((base) => {
    const key = keyOf(base);
    const incoming = importedByKey.get(key);
    if (!incoming) {
      unchangedCount += 1;
      return base;
    }
    matchedKeys.add(key);

    const nextTexts: Partial<Record<BubbleReflowLocale, string>> = { ...base.texts };
    let changed = false;
    const localesToApply = targetLocale ? [targetLocale] : BUBBLE_REFLOW_LOCALES;
    for (const loc of localesToApply) {
      const val = incoming.texts[loc];
      if (val !== undefined && val !== base.texts[loc]) {
        nextTexts[loc] = val;
        changed = true;
      }
    }
    if (incoming.writingMode !== base.writingMode) changed = true;

    if (changed) {
      updatedCount += 1;
      return Object.freeze({
        ...base,
        writingMode: incoming.writingMode,
        texts: Object.freeze(nextTexts),
        ...(incoming.notes !== undefined ? { notes: incoming.notes } : {}),
      });
    }
    unchangedCount += 1;
    return base;
  });

  const unmatchedIds = importedEntries
    .map((entry) => keyOf(entry))
    .filter((key) => !matchedKeys.has(key));

  return Object.freeze({
    entries: Object.freeze(merged),
    updatedCount,
    unchangedCount,
    unmatchedIds: Object.freeze(unmatchedIds),
  });
}
