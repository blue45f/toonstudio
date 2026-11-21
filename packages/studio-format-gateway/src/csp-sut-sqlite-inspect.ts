/**
 * SQLite 3 container inspection, header/snapshot safety validation, and
 * embedded CRC-verified PNG extraction for Clip Studio Paint `.sut`/`.sutg` files.
 */

import { CspToolFileError } from "./csp-sut-error";

import type { FormatIssue } from "./format-common";

const SQLITE_SIGNATURE = new TextEncoder().encode("SQLite format 3\0");
const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const CSP_TOOL_FILE_LIMITS = Object.freeze({
  maxBytes: 128_000_000,
  maxTables: 128,
  maxColumnsPerTable: 256,
  maxRows: 4_096,
  maxBlobBytes: 32_000_000,
  maxTextCharacters: 1_000_000,
  maxEmbeddedPngPixels: 64_000_000,
});

export type CspToolFileKind = "sut" | "sutg";
export type CspSqliteValue = string | number | bigint | Uint8Array | null;

export interface CspToolFileLimits {
  maxBytes: number;
  maxTables: number;
  maxColumnsPerTable: number;
  maxRows: number;
  maxBlobBytes: number;
  maxTextCharacters: number;
  maxEmbeddedPngPixels: number;
}

export interface CspSqliteTableSnapshot {
  name: string;
  columns: string[];
  /** Reader must return deterministic primary-key/rowid order. */
  rows: Array<Readonly<Record<string, CspSqliteValue>>>;
}

export interface CspSqliteSnapshot {
  tables: CspSqliteTableSnapshot[];
  sqliteVersion?: string;
}

export interface CspSqliteHeaderInspection {
  container: "sqlite3" | "opaque";
  pageSize: number | null;
  readVersion: number | null;
  writeVersion: number | null;
  schemaFormat: number | null;
  textEncoding: "utf-8" | "utf-16le" | "utf-16be" | "unknown" | null;
  pageCount: number | null;
  userVersion: number | null;
  applicationId: number | null;
}

export function formatCspIssue(
  scope: FormatIssue["scope"],
  code: string,
  message: string,
  path?: string,
): FormatIssue {
  return path === undefined ? { scope, code, message } : { scope, code, message, path };
}

export function resolveCspLimits(
  requested: Partial<CspToolFileLimits> | undefined,
): CspToolFileLimits {
  const resolved: CspToolFileLimits = { ...CSP_TOOL_FILE_LIMITS };
  if (requested === undefined) return resolved;
  for (const key of Object.keys(CSP_TOOL_FILE_LIMITS) as Array<keyof CspToolFileLimits>) {
    const value = requested[key];
    const maximum = CSP_TOOL_FILE_LIMITS[key];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
      throw new CspToolFileError(
        `${key} must be an integer between 0 and ${maximum}`,
        "invalid-options",
      );
    }
    resolved[key] = value;
  }
  return resolved;
}

function equalAt(bytes: Uint8Array, needle: Uint8Array, offset: number): boolean {
  if (offset < 0 || offset + needle.byteLength > bytes.byteLength) return false;
  for (let index = 0; index < needle.byteLength; index += 1) {
    if (bytes[offset + index] !== needle[index]) return false;
  }
  return true;
}

