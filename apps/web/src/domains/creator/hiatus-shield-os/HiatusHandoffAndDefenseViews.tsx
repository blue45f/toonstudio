import {
  Camera,
  CheckCircle2,
  ClipboardCopy,
  FileCode2,
  ListChecks,
  Paintbrush,
  Scissors,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { useState } from "react";

import {
  STAGE_LABELS,
  formatHandoffKitChecklistText,
  serializeHandoffKitToJson,
  type ActiveCutSlice,
  type DefenseScenarioCode,
  type EmergencyDefensePlanReport,
  type MicroSliceSplitResult,
  type StyleLockHandoffKit,
} from "./hiatus-delay-prevention-engine";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export interface StyleLockHandoffKitCardProps {
  readonly kit: StyleLockHandoffKit | null;
  readonly onToggleForbiddenRule: (itemId: string) => void;
  readonly onCopyText: (payload: string, labelKo: string, labelEn: string) => void;
}

export function StyleLockHandoffKitCard({
  kit,
  onToggleForbiddenRule,
  onCopyText,
}: StyleLockHandoffKitCardProps) {
  const bt = useBilingual("HiatusHandoffKitCard");
  const [previewMode, setPreviewMode] = useState<"checklist" | "json">("checklist");

  if (!kit) {
    return (
      <section className="hshield-card" data-testid="hshield-handoff-empty">
        <p className="text-xs text-fg-2">
          {bt("아직 생성된 10분 작화 인계 키트가 없습니다.", "No 10-minute Style-Lock Handoff Kit generated yet.")}
        </p>
      </section>
    );
  }

  const checkedCount = kit.forbiddenChecklist.filter((r) => r.checked).length;
  const serializedPayload =
    previewMode === "json"
      ? serializeHandoffKitToJson(kit)
      : formatHandoffKitChecklistText(kit);

  return (
    <section
      className="hshield-card space-y-4"
      data-testid="hshield-handoff-kit"
      aria-label={bt("10분 작화 통일 인계 키트", "10-Minute Style-Lock Continuity Handoff Kit")}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Paintbrush className="size-4 text-accent shrink-0" aria-hidden="true" />
            <h3 className="text-sm font-bold text-fg">
              {bt("3. 10분 작화 통일 인계 키트 (Style-Lock Kit)", "3. 10-Min Style-Lock Handoff Kit")}
            </h3>
            <span
              className="hshield-badge"
              data-tier={kit.validation.valid ? "green" : "red"}
              data-testid="hshield-kit-validation"
            >
              <span className="hshield-dot" aria-hidden="true" />
              {kit.validation.valid
                ? bt(`5대 항목 ${kit.validation.completenessPct}% 완비`, `5/5 Sections Valid (${kit.validation.completenessPct}%)`)
                : bt(`누락 항목: ${kit.validation.missingSections.join(", ")}`, `Missing: ${kit.validation.missingSections.join(", ")}`)}
            </span>
          </div>
          <p className="text-xs text-fg-2">
            {bt(
              `대상: ${kit.targetArtistName} · ${kit.cutRange.startCut}~${kit.cutRange.endCut}컷 (${STAGE_LABELS[kit.stage].ko}) · 투입 목표 ${kit.onboardingBudgetMinutes}분`,
              `Target: ${kit.targetArtistName} · Cuts ${kit.cutRange.startCut}-${kit.cutRange.endCut} (${STAGE_LABELS[kit.stage].en}) · ${kit.onboardingBudgetMinutes}m onboarding`,
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="hshield-btn"
            aria-pressed={previewMode === "checklist"}
            onClick={() => setPreviewMode("checklist")}
          >
            <ListChecks className="size-4" aria-hidden="true" />
            {bt("체크리스트 보기", "Checklist View")}
          </button>
          <button
            type="button"
            className="hshield-btn"
            aria-pressed={previewMode === "json"}
            onClick={() => setPreviewMode("json")}
          >
            <FileCode2 className="size-4" aria-hidden="true" />
            {bt("JSON 패키지 보기", "JSON Package")}
          </button>
          <button
            type="button"
            className="hshield-btn"
            data-variant="good"
            onClick={() =>
              onCopyText(
                serializedPayload,
                previewMode === "json" ? "인계 키트 JSON을 복사했습니다." : "10분 인계 체크리스트를 복사했습니다.",
                previewMode === "json" ? "Copied Handoff Kit JSON." : "Copied 10-min handoff checklist.",
              )
            }
          >
            <ClipboardCopy className="size-4" aria-hidden="true" />
            {bt("인계 키트 복사", "Copy Handoff Kit")}
          </button>
        </div>
      </div>

      {/* 팔레트 + 브러시 선폭 규격 */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="hshield-subcard space-y-2">
          <h4 className="text-xs font-bold text-fg">
            {bt("아트 바이블 OKLCH 대표 팔레트", "Art Bible OKLCH Palette")}
          </h4>
          <ul className="space-y-1.5">
            {kit.artBiblePalette.map((chip) => (
              <li key={chip.chipId} className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="hshield-swatch"
                    style={{ backgroundColor: chip.cssOklch }}
                    aria-hidden="true"
                  />
                  <span className="font-medium text-fg truncate">{bt(chip.roleKo, chip.roleEn)}</span>
                </div>
                <span className="hshield-num text-fg-2 shrink-0">
                  {chip.cssOklch} · ΔE≤{chip.maxAllowedDeltaE}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="hshield-subcard space-y-2">
          <h4 className="text-xs font-bold text-fg">
            {bt("브러시·펜 선 굵기 규격 (px)", "Brush & Stroke Width Spec (px)")}
          </h4>
          <ul className="space-y-1.5">
            {kit.brushLineSpecs.map((spec) => (
              <li key={spec.specId} className="rounded-lg border border-line bg-canvas p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-fg">{bt(spec.purposeKo, spec.purposeEn)}</span>
                  <span className="hshield-badge" data-tier="accent">
                    {spec.targetPx}px ({spec.minPx}~{spec.maxPx})
                  </span>
                </div>
                <p className="mt-0.5 text-fg-2">
                  {spec.brushName} · {spec.pressureCurve}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 직전 2컷 레퍼런스 + 3D 배경 카메라 프리셋 */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="hshield-subcard space-y-2">
          <h4 className="text-xs font-bold text-fg">
            {bt("직전 2컷 연속성 레퍼런스", "Previous 2-Cut Continuity Refs")}
          </h4>
          <ul className="space-y-1.5">
            {kit.previousTwoCuts.map((ref) => (
              <li key={ref.checksumRef} className="rounded-lg border border-line bg-canvas p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-fg hshield-num">
                    {bt(`컷 #${ref.cutIndex}`, `Cut #${ref.cutIndex}`)}
                  </span>
                  <span className="flex items-center gap-1.5 text-fg-2">
                    <span
                      className="hshield-swatch"
                      style={{ backgroundColor: ref.lightingCssOklch, width: "1rem", height: "1rem" }}
                      aria-hidden="true"
                    />
                    <code className="hshield-num">{ref.checksumRef}</code>
                  </span>
                </div>
                <p className="mt-1 text-fg">{bt(ref.shotNoteKo, ref.shotNoteEn)}</p>
                <p className="mt-0.5 text-fg-2">{bt(ref.continuityNoteKo, ref.continuityNoteEn)}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="hshield-subcard space-y-2">
          <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
            <Camera className="size-3.5 text-accent" aria-hidden="true" />
            {bt("3D 배경 카메라 프리셋", "3D Background Camera Presets")}
          </h4>
          <ul className="space-y-1.5">
            {kit.bg3dCameraPresets.map((cam) => (
              <li key={cam.presetId} className="rounded-lg border border-line bg-canvas p-2 text-xs">
                <p className="font-semibold text-fg">{bt(cam.sceneNameKo, cam.sceneNameEn)}</p>
                <p className="mt-0.5 text-fg-2 hshield-num">
                  {cam.focalLengthMm}mm · FOV {cam.fovDeg}° · {bt("수평선", "Horizon")}{" "}
                  {Math.round(cam.horizonRatio * 100)}% · Pitch {cam.pitchDeg}° / Yaw {cam.yawDeg}°
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 금지 표현 체크리스트 */}
      <div className="hshield-subcard space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-fg">
            {bt("금지 표현·품질 사수 체크리스트", "Forbidden Drift & QA Checklist")}
          </h4>
          <span className="text-xs font-semibold text-fg-2 hshield-num" data-testid="hshield-checklist-progress">
            {checkedCount}/{kit.forbiddenChecklist.length} {bt("확인 완료", "checked")}
          </span>
        </div>
        <div className="space-y-1.5">
          {kit.forbiddenChecklist.map((rule) => (
            <label key={rule.itemId} className="hshield-check-item">
              <input
                type="checkbox"
                className="hshield-check-input"
                checked={rule.checked}
                onChange={() => onToggleForbiddenRule(rule.itemId)}
              />
              <span className="flex-1 text-xs text-fg">
                <span
                  className="hshield-badge mr-1.5"
                  data-tier={rule.severity === "blocker" ? "red" : "amber"}
                >
                  {rule.severity === "blocker" ? bt("필수 차단", "Blocker") : bt("주의", "Warn")}
                </span>
                {bt(rule.ruleKo, rule.ruleEn)}
              </span>
            </label>
          ))}
        </div>
      </div>

      <pre className="hshield-pre" data-testid="hshield-kit-preview">
        {serializedPayload}
      </pre>
    </section>
  );
}

export interface MicroSliceAndDefenseCardProps {
  readonly bottleneckSlice: ActiveCutSlice | null;
  readonly microSplitResult: MicroSliceSplitResult | null;
  readonly defenseReport: EmergencyDefensePlanReport;
  readonly selectedDefenseCode: DefenseScenarioCode;
  readonly onSplitBottleneck: (sliceId: string) => void;
  readonly onSelectDefense: (code: DefenseScenarioCode) => void;
  readonly onCopyText: (payload: string, labelKo: string, labelEn: string) => void;
}

export function MicroSliceAndDefenseCard({
  bottleneckSlice,
  microSplitResult,
  defenseReport,
  selectedDefenseCode,
  onSplitBottleneck,
  onSelectDefense,
  onCopyText,
}: MicroSliceAndDefenseCardProps) {
  const bt = useBilingual("HiatusMicroAndDefenseCard");
  const activeScenario =
    defenseReport.scenarios.find((s) => s.code === selectedDefenseCode) ??
    defenseReport.scenarios[0];

  return (
    <div className="space-y-4">
      {/* 4. 스마트 마이크로 슬라이스 자동 분할 */}
      <section
        className="hshield-card space-y-3"
        data-testid="hshield-micro-split-section"
        aria-label={bt("스마트 마이크로 슬라이스 자동 분할", "Smart Micro-Slice Auto Split")}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
              <Scissors className="size-4 text-accent shrink-0" aria-hidden="true" />
              {bt("4. 병목 슬라이스 3인 병렬 마이크로 분할", "4. Bottleneck 3-Way Parallel Micro-Slice")}
            </h3>
            <p className="mt-0.5 text-xs text-fg-2">
              {bottleneckSlice
                ? bt(
                    `현재 병목: ${bottleneckSlice.sliceId} (${bottleneckSlice.startCut}~${bottleneckSlice.endCut}컷 · 총 ${bottleneckSlice.endCut - bottleneckSlice.startCut + 1}컷) → 잔여 팀원+대타 3인(8/8/9컷) 무중복 분할`,
                    `Bottleneck: ${bottleneckSlice.sliceId} (cuts ${bottleneckSlice.startCut}-${bottleneckSlice.endCut}, ${bottleneckSlice.endCut - bottleneckSlice.startCut + 1} cuts) → 3-way lossless split`,
                  )
                : bt("모든 병목 슬라이스가 분할·배정 완료되었습니다.", "All bottleneck slices have been split and assigned.")}
            </p>
          </div>
          {bottleneckSlice ? (
            <button
              type="button"
              className="hshield-btn"
              data-variant="warn"
              data-testid="hshield-micro-split-btn"
              onClick={() => onSplitBottleneck(bottleneckSlice.sliceId)}
            >
              <Scissors className="size-4" aria-hidden="true" />
              {bt("25컷 → 8/8/9 병렬 분할 실행", "Split 25 Cuts → 8/8/9")}
            </button>
          ) : null}
        </div>

        {microSplitResult && microSplitResult.ok ? (
          <div className="space-y-2.5" data-testid="hshield-micro-split-result">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="hshield-badge" data-tier="green">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                {bt(
                  `합계 ${microSplitResult.integrityCheck.totalSplitCuts}/${microSplitResult.integrityCheck.totalOriginalCuts}컷 보존 · 중복 ${microSplitResult.integrityCheck.overlapCount} · 누락 ${microSplitResult.integrityCheck.gapCount}`,
                  `${microSplitResult.integrityCheck.totalSplitCuts}/${microSplitResult.integrityCheck.totalOriginalCuts} cuts preserved · 0 overlaps · 0 gaps`,
                )}
              </span>
              <span className="hshield-badge" data-tier="accent">
                {bt(
                  `단독 ${microSplitResult.singleWorkerHours}h → 병렬 ${microSplitResult.parallelCompletionHours}h (${microSplitResult.parallelSpeedupFactor}배 단축)`,
                  `Solo ${microSplitResult.singleWorkerHours}h → Parallel ${microSplitResult.parallelCompletionHours}h (${microSplitResult.parallelSpeedupFactor}x faster)`,
                )}
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {microSplitResult.microSlices.map((ms) => (
                <div key={ms.microSliceId} className="hshield-subcard space-y-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-fg hshield-num">
                      {ms.startCut}~{ms.endCut}컷 ({ms.cutCount}컷)
                    </span>
                    <span className="hshield-badge" data-tier="green">
                      {ms.estimatedHours}h
                    </span>
                  </div>
                  <p className="font-semibold text-fg">{ms.assigneeName}</p>
                  <p className="text-fg-2">{bt(ms.roleTagKo, ms.roleTagEn)}</p>
                  <p className="text-fg-3 hshield-num">
                    {bt(
                      `연결 컨텍스트: 앞 #${ms.previousCutContextIndex ?? "-"} / 뒤 #${ms.nextCutContextIndex ?? "-"}`,
                      `Context: prev #${ms.previousCutContextIndex ?? "-"} / next #${ms.nextCutContextIndex ?? "-"}`,
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* 5. 마감 18시간 이내 3단계 비상 연재 방어 플랜 */}
      <section
        className="hshield-card space-y-3"
        data-testid="hshield-defense-section"
        aria-label={bt("3단계 비상 연재 방어 시나리오", "3-Tier Emergency Publication Defense Plan")}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
              <Siren className="size-4 text-bad shrink-0" aria-hidden="true" />
              {bt("5. 3단계 비상 연재 방어 시나리오 (무단 휴재 0%)", "5. 3-Tier Emergency Defense Plan (0% Silent Hiatus)")}
            </h3>
            <p className="mt-0.5 text-xs text-fg-2">
              {defenseReport.isExtremeCrisis
                ? bt(
                    `마감 ${defenseReport.hoursUntilDeadline}시간 남음(18시간 임계선 진입) — 즉시 방어 시나리오 ${defenseReport.recommendedCode}안을 권장합니다.`,
                    `${defenseReport.hoursUntilDeadline}h until deadline (<= 18h extreme crisis) — Plan ${defenseReport.recommendedCode} recommended.`,
                  )
                : bt(
                    `마감 ${defenseReport.hoursUntilDeadline}시간 남음 — 현재 추천안은 ${defenseReport.recommendedCode}안입니다.`,
                    `${defenseReport.hoursUntilDeadline}h until deadline — Plan ${defenseReport.recommendedCode} recommended.`,
                  )}
            </p>
          </div>
          <span
            className="hshield-badge"
            data-tier={defenseReport.isExtremeCrisis ? "red" : "green"}
            data-testid="hshield-crisis-badge"
          >
            <span className="hshield-dot" aria-hidden="true" />
            {defenseReport.isExtremeCrisis
              ? bt("극한 위기 (<=18h)", "Extreme Crisis (<=18h)")
              : bt("방어 플랜 대기", "Defense Standby")}
          </span>
        </div>

        <div className="grid gap-2.5 lg:grid-cols-3" role="radiogroup" aria-label={bt("비상 방어 시나리오 선택", "Choose emergency defense plan")}>
          {defenseReport.scenarios.map((scenario) => {
            const isSelected = scenario.code === selectedDefenseCode;
            return (
              <button
                key={scenario.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                data-selected={isSelected ? "true" : "false"}
                data-testid={`hshield-defense-card-${scenario.code}`}
                className="hshield-scenario-card"
                onClick={() => onSelectDefense(scenario.code)}
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="hshield-badge" data-tier={scenario.recommended ? "green" : "accent"}>
                    {bt(scenario.badgeKo, scenario.badgeEn)}
                  </span>
                  {scenario.recommended ? (
                    <span className="hshield-badge" data-tier="green">
                      <ShieldCheck className="size-3" aria-hidden="true" />
                      {bt("자동 추천", "Recommended")}
                    </span>
                  ) : null}
                </div>
                <p className="text-xs font-bold text-fg">{bt(scenario.titleKo, scenario.titleEn)}</p>
                <p className="text-xs text-fg-2 hshield-num">
                  {bt(
                    `본편 ${scenario.mainCutsCount}컷${scenario.bonusCutsCount > 0 ? ` + 특별 ${scenario.bonusCutsCount}컷` : ""}${scenario.partTwoDeferredCuts > 0 ? ` · 하편 ${scenario.partTwoDeferredCuts}컷` : ""} · 예상 ${scenario.projectedCompletionHours}h`,
                    `Main ${scenario.mainCutsCount}${scenario.bonusCutsCount > 0 ? ` + Bonus ${scenario.bonusCutsCount}` : ""}${scenario.partTwoDeferredCuts > 0 ? ` · Pt.2 ${scenario.partTwoDeferredCuts}` : ""} · Est ${scenario.projectedCompletionHours}h`,
                  )}
                </p>
                <ul className="space-y-1 text-xs text-fg-2">
                  {scenario.actionStepsKo.map((stepKo, idx) => (
                    <li key={`${scenario.id}-step-${idx}`}>
                      · {bt(stepKo, scenario.actionStepsEn[idx] ?? stepKo)}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {activeScenario ? (
          <div className="hshield-subcard space-y-2" data-testid="hshield-reader-notice-box">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-fg">
                {bt(
                  `선택된 ${activeScenario.code}안 · 독자 사전 공지 초안 (신뢰도 지수 ${activeScenario.readerTrustScore}/100)`,
                  `Selected Plan ${activeScenario.code} · Reader Notice Draft (Trust ${activeScenario.readerTrustScore}/100)`,
                )}
              </span>
              <button
                type="button"
                className="hshield-btn"
                onClick={() =>
                  onCopyText(
                    bt(activeScenario.readerNoticeDraftKo, activeScenario.readerNoticeDraftEn),
                    `${activeScenario.code}안 독자 공지 초안을 복사했습니다.`,
                    `Copied Plan ${activeScenario.code} reader notice draft.`,
                  )
                }
              >
                <ClipboardCopy className="size-4" aria-hidden="true" />
                {bt("공지 초안 복사", "Copy Notice Draft")}
              </button>
            </div>
            <pre className="hshield-pre" data-testid="hshield-reader-notice-text">
              {bt(activeScenario.readerNoticeDraftKo, activeScenario.readerNoticeDraftEn)}
            </pre>
          </div>
        ) : null}
      </section>
    </div>
  );
}
