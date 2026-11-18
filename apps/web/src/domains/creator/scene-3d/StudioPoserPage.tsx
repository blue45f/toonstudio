/**
 * `/studio/poser` — 포즈 스튜디오 독립 진입점.
 *
 * 감사 지적(데드 링크) 해소: `character-shaper-learn-clips`,
 * `studio-immersive-workflows`, 사이트 디렉터리·헤더 등이 `/studio/poser`를
 * 가리키나 라우트가 미등록이라 404가 났다. 이 페이지가 실제 포저
 * (`StudioMannequinPoserPanel`, 매직 포저 탭 포함) 및 VARCO 3D 인스펙터 워크벤치
 * (`StudioAsset3dInspectorWorkbench`, 25축 웹툰 세계관 셰이퍼·PBR 브러시·리깅·모션 IK·비교기)를
 * 직접 마운트한다.
 *
 * - 닫기 → `/studio`로 복귀.
 * - 캡처 → 독립 진입점에는 삽입할 문서가 없으므로 PNG를 다운로드한다. 포저는 닫지 않고
 *   (다른 각도로 다시 캡처할 수 있게) 저장했다는 토스트만 띄운다.
 * - `?starter=` 쿼리(예: `action-pose-rig`)는 데생 인형·웹툰 포즈 프리셋에서 찾아
 *   패널이 열릴 때 자동으로 적용한다. 알 수 없는 id는 무시하고 빈 포저를 연다.
 */

import { ArrowLeft } from "lucide-react";
import { useCallback, useRef, useState, type ReactElement } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { StudioPageIntro } from "../page-intro/StudioPageIntro";

import {
  StudioMannequinPoserPanel,
  type StudioMannequinCaptureResult, type StudioMannequinApplyBody,
} from "./StudioMannequinPoserPanel";
import { StudioAsset3dInspectorWorkbench } from "./StudioAsset3dInspectorWorkbench";

import { useI18n } from "@/shared/lib/i18n";
import { toast } from "@/shared/lib/toast-store";

const CAMERA_LENSES = [
  { id: "manga-18mm-foreshorten", ko: "만화 18mm 과장 투시", en: "Manga 18mm foreshortening", fovDeg: 64 },
  { id: "standard-35mm-dialogue", ko: "표준 35mm 대화 샷", en: "Standard 35mm dialogue shot", fovDeg: 42 },
  { id: "tele-85mm-portrait", ko: "망원 85mm 인물 압축", en: "Telephoto 85mm portrait", fovDeg: 22 },
] as const;

const JOINT_SOLVERS = [
  { id: "com-gravity-balance", ko: "무게중심 자동 균형", en: "Center-of-mass gravity balance" },
  { id: "clavicle-auto-twist", ko: "쇄골·어깨 자동 연동 회전", en: "Clavicle auto-twist balance" },
  { id: "hand-grip-preset", ko: "손가락 파지 프리셋", en: "Hand grip preset" },
] as const;

