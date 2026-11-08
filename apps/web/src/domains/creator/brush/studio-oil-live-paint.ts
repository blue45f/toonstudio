import { paintStudioOilRibbonCarrier } from "./studio-oil-ribbon-paint";
import type { StudioOilRibbonPaintContext } from "./studio-oil-ribbon-carrier-types";
import type { StudioOilRibbonIncrementalPaintInput } from "./studio-oil-ribbon-incremental-paint";

type IncrementalPainter = typeof import("./studio-oil-ribbon-incremental-paint").paintStudioOilRibbonCarrierIncremental;
let incrementalPainter: IncrementalPainter | null = null;
let loadStarted = false;

/**
 * 증분 캐시는 유화 초안이 실제로 필요할 때만 로드한다. 준비 전에도 같은 Canvas 정본
 * painter가 안료·강모를 즉시 그리므로 첫 획을 버리거나 경로 전용 그림으로 바꾸지 않는다.
 */
export function paintStudioOilRibbonCarrierIncremental(
  context: StudioOilRibbonPaintContext,
  input: StudioOilRibbonIncrementalPaintInput,
) {
  if (!loadStarted) {
    loadStarted = true;
    void import("./studio-oil-ribbon-incremental-paint").then((module) => {
      incrementalPainter = module.paintStudioOilRibbonCarrierIncremental;
    }).catch((error: unknown) => {
      console.warn("유화 증분 캐시를 불러오지 못해 동일 정본 painter를 유지합니다.", error);
    });
  }
  return incrementalPainter
    ? incrementalPainter(context, input)
    : paintStudioOilRibbonCarrier(context, input);
}
