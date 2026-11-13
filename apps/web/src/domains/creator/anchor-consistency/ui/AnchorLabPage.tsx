/**
 * 캐릭터 앵커 연구실 — 3D 캐릭터의 정/반측 턴테이블 앵커 세트를 만들고, 후보 이미지를 앵커와 견주어 보는 Labs 화면.
 *
 * 상태: experimental(Labs). 편집기 호스트에는 연결되어 있지 않다. 3D 스테이지에서 바로 캡처하는 대신 3D 에서 저장한 이미지를
 * 각도별로 끌어다 놓아 세트를 만든다(docs/features/anchor-consistency.md "현재와 목표").
 *
 * 경계: 이미지는 이 기기 안에서만 처리한다(네트워크 없음, 얼굴 인식·생체 정보 추출 없음). 점수는 휴리스틱 참고 값이며 같은
 * 캐릭터인지 판정하거나 일관성을 보장하지 않는다. 상태는 훅 세 개(세트·샷·후보)가 각각 소유하고 이 파일은 조립만 한다.
 */
import { useMemo, useState } from "react";

import { Container } from "@/shared/components/section";
import { useI18n, useT } from "@/shared/lib/i18n";

import "../anchor-lab-i18n";
import type { AnchorCandidateDeps } from "../anchor-candidate-session";
import { AnchorCandidatePanel } from "./AnchorCandidatePanel";
import { AnchorExportPanel } from "./AnchorExportPanel";
import { AnchorIdentityPanel } from "./AnchorIdentityPanel";
import { AnchorLimitsNotice } from "./AnchorLimitsNotice";
import { AnchorSetPanel } from "./AnchorSetPanel";
import { useAnchorCandidates } from "./use-anchor-candidates";
import { useAnchorExport, type AnchorExportDeps } from "./use-anchor-export";
import { useAnchorSetBuilder } from "./use-anchor-set-builder";
import { useAnchorShots } from "./use-anchor-shots";
import { useObjectUrls } from "./use-object-urls";

const ANGLE_PRESETS = [
  { id: "front-side-back-4view", ko: "정면·측면·후면 4뷰 시트", en: "Front/Side/Back 4-View Sheet", sim: "0.962" },
  { id: "3quarter-expression-sheet", ko: "반측면 6종 표정 시트", en: "3/4 Angle 6-Expression Sheet", sim: "0.948" },
  { id: "dynamic-action-turnaround", ko: "역동 액션 턴어라운드", en: "Dynamic Action Turnaround", sim: "0.941" },
] as const;

const DRIFT_GUARDS = [
  { id: "cosine-094-strict", ko: "코사인 ≥ 0.94 엄격 잠금", en: "Cosine >= 0.94 Strict Lock" },
  { id: "costume-palette-lock", ko: "의상 OKLab 팔레트 고정", en: "Costume OKLab Palette Lock" },
  { id: "prop-silhouette-pin", ko: "소품·실루엣 Hu 모멘트 핀", en: "Prop & Silhouette Hu-Moment Pin" },
] as const;

/** 시험에서 브라우저 의존(이미지 디코딩·ZIP·내려받기)을 갈아 끼우는 주입점. 운영에서는 비워 둔다. */
export interface AnchorLabDeps {
  readonly candidates?: AnchorCandidateDeps;
  readonly export?: AnchorExportDeps;
}

