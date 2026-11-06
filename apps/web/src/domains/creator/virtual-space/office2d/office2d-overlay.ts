/**
 * ToonOffice 2D 화면 좌표 오버레이: 이름표 · 말풍선 · 이모트 · 상호작용 키 힌트.
 *
 * 렌더러가 월드를 그리기 전에 planOffice2dOverlay로 이름표 자리를 정하고(겹침 정리, office2d-label-layout),
 * 그 결과로 벽 명판의 투명도를 정한 뒤, 월드를 다 그리고 drawOffice2dOverlay로 화면 위에 덧그린다.
 *
 * 표시 규칙(가까운 것만, 겹치지 않게)
 * - 나·팀원: 화면 안이면 항상.
 * - 대화형 NPC: 나와 420px 안이거나 강조(대화 가능) 중일 때.
 * - 상주 동료(앰비언트): 나와 200px 안일 때만. 사무실을 채우는 배경이라 멀리서는 이름표가 시야를 어지럽히지 않게 한다.
 */
import type { Office2dActor } from "./office2d-actors";
import { office2dActorOpacity } from "./office2d-actors";
import { office2dActorFoot, office2dActorHeadY } from "./office2d-actor-geometry";
import type { Office2dCamera } from "./office2d-camera";
import { layoutOffice2dLabels, type Office2dLabelBox, type Office2dLabelPlacement, type Office2dLabelRequest } from "./office2d-label-layout";
import { office2dRoundRect, type Office2dCanvas2D } from "./office2d-procedural-art";

export const OFFICE2D_OVERLAY_FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif";

const NPC_LABEL_RADIUS = 420;
const AMBIENT_LABEL_RADIUS = 200;
const PRIORITY: Readonly<Record<Office2dActor["kind"], number>> = Object.freeze({ self: 4, peer: 3, npc: 2, ambient: 1 });
const EMOTE_SECONDS = 2.6;

export interface Office2dOverlayActorPlan {
  readonly actor: Office2dActor;
  readonly opacity: number;
  readonly head: { readonly x: number; readonly y: number };
  readonly name: string;
  readonly status: string | null;
  readonly placement: Office2dLabelPlacement;
}

export interface Office2dOverlayPlan {
  readonly actors: readonly Office2dOverlayActorPlan[];
  /** 최종 이름표 상자(화면 px). 벽 명판 흐림 판정에 쓴다. */
  readonly boxes: readonly Office2dLabelBox[];
}

export interface Office2dOverlayFrame {
  readonly camera: Office2dCamera;
  readonly actors: readonly Office2dActor[];
  readonly selfId: string;
  readonly now: number;
  readonly time: number;
  readonly reducedMotion: boolean;
}

function truncate(text: string, max: number): string {
  const glyphs = [...text];
  return glyphs.length > max ? `${glyphs.slice(0, max - 1).join("")}…` : text;
}

function plateSize(ctx: Office2dCanvas2D, name: string, status: string | null): { readonly width: number; readonly height: number } {
  ctx.font = `700 12px ${OFFICE2D_OVERLAY_FONT}`;
  let width = Math.ceil(ctx.measureText(name).width) + 26;
  if (status) {
    ctx.font = `600 10px ${OFFICE2D_OVERLAY_FONT}`;
    width = Math.max(width, Math.ceil(ctx.measureText(status).width) + 18);
  }
  return { width, height: 20 + (status ? 14 : 0) };
}

