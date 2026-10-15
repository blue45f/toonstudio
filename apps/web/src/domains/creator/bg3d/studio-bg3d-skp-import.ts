/**
 * .skp 가져오기 어댑터 — 가져오기 파이프라인(studio-bg3d-model-import)과 SKP 변환 사이의 얇은 접합부.
 *
 * 파이프라인은 원본 파일을 읽어 이 모듈에 넘기고, 이 모듈은
 *   1) 읽기 전에 프로필별 크기 상한을 검사하고(큰 파일을 메모리에 올리지 않는다),
 *   2) Worker 로 변환하고,
 *   3) 크기가 비정상(수 mm / 수 km)이면 사용자에게 단위를 묻고(응답자가 있을 때만),
 *   4) 선택한 단위를 GLB 에 반영하고 보고서를 갱신해 호출자에게 알린 뒤,
 *   5) 기존 GLB 가져오기 경로가 이어서 읽을 GLB 바이트를 돌려준다.
 * 변환기의 모든 실패는 같은 문자열의 가져오기 오류 코드로 바뀐다(되는 척하는 대체 변환은 없다).
 */

import { importError, throwIfAborted } from "./studio-bg3d-model-import-shared";
import {
  StudioBg3dSkpConversionError,
  resolveStudioBg3dSkpMaxSourceBytes,
  type StudioBg3dSkpStageProgress,
} from "./studio-bg3d-skp-contract";
import { scaleStudioBg3dGlbUniformly } from "./studio-bg3d-skp-glb-scale";
import { parseStudioBg3dSkpImportReport, type StudioBg3dSkpImportReport } from "./studio-bg3d-skp-import-report";
import { assertStudioBg3dSkpSourceSize } from "./studio-bg3d-skp-preflight";
import { applyStudioBg3dSkpUnitToReport } from "./studio-bg3d-skp-report-builder";
import {
  assessStudioBg3dSkpSize,
  describeStudioBg3dSkpDeclaredUnits,
  studioBg3dSkpUnitScaleFactor,
  type StudioBg3dSkpSizeAssessment,
  type StudioBg3dSkpUnit,
} from "./studio-bg3d-skp-unit";
import { convertStudioBg3dSkp, type StudioBg3dSkpExecutionBackend } from "./studio-bg3d-skp-worker-client";

import type { StudioBg3dGlbProfile } from "./studio-bg3d-glb-validation";

/** 크기 확인 단계에서 사용자에게 물을 내용. */
export interface StudioBg3dSkpUnitDecisionRequest {
  readonly sourceName: string;
  readonly report: StudioBg3dSkpImportReport;
  /** OpenSKP 출력 기준의 단위 후보와 추천 단위. */
  readonly assessment: StudioBg3dSkpSizeAssessment;
}

export type StudioBg3dSkpUnitDecision =
  | { readonly kind: "unit"; readonly unit: StudioBg3dSkpUnit }
  /** 응답 없이 진행한다. OpenSKP 의 인치 해석을 그대로 쓰고 사용자 선택으로 기록하지 않는다. */
  | { readonly kind: "keep" }
  | { readonly kind: "cancel" };

export type StudioBg3dSkpUnitResolver = (
  request: StudioBg3dSkpUnitDecisionRequest,
  signal?: AbortSignal,
) => Promise<StudioBg3dSkpUnitDecision>;

export interface StudioBg3dSkpReportEvent {
  readonly sourcePath: string;
  readonly sourceName: string;
  readonly report: StudioBg3dSkpImportReport;
}

export interface StudioBg3dSkpStageEvent {
  readonly sourcePath: string;
  readonly sourceName: string;
  readonly progress: StudioBg3dSkpStageProgress;
}

export interface StudioBg3dSkpImportOptions {
  /**
   * 변환 후 크기가 비정상일 때 단위를 묻는 응답자. 생략하면 묻지 않고 기본(인치) 해석을 유지하며
   * 보고서에 size-abnormal 경고를 남긴다(응답할 화면이 없는데 가져오기를 멈춰 세우지 않는다).
   */
  readonly resolveUnit?: StudioBg3dSkpUnitResolver;
  /**
   * 변환이 끝날 때마다(단위 반영 후) 호출된다. 빈 장면처럼 보고서를 만들 수 있었던 변환 거절도 실패 직전에
   * 한 번 호출해, 왜 가져올 수 없었는지 보고서(경고·이름)로 보여 줄 수 있게 한다.
   */
  readonly onReport?: (event: StudioBg3dSkpReportEvent) => void;
  /** 읽기·해석·변환·분석 같은 단계가 바뀔 때마다 호출된다. */
  readonly onStage?: (event: StudioBg3dSkpStageEvent) => void;
}

/** 가져오기 호출 전체에서 파일마다 같은 값: 호스트가 준 옵션과 크기 상한을 정하는 프로필. */
export interface StudioBg3dSkpImportContext {
  readonly options: StudioBg3dSkpImportOptions | undefined;
  readonly profile: StudioBg3dGlbProfile | undefined;
}

