import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";

import type { ConfigEnv, Plugin } from "vite";

const sourceImport = "./studio-bg3d-local-scene-catalog";
const importerSuffix = "/bg3d/studio-bg3d-verified-local-scenes.ts";
const virtualId = "\0studio-local-scene-catalog";
const scalarKeys = ["id", "name", "usage", "fileName", "hash", "rightsNote"] as const;
const vectors = ["cameraPosition", "cameraTarget", "modelPosition"] as const;
const optionalKeys = ["provider", "serviceTaskId", "serviceVariantId"] as const;
const allowedKeys = new Set<string>([...scalarKeys, ...vectors, ...optionalKeys, "byteSize", "attributionText"]);
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;

function validRow(row: unknown): row is Record<string, unknown> {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  const data = row as Record<string, unknown>;
  return Object.keys(data).every(key => allowedKeys.has(key))
    && scalarKeys.every(key => typeof data[key] === "string" && data[key].length > 0)
    && /^[a-z0-9][a-z0-9-]{0,79}$/u.test(String(data.id))
    && /^[^./\\][^/\\:*?"<>|]*\.glb$/iu.test(String(data.fileName))
    && /^sha256:[a-f0-9]{64}$/u.test(String(data.hash))
    && typeof data.byteSize === "number" && Number.isSafeInteger(data.byteSize) && data.byteSize > 0
    && (data.attributionText === null || typeof data.attributionText === "string")
    && vectors.every(key => Array.isArray(data[key]) && data[key].length === 3
      && data[key].every((value: unknown) => typeof value === "number" && Number.isFinite(value)))
    && (data.provider === undefined || typeof data.provider === "string")
    && ["serviceTaskId", "serviceVariantId"].every(key => data[key] === undefined || uuid.test(String(data[key])));
}

export function readLocalBg3dCatalog(filePath: string, repositoryRoot: string): string {
  const file = realpathSync(filePath);
  const fromRoot = relative(realpathSync(repositoryRoot), file);
  if (!isAbsolute(fromRoot) && fromRoot !== ".." && !fromRoot.startsWith(".." + sep)) {
    throw new Error("개인 장면 목록은 저장소 밖에 보관해 주세요.");
  }
  if (statSync(file).size > 512 * 1024) throw new Error("개인 장면 목록이 너무 큽니다.");
  const rows: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(rows) || !rows.every(validRow)
    || new Set(rows.map(row => row.id)).size !== rows.length
    || new Set(rows.map(row => row.hash)).size !== rows.length) {
    throw new Error("개인 장면 목록의 필드, 식별자 또는 파일 해시를 확인해 주세요.");
  }
  return "export const LOCAL_BG3D_SCENES = " + JSON.stringify(rows) + ";";
}

/** 일반 빌드와 미리보기에는 빈 기본 모듈만 둔다. */
export function localBg3dCatalogPlugin(
  env: ConfigEnv, source: string | undefined, repositoryRoot: string,
): Plugin | undefined {
  if (!source || env.command !== "serve" || env.mode !== "development" || env.isPreview) return;
  return {
    name: "local-bg3d-scene-catalog",
    enforce: "pre",
    configResolved(config) {
      const host = config.server.host;
      if (host !== undefined && ![false, "localhost", "127.0.0.1", "::1"].includes(host)) {
        throw new Error("개인 장면 목록은 이 기기의 개발 서버에서만 열 수 있습니다.");
      }
    },
    resolveId(id, importer) {
      if (id === sourceImport && importer?.endsWith(importerSuffix)) return virtualId;
    },
    load(id) {
      if (id === virtualId) return readLocalBg3dCatalog(source, repositoryRoot);
    },
  };
}
