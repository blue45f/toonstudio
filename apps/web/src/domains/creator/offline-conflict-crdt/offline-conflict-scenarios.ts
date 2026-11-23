/**
 * 다중 기기 오프라인 재연결 진단·시뮬레이션 시나리오 생성기.
 * 데스크톱과 태블릿이 네트워크 단절 중 동일 원고를 편집한 실제 충돌 패턴을 재현한다.
 */

import {
  createHlc,
  createVectorClock,
  incrementVectorClock,
  tickHlc,
} from "./hlc-vector-clock";
import {
  createRasterTileDelta,
  fnv1a64Hex,
  makeTileKey,
  mergeOfflineDocumentStates,
  sealOfflineDocumentDelta,
  type OfflineDocumentDelta,
  type OfflineLayerMeta,
  type OfflineMergePlan,
  type OfflineSpeechBubble,
  type TileBounds,
  type TileStrokeOp,
} from "./tile-layer-crdt-merger";

export interface OfflineConflictScenarioLabels {
  readonly desktopLabel: string;
  readonly tabletLabel: string;
  readonly inkLayerName: string;
  readonly colorLayerName: string;
  readonly bgLayerName: string;
  readonly bubbleBaseText: string;
  readonly bubbleEditedText: string;
}

function makeStroke(
  strokeId: string,
  deviceId: string,
  brushId: string,
  pointCount: number,
  bounds: TileBounds,
  hlc: ReturnType<typeof createHlc>,
): TileStrokeOp {
  return Object.freeze({
    strokeId,
    deviceId,
    brushId,
    pointCount,
    bounds,
    hlc,
    opHash: fnv1a64Hex(
      `${strokeId}:${deviceId}:${brushId}:${pointCount}:${bounds.x},${bounds.y},${bounds.width},${bounds.height}`,
    ),
  });
}

