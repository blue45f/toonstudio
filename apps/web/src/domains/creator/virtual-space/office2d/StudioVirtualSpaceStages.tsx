import { lazy, Suspense } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioVirtualSpacePhaserCanvasProps } from "../studio-virtual-space-phaser-canvas-model";

const LazyPhaserCanvas = lazy(() => import("../StudioVirtualSpacePhaserCanvas").then((module) => ({ default: module.StudioVirtualSpacePhaserCanvas })));
const LazyThreeCanvas = lazy(() => import("../three/StudioVirtualSpaceThreeCanvas").then((module) => ({ default: module.StudioVirtualSpaceThreeCanvas })));

function StageLoading() {
  const bt = useBilingual("StudioVirtualSpaceStageLoading");
  return <p className="studio-office2d__loading" role="status">{bt("화면 엔진을 불러오는 중…", "Loading the stage engine…")}</p>;
}

/** 선택형 3D 스테이지. three.js는 사용자가 3D를 고를 때만 내려받는다. */
export function StudioVirtualSpaceThreeStage(props: StudioVirtualSpacePhaserCanvasProps) {
  return <Suspense fallback={<StageLoading />}><LazyThreeCanvas {...props} /></Suspense>;
}

/** 레거시 Phaser 스테이지. 월드 편집(저작 모드)과 `?stage=legacy` 비교·롤백용으로만 내려받는다. */
export function StudioVirtualSpaceLegacyStage(props: StudioVirtualSpacePhaserCanvasProps) {
  return <Suspense fallback={<StageLoading />}><LazyPhaserCanvas {...props} /></Suspense>;
}
