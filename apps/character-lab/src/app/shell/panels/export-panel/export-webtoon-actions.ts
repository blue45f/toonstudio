import {
  exportEpisodeCutsheetLongStripPng,
  exportEpisodeCutsheetMotionWebm,
  exportEpisodeCutsheetWebVtt,
  exportEpisodeStoryboardMarkdown,
} from "../../../../export/webtoon-episode-batch";
import { exportWebtoonMotionTeaserVtt, exportWebtoonMotionTeaserWebm } from "../../../../export/webtoon-motion-teaser";
import { exportWebtoonVerticalStripPng } from "../../../../export/webtoon-strip-composer";
import { exportWebtoonTankobonPagePng } from "../../../../export/webtoon-tankobon-page";
import { planApply } from "../../../../state/apply-plan";

import type { ExportBusyKind } from "./ExportStatusSection";
import type { ApplyPlan, CharacterEngine, LabState, PresetCatalog } from "../../../../contracts";
import type { ExportOutcome } from "../../../../export/export-session";
import type { EpisodeCutsheetStore } from "../../../../export/webtoon-episode-cutsheet";
import type { EncodeMotionTeaserWebmFn } from "../../../../export/webtoon-motion-teaser";
import type { ExportWebtoonVerticalStripOptions } from "../../../../export/webtoon-strip-composer";
import type { StripDirectorState } from "../viewport-scene-director";
import type { RefObject } from "react";

interface WebtoonExportActionsDeps {
  readonly width: number;
  readonly settleSteps: number;
  readonly directorState: StripDirectorState;
  readonly labState: Pick<LabState, "recipe" | "capabilities">;
  readonly applyPlan: ApplyPlan | null;
  readonly catalog: PresetCatalog;
  readonly cutsheetStore: EpisodeCutsheetStore;
  readonly buildStripOptions: () => ExportWebtoonVerticalStripOptions;
  readonly lastMotionSpeedRef: RefObject<number>;
  readonly encodeMotionWebm: EncodeMotionTeaserWebmFn;
  readonly now: () => number;
  readonly run: (kind: ExportBusyKind, task: () => Promise<void>) => Promise<void>;
  readonly finish: (kind: ExportBusyKind, outcome: ExportOutcome, extraNotices?: readonly string[]) => boolean;
  readonly requireEngine: (kind: ExportBusyKind) => CharacterEngine | null;
  readonly onProgress: (step: number, total: number, labelKo: string) => void;
}

