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

import { useCallback, useState, type ReactElement } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { StudioPageIntro } from "../page-intro/StudioPageIntro";

import { getProductStudioMannequinStateSqliteRepository } from "./studio-mannequin-bg3d-preset-sqlite-repository";
import {
  STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  clampStudioMannequinBodyParams,
} from "./studio-mannequin-model";
import {
  STUDIO_MANNEQUIN_POSE_PRESETS,
  createStudioMannequinRestPose,
  normalizeStudioMannequinPose,
} from "./studio-mannequin-poses";
import {
  StudioMannequinPoserPanel,
  type StudioMannequinCaptureResult,
} from "./StudioMannequinPoserPanel";
import { StudioAsset3dInspectorWorkbench } from "./StudioAsset3dInspectorWorkbench";

import { toast } from "@/shared/lib/toast-store";

export function StudioPoserPage(): ReactElement {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const starterPresetId = searchParams.get("starter")?.trim() || undefined;
  const [workbenchOpen, setWorkbenchOpen] = useState<boolean>(false);
  const [appliedPosePresetId, setAppliedPosePresetId] = useState<string | undefined>(
    starterPresetId,
  );
  const [mannequinRepo] = useState(getProductStudioMannequinStateSqliteRepository);

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
    <div className="relative min-h-dvh bg-canvas text-fg">
      {/* 독립 페이지라 문서 제목(h1)이 필요하다 — 패널 제목은 다이얼로그용 h2라 별도로 둔다. */}
      <h1 className="sr-only">포즈 스튜디오</h1>
      <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex items-center justify-center gap-2 px-3">
        <div className="pointer-events-auto">
          <StudioPageIntro motif="pose" />
        </div>
        <div className="pointer-events-auto">
          <button
            type="button"
            data-testid="studio-poser-varco3d-workbench-toggle"
            aria-expanded={workbenchOpen}
            onClick={() => setWorkbenchOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-xl border border-line/80 bg-card/90 px-3.5 py-1.5 text-xs font-semibold text-fg shadow-[0px_2px_4px_-1px_rgba(0,0,0,0.28),0px_14px_28px_-6px_rgba(0,0,0,0.24)] backdrop-blur-[20px] transition-colors hover:border-[#338FFF]"
          >
            <span>
              {workbenchOpen
                ? "VARCO 3D 워크벤치 닫기"
                : "VARCO 3D 워크벤치 & 세계관 셰이퍼"}
            </span>
            <span className="rounded-[4px] bg-[rgba(84,231,250,0.1)] px-[6px] py-[3px] text-[9px] font-semibold leading-none text-[#54e7fa]">
              140 ASSETS · 66 RIGGED
            </span>
          </button>
        </div>
      </div>

      {workbenchOpen ? (
        <aside
          aria-label="VARCO 3D 워크벤치 및 웹툰 세계관 셰이퍼 도크"
          data-testid="studio-poser-varco3d-workbench-dock"
          className="relative z-20 mx-auto max-w-5xl px-3 pt-16 pb-2"
        >
          <StudioAsset3dInspectorWorkbench
            onApplyMannequinBodySliders={(sliders, options) => {
              const nextParams = clampStudioMannequinBodyParams({
                ...STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
                heightCm: sliders.heightCm,
                headCount: sliders.headCount,
                build: sliders.build,
                shoulderWidth: sliders.shoulderWidth,
                pelvisWidth: sliders.hipWidth,
              });
              const matchedPreset = options?.posePresetId
                ? STUDIO_MANNEQUIN_POSE_PRESETS.find((preset) => preset.id === options.posePresetId)
                : undefined;
              if (options?.posePresetId) {
                setAppliedPosePresetId(options.posePresetId);
              }
              void mannequinRepo
                .load()
                .then((stored) =>
                  mannequinRepo.save({
                    params: clampStudioMannequinBodyParams({
                      ...(stored?.params ?? STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS),
                      ...nextParams,
                    }),
                    pose: matchedPreset
                      ? normalizeStudioMannequinPose(matchedPreset.pose)
                      : (stored?.pose ?? createStudioMannequinRestPose()),
                    ...(stored?.partner ? { partner: stored.partner } : {}),
                  }),
                )
                .catch(() => undefined);
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
        onClose={handleClose}
        onInsert={handleInsert}
        initialPosePresetId={appliedPosePresetId}
        captureTarget="download"
      />
    </div>
  );
}
