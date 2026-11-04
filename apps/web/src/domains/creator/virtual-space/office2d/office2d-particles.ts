/**
 * ToonOffice 2D 파티클 및 멀티 레이어 콤보 VFX 엔진:
 * 발자국 먼지·충돌 불꽃·커피 김·이모트 꽃가루·빛줄기 먼지·4각 별빛(starburst)·꽃잎(petal)·
 * 스피드라인(speedline)·웹툰 먹물 튀김(ink-splash)·이중 충격파(shockwave).
 * 고정 상한 풀을 써서 오래 켜 둬도 메모리가 늘지 않는다.
 */
import { office2dRandom, type Office2dCanvas2D } from "./office2d-procedural-art";

export type Office2dParticleKind =
  | "dust"
  | "spark"
  | "steam"
  | "confetti"
  | "mote"
  | "ring"
  | "note"
  | "starburst"
  | "petal"
  | "speedline"
  | "ink-splash"
  | "shockwave";

export type Office2dComboBurstPreset = "interaction" | "sprint" | "emote" | "seat" | "awakening";

interface Particle {
  kind: Office2dParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  spin: number;
}

const MAX_PARTICLES = 480;
const CONFETTI = ["#f08a7e", "#f2b84b", "#5cc3c9", "#9b7bea", "#6cbf73", "#ef7fb8"] as const;
const STARBURST_COLORS = ["#fde68a", "#38bdf8", "#f472b6", "#c084fc", "#6ee7b7"] as const;
const PETAL_COLORS = ["#fbcfe8", "#f9a8d4", "#a7f3d0", "#fde68a"] as const;
const INK_COLORS = ["#0f172a", "#38bdf8", "#a855f7", "#f43f5e"] as const;

export class Office2dParticles {
  private readonly particles: Particle[] = [];
  private readonly random: () => number;

  constructor(seed = 7) {
    this.random = office2dRandom(seed);
  }

  get count(): number {
    return this.particles.length;
  }

