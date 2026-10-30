/**
 * 합성 픽스처: `CSFCHUNK` 문서(`.clip`)를 제3자 공개 명세(S1·S2, 교차 확인 표는 설계 문서
 * `chunked-sqlite-document-reader-secondary-spec-2026-10-29.md`)가 적은 표·열 이름대로 만든다. 읽기 코드와 같은 이해에서 나온 인코더이므로
 * 이것만으로는 읽기 코드의 정확성을 증명하지 못한다. 실제 파일이 아니다.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  encodeClipContainer,
  encodeClipExternalChunkPayload,
  encodeClipHeadPayload,
  planClipContainerLayout,
} from "../../../packages/studio-format-gateway/src/chunked-sqlite-container";

import { buildOffscreenFixture, type FixtureOffscreenSpec } from "./chunked-sqlite-block-fixtures";

export type FixtureSqlValue = number | string | null | Uint8Array;

type ColumnType = "INTEGER" | "REAL" | "TEXT" | "BLOB";

const CANVAS_SCHEMA: ReadonlyArray<readonly [string, ColumnType]> = [
  ["MainId", "INTEGER"],
  ["CanvasUnit", "INTEGER"],
  ["CanvasWidth", "REAL"],
  ["CanvasHeight", "REAL"],
  ["CanvasResolution", "REAL"],
  ["CanvasRootFolder", "INTEGER"],
  ["CanvasDefaultColorTypeIndex", "INTEGER"],
  ["CanvasChannelBytes", "INTEGER"],
  ["CanvasDefaultChannelOrder", "INTEGER"],
  ["CanvasWorkTime", "INTEGER"],
];

const LAYER_SCHEMA: ReadonlyArray<readonly [string, ColumnType]> = [
  ["MainId", "INTEGER"],
  ["CanvasId", "INTEGER"],
  ["LayerName", "TEXT"],
  ["LayerType", "INTEGER"],
  ["LayerLock", "INTEGER"],
  ["LayerClip", "INTEGER"],
  ["LayerOpacity", "INTEGER"],
  ["LayerComposite", "INTEGER"],
  ["LayerVisibility", "INTEGER"],
  ["LayerFolder", "INTEGER"],
  ["LayerFirstChildIndex", "INTEGER"],
  ["LayerNextIndex", "INTEGER"],
  ["LayerOffsetX", "INTEGER"],
  ["LayerOffsetY", "INTEGER"],
  ["LayerRenderOffscrOffsetX", "INTEGER"],
  ["LayerRenderOffscrOffsetY", "INTEGER"],
  ["LayerMaskOffsetX", "INTEGER"],
  ["LayerMaskOffsetY", "INTEGER"],
  ["LayerMaskOffscrOffsetX", "INTEGER"],
  ["LayerMaskOffscrOffsetY", "INTEGER"],
  ["LayerRenderMipmap", "INTEGER"],
  ["LayerLayerMaskMipmap", "INTEGER"],
  ["LayerUuid", "TEXT"],
  ["DrawColorEnable", "INTEGER"],
  ["DrawColorMainRed", "INTEGER"],
  ["DrawColorMainGreen", "INTEGER"],
  ["DrawColorMainBlue", "INTEGER"],
  ["DrawToRenderOffscreenType", "INTEGER"],
  ["TextLayerString", "BLOB"],
  ["GradationFillInfo", "BLOB"],
  ["FilterLayerInfo", "BLOB"],
  ["FirstLayerObject", "INTEGER"],
  ["ResizableImageInfo", "BLOB"],
  ["ComicFrameLineMipmap", "INTEGER"],
  ["VectorNormalStrokeIndex", "BLOB"],
  // 읽기 코드가 무시해야 하는 열.
  ["LayerEffectInfo", "BLOB"],
  ["FutureColumn", "INTEGER"],
];

const TABLES: Readonly<Record<string, ReadonlyArray<readonly [string, ColumnType]>>> = {
  Canvas: CANVAS_SCHEMA,
  Layer: LAYER_SCHEMA,
  Mipmap: [
    ["MainId", "INTEGER"],
    ["CanvasId", "INTEGER"],
    ["LayerId", "INTEGER"],
    ["MipmapCount", "INTEGER"],
    ["BaseMipmapInfo", "INTEGER"],
  ],
  MipmapInfo: [
    ["MainId", "INTEGER"],
    ["CanvasId", "INTEGER"],
    ["LayerId", "INTEGER"],
    ["NextIndex", "INTEGER"],
    ["Offscreen", "INTEGER"],
    ["ThisScale", "REAL"],
  ],
  Offscreen: [
    ["MainId", "INTEGER"],
    ["CanvasId", "INTEGER"],
    ["LayerId", "INTEGER"],
    ["Attribute", "BLOB"],
    ["BlockData", "BLOB"],
  ],
  CanvasPreview: [
    ["MainId", "INTEGER"],
    ["CanvasId", "INTEGER"],
    ["ImageType", "INTEGER"],
    ["ImageWidth", "INTEGER"],
    ["ImageHeight", "INTEGER"],
    ["ImageData", "BLOB"],
  ],
  VectorObjectList: [
    ["MainId", "INTEGER"],
    ["CanvasId", "INTEGER"],
    ["LayerId", "INTEGER"],
  ],
  ExternalChunk: [
    ["ExternalID", "TEXT"],
    ["Offset", "INTEGER"],
  ],
};

export interface FixtureOffscreenRef extends FixtureOffscreenSpec {
  /** 첫 단계 `MipmapInfo.ThisScale`. 기본 100. */
  readonly scale?: number;
  /** true면 외부 청크(`CHNKExta`)를 컨테이너에 넣지 않는다(DB는 외부 ID를 가리킨다). */
  readonly omitExternal?: boolean;
  /** true면 `Offscreen.BlockData`를 NULL로 둔다. */
  readonly omitBlockData?: boolean;
  /** `Offscreen.Attribute`를 이 바이트로 바꾼다(손상 시험용). */
  readonly attributeOverride?: Uint8Array;
}