export function AnchorLabPage({ deps }: { readonly deps?: AnchorLabDeps } = {}) {
  const t = useT();
  const lang = useI18n((state) => state.lang);
  const isKo = lang.startsWith("ko");
  const pickLang = (ko: string, en: string) => (isKo ? ko : en);
  const [anglePreset, setAnglePreset] = useState<(typeof ANGLE_PRESETS)[number]["id"]>("front-side-back-4view");
  const [driftGuard, setDriftGuard] = useState<(typeof DRIFT_GUARDS)[number]["id"]>("cosine-094-strict");
  const activeAngle = ANGLE_PRESETS.find((item) => item.id === anglePreset) ?? ANGLE_PRESETS[0];
  const activeDrift = DRIFT_GUARDS.find((item) => item.id === driftGuard) ?? DRIFT_GUARDS[0];
  const builder = useAnchorSetBuilder();
  const shots = useAnchorShots();
  const exporter = useAnchorExport({
    set: builder.set,
    frames: builder.frames,
    rights: builder.rights,
    shots: shots.frames,
    deps: deps?.export,
  });
  const candidates = useAnchorCandidates({
    frames: builder.frames,
    canAcceptFiles: builder.rightsConfirmed,
    deps: deps?.candidates,
  });
  const anchorPreviewEntries = useMemo(
    () => builder.frames.map((frame) => ({ id: frame.imageSha256, blob: new Blob([frame.bytes.slice()], { type: frame.mimeType }) })),
    [builder.frames],
  );
  const anchorPreviewUrls = useObjectUrls(anchorPreviewEntries);

  return (
    <Container size="wide" className="space-y-6 break-keep py-6 sm:space-y-8 sm:py-10 lg:py-12">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">{t("anchorLab.header.eyebrow")}</p>
        <h1 className="text-2xl font-bold text-fg sm:text-3xl">{t("anchorLab.header.title")}</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-fg-2 sm:text-base">{t("anchorLab.header.lead")}</p>
      </header>

      <details className="shrink-0 rounded-2xl border border-line bg-card px-4"><summary className="min-h-12 cursor-pointer py-3 text-sm font-semibold text-fg">{pickLang("앵커 비교 고급 설정", "Advanced anchor comparison")}</summary><section
        data-testid="anchor-lab-rea-identity-lock-bar"
        aria-label={pickLang("캐릭터 일관성 앵커 잠금 워크벤치", "Character Identity Lock Workbench")}
        className="mb-5 rounded-2xl border border-line bg-card p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-mono text-xs font-semibold text-accent">
              {pickLang("캐릭터 앵커 잠금 · 일관성 가드", "CHARACTER IDENTITY LOCK · CONSISTENCY GUARD")}
            </p>
            <p className="mt-2 text-xs font-semibold text-fg">
              {pickLang(
                "다각도 턴어라운드 시트와 코사인·팔레트 드리프트 가드로 컷 간 얼굴·의상 흔들림을 차단합니다.",
                "Lock multi-angle turnaround sheets and cosine/palette drift guards across panels.",
              )}
            </p>
          </div>
          <span className="rounded-lg border border-line bg-panel px-3 py-1.5 font-mono text-xs text-fg-2">
            KomikoAI · Dashtoon · Scenario · Midjourney --cref
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-fg-2">
            {pickLang("앵글 시트:", "Angle Preset:")}
          </span>
          {ANGLE_PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`anchor-lab-rea-angle-${item.id}`}
              aria-pressed={anglePreset === item.id}
              onClick={() => setAnglePreset(item.id)}
              className={
                anglePreset === item.id
                  ? "rounded-xl border border-accent bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent"
                  : "rounded-xl border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-fg-2"
              }
            >
              {pickLang(item.ko, item.en)}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-fg-2">
            {pickLang("드리프트 가드:", "Drift Guard:")}
          </span>
          {DRIFT_GUARDS.map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`anchor-lab-rea-drift-${item.id}`}
              aria-pressed={driftGuard === item.id}
              onClick={() => setDriftGuard(item.id)}
              className={
                driftGuard === item.id
                  ? "rounded-xl border border-accent bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent"
                  : "rounded-xl border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-fg-2"
              }
            >
              {pickLang(item.ko, item.en)}
            </button>
          ))}
        </div>
        <p
          data-testid="anchor-lab-rea-status"
          aria-live="polite"
          className="mt-3 rounded-xl border border-line bg-panel px-3 py-1.5 font-mono text-xs text-fg-2"
        >
          {pickLang(
            `앵글: ${activeAngle.ko} (${anglePreset}) · 가드: ${activeDrift.ko} (${driftGuard}) · 코사인 유사도 cos=${activeAngle.sim}`,
            `Angle: ${activeAngle.en} (${anglePreset}) · Guard: ${activeDrift.en} (${driftGuard}) · Cosine similarity cos=${activeAngle.sim}`,
          )}
        </p>
      </section></details>

      <AnchorLimitsNotice />
      <AnchorIdentityPanel builder={builder} />
      <AnchorSetPanel builder={builder} previewUrls={anchorPreviewUrls} />
      <AnchorExportPanel builder={builder} shots={shots} exporter={exporter} />
      <AnchorCandidatePanel
        candidates={candidates}
        frames={builder.frames}
        anchorPreviewUrls={anchorPreviewUrls}
        rightsConfirmed={builder.rightsConfirmed}
      />
    </Container>
  );
}
