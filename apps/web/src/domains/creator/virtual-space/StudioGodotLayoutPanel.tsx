import { useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  GodotSpacePropKindSchema,
  GodotSpaceZoneKindSchema,
  type GodotSpaceBackgroundAsset,
  type GodotSpaceDefinition,
} from "./studio-godot-space";

export type GodotSpaceBackgroundValue = GodotSpaceDefinition["background"];

/**
 * Godot 무대 배치 편집 패널 (4단계 — 월드 저작, 셸 소유 표면).
 *
 * 원칙: 폼·저장·동기화는 셸이 소유하고, 무대 안 드래그 조작은 Godot가
 * 소유한다. 이 패널은 선택 항목의 숫자 편집·추가·삭제 명령만 무대에 보내고,
 * 저장 버튼이 Core API 기록 + 실시간 알림까지의 동선을 소유한다.
 */

export interface GodotLayoutSelection {
  readonly category: "zone" | "prop";
  readonly index: number;
  readonly kind: string;
  readonly name: string;
  readonly rect: readonly [number, number, number, number];
}

export type GodotLayoutCommand =
  | { readonly op: "add"; readonly category: "zone" | "prop"; readonly kind: string }
  | {
      readonly op: "update";
      readonly category: "zone" | "prop";
      readonly index: number;
      readonly fields: {
        readonly name?: string;
        readonly kind?: string;
        readonly rect?: [number, number, number, number];
      };
    }
  | { readonly op: "delete"; readonly category: "zone" | "prop"; readonly index: number };

export type GodotLayoutLoadState = "loading" | "ready" | "error";
export type GodotLayoutSaveState = "idle" | "saving" | "conflict" | "error";

export interface StudioGodotLayoutPanelProps {
  readonly definition: GodotSpaceDefinition | null;
  readonly revision: number;
  readonly dirty: boolean;
  readonly editMode: boolean;
  readonly selection: GodotLayoutSelection | null;
  readonly loadState: GodotLayoutLoadState;
  readonly saveState: GodotLayoutSaveState;
  readonly onRetryLoad: () => void;
  readonly onToggleEdit: (enabled: boolean) => void;
  readonly onCommand: (command: GodotLayoutCommand) => void;
  readonly backgroundAssets: readonly GodotSpaceBackgroundAsset[];
  readonly defaultBackground: GodotSpaceBackgroundValue;
  readonly backgroundUploadState: "idle" | "uploading" | "error";
  readonly backgroundError: string | null;
  readonly onBackgroundChange: (background: GodotSpaceBackgroundValue) => void;
  readonly onBackgroundUpload: (file: File) => void;
  readonly onBackgroundDelete: (assetId: string) => void;
  readonly onSave: () => void;
  readonly onReload: () => void;
}

const inputClass =
  "w-20 rounded-lg border border-line bg-card px-2 py-1.5 text-sm";
const labelClass = "grid gap-1 text-xs font-semibold text-fg-2";

