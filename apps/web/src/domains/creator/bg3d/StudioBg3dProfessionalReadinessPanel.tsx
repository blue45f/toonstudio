import {
  CheckCircle2,
  Cpu,
  Gauge,
  Layers3,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { useId } from "react";

import { studioBg3dClassNames as cx } from "./studio-bg3d-editor-ui";

import type {
  StudioBg3dProfessionalRuntimeReadiness,
  StudioBg3dProfessionalRuntimeSummary,
} from "./studio-bg3d-professional-runtime-readiness";

export interface StudioBg3dProfessionalReadinessPanelProps {
  readonly readiness?: StudioBg3dProfessionalRuntimeReadiness;
}

const RENDERER_LABELS = Object.freeze({
  "three-webgpu": "Three WebGPU · TSL",
  "three-webgl2": "Three WebGL2 호환",
});

const QUALITY_LABELS = Object.freeze({
  ultra: "울트라",
  high: "고품질",
  balanced: "균형",
  compatibility: "호환",
});

function formatGpuBudgetLabel(summary: StudioBg3dProfessionalRuntimeSummary): string {
  if (summary.gpuBudgetStatus === "unknown" || summary.maxTextureDimension2d === null) {
    return "측정 대기";
  }
  const texLabel = summary.maxTextureDimension2d >= 8192
    ? `${Math.round(summary.maxTextureDimension2d / 1024)}K 텍스처`
    : `${summary.maxTextureDimension2d}px`;
  const memPart = summary.deviceMemoryGiB !== null ? ` · ${summary.deviceMemoryGiB}GB` : "";
  if (summary.gpuBudgetStatus === "constrained") {
    return `저메모리 보호 (${texLabel}${memPart})`;
  }
  return `${texLabel}${memPart}`;
}

function statusCopy(readiness: StudioBg3dProfessionalRuntimeReadiness) {
  if (readiness.productionReady) {
    return {
      label: "전문 출력 준비됨",
      icon: CheckCircle2,
      tone: "border-success/45 bg-success/8 text-success",
    } as const;
  }
  if (readiness.editorReady) {
    return {
      label: "편집 준비됨 · 출력 검토 필요",
      icon: TriangleAlert,
      tone: "border-warn/45 bg-warn/8 text-warn",
    } as const;
  }
  return {
    label: "전문 3D 준비 차단",
    icon: ShieldAlert,
    tone: "border-danger/45 bg-danger/8 text-danger",
  } as const;
}

export function StudioBg3dProfessionalReadinessPanel({
  readiness,
}: StudioBg3dProfessionalReadinessPanelProps) {
  const titleId = useId();
  if (!readiness) {
    return (
      <section
        aria-labelledby={titleId}
        className="rounded-xl border border-line bg-card/75 p-3 break-keep"
      >
        <h3 id={titleId} className="text-xs font-semibold text-fg">
          전문 제작 준비 상태
        </h3>
        <p role="status" className="mt-1 text-[0.7rem] leading-relaxed text-fg-3">
          장면 구성과 3D 렌더 패스 준비 상태를 확인하고 있습니다.
        </p>
      </section>
    );
  }

  const status = statusCopy(readiness);
  const StatusIcon = status.icon;
  const renderer = readiness.summary.primaryRenderer
    ? RENDERER_LABELS[readiness.summary.primaryRenderer]
    : "렌더러 미선택";
  const quality = readiness.summary.qualityTier
    ? QUALITY_LABELS[readiness.summary.qualityTier]
    : "검증 전";
  const gpuBudget = formatGpuBudgetLabel(readiness.summary);
  const role = readiness.status === "blocked" ? "alert" : "status";

  return (
    <section
      aria-labelledby={titleId}
      data-testid="studio-bg3d-professional-readiness"
      data-status={readiness.status}
      data-gpu-budget={readiness.summary.gpuBudgetStatus}
      className="rounded-xl border border-line bg-card/75 p-3 shadow-sm break-keep"
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cx(
            "grid size-8 shrink-0 place-items-center rounded-lg border",
            status.tone,
          )}
          aria-hidden="true"
        >
          <StatusIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={titleId} className="text-xs font-semibold text-fg">
              전문 제작 준비 상태
            </h3>
            <span
              role={role}
              aria-live={role === "alert" ? "assertive" : "polite"}
              className={cx(
                "rounded-md border px-2 py-0.5 text-[0.64rem] font-semibold tabular-nums",
                status.tone,
              )}
            >
              {status.label}
            </span>
          </div>
          <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
            {readiness.message}
          </p>
        </div>
      </div>

      <dl
        data-testid="studio-bg3d-readiness-telemetry"
        className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line/60 pt-2.5 text-[0.65rem] tabular-nums sm:grid-cols-5"
      >
        <div className="min-w-0">
          <dt className="flex items-center gap-1 text-fg-3">
            <Gauge className="size-3 shrink-0" aria-hidden="true" />렌더러
          </dt>
          <dd className="mt-0.5 truncate font-semibold text-fg-2">{renderer}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-fg-3">품질 단계</dt>
          <dd className="mt-0.5 font-semibold text-fg-2">{quality}</dd>
        </div>
        <div className="min-w-0">
          <dt className="flex items-center gap-1 text-fg-3">
            <Layers3 className="size-3 shrink-0" aria-hidden="true" />NPR 패스
          </dt>
          <dd className="mt-0.5 font-semibold text-fg-2">
            {readiness.summary.enabledPassCount}개
            {readiness.summary.specialistPassCount > 0
              ? ` · FX ${readiness.summary.specialistPassCount}`
              : ""}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-fg-3">장면 구성</dt>
          <dd className="mt-0.5 font-semibold text-fg-2">
            객체 {readiness.summary.entityCount} · 캐릭터 {readiness.summary.characterCount}
          </dd>
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <dt className="flex items-center gap-1 text-fg-3">
            <Cpu className="size-3 shrink-0" aria-hidden="true" />GPU 여유
          </dt>
          <dd
            className={cx(
              "mt-0.5 truncate font-semibold",
              readiness.summary.gpuBudgetStatus === "constrained"
                ? "text-warn"
                : "text-fg-2",
            )}
          >
            {gpuBudget}
          </dd>
        </div>
      </dl>

      {readiness.blockers.length > 0 ? (
        <div className="mt-3 border-t border-danger/30 bg-danger/5 px-2.5 py-2 rounded-md">
          <p className="text-[0.64rem] font-semibold text-danger">출력 전 해결</p>
          <ul className="mt-1.5 grid gap-1 text-[0.62rem] leading-relaxed text-fg-2">
            {readiness.blockers.slice(0, 3).map((blocker) => (
              <li key={blocker} className="flex gap-1.5">
                <span aria-hidden="true">•</span><span>{blocker}</span>
              </li>
            ))}
          </ul>
          {readiness.blockers.length > 3 ? (
            <p className="mt-1 text-[0.58rem] text-fg-3 tabular-nums">
              그 외 {readiness.blockers.length - 3}개 검토 항목
            </p>
          ) : null}
        </div>
      ) : null}

      {readiness.recovery ? (
        <div className="mt-2 rounded-md bg-warn/8 px-2.5 py-2 text-[0.62rem] leading-relaxed text-fg-2">
          <strong className="font-semibold text-warn">복구 계획</strong>
          <span className="ml-1">{readiness.recovery.message}</span>
        </div>
      ) : null}

      {readiness.warnings.length > 0 ? (
        <p className="mt-2 text-[0.6rem] leading-relaxed text-fg-3">
          {readiness.warnings.slice(0, 2).join(" · ")}
        </p>
      ) : null}

      {readiness.summary.sourceHash ? (
        <details className="mt-2 border-t border-line/50 pt-1.5 text-[0.58rem] text-fg-3">
          <summary className="cursor-pointer select-none font-medium text-fg-3 hover:text-fg-2">
            기술 무결성 정보
          </summary>
          <p className="mt-1 truncate font-mono text-[0.54rem] tabular-nums text-fg-3">
            문서 판본 {readiness.summary.documentRevision} · {readiness.summary.sourceHash}
          </p>
        </details>
      ) : null}
    </section>
  );
}
