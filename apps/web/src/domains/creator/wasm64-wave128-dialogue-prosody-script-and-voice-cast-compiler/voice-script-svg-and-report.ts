/**
 * Wave 128 — 인쇄 안전 순수 OKLCH 멀티트랙 성우 타임라인 SVG 렌더러 및 한국어 녹음 감독 브리프.
 *
 * - 원시 색상 표현 없이 순수 `oklch(...)` 팔레트만 사용한다.
 * - 모든 텍스트 노드의 XML 특수문자(`<`, `>`, `&`, `"`, `'`)를 이스케이프하고
 *   유한 수치 보정(`NaN`/`Infinity` 0건)을 강제한다.
 */

import {
  ACOUSTIC_REVERB_LABELS_KO,
  DELIVERY_STYLE_LABELS_KO,
  VOICE_ACTOR_TIER_LABELS_KO,
  type AcousticReverbTag,
  type CompiledDialogueLine,
  type CompiledVoiceProsodyScript,
  type VoiceCastAndBoothSchedule,
  type VoiceCastTimelineSvgOptions,
  type VoiceDeliveryStyle,
} from "./voice-script-types";

const OKLCH_PALETTE = {
  paperBg: "oklch(0.985 0.006 90)",
  surfaceBg: "oklch(0.996 0.003 90)",
  headerBg: "oklch(0.955 0.012 155)",
  laneAltBg: "oklch(0.972 0.006 92)",
  sceneBandBg: "oklch(0.946 0.014 155)",
  borderStrong: "oklch(0.28 0.044 160)",
  borderSoft: "oklch(0.84 0.014 90)",
  gridLine: "oklch(0.89 0.01 90)",
  textPrimary: "oklch(0.21 0.028 160)",
  textMuted: "oklch(0.44 0.024 160)",
  textInverse: "oklch(0.985 0.004 90)",
  statusGoodBg: "oklch(0.32 0.068 158)",
  statusWarnBg: "oklch(0.5 0.175 30)",
  hydrationBg: "oklch(0.93 0.055 215)",
  hydrationStroke: "oklch(0.45 0.13 220)",
  interruptStroke: "oklch(0.48 0.18 32)",
  reverbBadgeBg: "oklch(0.95 0.022 260)",
  reverbBadgeText: "oklch(0.34 0.07 260)",
  unassignedLaneBg: "oklch(0.95 0.036 28)",
} as const;

const DELIVERY_FILL_OKLCH: Readonly<Record<VoiceDeliveryStyle, string>> = {
  shout: "oklch(0.9 0.085 26)",
  "urgent-dialogue": "oklch(0.93 0.062 68)",
  "calm-dialogue": "oklch(0.94 0.036 155)",
  narration: "oklch(0.93 0.034 225)",
  "inner-monologue": "oklch(0.93 0.044 290)",
  whisper: "oklch(0.94 0.022 200)",
};

