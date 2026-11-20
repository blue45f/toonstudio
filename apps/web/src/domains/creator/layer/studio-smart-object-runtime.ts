/**
 * Photoshop / Photopea 라이브 스마트 오브젝트 런타임 엔진.
 *
 * - OPFS 콘텐츠 해시 기반 서브도큐먼트 참조(`opfs://smart-objects/<hash>.tsdoc`)
 * - 1개 원본 편집 시 모든 링크드 인스턴스 원자적 일괄 갱신 + 독립 복제("New Smart Object via Copy")
 * - 비파괴 라이브 메쉬 워프(정규화 UV 격자, 재편집 시 각 인스턴스 워프 보존)
 * - PSD `PlLd` / `SoLd` Placed Layer Descriptor 양방향 호환 직렬화
 */

export interface SmartObjectPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface SmartObjectTransform2D {
  readonly x: number;
  readonly y: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly rotationDeg: number;
  readonly skewXDeg: number;
  readonly skewYDeg: number;
}

export interface SmartObjectLiveWarpMesh {
  readonly rows: number;
  readonly cols: number;
  /** 정규화 로컬 공간 `[0, 1] × [0, 1]` 위의 `(rows + 1) × (cols + 1)` 제어점. */
  readonly controlPoints: readonly SmartObjectPoint2D[];
  readonly presetStyle: "custom" | "arc" | "flag" | "bulge" | "perspective";
  readonly bendValue: number;
}

export interface SmartObjectSubDocument {
  readonly subDocId: string;
  readonly name: string;
  readonly mimeType: "application/x-toonstudio-doc" | "image/png" | "image/svg+xml";
  readonly width: number;
  readonly height: number;
  readonly revision: number;
  readonly contentHash: string;
  readonly opfsPath: string;
  readonly payloadBase64: string;
  readonly updatedAtIso: string;
}

export interface SmartObjectInstance {
  readonly instanceId: string;
  readonly layerId: string;
  readonly subDocId: string;
  readonly transform: SmartObjectTransform2D;
  readonly warpMesh: SmartObjectLiveWarpMesh;
  readonly syncedRevision: number;
  readonly syncedContentHash: string;
  readonly locked: boolean;
}

/** PSD `PlLd` / `SoLd` 호환 디스크립터. */
export interface PsdSmartObjectDescriptor {
  readonly signature: "SoLd" | "PlLd";
  readonly version: 4 | 5;
  readonly Idnt: string;
  readonly placed: string;
  readonly Sz: { readonly width: number; readonly height: number };
  /** 시계 방향 4꼭짓점 8좌표 `[x0,y0, x1,y1, x2,y2, x3,y3]`. */
  readonly nonAffineTransform: readonly [number, number, number, number, number, number, number, number];
  readonly warp: {
    readonly warpStyle: SmartObjectLiveWarpMesh["presetStyle"];
    readonly warpValue: number;
    readonly meshRows: number;
    readonly meshCols: number;
    readonly controlPoints: readonly SmartObjectPoint2D[];
  };
  readonly opfsRef: string;
  readonly contentHash: string;
}

function fnv1a64Hex(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i) & 0xff;
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((c + i) & 0xff), 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export function createIdentitySmartObjectTransform(x = 0, y = 0): SmartObjectTransform2D {
  return { x, y, scaleX: 1, scaleY: 1, rotationDeg: 0, skewXDeg: 0, skewYDeg: 0 };
}

/** 정규화 항등 라이브 워프 메쉬(`rows × cols` 셀)를 생성한다. */
export function createIdentityWarpMesh(
  rows = 3,
  cols = 3,
  presetStyle: SmartObjectLiveWarpMesh["presetStyle"] = "custom",
): SmartObjectLiveWarpMesh {
  const safeRows = Math.max(1, Math.min(16, Math.floor(rows)));
  const safeCols = Math.max(1, Math.min(16, Math.floor(cols)));
  const controlPoints: SmartObjectPoint2D[] = [];
  for (let r = 0; r <= safeRows; r += 1) {
    for (let c = 0; c <= safeCols; c += 1) {
      controlPoints.push({ x: c / safeCols, y: r / safeRows });
    }
  }
  return { rows: safeRows, cols: safeCols, controlPoints, presetStyle, bendValue: 0 };
}

/**
 * 라이브 메쉬 워프 위의 정규화 좌표 `(u, v) ∈ [0, 1]²`를 변형된 로컬 정규화 좌표로 평가한다.
 */
