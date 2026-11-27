/**
 * `/studio/poser` — 포즈 스튜디오 풀뷰포트 진입점.
 *
 * 실제 포저(`StudioMannequinPoserPanel`, 매직 포저 탭 포함) 및 체형·의상 정밀 워크벤치
 * (`StudioAsset3dInspectorWorkbench`, 25축 웹툰 세계관 셰이퍼·리깅·모션 IK·비교기)를
 * 풀뷰포트(`w-full`)로 직접 마운트한다.
 *
 * - 닫기 → `/studio`로 복귀.
 * - 기본 캡처 액션(`2D 컷 레이어 삽입`) → 세션 삽입 대기열에 포즈 레이어를 기록하고 원고 컷으로 연계한다.
 * - 보조 캡처 모드(`PNG 저장`) → 다운로드 폴더로 PNG를 내려받는다.
 * - `?starter=` 쿼리(예: `action-pose-rig`)는 데생 인형·웹툰 포즈 프리셋에서 찾아
 *   패널이 열릴 때 자동으로 적용한다. 알 수 없는 id는 무시하고 빈 포저를 연다.
 */

import { ArrowLeft, Download, Layers } from "lucide-react";
import { useCallback, useRef, useState, type ReactElement } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { StudioPageIntro } from "../page-intro/StudioPageIntro";

import {
  StudioMannequinPoserPanel,
  type StudioMannequinCaptureResult, type StudioMannequinApplyBody,
} from "./StudioMannequinPoserPanel";
import { StudioAsset3dInspectorWorkbench } from "./StudioAsset3dInspectorWorkbench";

import { getAuthUserId } from "@/domains/auth/public/session/auth-session-state";
import { LEGACY_POSER_CUT_KEY, readLegacyPoserCut, stagePoserCut } from "../studio-cuttoon-editor/studio-poser-cut-handoff";
import { useStudioPoserCutDestination } from "./useStudioPoserCutDestination";
import { useI18n } from "@/shared/lib/i18n";
import { toast } from "@/shared/lib/toast-store";

const CAMERA_LENSES = [
  { id: "manga-18mm-foreshorten", shortKo: "18mm", shortEn: "18mm", ko: "만화 18mm 과장 투시", en: "Manga 18mm foreshortening", fovDeg: 64 },
  { id: "standard-35mm-dialogue", shortKo: "35mm", shortEn: "35mm", ko: "표준 35mm 대화 샷", en: "Standard 35mm dialogue shot", fovDeg: 42 },
  { id: "tele-85mm-portrait", shortKo: "85mm", shortEn: "85mm", ko: "망원 85mm 인물 압축", en: "Telephoto 85mm portrait", fovDeg: 22 },
] as const;

const JOINT_SOLVERS = [
  { id: "com-gravity-balance", shortKo: "무게중심", shortEn: "Balance", ko: "무게중심 자동 균형", en: "Center-of-mass gravity balance" },
  { id: "clavicle-auto-twist", shortKo: "쇄골 연동", shortEn: "Clavicle", ko: "쇄골·어깨 자동 연동 회전", en: "Clavicle auto-twist balance" },
  { id: "hand-grip-preset", shortKo: "손 파지", shortEn: "Hand grip", ko: "손가락 파지 프리셋", en: "Hand grip preset" },
] as const;