const DELIVERY_STROKE_OKLCH: Readonly<Record<VoiceDeliveryStyle, string>> = {
  shout: "oklch(0.48 0.2 26)",
  "urgent-dialogue": "oklch(0.52 0.15 65)",
  "calm-dialogue": "oklch(0.42 0.11 155)",
  narration: "oklch(0.44 0.11 225)",
  "inner-monologue": "oklch(0.45 0.12 290)",
  whisper: "oklch(0.48 0.06 200)",
};

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/** XML 특수문자 5종(`<`, `>`, `&`, `"`, `'`)을 안전하게 이스케이프한다. */
export function escapeVoiceXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncateLabel(raw: string, maxChars: number): string {
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, Math.max(1, maxChars - 1))}…`;
}

function formatDurationSec(ms: number): string {
  const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
  return `${(safeMs / 1000).toFixed(1)}초`;
}

function formatKrw(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `${safe.toLocaleString("en-US")}원`;
}

function reverbShortTagKo(tag: AcousticReverbTag): string {
  if (tag === "inner-monologue-hall") return "내면홀";
  if (tag === "phone-bandpass") return "무전필터";
  if (tag === "studio-narrator") return "내레이터";
  return "드라이";
}

interface TimelineTrackRow {
  readonly trackKey: string;
  readonly labelKo: string;
  readonly subLabelKo: string;
  readonly isUnassigned: boolean;
  readonly lines: readonly CompiledDialogueLine[];
}

function buildTrackRows(
  script: CompiledVoiceProsodyScript,
  castPlan: VoiceCastAndBoothSchedule,
): readonly TimelineTrackRow[] {
  const linesByActor = new Map<string, CompiledDialogueLine[]>();
  const unassignedLines: CompiledDialogueLine[] = [];

  for (let i = 0; i < script.lines.length; i += 1) {
    const line = script.lines[i];
    if (!line) continue;
    const actorId = castPlan.characterToActorId[line.characterId] ?? null;
    if (!actorId) {
      unassignedLines.push(line);
      continue;
    }
    let list = linesByActor.get(actorId);
    if (!list) {
      list = [];
      linesByActor.set(actorId, list);
    }
    list.push(line);
  }

  const rows: TimelineTrackRow[] = [];
  for (let i = 0; i < castPlan.actorSessions.length; i += 1) {
    const session = castPlan.actorSessions[i];
    if (!session) continue;
    rows.push({
      trackKey: session.actorId,
      labelKo: session.actorNameKo,
      subLabelKo: `${VOICE_ACTOR_TIER_LABELS_KO[session.vocalTier]} · ${session.assignedCharacterIds.join(", ")}`,
      isUnassigned: false,
      lines: linesByActor.get(session.actorId) ?? [],
    });
  }

  if (unassignedLines.length > 0) {
    rows.push({
      trackKey: "__unassigned__",
      labelKo: "미배정(성우 부족)",
      subLabelKo: `추가 필요 ${castPlan.shortageActorCount}명`,
      isUnassigned: true,
      lines: unassignedLines,
    });
  }

  if (rows.length === 0) {
    rows.push({
      trackKey: "__empty__",
      labelKo: "배정 트랙 없음",
      subLabelKo: "대사 큐 0줄",
      isUnassigned: false,
      lines: [],
    });
  }

  return rows;
}

/**
 * 씬별 멀티트랙 성우 타임라인, 연기 톤·리버브 배지, 성대 수분 휴식 마커, 캐스팅 무충돌 요약을
 * 인쇄 안전 순수 `oklch(...)` SVG 문자열로 렌더링한다.
 */
export function renderVoiceCastTimelineSvg(
  script: CompiledVoiceProsodyScript,
  castPlan: VoiceCastAndBoothSchedule,
  options?: VoiceCastTimelineSvgOptions,
): string {
  const widthPx = Math.max(
    720,
    Math.min(2400, Math.round(Number.isFinite(options?.widthPx) ? (options?.widthPx ?? 1160) : 1160)),
  );
  const titleKo = (options?.titleKo ?? "웹툰 대사 운율·성우 멀티트랙 녹음 타임라인").trim();
  const showSummary = options?.showInterferenceSummary !== false;

  const padX = 24;
  const headerH = 82;
  const sceneBandH = 38;
  const labelColW = 196;
  const trackRowH = 66;
  const summaryH = showSummary ? 88 : 20;

  const tracks = buildTrackRows(script, castPlan);
  const timelineX = padX + labelColW;
  const timelineW = Math.max(320, widthPx - timelineX - padX);
  const totalMs = Math.max(1000, script.totalDurationMs);

  const trackAreaY = headerH + sceneBandH + 14;
  const trackAreaH = tracks.length * trackRowH;
  const totalHeight = trackAreaY + trackAreaH + summaryH + 24;

  const mapTimeX = (ms: number): number => {
    const safeMs = Number.isFinite(ms) ? Math.max(0, Math.min(totalMs, ms)) : 0;
    return timelineX + (safeMs / totalMs) * timelineW;
  };

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(widthPx)}" height="${fmt(totalHeight)}" viewBox="0 0 ${fmt(widthPx)} ${fmt(totalHeight)}" role="img" aria-label="${escapeVoiceXml(titleKo)}">`,
  );
  parts.push(
    `<rect x="0" y="0" width="${fmt(widthPx)}" height="${fmt(totalHeight)}" fill="${OKLCH_PALETTE.paperBg}" />`,
  );

  // 상단 헤더 바
  parts.push(
    `<rect x="${fmt(padX)}" y="14" width="${fmt(widthPx - padX * 2)}" height="${fmt(headerH - 16)}" rx="10" fill="${OKLCH_PALETTE.headerBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
  );
  parts.push(
    `<text x="${fmt(padX + 16)}" y="40" font-family="sans-serif" font-size="16" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">${escapeVoiceXml(truncateLabel(titleKo, 46))}</text>`,
  );
  parts.push(
    `<text x="${fmt(padX + 16)}" y="62" font-family="sans-serif" font-size="11.5" fill="${OKLCH_PALETTE.textMuted}">대사 ${script.lines.length}줄 · 씬 ${script.scenes.length}개 · 러닝타임 ${formatDurationSec(script.totalDurationMs)} · 비의도적 겹침 ${script.unintendedOverlapCount}건 · 끼어들기 ${script.intentionalInterruptCount}건</text>`,
  );

  // 캐스팅 상태 배지
  const badgeW = 248;
  const badgeX = widthPx - padX - badgeW - 14;
  const badgeBg = castPlan.castFeasible ? OKLCH_PALETTE.statusGoodBg : OKLCH_PALETTE.statusWarnBg;
  const badgeText = castPlan.castFeasible
    ? `캐스팅 무충돌 (충돌 ${castPlan.sameSceneDoubleCastCollisionCount}건 · 성우 ${castPlan.availableActorCount}명)`
    : castPlan.fixedLeadConflictIssues.length > 0
      ? `고정 배역 충돌 (${castPlan.fixedLeadConflictIssues.length}건 차단)`
      : `성우 부족 (${castPlan.shortageActorCount}명 추가 필요)`;

  parts.push(
    `<rect x="${fmt(badgeX)}" y="27" width="${fmt(badgeW)}" height="32" rx="8" fill="${badgeBg}" />`,
  );
  parts.push(
    `<text x="${fmt(badgeX + badgeW / 2)}" y="47" text-anchor="middle" font-family="sans-serif" font-size="11.5" font-weight="700" fill="${OKLCH_PALETTE.textInverse}">${escapeVoiceXml(badgeText)}</text>`,
  );

  // 씬 구간 헤더 스트립
  const sceneBandY = headerH + 6;
  parts.push(
    `<rect x="${fmt(padX)}" y="${fmt(sceneBandY)}" width="${fmt(labelColW - 8)}" height="${fmt(sceneBandH)}" rx="6" fill="${OKLCH_PALETTE.surfaceBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
  );
  parts.push(
    `<text x="${fmt(padX + 12)}" y="${fmt(sceneBandY + 23)}" font-family="sans-serif" font-size="11.5" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">성우 트랙 / 씬 구간</text>`,
  );
  parts.push(
    `<rect x="${fmt(timelineX)}" y="${fmt(sceneBandY)}" width="${fmt(timelineW)}" height="${fmt(sceneBandH)}" rx="6" fill="${OKLCH_PALETTE.surfaceBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
  );

  for (let s = 0; s < script.scenes.length; s += 1) {
    const scene = script.scenes[s];
    if (!scene) continue;
    const sx = mapTimeX(scene.startMs);
    const ex = mapTimeX(scene.endMs);
    const sw = Math.max(36, ex - sx);
    const clampedW = Math.min(sw, timelineX + timelineW - sx);
    parts.push(
      `<rect x="${fmt(sx)}" y="${fmt(sceneBandY + 4)}" width="${fmt(Math.max(12, clampedW))}" height="${fmt(sceneBandH - 8)}" rx="5" fill="${OKLCH_PALETTE.sceneBandBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
    );
    parts.push(
      `<text x="${fmt(sx + 8)}" y="${fmt(sceneBandY + 23)}" font-family="sans-serif" font-size="10.5" font-weight="600" fill="${OKLCH_PALETTE.textPrimary}">${escapeVoiceXml(truncateLabel(`${scene.sceneId} (${scene.characterIds.length}명)`, Math.max(8, Math.floor(clampedW / 8))))}</text>`,
    );
    parts.push(
      `<line x1="${fmt(sx)}" y1="${fmt(trackAreaY)}" x2="${fmt(sx)}" y2="${fmt(trackAreaY + trackAreaH)}" stroke="${OKLCH_PALETTE.gridLine}" stroke-width="1" stroke-dasharray="3 3" />`,
    );
  }

  // 성우별 멀티트랙 레인 & 대사 블록
  for (let r = 0; r < tracks.length; r += 1) {
    const row = tracks[r];
    if (!row) continue;
    const ry = trackAreaY + r * trackRowH;
    const laneBg = row.isUnassigned
      ? OKLCH_PALETTE.unassignedLaneBg
      : r % 2 === 0
        ? OKLCH_PALETTE.surfaceBg
        : OKLCH_PALETTE.laneAltBg;

    parts.push(
      `<rect x="${fmt(padX)}" y="${fmt(ry)}" width="${fmt(labelColW - 8)}" height="${fmt(trackRowH - 6)}" rx="6" fill="${laneBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
    );
    parts.push(
      `<text x="${fmt(padX + 12)}" y="${fmt(ry + 24)}" font-family="sans-serif" font-size="12" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">${escapeVoiceXml(truncateLabel(row.labelKo, 16))}</text>`,
    );
    parts.push(
      `<text x="${fmt(padX + 12)}" y="${fmt(ry + 43)}" font-family="sans-serif" font-size="10" fill="${OKLCH_PALETTE.textMuted}">${escapeVoiceXml(truncateLabel(row.subLabelKo, 22))}</text>`,
    );
    parts.push(
      `<rect x="${fmt(timelineX)}" y="${fmt(ry)}" width="${fmt(timelineW)}" height="${fmt(trackRowH - 6)}" rx="6" fill="${laneBg}" stroke="${OKLCH_PALETTE.borderSoft}" stroke-width="1" />`,
    );

    for (let j = 0; j < row.lines.length; j += 1) {
      const line = row.lines[j];
      if (!line) continue;
      const lx = mapTimeX(line.startMs);
      const rx = mapTimeX(line.endMs);
      const barW = Math.max(24, rx - lx);
      const clampedW = Math.min(barW, timelineX + timelineW - lx);
      const fill = DELIVERY_FILL_OKLCH[line.deliveryStyle];
      const stroke = line.overlapInterrupt
        ? OKLCH_PALETTE.interruptStroke
        : DELIVERY_STROKE_OKLCH[line.deliveryStyle];
      const dashAttr = line.overlapInterrupt ? ` stroke-dasharray="4 2"` : "";

      parts.push(
        `<rect x="${fmt(lx)}" y="${fmt(ry + 8)}" width="${fmt(Math.max(14, clampedW))}" height="${fmt(trackRowH - 22)}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1.4"${dashAttr} />`,
      );

      const headerTag = `${DELIVERY_STYLE_LABELS_KO[line.deliveryStyle]}·${reverbShortTagKo(line.acousticReverbTag)}`;
      const maxHeaderChars = Math.max(4, Math.floor((clampedW - 8) / 7));
      parts.push(
        `<text x="${fmt(lx + 6)}" y="${fmt(ry + 24)}" font-family="sans-serif" font-size="9.5" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">${escapeVoiceXml(truncateLabel(`${line.characterNameKo} [${headerTag}]`, maxHeaderChars))}</text>`,
      );

      if (clampedW >= 48) {
        const preview = line.isEmptyCue ? "(무음 큐)" : line.normalizedTextKo;
        const maxPreviewChars = Math.max(4, Math.floor((clampedW - 10) / 7.5));
        parts.push(
          `<text x="${fmt(lx + 6)}" y="${fmt(ry + 41)}" font-family="sans-serif" font-size="9.5" fill="${OKLCH_PALETTE.textMuted}">${escapeVoiceXml(truncateLabel(preview, maxPreviewChars))}</text>`,
        );
      }
    }

    // 해당 성우의 성대 보호 수분 휴식 마커
    for (let b = 0; b < castPlan.hydrationBreakEvents.length; b += 1) {
      const brk = castPlan.hydrationBreakEvents[b];
      if (!brk || brk.actorId !== row.trackKey) continue;
      const bx = mapTimeX(brk.breakStartMs);
      parts.push(
        `<line x1="${fmt(bx)}" y1="${fmt(ry + 3)}" x2="${fmt(bx)}" y2="${fmt(ry + trackRowH - 9)}" stroke="${OKLCH_PALETTE.hydrationStroke}" stroke-width="2" />`,
      );
      const pillX = Math.max(timelineX + 2, Math.min(timelineX + timelineW - 68, bx - 32));
      parts.push(
        `<rect x="${fmt(pillX)}" y="${fmt(ry + 2)}" width="64" height="16" rx="4" fill="${OKLCH_PALETTE.hydrationBg}" stroke="${OKLCH_PALETTE.hydrationStroke}" stroke-width="1" />`,
      );
      parts.push(
        `<text x="${fmt(pillX + 32)}" y="${fmt(ry + 13)}" text-anchor="middle" font-family="sans-serif" font-size="8.5" font-weight="700" fill="${OKLCH_PALETTE.hydrationStroke}">수분 휴식</text>`,
      );
    }
  }

  // 하단 씬 공존 간섭·부스 요약 패널
  if (showSummary) {
    const sy = trackAreaY + trackAreaH + 12;
    parts.push(
      `<rect x="${fmt(padX)}" y="${fmt(sy)}" width="${fmt(widthPx - padX * 2)}" height="${fmt(summaryH)}" rx="10" fill="${OKLCH_PALETTE.surfaceBg}" stroke="${OKLCH_PALETTE.borderStrong}" stroke-width="1" />`,
    );
    parts.push(
      `<text x="${fmt(padX + 16)}" y="${fmt(sy + 24)}" font-family="sans-serif" font-size="12" font-weight="700" fill="${OKLCH_PALETTE.textPrimary}">씬 공존 캐스팅 간섭·부스 요약 (비용은 추정치)</text>`,
    );
    const summaryLine1 = `씬 최대 동시 화자 ${castPlan.maxSceneCliqueSize}명 · 간섭 간선 ${castPlan.interferenceEdges.length}건 · 동일 씬 중복 충돌 ${castPlan.sameSceneDoubleCastCollisionCount}건 · 수분 휴식 ${castPlan.hydrationBreakEvents.length}회`;
    const summaryLine2 = `부스 총 예상 ${castPlan.totalBoothDurationMinutes}분 · 예상 비용(추정치) ${formatKrw(castPlan.estimatedTotalStudioCostKrw)} · SHA-256 ${castPlan.scriptManifestSha256Hex.slice(0, 16)}`;
    parts.push(
      `<text x="${fmt(padX + 16)}" y="${fmt(sy + 48)}" font-family="sans-serif" font-size="11" fill="${OKLCH_PALETTE.textPrimary}">${escapeVoiceXml(summaryLine1)}</text>`,
    );
    parts.push(
      `<text x="${fmt(padX + 16)}" y="${fmt(sy + 70)}" font-family="sans-serif" font-size="10.5" fill="${OKLCH_PALETTE.textMuted}">${escapeVoiceXml(summaryLine2)}</text>`,
    );
  }

  parts.push("</svg>");
  return parts.join("\n");
}

