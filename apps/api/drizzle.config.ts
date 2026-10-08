import { defineConfig } from "drizzle-kit";

import { normalizePgConnectionStringForTls } from "./src/platform/database/pg-connection";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required. Please define it in .env.local");
}
const normalizedDatabaseUrl = normalizePgConnectionStringForTls(databaseUrl);

// PostgreSQL. 로컬 검증은 docker postgres(:55432), 원격은 DATABASE_URL(sslmode=verify-full). 운영 원장은 Supabase PostgreSQL 이
// 현재 권위이고 Neon 은 legacy 로 보존한다(docs/operations/canonical-database-topology.md).
export default defineConfig({
  schema: [
    "./apps/api/src/platform/database/schema/index.ts",
    "./apps/api/src/platform/database/creator-marketplace-resource.schema.ts",
    "./apps/api/src/platform/database/creator-marketplace-report.schema.ts",
    "./apps/api/src/platform/database/creator-marketplace-library.schema.ts",
    "./apps/api/src/platform/database/creator-marketplace-package-moderation.schema.ts",
    "./apps/api/src/platform/database/creator-asset-object-storage.schema.ts",
    "./apps/api/src/platform/database/studio-crdt-raster-checkpoint.schema.ts",
    "./apps/api/src/platform/database/studio-raster-asset.schema.ts",
  ],
  out: "./apps/api/src/platform/database/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: normalizedDatabaseUrl,
  },
});