/** 저장 액션만 조립하며, 실행 잠금·실패·재시도·마운트 상태는 ExportPanel이 관리한다. */
export function createWebtoonExportActions(deps: WebtoonExportActionsDeps) {
  const {
    width,
    settleSteps,
    directorState,
    labState,
    applyPlan,
    catalog,
    cutsheetStore,
    buildStripOptions,
    lastMotionSpeedRef,
    encodeMotionWebm,
    now,
    run,
    finish,
    requireEngine,
    onProgress,
  } = deps;
  const { tankobonOrder, tankobonPageNumber, tankobonBindingSide, includeAmbientBgm } = directorState;

  const onWebtoonStripPng = (): void => {
    void run("webtoon-strip", async () => {
      const engine = requireEngine("webtoon-strip");
      if (!engine) return;
      finish("webtoon-strip", await exportWebtoonVerticalStripPng(engine, buildStripOptions(), { now }));
    });
  };

  const onWebtoonTankobonPng = (): void => {
    void run("webtoon-tankobon", async () => {
      const engine = requireEngine("webtoon-tankobon");
      if (!engine) return;
      finish(
        "webtoon-tankobon",
        await exportWebtoonTankobonPagePng(
          engine,
          {
            ...buildStripOptions(),
            pageWidth: width,
            readingOrder: tankobonOrder,
            includeCropMarks: true,
            pageNumber: tankobonPageNumber,
            bindingSide: tankobonBindingSide,
          },
          { now },
        ),
        [
          `인쇄 재단선(Crop Marks)${tankobonPageNumber > 0 ? ` · 쪽번호 P.${String(tankobonPageNumber).padStart(2, "0")}` : ""}이 반영된 ${tankobonOrder === "rtl-tankobon" ? "우→좌" : "좌→우"} 단행본 4컷 출판 페이지 PNG를 저장했습니다.`,
        ],
      );
    });
  };

  const onWebtoonMotionWebm = (playbackSpeed = 1): void => {
    lastMotionSpeedRef.current = playbackSpeed;
    void run("webtoon-motion-webm", async () => {
      const engine = requireEngine("webtoon-motion-webm");
      if (!engine) return;
      const resolutionPreset = width >= 720 ? "hd-720x1280" : "sd-540x960";
      finish(
        "webtoon-motion-webm",
        await exportWebtoonMotionTeaserWebm(
          engine,
          {
            ...buildStripOptions(),
            resolutionPreset,
            playbackSpeed,
            kineticPopIn: true,
            synthesizeAudioSfx: true,
            includeAmbientBgm,
          },
          encodeMotionWebm,
          { now },
        ),
        [
          `스크롤 여백 호흡(${playbackSpeed}× 배속)·컷 진입 말풍선 팝인·절차적 효과음${includeAmbientBgm ? "·무드 앰비언트 BGM 패드" : ""}가 동기화된 9:16 숏폼 WebM 비디오를 저장했습니다.`,
        ],
      );
    });
  };

  const onWebtoonMotionVtt = (): void => {
    void run("vtt", async () => {
      finish(
        "vtt",
        exportWebtoonMotionTeaserVtt(
          labState.recipe,
          {
            ...buildStripOptions(),
            playbackSpeed: lastMotionSpeedRef.current,
          },
          { now },
        ),
        ["9:16 모션 코믹 타임코드와 다국어 발화자 태그가 동기화된 WebVTT(.vtt) 자막 파일을 저장했습니다."],
      );
    });
  };

  const onExportBatchLongStripPng = (): void => {
    void run("cutsheet-long-strip", async () => {
      const engine = requireEngine("cutsheet-long-strip");
      if (!engine) return;
      const cs = cutsheetStore.getState();
      const effectiveBasePlan = applyPlan ?? planApply(labState.recipe, labState.capabilities, catalog);
      finish(
        "cutsheet-long-strip",
        await exportEpisodeCutsheetLongStripPng(
          engine,
          cs.beats,
          {
            episodeTitleKo: cs.episodeTitleKo,
            requestedStripWidth: width,
            basePlan: effectiveBasePlan,
            settleSteps,
            onProgress,
          },
          { now },
        ),
        [`큐시트 ${cs.beats.length}비트(총 ${cs.beats.length * 4}컷)를 장편 세로 스크롤 웹툰 원고 PNG로 일괄 저장했습니다.`],
      );
    });
  };

  const onExportBatchMotionWebm = (): void => {
    void run("cutsheet-webm", async () => {
      const engine = requireEngine("cutsheet-webm");
      if (!engine) return;
      const cs = cutsheetStore.getState();
      const effectiveBasePlan = applyPlan ?? planApply(labState.recipe, labState.capabilities, catalog);
      const resolutionPreset = width >= 720 ? "hd-720x1280" : "sd-540x960";
      finish(
        "cutsheet-webm",
        await exportEpisodeCutsheetMotionWebm(
          engine,
          cs.beats,
          {
            episodeTitleKo: cs.episodeTitleKo,
            requestedStripWidth: width,
            resolutionPreset,
            playbackSpeed: lastMotionSpeedRef.current,
            includeAmbientBgm,
            basePlan: effectiveBasePlan,
            settleSteps,
            onProgress,
          },
          encodeMotionWebm,
          { now },
        ),
        [`큐시트 ${cs.beats.length}비트(총 ${cs.beats.length * 4}컷)를 연속 9:16 숏폼 에피소드 WebM 비디오로 일괄 저장했습니다.`],
      );
    });
  };

  const onExportBatchWebVtt = (): void => {
    void run("cutsheet-vtt", async () => {
      const cs = cutsheetStore.getState();
      finish(
        "cutsheet-vtt",
        exportEpisodeCutsheetWebVtt(
          cs.episodeTitleKo,
          cs.beats,
          { requestedStripWidth: width, playbackSpeed: lastMotionSpeedRef.current },
          { now },
        ),
        [`큐시트 ${cs.beats.length}비트(총 ${cs.beats.length * 4}컷)의 누적 타임코드가 동기화된 통합 WebVTT(.vtt) 자막을 저장했습니다.`],
      );
    });
  };

  const onExportStoryboardMd = (): void => {
    void run("storyboard-md", async () => {
      const cs = cutsheetStore.getState();
      finish(
        "storyboard-md",
        exportEpisodeStoryboardMarkdown(cs.episodeTitleKo, cs.beats, { now }),
        [`PD·식자 파트 협업용 '${cs.episodeTitleKo}' 스토리보드 연출 큐시트(.storyboard.md)를 저장했습니다.`],
      );
    });
  };

  return {
    onWebtoonStripPng,
    onWebtoonTankobonPng,
    onWebtoonMotionWebm,
    onWebtoonMotionVtt,
    onExportBatchLongStripPng,
    onExportBatchMotionWebm,
    onExportBatchWebVtt,
    onExportStoryboardMd,
  };
}