export function evaluateSmartObjectWarpPoint(
  mesh: SmartObjectLiveWarpMesh,
  u: number,
  v: number,
): SmartObjectPoint2D {
  const cu = Math.max(0, Math.min(1, Number.isFinite(u) ? u : 0));
  const cv = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
  const colF = cu * mesh.cols;
  const rowF = cv * mesh.rows;
  const c0 = Math.min(mesh.cols - 1, Math.floor(colF));
  const r0 = Math.min(mesh.rows - 1, Math.floor(rowF));
  const tx = colF - c0;
  const ty = rowF - r0;
  const stride = mesh.cols + 1;

  const p00 = mesh.controlPoints[r0 * stride + c0] ?? { x: cu, y: cv };
  const p10 = mesh.controlPoints[r0 * stride + c0 + 1] ?? p00;
  const p01 = mesh.controlPoints[(r0 + 1) * stride + c0] ?? p00;
  const p11 = mesh.controlPoints[(r0 + 1) * stride + c0 + 1] ?? p00;

  const topX = p00.x * (1 - tx) + p10.x * tx;
  const topY = p00.y * (1 - tx) + p10.y * tx;
  const botX = p01.x * (1 - tx) + p11.x * tx;
  const botY = p01.y * (1 - tx) + p11.y * tx;

  return {
    x: topX * (1 - ty) + botX * ty,
    y: topY * (1 - ty) + botY * ty,
  };
}

/** 서브도큐먼트 로컬 UV `(u, v)`를 워프 → 아핀 변환을 거쳐 최종 캔버스 좌표로 투영한다. */
export function projectSmartObjectUvToCanvas(
  instance: SmartObjectInstance,
  subDoc: Pick<SmartObjectSubDocument, "width" | "height">,
  u: number,
  v: number,
): SmartObjectPoint2D {
  const warped = evaluateSmartObjectWarpPoint(instance.warpMesh, u, v);
  const lx = warped.x * subDoc.width * instance.transform.scaleX;
  const ly = warped.y * subDoc.height * instance.transform.scaleY;
  const skewX = Math.tan((instance.transform.skewXDeg * Math.PI) / 180);
  const skewY = Math.tan((instance.transform.skewYDeg * Math.PI) / 180);
  const sx = lx + ly * skewX;
  const sy = ly + lx * skewY;
  const rad = (instance.transform.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: instance.transform.x + sx * cos - sy * sin,
    y: instance.transform.y + sx * sin + sy * cos,
  };
}

/** 인스턴스·서브도큐먼트를 Photoshop `SoLd` 호환 디스크립터로 직렬화한다. */
export function encodePsdPlacedLayerDescriptor(
  instance: SmartObjectInstance,
  subDoc: SmartObjectSubDocument,
): PsdSmartObjectDescriptor {
  const tl = projectSmartObjectUvToCanvas(instance, subDoc, 0, 0);
  const tr = projectSmartObjectUvToCanvas(instance, subDoc, 1, 0);
  const br = projectSmartObjectUvToCanvas(instance, subDoc, 1, 1);
  const bl = projectSmartObjectUvToCanvas(instance, subDoc, 0, 1);
  return {
    signature: "SoLd",
    version: 5,
    Idnt: instance.instanceId,
    placed: subDoc.subDocId,
    Sz: { width: subDoc.width, height: subDoc.height },
    nonAffineTransform: [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y],
    warp: {
      warpStyle: instance.warpMesh.presetStyle,
      warpValue: instance.warpMesh.bendValue,
      meshRows: instance.warpMesh.rows,
      meshCols: instance.warpMesh.cols,
      controlPoints: [...instance.warpMesh.controlPoints],
    },
    opfsRef: subDoc.opfsPath,
    contentHash: subDoc.contentHash,
  };
}

/** Photoshop `PlLd`/`SoLd` 디스크립터로부터 스마트 오브젝트 인스턴스 초안을 복원한다. */
export function decodePsdPlacedLayerDescriptor(
  descriptor: PsdSmartObjectDescriptor,
  layerId: string,
): SmartObjectInstance {
  const [x0, y0, x1, y1, , , x3, y3] = descriptor.nonAffineTransform;
  const edgeTop = Math.hypot(x1 - x0, y1 - y0);
  const edgeLeft = Math.hypot(x3 - x0, y3 - y0);
  const rotationDeg = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
  const scaleX = descriptor.Sz.width > 0 ? edgeTop / descriptor.Sz.width : 1;
  const scaleY = descriptor.Sz.height > 0 ? edgeLeft / descriptor.Sz.height : 1;

  return {
    instanceId: descriptor.Idnt,
    layerId,
    subDocId: descriptor.placed,
    transform: {
      x: x0,
      y: y0,
      scaleX: Number(scaleX.toFixed(6)),
      scaleY: Number(scaleY.toFixed(6)),
      rotationDeg: Number(rotationDeg.toFixed(4)),
      skewXDeg: 0,
      skewYDeg: 0,
    },
    warpMesh: {
      rows: descriptor.warp.meshRows,
      cols: descriptor.warp.meshCols,
      controlPoints: [...descriptor.warp.controlPoints],
      presetStyle: descriptor.warp.warpStyle,
      bendValue: descriptor.warp.warpValue,
    },
    syncedRevision: 1,
    syncedContentHash: descriptor.contentHash,
    locked: false,
  };
}

