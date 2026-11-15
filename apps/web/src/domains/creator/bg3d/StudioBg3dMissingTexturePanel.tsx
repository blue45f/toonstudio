import { AlertTriangle, Eye, Link2, Loader2, RotateCcw, X } from "lucide-react";
import { useId, type ChangeEvent } from "react";

import { cx } from "@/shared/lib/cx";

import type { StudioBg3dMissingTexturePorts } from "./studio-bg3d-missing-texture-host";

const ACTION_BTN =
  "inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border px-2.5 py-1 text-[0.66rem] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";

function safeDomId(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/gu, "_");
}

export function StudioBg3dMissingTexturePanel({
  ports,
}: {
  readonly ports: StudioBg3dMissingTexturePorts | null | undefined;
}) {
  const headingId = useId();
  if (!ports || ports.items.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby={headingId}
      data-testid="bg3d-missing-texture-panel"
      className="mb-4 space-y-2.5 rounded-xl border border-warn/45 bg-raised/70 p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3
            id={headingId}
            className="flex items-center gap-1.5 text-xs font-bold text-fg"
          >
            <AlertTriangle size={14} className="shrink-0 text-warn" aria-hidden />
            <span>누락 텍스처 소재 진단 · {ports.items.length}개 배치본</span>
          </h3>
          <p className="mt-1 text-[0.66rem] leading-relaxed text-fg-2">
            텍스처를 읽지 못한 재질만 대체 미리보기로 표시 중이에요. 나머지 정상 오브젝트와
            정상 재질은 그대로 유지되며 3D 화면 편집도 계속할 수 있어요.
          </p>
        </div>
      </div>

      {ports.notice ? (
        <p
          role="status"
          aria-live="polite"
          data-testid="bg3d-missing-texture-notice"
          className={cx(
            "rounded-lg border px-2.5 py-1.5 text-[0.66rem] font-semibold leading-relaxed",
            ports.notice.tone === "error"
              ? "border-bad/45 bg-panel text-bad"
              : ports.notice.tone === "success"
                ? "border-good/45 bg-panel text-good"
                : "border-accent/45 bg-panel text-accent",
          )}
        >
          {ports.notice.message}
        </p>
      ) : null}

      <div className="space-y-2">
        {ports.items.map((item) => {
          const domInstanceId = safeDomId(item.instanceId);
          return (
            <div
              key={item.instanceId}
              data-missing-texture-instance={item.instanceId}
              className={cx(
                "space-y-2 rounded-lg border bg-card p-2.5",
                item.selected ? "border-accent/65" : "border-line",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <button
                  type="button"
                  data-testid={`bg3d-missing-texture-select-${domInstanceId}`}
                  onClick={() => ports.onSelectInstance(item.instanceId)}
                  className="min-w-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="block truncate text-xs font-bold text-fg">
                    {item.instanceLabel}
                  </span>
                  <span className="block text-[0.64rem] text-fg-3">
                    문제 재질 {item.problemMaterialCount}개 · 정상 재질{" "}
                    {item.healthyMaterialCount}개 유지
                  </span>
                </button>
                <button
                  type="button"
                  data-testid={`bg3d-missing-texture-retry-source-${domInstanceId}`}
                  disabled={ports.busy || item.retryingSource}
                  onClick={() => {
                    void ports.onRetryOriginalSource(
                      item.modelId,
                      item.instanceLabel,
                    );
                  }}
                  className={cx(
                    ACTION_BTN,
                    "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                >
                  {item.retryingSource ? (
                    <Loader2
                      size={12}
                      className="shrink-0 animate-spin motion-reduce:animate-none"
                      aria-hidden
                    />
                  ) : (
                    <RotateCcw size={12} className="shrink-0" aria-hidden />
                  )}
                  <span>원본 다시 시도</span>
                </button>
              </div>

              <div className="space-y-1.5">
                {item.slots.map((slot) => {
                  const domSlotKey = safeDomId(slot.slotKey);
                  const inputId = `bg3d-missing-relink-${domInstanceId}-${domSlotKey}`;
                  const slotSummaryLabel = `${item.instanceLabel} · ${slot.materialName} (${slot.slotLabel})`;
                  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (!file) return;
                    void ports.onRelinkSlotFile(
                      item.instanceId,
                      slot.slotKey,
                      slot.slot,
                      slotSummaryLabel,
                      file,
                    );
                  };

                  return (
                    <div
                      key={slot.slotKey}
                      data-missing-texture-slot-row={slot.slotKey}
                      className="rounded-md border border-line/80 bg-panel/60 p-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="text-[0.68rem] font-bold text-fg">
                          {slot.materialName} · {slot.slotLabel}
                        </span>
                        <span
                          className={cx(
                            "rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold",
                            slot.relinkedFileName
                              ? "bg-raised text-good"
                              : slot.fallbackPreviewEnabled
                                ? "bg-accent-soft text-accent"
                                : "bg-raised text-fg-3",
                          )}
                        >
                          {slot.relinkedFileName
                            ? `다시 연결됨 · ${slot.relinkedFileName}`
                            : slot.fallbackPreviewEnabled
                              ? "대체 미리보기 적용 중"
                              : "기본 단색 표시"}
                        </span>
                      </div>
                      {slot.imageName ? (
                        <p className="mt-0.5 truncate text-[0.62rem] text-fg-3">
                          누락 이미지: {slot.imageName}
                        </p>
                      ) : null}

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          aria-pressed={slot.fallbackPreviewEnabled}
                          data-testid={`bg3d-missing-texture-fallback-toggle-${domInstanceId}-${domSlotKey}`}
                          disabled={ports.busy || Boolean(slot.relinkedFileName)}
                          onClick={() =>
                            ports.onToggleFallbackPreview(
                              item.instanceId,
                              slot.slotKey,
                            )
                          }
                          className={cx(
                            ACTION_BTN,
                            slot.fallbackPreviewEnabled
                              ? "border-accent/55 bg-accent-soft text-accent"
                              : "border-line bg-card text-fg-2 hover:bg-raised",
                          )}
                        >
                          <Eye size={12} className="shrink-0" aria-hidden />
                          <span>
                            {slot.fallbackPreviewEnabled
                              ? "대체 미리보기 켜짐"
                              : "대체 미리보기 끄기"}
                          </span>
                        </button>

                        <label
                          htmlFor={inputId}
                          className={cx(
                            ACTION_BTN,
                            "cursor-pointer border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                            ports.busy && "pointer-events-none opacity-45",
                          )}
                        >
                          <Link2 size={12} className="shrink-0" aria-hidden />
                          <span>파일로 다시 연결</span>
                        </label>
                        <input
                          id={inputId}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                          disabled={ports.busy}
                          data-testid={`bg3d-missing-texture-relink-input-${domInstanceId}-${domSlotKey}`}
                          onChange={handleFileChange}
                          className="sr-only"
                        />

                        {slot.relinkedFileName ? (
                          <button
                            type="button"
                            data-testid={`bg3d-missing-texture-clear-relink-${domInstanceId}-${domSlotKey}`}
                            disabled={ports.busy}
                            onClick={() =>
                              ports.onClearSlotRelink(
                                item.instanceId,
                                slot.slotKey,
                                slotSummaryLabel,
                              )
                            }
                            className={cx(
                              ACTION_BTN,
                              "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg",
                            )}
                          >
                            <X size={12} className="shrink-0" aria-hidden />
                            <span>연결 해제</span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
