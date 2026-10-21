/**
 * studio-psd-adjustment-report.ts
 *
 * PSD 조정 레이어 가져오기의 "대응표"와 파일별 가져오기 리포트의 정본.
 *
 * 배경: 변환기(studio-psd-adjustment-import.ts)는 ag-psd 조정 16종 전부를
 * Studio 조정 종류로 변환하지만, 종류마다 픽셀 충실도가 다르다 — 전용 실행기가
 * 같은 의미로 적용하는 종류, 파라미터는 무손실이나 실행이 근사인 종류, 그리고
 * 데이터 조건에 따라 파라미터만 남고 픽셀에는 적용되지 않는 종류가 섞여 있다.
 * 이 모듈은 그 차이를 종류별 대응표로 고정하고, 가져오기 결과마다
 * "정확/근사/파라미터만 보존/제외" 건수를 세어 리포트로 돌려준다. 변환됐다는
 * 이유만으로 전부 "복원됨"으로 뭉뚱그리지 않는 것이 이 모듈의 계약이다.
 *
 * 순수·결정적: 변환 결과와 메모(notes)만으로 판정한다.
 */
import type { StudioAdjustmentKind } from "./filter/studio-adjustment-effect-graph";
import { STUDIO_ADJUSTMENT_KIND_LABELS } from "./layer/studio-adjustment-layer";
import type { StudioPsdConvertedAdjustment } from "./studio-psd-adjustment-import";

/** 가져오기 충실도 — 사용자가 결과 화면에서 읽는 그대로의 구분. */
export type PsdAdjustmentFidelity =
  /** 파라미터 무손실 + 전용 실행기가 같은 의미로 픽셀에 적용한다. */
  | "exact"
  /** 파라미터는 무손실 보존하지만 픽셀 실행은 근사·부분 적용이다. */
  | "approximated"
  /** 파라미터만 보존하고 픽셀에는 적용하지 않는다(적용한 척하지 않는다). */
  | "preserved-only"
  /** 변환할 수 없어 가져오지 않았다. */
  | "dropped";

export const PSD_ADJUSTMENT_FIDELITY_LABELS: Readonly<Record<PsdAdjustmentFidelity, string>> = {
  exact: "정확 변환",
  approximated: "근사 변환",
  "preserved-only": "파라미터만 보존",
  dropped: "제외",
};

export interface PsdAdjustmentSupportEntry {
  /** ag-psd 조정 type 원문. */
  readonly psdType: string;
  /** 변환되는 Studio 조정 종류. */
  readonly kind: StudioAdjustmentKind;
  /** 한국어 종류 이름(조정 레이어 라벨 정본과 동일). */
  readonly label: string;
  /** 대표 충실도. color-lookup처럼 데이터 조건으로 갈리는 종류는 가장 보수적인 값을 둔다. */
  readonly fidelity: Exclude<PsdAdjustmentFidelity, "dropped">;
  /** 충실도의 근거·한계 — 대응표에 그대로 노출되는 문구. */
  readonly detail: string;
}

function supportEntry(
  psdType: string,
  kind: StudioAdjustmentKind,
  fidelity: PsdAdjustmentSupportEntry["fidelity"],
  detail: string,
): PsdAdjustmentSupportEntry {
  return { psdType, kind, label: STUDIO_ADJUSTMENT_KIND_LABELS[kind], fidelity, detail };
}

/**
 * PSD 조정 16종 대응표 — 가져오기 변환기(convertPsdAdjustmentLayer)의 switch와
 * 1:1로 대응한다. 테스트가 변환기 전 종류와 이 표를 대조해 어느 한쪽만 늘거나
 * 주는 드리프트를 막는다.
 */
