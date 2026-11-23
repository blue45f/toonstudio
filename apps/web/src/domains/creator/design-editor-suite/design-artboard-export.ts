/**
 * 독립 실행형 SVG · JSON 아트보드 직렬화 및 브라우저 다운로드 유틸리티
 * (OKLCH 시맨틱 CSS 변수 내장 · 원시 hex 0건)
 */

import {
  buildPhotoMaskSvgGeometry,
  getFontPairingPreset,
  type BrandKitId,
  type PhotoMaskFrameId,
} from "./brand-kit-templates-catalog";
import type { ComponentInstance, ComputedAutoLayoutNode } from "./figma-autolayout-engine";
import {
  computePrintBleedMetrics,
  getMagicResizeFormat,
  type DesignArtboardDocument,
  type DesignArtboardElement,
} from "./magic-resize-engine";

interface StandaloneOklchPalette {
  readonly bg: string;
  readonly surface: string;
  readonly ink: string;
  readonly muted: string;
  readonly accent: string;
  readonly accent2: string;
  readonly border: string;
  readonly onAccent: string;
}

const STANDALONE_SVG_OKLCH_PALETTES: Readonly<Record<BrandKitId, StandaloneOklchPalette>> = {
  "editorial-ink": { bg: "oklch(0.97 0.012 85)", surface: "oklch(0.93 0.016 82)", ink: "oklch(0.20 0.018 65)", muted: "oklch(0.45 0.018 70)", accent: "oklch(0.56 0.19 32)", accent2: "oklch(0.42 0.11 245)", border: "oklch(0.80 0.02 80)", onAccent: "oklch(0.98 0.008 85)" },
  "rofan-atelier": { bg: "oklch(0.96 0.018 76)", surface: "oklch(0.91 0.025 72)", ink: "oklch(0.25 0.06 16)", muted: "oklch(0.48 0.04 26)", accent: "oklch(0.42 0.14 14)", accent2: "oklch(0.68 0.13 82)", border: "oklch(0.79 0.04 70)", onAccent: "oklch(0.97 0.012 76)" },
  "seoul-poster": { bg: "oklch(0.975 0.006 250)", surface: "oklch(0.93 0.018 250)", ink: "oklch(0.22 0.06 262)", muted: "oklch(0.44 0.04 258)", accent: "oklch(0.50 0.21 262)", accent2: "oklch(0.62 0.20 38)", border: "oklch(0.78 0.04 255)", onAccent: "oklch(0.98 0.005 250)" },
  "matcha-studio": { bg: "oklch(0.96 0.014 115)", surface: "oklch(0.91 0.022 128)", ink: "oklch(0.24 0.045 148)", muted: "oklch(0.44 0.035 140)", accent: "oklch(0.44 0.11 148)", accent2: "oklch(0.60 0.14 48)", border: "oklch(0.79 0.03 130)", onAccent: "oklch(0.97 0.01 115)" },
  "noir-thriller": { bg: "oklch(0.16 0.016 265)", surface: "oklch(0.23 0.020 265)", ink: "oklch(0.95 0.008 85)", muted: "oklch(0.76 0.014 260)", accent: "oklch(0.62 0.22 24)", accent2: "oklch(0.74 0.14 215)", border: "oklch(0.36 0.022 265)", onAccent: "oklch(0.98 0.006 85)" },
  "sunny-goods": { bg: "oklch(0.97 0.032 94)", surface: "oklch(0.93 0.042 90)", ink: "oklch(0.26 0.04 52)", muted: "oklch(0.48 0.04 58)", accent: "oklch(0.64 0.18 42)", accent2: "oklch(0.62 0.14 166)", border: "oklch(0.82 0.05 84)", onAccent: "oklch(0.98 0.01 94)" },
  "blueprint-deck": { bg: "oklch(0.98 0.008 240)", surface: "oklch(0.93 0.018 240)", ink: "oklch(0.22 0.048 252)", muted: "oklch(0.45 0.035 246)", accent: "oklch(0.48 0.15 246)", accent2: "oklch(0.64 0.13 198)", border: "oklch(0.81 0.026 244)", onAccent: "oklch(0.98 0.006 240)" },
  "whiteboard-chalk": { bg: "oklch(0.97 0.009 98)", surface: "oklch(0.935 0.014 96)", ink: "oklch(0.25 0.018 250)", muted: "oklch(0.46 0.02 250)", accent: "oklch(0.50 0.13 194)", accent2: "oklch(0.68 0.16 74)", border: "oklch(0.76 0.022 96)", onAccent: "oklch(0.98 0.006 98)" },
};

function resolveElementText(el: DesignArtboardElement, isEnglish: boolean): string {
  return isEnglish ? (el.textEn ?? el.textKo ?? "") : (el.textKo ?? el.textEn ?? "");
}

