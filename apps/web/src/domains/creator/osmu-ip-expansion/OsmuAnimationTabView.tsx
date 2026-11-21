import { Copy, FileCode2, FileText, Film, Layers, Mic } from "lucide-react";

import {
  ANIMATION_FORMAT_SPECS,
  type AnimationAspectRatio,
  type AnimationFormatId,
  type AnimationKomaStyle,
  type AnimationProductionPacket,
} from "./osmu-animation-pipeline-engine";
import type { ExportPreviewFormat } from "./OsmuWebnovelDramaTabViews";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

interface AnimationXSheetParallaxTabViewProps {
  readonly format: AnimationFormatId;
  readonly aspectRatio: AnimationAspectRatio;
  readonly komaStyle: AnimationKomaStyle;
  readonly selectedCutId: string;
  readonly packet: AnimationProductionPacket;
  readonly exportPreview: ExportPreviewFormat;
  readonly onFormatChange: (format: AnimationFormatId) => void;
  readonly onAspectChange: (ratio: AnimationAspectRatio) => void;
  readonly onKomaChange: (koma: AnimationKomaStyle) => void;
  readonly onSelectCut: (cutId: string) => void;
  readonly onToggleExport: (format: ExportPreviewFormat) => void;
  readonly onCopyText: (label: string, text: string) => void;
}

