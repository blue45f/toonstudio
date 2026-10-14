/**
 * Publish Auto-Fit — 게시(업로드) 시점의 긴 이미지 자동 슬라이싱·규격 자동 맞춤.
 *
 * 보유 범위와의 경계(2026-10-14 main 실측):
 * - 자동 슬라이싱 엔진 `auto-slicer.ts`(리사이즈·슬라이싱·용량 맞춤)와 규격
 *   프리셋 `spec-validator.ts`는 이미 있지만, 연결된 곳은 내보내기 다이얼로그
 *   (`PublishSpecAutoOptimizeSection`)뿐이라 결과는 "다운로드"에서 끝났다.
 * - 게시 동선(`StudioUploadPublish`)은 업로드 때 폭 1600px 축소만 하고, 긴
 *   이미지를 규격 높이로 나누거나 규격 폭에 맞추는 동작이 없었다. 게시
 *   사전검사(`studio-publish-preflight.ts`)도 모듈 선언대로 플랫폼 픽셀 규격을
 *   검사하지 않는다.
 *
 * 이 모듈이 그 빈틈을 메운다: 업로드된 페이지 목록을 받아 페이지별 맞춤
 * 계획(순수 함수)을 세우고, 게시 직전에 `autoOptimizeEpisodeImage` 엔진으로
 * 실제 분할·리사이즈를 적용해 새 페이지 목록을 돌려준다. 새 도구·새 엔진이
 * 아니라 기존 슬라이서의 "게시 배선"이다.
 *
 * 사용자 노출 문자열은 한글.
 */

import {
  autoOptimizeEpisodeImage,
  computePublishTargetSize,
  planPublishSliceBoxes,
  type PublishAutoSliceOptions,
  type PublishSliceBox,
} from "./auto-slicer";
import type { PublishSpecPreset } from "./spec-validator";
import { MAX_PAGES, uid, type UploadPage } from "./studio-upload-page-model";

export type PublishAutoFitAction = "keep" | "resize" | "slice" | "resize-slice";

export interface PublishAutoFitPageInput {
  id: string;
  name?: string;
  width: number;
  height: number;
}

export interface PublishAutoFitPagePlan {
  sourceId: string;
  sourceName: string;
  sourceWidth: number;
  sourceHeight: number;
  /** 규격 폭에 맞춘 뒤의 크기(확대 없음). 크기를 읽을 수 없으면 0. */
  targetWidth: number;
  targetHeight: number;
  /** target 기준 슬라이스 박스. 크기를 읽을 수 없으면 빈 배열(원본 유지로 취급). */
  slices: PublishSliceBox[];
  /** 이 페이지가 게시될 때 만들어지는 장수. */
  outputCount: number;
  action: PublishAutoFitAction;
}

export interface PublishAutoFitPlan {
  presetId: PublishSpecPreset["id"];
  pages: PublishAutoFitPagePlan[];
  inputPageCount: number;
  outputPageCount: number;
  /** 폭이 규격보다 넓어 줄어드는 페이지 수(resize·resize-slice 합산). */
  resizedPageCount: number;
  /** 2장 이상으로 나뉘는 페이지 수(slice·resize-slice 합산). */
  slicedPageCount: number;
  /** action이 keep이 아닌 페이지 수. */
  changedPageCount: number;
  /** 분할 뒤 장수가 게시 장수 한도를 넘는가 — 이 경우 게시는 중단해야 한다. */
  exceedsPageLimit: boolean;
  maxPages: number;
  /** 업로드 화면·게시 확인에 그대로 보여줄 한 줄 요약. */
  summary: string;
}

function planPage(
  page: PublishAutoFitPageInput,
  preset: PublishSpecPreset
): PublishAutoFitPagePlan {
  const target = computePublishTargetSize(page.width, page.height, preset.episodeMaxWidth);
  const slices =
    target.height > 0
      ? planPublishSliceBoxes(target.height, preset.episodeSliceHeight ?? target.height)
      : [];
  const outputCount = slices.length > 0 ? slices.length : 1;
  const resized =
    target.width > 0 &&
    (target.width !== Math.round(page.width) || target.height !== Math.round(page.height));
  const sliced = slices.length > 1;
  const action: PublishAutoFitAction = resized
    ? sliced
      ? "resize-slice"
      : "resize"
    : sliced
      ? "slice"
      : "keep";
  return {
    sourceId: page.id,
    sourceName: page.name ?? "",
    sourceWidth: page.width,
    sourceHeight: page.height,
    targetWidth: target.width,
    targetHeight: target.height,
    slices,
    outputCount,
    action,
  };
}

function summarizePlan(args: {
  inputPageCount: number;
  outputPageCount: number;
  resizedPageCount: number;
  slicedPageCount: number;
  changedPageCount: number;
  exceedsPageLimit: boolean;
  maxPages: number;
}): string {
  if (args.exceedsPageLimit) {
    return `자동으로 나누면 ${args.outputPageCount}장이 되어 한 번에 올릴 수 있는 ${args.maxPages}장을 넘어요. 이미지를 나눠 올려주세요.`;
  }
  if (args.changedPageCount === 0) {
    return "모든 이미지가 게시 규격에 맞아요.";
  }
  const parts: string[] = [];
  if (args.slicedPageCount > 0) {
    parts.push(`긴 이미지 ${args.slicedPageCount}장이 규격 높이로 나뉘어요`);
  }
  if (args.resizedPageCount > 0) {
    parts.push(`넓은 이미지 ${args.resizedPageCount}장이 규격 폭으로 줄어요`);
  }
  return `게시할 때 ${parts.join(" · ")} (총 ${args.inputPageCount}장 → ${args.outputPageCount}장).`;
}