export interface FixtureLayer {
  readonly id: number;
  readonly name?: string;
  readonly layerType?: number;
  readonly folder?: boolean;
  /** 자식 레이어 id, 아래에서 위 순서. `LayerFirstChildIndex`와 형제의 `LayerNextIndex`가 이로부터 계산된다. */
  readonly children?: readonly number[];
  readonly visibility?: number;
  readonly opacity?: number;
  readonly composite?: number;
  readonly clip?: number;
  readonly lock?: number;
  readonly offset?: readonly [number, number];
  readonly renderOffset?: readonly [number, number];
  readonly maskOffset?: readonly [number, number];
  readonly maskRenderOffset?: readonly [number, number];
  readonly uuid?: string;
  readonly drawColor?: { readonly r: number; readonly g: number; readonly b: number; readonly enabled?: boolean };
  /** `DrawToRenderOffscreenType`. 기본 NULL. */
  readonly drawToRenderType?: number | null;
  readonly raster?: FixtureOffscreenRef;
  readonly mask?: FixtureOffscreenRef;
  /** 계산된 열 값 위에 덮어쓴다(예: 순환 연결 시험). */
  readonly overrides?: Readonly<Record<string, FixtureSqlValue>>;
}

export interface FixtureDocumentSpec {
  readonly canvas?: {
    readonly unit?: number;
    readonly width?: number;
    readonly height?: number;
    readonly resolution?: number;
    readonly rootFolder?: number;
    readonly colorType?: number;
    readonly channelBytes?: number;
  };
  /** 루트 폴더(`LayerType` 256)를 포함한 모든 레이어. 루트는 `id`가 `canvas.rootFolder`(기본 1)인 레이어다. */
  readonly layers: readonly FixtureLayer[];
  readonly preview?: Uint8Array;
  /** 비워 두면 `Layer.CanvasId`가 모두 같은 값을 갖는다. 다른 캔버스의 행을 섞을 때 쓴다. */
  readonly extraLayers?: readonly { readonly canvasId: number; readonly id: number; readonly name?: string }[];
  readonly omitTables?: readonly string[];
  readonly omitColumns?: Readonly<Record<string, readonly string[]>>;
  readonly vectorLayerIds?: readonly number[];
  /** DB를 만든 뒤 SQL을 더 실행한다(행 삭제·값 변조 등). */
  readonly afterBuild?: (run: (sql: string, ...params: FixtureSqlValue[]) => void) => void;
  readonly canvasRows?: number;
  /** true면 `CHNKFoot`를 쓰지 않는다. */
  readonly omitFooter?: boolean;
  /** `CHNKSQLi` 앞, 생성한 외부 블록 뒤에 그대로 넣는 `CHNKExta` 본문들(해석되지 않는 외부 블록 시험용). */
  readonly rawExtaPayloads?: readonly Uint8Array[];
  /** 생성한 외부 블록보다 앞에 그대로 넣는 `CHNKExta` 본문들(앞선 블록이 뒤의 유효한 블록을 가리거나 끊지 않는지 보는 시험용). */
  readonly leadingRawExtaPayloads?: readonly Uint8Array[];
  /** 컨테이너 끝에 붙이는 바이트(라벨이 맞지 않는 쓰레기로 컨테이너를 끊긴 것처럼 보이게 하는 시험용). */
  readonly trailingBytes?: Uint8Array;
}