export const PSD_ADJUSTMENT_SUPPORT_TABLE: readonly PsdAdjustmentSupportEntry[] = [
  supportEntry("levels", "levels", "exact", "채널별 입·출력 레벨과 중간톤을 그대로 변환해 레벨 실행기가 적용합니다."),
  supportEntry("curves", "curves", "exact", "채널별 곡선 점을 그대로 변환해 곡선 실행기가 적용합니다."),
  supportEntry("hue/saturation", "hsl", "approximated", "마스터 색조/채도는 즉시 적용하고, 색상 범위별 조정은 파라미터로만 보존합니다."),
  supportEntry("color balance", "color-balance", "exact", "톤 영역별 균형값과 휘도 보존 옵션을 그대로 변환합니다."),
  supportEntry("channel mixer", "channel-mixer", "exact", "출력 채널별 혼합 비율과 단색 옵션을 그대로 변환합니다."),
  supportEntry("gradient map", "gradient-map", "approximated", "스톱은 그대로 옮기지만 노이즈 그라디언트는 솔리드 근사이고, RGB가 아닌 스톱은 제외됩니다."),
  supportEntry("brightness/contrast", "brightness-contrast", "approximated", "값은 PSD 척도 그대로 보존하고, Photoshop 비공개 곡선 대신 선형 근사로 실행합니다."),
  supportEntry("exposure", "exposure", "exact", "노출·오프셋·감마를 기존 노출 실행기에 그대로 위임합니다."),
  supportEntry("vibrance", "vibrance", "exact", "활기와 채도를 PSD와 같은 -100..100 척도로 기존 활기 실행기에 위임합니다."),
  supportEntry("invert", "invert", "exact", "파라미터 없는 반전을 그대로 적용합니다."),
  supportEntry("posterize", "posterize", "exact", "단계 수(2..255)를 그대로 양자화에 적용합니다."),
  supportEntry("threshold", "threshold", "exact", "임계 레벨을 휘도 경계 규칙 그대로 적용합니다."),
  supportEntry("black & white", "black-white", "approximated", "6색 가중은 헥스콘 분해 근사로 실행하고, 틴트도 근사로 적용합니다."),
  supportEntry("photo filter", "photo-filter", "exact", "색·밀도·휘도 보존 규약이 기존 포토 필터 엔진과 같아 그대로 위임합니다."),
  supportEntry("selective color", "selective-color", "approximated", "9범위 CMYK 값은 무손실 보존하고, 실행은 색상 섹터 분류 기준 근사입니다."),
  supportEntry("color lookup", "color-lookup", "preserved-only", "내장 .cube 데이터가 있을 때만 픽셀에 적용하고, 그 외에는 파라미터만 보존합니다."),
];

const SUPPORT_BY_KIND = new Map<StudioAdjustmentKind, PsdAdjustmentSupportEntry>(
  PSD_ADJUSTMENT_SUPPORT_TABLE.map((entry) => [entry.kind, entry]),
);
const SUPPORT_BY_PSD_TYPE = new Map<string, PsdAdjustmentSupportEntry>(
  PSD_ADJUSTMENT_SUPPORT_TABLE.map((entry) => [entry.psdType, entry]),
);

export function psdAdjustmentSupportForKind(
  kind: StudioAdjustmentKind,
): PsdAdjustmentSupportEntry | undefined {
  return SUPPORT_BY_KIND.get(kind);
}

export function psdAdjustmentSupportForPsdType(
  psdType: string,
): PsdAdjustmentSupportEntry | undefined {
  return SUPPORT_BY_PSD_TYPE.get(psdType);
}

/** 변환 메모에 이 문구가 있으면 그 항목은 픽셀에 적용되지 않은 것이다. */
const NOT_APPLIED_MARKERS = ["픽셀에는 적용되지 않습니다", "픽셀 적용은"] as const;

/**
 * 변환된 조정 1건의 실제 충실도를 판정한다. 대응표의 대표값에서 출발하되,
 * 변환 메모가 "픽셀 미적용"을 고지하면 파라미터만 보존으로 강등하고, 정확
 * 종류라도 메모가 있으면(기본값 채움 등) 근사로 내린다 — 리포트가 실행
 * 현실보다 좋아 보이지 않게 하는 쪽으로만 움직인다.
 */
export function classifyPsdAdjustmentFidelity(
  converted: Pick<StudioPsdConvertedAdjustment, "kind" | "notes">,
): Exclude<PsdAdjustmentFidelity, "dropped"> {
  const entry = SUPPORT_BY_KIND.get(converted.kind);
  const base = entry?.fidelity ?? "approximated";
  const notes = converted.notes;
  if (notes.some((note) => NOT_APPLIED_MARKERS.some((marker) => note.includes(marker)))) {
    return "preserved-only";
  }
  if (converted.kind === "color-lookup") {
    // 메모가 없다는 것은 내장 .cube 바이트가 보존돼 실행기가 실제로 적용한다는 뜻이다.
    return notes.length === 0 ? "exact" : base;
  }
  if (base !== "exact") return base;
  return notes.length > 0 ? "approximated" : "exact";
}

// ── 파일별 가져오기 리포트 ───────────────────────────────────────────────────

export interface PsdAdjustmentReportRow {
  readonly name: string;
  /** ag-psd 조정 type 원문(대응표에서 역으로 찾는다). */
  readonly psdType: string;
  /** 변환된 Studio 조정 종류. 제외된 행은 null. */
  readonly kind: StudioAdjustmentKind | null;
  readonly label: string;
  readonly fidelity: PsdAdjustmentFidelity;
  /** 변환 메모 또는 제외 사유 — 행 단위 정직 고지. */
  readonly notes: readonly string[];
}

