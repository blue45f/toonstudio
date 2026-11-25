import { ArrowRight, CheckCircle2, ChevronDown, ChevronUp, Code2, Layers } from "lucide-react";
import { useState } from "react";

import type { BilingualText } from "./competitor-benchmark-data";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

export interface StudioNextGenInnovationsStripProps {
  readonly locale: "ko" | "en";
}

interface NextGenInnovationCardSpec {
  readonly id: "neural-memory" | "crossmedia-ip" | "rights-ledger" | "live-palette";
  readonly ordinal: string;
  readonly spriteSrc: string;
  readonly fallbackSpriteSrc: string;
  readonly statusToneClass: "ts-status-good" | "ts-status-cool" | "ts-status-accent";
  readonly statusBadge: BilingualText;
  readonly title: BilingualText;
  readonly spriteAlt: BilingualText;
  readonly summary: BilingualText;
  readonly technicalNote: BilingualText;
  readonly modules: readonly string[];
  readonly experienceHref: string;
  readonly experienceLabel: BilingualText;
}

const INNOVATION_CARDS: readonly NextGenInnovationCardSpec[] = [
  {
    id: "neural-memory",
    ordinal: "01",
    spriteSrc: "/assets/studio/vibrant-sprites/innov-neural-memory.webp",
    fallbackSpriteSrc: "/assets/studio/vibrant-sprites/emblem-studio.webp",
    statusToneClass: "ts-status-good",
    statusBadge: { ko: "구현 완료 · OPFS WAL", en: "Live · OPFS WAL" },
    title: { ko: "시각 기억 기반 무한 캔버스 히스토리", en: "Visual-Memory Infinite Canvas History" },
    spriteAlt: { ko: "무한 캔버스 히스토리 OPFS WAL 스프라이트", en: "Infinite canvas history OPFS WAL sprite" },
    summary: {
      ko: "최근 20단계는 RAM에서 즉시 되돌리고 초과 이력은 델타 압축해 OPFS WAL로 무제한 스필합니다. 강제 새로고침 뒤에도 CRC-32·SHA-256 검증으로 0손실 복구합니다.",
      en: "Keeps 20 hot undo steps in RAM and spills older deltas to OPFS WAL indefinitely, recovering with zero loss after forced reloads via CRC-32 and SHA-256 verification.",
    },
    technicalNote: {
      ko: "희소 델타 패치 + CompressionStream 자동 스필 + SQLite WASM WAL 체크포인트 스크러버",
      en: "Sparse delta patches + CompressionStream auto-spill + SQLite WASM WAL checkpoint scrubber",
    },
    modules: [
      "apps/web/src/domains/creator/session-endurance/history-opfs-spill-store.ts",
      "apps/web/src/domains/creator/runtime-resilience/sqlite-opfs-wal-scrubber.ts",
    ],
    experienceHref: "/studio/new",
    experienceLabel: { ko: "스튜디오 캔버스 체험", en: "Try live in Studio" },
  },
  {
    id: "crossmedia-ip",
    ordinal: "02",
    spriteSrc: "/assets/studio/vibrant-sprites/innov-crossmedia-ip.webp",
    fallbackSpriteSrc: "/assets/studio/vibrant-sprites/tech-remotion.webp",
    statusToneClass: "ts-status-cool",
    statusBadge: { ko: "구현 완료 · 6방향 엔진", en: "Live · 6-Way Engine" },
    title: { ko: "크로스-미디어 IP 자동 변환기", en: "Cross-Media IP Auto-Transformer" },
    spriteAlt: { ko: "크로스-미디어 IP 변환 파이프라인 스프라이트", en: "Cross-media IP transformer pipeline sprite" },
    summary: {
      ko: "웹툰 원고 한 편을 Remotion 숏폼 트레일러, 3D 씬, Unity·Unreal·Godot·Phaser 게임 에셋으로 자동 변환합니다. 3단계 LOD, 4/8방향 아틀라스, Ink·Yarn 대사 JSON을 생성합니다.",
      en: "Transforms one webtoon episode into Remotion trailers, 3D scenes, and Unity, Unreal, Godot and Phaser assets with 3-tier LODs, 4/8-way atlases, and Ink/Yarn dialogue JSON.",
    },
    technicalNote: {
      ko: "6방향 IP 변환 플래너 + 게임 엔진 프로파일 매니페스트 + 상업 라이선스 자동 감사",
      en: "6-way IP transform planner + game engine profile manifest + commercial license audit",
    },
    modules: [
      "apps/web/src/domains/creator/ip-market-guide-hub/ip-game-transformer-engine.ts",
      "apps/web/src/domains/creator/ip-market-guide-hub/IpGameTransformTabPanel.tsx",
    ],
    experienceHref: "/tech",
    experienceLabel: { ko: "Remotion · IP 파이프라인", en: "Explore Remotion & IP" },
  },
  {
    id: "rights-ledger",
    ordinal: "03",
    spriteSrc: "/assets/studio/vibrant-sprites/innov-rights-ledger.webp",
    fallbackSpriteSrc: "/assets/studio/vibrant-sprites/emblem-benchmark.webp",
    statusToneClass: "ts-status-accent",
    statusBadge: { ko: "구현 완료 · 출고 게이트", en: "Live · Export Gate" },
    title: { ko: "작화 증명 · 권리 BOM 저작권 원장", en: "Human Craft Proof & Rights BOM Ledger" },
    spriteAlt: { ko: "작화 증명과 권리 BOM 저작권 원장 스프라이트", en: "Human craft proof and Rights BOM ledger sprite" },
    summary: {
      ko: "수작업 획 비중을 기록하는 인간 작화 증명서, 외주·시사 유출을 추적하는 비가시적 포렌식 워터마크, 출고 전 에셋 라이선스를 검증하는 권리 BOM 원장을 통합했습니다.",
      en: "Combines Human Craft Certificates for hand-drawn stroke share, Stealth Forensic Watermarks for leak tracing, and pre-export Rights BOM license verification.",
    },
    technicalNote: {
      ko: "인간 작화 등급 증명서 + 세션 해시 포렌식 워터마크 + 출고 전 Rights BOM 매니페스트 검증",
      en: "Human craft grade certificate + session-hash forensic watermark + pre-export Rights BOM audit",
    },
    modules: [
      "apps/web/src/domains/creator/global-ost-premiere/human-craft-and-ergonomic-trust.ts",
      "apps/web/src/domains/creator/studio-asset-rights-manifest.ts",
    ],
    experienceHref: "/studio/assets",
    experienceLabel: { ko: "권리 BOM · 에셋 허브", en: "Open Rights BOM & Assets" },
  },
  {
    id: "live-palette",
    ordinal: "04",
    spriteSrc: "/assets/studio/vibrant-sprites/innov-live-palette.webp",
    fallbackSpriteSrc: "/assets/studio/vibrant-sprites/tech-webgpu.webp",
    statusToneClass: "ts-status-good",
    statusBadge: { ko: "구현 완료 · WGSL SIMD", en: "Live · WGSL SIMD" },
    title: { ko: "실시간 7밴드 분광 안료 혼색(KM7)", en: "Real-Time 7-Band Spectral Pigment Mixing (KM7)" },
    spriteAlt: { ko: "실시간 7밴드 분광 안료 팔레트 스프라이트", en: "Real-time 7-band spectral pigment palette sprite" },
    summary: {
      ko: "420–670nm 7밴드를 vec4<f32> 2레지스터로 패킹한 100% 클린룸 Kubelka-Munk WGSL 커널입니다. 외부 독점 LUT 없이 감산 혼색과 광학 글레이징을 실시간 연산합니다.",
      en: "Clean-room 420-670nm 7-band Kubelka-Munk WGSL kernel packed into two vec4<f32> SIMD registers, computing subtractive pigment mixing and glazing without proprietary LUTs.",
    },
    technicalNote: {
      ko: "CPU·WGSL 단일 진실 원본 코어 + 루프 없는 2레지스터 SIMD + 컬러 팝오버 라이브 프리뷰",
      en: "Single-source CPU/WGSL spectral core + branchless 2-register SIMD + live swatch preview",
    },
    modules: [
      "apps/web/src/domains/creator/render/studio-webgpu-km7-spectral-core.ts",
      "apps/web/src/domains/creator/canvas-chrome/StudioSpectralBlendPreviewChip.tsx",
    ],
    experienceHref: "/studio/new",
    experienceLabel: { ko: "분광 팔레트 써보기", en: "Test KM7 in Studio" },
  },
];

