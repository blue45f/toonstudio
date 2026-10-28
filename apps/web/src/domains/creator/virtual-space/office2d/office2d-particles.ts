/**
 * ToonOffice 2D 파티클: 발자국 먼지·충돌 불꽃·커피 김·이모트 꽃가루·빛줄기 먼지.
 * 고정 상한 풀을 써서 오래 켜 둬도 메모리가 늘지 않는다.
 */
import { office2dRandom, type Office2dCanvas2D } from "./office2d-procedural-art";

export type Office2dParticleKind = "dust" | "spark" | "steam" | "confetti" | "mote" | "ring" | "note";

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

const MAX_PARTICLES = 420;
const CONFETTI = ["#f08a7e", "#f2b84b", "#5cc3c9", "#9b7bea", "#6cbf73", "#ef7fb8"] as const;

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
          this.push({ kind, x, y, vx: Math.cos(angle) * speed * 2.2, vy: Math.sin(angle) * speed * 2.2, life: 0, maxLife: 0.35 + this.random() * 0.25, size: 2 + this.random() * 2, color: this.random() > 0.5 ? "#fff3c4" : "#ffd27a", spin: 0 });
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
      }
    }
  }

  update(deltaSeconds: number): void {
    if (!(deltaSeconds > 0)) return;
    let write = 0;
    for (const particle of this.particles) {
      particle.life += deltaSeconds;
      if (particle.life >= particle.maxLife) continue;
      if (particle.kind === "confetti") particle.vy += 180 * deltaSeconds;
      if (particle.kind === "spark" || particle.kind === "dust") {
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
      if (particle.kind === "ring") {
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 2 * (1 - t) + 0.5;
        ctx.beginPath();
        ctx.ellipse(particle.x, particle.y, particle.size + t * 26, (particle.size + t * 26) * 0.45, 0, 0, Math.PI * 2);
        ctx.stroke();
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
    }
    ctx.globalAlpha = 1;
  }
}