export const FIXTURE_CANVAS_ID = 1;
export const FIXTURE_ROOT_ID = 1;

const rolePart = (role: "render" | "mask"): number => (role === "render" ? 0 : 1);
export const fixtureMipmapId = (layerId: number, role: "render" | "mask"): number => 1000 + layerId * 10 + rolePart(role);
export const fixtureMipmapInfoId = (layerId: number, role: "render" | "mask"): number => 2000 + layerId * 10 + rolePart(role);
export const fixtureOffscreenId = (layerId: number, role: "render" | "mask"): number => 3000 + layerId * 10 + rolePart(role);

/** 오프스크린 번호로 만든 결정적 외부 ID: `extrnlid` + 대문자 16진 32자리(S2가 측정한 파일의 글자 모양). */
export function fixtureExternalId(layerId: number, role: "render" | "mask"): string {
  return `extrnlid${(layerId * 10 + rolePart(role)).toString(16).toUpperCase().padStart(32, "0")}`;
}

const quote = (name: string): string => `"${name.replaceAll('"', '""')}"`;

function createTableSql(name: string, schema: ReadonlyArray<readonly [string, ColumnType]>, omitted: readonly string[]): string {
  const columns = schema.filter(([column]) => !omitted.includes(column)).map(([column, type]) => `${quote(column)} ${type}`);
  return `CREATE TABLE ${quote(name)} (_PW_ID INTEGER PRIMARY KEY AUTOINCREMENT, ${columns.join(", ")})`;
}

interface Inserter {
  insert(table: string, values: Readonly<Record<string, FixtureSqlValue>>): void;
}

function makeInserter(database: DatabaseSync, omitColumns: Readonly<Record<string, readonly string[]>>, omitTables: readonly string[]): Inserter {
  return {
    insert(table, values) {
      if (omitTables.includes(table)) return;
      const omitted = omitColumns[table] ?? [];
      const names = Object.keys(values).filter((name) => !omitted.includes(name));
      database
        .prepare(`INSERT INTO ${quote(table)} (${names.map(quote).join(", ")}) VALUES (${names.map(() => "?").join(", ")})`)
        .run(...names.map((name) => values[name] as number | string | null | Uint8Array));
    },
  };
}

export interface BuiltClipDocument {
  /** 컨테이너 전체(`CSFCHUNK`). */
  readonly bytes: Uint8Array;
  /** 임베디드 SQLite 문서 DB. */
  readonly databaseBytes: Uint8Array;
  /** 컨테이너에 넣은 외부 ID 목록(청크 순서). */
  readonly externalIds: readonly string[];
}