/** 어떤 이름표를 어디에 그릴지 정한다(측정만 하고 그리지 않는다). */
export function planOffice2dOverlay(ctx: Office2dCanvas2D, frame: Office2dOverlayFrame): Office2dOverlayPlan {
  const { camera } = frame;
  const viewport = camera.getViewport();
  const self = frame.actors.find((actor) => actor.id === frame.selfId) ?? null;
  const requests: Office2dLabelRequest[] = [];
  const candidates = new Map<string, Omit<Office2dOverlayActorPlan, "placement">>();
  for (const actor of frame.actors) {
    const opacity = office2dActorOpacity(actor, frame.now);
    if (opacity < 0.05) continue;
    const foot = office2dActorFoot(actor);
    const distance = self ? Math.hypot(foot.x - self.x, foot.y - self.y) : 0;
    if (actor.kind === "npc" && !actor.highlighted && distance > NPC_LABEL_RADIUS) continue;
    if (actor.kind === "ambient" && distance > AMBIENT_LABEL_RADIUS) continue;
    const head = camera.worldToScreen({ x: foot.x, y: office2dActorHeadY(actor) });
    if (head.x < -80 || head.x > viewport.width + 80 || head.y < -60 || head.y > viewport.height + 120) continue;
    const name = truncate(actor.name, 18);
    const status = actor.status ? truncate(actor.status, 24) : null;
    const size = plateSize(ctx, name, status);
    requests.push({ id: actor.id, anchorX: head.x, bottom: head.y - 4, width: size.width, height: size.height, priority: PRIORITY[actor.kind], distance });
    candidates.set(actor.id, { actor, opacity, head, name, status });
  }
  const layout = layoutOffice2dLabels(requests);
  const actors: Office2dOverlayActorPlan[] = [];
  const boxes: Office2dLabelBox[] = [];
  for (const [id, candidate] of candidates) {
    const placement = layout.get(id);
    if (!placement) continue;
    actors.push({ ...candidate, placement });
    if (placement.alpha >= 1) boxes.push(placement.box);
  }
  return { actors, boxes };
}

export function office2dStatusDotColor(status: string | null | undefined): string | null {
  if (!status) return null;
  if (status.startsWith("🟢")) return "#22c55e";
  if (status.startsWith("🔴")) return "#ef4444";
  if (status.startsWith("🎤")) return "#a855f7";
  if (status.startsWith("🎯")) return "#3b82f6";
  if (status.startsWith("🟡")) return "#eab308";
  if (status.startsWith("☕")) return "#f97316";
  return null;
}

export function drawOffice2dKeycap(ctx: Office2dCanvas2D, x: number, y: number, key: string): void {
  office2dRoundRect(ctx, x - 13, y - 26, 26, 24, 6);
  ctx.fillStyle = "rgba(255, 248, 232, 0.96)";
  ctx.fill();
  ctx.strokeStyle = "#7a5a3c";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#4a3426";
  ctx.font = `800 13px ${OFFICE2D_OVERLAY_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(key, x, y - 13.5);
}

/** 정한 자리(placement)에 이름표·말풍선·이모트를 그린다. 화면 px 변환(pixelRatio)은 호출자가 걸어 둔다. */
export function drawOffice2dOverlay(ctx: Office2dCanvas2D, plan: Office2dOverlayPlan, frame: Office2dOverlayFrame): void {
  for (const entry of plan.actors) {
    const { actor, placement } = entry;
    const self = actor.id === frame.selfId;
    ctx.globalAlpha = entry.opacity * placement.alpha;
    if (placement.lift > 0) {
      // 위로 옮긴 이름표는 머리까지 가는 짧은 지시선으로 누구 것인지 잇는다.
      ctx.strokeStyle = "rgba(31, 26, 23, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(entry.head.x, entry.head.y - 2);
      ctx.lineTo(entry.head.x, placement.box.y + placement.box.height);
      ctx.stroke();
    }
    drawNamePlate(ctx, placement.box, entry.name, entry.status, actor, self);
    let top = placement.box.y;
    if (actor.bubble || actor.typing) top = drawBubble(ctx, entry.head.x, top - 6, actor.bubble ?? "", !actor.bubble && actor.typing, frame.time);
    if (actor.emote && actor.emote.until > frame.now) {
      const remaining = Math.max(0, Math.min(1, (actor.emote.until - frame.now) / (EMOTE_SECONDS * 1000)));
      const progress = 1 - remaining;
      const pop = frame.reducedMotion ? 1 : Math.min(1.08, progress * 7) * (1 + Math.sin(frame.time * 9) * 0.05);
      const rise = frame.reducedMotion ? 0 : progress * 14;
      const fadeOut = remaining < 0.25 ? remaining / 0.25 : 1;
      const emoteY = top - 16 - rise;
      ctx.globalAlpha = entry.opacity * placement.alpha * fadeOut;
      ctx.fillStyle = "rgba(38, 30, 24, 0.82)";
      ctx.beginPath();
      ctx.arc(entry.head.x, emoteY, 16 * pop, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = actor.accent;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.font = `${Math.round(22 * pop)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", ${OFFICE2D_OVERLAY_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(actor.emote.glyph, entry.head.x, emoteY + 1);
    }
    ctx.globalAlpha = 1;
  }
}

