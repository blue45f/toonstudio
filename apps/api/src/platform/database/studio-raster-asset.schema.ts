import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { creatorWorks, users } from "./schema";
import type { StudioBg3dSixPassBundleManifest } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import type { PrivateObjectReference } from "../adapters/private-object-storage/private-object-storage.contract";


const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
});

/**
 * Kept separate to avoid making the primary schema import a table that already references it.
 * `apps/api/drizzle.config.ts` explicitly catalogs both schema files, while query builders can consume this
 * standalone table without introducing a circular module dependency.
 */
export const creatorWorkRasterAssets = pgTable(
  "creator_work_raster_asset",
  {
    workId: text("workId").notNull(),
    assetId: text("assetId").notNull(),
    mediaType: text("mediaType").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    payload: bytea("payload").notNull(),
    byteLength: integer("byteLength").notNull(),
    sha256: text("sha256").notNull(),
    uploadedBy: text("uploadedBy"),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "creator_work_raster_asset_work_fkey",
      columns: [table.workId],
      foreignColumns: [creatorWorks.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "creator_work_raster_asset_uploaded_by_fkey",
      columns: [table.uploadedBy],
      foreignColumns: [users.id],
    }).onDelete("set null"),
    primaryKey({
      name: "creator_work_raster_asset_pkey",
      columns: [table.workId, table.assetId],
    }),
    index("idx_creator_work_raster_asset_uploader_created")
      .on(table.uploadedBy, table.createdAt.desc()),
    check(
      "creator_work_raster_asset_content_address_check",
      sql`${table.assetId} = ${table.sha256}
        and ${table.assetId} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      "creator_work_raster_asset_media_type_check",
      sql`${table.mediaType} = 'image/png'`
    ),
    check(
      "creator_work_raster_asset_dimensions_check",
      sql`${table.width} between 1 and 1024
        and ${table.height} between 1 and 1024`
    ),
    check(
      "creator_work_raster_asset_byte_length_check",
      sql`${table.byteLength} between 1 and 16777216`
    ),
    check(
      "creator_work_raster_asset_payload_size_check",
      sql`octet_length(${table.payload}) = ${table.byteLength}`
    ),
  ]
);

/** 준비 중에도 전체 예상 바이트를 예약해 기존 저장 한도를 넘는 업로드를 시작하지 않는다. */
export const studioBg3dBundleRevisions = pgTable("studio_bg3d_bundle_revision", {
  workId: text("workId").notNull().references(() => creatorWorks.id, { onDelete: "cascade" }),
  bundleId: text("bundleId").notNull(),
  renderRevisionId: text("renderRevisionId").notNull(),
  parentRevisionId: text("parentRevisionId"),
  manifestHash: text("manifestHash").notNull(),
  manifest: jsonb("manifest").$type<StudioBg3dSixPassBundleManifest>().notNull(),
  reservedBytes: bigint("reservedBytes", { mode: "number" }).notNull(),
  state: text("state").notNull().default("prepared"),
  createdBy: text("createdBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  sealedAt: timestamp("sealedAt", { withTimezone: true }),
}, (table) => [
  primaryKey({ columns: [table.workId, table.bundleId, table.renderRevisionId] }),
  foreignKey({ columns: [table.workId, table.bundleId, table.parentRevisionId], foreignColumns: [table.workId, table.bundleId, table.renderRevisionId], name: "studio_bg3d_bundle_parent_fk" }),
  check("studio_bg3d_bundle_ids_check", sql`length(${table.bundleId}) between 1 and 160 and length(${table.renderRevisionId}) between 1 and 160 and (${table.parentRevisionId} is null or (length(${table.parentRevisionId}) between 1 and 160 and ${table.parentRevisionId} <> ${table.renderRevisionId}))`),
  check("studio_bg3d_bundle_manifest_check", sql`(jsonb_typeof(${table.manifest}) = 'object' and ${table.manifest}->>'contract' = 'toonstudio.bg3d-sixpass-bundle.v1' and ${table.manifest}->'version' = '1'::jsonb and ${table.manifest}->'minimumProjectVersion' = '5'::jsonb and ${table.manifest}->>'bundleId' = ${table.bundleId} and ${table.manifest}->>'renderRevisionId' = ${table.renderRevisionId} and ${table.manifest}->>'parentRevisionId' is not distinct from ${table.parentRevisionId} and jsonb_typeof(${table.manifest}->'layers') = 'array' and jsonb_array_length(${table.manifest}->'layers') = 6 and octet_length(${table.manifest}::text) <= 16384) is true`),
  index("studio_bg3d_bundle_work_idx").on(table.workId, table.createdAt),
  uniqueIndex("studio_bg3d_bundle_sealed_parent_unique").on(table.workId, table.bundleId, sql`coalesce(${table.parentRevisionId}, '')`).where(sql`${table.state} = 'sealed'`),
  check("studio_bg3d_bundle_state_check", sql`(${table.state} = 'prepared' and ${table.sealedAt} is null) or (${table.state} = 'sealed' and ${table.sealedAt} is not null)`),
  check("studio_bg3d_bundle_hash_check", sql`${table.manifestHash} ~ '^sha256:[a-f0-9]{64}$'`),
  check("studio_bg3d_bundle_bytes_check", sql`${table.reservedBytes} between 1 and 402980864`),
]);

export const studioBg3dBundleArtifacts = pgTable("studio_bg3d_bundle_artifact", {
  workId: text("workId").notNull(), bundleId: text("bundleId").notNull(), renderRevisionId: text("renderRevisionId").notNull(),
  role: text("role").notNull(), contentHash: text("contentHash").notNull(), byteSize: bigint("byteSize", { mode: "number" }).notNull(),
  objectReference: jsonb("objectReference").$type<PrivateObjectReference>().notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.workId, table.bundleId, table.renderRevisionId, table.role] }),
  foreignKey({ columns: [table.workId, table.bundleId, table.renderRevisionId], foreignColumns: [studioBg3dBundleRevisions.workId, studioBg3dBundleRevisions.bundleId, studioBg3dBundleRevisions.renderRevisionId], name: "studio_bg3d_bundle_artifact_revision_fk" }).onDelete("cascade"),
  check("studio_bg3d_artifact_role_check", sql`${table.role} in ('scene','color','tone','shadow','depth','texture-line','main-line')`),
  check("studio_bg3d_artifact_hash_check", sql`${table.contentHash} ~ '^sha256:[a-f0-9]{64}$'`),
  check("studio_bg3d_artifact_object_check", sql`(${table.objectReference}->>'purpose' = 'source' and ${table.objectReference}->>'digest' = ${table.contentHash} and (${table.objectReference}->>'byteLength')::bigint = ${table.byteSize}) is true`),
  check("studio_bg3d_artifact_bytes_check", sql`${table.byteSize} between 1 and 67108864 and (${table.role} <> 'scene' or ${table.byteSize} <= 327680)`),
]);