export function StudioPoserPage(): ReactElement {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const lang = useI18n((state) => state.lang);
  const isKo = lang.startsWith("ko");
  const pickLang = (ko: string, en: string) => (isKo ? ko : en);
  const [cameraLens, setCameraLens] = useState<(typeof CAMERA_LENSES)[number]["id"]>("manga-18mm-foreshorten");
  const [jointSolver, setJointSolver] = useState<(typeof JOINT_SOLVERS)[number]["id"]>("com-gravity-balance");
  const [captureMode, setCaptureMode] = useState<"canvas" | "download">("canvas");
  const [cameraRequest, setCameraRequest] = useState<{ readonly fovDeg: number; readonly nonce: number }>({
    fovDeg: CAMERA_LENSES[0].fovDeg,
    nonce: 0,
  });
  const [solverRequest, setSolverRequest] = useState<{
    readonly solverId: (typeof JOINT_SOLVERS)[number]["id"];
    readonly nonce: number;
  }>({
    solverId: JOINT_SOLVERS[0].id,
    nonce: 0,
  });
  const activeLens = CAMERA_LENSES.find((item) => item.id === cameraLens) ?? CAMERA_LENSES[0];
  const activeSolver = JOINT_SOLVERS.find((item) => item.id === jointSolver) ?? JOINT_SOLVERS[0];
  const starterPresetId = searchParams.get("starter")?.trim() || undefined;
  const [workbenchOpen, setWorkbenchOpen] = useState<boolean>(false);
  const applyBodyRef = useRef<StudioMannequinApplyBody>(null);

  const destination = useStudioPoserCutDestination(searchParams, isKo);
  const preparedHref = useRef<string | null>(null);
  const [legacy, setLegacy] = useState(() => {
    try { return readLegacyPoserCut(window.sessionStorage); } catch { return null; }
  });
  const prepareCut = useCallback((raster: StudioMannequinCaptureResult) => {
    if (!destination.href) throw new Error(isKo ? "삽입할 원고를 선택해 주세요." : "Select a destination manuscript.");
    try {
      return stagePoserCut(destination.href, getAuthUserId(), raster);
    } catch (cause) {
      throw new Error(isKo ? "포즈 컷을 보관하지 못했습니다. 저장 공간을 확보한 뒤 다시 시도하거나 PNG로 저장해 주세요."
        : "Could not store the pose. Free up storage and retry, or save it as a PNG.", { cause });
    }
  }, [destination.href, isKo]);
  const handleClose = useCallback(() => {
    navigate(preparedHref.current ?? "/studio", { replace: true });
  }, [navigate]);

  const handleInsert = useCallback(
    (result: StudioMannequinCaptureResult): boolean => {
      if (captureMode === "download") {
        const anchor = document.createElement("a");
        anchor.href = result.pngDataUrl;
        anchor.download = `toonstudio-pose-${Date.now()}.png`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        toast("포즈 PNG를 저장했어요 · 다운로드 폴더", { tone: "success", durationMs: 4_000 });
        return true;
      }
      preparedHref.current = prepareCut(result);
      return true;
    },
    [captureMode, prepareCut],
  );

  return (
    <div className="flex min-h-dvh w-full flex-col bg-canvas text-fg">
      {/* 독립 페이지라 문서 제목(h1)이 필요하다 — 패널 제목은 섹션용 h2라 별도로 둔다. */}
      <h1 className="sr-only">포즈 스튜디오</h1>
      <div className="flex w-full flex-1 flex-col gap-1.5 px-2.5 py-2 sm:px-3">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="studio-poser-page-return-studio"
              onClick={handleClose}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors hover:border-accent"
            >
              <ArrowLeft size={14} aria-hidden />
              <span>{pickLang("2D 원고 스튜디오로 복귀", "Return to 2D Studio")}</span>
            </button>
            <StudioPageIntro motif="pose" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {captureMode === "canvas" && destination.selector}
            {captureMode === "canvas" && legacy && <button type="button" className="min-h-10 rounded-md border border-line px-2 text-xs" onClick={() => {
              try {
                const href = prepareCut(legacy);
                window.sessionStorage.removeItem(LEGACY_POSER_CUT_KEY);
                setLegacy(null);
                void navigate(href, { replace: true });
              } catch (cause) { toast(cause instanceof Error ? cause.message : pickLang("포즈 복구 실패", "Pose recovery failed"), { tone: "error" }); }
            }}>{pickLang("이전 포즈 컷 복구", "Recover previous pose")}</button>}
            <div
              role="group"
              aria-label={pickLang("포즈 캡처 출력 방식", "Pose capture output mode")}
              className="inline-flex items-center rounded-lg border border-line bg-panel p-0.5"
            >
              <button
                type="button"
                data-testid="studio-poser-capture-mode-canvas"
                aria-pressed={captureMode === "canvas"}
                onClick={() => setCaptureMode("canvas")}
                className={
                  captureMode === "canvas"
                    ? "inline-flex min-h-10 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-semibold text-on-accent transition-colors [word-break:keep-all]"
                    : "inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-fg-2 transition-colors hover:text-fg [word-break:keep-all]"
                }
              >
                <Layers size={14} aria-hidden />
                <span>{pickLang("2D 컷 레이어 삽입", "Insert as 2D cut layer")}</span>
              </button>
              <button
                type="button"
                data-testid="studio-poser-capture-mode-download"
                aria-pressed={captureMode === "download"}
                onClick={() => setCaptureMode("download")}
                className={
                  captureMode === "download"
                    ? "inline-flex min-h-10 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-semibold text-on-accent transition-colors [word-break:keep-all]"
                    : "inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-fg-2 transition-colors hover:text-fg [word-break:keep-all]"
                }
              >
                <Download size={14} aria-hidden />
                <span>{pickLang("PNG 저장", "Save PNG")}</span>
              </button>
            </div>
            <button
              type="button"
              data-testid="studio-poser-varco3d-workbench-toggle"
              aria-expanded={workbenchOpen}
              onClick={() => setWorkbenchOpen((prev) => !prev)}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors hover:border-accent [word-break:keep-all]"
            >
              <span>
                {workbenchOpen
                  ? pickLang("체형·의상 정밀 워크벤치 닫기", "Close body & outfit workbench")
                  : pickLang("체형·의상 정밀 워크벤치", "Body & outfit workbench")}
              </span>
              <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-medium leading-none tabular-nums text-accent">
                {pickLang("에셋 140종 · 리깅 66종", "140 assets · 66 rigged")}
              </span>
            </button>
          </div>
        </header>

        {workbenchOpen ? (
          <aside
            aria-label={pickLang("체형·의상 정밀 워크벤치 및 세계관 셰이퍼 도크", "Body & outfit workbench and shaper dock")}
            data-testid="studio-poser-varco3d-workbench-dock"
            className="w-full"
          >
            <StudioAsset3dInspectorWorkbench
              onApplyMannequinBodySliders={async (sliders, options) => {
                const saved = await applyBodyRef.current?.({
                  heightCm: sliders.heightCm,
                  headCount: sliders.headCount,
                  build: sliders.build,
                  shoulderWidth: sliders.shoulderWidth,
                  pelvisWidth: sliders.hipWidth,
                }, options?.posePresetId);
                if (!saved) {
                  toast(pickLang("체형을 저장하지 못했습니다. 포저의 저장 상태를 확인해 주세요.", "Could not save the body. Check the poser’s storage status."), { tone: "error" });
                  return;
                }
                const detailSuffix = options?.archetypeLabelKo
                  ? ` · ${options.archetypeLabelKo}${options.motionLabelKo ? ` (${options.motionLabelKo})` : ""}`
                  : "";
                toast(
                  `세계관 체형 비율 적용됨 (${sliders.headCount.toFixed(1)}등신 · ${Math.round(sliders.heightCm)}cm)${detailSuffix}`,
                  { tone: "success", durationMs: 3_000 },
                );
              }}
            />
          </aside>
        ) : null}

        <div className="relative flex min-h-0 flex-1 flex-col gap-2">
          <div className="min-h-0 flex-1">
            <StudioMannequinPoserPanel
              open
              presentation="page"
              onClose={handleClose}
              onInsert={handleInsert}
              initialPosePresetId={starterPresetId}
              applyBodyRef={applyBodyRef}
              captureTarget={captureMode}
              externalCameraRequest={cameraRequest}
              externalSolverRequest={solverRequest}
            />
          </div>

          <section
            data-testid="studio-poser-rea-foreshortening-bar"
            aria-label={pickLang("3D 포저 만화 투시 및 관절 균형 설정", "3D Poser manga foreshortening and joint balance")}
            className="sticky bottom-2 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-2 rounded-[var(--atelier-radius-outer,14px)] border border-line-strong bg-panel/95 px-3 py-1.5 shadow-[var(--atelier-elevation-dock)]"
          >
            <div className="flex items-center gap-1" role="group" aria-label={pickLang("카메라 렌즈", "Camera lens")}>
              {CAMERA_LENSES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`poser-rea-lens-${item.id}`}
                  aria-label={pickLang(item.ko, item.en)}
                  aria-pressed={cameraLens === item.id}
                  onClick={() => {
                    setCameraLens(item.id);
                    setCameraRequest((prev) => ({ fovDeg: item.fovDeg, nonce: prev.nonce + 1 }));
                  }}
                  className={
                    cameraLens === item.id
                      ? "min-h-11 rounded-lg border border-accent bg-accent-soft px-2.5 text-xs font-semibold tabular-nums text-accent transition-colors [word-break:keep-all]"
                      : "min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs font-medium tabular-nums text-fg-2 transition-colors hover:border-line-strong hover:text-fg [word-break:keep-all]"
                  }
                >
                  {pickLang(item.shortKo, item.shortEn)}
                </button>
              ))}
            </div>
            <span className="hidden h-5 w-px bg-line sm:inline-block" aria-hidden />
            <div className="flex items-center gap-1" role="group" aria-label={pickLang("관절 보정", "Joint balance")}>
              {JOINT_SOLVERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`poser-rea-solver-${item.id}`}
                  aria-label={pickLang(item.ko, item.en)}
                  aria-pressed={jointSolver === item.id}
                  onClick={() => {
                    setJointSolver(item.id);
                    setSolverRequest((prev) => ({ solverId: item.id, nonce: prev.nonce + 1 }));
                  }}
                  className={
                    jointSolver === item.id
                      ? "min-h-11 rounded-lg border border-accent bg-accent-soft px-2.5 text-xs font-semibold text-accent transition-colors [word-break:keep-all]"
                      : "min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg [word-break:keep-all]"
                  }
                >
                  {pickLang(item.shortKo, item.shortEn)}
                </button>
              ))}
            </div>
            <p
              data-testid="studio-poser-rea-status"
              aria-live="polite"
              className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs tabular-nums text-fg-2 [word-break:keep-all]"
            >
              {pickLang(
                `카메라: ${activeLens.ko} · 관절 보정: ${activeSolver.ko}`,
                `Camera: ${activeLens.en} · Balance: ${activeSolver.en}`,
              )}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
