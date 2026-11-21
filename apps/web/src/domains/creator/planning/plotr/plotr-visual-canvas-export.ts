/**
 * Plotr 비주얼 4컷 콘티 시트 클립보드 요약 & HTML5 Canvas 2D PNG 내보내기 엔진.
 *
 * - 브라우저 안전 가드(jsdom / 2D 컨텍스트 미지원 환경 무오류 폴백) 포함.
 * - OKLCH 컬러만 사용해 구도·조명 무드·캐릭터 3색 팔레트·말풍선을 4컷 PNG로 렌더링한다.
 */
import {
  PLOTR_EXPRESSION_LOCK_META,
  auditCharacterConsistencyAcrossCuts,
  type PlotrCharacterBibleProfile,
  type PlotrCharacterConsistencyAudit,
} from "./plotr-character-sheet-model";
import {
  PLOTR_EFFECT_LINE_LABELS,
  PLOTR_FORMAT_META,
  type PlotrDocumentState,
} from "./plotr-types";
import {
  PLOTR_CAMERA_FRAMING_PRESETS,
  PLOTR_LIGHTING_MOOD_PRESETS,
  inferCutCameraFraming,
  inferCutLightingMood,
} from "./plotr-visual-cut-renderer";

/**
 * 콘티 시트 & 캐릭터 일관성 바이블 클립보드 복사용 요약 텍스트 생성.
 */
export function buildVisualContiSummaryText(
  doc: PlotrDocumentState,
  auditInput?: PlotrCharacterConsistencyAudit,
): string {
  const audit =
    auditInput ??
    auditCharacterConsistencyAcrossCuts(doc.assets, doc.cuts, doc.codexEntries);
  const lines: string[] = [
    `[${doc.title}] 비주얼 콘티 & 캐릭터 일관성 시트`,
    `형식: ${PLOTR_FORMAT_META[doc.format].labelKo} · 그림체: ${doc.artStyle.labelKo} · 총 ${doc.cuts.length}컷 · 일관성 ${audit.consistencyScore}%`,
    "",
    "== 캐릭터 일관성 바이블 ==",
  ];

  if (audit.profiles.length === 0) {
    lines.push("- 등록된 인물 없음");
  } else {
    for (const profile of audit.profiles) {
      const expr = PLOTR_EXPRESSION_LOCK_META[profile.expressionLock].labelKo;
      const cutsLabel =
        profile.appearanceCutLabels.length > 0
          ? profile.appearanceCutLabels.join(", ")
          : "미배정";
      lines.push(
        `- ${profile.name} | 팔레트: ${profile.palette.presetLabelKo} | 표정 락: ${expr} | 소품: ${profile.signatureProp} | 실루엣: ${profile.silhouetteRule} | 등장: ${cutsLabel}`,
      );
    }
  }

  lines.push("", "== 컷별 비주얼 스토리보드 ==");
  for (const cut of doc.cuts) {
    const framing = PLOTR_CAMERA_FRAMING_PRESETS[inferCutCameraFraming(cut)].labelKo;
    const mood =
      PLOTR_LIGHTING_MOOD_PRESETS[
        inferCutLightingMood(cut, doc.helper.worldSettingNote, doc.helper.mood)
      ].labelKo;
    const sideKo =
      cut.cameraSide === "left"
        ? "좌측 시선축"
        : cut.cameraSide === "right"
          ? "우측 시선축"
          : "중앙 정면";
    lines.push(
      `[${cut.sceneTitle}] ${framing} (${cut.cameraShot}) · 조명: ${mood} · ${sideKo} · 텐션 ${cut.tensionScore}`,
    );
    lines.push(`  지문: ${cut.actionSummary}`);
    for (const dlg of cut.dialogues) {
      lines.push(
        dlg.kind === "narration"
          ? `  (나레이션) ${dlg.text}`
          : `  ${dlg.speaker || "화자"}: "${dlg.text}"`,
      );
    }
    if (cut.effectLine !== "none" || cut.sfxText) {
      lines.push(
        `  연출: ${PLOTR_EFFECT_LINE_LABELS[cut.effectLine]}${cut.sfxText ? ` · 효과음 ${cut.sfxText}` : ""}`,
      );
    }
  }

  return lines.join("\n").trim();
}

