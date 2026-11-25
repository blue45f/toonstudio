import { Check, Copy } from "lucide-react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import type { StudioOpenAiExtendedStructuredResult } from "../ai/studio-openai-creative-assist-client";

interface StudioOpenAiExtendedResultBodyProps {
  readonly result: StudioOpenAiExtendedStructuredResult;
  readonly copiedKey: string | null;
  readonly onCopy: (key: string, value: string) => void;
}

function CopyButton({
  copyKey,
  copiedKey,
  label,
  copiedLabel,
  value,
  onCopy,
}: {
  readonly copyKey: string;
  readonly copiedKey: string | null;
  readonly label: string;
  readonly copiedLabel: string;
  readonly value: string;
  readonly onCopy: (key: string, value: string) => void;
}) {
  const isCopied = copiedKey === copyKey;
  return (
    <button
      type="button"
      onClick={() => onCopy(copyKey, value)}
      className={buttonClass({
        variant: "outline",
        size: "sm",
        className: "min-h-9 shrink-0 gap-1.5",
      })}
    >
      {isCopied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      {isCopied ? copiedLabel : label}
    </button>
  );
}

/** 10종 확장 OpenAI 창작 보조 모드 결과를 구조화 카드로 렌더링한다. */
export function StudioOpenAiExtendedResultBody({
  result,
  copiedKey,
  onCopy,
}: StudioOpenAiExtendedResultBodyProps) {
  const bt = useBilingual("StudioOpenAiExtendedResultBody");
  const copiedLabel = bt("복사됨", "Copied");

  switch (result.mode) {
    case "character-bible-forge": {
      const { data } = result;
      const summaryCopy = [
        `${data.characterName} (${data.archetypeKo})`,
        `말투: ${data.speechTone}`,
        `외형·배색: ${data.appearancePalette}`,
        `핵심 동기: ${data.coreMotivation}`,
        `작화 일관성 기준: ${data.visualConsistencyCue}`,
      ].join("\n");
      return (
        <div
          data-testid="openai-extended-result-character-bible-forge"
          className="mt-3 space-y-3 text-xs [word-break:keep-all]"
        >
          <div className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-panel/70 p-3">
            <div>
              <span className="inline-block rounded bg-accent/15 px-2 py-0.5 text-[0.65rem] font-extrabold text-accent">
                {data.archetypeKo}
              </span>
              <h4 className="mt-1 text-sm font-black text-fg">{data.characterName}</h4>
              <p className="mt-1 leading-5 text-fg-2">{data.coreMotivation}</p>
            </div>
            <CopyButton
              copyKey="char-bible"
              copiedKey={copiedKey}
              label={bt("설정 요약 복사", "Copy bible")}
              copiedLabel={copiedLabel}
              value={summaryCopy}
              onCopy={onCopy}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-panel/55 p-3 leading-5">
              <strong className="text-fg">{bt("말투·호흡", "Speech tone")}</strong>
              <p className="mt-1 text-fg-2">{data.speechTone}</p>
            </div>
            <div className="rounded-xl border border-line bg-panel/55 p-3 leading-5">
              <strong className="text-fg">{bt("외형·배색·일관성 앵커", "Appearance & anchor")}</strong>
              <p className="mt-1 text-fg-2">{data.appearancePalette}</p>
              <p className="mt-1 text-[0.7rem] text-fg-3">{data.visualConsistencyCue}</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-panel/55 p-3">
              <strong className="text-fg">{bt("금기 대사", "Forbidden lines")}</strong>
              <ul className="mt-1.5 space-y-1 text-fg-2">
                {data.forbiddenLines.map((line, idx) => (
                  <li key={`forbid:${idx}`}>• “{line}”</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-line bg-panel/55 p-3">
              <strong className="text-fg">{bt("인물 관계 훅", "Relationship hooks")}</strong>
              <ul className="mt-1.5 space-y-1 text-fg-2">
                {data.relationshipHooks.map((hook, idx) => (
                  <li key={`hook:${idx}`}>
                    <strong className="text-fg">{hook.target}:</strong> {hook.dynamic}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      );
    }

    case "continuity-plot-audit": {
      const { data } = result;
      return (
        <div
          data-testid="openai-extended-result-continuity-plot-audit"
          className="mt-3 space-y-3 text-xs [word-break:keep-all]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-panel/70 p-3">
            <p className="font-semibold text-fg">{data.summary}</p>
            <span className="rounded-full bg-accent-soft px-2.5 py-1 font-extrabold text-accent tabular-nums">
              {bt(`일관성 ${data.overallConsistencyScore}/100점`, `Score ${data.overallConsistencyScore}/100`)}
            </span>
          </div>
          <ul className="space-y-2">
            {data.issues.map((issue, idx) => (
              <li
                key={`issue:${idx}`}
                className={cn(
                  "rounded-xl border p-3 leading-5",
                  issue.severity === "critical"
                    ? "border-danger/35 bg-danger-soft/15"
                    : issue.severity === "warn"
                      ? "border-warning/35 bg-warning-soft/15"
                      : "border-line bg-panel/60",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-fg">
                    [{issue.category}] {issue.locationHint}
                  </strong>
                  <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.65rem] font-bold text-fg-2">
                    {issue.severity === "critical"
                      ? bt("필수 수정", "Critical")
                      : issue.severity === "warn"
                        ? bt("주의", "Warning")
                        : bt("제안", "Tip")}
                  </span>
                </div>
                <p className="mt-1 text-fg-2">{issue.conflictDetail}</p>
                <p className="mt-1.5 rounded-lg bg-card px-2.5 py-1.5 font-semibold text-fg">
                  {bt("수정안:", "Fix:")} {issue.fixSuggestion}
                </p>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    case "bg3d-camera-blocking": {
      const { data } = result;
      const jsonCopy = JSON.stringify(data, null, 2);
      return (
        <div
          data-testid="openai-extended-result-bg3d-camera-blocking"
          className="mt-3 space-y-3 text-xs [word-break:keep-all]"
        >
          <div className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-panel/70 p-3">
            <p className="font-semibold text-fg">{data.sceneSummary}</p>
            <CopyButton
              copyKey="bg3d-json"
              copiedKey={copiedKey}
              label={bt("3D 블로킹 JSON 복사", "Copy 3D JSON")}
              copiedLabel={copiedLabel}
              value={jsonCopy}
              onCopy={onCopy}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-panel/55 p-3 leading-5 tabular-nums">
              <strong className="text-fg">{bt("카메라 세팅", "Camera")}</strong>
              <p className="mt-1 text-fg-2">
                {data.camera.angleLabel} · {data.camera.lensMm}mm · FOV {data.camera.fovDeg}° · Roll{" "}
                {data.camera.rollDeg}°
              </p>
              <p className="mt-1 text-[0.7rem] text-fg-3">
                위치 [{data.camera.position.join(", ")}] → 타깃 [{data.camera.target.join(", ")}]
              </p>
            </div>
            <div className="rounded-xl border border-line bg-panel/55 p-3 leading-5 tabular-nums">
              <strong className="text-fg">{bt("조명 세팅", "Lighting")}</strong>
              <p className="mt-1 text-fg-2">
                {data.lighting.timeOfDay} · 키 라이트 {data.lighting.keyLightColor} · 환경광{" "}
                {Math.round(data.lighting.ambientRatio * 100)}%
              </p>
              <p className="mt-1 text-[0.7rem] text-fg-3">{data.lighting.rimLightNote}</p>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-panel/55 p-3 leading-5">
            <strong className="text-fg">{bt("배치 소품·블로킹 메모", "Props & blocking")}</strong>
            <p className="mt-1 text-fg-2">{data.propsToPlace.join(" · ")}</p>
            <ul className="mt-1.5 space-y-1 text-fg-3">
              {data.blockingNotes.map((note, idx) => (
                <li key={`block:${idx}`}>• {note}</li>
              ))}
            </ul>
          </div>
        </div>
      );
    }

    case "color-mood-director": {
      const { data } = result;
      return (
        <div
          data-testid="openai-extended-result-color-mood-director"
          className="mt-3 space-y-3 text-xs [word-break:keep-all]"
        >
          <div className="rounded-xl bg-panel/70 p-3 leading-5">
            <span className="inline-block rounded bg-accent/15 px-2 py-0.5 text-[0.65rem] font-extrabold text-accent">
              {data.emotionLabel}
            </span>
            <p className="mt-1 font-semibold text-fg">{data.moodSummary}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.palette.map((swatch, idx) => (
              <div
                key={`palette:${idx}`}
                className="flex items-start justify-between gap-2 rounded-xl border border-line bg-panel/55 p-3"
              >
                <div>
                  <strong className="text-fg">
                    {swatch.nameKo} ({swatch.role})
                  </strong>
                  <p className="mt-0.5 font-mono text-[0.68rem] text-accent">{swatch.oklch}</p>
                  <p className="mt-1 text-fg-2">{swatch.usageTip}</p>
                </div>
                <CopyButton
                  copyKey={`swatch:${idx}`}
                  copiedKey={copiedKey}
                  label={bt("복사", "Copy")}
                  copiedLabel={copiedLabel}
                  value={swatch.oklch}
                  onCopy={onCopy}
                />
              </div>
            ))}
          </div>
          <p className="rounded-xl border border-line bg-panel/55 p-3 text-fg-2">
            <strong className="text-fg">{bt("조명·대비 가이드:", "Lighting & contrast:")}</strong>{" "}
            {data.lightingGuide} · {data.contrastWarning}
          </p>
        </div>
      );
    }

    case "sfx-onomatopoeia-lab": {
      const { data } = result;
      return (
        <div
          data-testid="openai-extended-result-sfx-onomatopoeia-lab"
          className="mt-3 space-y-3 text-xs [word-break:keep-all]"
        >
          <p className="rounded-xl bg-panel/70 p-3 font-semibold text-fg">
            {bt("장면 에너지:", "Scene energy:")} {data.sceneEnergy}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.suggestions.map((sfx, idx) => (
              <article
                key={`sfx:${idx}`}
                className="flex flex-col justify-between rounded-xl border border-line bg-panel/55 p-3"
              >
                <div>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <strong className="text-sm font-black text-fg">{sfx.ko}</strong>
                    <span className="text-fg-2">{sfx.ja}</span>
                    <span className="font-semibold text-accent">{sfx.en}</span>
                  </div>
                  <p className="mt-1 text-fg-2">{sfx.intent}</p>
                  <p className="mt-1 text-[0.7rem] text-fg-3">
                    {sfx.typographyTip} · {sfx.placementHint}
                  </p>
                </div>
                <div className="mt-2">
                  <CopyButton
                    copyKey={`sfx:${idx}`}
                    copiedKey={copiedKey}
                    label={bt("효과음 복사", "Copy SFX")}
                    copiedLabel={copiedLabel}
                    value={`${sfx.ko} / ${sfx.ja} / ${sfx.en}`}
                    onCopy={onCopy}
                  />
                </div>
              </article>
            ))}
          </div>
        </div>
      );
    }

    case "photoshop-fx-recipe": {
      const { data } = result;
      return (
        <div
          data-testid="openai-extended-result-photoshop-fx-recipe"
          className="mt-3 space-y-3 text-xs [word-break:keep-all]"
        >
          <div className="rounded-xl bg-panel/70 p-3">
            <h4 className="text-sm font-black text-fg">{data.lookNameKo}</h4>
            <p className="mt-1 text-fg-2">{data.summary}</p>
          </div>
          <ul className="space-y-1.5">
            {data.layerStyles.map((style, idx) => (
              <li
                key={`fx:${idx}`}
                className="rounded-xl border border-line bg-panel/55 p-2.5 tabular-nums"
              >
                <strong className="text-fg">
                  {style.effect} · {style.blendMode} ({style.opacityPct}%)
                </strong>
                <p className="mt-0.5 text-fg-2">{style.paramsSummary}</p>
              </li>
            ))}
          </ul>
          <p className="rounded-xl border border-line bg-panel/55 p-3 text-fg-2 tabular-nums">
            <strong className="text-fg">Camera Raw:</strong> 노출 {data.cameraRaw.exposure}, 대비{" "}
            {data.cameraRaw.contrast}, 명료도 {data.cameraRaw.clarity}, 안개 제거{" "}
            {data.cameraRaw.dehaze}, 색온도 {data.cameraRaw.temperatureShift}, 입자{" "}
            {data.cameraRaw.grainPct}% — {data.nonDestructiveTip}
          </p>
        </div>
      );
    }

    case "scroll-pacing-auditor": {
      const { data } = result;
      return (
        <div
          data-testid="openai-extended-result-scroll-pacing-auditor"
          className="mt-3 space-y-3 text-xs [word-break:keep-all]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-panel/70 p-3 tabular-nums">
            <p className="font-semibold text-fg">{data.rhythmVerdict}</p>
            <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-extrabold text-accent">
              평균 여백 {data.averageGapPx}px · 엔딩 흡인력 {data.cliffhangerScore}/100
            </span>
          </div>
          <p className="rounded-xl border border-line bg-panel/55 p-3 text-fg-2">
            <strong className="text-fg">{bt("클리프행어 조언:", "Cliffhanger tip:")}</strong>{" "}
            {data.cliffhangerTip}
          </p>
          <ul className="space-y-1.5 tabular-nums">
            {data.beatPacing.map((beat, idx) => (
              <li key={`pace:${idx}`} className="rounded-xl border border-line bg-panel/55 p-2.5">
                <strong className="text-fg">
                  {beat.section} · {beat.pacing} · 권장 여백 {beat.recommendedGapPx}px
                </strong>
                <p className="mt-0.5 text-fg-2">{beat.readerRetentionNote}</p>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    case "thumbnail-hook-optimizer": {
      const { data } = result;
      return (
        <div
          data-testid="openai-extended-result-thumbnail-hook-optimizer"
          className="mt-3 space-y-3 text-xs [word-break:keep-all]"
        >
          <p className="rounded-xl bg-panel/70 p-3 font-semibold text-fg">{data.hookDiagnosis}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.titleVariants.map((variant, idx) => (
              <article
                key={`thumb:${idx}`}
                className="flex flex-col justify-between rounded-xl border border-line bg-panel/55 p-3"
              >
                <div>
                  <span className="inline-block rounded bg-accent/15 px-2 py-0.5 text-[0.65rem] font-extrabold text-accent">
                    {variant.variantLabel}
                  </span>
                  <h4 className="mt-1 text-sm font-black text-fg">{variant.title}</h4>
                  <p className="mt-0.5 text-fg-2">{variant.subCopy}</p>
                  <p className="mt-1 text-[0.7rem] text-fg-3">{variant.hookReason}</p>
                </div>
                <div className="mt-2">
                  <CopyButton
                    copyKey={`thumb:${idx}`}
                    copiedKey={copiedKey}
                    label={bt("제목 복사", "Copy title")}
                    copiedLabel={copiedLabel}
                    value={`${variant.title}\n${variant.subCopy}`}
                    onCopy={onCopy}
                  />
                </div>
              </article>
            ))}
          </div>
          <p className="rounded-xl border border-line bg-panel/55 p-3 text-fg-2 tabular-nums">
            <strong className="text-fg">{bt("썸네일 구도:", "Thumbnail spec:")}</strong>{" "}
            {data.thumbnailSpec.focalSubject} · {data.thumbnailSpec.contrastNote} · 최대{" "}
            {data.thumbnailSpec.textOverlayMaxChars}자 · {data.thumbnailSpec.cropSafetyTip}
          </p>
        </div>
      );
    }

    case "localization-glossary-check": {
      const { data } = result;
      return (
        <div
          data-testid="openai-extended-result-localization-glossary-check"
          className="mt-3 space-y-3 text-xs [word-break:keep-all]"
        >
          <p className="rounded-xl bg-panel/70 p-3 font-semibold text-fg">
            {bt("대상 로캘:", "Target locales:")} {data.targetLocales.join(", ")}
          </p>
          <div className="space-y-1.5">
            {data.glossary.map((entry, idx) => (
              <div
                key={`gloss:${idx}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel/55 p-2.5"
              >
                <div>
                  <strong className="text-fg">{entry.termKo}</strong> → EN: {entry.en} · JA:{" "}
                  {entry.ja}
                  <p className="mt-0.5 text-fg-3">{entry.ruleNote}</p>
                </div>
                <CopyButton
                  copyKey={`gloss:${idx}`}
                  copiedKey={copiedKey}
                  label={bt("용어 복사", "Copy term")}
                  copiedLabel={copiedLabel}
                  value={`${entry.termKo} | EN: ${entry.en} | JA: ${entry.ja}`}
                  onCopy={onCopy}
                />
              </div>
            ))}
          </div>
          <ul className="space-y-1.5">
            {data.culturalNotes.map((note, idx) => (
              <li
                key={`culture:${idx}`}
                className={cn(
                  "rounded-xl border px-3 py-2",
                  note.severity === "warn"
                    ? "border-warning/35 bg-warning-soft/15 text-fg"
                    : "border-line bg-panel/55 text-fg-2",
                )}
              >
                <strong>[{note.topic}]</strong> {note.adaptationTip}
              </li>
            ))}
          </ul>
        </div>
      );
    }

    case "mcp-workflow-macro": {
      const { data } = result;
      const macroJson = JSON.stringify(data.steps, null, 2);
      return (
        <div
          data-testid="openai-extended-result-mcp-workflow-macro"
          className="mt-3 space-y-3 text-xs [word-break:keep-all]"
        >
          <div className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-panel/70 p-3">
            <div>
              <h4 className="text-sm font-black text-fg">{data.macroTitle}</h4>
              <p className="mt-1 text-fg-2">{data.summary}</p>
            </div>
            <CopyButton
              copyKey="mcp-macro"
              copiedKey={copiedKey}
              label={bt("매크로 JSON 복사", "Copy macro JSON")}
              copiedLabel={copiedLabel}
              value={macroJson}
              onCopy={onCopy}
            />
          </div>
          <ol className="space-y-1.5 tabular-nums">
            {data.steps.map((step) => (
              <li
                key={`mcp:${step.stepOrder}:${step.toolName}`}
                className="rounded-xl border border-line bg-panel/55 p-2.5"
              >
                <strong className="text-fg">
                  {step.stepOrder}. {step.toolName}
                </strong>
                <p className="mt-0.5 text-fg-2">{step.reasonKo}</p>
                <code className="mt-1 block overflow-x-auto rounded bg-card px-2 py-1 text-[0.68rem] text-fg-3">
                  {step.argumentsJson}
                </code>
              </li>
            ))}
          </ol>
        </div>
      );
    }
  }
}