export function AnimationXSheetParallaxTabView({
  format,
  aspectRatio,
  komaStyle,
  selectedCutId,
  packet,
  exportPreview,
  onFormatChange,
  onAspectChange,
  onKomaChange,
  onSelectCut,
  onToggleExport,
  onCopyText,
}: AnimationXSheetParallaxTabViewProps) {
  const bt = useBilingual("StudioOsmuIpExpansionPanel");
  const activeCut = packet.cuts.find((c) => c.cutId === selectedCutId) ?? packet.cuts[0];

  return (
    <div
      id="osmu-tabpanel-anime"
      role="tabpanel"
      aria-labelledby="osmu-tab-anime"
      className="mt-4 space-y-4"
      data-testid="osmu-anime-panel"
    >
      <div className="osmu-card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(["tv-anime", "ott-series", "shortform-movingtoon"] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              className="osmu-chip"
              data-testid={`osmu-anime-format-${fmt}`}
              aria-pressed={format === fmt}
              onClick={() => onFormatChange(fmt)}
            >
              <Film className="size-4" aria-hidden="true" />
              {ANIMATION_FORMAT_SPECS[fmt].labelKo}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {(["1s", "2s", "3s"] as const).map((koma) => (
              <button
                key={koma}
                type="button"
                className="osmu-chip"
                data-testid={`osmu-anime-koma-${koma}`}
                aria-pressed={komaStyle === koma}
                onClick={() => onKomaChange(koma)}
              >
                {koma === "1s"
                  ? bt("1코마 (풀애니)", "1s Full")
                  : koma === "2s"
                    ? bt("2코마 (TV 표준)", "2s Standard")
                    : bt("3코마 (리미티드)", "3s Limited")}
              </button>
            ))}
            {(["16:9", "9:16"] as const).map((ratio) => (
              <button
                key={ratio}
                type="button"
                className="osmu-chip"
                data-testid={`osmu-anime-aspect-${ratio}`}
                aria-pressed={aspectRatio === ratio}
                onClick={() => onAspectChange(ratio)}
              >
                화면비 {ratio}
              </button>
            ))}
          </div>
          <span className="osmu-pill" data-tone="good" data-testid="osmu-anime-runtime-pill">
            총 {packet.totalFrames}f · {packet.totalDurationSec}s ({packet.formattedTimecode} @{" "}
            {packet.fps}fps)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {packet.cuts.map((cut) => (
            <button
              key={cut.cutId}
              type="button"
              className="osmu-chip"
              data-testid={`osmu-anime-cut-${cut.cutId}`}
              aria-pressed={activeCut?.cutId === cut.cutId}
              onClick={() => onSelectCut(cut.cutId)}
            >
              {cut.cutId} · {cut.sceneTitle} ({cut.durationFrames}f)
            </button>
          ))}
        </div>
      </div>

      {activeCut ? (
        <>
          <div className="osmu-split-grid">
            <section className="osmu-card space-y-2.5" data-testid="osmu-anime-parallax-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 text-sm font-bold text-fg">
                  <Layers className="size-4 text-accent" aria-hidden="true" />
                  {bt("2.5D 패럴랙스 깊이(Z-depth) 카메라", "2.5D Z-Depth Parallax Plan")}
                </h4>
                <span className="osmu-pill" data-tone="accent">
                  {activeCut.parallaxPlan.cameraMoveLabelKo}
                </span>
              </div>
              <ul className="space-y-2 text-xs">
                {activeCut.parallaxPlan.layers.map((layer) => (
                  <li key={layer.kind} className="rounded-xl border border-line bg-panel p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-fg">
                        [{layer.kind}] {layer.label}
                      </strong>
                      <span className="osmu-num text-fg-2">
                        Z={layer.zDepthMeters}m · 배율 {layer.parallaxMultiplier}x
                      </span>
                    </div>
                    <p className="osmu-num mt-1 text-[0.6875rem] text-fg-3">
                      이동 Δ({layer.endOffsetPx.x}px, {layer.endOffsetPx.y}px) · 스케일{" "}
                      {layer.scaleStart} → {layer.scaleEnd}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="osmu-card space-y-3" data-testid="osmu-anime-division-card">
              <h4 className="flex items-center gap-2 text-sm font-bold text-fg">
                <Mic className="size-4 text-accent" aria-hidden="true" />
                {bt("음소 립싱크 & 원화·동화·채색 분업 패킷", "Lip-Sync Visemes & Division Packet")}
              </h4>
              <div className="osmu-viseme-strip" data-testid="osmu-anime-lipsync-strip">
                {activeCut.lipSyncTracks.map((track, idx) => (
                  <span
                    key={`${track.startFrame}-${idx}`}
                    className="osmu-viseme-chip"
                    data-viseme={track.viseme}
                  >
                    <strong>{track.syllable}</strong>
                    <span>{track.viseme}</span>
                    <span className="text-fg-3">
                      f{track.startFrame}~{track.endFrame}
                    </span>
                  </span>
                ))}
              </div>

              <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div className="rounded-xl border border-line bg-panel p-2.5">
                  <dt className="text-fg-3">원화 (Key)</dt>
                  <dd className="osmu-num mt-1 text-sm font-black text-fg" data-testid="osmu-anime-key-count">
                    {activeCut.divisionWorkOrder.keyAnimationCount}매
                  </dd>
                </div>
                <div className="rounded-xl border border-line bg-panel p-2.5">
                  <dt className="text-fg-3">동화 (In-between)</dt>
                  <dd className="osmu-num mt-1 text-sm font-black text-fg" data-testid="osmu-anime-inbetween-count">
                    {activeCut.divisionWorkOrder.inBetweenCount}매
                  </dd>
                </div>
                <div className="rounded-xl border border-line bg-panel p-2.5">
                  <dt className="text-fg-3">채색 (Paint)</dt>
                  <dd className="osmu-num mt-1 text-sm font-black text-fg">
                    {activeCut.divisionWorkOrder.paintCelCount}셀
                  </dd>
                </div>
                <div className="rounded-xl border border-line bg-panel p-2.5">
                  <dt className="text-fg-3">전체 예상 공수</dt>
                  <dd className="osmu-num mt-1 text-sm font-black text-fg">
                    {packet.departmentSummary.estimatedTotalHours}h
                  </dd>
                </div>
              </dl>

              <ul className="list-disc space-y-1 pl-4 text-xs text-fg-2">
                {activeCut.divisionWorkOrder.deliverableChecklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          </div>

          <section className="osmu-card space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-fg">
                {bt("24fps X-Sheet (타임시트 · 프레임 노출표)", "24fps X-Sheet Exposure Table")} —{" "}
                {activeCut.cutId} ({activeCut.startTimecode} ~ {activeCut.endTimecode})
              </h4>
              <span className="osmu-num text-xs text-fg-3">
                전체 {activeCut.xSheetRows.length}프레임 중 초반 24프레임(1초 구간) 표시
              </span>
            </div>
            <div className="osmu-table-wrap">
              <table className="osmu-table" data-testid="osmu-anime-xsheet-table">
                <thead>
                  <tr>
                    <th>F#</th>
                    <th>타임코드</th>
                    <th>BG</th>
                    <th>MID</th>
                    <th>CHAR (원/동)</th>
                    <th>FX</th>
                    <th>SPEECH</th>
                    <th>립싱크</th>
                    <th>카메라</th>
                  </tr>
                </thead>
                <tbody>
                  {activeCut.xSheetRows.slice(0, 24).map((row) => (
                    <tr key={row.globalFrame} data-keyframe={row.isKeyFrame ? "true" : "false"}>
                      <td className="osmu-num font-bold">{row.globalFrame}</td>
                      <td className="osmu-num">{row.secondMark}</td>
                      <td>{row.bgCel}</td>
                      <td>{row.midCel}</td>
                      <td className="osmu-num font-semibold">{row.charKeyCel}</td>
                      <td className="osmu-num">{row.fxCel}</td>
                      <td>{row.speechHold}</td>
                      <td className="osmu-num">
                        {row.lipSyncViseme} ({row.dialogueSyllable})
                      </td>
                      <td>{row.cameraCue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="osmu-btn"
          data-testid="osmu-anime-export-md-btn"
          aria-pressed={exportPreview === "markdown"}
          onClick={() => onToggleExport(exportPreview === "markdown" ? "none" : "markdown")}
        >
          <FileText className="size-4" aria-hidden="true" />
          {bt("X-Sheet 시트 Markdown", "X-Sheet Markdown")}
        </button>
        <button
          type="button"
          className="osmu-btn"
          data-testid="osmu-anime-export-json-btn"
          aria-pressed={exportPreview === "json"}
          onClick={() => onToggleExport(exportPreview === "json" ? "none" : "json")}
        >
          <FileCode2 className="size-4" aria-hidden="true" />
          {bt("애니 제작 패킷 JSON", "Animation Packet JSON")}
        </button>
        <button
          type="button"
          className="osmu-btn"
          data-testid="osmu-anime-copy-json"
          onClick={() => onCopyText("애니메이션 24fps 제작 패킷 JSON", packet.jsonExport)}
        >
          <Copy className="size-4" aria-hidden="true" />
          {bt("JSON 복사", "Copy JSON")}
        </button>
      </div>

      {exportPreview !== "none" ? (
        <pre className="osmu-code-box" data-testid="osmu-anime-export-box">
          {exportPreview === "json" ? packet.jsonExport : packet.markdownExport}
        </pre>
      ) : null}
    </div>
  );
}
