import { ArrowUpRight, Compass, Cpu, Layers, Radio, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import type { BilingualText } from "./competitor-benchmark-data";
import {
  TECH_RARE_WEB_APIS_18,
  TECH_RARE_WEB_API_CATEGORIES,
  WEBRTC_AUTHORITY_MATRIX,
  WEBRTC_EVIDENCE_DOC_PATH,
  WEBRTC_MEASURED_FILE_COUNT,
  WEBRTC_PROTOCOL_PILLARS,
  filterRareWebApis,
  type TechDiagramTone,
  type TechRareApiCategory,
} from "./tech-presentation-webrtc-api-data";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { fitSvgPillWidth, wrapSvgText } from "@/shared/lib/svg-text-wrap";
import { cn } from "@/shared/lib/utils";

export interface TechWebRtcAndRareApiShowcaseProps {
  readonly locale: "ko" | "en";
  readonly onJumpToSlide: (slideIndex: number) => void;
}

const MAX_RARE_API_FILES = 101;
const pick = (text: BilingualText, locale: "ko" | "en"): string => (locale === "ko" ? text.ko : text.en);

const COPY = {
  ko: {
    webrtcEyebrow: `WEBRTC REALTIME MEDIA · ${WEBRTC_MEASURED_FILE_COUNT} MEASURED FILES`,
    webrtcHeading: "WebRTC 24파일 실시간 미디어 프로토콜 · 8대 데이터 권위 분리",
    webrtcSubtitle:
      "문서·입장 제어·시그널링·미디어·ICE 정책을 하나의 실시간 상태로 묶지 않고 분리했습니다. 소규모 P2P 경로는 단위·로컬 Chromium 검증을 마쳤으며, TURN 미사용(STUN 전용) 정책과 WAN/SFU 경계를 함께 공개합니다.",
    webrtcScopeBadge: "소규모 P2P 검증 · STUN 전용 · TURN 미사용",
    webrtcJumpSlide: "슬라이드 17로 보기",
    webrtcSvgTitle: "3겹 시그널링 · 8대 권위 분리 · Perfect Negotiation · STUN 전용 ICE 흐름",
    matrixHeading: "8대 데이터 권위 매트릭스 (실제 분리 계약)",
    colConcern: "관심사",
    colAuthority: "단일 권위",
    colTech: "주요 기술",
    colDurability: "내구성",
    pillarWhy: "왜 썼나",
    pillarWhere: "ToonStudio 적용처",
    pillarReuse: "타 도메인 재사용법",
    evidenceDocLabel: "정본 설계 문서",
    rareEyebrow: "WEB PLATFORM APIS · 18 EXAMPLES",
    rareHeading: "ToonStudio 소스에서 확인한 웹 API 18종",
    rareSubtitle:
      "`apps/web/src/`의 참조 파일 수와 함께 각 API의 설계 흐름, 선택 이유, 코드 위치를 정리했습니다.",
    rareJumpSlide: "슬라이드 18로 보기",
    rareUnit: "종 API",
    fileUnit: "개 파일",
    flowLabel: "도식 흐름",
    rareWhy: "왜 썼나",
    rareWhere: "어디에 적용했나",
    rareReuse: "타 도메인 재사용법",
  },
  en: {
    webrtcEyebrow: `WEBRTC REALTIME MEDIA · ${WEBRTC_MEASURED_FILE_COUNT} MEASURED FILES`,
    webrtcHeading: "WebRTC 24-File Realtime Media Protocol & 8-Plane Authority Split",
    webrtcSubtitle:
      "Separates documents, room admission, signaling, RTP media, and ICE policy instead of collapsing them into one realtime flag. Small P2P paths are verified in unit and local Chromium tests, with STUN-only (no TURN) and WAN/SFU limits stated plainly.",
    webrtcScopeBadge: "Small P2P Verified · STUN-Only · No TURN",
    webrtcJumpSlide: "Jump to Slide 17",
    webrtcSvgTitle: "3-Layer Signaling, 8-Plane Authority, Perfect Negotiation & STUN-Only ICE",
    matrixHeading: "8-Plane Data Authority Matrix",
    colConcern: "Concern",
    colAuthority: "Single Authority",
    colTech: "Primary Technology",
    colDurability: "Durability",
    pillarWhy: "Why Chosen",
    pillarWhere: "Used in ToonStudio",
    pillarReuse: "Cross-Domain Reuse",
    evidenceDocLabel: "Canonical Design Doc",
    rareEyebrow: "WEB PLATFORM APIS · 18 EXAMPLES",
    rareHeading: "18 Web Platform APIs in the ToonStudio Source",
    rareSubtitle:
      "See reference counts from `apps/web/src/`, the intended flows, why each API was chosen, and where its code lives.",
    rareJumpSlide: "Jump to Slide 18",
    rareUnit: "APIs",
    fileUnit: "files",
    flowLabel: "Pipeline Flow",
    rareWhy: "Why Chosen",
    rareWhere: "Where Applied",
    rareReuse: "Cross-Domain Reuse",
  },
} as const;

const WEBRTC_SVG_NODES = [
  {
    stage: "PLANE 1-3",
    label: { ko: "DO · Socket.IO 입장", en: "DO / Socket.IO Room" },
    metric: { ko: "ACL · Presence · 부트스트랩", en: "ACL, presence & bootstrap" },
    tone: "cool" as const,
  },
  {
    stage: "PLANE 4-5",
    label: { ko: "studio-direct-v1", en: "studio-direct-v1" },
    metric: { ko: "허들 SDP/ICE · 직접 채팅", en: "Huddle SDP/ICE & P2P chat" },
    tone: "accent" as const,
  },
  {
    stage: "PLANE 6",
    label: { ko: "RTP · Negotiation", en: "RTP & Negotiation" },
    metric: { ko: "Glare/epoch · replaceTrack", en: "Glare/epoch & replaceTrack" },
    tone: "good" as const,
  },
  {
    stage: "PLANE 7-8",
    label: { ko: "STUN 전용 · 범위표시", en: "STUN-Only & Scope" },
    metric: { ko: "제한 백오프 · 수신자 우선", en: "Bounded retry & real scope" },
    tone: "warn" as const,
  },
] as const;

function toneStrokeVar(tone: TechDiagramTone): string {
  switch (tone) {
    case "accent": return "var(--color-accent)";
    case "cool": return "var(--color-cool)";
    case "good": return "var(--color-good)";
    case "warn": return "var(--color-warn)";
  }
}

function toneBarClass(tone: TechDiagramTone): string {
  switch (tone) {
    case "accent": return "bg-accent";
    case "cool": return "bg-cool";
    case "good": return "bg-good";
    case "warn": return "bg-warn";
  }
}

function tonePillClass(tone: TechDiagramTone): string {
  switch (tone) {
    case "accent": return "ts-status-accent";
    case "cool": return "ts-status-cool";
    case "good": return "ts-status-good";
    case "warn": return "ts-status-warn";
  }
}

function WebRtcProtocolDiagramSvg(props: { readonly title: string; readonly locale: "ko" | "en" }) {
  const { title, locale } = props;
  const count = WEBRTC_SVG_NODES.length;
  const gap = 24;
  const padX = 16;
  const totalWidth = 920;
  const boxWidth = Math.floor((totalWidth - padX * 2 - gap * (count - 1)) / count);
  const titleLines = wrapSvgText(title, {
    maxWidth: totalWidth - 44,
    fontSize: 12,
    maxLines: 2,
    bold: true,
  });
  const boxY = titleLines.length > 1 ? 56 : 42;
  const boxHeight = 122;
  const totalHeight = boxY + boxHeight + 16;

  return (
    <svg
      data-testid="tech-webrtc-architecture-svg"
      role="img"
      aria-label={title}
      viewBox={`0 0 ${totalWidth} ${totalHeight}`}
      className="block h-auto w-full max-w-full rounded-2xl border border-line bg-canvas p-2 text-fg"
    >
      <title>{title}</title>
      <rect
        x={4}
        y={4}
        width={totalWidth - 8}
        height={totalHeight - 8}
        rx={14}
        fill="var(--color-panel)"
        stroke="var(--color-line)"
        strokeWidth={1}
      />
      <text
        x={20}
        y={titleLines.length > 1 ? 20 : 24}
        dominantBaseline="middle"
        fill="var(--color-fg-2)"
        fontSize={12}
        fontWeight={700}
      >
        {titleLines.map((line, lineIdx) => (
          <tspan key={`webrtc-title-${lineIdx}`} x={20} dy={lineIdx === 0 ? 0 : 16}>
            {line}
          </tspan>
        ))}
      </text>
      {WEBRTC_SVG_NODES.map((node, index) => {
        const x = padX + index * (boxWidth + gap);
        const accent = toneStrokeVar(node.tone);
        const arrowX1 = x + boxWidth + 4;
        const arrowX2 = x + boxWidth + gap - 4;
        const arrowY = boxY + boxHeight / 2;
        const stagePillW = fitSvgPillWidth(node.stage, 10, 10, 64, boxWidth - 24, true);
        const labelLines = wrapSvgText(pick(node.label, locale), {
          maxWidth: boxWidth - 24,
          fontSize: 12.5,
          maxLines: 2,
          bold: true,
        });
        const metricLines = wrapSvgText(pick(node.metric, locale), {
          maxWidth: boxWidth - 24,
          fontSize: 11,
          maxLines: 2,
          bold: false,
        });
        const labelStartY = boxY + 50;
        const metricStartY = labelLines.length > 1 ? boxY + 84 : boxY + 78;

        return (
          <g key={node.stage}>
            <rect
              x={x}
              y={boxY}
              width={boxWidth}
              height={boxHeight}
              rx={12}
              fill="var(--color-card)"
              stroke={accent}
              strokeWidth={1.75}
            />
            <rect
              x={x + 12}
              y={boxY + 12}
              width={stagePillW}
              height={20}
              rx={10}
              fill="var(--color-raised)"
              stroke={accent}
              strokeWidth={1}
            />
            <text
              x={x + 12 + stagePillW / 2}
              y={boxY + 22}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={accent}
              fontSize={10}
              fontWeight={700}
            >
              {node.stage}
            </text>
            <text
              x={x + 12}
              y={labelStartY}
              dominantBaseline="middle"
              fill="var(--color-fg)"
              fontSize={12.5}
              fontWeight={700}
            >
              {labelLines.map((line, lineIdx) => (
                <tspan key={`${node.stage}-lbl-${lineIdx}`} x={x + 12} dy={lineIdx === 0 ? 0 : 16}>
                  {line}
                </tspan>
              ))}
            </text>
            <text
              x={x + 12}
              y={metricStartY}
              dominantBaseline="middle"
              fill="var(--color-fg-2)"
              fontSize={11}
            >
              {metricLines.map((line, lineIdx) => (
                <tspan key={`${node.stage}-met-${lineIdx}`} x={x + 12} dy={lineIdx === 0 ? 0 : 15}>
                  {line}
                </tspan>
              ))}
            </text>
            {index < count - 1 ? (
              <g>
                <line
                  x1={arrowX1}
                  y1={arrowY}
                  x2={arrowX2 - 5}
                  y2={arrowY}
                  stroke="currentColor"
                  strokeOpacity={0.55}
                  strokeWidth={2}
                />
                <polygon
                  points={`${arrowX2},${arrowY} ${arrowX2 - 8},${arrowY - 5} ${arrowX2 - 8},${arrowY + 5}`}
                  fill="currentColor"
                  fillOpacity={0.7}
                />
              </g>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export function TechWebRtcAndRareApiShowcase(props: TechWebRtcAndRareApiShowcaseProps) {
  const { locale, onJumpToSlide } = props;
  const copy = COPY[locale];
  const [rareCategory, setRareCategory] = useState<"all" | TechRareApiCategory>("all");

  const filteredRareApis = useMemo(
    () => filterRareWebApis(TECH_RARE_WEB_APIS_18, rareCategory),
    [rareCategory],
  );

  return (
    <div className="space-y-8">
      {/* A. WebRTC 24파일 프로토콜 · 8대 데이터 권위 매트릭스 */}
      <div data-testid="tech-webrtc-protocol-section" className="space-y-5 rounded-3xl border border-line bg-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.12em] text-good uppercase">
              <Radio size={14} aria-hidden="true" />
              <span>{copy.webrtcEyebrow}</span>
            </p>
            <h3 className="mt-1 text-lg font-bold text-fg sm:text-2xl">{copy.webrtcHeading}</h3>
            <p className="mt-1.5 text-sm leading-6 text-fg-2">{copy.webrtcSubtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="ts-status-pill ts-status-warn shrink-0">{copy.webrtcScopeBadge}</span>
            <button
              type="button"
              data-testid="tech-webrtc-jump-slide-17"
              onClick={() => onJumpToSlide(16)}
              className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 motion-reduce:transition-none" })}
            >
              <span>{copy.webrtcJumpSlide}</span>
              <ArrowUpRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>

        <WebRtcProtocolDiagramSvg title={copy.webrtcSvgTitle} locale={locale} />

        <div className="grid gap-3 md:grid-cols-2">
          {WEBRTC_PROTOCOL_PILLARS.map((pillar) => (
            <article key={pillar.id} data-testid={`tech-webrtc-pillar-${pillar.id}`} className="flex flex-col justify-between rounded-2xl border border-line bg-card p-4">
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="ts-status-pill ts-status-cool font-mono tabular-nums">RTC-{pillar.indexLabel}</span>
                  <h4 className="text-sm font-bold text-fg sm:text-base">{pick(pillar.title, locale)}</h4>
                </div>
                <p className="text-xs leading-5 text-fg-2 sm:text-sm sm:leading-6">{pick(pillar.summary, locale)}</p>
                <dl className="grid gap-1.5 pt-1 text-xs leading-5">
                  <div className="rounded-xl bg-raised p-2.5">
                    <dt className="flex items-center gap-1 font-bold text-accent"><Compass size={12} aria-hidden="true" /><span>{copy.pillarWhy}</span></dt>
                    <dd className="mt-0.5 text-fg-2">{pick(pillar.why, locale)}</dd>
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    <div className="rounded-xl bg-raised p-2.5">
                      <dt className="flex items-center gap-1 font-bold text-good"><Layers size={12} aria-hidden="true" /><span>{copy.pillarWhere}</span></dt>
                      <dd className="mt-0.5 text-fg-2">{pick(pillar.where, locale)}</dd>
                    </div>
                    <div className="rounded-xl bg-raised p-2.5">
                      <dt className="flex items-center gap-1 font-bold text-cool"><Cpu size={12} aria-hidden="true" /><span>{copy.pillarReuse}</span></dt>
                      <dd className="mt-0.5 text-fg-2">{pick(pillar.reuse, locale)}</dd>
                    </div>
                  </div>
                </dl>
              </div>
              <p className="mt-3 break-all border-t border-line/60 pt-2 font-mono text-[11px] text-fg-3">{pillar.repoPaths.join(" · ")}</p>
            </article>
          ))}
        </div>

        <div data-testid="tech-webrtc-authority-matrix" className="space-y-2.5 rounded-2xl border border-line bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-sm font-bold text-fg">
              <ShieldCheck size={15} className="text-good" aria-hidden="true" />
              <span>{copy.matrixHeading}</span>
            </h4>
            <span className="font-mono text-[11px] text-fg-3">{copy.evidenceDocLabel}: {WEBRTC_EVIDENCE_DOC_PATH}</span>
          </div>
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[44rem] border-collapse text-left text-xs [word-break:keep-all] tabular-nums">
              <thead>
                <tr className="border-b border-line text-fg-3">
                  <th scope="col" className="sticky left-0 z-10 min-w-[9.5rem] border-r border-line/60 bg-card py-2 pr-3 font-bold">{copy.colConcern}</th>
                  <th scope="col" className="min-w-[10rem] py-2 px-3 font-bold">{copy.colAuthority}</th>
                  <th scope="col" className="min-w-[12rem] py-2 pr-3 font-bold">{copy.colTech}</th>
                  <th scope="col" className="min-w-[10rem] py-2 font-bold">{copy.colDurability}</th>
                </tr>
              </thead>
              <tbody>
                {WEBRTC_AUTHORITY_MATRIX.map((row) => (
                  <tr key={row.id} data-testid={`tech-webrtc-authority-row-${row.id}`} className="border-b border-line/60 last:border-b-0">
                    <th scope="row" className="sticky left-0 z-10 border-r border-line/60 bg-card py-2 pr-3 font-bold text-fg">{pick(row.concern, locale)}</th>
                    <td className="py-2 px-3 text-cool">{pick(row.authority, locale)}</td>
                    <td className="py-2 pr-3 text-fg-2">{pick(row.technology, locale)}</td>
                    <td className="py-2 font-semibold text-fg-2">{pick(row.durability, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* B. 실측 희귀 웹 API 18종 카탈로그 (4단 시각 해설) */}
      <div data-testid="tech-rare-apis-section" className="space-y-4 rounded-3xl border border-line bg-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.12em] text-cool uppercase">
              <Cpu size={14} aria-hidden="true" />
              <span>{copy.rareEyebrow}</span>
            </p>
            <h3 className="mt-1 text-lg font-bold text-fg sm:text-2xl">{copy.rareHeading}</h3>
            <p className="mt-1.5 text-sm leading-6 text-fg-2">{copy.rareSubtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span data-testid="tech-rare-apis-count" aria-live="polite" className="ts-status-pill ts-status-cool tabular-nums">
              {filteredRareApis.length} / {TECH_RARE_WEB_APIS_18.length} {copy.rareUnit}
            </span>
            <button
              type="button"
              data-testid="tech-rare-apis-jump-slide-18"
              onClick={() => onJumpToSlide(17)}
              className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 motion-reduce:transition-none" })}
            >
              <span>{copy.rareJumpSlide}</span>
              <ArrowUpRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div role="group" aria-label={copy.rareHeading} className="flex flex-wrap gap-2">
          {TECH_RARE_WEB_API_CATEGORIES.map((category) => {
            const active = rareCategory === category.id;
            return (
              <button
                key={category.id}
                type="button"
                data-testid={`tech-rare-api-cat-${category.id}`}
                aria-pressed={active}
                onClick={() => setRareCategory(category.id)}
                className={cn(
                  "min-h-11 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors motion-reduce:transition-none",
                  active ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
                )}
              >
                {pick(category.label, locale)}
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {filteredRareApis.map((api) => {
            const widthPct = Math.max(6, Math.min(100, Math.round((api.fileCount / MAX_RARE_API_FILES) * 100)));
            return (
              <article key={api.id} data-testid={`tech-rare-api-card-${api.id}`} className="flex flex-col justify-between rounded-2xl border border-line bg-card p-4">
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="font-mono text-sm font-bold text-fg">{api.name}</h4>
                    <span className={cn("ts-status-pill shrink-0 font-mono tabular-nums", tonePillClass(api.tone))}>
                      {api.fileCount} {copy.fileUnit}
                    </span>
                  </div>

                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised" aria-hidden="true">
                    <div className={cn("h-full rounded-full", toneBarClass(api.tone))} style={{ width: `${widthPct}%` }} />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="font-bold text-fg-3">{copy.flowLabel}:</span>
                    {api.flowSteps.map((step, idx) => (
                      <span key={step} className="inline-flex items-center gap-1">
                        <span className="rounded-md border border-line bg-raised px-2 py-0.5 font-mono text-fg-2">{step}</span>
                        {idx < api.flowSteps.length - 1 ? <span className="text-fg-3" aria-hidden="true">→</span> : null}
                      </span>
                    ))}
                  </div>

                  <dl className="space-y-1.5 text-xs leading-5">
                    <div><dt className="font-bold text-accent">{copy.rareWhy}</dt><dd className="text-fg-2">{pick(api.why, locale)}</dd></div>
                    <div><dt className="font-bold text-good">{copy.rareWhere}</dt><dd className="text-fg-2">{pick(api.whereUsed, locale)}</dd></div>
                    <div><dt className="font-bold text-cool">{copy.rareReuse}</dt><dd className="text-fg-2">{pick(api.reusePlaybook, locale)}</dd></div>
                  </dl>
                </div>
                <p className="mt-3 break-all border-t border-line/60 pt-2 font-mono text-[11px] text-fg-3">{api.repoPath}</p>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