export function buildMultiDeviceOfflineConflictScenario(
  labels: OfflineConflictScenarioLabels,
  options?: { readonly tamperRemoteTile?: boolean },
): OfflineMergePlan {
  const baseMs = 1_764_000_000_000;
  const baseHlc = createHlc("desktop-mac", baseMs, 0);
  const baseVc = createVectorClock({ "desktop-mac": 1, "ipad-pro": 1 });

  const baseInkStroke = makeStroke(
    "base-ink-01",
    "desktop-mac",
    "g-pen-pro",
    42,
    { x: 12, y: 18, width: 120, height: 96 },
    baseHlc,
  );
  const baseColorStroke = makeStroke(
    "base-color-01",
    "desktop-mac",
    "watercolor-wash",
    28,
    { x: 24, y: 40, width: 140, height: 110 },
    baseHlc,
  );

  const baseBgLayer: OfflineLayerMeta = {
    layerId: "layer-bg",
    name: labels.bgLayerName,
    visible: true,
    opacity: 1,
    blendMode: "normal",
    zOrder: 0,
    locked: false,
    hlc: baseHlc,
    vectorClock: baseVc,
  };
  const baseColorLayer: OfflineLayerMeta = {
    layerId: "layer-color",
    name: labels.colorLayerName,
    visible: true,
    opacity: 0.92,
    blendMode: "multiply",
    zOrder: 1,
    locked: false,
    hlc: baseHlc,
    vectorClock: baseVc,
  };
  const baseInkLayer: OfflineLayerMeta = {
    layerId: "layer-ink",
    name: labels.inkLayerName,
    visible: true,
    opacity: 1,
    blendMode: "normal",
    zOrder: 2,
    locked: false,
    hlc: baseHlc,
    vectorClock: baseVc,
  };
  const baseBubble: OfflineSpeechBubble = {
    bubbleId: "bubble-01",
    layerId: "layer-ink",
    text: labels.bubbleBaseText,
    x: 320,
    y: 120,
    width: 180,
    height: 90,
    fontSize: 16,
    style: "speech",
    hlc: baseHlc,
    vectorClock: baseVc,
  };

  const base = sealOfflineDocumentDelta({
    documentId: "episode-04-scene-02",
    deviceId: "desktop-mac",
    deviceLabel: labels.desktopLabel,
    hlc: baseHlc,
    vectorClock: baseVc,
    layers: {
      "layer-bg": baseBgLayer,
      "layer-color": baseColorLayer,
      "layer-ink": baseInkLayer,
    },
    tiles: {
      [makeTileKey("layer-ink", 0, 0)]: createRasterTileDelta({
        layerId: "layer-ink",
        tileX: 0,
        tileY: 0,
        strokes: [baseInkStroke],
        hlc: baseHlc,
        vectorClock: baseVc,
      }),
      [makeTileKey("layer-color", 0, 0)]: createRasterTileDelta({
        layerId: "layer-color",
        tileX: 0,
        tileY: 0,
        strokes: [baseColorStroke],
        hlc: baseHlc,
        vectorClock: baseVc,
      }),
    },
    bubbles: {
      "bubble-01": baseBubble,
    },
  });

  // 로컬(데스크톱): 오프라인 중 (layer-ink, 0, 0) 수정 + 비충돌 타일 (layer-ink, 1, 0) 추가 + 말풍선 대사 수정
  const localHlc1 = tickHlc(baseHlc, baseMs + 14_000);
  const localHlc2 = tickHlc(localHlc1, baseMs + 28_000);
  const localVc = incrementVectorClock(incrementVectorClock(baseVc, "desktop-mac"), "desktop-mac");

  const localInkConflictStrokes = [
    baseInkStroke,
    makeStroke("desk-ink-02", "desktop-mac", "g-pen-pro", 64, { x: 48, y: 42, width: 136, height: 118 }, localHlc1),
    makeStroke("desk-ink-03", "desktop-mac", "maru-pen", 38, { x: 84, y: 70, width: 92, height: 84 }, localHlc2),
  ];
  const localAutoMergeTile = createRasterTileDelta({
    layerId: "layer-ink",
    tileX: 1,
    tileY: 0,
    strokes: [
      makeStroke("desk-ink-04", "desktop-mac", "g-pen-pro", 52, { x: 20, y: 30, width: 160, height: 120 }, localHlc2),
    ],
    hlc: localHlc2,
    vectorClock: localVc,
  });

  const sealedBaseBubble = base.bubbles["bubble-01"] ?? baseBubble;
  const sealedBaseBgLayer = base.layers["layer-bg"] ?? baseBgLayer;

  const local = sealOfflineDocumentDelta({
    documentId: base.documentId,
    deviceId: "desktop-mac",
    deviceLabel: labels.desktopLabel,
    hlc: localHlc2,
    vectorClock: localVc,
    layers: base.layers,
    tiles: {
      ...base.tiles,
      [makeTileKey("layer-ink", 0, 0)]: createRasterTileDelta({
        layerId: "layer-ink",
        tileX: 0,
        tileY: 0,
        strokes: localInkConflictStrokes,
        hlc: localHlc2,
        vectorClock: localVc,
      }),
      [localAutoMergeTile.tileKey]: localAutoMergeTile,
    },
    bubbles: {
      "bubble-01": {
        ...sealedBaseBubble,
        text: labels.bubbleEditedText,
        hlc: localHlc2,
        vectorClock: localVc,
        fieldClocks: {
          ...sealedBaseBubble.fieldClocks,
          text: localHlc2,
        },
      },
    },
  });

  // 원격(아이패드): 오프라인 중 동일 타일 (layer-ink, 0, 0) 동시 수정 + 비충돌 타일 (layer-bg, 0, 1) 추가 + 말풍선 좌표 이동
  const remoteBaseHlc = createHlc("ipad-pro", baseMs + 16_000, 0);
  const remoteHlc1 = tickHlc(remoteBaseHlc, baseMs + 22_000);
  const remoteHlc2 = tickHlc(remoteHlc1, baseMs + 35_000);
  const remoteVc = incrementVectorClock(incrementVectorClock(baseVc, "ipad-pro"), "ipad-pro");

  const remoteInkConflictStrokes = [
    baseInkStroke,
    makeStroke("ipad-ink-02", "ipad-pro", "calligraphy-nib", 58, { x: 76, y: 58, width: 128, height: 112 }, remoteHlc1),
    makeStroke("ipad-ink-03", "ipad-pro", "g-pen-pro", 44, { x: 100, y: 84, width: 88, height: 76 }, remoteHlc2),
  ];
  const remoteAutoMergeTile = createRasterTileDelta({
    layerId: "layer-bg",
    tileX: 0,
    tileY: 1,
    strokes: [
      makeStroke("ipad-bg-01", "ipad-pro", "cloud-wash", 75, { x: 16, y: 24, width: 210, height: 168 }, remoteHlc2),
    ],
    hlc: remoteHlc2,
    vectorClock: remoteVc,
  });

  let remote: OfflineDocumentDelta = sealOfflineDocumentDelta({
    documentId: base.documentId,
    deviceId: "ipad-pro",
    deviceLabel: labels.tabletLabel,
    hlc: remoteHlc2,
    vectorClock: remoteVc,
    layers: {
      ...base.layers,
      "layer-bg": {
        ...sealedBaseBgLayer,
        opacity: 0.85,
        hlc: remoteHlc1,
        vectorClock: remoteVc,
        fieldClocks: {
          ...sealedBaseBgLayer.fieldClocks,
          opacity: remoteHlc1,
        },
      },
    },
    tiles: {
      ...base.tiles,
      [makeTileKey("layer-ink", 0, 0)]: createRasterTileDelta({
        layerId: "layer-ink",
        tileX: 0,
        tileY: 0,
        strokes: remoteInkConflictStrokes,
        hlc: remoteHlc2,
        vectorClock: remoteVc,
      }),
      [remoteAutoMergeTile.tileKey]: remoteAutoMergeTile,
    },
    bubbles: {
      "bubble-01": {
        ...sealedBaseBubble,
        x: 348,
        y: 136,
        hlc: remoteHlc2,
        vectorClock: remoteVc,
        fieldClocks: {
          ...sealedBaseBubble.fieldClocks,
          x: remoteHlc2,
          y: remoteHlc2,
        },
      },
    },
  });

  if (options?.tamperRemoteTile) {
    const targetKey = makeTileKey("layer-ink", 0, 0);
    const originalTile = remote.tiles[targetKey];
    if (originalTile && originalTile.strokes.length > 0) {
      const tamperedStrokes = originalTile.strokes.map((stroke, idx) =>
        idx === 0 ? { ...stroke, opHash: "deadbeef00000000" } : stroke,
      );
      remote = {
        ...remote,
        tiles: {
          ...remote.tiles,
          [targetKey]: {
            ...originalTile,
            strokes: tamperedStrokes,
          },
        },
      };
    }
  }

  return mergeOfflineDocumentStates(base, local, remote);
}