/**
 * OPFS 콘텐츠 해시 서브도큐먼트 저장소 & 링크드 인스턴스 일괄 갱신 런타임.
 */
export class StudioSmartObjectRuntime {
  private readonly subDocs = new Map<string, SmartObjectSubDocument>();
  private readonly instances = new Map<string, SmartObjectInstance>();
  private seq = 0;

  createSubDocument(input: {
    readonly subDocId?: string;
    readonly name: string;
    readonly mimeType?: SmartObjectSubDocument["mimeType"];
    readonly width: number;
    readonly height: number;
    readonly payloadBase64: string;
    readonly nowIso?: string;
  }): SmartObjectSubDocument {
    this.seq += 1;
    const contentHash = fnv1a64Hex(`${input.width}x${input.height}:${input.payloadBase64}`);
    const subDocId = input.subDocId ?? `subdoc-${contentHash.slice(0, 10)}-${this.seq}`;
    const doc: SmartObjectSubDocument = {
      subDocId,
      name: input.name.trim() || "스마트 오브젝트",
      mimeType: input.mimeType ?? "application/x-toonstudio-doc",
      width: Math.max(1, Math.round(input.width)),
      height: Math.max(1, Math.round(input.height)),
      revision: 1,
      contentHash,
      opfsPath: `opfs://smart-objects/${contentHash}.tsdoc`,
      payloadBase64: input.payloadBase64,
      updatedAtIso: input.nowIso ?? new Date().toISOString(),
    };
    this.subDocs.set(doc.subDocId, doc);
    return doc;
  }

  placeInstance(input: {
    readonly instanceId?: string;
    readonly layerId: string;
    readonly subDocId: string;
    readonly transform?: Partial<SmartObjectTransform2D>;
    readonly warpMesh?: SmartObjectLiveWarpMesh;
  }): SmartObjectInstance {
    const subDoc = this.subDocs.get(input.subDocId);
    if (!subDoc) {
      throw new Error(`존재하지 않는 스마트 오브젝트 서브도큐먼트입니다: ${input.subDocId}`);
    }
    this.seq += 1;
    const instanceId = input.instanceId ?? `so-inst-${this.seq}`;
    const instance: SmartObjectInstance = {
      instanceId,
      layerId: input.layerId,
      subDocId: subDoc.subDocId,
      transform: { ...createIdentitySmartObjectTransform(), ...input.transform },
      warpMesh: input.warpMesh ?? createIdentityWarpMesh(3, 3),
      syncedRevision: subDoc.revision,
      syncedContentHash: subDoc.contentHash,
      locked: false,
    };
    this.instances.set(instance.instanceId, instance);
    return instance;
  }

  /** 동일 원본을 공유하는 링크드 인스턴스를 복제한다. */
  duplicateAsLinkedInstance(sourceInstanceId: string, nextLayerId: string): SmartObjectInstance {
    const source = this.instances.get(sourceInstanceId);
    if (!source) throw new Error(`복제할 스마트 오브젝트 인스턴스를 찾지 못했습니다: ${sourceInstanceId}`);
    return this.placeInstance({
      layerId: nextLayerId,
      subDocId: source.subDocId,
      transform: { ...source.transform, x: source.transform.x + 24, y: source.transform.y + 24 },
      warpMesh: { ...source.warpMesh, controlPoints: [...source.warpMesh.controlPoints] },
    });
  }

  /** 독립 서브도큐먼트를 복제하는 "새 스마트 오브젝트로 복제(New Smart Object via Copy)". */
  duplicateAsIndependentCopy(
    sourceInstanceId: string,
    nextLayerId: string,
    nowIso?: string,
  ): { readonly subDoc: SmartObjectSubDocument; readonly instance: SmartObjectInstance } {
    const source = this.instances.get(sourceInstanceId);
    if (!source) throw new Error(`복제할 스마트 오브젝트 인스턴스를 찾지 못했습니다: ${sourceInstanceId}`);
    const originDoc = this.subDocs.get(source.subDocId);
    if (!originDoc) throw new Error(`원본 서브도큐먼트를 찾지 못했습니다: ${source.subDocId}`);

    const clonedDoc = this.createSubDocument({
      name: `${originDoc.name} 사본`,
      mimeType: originDoc.mimeType,
      width: originDoc.width,
      height: originDoc.height,
      payloadBase64: originDoc.payloadBase64,
      nowIso,
    });
    const instance = this.placeInstance({
      layerId: nextLayerId,
      subDocId: clonedDoc.subDocId,
      transform: { ...source.transform, x: source.transform.x + 24, y: source.transform.y + 24 },
      warpMesh: { ...source.warpMesh, controlPoints: [...source.warpMesh.controlPoints] },
    });
    return { subDoc: clonedDoc, instance };
  }