function escapeXml(raw: string): string {
  return raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function serializeArtboardToSvg(
  artboard: DesignArtboardDocument,
  isEnglish: boolean,
): string {
  const kitId =
    artboard.brandKitId in STANDALONE_SVG_OKLCH_PALETTES
      ? (artboard.brandKitId as BrandKitId)
      : "editorial-ink";
  const palette = STANDALONE_SVG_OKLCH_PALETTES[kitId];
  const font = getFontPairingPreset(artboard.fontPairingId);
  const frameId = artboard.photoFrameId as PhotoMaskFrameId;
  const format = getMagicResizeFormat(artboard.formatId);
  const bleed = computePrintBleedMetrics(artboard.width, artboard.height, {
    isPrint: format.isPrint,
    forceShowGuides: artboard.showBleedGuides,
    dpi: format.dpi,
    bleedMm: 3,
  });

  const bodyParts: string[] = [
    `<rect x="0" y="0" width="${artboard.width}" height="${artboard.height}" fill="var(--bg)" />`,
  ];

  for (const el of artboard.elements) {
    const label = escapeXml(resolveElementText(el, isEnglish));
    const fontSize = el.fontSize ?? 24;
    if (el.role === "hero-image") {
      const geom = buildPhotoMaskSvgGeometry(frameId, el.x, el.y, el.width, el.height);
      bodyParts.push(
        `<path d="${geom.borderPathD}" fill="var(--surface)" stroke="var(--border)" stroke-width="2" />`,
        `<text x="${el.x + el.width / 2}" y="${el.y + el.height / 2}" dominant-baseline="central" text-anchor="middle" fill="var(--ink)" font-size="${fontSize}" font-family="${escapeXml(font.bodyFamily)}">${label}</text>`,
      );
    } else if (el.role === "cta" || el.role === "badge") {
      const fill = el.role === "cta" ? "var(--accent)" : "var(--surface)";
      const textFill = el.role === "cta" ? "var(--on-accent)" : "var(--accent)";
      const radius = el.borderRadius ?? 12;
      bodyParts.push(
        `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${radius}" fill="${fill}" stroke="var(--accent)" stroke-width="2" />`,
        `<text x="${el.x + el.width / 2}" y="${el.y + el.height / 2}" dominant-baseline="central" text-anchor="middle" fill="${textFill}" font-size="${fontSize}" font-weight="700" font-family="${escapeXml(font.headingFamily)}">${label}</text>`,
      );
    } else {
      const fill = el.role === "subcopy" ? "var(--muted)" : "var(--ink)";
      const family = el.role === "headline" ? font.headingFamily : font.bodyFamily;
      const weight = el.role === "headline" ? font.headingWeight : font.bodyWeight;
      bodyParts.push(
        `<text x="${el.x + el.width / 2}" y="${el.y + el.height / 2}" dominant-baseline="central" text-anchor="middle" fill="${fill}" font-size="${fontSize}" font-weight="${weight}" font-family="${escapeXml(family)}">${label}</text>`,
      );
    }
  }

  if (bleed.enabled) {
    bodyParts.push(
      `<rect x="${bleed.trimRect.x}" y="${bleed.trimRect.y}" width="${bleed.trimRect.width}" height="${bleed.trimRect.height}" fill="none" stroke="var(--accent)" stroke-dasharray="10 6" stroke-width="2" />`,
    );
  }

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${artboard.width} ${artboard.height}" width="${artboard.width}" height="${artboard.height}">`,
    `  <style>:root { --bg: ${palette.bg}; --surface: ${palette.surface}; --ink: ${palette.ink}; --muted: ${palette.muted}; --accent: ${palette.accent}; --accent-2: ${palette.accent2}; --border: ${palette.border}; --on-accent: ${palette.onAccent}; }</style>`,
    ...bodyParts.map((line) => `  ${line}`),
    `</svg>`,
  ].join("\n");
}

export function serializeArtboardToJson(payload: {
  readonly artboard: DesignArtboardDocument;
  readonly autoLayout: ComputedAutoLayoutNode;
  readonly instances: readonly ComponentInstance[];
}): string {
  return JSON.stringify(
    {
      schema: "toonstudio.design-editor-suite/v1",
      exportedAt: "local-deterministic",
      artboard: payload.artboard,
      autoLayout: payload.autoLayout,
      componentInstances: payload.instances,
    },
    null,
    2,
  );
}

export function triggerTextFileDownload(filename: string, content: string, mimeType: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const createUrl = window.URL?.createObjectURL;
  const revokeUrl = window.URL?.revokeObjectURL;
  if (typeof createUrl !== "function") return;
  const url = createUrl(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  if (typeof revokeUrl === "function") {
    revokeUrl(url);
  }
}