export interface PlotrCanvasExportResult {
  readonly ok: boolean;
  readonly renderedCutCount: number;
  readonly filename: string;
  readonly dataUrl: string | null;
  readonly messageKo: string;
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawSilhouetteOnCanvas(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  scale: number,
  profile: PlotrCharacterBibleProfile | null,
  fallbackOutfitOklch: string,
): void {
  const hair = profile?.palette.hairOklch ?? "oklch(0.32 0.04 255)";
  const eye = profile?.palette.eyeOklch ?? "oklch(0.65 0.16 240)";
  const outfit = profile?.palette.outfitOklch ?? fallbackOutfitOklch;
  const skin = "oklch(0.9 0.04 68)";

  ctx.fillStyle = outfit;
  ctx.beginPath();
  ctx.moveTo(cx - 42 * scale, baseY);
  ctx.quadraticCurveTo(cx - 34 * scale, baseY - 62 * scale, cx, baseY - 66 * scale);
  ctx.quadraticCurveTo(cx + 34 * scale, baseY - 62 * scale, cx + 42 * scale, baseY);
  ctx.closePath();
  ctx.fill();

  const headY = baseY - 88 * scale;
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.arc(cx, headY - 4 * scale, 26 * scale, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(cx, headY + 2 * scale, 20 * scale, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.arc(cx, headY - 4 * scale, 22 * scale, Math.PI, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = eye;
  ctx.beginPath();
  ctx.arc(cx - 7 * scale, headY + 2 * scale, 3 * scale, 0, Math.PI * 2);
  ctx.arc(cx + 7 * scale, headY + 2 * scale, 3 * scale, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * HTML5 Canvas 2D에 비주얼 4컷 콘티 시트를 직접 렌더링한다(브라우저 안전 가드 포함).
 */
export function renderVisualStoryboardToCanvas(
  canvas: HTMLCanvasElement,
  doc: PlotrDocumentState,
  auditInput?: PlotrCharacterConsistencyAudit,
): PlotrCanvasExportResult {
  const filename = `${(doc.title.trim() || "plotr-conti").replace(/[^가-힣A-Za-z0-9_-]+/gu, "-")}-4cut.png`;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext("2d");
  } catch {
    ctx = null;
  }
  if (!ctx) {
    return {
      ok: false,
      renderedCutCount: 0,
      filename,
      dataUrl: null,
      messageKo:
        "현재 환경에서는 Canvas 2D PNG 렌더링을 지원하지 않아 텍스트 시트 복사를 이용해 주세요.",
    };
  }

  const audit =
    auditInput ??
    auditCharacterConsistencyAcrossCuts(doc.assets, doc.cuts, doc.codexEntries);
  const profileById = new Map(audit.profiles.map((p) => [p.assetId, p]));
  const cutsToRender = doc.cuts.slice(0, 4);

  const width = 1280;
  const height = 960;
  canvas.width = width;
  canvas.height = height;

  ctx.fillStyle = "oklch(0.97 0.01 250)";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "oklch(0.22 0.03 258)";
  ctx.fillRect(0, 0, width, 74);
  ctx.fillStyle = "oklch(0.97 0.01 250)";
  ctx.font = "bold 24px sans-serif";
  ctx.fillText(`${doc.title} · 비주얼 4컷 콘티`, 32, 46);
  ctx.font = "600 15px sans-serif";
  ctx.fillStyle = "oklch(0.84 0.11 210)";
  ctx.fillText(
    `${doc.artStyle.labelKo} · 일관성 ${audit.consistencyScore}% · 총 ${doc.cuts.length}컷`,
    width - 360,
    46,
  );

  const gap = 24;
  const padX = 32;
  const startY = 98;
  const cellW = (width - padX * 2 - gap) / 2;
  const cellH = (height - startY - 32 - gap) / 2;

  cutsToRender.forEach((cut, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = padX + col * (cellW + gap);
    const y = startY + row * (cellH + gap);

    const framing = inferCutCameraFraming(cut);
    const moodId = inferCutLightingMood(
      cut,
      doc.helper.worldSettingNote,
      doc.helper.mood,
    );
    const mood = PLOTR_LIGHTING_MOOD_PRESETS[moodId];

    ctx.save();
    drawRoundedRectPath(ctx, x, y, cellW, cellH, 16);
    ctx.clip();

    const sky = ctx.createLinearGradient(x, y, x, y + cellH);
    sky.addColorStop(0, mood.skyTopOklch);
    sky.addColorStop(0.72, mood.skyBottomOklch);
    sky.addColorStop(1, mood.groundOklch);
    ctx.fillStyle = sky;
    ctx.fillRect(x, y, cellW, cellH);

    if (moodId === "rain") {
      ctx.strokeStyle = mood.rimLightOklch;
      ctx.lineWidth = 1.5;
      for (let r = 0; r < 18; r += 1) {
        const rx = x + 24 + ((r * 37) % (cellW - 40));
        const ry = y + 20 + ((r * 53) % (cellH - 120));
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 14, ry + 36);
        ctx.stroke();
      }
    } else if (moodId === "sunset") {
      ctx.fillStyle = mood.accentOklch;
      ctx.beginPath();
      ctx.arc(x + cellW * 0.78, y + cellH * 0.34, 44, 0, Math.PI * 2);
      ctx.fill();
    } else if (moodId === "neon-night") {
      ctx.strokeStyle = mood.rimLightOklch;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 28, y + 66, 92, 160);
      ctx.strokeStyle = mood.accentOklch;
      ctx.strokeRect(x + cellW - 130, y + 84, 96, 142);
    }

    const cutProfiles = cut.referencedAssetIds
      .map((id) => profileById.get(id))
      .filter((item): item is PlotrCharacterBibleProfile => Boolean(item));
    const scale =
      framing === "closeup"
        ? 1.55
        : framing === "full"
          ? 0.82
          : framing === "high-angle"
            ? 0.92
            : 1.15;
    const baseY = y + cellH - 22;

    if (cutProfiles.length >= 2) {
      drawSilhouetteOnCanvas(
        ctx,
        x + cellW * 0.34,
        baseY,
        scale * 0.9,
        cutProfiles[0]!,
        mood.accentOklch,
      );
      drawSilhouetteOnCanvas(
        ctx,
        x + cellW * 0.68,
        baseY,
        scale * 0.9,
        cutProfiles[1]!,
        mood.rimLightOklch,
      );
    } else {
      const anchorX =
        cut.cameraSide === "left"
          ? x + cellW * 0.36
          : cut.cameraSide === "right"
            ? x + cellW * 0.64
            : x + cellW * 0.5;
      drawSilhouetteOnCanvas(
        ctx,
        anchorX,
        baseY,
        scale,
        cutProfiles[0] ?? null,
        mood.accentOklch,
      );
    }

    ctx.fillStyle = "oklch(0.18 0.03 260 / 0.76)";
    drawRoundedRectPath(ctx, x + 14, y + 14, cellW - 28, 34, 10);
    ctx.fill();
    ctx.fillStyle = "oklch(0.97 0.01 250)";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(
      `${cut.sceneTitle} · ${PLOTR_CAMERA_FRAMING_PRESETS[framing].labelKo} · ${mood.labelKo}`,
      x + 26,
      y + 36,
    );

    const leadDialogue = cut.dialogues[0];
    if (leadDialogue) {
      const bubbleW = cellW - 44;
      const bubbleH = 62;
      const bx = x + 22;
      const by = y + cellH - bubbleH - 16;
      ctx.fillStyle = mood.bubbleFillOklch;
      drawRoundedRectPath(ctx, bx, by, bubbleW, bubbleH, 12);
      ctx.fill();
      ctx.strokeStyle = mood.bubbleInkOklch;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = mood.bubbleInkOklch;
      ctx.font = "bold 13px sans-serif";
      const prefix =
        leadDialogue.kind === "narration"
          ? "[나레이션] "
          : leadDialogue.speaker
            ? `${leadDialogue.speaker}: `
            : "";
      const clipped = `${prefix}${leadDialogue.text}`.slice(0, 44);
      ctx.fillText(clipped, bx + 14, by + 36);
    }

    ctx.restore();

    ctx.strokeStyle = "oklch(0.24 0.03 258)";
    ctx.lineWidth = cut.panelBorderEnabled ? Math.max(2, cut.panelBorderWidthPx) : 1;
    drawRoundedRectPath(ctx, x, y, cellW, cellH, 16);
    ctx.stroke();
  });

  let dataUrl: string | null = null;
  try {
    dataUrl = canvas.toDataURL("image/png");
  } catch {
    // 캔버스 직렬화가 막힌 환경에서는 dataUrl을 null로 유지한다.
  }

  return {
    ok: true,
    renderedCutCount: cutsToRender.length,
    filename,
    dataUrl,
    messageKo: `${cutsToRender.length}컷 비주얼 콘티 PNG(${filename})를 생성했어요.`,
  };
}

export function downloadVisualStoryboardPng(
  doc: PlotrDocumentState,
  auditInput?: PlotrCharacterConsistencyAudit,
): PlotrCanvasExportResult {
  if (typeof document === "undefined") {
    return {
      ok: false,
      renderedCutCount: 0,
      filename: "plotr-conti-4cut.png",
      dataUrl: null,
      messageKo: "브라우저 환경에서만 PNG 파일을 내려받을 수 있어요.",
    };
  }
  const canvas = document.createElement("canvas");
  const result = renderVisualStoryboardToCanvas(canvas, doc, auditInput);
  if (result.ok && result.dataUrl) {
    try {
      const link = document.createElement("a");
      link.href = result.dataUrl;
      link.download = result.filename;
      link.click();
    } catch {
      // 다운로드 트리거가 차단된 환경에서도 생성 결과는 그대로 반환한다.
    }
  }
  return result;
}
