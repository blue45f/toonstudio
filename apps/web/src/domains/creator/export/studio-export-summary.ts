import type { WatermarkSettings } from "../studio-watermark";
import type { ExportFormat } from "./studio-export";

export type StudioExportBackgroundSummary = "transparent" | "preserve" | "unsupported";
export type StudioExportSignatureSummary = "off" | "empty" | "invisible" | "invalid" | "active";

/** 출력기 설정만 설명한다. 완료 여부·파일 크기·실제 픽셀을 추정하지 않는다. */
export function studioExportAppearanceSummary(
  format: ExportFormat,
  transparentRequested: boolean,
  signature: Pick<WatermarkSettings, "enabled" | "text" | "opacity">,
): {
  readonly background: StudioExportBackgroundSummary;
  readonly signature: StudioExportSignatureSummary;
} {
  const background: StudioExportBackgroundSummary = format === "jpg"
    ? "unsupported"
    : transparentRequested ? "transparent" : "preserve";
  const signatureState: StudioExportSignatureSummary = !signature.enabled ? "off"
    : signature.text.trim().length === 0 ? "empty"
      : !Number.isFinite(signature.opacity) ? "invalid"
        : signature.opacity <= 0 ? "invisible" : "active";
  return { background, signature: signatureState };
}