export interface PsdAdjustmentImportReport {
  /** PSD에서 발견한 조정 레이어 총수(복원 + 제외). */
  readonly total: number;
  /** Studio 조정 레이어로 복원한 수. */
  readonly restored: number;
  /** 변환할 수 없어 제외한 수. */
  readonly dropped: number;
  readonly counts: Readonly<Record<PsdAdjustmentFidelity, number>>;
  readonly rows: readonly PsdAdjustmentReportRow[];
}

export interface PsdAdjustmentUnsupportedInput {
  readonly name: string;
  readonly psdType: string;
  readonly reason: string;
}

export function buildPsdAdjustmentImportReport(
  restoredLayers: readonly {
    readonly name: string;
    readonly kind: StudioAdjustmentKind;
    readonly notes: readonly string[];
  }[],
  unsupported: readonly PsdAdjustmentUnsupportedInput[],
): PsdAdjustmentImportReport {
  const counts: Record<PsdAdjustmentFidelity, number> = {
    exact: 0,
    approximated: 0,
    "preserved-only": 0,
    dropped: 0,
  };
  const rows: PsdAdjustmentReportRow[] = [];
  for (const layer of restoredLayers) {
    const fidelity = classifyPsdAdjustmentFidelity(layer);
    counts[fidelity] += 1;
    const entry = SUPPORT_BY_KIND.get(layer.kind);
    rows.push({
      name: layer.name,
      psdType: entry?.psdType ?? layer.kind,
      kind: layer.kind,
      label: entry?.label ?? STUDIO_ADJUSTMENT_KIND_LABELS[layer.kind],
      fidelity,
      notes: layer.notes,
    });
  }
  for (const item of unsupported) {
    counts.dropped += 1;
    const entry = SUPPORT_BY_PSD_TYPE.get(item.psdType);
    rows.push({
      name: item.name,
      psdType: item.psdType,
      kind: null,
      label: entry?.label ?? item.psdType,
      fidelity: "dropped",
      notes: [item.reason],
    });
  }
  return {
    total: rows.length,
    restored: restoredLayers.length,
    dropped: unsupported.length,
    counts,
    rows,
  };
}

/** 대응표를 충실도별 한 줄 요약으로 접는다 — 리포트 상단에 그대로 노출된다. */
export function psdAdjustmentSupportSummaryLine(): string {
  const groups = new Map<PsdAdjustmentFidelity, string[]>();
  for (const entry of PSD_ADJUSTMENT_SUPPORT_TABLE) {
    const list = groups.get(entry.fidelity) ?? [];
    list.push(entry.label);
    groups.set(entry.fidelity, list);
  }
  const parts: string[] = [];
  for (const fidelity of ["exact", "approximated", "preserved-only"] as const) {
    const labels = groups.get(fidelity);
    if (labels?.length) {
      parts.push(`${PSD_ADJUSTMENT_FIDELITY_LABELS[fidelity]} ${labels.length}종(${labels.join("·")})`);
    }
  }
  return `PSD 조정 레이어 대응표(전체 ${PSD_ADJUSTMENT_SUPPORT_TABLE.length}종): ${parts.join(" / ")}`;
}

/**
 * 가져오기 확인 화면(손실 미리보기)에 그대로 실을 리포트 줄들.
 * 첫 줄은 대응표 요약, 둘째 줄은 이 파일의 집계, 이후는 정확 변환이 아닌
 * 행만 골라 이름과 함께 고지한다(정확 행까지 전부 늘어놓지 않는다).
 */
export function formatPsdAdjustmentReportLines(
  report: PsdAdjustmentImportReport,
): readonly string[] {
  if (report.total === 0) return [];
  const { counts } = report;
  const lines: string[] = [
    psdAdjustmentSupportSummaryLine(),
    `이 파일의 조정 레이어 ${report.total}개 — 복원 ${report.restored}개`
      + `(정확 ${counts.exact} · 근사 ${counts.approximated} · 파라미터만 보존 ${counts["preserved-only"]})`
      + ` · 제외 ${report.dropped}개`,
  ];
  for (const row of report.rows) {
    if (row.fidelity === "exact") continue;
    const detail = row.notes.length > 0 ? ` — ${row.notes.join(" ")}` : "";
    lines.push(
      `${row.name}(${row.label}): ${PSD_ADJUSTMENT_FIDELITY_LABELS[row.fidelity]}${detail}`,
    );
  }
  return lines;
}