function readUint32Big(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

export function inspectCspToolFile(bytes: Uint8Array): CspSqliteHeaderInspection {
  if (bytes.byteLength < SQLITE_SIGNATURE.byteLength || !equalAt(bytes, SQLITE_SIGNATURE, 0)) {
    return {
      container: "opaque",
      pageSize: null,
      readVersion: null,
      writeVersion: null,
      schemaFormat: null,
      textEncoding: null,
      pageCount: null,
      userVersion: null,
      applicationId: null,
    };
  }
  if (bytes.byteLength < 100) {
    return {
      container: "sqlite3",
      pageSize: null,
      readVersion: null,
      writeVersion: null,
      schemaFormat: null,
      textEncoding: null,
      pageCount: null,
      userVersion: null,
      applicationId: null,
    };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const storedPageSize = view.getUint16(16, false);
  const encoding = readUint32Big(view, 56);
  return {
    container: "sqlite3",
    pageSize: storedPageSize === 1 ? 65_536 : storedPageSize,
    writeVersion: bytes[18] ?? null,
    readVersion: bytes[19] ?? null,
    pageCount: readUint32Big(view, 28),
    schemaFormat: readUint32Big(view, 44),
    textEncoding:
      encoding === 1
        ? "utf-8"
        : encoding === 2
          ? "utf-16le"
          : encoding === 3
            ? "utf-16be"
            : "unknown",
    userVersion: readUint32Big(view, 60),
    applicationId: readUint32Big(view, 68),
  };
}

export function validateCspSqliteHeader(
  bytes: Uint8Array,
  inspection: CspSqliteHeaderInspection,
  warnings: FormatIssue[],
  unsupported: FormatIssue[],
): boolean {
  if (inspection.container !== "sqlite3") {
    unsupported.push(
      formatCspIssue(
        "container",
        "sut-container-unverified",
        "CELSYS does not publish the SUT/SUTG container contract and this file is not a recognized SQLite 3 container; original bytes are preserved",
      ),
    );
    return false;
  }
  if (bytes.byteLength < 100 || inspection.pageSize === null) {
    unsupported.push(
      formatCspIssue("container", "sqlite-header-truncated", "SQLite header is shorter than 100 bytes"),
    );
    return false;
  }
  const pageSize = inspection.pageSize;
  if (
    pageSize < 512 ||
    pageSize > 65_536 ||
    (pageSize & (pageSize - 1)) !== 0 ||
    bytes.byteLength % pageSize !== 0
  ) {
    unsupported.push(
      formatCspIssue(
        "container",
        "sqlite-page-layout-invalid",
        `page size ${pageSize} does not describe the ${bytes.byteLength}-byte file`,
      ),
    );
    return false;
  }
  if (![1, 2].includes(inspection.readVersion ?? 0) || ![1, 2].includes(inspection.writeVersion ?? 0)) {
    unsupported.push(
      formatCspIssue("container", "sqlite-version-invalid", "SQLite read/write version is not 1 or 2"),
    );
    return false;
  }
  if (inspection.schemaFormat === null || inspection.schemaFormat < 1 || inspection.schemaFormat > 4) {
    unsupported.push(
      formatCspIssue(
        "container",
        "sqlite-schema-format-unsupported",
        `SQLite schema format ${String(inspection.schemaFormat)} is outside 1..4`,
      ),
    );
    return false;
  }
  if (inspection.textEncoding === "unknown") {
    unsupported.push(
      formatCspIssue("container", "sqlite-text-encoding-unsupported", "SQLite text encoding is unknown"),
    );
    return false;
  }
  if (inspection.readVersion === 2 || inspection.writeVersion === 2) {
    warnings.push(
      formatCspIssue(
        "container",
        "sqlite-wal-header",
        "database header indicates WAL mode; only the self-contained main database bytes are inspected",
      ),
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[20] !== 0 || bytes[21] !== 64 || bytes[22] !== 32 || bytes[23] !== 32) {
    unsupported.push(
      formatCspIssue(
        "container",
        "sqlite-payload-fractions-invalid",
        "SQLite reserved-byte/payload-fraction header fields are non-standard",
      ),
    );
    return false;
  }
  const headerPageCount = readUint32Big(view, 28);
  if (headerPageCount > 0 && headerPageCount * pageSize > bytes.byteLength) {
    unsupported.push(
      formatCspIssue("container", "sqlite-page-count-invalid", "SQLite page count exceeds the file"),
    );
    return false;
  }
  return true;
}

const PNG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function pngCrc32(bytes: Uint8Array): number {
  let value = 0xffff_ffff;
  for (const byte of bytes) {
    value = (PNG_CRC_TABLE[(value ^ byte) & 0xff] ?? 0) ^ (value >>> 8);
  }
  return (value ^ 0xffff_ffff) >>> 0;
}

export function extractValidatedPngs(
  bytes: Uint8Array,
  maxPixels: number,
): Array<{ bytes: Uint8Array; width: number; height: number }> {
  const found: Array<{ bytes: Uint8Array; width: number; height: number }> = [];
  for (let start = 0; start + PNG_SIGNATURE.byteLength <= bytes.byteLength; start += 1) {
    if (!equalAt(bytes, PNG_SIGNATURE, start)) continue;
    let offset = start + PNG_SIGNATURE.byteLength;
    let width = 0;
    let height = 0;
    let sawIhdr = false;
    let valid = false;
    while (offset + 12 <= bytes.byteLength) {
      const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.byteLength - offset);
      const length = view.getUint32(0, false);
      const end = offset + 12 + length;
      if (length > bytes.byteLength || end > bytes.byteLength) break;
      const typeBytes = bytes.subarray(offset + 4, offset + 8);
      const type = String.fromCharCode(...typeBytes);
      const storedCrc = new DataView(
        bytes.buffer,
        bytes.byteOffset + offset + 8 + length,
        4,
      ).getUint32(0, false);
      if (storedCrc !== pngCrc32(bytes.subarray(offset + 4, offset + 8 + length))) break;
      if (type === "IHDR") {
        if (sawIhdr || length !== 13) break;
        sawIhdr = true;
        const ihdr = new DataView(bytes.buffer, bytes.byteOffset + offset + 8, 13);
        width = ihdr.getUint32(0, false);
        height = ihdr.getUint32(4, false);
        if (
          width < 1 ||
          height < 1 ||
          width > maxPixels ||
          height > maxPixels ||
          width * height > maxPixels
        ) {
          break;
        }
      }
      offset = end;
      if (type === "IEND" && length === 0 && sawIhdr) {
        valid = true;
        break;
      }
    }
    if (valid) {
      found.push({ bytes: bytes.slice(start, offset), width, height });
      start = offset - 1;
    }
  }
  return found;
}

export function validateCspSqliteSnapshot(
  snapshot: CspSqliteSnapshot,
  limits: CspToolFileLimits,
): void {
  if (!Array.isArray(snapshot.tables) || snapshot.tables.length > limits.maxTables) {
    throw new CspToolFileError(
      "SQLite reader returned too many tables or a malformed table list",
      "snapshot-invalid-structure",
    );
  }
  let totalRows = 0;
  const tableNames = new Set<string>();
  for (const table of snapshot.tables) {
    if (
      typeof table.name !== "string" ||
      table.name.length === 0 ||
      tableNames.has(table.name) ||
      !Array.isArray(table.columns) ||
      table.columns.length > limits.maxColumnsPerTable ||
      !Array.isArray(table.rows)
    ) {
      throw new CspToolFileError(
        "SQLite reader returned a malformed table snapshot",
        "snapshot-invalid-structure",
      );
    }
    tableNames.add(table.name);
    const columns = new Set(table.columns);
    if (columns.size !== table.columns.length || table.columns.some((column) => typeof column !== "string")) {
      throw new CspToolFileError(
        `SQLite table ${table.name} has invalid columns`,
        "snapshot-invalid-structure",
      );
    }
    totalRows += table.rows.length;
    if (totalRows > limits.maxRows) {
      throw new CspToolFileError("SQLite reader returned too many rows", "snapshot-limit-exceeded");
    }
    for (const row of table.rows) {
      for (const [column, value] of Object.entries(row)) {
        if (!columns.has(column)) {
          throw new CspToolFileError(
            `SQLite row uses undeclared column ${column}`,
            "snapshot-invalid-structure",
          );
        }
        if (typeof value === "string" && value.length > limits.maxTextCharacters) {
          throw new CspToolFileError(
            `SQLite text cell ${table.name}.${column} exceeds its safety limit`,
            "snapshot-limit-exceeded",
          );
        }
        if (value instanceof Uint8Array && value.byteLength > limits.maxBlobBytes) {
          throw new CspToolFileError(
            `SQLite blob cell ${table.name}.${column} exceeds its safety limit`,
            "snapshot-limit-exceeded",
          );
        }
        if (
          value !== null &&
          typeof value !== "string" &&
          typeof value !== "number" &&
          typeof value !== "bigint" &&
          !(value instanceof Uint8Array)
        ) {
          throw new CspToolFileError(
            `SQLite cell ${table.name}.${column} has an invalid value type`,
            "snapshot-invalid-structure",
          );
        }
      }
    }
  }
}
