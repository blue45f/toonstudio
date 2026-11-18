/** 선화와 톤 출력을 원고 삽입과 PNG 저장에 공통으로 사용한다. */
import type { StudioLtConvertResult } from "./studio-lt-convert";

export type StudioLtConvertLayerKind = "lt-convert-line" | "lt-convert-tone";

/**
 * 레이어 문서에 커밋하기 직전의 LT 변환 레이어 페이로드.
 * `imageData`는 엔진 출력 그대로이며, 직렬화(data URL 등)는 호출 측이 수행한다.
 */
export interface StudioLtConvertLayerPayload {
  readonly kind: StudioLtConvertLayerKind;
  /** 레이어 패널에 표시될 이름 (예: "LT 선화", "LT 톤"). */
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly imageData: ImageData;
}

export interface StudioLtConvertLayerNaming {
  readonly lineName?: string;
  readonly toneName?: string;
}

/**
 * 엔진 결과를 [선화, 톤] 순서의 레이어 페이로드 쌍으로 변환한다.
 * 반환 순서는 레이어 스택에 쌓을 순서(선화가 위)와 같다.
 */
export function createStudioLtConvertLayerPayloads(
  result: StudioLtConvertResult,
  naming?: StudioLtConvertLayerNaming,
): readonly [StudioLtConvertLayerPayload, StudioLtConvertLayerPayload] {
  if (!result || typeof result !== "object") {
    throw new Error("LT 변환 결과가 필요합니다.");
  }
  return [
    {
      kind: "lt-convert-line",
      name: naming?.lineName ?? "LT 선화",
      width: result.lineLayer.width,
      height: result.lineLayer.height,
      imageData: result.lineLayer,
    },
    {
      kind: "lt-convert-tone",
      name: naming?.toneName ?? "LT 톤",
      width: result.toneLayer.width,
      height: result.toneLayer.height,
      imageData: result.toneLayer,
    },
  ];
}
