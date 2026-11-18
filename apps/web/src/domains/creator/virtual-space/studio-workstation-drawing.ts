import type { PointerEvent } from "react";
import type { WorkstationStroke } from "./studio-workstation-notebook";

export function canvasPoint(e: PointerEvent<HTMLCanvasElement>): [number, number] {
  const canvas = e.currentTarget;
  const rect = canvas.getBoundingClientRect();
  return [Math.round(Math.max(0, Math.min(canvas.width, (e.clientX - rect.left) * canvas.width / rect.width))),
    Math.round(Math.max(0, Math.min(canvas.height, (e.clientY - rect.top) * canvas.height / rect.height)))];
}
export function drawWorkstationStroke(ctx: CanvasRenderingContext2D, stroke: WorkstationStroke) {
  const first = stroke.points[0];
  if (!first) return;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = 3.2;
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(...first);
  if (stroke.points.length === 1) ctx.lineTo(first[0] + 0.01, first[1]);
  for (const point of stroke.points.slice(1)) ctx.lineTo(...point);
  ctx.stroke();
}

export function drawWorkstationSheet(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, activeStamp: string | null, layers: Readonly<Record<"storyboard" | "line" | "color" | "sfx", boolean>>) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Dark studio canvas background
  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, "#0b1120");
  grad.addColorStop(1, "#1e1b4b");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 1. Storyboard perspective grid
  if (layers.storyboard) {
    ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(canvas.width / 2, canvas.height / 2);
      ctx.stroke();
    }
    ctx.strokeRect(18, 16, canvas.width - 36, canvas.height - 32);
  }

  // 2. Color & Lighting aura
  if (layers.color) {
    const radial = ctx.createRadialGradient(
      canvas.width * 0.52,
      canvas.height * 0.48,
      12,
      canvas.width * 0.52,
      canvas.height * 0.48,
      150,
    );
    radial.addColorStop(0, "rgba(168, 85, 247, 0.55)");
    radial.addColorStop(0.5, "rgba(56, 189, 248, 0.28)");
    radial.addColorStop(1, "rgba(15, 23, 42, 0)");
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // 3. Crisp Webtoon Panel Frame & Sword Slash Line Art
  if (layers.line) {
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(canvas.width * 0.5, canvas.height * 0.48, 54, 0, Math.PI * 2);
    ctx.stroke();

    // Dynamic diagonal slash arc
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(64, canvas.height - 38);
    ctx.quadraticCurveTo(canvas.width * 0.48, 24, canvas.width - 54, 42);
    ctx.stroke();
  }

  // 4. Webtoon Speech Bubble & Onomatopoeia SFX
  if (layers.sfx) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(32, 26, 186, 48, 16);
    ctx.fill();
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 12px Pretendard, sans-serif";
    ctx.fillText("“이번 마감은 절대 늦지 않는다!”", 44, 54);

    ctx.fillStyle = "#fbbf24";
    ctx.font = "italic 900 24px Pretendard, sans-serif";
    ctx.fillText("콰아앙—!! ⚡", canvas.width - 178, canvas.height - 28);
  }

  if (!activeStamp) return;
  const accent = activeStamp.startsWith("✅") ? "#34d399" : activeStamp.startsWith("🔧") ? "#fbbf24" : "#93c5fd";
  ctx.fillStyle = accent + "33";
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(canvas.width - 150, 22, 124, 32, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ecfdf5";
  ctx.font = "bold 12px Pretendard, sans-serif";
  ctx.fillText(activeStamp, canvas.width - 138, 42);
}
