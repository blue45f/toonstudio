import { useEffect, useId, useRef, useState } from "react";
import { Material, Mesh, Object3D } from "three";

import type { CharacterAuthoringAuthorityHookResult } from "./use-character-authoring-authority";
import type { CharacterMaterialOverrideV3 } from "../document/character-document-v3";
import type { StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

interface OutlineTarget { readonly materialId: string; readonly material: Material }

/** 이름이 유일하고 월드 단위 outlineWidthFactor를 제공하는 실제 재질만 편집한다. */
function characterOutlineTargets(root: unknown): readonly OutlineTarget[] {
  if (!(root instanceof Object3D)) return [];
  const materials = new Set<Material>();
  root.traverse((node) => {
    if (node instanceof Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
  });
  const named = new Map<string, Material[]>();
  for (const material of materials) {
    const id: unknown = material.userData.characterMaterialId;
    const materialId = typeof id === "string" && id.trim() ? id : material.name ? `material:${material.name}` : null;
    if (materialId) named.set(materialId, [...(named.get(materialId) ?? []), material]);
  }
  const targets: OutlineTarget[] = [];
  for (const [materialId, matches] of named) {
    const material = matches[0];
    if (matches.length !== 1 || !material) continue;
    const width: unknown = Reflect.get(material, "outlineWidthFactor");
    if (Reflect.get(material, "outlineWidthMode") === "worldCoordinates" && typeof width === "number" && Number.isFinite(width)) targets.push({ materialId, material });
  }
  return targets;
}

export function CharacterOutlineControls({ h, authoring }: {
  readonly h: StudioVrmPoserHost;
  readonly authoring: CharacterAuthoringAuthorityHookResult;
}) {
  const bt = useBilingual("CharacterOutlineControls");
  const prefix = `outline-preview/${useId()}`;
  const sequence = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const targets = characterOutlineTargets(h.vrm?.scene);
  const snapshot = authoring.snapshot;
  const ownPreview = snapshot.previewCommandId?.startsWith(prefix) === true;
  const foreignPreview = snapshot.previewDocument !== null && !ownPreview;
  const document = snapshot.previewDocument ?? snapshot.document;
  const first = targets[0];
  const stored = first ? document.look.materialOverrides.find((entry) => entry.materialId === first.materialId)?.outlineWidth : undefined;
  const actual: unknown = first ? Reflect.get(first.material, "outlineWidthFactor") : undefined;
  const width = stored ?? (typeof actual === "number" && Number.isFinite(actual) ? actual : 0);
  const disabled = !authoring.hydrated || targets.length === 0 || foreignPreview || Boolean(h.isCapturing || h.isSharingPose || h.isThumbnailCapturing);
  useEffect(() => () => {
    if (authoring.authority.getSnapshot().previewCommandId?.startsWith(prefix)) authoring.authority.cancelPreview();
  }, [authoring.authority, prefix]);
  function preview(nextWidth: number) {
    if (disabled) return;
    if (ownPreview) authoring.cancelPreview();
    const current = authoring.authority.getSnapshot().document;
    const overrides = new Map<string, CharacterMaterialOverrideV3>(current.look.materialOverrides.map((entry) => [entry.materialId, entry]));
    for (const target of targets) overrides.set(target.materialId, { ...overrides.get(target.materialId), materialId: target.materialId, outlineWidth: nextWidth });
    const receipt = authoring.beginPreview({ commandId: `${prefix}/${++sequence.current}`, label: bt("외곽선 두께 조절", "Adjust outline width"), source: "user",
      expectedDocumentId: current.documentId, expectedRevision: current.revision,
      operations: [{ kind: "set-material-overrides", overrides: [...overrides.values()] }] });
    setError(receipt.status === "applied" || receipt.status === "noop" ? null : receipt.reason);
  }
  return <section aria-label={bt("실제 재질 외곽선 조절", "Material outline controls")} className="space-y-2 rounded-2xl border border-line bg-card/70 p-3 text-xs text-fg-2">
    <h3 className="font-bold text-fg">{bt("외곽선", "Outline")}</h3>
    <p className="leading-relaxed text-fg-3">{bt("월드 단위 외곽선을 지원하는 재질에 미리 적용합니다. 적용하면 캐릭터 이력에 저장됩니다.", "Preview on materials supporting world-space outlines. Apply to save in character history.")}</p>
    <label className="block font-semibold">{bt("외곽선 두께", "Outline width")} · {(width * 1000).toFixed(1)} mm
      <input aria-label={bt("실제 외곽선 두께", "Material outline width")} type="range" min="0" max="0.03" step="0.0002" value={width} disabled={disabled} onChange={(event) => preview(Number(event.currentTarget.value))} className="h-11 w-full disabled:opacity-40" />
    </label>
    {targets.length === 0 ? <p role="status">{bt("이 모델에서 월드 단위 외곽선을 안전하게 조절할 재질을 찾지 못했습니다. 화면 단위 외곽선과 이름이 중복된 재질은 원본을 유지합니다.", "No unambiguous world-space outline material was found. Screen-space outlines and duplicate material names remain unchanged.")}</p> : null}
    {foreignPreview ? <p role="status">{bt("다른 도구의 미리보기를 적용하거나 취소한 뒤 조절할 수 있습니다.", "Apply or cancel the other tool's preview before editing.")}</p> : null}
    <div className="flex gap-2">
      <button type="button" className="min-h-11 rounded-lg border border-line px-3 disabled:opacity-40" disabled={disabled || !ownPreview} onClick={() => { authoring.commitPreview(); setError(null); }}>{bt("외곽선 적용", "Apply outline")}</button>
      <button type="button" className="min-h-11 rounded-lg border border-line px-3 disabled:opacity-40" disabled={!ownPreview} onClick={() => { authoring.cancelPreview(); setError(null); }}>{bt("외곽선 취소", "Cancel outline")}</button>
    </div>
    <p className="text-fg-3">{bt("Cubic MatCap, 비등방성 외곽선, 광원·월드 하이라이트 보정은 현재 렌더러에 연결되지 않아 제공하지 않습니다.", "Cubic MatCap, anisotropic outlines and light/world highlight calibration are unavailable in the current renderer.")}</p>
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