/** 합성 `.clip` 문서를 만든다. */
export function buildClipDocument(spec: FixtureDocumentSpec): BuiltClipDocument {
  const omitTables = spec.omitTables ?? [];
  const omitColumns = spec.omitColumns ?? {};
  const rootFolder = spec.canvas?.rootFolder ?? FIXTURE_ROOT_ID;
  const directory = mkdtempSync(join(tmpdir(), "clip-fixture-"));
  const filePath = join(directory, "document.sqlite");
  const externals: Array<{ id: string; data: Uint8Array }> = [];
  try {
    const database = new DatabaseSync(filePath);
    try {
      database.exec("PRAGMA page_size = 4096; PRAGMA journal_mode = DELETE;");
      for (const [name, schema] of Object.entries(TABLES)) {
        if (!omitTables.includes(name)) database.exec(createTableSql(name, schema, omitColumns[name] ?? []));
      }
      const { insert } = makeInserter(database, omitColumns, omitTables);

      const canvas = spec.canvas ?? {};
      const canvasRows = spec.canvasRows ?? 1;
      for (let row = 0; row < canvasRows; row += 1) {
        insert("Canvas", {
          MainId: FIXTURE_CANVAS_ID + row,
          CanvasUnit: canvas.unit ?? 0,
          CanvasWidth: canvas.width ?? 64,
          CanvasHeight: canvas.height ?? 48,
          CanvasResolution: canvas.resolution ?? 72,
          CanvasRootFolder: rootFolder,
          CanvasDefaultColorTypeIndex: canvas.colorType ?? 0,
          CanvasChannelBytes: canvas.channelBytes ?? 1,
          CanvasDefaultChannelOrder: 33,
          CanvasWorkTime: 0,
        });
      }

      const nextOf = new Map<number, number>();
      const firstChildOf = new Map<number, number>();
      for (const layer of spec.layers) {
        const children = layer.children ?? [];
        if (children.length > 0) firstChildOf.set(layer.id, children[0]!);
        children.forEach((child, index) => nextOf.set(child, children[index + 1] ?? 0));
      }

      for (const layer of spec.layers) {
        const hasRaster = layer.raster !== undefined;
        const hasMask = layer.mask !== undefined;
        const values: Record<string, FixtureSqlValue> = {
          MainId: layer.id,
          CanvasId: FIXTURE_CANVAS_ID,
          LayerName: layer.name ?? `layer-${layer.id}`,
          LayerType: layer.layerType ?? (layer.id === rootFolder ? 256 : layer.folder === true ? 0 : hasRaster ? (hasMask ? 3 : 1) : 0),
          LayerLock: layer.lock ?? 0,
          LayerClip: layer.clip ?? 0,
          LayerOpacity: layer.opacity ?? 256,
          LayerComposite: layer.composite ?? 0,
          LayerVisibility: layer.visibility ?? (hasMask ? 3 : 1),
          LayerFolder: layer.folder === true || layer.id === rootFolder ? 1 : 0,
          LayerFirstChildIndex: firstChildOf.get(layer.id) ?? 0,
          LayerNextIndex: nextOf.get(layer.id) ?? 0,
          LayerOffsetX: layer.offset?.[0] ?? 0,
          LayerOffsetY: layer.offset?.[1] ?? 0,
          LayerRenderOffscrOffsetX: layer.renderOffset?.[0] ?? 0,
          LayerRenderOffscrOffsetY: layer.renderOffset?.[1] ?? 0,
          LayerMaskOffsetX: layer.maskOffset?.[0] ?? 0,
          LayerMaskOffsetY: layer.maskOffset?.[1] ?? 0,
          LayerMaskOffscrOffsetX: layer.maskRenderOffset?.[0] ?? 0,
          LayerMaskOffscrOffsetY: layer.maskRenderOffset?.[1] ?? 0,
          LayerRenderMipmap: hasRaster ? fixtureMipmapId(layer.id, "render") : 0,
          LayerLayerMaskMipmap: hasMask ? fixtureMipmapId(layer.id, "mask") : 0,
          LayerUuid: layer.uuid ?? `00000000-0000-4000-8000-${layer.id.toString().padStart(12, "0")}`,
          DrawColorEnable: layer.drawColor?.enabled === false ? 0 : layer.drawColor === undefined ? 0 : 1,
          DrawColorMainRed: layer.drawColor === undefined ? 0 : layer.drawColor.r * 0x1000000,
          DrawColorMainGreen: layer.drawColor === undefined ? 0 : layer.drawColor.g * 0x1000000,
          DrawColorMainBlue: layer.drawColor === undefined ? 0 : layer.drawColor.b * 0x1000000,
          DrawToRenderOffscreenType: layer.drawToRenderType ?? null,
          TextLayerString: null,
          GradationFillInfo: null,
          FilterLayerInfo: null,
          FirstLayerObject: 0,
          ResizableImageInfo: null,
          ComicFrameLineMipmap: 0,
          VectorNormalStrokeIndex: null,
          LayerEffectInfo: null,
          FutureColumn: 7,
          ...(layer.overrides ?? {}),
        };
        insert("Layer", values);

        for (const [role, offscreen] of [
          ["render", layer.raster],
          ["mask", layer.mask],
        ] as const) {
          if (offscreen === undefined) continue;
          const built = buildOffscreenFixture(offscreen);
          const externalId = fixtureExternalId(layer.id, role);
          if (offscreen.omitExternal !== true) externals.push({ id: externalId, data: built.payload });
          insert("Mipmap", {
            MainId: fixtureMipmapId(layer.id, role),
            CanvasId: FIXTURE_CANVAS_ID,
            LayerId: layer.id,
            MipmapCount: 1,
            BaseMipmapInfo: fixtureMipmapInfoId(layer.id, role),
          });
          insert("MipmapInfo", {
            MainId: fixtureMipmapInfoId(layer.id, role),
            CanvasId: FIXTURE_CANVAS_ID,
            LayerId: layer.id,
            NextIndex: 0,
            Offscreen: fixtureOffscreenId(layer.id, role),
            ThisScale: offscreen.scale ?? 100,
          });
          insert("Offscreen", {
            MainId: fixtureOffscreenId(layer.id, role),
            CanvasId: FIXTURE_CANVAS_ID,
            LayerId: layer.id,
            Attribute: offscreen.attributeOverride ?? built.attribute,
            BlockData: offscreen.omitBlockData === true ? null : new TextEncoder().encode(externalId),
          });
        }
      }

      for (const extra of spec.extraLayers ?? []) {
        insert("Layer", {
          MainId: extra.id,
          CanvasId: extra.canvasId,
          LayerName: extra.name ?? `other-${extra.id}`,
          LayerType: 1,
          LayerOpacity: 256,
          LayerVisibility: 1,
          LayerFolder: 0,
          LayerFirstChildIndex: 0,
          LayerNextIndex: 0,
        });
      }
      for (const layerId of spec.vectorLayerIds ?? []) {
        insert("VectorObjectList", { MainId: layerId * 10, CanvasId: FIXTURE_CANVAS_ID, LayerId: layerId });
        insert("VectorObjectList", { MainId: layerId * 10 + 1, CanvasId: FIXTURE_CANVAS_ID, LayerId: layerId });
      }
      if (spec.preview !== undefined) {
        insert("CanvasPreview", { MainId: 1, CanvasId: FIXTURE_CANVAS_ID, ImageType: 1, ImageWidth: 4, ImageHeight: 4, ImageData: spec.preview });
      }
      spec.afterBuild?.((sql, ...params) => {
        database.prepare(sql).run(...params);
      });
    } finally {
      database.close();
    }
    const databaseBytes = new Uint8Array(readFileSync(filePath));

    const extaPayloads = [
      ...(spec.leadingRawExtaPayloads ?? []),
      ...externals.map((external) => encodeClipExternalChunkPayload({ externalId: external.id, data: external.data })),
      ...(spec.rawExtaPayloads ?? []),
    ];
    const layout = planClipContainerLayout([40, ...extaPayloads.map((payload) => payload.byteLength), databaseBytes.byteLength, 0]);
    const bytes = encodeClipContainer({
      chunks: [
        {
          label: "Head",
          payload: encodeClipHeadPayload({
            sqliteChunkOffset: layout.headerOffsets[1 + extaPayloads.length]!,
            fileId: Uint8Array.from({ length: 16 }, (_, index) => index + 1),
          }),
        },
        ...extaPayloads.map((payload) => ({ label: "CHNKExta", payload })),
        { label: "SQLi", payload: databaseBytes },
        ...(spec.omitFooter === true ? [] : [{ label: "Foot", payload: new Uint8Array(0) }]),
      ],
    });
    const withTrailing = spec.trailingBytes === undefined ? bytes : Uint8Array.from([...bytes, ...spec.trailingBytes]);
    return { bytes: withTrailing, databaseBytes, externalIds: externals.map((external) => external.id) };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