  private push(particle: Particle): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(particle);
  }

  emit(kind: Office2dParticleKind, x: number, y: number, amount = 1, strength = 1): void {
    if (![x, y, amount, strength].every(Number.isFinite)) return;
    for (let index = 0; index < Math.min(64, Math.max(0, Math.round(amount))); index += 1) {
      const angle = this.random() * Math.PI * 2;
      const speed = (12 + this.random() * 34) * strength;
      switch (kind) {
        case "dust":
          this.push({ kind, x: x + (this.random() - 0.5) * 10, y: y - 2, vx: Math.cos(angle) * speed * 0.6, vy: -6 - this.random() * 10, life: 0, maxLife: 0.45 + this.random() * 0.3, size: 2 + this.random() * 3, color: "rgba(214, 196, 170, 0.9)", spin: 0 });
          break;
        case "spark":
          this.push({ kind, x, y, vx: Math.cos(angle) * speed * 2.2, vy: Math.sin(angle) * speed * 2.2, life: 0, maxLife: 0.35 + this.random() * 0.25, size: 2 + this.random() * 2, color: this.random() > 0.5 ? "#fff3c4" : "#ffd27a", spin: angle });
          break;
        case "steam":
          this.push({ kind, x: x + (this.random() - 0.5) * 8, y, vx: (this.random() - 0.5) * 6, vy: -14 - this.random() * 10, life: 0, maxLife: 1.4 + this.random() * 0.8, size: 3 + this.random() * 3, color: "rgba(255, 255, 255, 0.55)", spin: 0 });
          break;
        case "confetti":
          this.push({ kind, x, y, vx: Math.cos(angle) * speed * 2.6, vy: -40 - this.random() * 60 * strength, life: 0, maxLife: 1 + this.random() * 0.6, size: 3 + this.random() * 2, color: CONFETTI[Math.floor(this.random() * CONFETTI.length)] ?? "#f2b84b", spin: this.random() * Math.PI });
          break;
        case "mote":
          this.push({ kind, x: x + (this.random() - 0.5) * 120, y: y + (this.random() - 0.5) * 80, vx: (this.random() - 0.5) * 4, vy: -2 - this.random() * 3, life: 0, maxLife: 3 + this.random() * 3, size: 1 + this.random() * 1.5, color: "rgba(255, 246, 214, 0.9)", spin: 0 });
          break;
        case "ring":
          this.push({ kind, x, y, vx: 0, vy: 0, life: 0, maxLife: 0.6, size: 6 * strength, color: "rgba(255, 255, 255, 0.85)", spin: 0 });
          break;
        case "note":
          this.push({
            kind,
            x: x + (this.random() - 0.5) * 20,
            y: y + (this.random() - 0.5) * 8,
            vx: (this.random() - 0.5) * 14,
            vy: -18 - this.random() * 14 * strength,
            life: 0,
            maxLife: 1.1 + this.random() * 0.5,
            size: 3.5 + this.random() * 2,
            color: CONFETTI[Math.floor(this.random() * CONFETTI.length)] ?? "#9b7bea",
            spin: this.random() * Math.PI,
          });
          break;
        case "starburst":
          this.push({
            kind,
            x: x + (this.random() - 0.5) * 14,
            y: y + (this.random() - 0.5) * 10,
            vx: Math.cos(angle) * speed * 1.85,
            vy: Math.sin(angle) * speed * 1.4 - 18 * strength,
            life: 0,
            maxLife: 0.55 + this.random() * 0.4,
            size: 4.2 + this.random() * 3.2,
            color: STARBURST_COLORS[Math.floor(this.random() * STARBURST_COLORS.length)] ?? "#fde68a",
            spin: this.random() * Math.PI,
          });
          break;
        case "petal":
          this.push({
            kind,
            x: x + (this.random() - 0.5) * 28,
            y: y - 10 + (this.random() - 0.5) * 16,
            vx: (this.random() - 0.35) * 26 * strength,
            vy: 14 + this.random() * 20,
            life: 0,
            maxLife: 1.4 + this.random() * 0.9,
            size: 3.2 + this.random() * 2.4,
            color: PETAL_COLORS[Math.floor(this.random() * PETAL_COLORS.length)] ?? "#fbcfe8",
            spin: this.random() * Math.PI * 2,
          });
          break;
        case "speedline":
          this.push({
            kind,
            x: x + (this.random() - 0.5) * 16,
            y: y + (this.random() - 0.5) * 12,
            vx: Math.cos(angle) * speed * 3.1,
            vy: Math.sin(angle) * speed * 1.8,
            life: 0,
            maxLife: 0.24 + this.random() * 0.16,
            size: 7 + this.random() * 6,
            color: this.random() > 0.4 ? "#e0f2fe" : "#fef08a",
            spin: angle,
          });
          break;
        case "ink-splash":
          this.push({
            kind,
            x: x + (this.random() - 0.5) * 12,
            y: y + (this.random() - 0.5) * 8,
            vx: Math.cos(angle) * speed * 2.1,
            vy: Math.sin(angle) * speed * 1.7 - 12,
            life: 0,
            maxLife: 0.48 + this.random() * 0.3,
            size: 2.8 + this.random() * 2.6,
            color: INK_COLORS[Math.floor(this.random() * INK_COLORS.length)] ?? "#38bdf8",
            spin: angle,
          });
          break;
        case "shockwave":
          this.push({
            kind,
            x,
            y,
            vx: 0,
            vy: 0,
            life: 0,
            maxLife: 0.52,
            size: 8 * strength,
            color: "#38bdf8",
            spin: 0,
          });
          break;
      }
    }
  }

  /** 상황별 다중 레이어 화려한 이펙트 프리셋을 한 번에 방출한다. */
  emitComboBurst(preset: Office2dComboBurstPreset, x: number, y: number, strength = 1): void {
    if (![x, y, strength].every(Number.isFinite)) return;
    switch (preset) {
      case "interaction":
        this.emit("shockwave", x, y, 1, 1.25 * strength);
        this.emit("starburst", x, y - 28, 7, 1.1 * strength);
        this.emit("spark", x, y - 24, 8, strength);
        this.emit("ink-splash", x, y - 20, 5, 0.95 * strength);
        break;
      case "sprint":
        this.emit("dust", x, y, 2, 0.7 * strength);
        this.emit("speedline", x, y - 18, 2, 0.85 * strength);
        break;
      case "emote":
        this.emit("ring", x, y - 2, 1, 1.15 * strength);
        this.emit("starburst", x, y - 54, 6, 0.95 * strength);
        this.emit("confetti", x, y - 58, 9, 0.8 * strength);
        break;
      case "seat":
        this.emit("ring", x, y + 2, 1, 1.1 * strength);
        this.emit("starburst", x, y - 24, 4, 0.8 * strength);
        this.emit("note", x, y - 36, 3, 0.85 * strength);
        break;
      case "awakening":
        this.emit("shockwave", x, y, 2, 1.5 * strength);
        this.emit("starburst", x, y - 32, 10, 1.3 * strength);
        this.emit("petal", x, y - 40, 8, 1.1 * strength);
        this.emit("spark", x, y - 24, 10, 1.2 * strength);
        break;
    }
  }

  update(deltaSeconds: number): void {
    if (!(deltaSeconds > 0)) return;
    let write = 0;
    for (const particle of this.particles) {
      particle.life += deltaSeconds;
      if (particle.life >= particle.maxLife) continue;
      if (particle.kind === "confetti" || particle.kind === "ink-splash") particle.vy += 180 * deltaSeconds;
      if (particle.kind === "petal") {
        particle.vx += Math.sin(particle.life * 6 + particle.spin) * 18 * deltaSeconds;
      }
      if (particle.kind === "spark" || particle.kind === "dust" || particle.kind === "starburst" || particle.kind === "speedline") {
        particle.vx *= Math.exp(-4 * deltaSeconds);
        particle.vy *= Math.exp(-4 * deltaSeconds);
      }
      particle.x += particle.vx * deltaSeconds;
      particle.y += particle.vy * deltaSeconds;
      particle.spin += deltaSeconds * 8;
      this.particles[write] = particle;
      write += 1;
    }
    this.particles.length = write;
  }

  draw(ctx: Office2dCanvas2D): void {
    for (const particle of this.particles) {
      const t = particle.life / particle.maxLife;
      const fade = particle.kind === "mote" ? Math.sin(t * Math.PI) : 1 - t;
      ctx.globalAlpha = Math.max(0, Math.min(1, fade));

      if (particle.kind === "ring" || particle.kind === "shockwave") {
        const radiusX = particle.size + t * (particle.kind === "shockwave" ? 42 : 26);
        const radiusY = radiusX * 0.45;
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = (particle.kind === "shockwave" ? 2.8 : 2) * (1 - t) + 0.5;
        ctx.beginPath();
        ctx.ellipse(particle.x, particle.y, radiusX, radiusY, 0, 0, Math.PI * 2);
        ctx.stroke();
        if (particle.kind === "shockwave") {
          ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
          ctx.lineWidth = 1.2 * (1 - t);
          ctx.beginPath();
          ctx.ellipse(particle.x, particle.y, radiusX * 0.68, radiusY * 0.68, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        continue;
      }

      if (particle.kind === "starburst") {
        const r = particle.size * (0.75 + Math.sin(t * Math.PI) * 0.45);
        const inner = r * 0.28;
        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.spin * 0.25);
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(inner, -inner);
        ctx.lineTo(r, 0);
        ctx.lineTo(inner, inner);
        ctx.lineTo(0, r);
        ctx.lineTo(-inner, inner);
        ctx.lineTo(-r, 0);
        ctx.lineTo(-inner, -inner);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(0.8, inner * 0.75), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }

      if (particle.kind === "petal") {
        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.spin * 0.45);
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, particle.size * 1.2, particle.size * 0.58, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }

      if (particle.kind === "speedline" || particle.kind === "spark") {
        const angle = Math.atan2(particle.vy, particle.vx);
        const len = particle.kind === "speedline" ? particle.size * (1.2 - t * 0.5) : particle.size * 1.9;
        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate(angle);
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = particle.kind === "speedline" ? 1.8 : 2.1;
        ctx.beginPath();
        ctx.moveTo(-len * 0.5, 0);
        ctx.lineTo(len * 0.5, 0);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      ctx.fillStyle = particle.color;
      if (particle.kind === "confetti" || particle.kind === "note") {
        ctx.save();
        ctx.translate(particle.x, particle.y);
        if (particle.kind === "note") {
          ctx.rotate(Math.PI / 4 + Math.sin(particle.spin * 0.5) * 0.25);
          ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
        } else {
          ctx.scale(Math.cos(particle.spin), 1);
          ctx.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
        }
        ctx.restore();
        continue;
      }

      const size = particle.kind === "steam" ? particle.size * (1 + t * 1.6) : particle.size;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, size, 0, Math.PI * 2);
      ctx.fill();
      if (particle.kind === "ink-splash") {
        ctx.beginPath();
        ctx.arc(particle.x + size * 1.15, particle.y - size * 0.85, size * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