  /** 인스턴스의 비파괴 라이브 메쉬 워프 제어점 하나를 수정한다. */
  patchInstanceWarpControlPoint(
    instanceId: string,
    row: number,
    col: number,
    point: SmartObjectPoint2D,
  ): SmartObjectInstance {
    const current = this.instances.get(instanceId);
    if (!current) throw new Error(`스마트 오브젝트 인스턴스를 찾지 못했습니다: ${instanceId}`);
    const stride = current.warpMesh.cols + 1;
    const index = row * stride + col;
    if (row < 0 || row > current.warpMesh.rows || col < 0 || col > current.warpMesh.cols) {
      throw new Error(`워프 제어점 인덱스(${row}, ${col})가 격자 범위를 벗어났습니다.`);
    }
    const nextPoints = current.warpMesh.controlPoints.map((pt, i) => (i === index ? point : pt));
    const updated: SmartObjectInstance = {
      ...current,
      warpMesh: { ...current.warpMesh, controlPoints: nextPoints },
    };
    this.instances.set(instanceId, updated);
    return updated;
  }

  /**
   * 원본 서브도큐먼트를 갱신하고, 해당 원본을 참조하는 모든 링크드 인스턴스를
   * 각자의 변형·라이브 워프를 유지한 채 원자적으로 일괄 동기화한다.
   */
  updateSubDocumentAndPropagate(
    subDocId: string,
    patch: {
      readonly payloadBase64: string;
      readonly width?: number;
      readonly height?: number;
      readonly nowIso?: string;
    },
  ): {
    readonly subDoc: SmartObjectSubDocument;
    readonly updatedInstances: readonly SmartObjectInstance[];
  } {
    const prev = this.subDocs.get(subDocId);
    if (!prev) throw new Error(`서브도큐먼트를 찾지 못했습니다: ${subDocId}`);
    const nextWidth = patch.width !== undefined ? Math.max(1, Math.round(patch.width)) : prev.width;
    const nextHeight = patch.height !== undefined ? Math.max(1, Math.round(patch.height)) : prev.height;
    const nextHash = fnv1a64Hex(`${nextWidth}x${nextHeight}:${patch.payloadBase64}`);
    const nextDoc: SmartObjectSubDocument = {
      ...prev,
      width: nextWidth,
      height: nextHeight,
      revision: prev.revision + 1,
      contentHash: nextHash,
      opfsPath: `opfs://smart-objects/${nextHash}.tsdoc`,
      payloadBase64: patch.payloadBase64,
      updatedAtIso: patch.nowIso ?? new Date().toISOString(),
    };
    this.subDocs.set(subDocId, nextDoc);

    const updatedInstances: SmartObjectInstance[] = [];
    for (const [id, inst] of this.instances.entries()) {
      if (inst.subDocId !== subDocId) continue;
      const synced: SmartObjectInstance = {
        ...inst,
        syncedRevision: nextDoc.revision,
        syncedContentHash: nextDoc.contentHash,
      };
      this.instances.set(id, synced);
      updatedInstances.push(synced);
    }
    return { subDoc: nextDoc, updatedInstances };
  }

  /** 인스턴스를 삭제하고 참조 카운트가 0인 고아 서브도큐먼트를 정리한다. */
  removeInstance(instanceId: string): { readonly removed: boolean; readonly prunedSubDocIds: readonly string[] } {
    const existed = this.instances.delete(instanceId);
    if (!existed) return { removed: false, prunedSubDocIds: [] };
    const referenced = new Set<string>([...this.instances.values()].map((i) => i.subDocId));
    const prunedSubDocIds: string[] = [];
    for (const subDocId of [...this.subDocs.keys()]) {
      if (!referenced.has(subDocId)) {
        this.subDocs.delete(subDocId);
        prunedSubDocIds.push(subDocId);
      }
    }
    return { removed: true, prunedSubDocIds };
  }

  getSubDocument(subDocId: string): SmartObjectSubDocument | undefined {
    return this.subDocs.get(subDocId);
  }

  getInstance(instanceId: string): SmartObjectInstance | undefined {
    return this.instances.get(instanceId);
  }

  listLinkedInstances(subDocId: string): readonly SmartObjectInstance[] {
    return [...this.instances.values()].filter((inst) => inst.subDocId === subDocId);
  }
}