export interface StudioBg3dSkpImportRequest {
  readonly name: string;
  readonly path: string;
  /** 읽기 전에 검사하는 선언 크기(File.size). */
  readonly size: number;
  readonly readBytes: () => Promise<ArrayBuffer>;
  readonly signal: AbortSignal | undefined;
  readonly executionBackend: StudioBg3dSkpExecutionBackend;
  readonly context: StudioBg3dSkpImportContext;
}

function mapSkpFailure(error: unknown): unknown {
  return error instanceof StudioBg3dSkpConversionError ? importError(error.code) : error;
}

/** 보고서를 만들 수 있었던 변환 거절(빈 장면 등)은 실패하기 전에 그 보고서를 호스트에 알린다. */
function reportRefusedConversion(request: StudioBg3dSkpImportRequest, error: unknown): void {
  if (!(error instanceof StudioBg3dSkpConversionError)) return;
  const report = parseStudioBg3dSkpImportReport(error.report);
  if (report) request.context.options?.onReport?.({ sourcePath: request.path, sourceName: request.name, report });
}

function toExactBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer;
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/** 응답자가 취소 신호를 무시하고 영영 답하지 않아도 가져오기가 멈춰 서지 않게 한다. */
function rejectWhenAborted<T>(pending: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return pending;
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(importError("skp-cancelled"));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    void pending
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function assessmentOf(report: StudioBg3dSkpImportReport): StudioBg3dSkpSizeAssessment | null {
  if (report.size === null) return null;
  const declared = describeStudioBg3dSkpDeclaredUnits(report.source.declaredUnits).unit;
  return assessStudioBg3dSkpSize(report.size.openSkpMeters, declared);
}

/** 사용자가 고른 단위를 GLB 와 보고서에 반영한다. 인치는 변환 결과 그대로다. */
function applyUnit(
  glb: Uint8Array,
  report: StudioBg3dSkpImportReport,
  unit: StudioBg3dSkpUnit,
): { readonly glb: Uint8Array; readonly report: StudioBg3dSkpImportReport } {
  return {
    glb: scaleStudioBg3dGlbUniformly(glb, studioBg3dSkpUnitScaleFactor(unit)),
    report: applyStudioBg3dSkpUnitToReport(report, unit, { userSelected: true }),
  };
}

/**
 * .skp 파일 하나를 자체 포함 GLB 바이트로 바꾼다. 실패는 StudioBg3dModelImportError(skp-* 코드)로 던진다.
 */
export async function importStudioBg3dSkpToGlb(request: StudioBg3dSkpImportRequest): Promise<ArrayBuffer> {
  const { context, signal } = request;
  const notifyStage = context.options?.onStage;
  const onStage = notifyStage
    ? (progress: StudioBg3dSkpStageProgress): void => {
      notifyStage({ sourcePath: request.path, sourceName: request.name, progress });
    }
    : undefined;
  throwIfAborted(signal);
  const maxBytes = resolveStudioBg3dSkpMaxSourceBytes(context.profile);
  try {
    assertStudioBg3dSkpSourceSize(request.size, { maxBytes });
  } catch (error) {
    throw mapSkpFailure(error);
  }
  const bytes = await request.readBytes();
  throwIfAborted(signal);

  let glb: Uint8Array;
  let report: StudioBg3dSkpImportReport;
  try {
    const output = await convertStudioBg3dSkp(bytes, {
      executionBackend: request.executionBackend,
      maxBytes,
      transferInput: true,
      signal,
      onStage,
    });
    glb = output.glb;
    report = output.report;
  } catch (error) {
    reportRefusedConversion(request, error);
    throw mapSkpFailure(error);
  }
  throwIfAborted(signal);

  const assessment = assessmentOf(report);
  const resolveUnit = context.options?.resolveUnit;
  if (assessment && assessment.level !== "ok" && resolveUnit) {
    let decision: StudioBg3dSkpUnitDecision;
    try {
      decision = await rejectWhenAborted(
        resolveUnit({ sourceName: request.name, report, assessment }, signal),
        signal,
      );
    } catch (error) {
      // 사용자가 가져오기를 취소해 응답이 끊긴 경우는 SKP 취소로, 그 밖의 오류는 숨기지 않고 던진다.
      if (signal?.aborted) throw importError("skp-cancelled");
      throw error;
    }
    if (decision.kind === "cancel") throw importError("skp-cancelled");
    if (decision.kind === "unit") {
      try {
        ({ glb, report } = applyUnit(glb, report, decision.unit));
      } catch (error) {
        throw mapSkpFailure(error);
      }
    }
  }
  throwIfAborted(signal);
  context.options?.onReport?.({ sourcePath: request.path, sourceName: request.name, report });
  return toExactBuffer(glb);
}