/**
 * 업로드된 페이지 목록의 게시 규격 맞춤 계획(순수).
 * 엔진(`auto-slicer`)과 같은 계산(computePublishTargetSize·planPublishSliceBoxes)을
 * 쓰므로, 계획의 장수·크기는 실제 적용 결과와 어긋나지 않는다.
 */
export function planPublishAutoFit(
  pages: readonly PublishAutoFitPageInput[],
  preset: PublishSpecPreset,
  maxPages: number = MAX_PAGES
): PublishAutoFitPlan {
  const pagePlans = pages.map((page) => planPage(page, preset));
  const outputPageCount = pagePlans.reduce((sum, page) => sum + page.outputCount, 0);
  const resizedPageCount = pagePlans.filter(
    (page) => page.action === "resize" || page.action === "resize-slice"
  ).length;
  const slicedPageCount = pagePlans.filter(
    (page) => page.action === "slice" || page.action === "resize-slice"
  ).length;
  const changedPageCount = pagePlans.filter((page) => page.action !== "keep").length;
  const exceedsPageLimit = outputPageCount > maxPages;
  return {
    presetId: preset.id,
    pages: pagePlans,
    inputPageCount: pages.length,
    outputPageCount,
    resizedPageCount,
    slicedPageCount,
    changedPageCount,
    exceedsPageLimit,
    maxPages,
    summary: summarizePlan({
      inputPageCount: pages.length,
      outputPageCount,
      resizedPageCount,
      slicedPageCount,
      changedPageCount,
      exceedsPageLimit,
      maxPages,
    }),
  };
}

export interface ApplyPublishAutoFitDeps {
  /** 테스트 주입용 — 기본은 Image 로드. */
  loadImage?: (src: string) => Promise<HTMLImageElement>;
  /** 테스트 주입용 — 기본은 FileReader. */
  blobToDataUrl?: (blob: Blob) => Promise<string>;
  /** 엔진 주입 — 기본은 실제 Canvas. */
  createCanvas?: PublishAutoSliceOptions["createCanvas"];
  /** 엔진 주입 — 기본은 canvasToBlob. */
  encode?: PublishAutoSliceOptions["encode"];
  /** 엔진 품질 하한 — 기본은 엔진 기본값(0.6). */
  minQuality?: number;
}

function defaultLoadPublishImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new globalThis.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 불러오지 못했어요."));
    image.src = src;
  });
}

function defaultBlobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("이미지를 변환하지 못했어요."));
    reader.readAsDataURL(blob);
  });
}

function stripFileExtension(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").trim();
  return base || "toonstudio-episode";
}

/**
 * 게시 직전 자동 맞춤 적용 — 계획이 "유지"인 페이지는 원본 그대로 두고,
 * 나머지는 엔진을 돌려 분할·리사이즈된 새 페이지로 교체한다.
 *
 * - 첫 조각은 원본 페이지 id를 이어받아 순서·선택 상태가 흔들리지 않는다.
 * - 분할 뒤 장수가 한도를 넘으면 부분 적용하지 않고 한글 메시지로 throw한다
 *   (호출자는 게시를 중단하고 사용자에게 알린다 — 조용히 잘라 게시하지 않는다).
 * - 바뀐 페이지가 없으면 원본 배열을 그대로 돌려준다.
 */
export async function applyPublishAutoFitToPages(
  pages: readonly UploadPage[],
  preset: PublishSpecPreset,
  deps: ApplyPublishAutoFitDeps = {}
): Promise<UploadPage[]> {
  const plan = planPublishAutoFit(pages, preset);
  if (plan.exceedsPageLimit) {
    throw new Error(plan.summary);
  }
  if (plan.changedPageCount === 0) {
    return [...pages];
  }
  const loadImage = deps.loadImage ?? defaultLoadPublishImage;
  const blobToDataUrl = deps.blobToDataUrl ?? defaultBlobToDataUrl;

  const fitted: UploadPage[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const pagePlan = plan.pages[index];
    if (!page || !pagePlan || pagePlan.action === "keep") {
      if (page) fitted.push(page);
      continue;
    }
    const image = await loadImage(page.src);
    const result = await autoOptimizeEpisodeImage(image, preset, {
      title: stripFileExtension(page.name),
      createCanvas: deps.createCanvas,
      encode: deps.encode,
      minQuality: deps.minQuality,
    });
    for (let sliceIndex = 0; sliceIndex < result.slices.length; sliceIndex += 1) {
      const slice = result.slices[sliceIndex];
      if (!slice) continue;
      fitted.push({
        id: sliceIndex === 0 ? page.id : uid(),
        src: await blobToDataUrl(slice.blob),
        width: slice.width,
        height: slice.height,
        // 한 장으로 끝나는 맞춤은 원본 이름을 유지하고, 나뉠 때만 엔진 파일명을 쓴다.
        name: result.slices.length > 1 ? slice.filename : page.name,
      });
    }
  }
  return fitted;
}