/**
 * 번역투 없는 자연스러운 한국어 더빙·오디오웹툰 녹음 감독 QA 브리프를 생성한다.
 */
export function summarizeVoiceCastScriptKo(
  script: CompiledVoiceProsodyScript,
  castPlan: VoiceCastAndBoothSchedule,
): string {
  const lines: string[] = [];
  lines.push("[녹음 감독 브리프] 웹툰 대사 운율·성우 캐스팅 검수 요약");
  lines.push("");

  lines.push("1. 대사 운율·타임라인 검수");
  lines.push(
    `- 전체 대사 ${script.lines.length}줄(씬 ${script.scenes.length}개, 총 ${script.totalSyllables}음절), 예상 러닝타임 ${formatDurationSec(script.totalDurationMs)}`,
  );
  lines.push(
    `- 비의도적 대사 겹침 ${script.unintendedOverlapCount}건, 의도적 끼어들기 ${script.intentionalInterruptCount}건`,
  );

  const deliveryParts: string[] = [];
  const deliveryKeys: readonly VoiceDeliveryStyle[] = [
    "shout",
    "urgent-dialogue",
    "calm-dialogue",
    "whisper",
    "inner-monologue",
    "narration",
  ];
  for (let i = 0; i < deliveryKeys.length; i += 1) {
    const key = deliveryKeys[i];
    if (!key) continue;
    const count = script.deliveryBreakdown[key];
    if (count > 0) {
      deliveryParts.push(`${DELIVERY_STYLE_LABELS_KO[key]} ${count}줄`);
    }
  }
  lines.push(`- 연기 톤 분포: ${deliveryParts.length > 0 ? deliveryParts.join(", ") : "없음"}`);

  const reverbParts: string[] = [];
  const reverbKeys: readonly AcousticReverbTag[] = [
    "dry-close",
    "inner-monologue-hall",
    "phone-bandpass",
    "studio-narrator",
  ];
  for (let i = 0; i < reverbKeys.length; i += 1) {
    const key = reverbKeys[i];
    if (!key) continue;
    const count = script.reverbBreakdown[key];
    if (count > 0) {
      reverbParts.push(`${ACOUSTIC_REVERB_LABELS_KO[key]} ${count}줄`);
    }
  }
  lines.push(`- 음향 공간 배정: ${reverbParts.length > 0 ? reverbParts.join(", ") : "없음"}`);
  if (script.emptyLineIds.length > 0) {
    lines.push(`- 무음·공백 큐 ${script.emptyLineIds.length}건(${script.emptyLineIds.join(", ")})은 호흡 여백으로 처리`);
  }

  lines.push("");
  lines.push("2. 멀티스피커 성우 캐스팅·동일 씬 충돌 점검");
  lines.push(
    `- 판정: ${castPlan.castFeasible ? "녹음 가능(무충돌)" : "보완 필요(배정 차단)"} — ${castPlan.feasibilityReasonKo}`,
  );
  lines.push(
    `- 씬 최대 동시 화자 ${castPlan.maxSceneCliqueSize}명, 간섭 간선 ${castPlan.interferenceEdges.length}건, 동일 씬 1인 2역 충돌 ${castPlan.sameSceneDoubleCastCollisionCount}건`,
  );
  if (castPlan.shortageActorCount > 0) {
    lines.push(`- 부족 성우 수: 최소 ${castPlan.shortageActorCount}명 추가 투입 필요`);
  }
  for (let i = 0; i < castPlan.fixedLeadConflictIssues.length; i += 1) {
    const issue = castPlan.fixedLeadConflictIssues[i];
    if (issue) lines.push(`- 고정 배역 경고: ${issue}`);
  }

  lines.push("");
  lines.push("3. 성대 피로 보호·부스 스케줄");
  if (castPlan.hydrationBreakEvents.length === 0) {
    lines.push("- 연속 외침 상한 초과 구간 없음(추가 수분 휴식 불필요)");
  } else {
    lines.push(
      `- 성대 보호 수분 휴식 ${castPlan.hydrationBreakEvents.length}회 자동 삽입(총 ${castPlan.totalHydrationBreakMinutes}분)`,
    );
    for (let i = 0; i < castPlan.hydrationBreakEvents.length; i += 1) {
      const brk = castPlan.hydrationBreakEvents[i];
      if (!brk) continue;
      lines.push(
        `  · [${brk.sceneId}] ${brk.reasonKo} (${brk.afterLineId} 직후, ${formatDurationSec(brk.breakDurationMs)})`,
      );
    }
  }

  for (let i = 0; i < castPlan.actorSessions.length; i += 1) {
    const session = castPlan.actorSessions[i];
    if (!session) continue;
    lines.push(
      `- ${session.actorNameKo}(${VOICE_ACTOR_TIER_LABELS_KO[session.vocalTier]}): 배역 [${session.assignedCharacterIds.join(", ")}], 대사 ${session.lineCount}줄(외침 ${session.shoutLineCount}줄), 예상 부스 ${session.estimatedBoothMinutes}분, 예상 비용(추정치) ${formatKrw(session.estimatedCostKrw)}`,
    );
  }
  lines.push(
    `- 전체 부스 예상 ${castPlan.totalBoothDurationMinutes}분 / 스튜디오 예상 비용(추정치) ${formatKrw(castPlan.estimatedTotalStudioCostKrw)}`,
  );

  lines.push("");
  lines.push("4. 무결성 지문 및 비용 기준 안내");
  lines.push(`- 매니페스트 SHA-256: ${castPlan.scriptManifestSha256Hex}`);
  lines.push(`- 비용 안내: ${castPlan.costEstimateDisclaimerKo}`);

  return lines.join("\n");
}
