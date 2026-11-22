/** 선화와 톤 출력을 원고 삽입과 PNG 저장에 공통으로 사용한다. */
import type {
  SixPassLtLayerGroup,
  StudioLtConvertResult,
  StudioLtSixPassResult,
} from "./studio-lt-convert";

export type StudioLtConvertLayerKind =
  | "lt-convert-line"
  | "lt-convert-tone"
  | "lt-convert-albedo"
  | "lt-convert-depth"
  | "lt-convert-normal"
  | "lt-convert-mask";

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
  readonly passCode?: string;
  readonly groupId?: string;
}

export interface StudioLtConvertLayerNaming {
  readonly lineName?: string;
  readonly toneName?: string;
}

export interface StudioLtSixPassLayerBundle {
  readonly group: SixPassLtLayerGroup;
  readonly payloads: readonly [
    StudioLtConvertLayerPayload,
    StudioLtConvertLayerPayload,
    StudioLtConvertLayerPayload,
    StudioLtConvertLayerPayload,
    StudioLtConvertLayerPayload,
    StudioLtConvertLayerPayload,
  ];
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

/**
 * 6패스(선화·음영·원색·깊이·노멀·마스크) LT 변환 결과를 자동 그룹화된 레이어 페이로드 번들로 묶는다.
 */
export function createStudioLtSixPassLayerPayloads(
  result: StudioLtSixPassResult,
): StudioLtSixPassLayerBundle {
  const groupId = result.sixPassGroup.groupId;
  const [pLine, pShade, pAlbedo, pDepth, pNormal, pMask] = result.sixPassGroup.passes;
  return {
    group: result.sixPassGroup,
    payloads: [
      { kind: "lt-convert-line", name: pLine.labelKo, passCode: pLine.code, groupId, width: result.lineLayer.width, height: result.lineLayer.height, imageData: result.lineLayer },
      { kind: "lt-convert-tone", name: pShade.labelKo, passCode: pShade.code, groupId, width: result.toneLayer.width, height: result.toneLayer.height, imageData: result.toneLayer },
      { kind: "lt-convert-albedo", name: pAlbedo.labelKo, passCode: pAlbedo.code, groupId, width: result.albedoLayer.width, height: result.albedoLayer.height, imageData: result.albedoLayer },
      { kind: "lt-convert-depth", name: pDepth.labelKo, passCode: pDepth.code, groupId, width: result.depthLayer.width, height: result.depthLayer.height, imageData: result.depthLayer },
      { kind: "lt-convert-normal", name: pNormal.labelKo, passCode: pNormal.code, groupId, width: result.normalLayer.width, height: result.normalLayer.height, imageData: result.normalLayer },
      { kind: "lt-convert-mask", name: pMask.labelKo, passCode: pMask.code, groupId, width: result.maskLayer.width, height: result.maskLayer.height, imageData: result.maskLayer },
    ],
  };
}