const STRIP_COPY = {
  ko: {
    eyebrow: "CORE STUDIO ARCHITECTURE",
    heading: "저장소 구현 4대 핵심 아키텍처",
    subtitle: "저장소에 실제 구현·연결된 4대 핵심 엔진입니다. 카드별 상세 보기로 실제 모듈 경로와 구현 구조를 바로 확인할 수 있습니다.",
    toggleOpen: "구현 모듈·구조 보기",
    toggleClose: "구현 상세 접기",
    modulesLabel: "실제 저장소 모듈",
    architectureLabel: "핵심 구현 구조",
  },
  en: {
    eyebrow: "CORE STUDIO ARCHITECTURE",
    heading: "4 Core Implemented Studio Engines",
    subtitle: "Four core engines implemented and wired in this repository. Toggle any card to inspect real repository module paths, architecture notes and live links.",
    toggleOpen: "Inspect modules & architecture",
    toggleClose: "Hide technical details",
    modulesLabel: "Verified repository modules",
    architectureLabel: "Core architecture",
  },
} as const;

export function StudioNextGenInnovationsStrip({ locale }: StudioNextGenInnovationsStripProps) {
  const copy = STRIP_COPY[locale];
  const [expandedIds, setExpandedIds] = useState<Readonly<Record<string, boolean>>>({});
  const [failedSprites, setFailedSprites] = useState<Readonly<Record<string, boolean>>>({});
  const toggleDetail = (id: NextGenInnovationCardSpec["id"]) =>
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <section
      data-testid="benchmark-nextgen-innovations"
      aria-labelledby="benchmark-nextgen-innovations-heading"
      className="ts-showcase-reveal space-y-4"
    >
      <div className="flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-accent uppercase">
        <Layers size={14} aria-hidden="true" />
        <span>{copy.eyebrow}</span>
      </div>
      <h2 id="benchmark-nextgen-innovations-heading" className="text-xl font-bold text-fg sm:text-2xl">
        {copy.heading}
      </h2>
      <p className="max-w-3xl text-sm leading-6 text-fg-2">{copy.subtitle}</p>

      <div className="grid gap-4 md:grid-cols-2">
        {INNOVATION_CARDS.map((card) => {
          const isOpen = Boolean(expandedIds[card.id]);
          const spriteSrc = failedSprites[card.id] ? card.fallbackSpriteSrc : card.spriteSrc;
          const panelId = `nextgen-innov-detail-${card.id}`;

          return (
            <article
              key={card.id}
              data-testid={`nextgen-innov-card-${card.id}`}
              className="ts-showcase-sprite-card flex flex-col justify-between rounded-3xl p-5"
            >
              <div>
                <div className="flex items-start gap-4">
                  <div className="ts-showcase-emblem-frame h-18 w-18 shrink-0 rounded-2xl p-2">
                    <img
                      src={spriteSrc}
                      alt={card.spriteAlt[locale]}
                      width={60}
                      height={60}
                      loading="lazy"
                      decoding="async"
                      onError={() =>
                        setFailedSprites((prev) => (prev[card.id] ? prev : { ...prev, [card.id]: true }))
                      }
                      className="h-14 w-14 object-contain"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-fg-3">#{card.ordinal}</span>
                      <span className={cn("ts-status-pill", card.statusToneClass)}>
                        <CheckCircle2 size={12} aria-hidden="true" />
                        {card.statusBadge[locale]}
                      </span>
                    </div>
                    <h3 className="mt-1.5 text-base font-bold text-fg">{card.title[locale]}</h3>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-fg-2 sm:text-sm sm:leading-6">{card.summary[locale]}</p>
              </div>

              <div className="mt-4 space-y-3 border-t border-line/70 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    data-testid={`nextgen-innov-toggle-${card.id}`}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggleDetail(card.id)}
                    className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
                  >
                    <Code2 size={14} aria-hidden="true" />
                    <span>{isOpen ? copy.toggleClose : copy.toggleOpen}</span>
                    {isOpen ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                  </button>
                  <Link href={card.experienceHref} className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11 text-accent" })}>
                    <span>{card.experienceLabel[locale]}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </div>

                {isOpen ? (
                  <div id={panelId} data-testid={`nextgen-innov-panel-${card.id}`} className="space-y-2 rounded-2xl border border-line bg-panel p-3.5 text-xs">
                    <p className="font-semibold text-fg">{copy.architectureLabel}</p>
                    <p className="leading-5 text-fg-2">{card.technicalNote[locale]}</p>
                    <p className="pt-1 font-semibold text-fg">{copy.modulesLabel}</p>
                    <ul className="space-y-1">
                      {card.modules.map((mod) => (
                        <li key={mod} className="break-all font-mono text-[11px] text-cool">{mod}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