export function StudioGodotLayoutPanel({
  definition,
  revision,
  dirty,
  editMode,
  selection,
  loadState,
  saveState,
  onRetryLoad,
  onToggleEdit,
  onCommand,
  backgroundAssets,
  defaultBackground,
  backgroundUploadState,
  backgroundError,
  onBackgroundChange,
  onBackgroundUpload,
  onBackgroundDelete,
  onSave,
  onReload,
}: StudioGodotLayoutPanelProps) {
  const bt = useBilingual("StudioGodotLayoutPanel");
  const [addCategory, setAddCategory] = useState<"zone" | "prop">("prop");
  const [addKind, setAddKind] = useState<string>("bench");

  if (loadState === "loading") {
    return (
      <p role="status" className="mt-3 text-sm text-fg-2">
        {bt("공간 정의를 불러오는 중이에요…", "Loading the space layout…")}
      </p>
    );
  }
  if (loadState === "error") {
    return (
      <div className="mt-3 flex items-center gap-3">
        <p role="alert" className="text-sm font-semibold">
          {bt(
            "공간 정의를 불러오지 못했어요.",
            "Couldn't load the space layout.",
          )}
        </p>
        <button
          type="button"
          className="text-sm font-bold underline underline-offset-4"
          onClick={onRetryLoad}
        >
          {bt("다시 시도", "Retry")}
        </button>
      </div>
    );
  }
  if (!definition) return null;

  const kindOptions =
    addCategory === "zone"
      ? GodotSpaceZoneKindSchema.options
      : GodotSpacePropKindSchema.options;

  const currentUploadAsset = definition.background?.glb.startsWith("uploads/")
    ? backgroundAssets.find(
        (asset) => asset.glbRef === definition.background?.glb,
      )
    : undefined;
  const backgroundLabel = !definition.background
    ? bt("없음 (단색 바닥)", "None (flat floor)")
    : currentUploadAsset
      ? currentUploadAsset.fileName
      : definition.background.glb.startsWith("uploads/")
        ? bt("업로드한 배경", "Uploaded background")
        : bt("기본 배경", "Default background");

  return (
    <section
      aria-label={bt("공간 배치 편집", "Space layout editor")}
      className="mt-4 rounded-2xl border border-line bg-card p-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-bold">
          {bt("공간 배치 편집", "Space layout editor")}
        </h3>
        <button
          type="button"
          aria-pressed={editMode}
          className="rounded-full border border-line px-3 py-1.5 text-sm font-bold"
          onClick={() => onToggleEdit(!editMode)}
        >
          {editMode
            ? bt("편집 모드 끄기", "Exit edit mode")
            : bt("편집 모드 켜기", "Enter edit mode")}
        </button>
        <p className="text-xs text-fg-2">
          {bt(
            `저장본 개정 ${revision}판`,
            `Saved revision ${revision}`,
          )}
          {dirty
            ? bt(" · 저장 안 된 변경 있음", " · Unsaved changes")
            : ""}
        </p>
        <button
          type="button"
          disabled={!dirty || saveState === "saving"}
          className="rounded-full border border-line px-3 py-1.5 text-sm font-bold disabled:opacity-40"
          onClick={onSave}
        >
          {saveState === "saving"
            ? bt("저장 중…", "Saving…")
            : bt("배치 저장", "Save layout")}
        </button>
        {saveState === "conflict" ? (
          <>
            <p role="alert" className="text-sm font-semibold">
              {bt(
                "다른 편집자가 먼저 저장했어요. 최신본을 불러온 뒤 다시 편집해 주세요.",
                "Someone else saved first. Reload the latest layout and edit again.",
              )}
            </p>
            <button
              type="button"
              className="text-sm font-bold underline underline-offset-4"
              onClick={onReload}
            >
              {bt("최신본 다시 불러오기", "Reload latest")}
            </button>
          </>
        ) : null}
        {saveState === "error" ? (
          <p role="alert" className="text-sm font-semibold">
            {bt(
              "저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
              "Couldn't save. Please try again shortly.",
            )}
          </p>
        ) : null}
      </div>

      {editMode ? (
        <p className="mt-2 text-xs text-fg-2">
          {bt(
            "무대에서 항목을 클릭해 고르고, 드래그로 옮기고, 모서리 손잡이로 크기를 바꿀 수 있어요. Delete 키로 지우고 방향키로 조금씩 움직입니다.",
            "On stage: click to select, drag to move, use the corner handle to resize, Delete to remove, arrow keys to nudge.",
          )}
        </p>
      ) : null}

      <div className="mt-4 border-t border-line pt-3">
        <div className="flex flex-wrap items-center gap-3">
          <h4 className="text-sm font-bold">
            {bt("공간 배경", "Space background")}
          </h4>
          <p className="text-xs text-fg-2" data-testid="layout-background-current">
            {bt(`현재 배경: ${backgroundLabel}`, `Current: ${backgroundLabel}`)}
          </p>
        </div>
        {backgroundError ? (
          <p role="alert" className="mt-2 text-sm font-semibold">
            {backgroundError}
          </p>
        ) : null}
        {editMode ? (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-line px-3 py-1.5 text-sm font-bold disabled:opacity-40"
                disabled={
                  (definition.background?.glb ?? null) ===
                  (defaultBackground?.glb ?? null)
                }
                onClick={() =>
                  onBackgroundChange(
                    defaultBackground ? { ...defaultBackground } : null,
                  )
                }
              >
                {bt("기본 배경으로", "Use default background")}
              </button>
              <button
                type="button"
                className="rounded-full border border-line px-3 py-1.5 text-sm font-bold disabled:opacity-40"
                disabled={!definition.background}
                onClick={() => onBackgroundChange(null)}
              >
                {bt("배경 없음", "No background")}
              </button>
              <label className="cursor-pointer rounded-full border border-line px-3 py-1.5 text-sm font-bold">
                {backgroundUploadState === "uploading"
                  ? bt("올리는 중…", "Uploading…")
                  : bt("GLB 배경 올리기", "Upload GLB background")}
                <input
                  type="file"
                  accept=".glb,model/gltf-binary"
                  className="sr-only"
                  disabled={backgroundUploadState === "uploading"}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) onBackgroundUpload(file);
                  }}
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-fg-2">
              {bt(
                "Godot 무대가 읽을 수 있는 무압축 GLB만 올릴 수 있어요 (최대 20MB). 올리면 바로 이 공간의 배경으로 지정되고, 배치 저장으로 확정됩니다.",
                "Only uncompressed GLB files the Godot stage can load are accepted (max 20MB). Uploading applies it to this space right away; saving the layout makes it final.",
              )}
            </p>
            {backgroundAssets.length > 0 ? (
              <ul className="mt-2 grid gap-1">
                {backgroundAssets.map((asset) => (
                  <li
                    key={asset.assetId}
                    className="flex flex-wrap items-center gap-2 text-sm"
                  >
                    <span className="font-semibold">{asset.fileName}</span>
                    <span className="text-xs text-fg-2">
                      {(asset.byteSize / (1024 * 1024)).toFixed(1)}MB
                    </span>
                    <button
                      type="button"
                      className="rounded-full border border-line px-2 py-1 text-xs font-bold disabled:opacity-40"
                      disabled={definition.background?.glb === asset.glbRef}
                      onClick={() =>
                        onBackgroundChange({
                          ...(definition.background ??
                            defaultBackground ??
                            {}),
                          glb: asset.glbRef,
                        })
                      }
                    >
                      {bt("이 배경으로 지정", "Use this background")}
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-line px-2 py-1 text-xs font-bold"
                      onClick={() => onBackgroundDelete(asset.assetId)}
                    >
                      {bt("지우기", "Delete")}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>

      {editMode ? (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className={labelClass}>
            {bt("추가할 구분", "Add category")}
            <select
              className={inputClass}
              value={addCategory}
              onChange={(event) => {
                const next = event.target.value as "zone" | "prop";
                setAddCategory(next);
                setAddKind(next === "zone" ? "focus" : "bench");
              }}
            >
              <option value="zone">{bt("구역", "Zone")}</option>
              <option value="prop">{bt("소품", "Prop")}</option>
            </select>
          </label>
          <label className={labelClass}>
            {bt("종류", "Kind")}
            <select
              className={inputClass}
              value={addKind}
              onChange={(event) => setAddKind(event.target.value)}
            >
              {kindOptions.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="rounded-full border border-line px-3 py-1.5 text-sm font-bold"
            onClick={() =>
              onCommand({ op: "add", category: addCategory, kind: addKind })
            }
          >
            {bt("항목 추가", "Add item")}
          </button>
        </div>
      ) : null}

      {editMode && selection ? (
        <form
          key={`${selection.category}:${selection.index}:${revision}`}
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const num = (field: string) =>
              Number.parseFloat(String(data.get(field) ?? "0")) || 0;
            onCommand({
              op: "update",
              category: selection.category,
              index: selection.index,
              fields: {
                name: String(data.get("name") ?? ""),
                kind: String(data.get("kind") ?? selection.kind),
                rect: [num("x"), num("y"), num("w"), num("h")],
              },
            });
          }}
        >
          <p className="w-full text-sm font-semibold" data-testid="layout-selection">
            {bt(
              `선택: ${selection.category === "zone" ? "구역" : "소품"} · ${selection.name || selection.kind}`,
              `Selected: ${selection.category} · ${selection.name || selection.kind}`,
            )}
          </p>
          <label className={labelClass}>
            {bt("이름", "Name")}
            <input
              name="name"
              defaultValue={selection.name}
              maxLength={80}
              className="w-36 rounded-lg border border-line bg-card px-2 py-1.5 text-sm"
            />
          </label>
          <label className={labelClass}>
            {bt("종류", "Kind")}
            <select name="kind" defaultValue={selection.kind} className={inputClass}>
              {(selection.category === "zone"
                ? GodotSpaceZoneKindSchema.options
                : GodotSpacePropKindSchema.options
              ).map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </label>
          {(
            [
              ["x", "X"],
              ["y", "Y"],
              ["w", bt("너비", "Width")],
              ["h", bt("높이", "Height")],
            ] as const
          ).map(([field, label], i) => (
            <label key={field} className={labelClass}>
              {label}
              <input
                name={field}
                type="number"
                step={10}
                min={0}
                defaultValue={selection.rect[i]}
                className={inputClass}
              />
            </label>
          ))}
          <button
            type="submit"
            className="rounded-full border border-line px-3 py-1.5 text-sm font-bold"
          >
            {bt("적용", "Apply")}
          </button>
          <button
            type="button"
            className="rounded-full border border-line px-3 py-1.5 text-sm font-bold"
            onClick={() =>
              onCommand({
                op: "delete",
                category: selection.category,
                index: selection.index,
              })
            }
          >
            {bt("삭제", "Delete")}
          </button>
        </form>
      ) : null}
    </section>
  );
}

export default StudioGodotLayoutPanel;