export function StudioPoserPage(): ReactElement {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const lang = useI18n((state) => state.lang);
  const isKo = lang.startsWith("ko");
  const pickLang = (ko: string, en: string) => (isKo ? ko : en);
  const [cameraLens, setCameraLens] = useState<(typeof CAMERA_LENSES)[number]["id"]>("manga-18mm-foreshorten");
  const [jointSolver, setJointSolver] = useState<(typeof JOINT_SOLVERS)[number]["id"]>("com-gravity-balance");
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

  const handleClose = useCallback(() => {
    navigate("/studio", { replace: true });
  }, [navigate]);

  const handleInsert = useCallback(
    (result: StudioMannequinCaptureResult): boolean => {
      const anchor = document.createElement("a");
      anchor.href = result.pngDataUrl;
      anchor.download = `toonstudio-pose-${Date.now()}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      toast("포즈 PNG를 저장했어요 · 다운로드 폴더", { tone: "success", durationMs: 4_000 });
      return true;
    },
    [],
  );

  return (
    <div className="min-h-dvh bg-canvas text-fg">
      {/* 독립 페이지라 문서 제목(h1)이 필요하다 — 패널 제목은 섹션용 h2라 별도로 둔다. */}
      <h1 className="sr-only">포즈 스튜디오</h1>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-3 py-3 sm:px-4 sm:py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="studio-poser-page-return-studio"
              onClick={handleClose}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors hover:border-accent"
            >
              <ArrowLeft size={14} aria-hidden />
              <span>{pickLang("2D 원고 스튜디오로 복귀", "Return to 2D Studio")}</span>
            </button>
            <StudioPageIntro motif="pose" />
          </div>
          <button
            type="button"
            data-testid="studio-poser-varco3d-workbench-toggle"
            aria-expanded={workbenchOpen}
            onClick={() => setWorkbenchOpen((prev) => !prev)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line/80 bg-card/90 px-3.5 py-2 text-xs font-semibold text-fg shadow-sm transition-colors hover:border-accent [word-break:keep-all]"
          >
            <span>
              {workbenchOpen
                ? pickLang("VARCO 3D 워크벤치 닫기", "Close VARCO 3D workbench")
                : pickLang("VARCO 3D 워크벤치 & 세계관 셰이퍼", "VARCO 3D workbench & shaper")}
            </span>
            <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-medium leading-none tabular-nums text-accent">
              {pickLang("에셋 140종 · 리깅 66종", "140 assets · 66 rigged")}
            </span>
          </button>
        </div>

        <section
          data-testid="studio-poser-rea-foreshortening-bar"
          aria-label={pickLang("3D 포저 만화 투시 및 관절 균형 설정", "3D Poser manga foreshortening and joint balance")}
          className="rounded-2xl border border-line bg-card p-3 sm:p-4"
        >
          <div>
            <h2 className="text-sm font-semibold text-fg [word-break:keep-all]">
              {pickLang("만화 투시 카메라 · 관절 균형 보정", "Manga foreshortening & joint balance")}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
              {pickLang(
                "광각 과장 투시 렌즈와 무게중심·쇄골 자동 연동 보정을 조합해 자연스러운 액션 컷을 잡습니다",
                "Combine wide-angle foreshortening lenses with center-of-mass and clavicle joint balance",
              )}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-fg-2 [word-break:keep-all]">
              {pickLang("카메라 렌즈", "Camera lens")}
            </span>
            {CAMERA_LENSES.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`poser-rea-lens-${item.id}`}
                aria-pressed={cameraLens === item.id}
                onClick={() => {
                  setCameraLens(item.id);
                  setCameraRequest((prev) => ({ fovDeg: item.fovDeg, nonce: prev.nonce + 1 }));
                }}
                className={
                  cameraLens === item.id
                    ? "min-h-11 rounded-xl border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold tabular-nums text-accent transition-colors duration-150 [word-break:keep-all]"
                    : "min-h-11 rounded-xl border border-line bg-panel px-3 py-2 text-xs font-semibold tabular-nums text-fg-2 transition-colors duration-150 hover:border-line-strong hover:text-fg [word-break:keep-all]"
                }
              >
                {pickLang(item.ko, item.en)}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-fg-2 [word-break:keep-all]">
              {pickLang("관절 보정", "Joint balance")}
            </span>
            {JOINT_SOLVERS.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`poser-rea-solver-${item.id}`}
                aria-pressed={jointSolver === item.id}
                onClick={() => {
                  setJointSolver(item.id);
                  setSolverRequest((prev) => ({ solverId: item.id, nonce: prev.nonce + 1 }));
                }}
                className={
                  jointSolver === item.id
                    ? "min-h-11 rounded-xl border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition-colors duration-150 [word-break:keep-all]"
                    : "min-h-11 rounded-xl border border-line bg-panel px-3 py-2 text-xs font-semibold text-fg-2 transition-colors duration-150 hover:border-line-strong hover:text-fg [word-break:keep-all]"
                }
              >
                {pickLang(item.ko, item.en)}
              </button>
            ))}
          </div>
          <p
            data-testid="studio-poser-rea-status"
            aria-live="polite"
            className="mt-2.5 rounded-xl border border-line bg-panel px-3 py-1.5 text-xs tabular-nums text-fg-2 [word-break:keep-all]"
          >
            {pickLang(
              `카메라: ${activeLens.ko} · 관절 보정: ${activeSolver.ko}`,
              `Camera: ${activeLens.en} · Balance: ${activeSolver.en}`,
            )}
          </p>
        </section>

        {workbenchOpen ? (
          <aside
            aria-label="VARCO 3D 워크벤치 및 웹툰 세계관 셰이퍼 도크"
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

        <StudioMannequinPoserPanel
          open
          presentation="page"
          onClose={handleClose}
          onInsert={handleInsert}
          initialPosePresetId={starterPresetId}
          applyBodyRef={applyBodyRef}
          captureTarget="download"
          externalCameraRequest={cameraRequest}
          externalSolverRequest={solverRequest}
        />
      </div>
    </div>
  );
}