function drawNamePlate(ctx: Office2dCanvas2D, box: Office2dLabelBox, name: string, status: string | null, actor: Office2dActor, self: boolean): void {
  const npcLike = actor.kind === "npc" || actor.kind === "ambient";
  office2dRoundRect(ctx, box.x, box.y, box.width, box.height, 10);
  ctx.fillStyle = npcLike ? "rgba(52, 40, 78, 0.86)" : self ? "rgba(40, 30, 24, 0.92)" : "rgba(31, 26, 23, 0.84)";
  ctx.fill();
  if (self) {
    ctx.strokeStyle = actor.accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.fillStyle = office2dStatusDotColor(status ?? actor.status) ?? (npcLike ? "#c4b5fd" : actor.accent);
  ctx.beginPath();
  ctx.arc(box.x + 10, box.y + 10, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `700 12px ${OFFICE2D_OVERLAY_FONT}`;
  ctx.fillStyle = "#fffaf0";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(name, box.x + 18, box.y + 10.5);
  if (status) {
    ctx.font = `600 10px ${OFFICE2D_OVERLAY_FONT}`;
    ctx.fillStyle = "rgba(255, 238, 210, 0.85)";
    ctx.textAlign = "center";
    ctx.fillText(status, box.x + box.width / 2, box.y + 26);
  }
}

function wrapText(ctx: Office2dCanvas2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const char of [...text]) {
    const candidate = line + char;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = char.trimStart();
      if (lines.length === maxLines) break;
    } else {
      line = candidate;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && [...lines.join("")].length < [...text].length) {
    const last = lines[maxLines - 1] ?? "";
    lines[maxLines - 1] = `${last.slice(0, Math.max(0, last.length - 1))}…`;
  }
  return lines;
}

/** 말풍선을 그리고 윗변 y를 돌려준다. */
function drawBubble(ctx: Office2dCanvas2D, x: number, bottom: number, text: string, typing: boolean, time: number): number {
  ctx.font = `600 12px ${OFFICE2D_OVERLAY_FONT}`;
  const lines = typing ? ["   "] : wrapText(ctx, text, 168, 3);
  const width = Math.max(44, Math.min(184, Math.max(...lines.map((line) => ctx.measureText(line).width)) + 20));
  const height = lines.length * 16 + 12;
  const top = bottom - height - 6;
  office2dRoundRect(ctx, x - width / 2, top, width, height, 10);
  ctx.fillStyle = "rgba(255, 253, 248, 0.97)";
  ctx.fill();
  ctx.strokeStyle = "rgba(90, 66, 48, 0.55)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 6, top + height - 0.5);
  ctx.lineTo(x, top + height + 6);
  ctx.lineTo(x + 6, top + height - 0.5);
  ctx.closePath();
  ctx.fillStyle = "rgba(255, 253, 248, 0.97)";
  ctx.fill();
  ctx.fillStyle = "#3d2e24";
  if (typing) {
    for (let index = 0; index < 3; index += 1) {
      ctx.globalAlpha = 0.35 + 0.65 * Math.max(0, Math.sin(time * 6 - index * 0.8));
      ctx.beginPath();
      ctx.arc(x - 9 + index * 9, top + height / 2, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return top;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((line, index) => ctx.fillText(line, x, top + 14 + index * 16));
  return top;
}
