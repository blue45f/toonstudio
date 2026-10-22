import type { StudioProjectPackageResult } from "./studio-project-package";
import type { StudioStorageBinding } from "./studio-save-profile";
import type {
  PersonalCloudAccessToken,
  PersonalCloudProviderId,
} from "./personal-cloud-client";

export type PersonalCloudUploadPhase =
  | "preparing"
  | "checking"
  | "uploading"
  | "finalizing";

export interface PersonalCloudUploadProgress {
  readonly phase: PersonalCloudUploadPhase;
  readonly uploadedBytes: number;
  readonly totalBytes: number;
}

export interface PersonalCloudUploadResult {
  readonly provider: PersonalCloudProviderId;
  readonly remoteId: string;
  readonly remotePath: string;
  readonly remoteVersion: string;
  readonly contentHash: string;
  readonly modifiedAt: string;
  readonly webUrl: string | null;
  readonly byteLength: number;
}
export interface UploadPersonalCloudPackageInput {
  readonly projectId: string;
  readonly result: StudioProjectPackageResult;
  readonly binding: StudioStorageBinding | null;
  readonly credential: PersonalCloudAccessToken;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: PersonalCloudUploadProgress) => void;
}

export type PersonalCloudDetailCode =
  | "cancelled" | "response-invalid" | "unauthorized" | "network-failed" | "binding-provider-mismatch" | "content-hash-failed"
  | "provider-request-failed" | "provider-remote-version-failed" | "provider-upload-failed" | "provider-upload-session-failed" | "provider-folder-create-failed"
  | "conflict-remote-changed" | "conflict-path-occupied" | "conflict-same-name-exists" | "conflict-name-exists" | "folder-create-failed" | "folder-result-unconfirmed"
  | "upload-result-unconfirmed" | "upload-session-url-missing" | "upload-session-start-failed" | "app-folder-open-failed" | "project-file-empty";

export class PersonalCloudUploadError extends Error {
  constructor(
    readonly code: "conflict" | "unauthorized" | "provider" | "network" | "cancelled",
    readonly detailCode: PersonalCloudDetailCode,
    readonly params?: Readonly<Record<string, string>>,
    options: { readonly cause?: unknown } = {},
  ) { super(detailCode, options.cause === undefined ? undefined : { cause: options.cause }); this.name = "PersonalCloudUploadError"; }
}

const GOOGLE_CHUNK_BYTES = 8 * 1024 * 1024;
const DROPBOX_CHUNK_BYTES = 8 * 1024 * 1024;
const ONEDRIVE_CHUNK_BYTES = 10 * 1024 * 1024;
const PROJECT_FOLDER = "Projects";
const ROOT_FOLDER = "ToonStudio";

function replaceUnsafeFileCharacters(value: string): string {
  let output = "";
  let replacing = false;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    const unsafe = codePoint < 32 || "\\/:*?\"<>|".includes(character);
    if (unsafe) {
      if (!replacing) output += "-";
      replacing = true;
    } else {
      output += character;
      replacing = false;
    }
  }
  return output;
}

function cleanSegment(value: string, fallback: string): string {
  const clean = replaceUnsafeFileCharacters(value.normalize("NFKC"))
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 120);
  return clean || fallback;
}

function projectFolderName(projectId: string): string {
  return cleanSegment(projectId, "project");
}

function encodeGraphPathSegment(value: string): string {
  return encodeURIComponent(value).replace(/%2F/giu, "%252F");
}

function asciiJsonHeader(value: unknown): string {
  return JSON.stringify(value).replace(/[^\x20-\x7e]/gu, (character) => {
    const point = character.codePointAt(0) ?? 0;
    return `\\u${point.toString(16).padStart(4, "0")}`;
  });
}

function providerMessage(provider: PersonalCloudProviderId): string {
  if (provider === "google-drive") return "Google Drive";
  if (provider === "dropbox") return "Dropbox";
  return "OneDrive";
}
function abortError(signal?: AbortSignal): PersonalCloudUploadError | null {
  return signal?.aborted
    ? new PersonalCloudUploadError("cancelled", "cancelled")
    : null;
}

function emitProgress(
  input: UploadPersonalCloudPackageInput,
  phase: PersonalCloudUploadPhase,
  uploadedBytes: number,
): void {
  input.onProgress?.({
    phase,
    uploadedBytes: Math.max(0, Math.min(input.result.blob.size, uploadedBytes)),
    totalBytes: input.result.blob.size,
  });
}

async function boundedText(response: Response): Promise<string> {
  const text = await response.text();
  return text.length > 16_384 ? `${text.slice(0, 16_384)}…` : text;
}

async function jsonObject(response: Response): Promise<Record<string, unknown>> {
  const text = await boundedText(response);
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    throw new PersonalCloudUploadError("provider", "response-invalid", { status: String(response.status) });
  }
}
function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberField(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

async function requireOk(
  response: Response,
  provider: PersonalCloudProviderId,
  failureDetailCode: PersonalCloudDetailCode,
): Promise<Response> {
  if (response.ok) return response;
  if (response.status === 401 || response.status === 403) {
    throw new PersonalCloudUploadError("unauthorized", "unauthorized", { provider: providerMessage(provider) });
  }
  const detail = await boundedText(response);
  // 서버 응답 detail은 번역 대상이 아닌 패스스루다(설계 §3.12) — 선행 공백을 포함해 {detail}로 싣는다.
  throw new PersonalCloudUploadError("provider", failureDetailCode, {
    provider: providerMessage(provider),
    status: String(response.status),
    detail: detail ? ` ${detail.slice(0, 240)}` : "",
  });
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
async function request(
  input: UploadPersonalCloudPackageInput,
  provider: PersonalCloudProviderId,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const cancelled = abortError(input.signal);
  if (cancelled) throw cancelled;
  try {
    return await (input.fetchImpl ?? fetch)(url, {
      ...init,
      signal: input.signal,
    });
  } catch (error) {
    if (input.signal?.aborted) {
      throw new PersonalCloudUploadError("cancelled", "cancelled", undefined, { cause: error });
    }
    throw new PersonalCloudUploadError("network", "network-failed", { provider: providerMessage(provider) }, { cause: error });
  }
}

function bearer(credential: PersonalCloudAccessToken): string {
  return `${credential.tokenType || "Bearer"} ${credential.accessToken}`;
}

function conflict(detailCode: PersonalCloudDetailCode, params?: Readonly<Record<string, string>>): never {
  throw new PersonalCloudUploadError("conflict", detailCode, params);
}
interface GoogleDriveFile {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly modifiedTime: string;
  readonly md5Checksum: string;
  readonly size: number;
  readonly webViewLink: string | null;
  readonly trashed: boolean;
}

function googleFile(value: unknown): GoogleDriveFile | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = stringField(row.id);
  if (!id) return null;
  return Object.freeze({
    id,
    name: stringField(row.name),
    version: stringField(row.version),
    modifiedTime: stringField(row.modifiedTime),
    md5Checksum: stringField(row.md5Checksum),
    size: numberField(row.size),
    webViewLink: stringField(row.webViewLink) || null,
    trashed: row.trashed === true,
  });
}

async function googleJson(
  input: UploadPersonalCloudPackageInput,
  url: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const response = await request(input, "google-drive", url, {
    ...init,
    headers: {
      Authorization: bearer(input.credential),
      Accept: "application/json",
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  await requireOk(response, "google-drive", "provider-request-failed");
  return jsonObject(response);
}

function googleQueryValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

async function findGoogleFolder(
  input: UploadPersonalCloudPackageInput,
  name: string,
  parentId: string,
): Promise<string | null> {
  const query = [
    `name='${googleQueryValue(name)}'`,
    "mimeType='application/vnd.google-apps.folder'",
    "trashed=false",
    `'${googleQueryValue(parentId)}' in parents`,
  ].join(" and ");
  const params = new URLSearchParams({
    q: query,
    spaces: "drive",
    pageSize: "10",
    fields: "files(id,name)",
  });
  const body = await googleJson(
    input,
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
  );
  const files = Array.isArray(body.files) ? body.files : [];
  for (const value of files) {
    const file = googleFile(value);
    if (file?.id) return file.id;
  }
  return null;
}

async function ensureGoogleFolder(
  input: UploadPersonalCloudPackageInput,
  name: string,
  parentId: string,
): Promise<string> {
  const existing = await findGoogleFolder(input, name, parentId);
  if (existing) return existing;
  const body = await googleJson(input, "https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });
  const id = stringField(body.id);
  if (!id) throw new PersonalCloudUploadError("provider", "folder-create-failed", { provider: "Google Drive" });
  return id;
}

async function googleProjectFolder(
  input: UploadPersonalCloudPackageInput,
): Promise<string> {
  const root = await ensureGoogleFolder(input, ROOT_FOLDER, "root");
  const projects = await ensureGoogleFolder(input, PROJECT_FOLDER, root);
  return ensureGoogleFolder(input, projectFolderName(input.projectId), projects);
}

async function getGoogleFile(
  input: UploadPersonalCloudPackageInput,
  id: string,
): Promise<GoogleDriveFile | null> {
  const fields = "id,name,version,modifiedTime,md5Checksum,size,webViewLink,trashed";
  const response = await request(
    input,
    "google-drive",
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=${fields}`,
    { headers: { Authorization: bearer(input.credential), Accept: "application/json" } },
  );
  if (response.status === 404) return null;
  await requireOk(response, "google-drive", "provider-remote-version-failed");
  return googleFile(await jsonObject(response));
}

function assertGoogleVersion(binding: StudioStorageBinding | null, remote: GoogleDriveFile | null): void {
  if (!remote || !binding?.remoteVersion) return;
  if (remote.version !== binding.remoteVersion) {
    conflict("conflict-remote-changed", { provider: "Google Drive" });
  }
}

async function putGoogleChunks(
  input: UploadPersonalCloudPackageInput,
  uploadUrl: string,
): Promise<GoogleDriveFile> {
  const blob = input.result.blob;
  let offset = 0;
  while (offset < blob.size) {
    const endExclusive = Math.min(blob.size, offset + GOOGLE_CHUNK_BYTES);
    const response = await request(input, "google-drive", uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": input.result.blob.type || "application/octet-stream",
        "Content-Range": `bytes ${offset}-${endExclusive - 1}/${blob.size}`,
      },
      body: blob.slice(offset, endExclusive),
    });
    if (response.status === 308) {
      const range = response.headers.get("Range");
      const match = range ? /bytes=0-(\d+)/u.exec(range) : null;
      offset = match ? Number(match[1]) + 1 : endExclusive;
      emitProgress(input, "uploading", offset);
      continue;
    }
    await requireOk(response, "google-drive", "provider-upload-failed");
    const file = googleFile(await jsonObject(response));
    if (!file) {
      throw new PersonalCloudUploadError("provider", "upload-result-unconfirmed", { provider: "Google Drive" });
    }
    emitProgress(input, "uploading", blob.size);
    return file;
  }
  throw new PersonalCloudUploadError("provider", "project-file-empty");
}

async function uploadGoogleDrive(
  input: UploadPersonalCloudPackageInput,
  contentHash: string,
): Promise<PersonalCloudUploadResult> {
  emitProgress(input, "checking", 0);
  const existing = input.binding?.remoteId
    ? await getGoogleFile(input, input.binding.remoteId)
    : null;
  assertGoogleVersion(input.binding, existing);
  const folderId = existing ? null : await googleProjectFolder(input);
  const fields = "id,name,version,modifiedTime,md5Checksum,size,webViewLink,trashed";
  const endpoint = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existing.id)}?uploadType=resumable&fields=${fields}`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=${fields}`;
  const response = await request(input, "google-drive", endpoint, {
    method: existing ? "PATCH" : "POST",
    headers: {
      Authorization: bearer(input.credential),
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": input.result.blob.type || "application/octet-stream",
      "X-Upload-Content-Length": String(input.result.blob.size),
    },
    body: JSON.stringify({
      name: input.result.fileName,
      mimeType: input.result.blob.type || "application/octet-stream",
      ...(folderId ? { parents: [folderId] } : {}),
    }),
  });
  await requireOk(response, "google-drive", "provider-upload-session-failed");
  const uploadUrl = response.headers.get("Location");
  if (!uploadUrl?.startsWith("https://")) {
    throw new PersonalCloudUploadError("provider", "upload-session-url-missing", { provider: "Google Drive" });
  }
  emitProgress(input, "uploading", 0);
  const file = await putGoogleChunks(input, uploadUrl);
  emitProgress(input, "finalizing", input.result.blob.size);
  return Object.freeze({
    provider: "google-drive",
    remoteId: file.id,
    remotePath: `${ROOT_FOLDER}/${PROJECT_FOLDER}/${projectFolderName(input.projectId)}/${file.name}`,
    remoteVersion: file.version,
    contentHash: `sha256:${contentHash}`,
    modifiedAt: file.modifiedTime || new Date().toISOString(),
    webUrl: file.webViewLink,
    byteLength: file.size || input.result.blob.size,
  });
}
interface DropboxFile {
  readonly id: string;
  readonly path: string;
  readonly revision: string;
  readonly contentHash: string;
  readonly modifiedAt: string;
  readonly size: number;
}

function dropboxFile(value: unknown): DropboxFile | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (stringField(row[".tag"]) !== "file") return null;
  const id = stringField(row.id);
  const path = stringField(row.path_display) || stringField(row.path_lower);
  const revision = stringField(row.rev);
  if (!id || !path || !revision) return null;
  return Object.freeze({
    id,
    path,
    revision,
    contentHash: stringField(row.content_hash),
    modifiedAt: stringField(row.server_modified),
    size: numberField(row.size),
  });
}

function dropboxPath(input: UploadPersonalCloudPackageInput): string {
  return `/${ROOT_FOLDER}/${PROJECT_FOLDER}/${projectFolderName(input.projectId)}/${input.result.fileName}`;
}
async function dropboxApi(
  input: UploadPersonalCloudPackageInput,
  endpoint: string,
  body: unknown,
  allowConflict = false,
): Promise<Record<string, unknown> | null> {
  const response = await request(
    input,
    "dropbox",
    `https://api.dropboxapi.com/2/${endpoint}`,
    {
      method: "POST",
      headers: {
        Authorization: bearer(input.credential),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (allowConflict && response.status === 409) return null;
  await requireOk(response, "dropbox", "provider-request-failed");
  return jsonObject(response);
}

async function ensureDropboxFolder(
  input: UploadPersonalCloudPackageInput,
  path: string,
): Promise<void> {
  const result = await dropboxApi(
    input,
    "files/create_folder_v2",
    { path, autorename: false },
    true,
  );
  if (result === null) {
    const existing = await dropboxApi(
      input,
      "files/get_metadata",
      { path, include_deleted: false },
      true,
    );
    if (existing && stringField(existing[".tag"]) === "folder") return;
    conflict("conflict-path-occupied", { provider: "Dropbox", path });
  }
  const metadata = result.metadata;
  if (
    !metadata
    || typeof metadata !== "object"
    || stringField((metadata as Record<string, unknown>)[".tag"]) !== "folder"
  ) {
    throw new PersonalCloudUploadError("provider", "folder-result-unconfirmed", { provider: "Dropbox" });
  }
}

async function ensureDropboxProjectFolder(
  input: UploadPersonalCloudPackageInput,
): Promise<void> {
  await ensureDropboxFolder(input, `/${ROOT_FOLDER}`);
  await ensureDropboxFolder(input, `/${ROOT_FOLDER}/${PROJECT_FOLDER}`);
  await ensureDropboxFolder(
    input,
    `/${ROOT_FOLDER}/${PROJECT_FOLDER}/${projectFolderName(input.projectId)}`,
  );
}

async function getDropboxFile(
  input: UploadPersonalCloudPackageInput,
  pathOrId: string,
): Promise<DropboxFile | null> {
  const body = await dropboxApi(
    input,
    "files/get_metadata",
    { path: pathOrId, include_deleted: false },
    true,
  );
  return body ? dropboxFile(body) : null;
}

function assertDropboxVersion(
  binding: StudioStorageBinding | null,
  remote: DropboxFile | null,
): void {
  if (!remote) return;
  if (!binding?.remoteId) {
    conflict("conflict-same-name-exists", { provider: "Dropbox" });
  }
  if (!binding.remoteVersion || binding.remoteVersion !== remote.revision) {
    conflict("conflict-remote-changed", { provider: "Dropbox" });
  }
}

function dropboxCommit(
  path: string,
  remote: DropboxFile | null,
): Record<string, unknown> {
  return {
    path,
    mode: remote
      ? { ".tag": "update", update: remote.revision }
      : { ".tag": "add" },
    autorename: false,
    mute: true,
    strict_conflict: true,
  };
}
async function dropboxContent(
  input: UploadPersonalCloudPackageInput,
  endpoint: string,
  argument: unknown,
  body: BodyInit,
): Promise<Response> {
  const response = await request(
    input,
    "dropbox",
    `https://content.dropboxapi.com/2/${endpoint}`,
    {
      method: "POST",
      headers: {
        Authorization: bearer(input.credential),
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": asciiJsonHeader(argument),
      },
      body,
    },
  );
  await requireOk(response, "dropbox", "provider-upload-failed");
  return response;
}

async function uploadDropboxSimple(
  input: UploadPersonalCloudPackageInput,
  path: string,
  remote: DropboxFile | null,
): Promise<DropboxFile> {
  const response = await dropboxContent(
    input,
    "files/upload",
    dropboxCommit(path, remote),
    input.result.blob,
  );
  emitProgress(input, "uploading", input.result.blob.size);
  const file = dropboxFile(await jsonObject(response));
  if (!file) {
    throw new PersonalCloudUploadError("provider", "upload-result-unconfirmed", { provider: "Dropbox" });
  }
  return file;
}

async function uploadDropboxSession(
  input: UploadPersonalCloudPackageInput,
  path: string,
  remote: DropboxFile | null,
): Promise<DropboxFile> {
  const blob = input.result.blob;
  const firstEnd = Math.min(blob.size, DROPBOX_CHUNK_BYTES);
  const start = await dropboxContent(
    input,
    "files/upload_session/start",
    { close: false },
    blob.slice(0, firstEnd),
  );
  const startBody = await jsonObject(start);
  const sessionId = stringField(startBody.session_id);
  if (!sessionId) {
    throw new PersonalCloudUploadError("provider", "upload-session-start-failed", { provider: "Dropbox" });
  }
  let offset = firstEnd;
  emitProgress(input, "uploading", offset);
  while (blob.size - offset > DROPBOX_CHUNK_BYTES) {
    const endExclusive = offset + DROPBOX_CHUNK_BYTES;
    await dropboxContent(
      input,
      "files/upload_session/append_v2",
      { cursor: { session_id: sessionId, offset }, close: false },
      blob.slice(offset, endExclusive),
    );
    offset = endExclusive;
    emitProgress(input, "uploading", offset);
  }
  const finish = await dropboxContent(
    input,
    "files/upload_session/finish",
    {
      cursor: { session_id: sessionId, offset },
      commit: dropboxCommit(path, remote),
    },
    blob.slice(offset),
  );
  emitProgress(input, "uploading", blob.size);
  const file = dropboxFile(await jsonObject(finish));
  if (!file) {
    throw new PersonalCloudUploadError("provider", "upload-result-unconfirmed", { provider: "Dropbox" });
  }
  return file;
}
async function uploadDropbox(
  input: UploadPersonalCloudPackageInput,
  contentHash: string,
): Promise<PersonalCloudUploadResult> {
  emitProgress(input, "checking", 0);
  await ensureDropboxProjectFolder(input);
  const path = dropboxPath(input);
  const lookup = input.binding?.remoteId || path;
  const existing = await getDropboxFile(input, lookup);
  assertDropboxVersion(input.binding, existing);
  emitProgress(input, "uploading", 0);
  const file = input.result.blob.size <= DROPBOX_CHUNK_BYTES
    ? await uploadDropboxSimple(input, path, existing)
    : await uploadDropboxSession(input, path, existing);
  emitProgress(input, "finalizing", input.result.blob.size);
  return Object.freeze({
    provider: "dropbox",
    remoteId: file.id,
    remotePath: file.path,
    remoteVersion: file.revision,
    contentHash: `sha256:${contentHash}`,
    modifiedAt: file.modifiedAt || new Date().toISOString(),
    webUrl: null,
    byteLength: file.size || input.result.blob.size,
  });
}
interface OneDriveItem {
  readonly id: string;
  readonly name: string;
  readonly eTag: string;
  readonly modifiedAt: string;
  readonly webUrl: string | null;
  readonly size: number;
  readonly isFolder: boolean;
}

function oneDriveItem(value: unknown): OneDriveItem | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = stringField(row.id);
  if (!id) return null;
  return Object.freeze({
    id,
    name: stringField(row.name),
    eTag: stringField(row.eTag),
    modifiedAt: stringField(row.lastModifiedDateTime),
    webUrl: stringField(row.webUrl) || null,
    size: numberField(row.size),
    isFolder: Boolean(row.folder && typeof row.folder === "object"),
  });
}

const ONEDRIVE_FIELDS = "id,name,eTag,lastModifiedDateTime,webUrl,size,file,folder";
async function oneDriveJson(
  input: UploadPersonalCloudPackageInput,
  url: string,
  init: RequestInit = {},
  allowMissing = false,
): Promise<Record<string, unknown> | null> {
  const response = await request(input, "onedrive", url, {
    ...init,
    headers: {
      Authorization: bearer(input.credential),
      Accept: "application/json",
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (allowMissing && response.status === 404) return null;
  await requireOk(response, "onedrive", "provider-request-failed");
  return jsonObject(response);
}

async function getOneDriveItemById(
  input: UploadPersonalCloudPackageInput,
  id: string,
): Promise<OneDriveItem | null> {
  const body = await oneDriveJson(
    input,
    `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(id)}?$select=${ONEDRIVE_FIELDS}`,
    {},
    true,
  );
  return body ? oneDriveItem(body) : null;
}
async function getOneDriveChild(
  input: UploadPersonalCloudPackageInput,
  parentId: string,
  name: string,
): Promise<OneDriveItem | null> {
  const body = await oneDriveJson(
    input,
    `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(parentId)}:/${encodeGraphPathSegment(name)}?$select=${ONEDRIVE_FIELDS}`,
    {},
    true,
  );
  return body ? oneDriveItem(body) : null;
}

async function createOneDriveFolder(
  input: UploadPersonalCloudPackageInput,
  parentId: string,
  name: string,
): Promise<OneDriveItem> {
  const response = await request(
    input,
    "onedrive",
    `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(parentId)}/children?$select=${ONEDRIVE_FIELDS}`,
    {
      method: "POST",
      headers: {
        Authorization: bearer(input.credential),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    },
  );
  if (response.status === 409) {
    const existing = await getOneDriveChild(input, parentId, name);
    if (existing?.isFolder) return existing;
    throw new PersonalCloudUploadError("conflict", "conflict-name-exists", { provider: "OneDrive", name });
  }
  await requireOk(response, "onedrive", "provider-folder-create-failed");
  const created = oneDriveItem(await jsonObject(response));
  if (!created?.isFolder) {
    throw new PersonalCloudUploadError("provider", "folder-result-unconfirmed", { provider: "OneDrive" });
  }
  return created;
}

async function ensureOneDriveProjectFolder(
  input: UploadPersonalCloudPackageInput,
): Promise<OneDriveItem> {
  const appRootBody = await oneDriveJson(
    input,
    `https://graph.microsoft.com/v1.0/me/drive/special/approot?$select=${ONEDRIVE_FIELDS}`,
  );
  const appRoot = oneDriveItem(appRootBody);
  if (!appRoot?.isFolder) {
    throw new PersonalCloudUploadError("provider", "app-folder-open-failed", { provider: "OneDrive" });
  }
  const projects = await createOneDriveFolder(input, appRoot.id, PROJECT_FOLDER);
  return createOneDriveFolder(input, projects.id, projectFolderName(input.projectId));
}

function assertOneDriveVersion(
  binding: StudioStorageBinding | null,
  remote: OneDriveItem | null,
): void {
  if (!remote) return;
  if (!binding?.remoteId) {
    conflict("conflict-same-name-exists", { provider: "OneDrive" });
  }
  if (!binding.remoteVersion || binding.remoteVersion !== remote.eTag) {
    conflict("conflict-remote-changed", { provider: "OneDrive" });
  }
}

async function createOneDriveUploadSession(
  input: UploadPersonalCloudPackageInput,
  folderId: string,
  existing: OneDriveItem | null,
): Promise<string> {
  const endpoint = existing
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(existing.id)}/createUploadSession`
    : `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(folderId)}:/${encodeGraphPathSegment(input.result.fileName)}:/createUploadSession`;
  const body = await oneDriveJson(input, endpoint, {
    method: "POST",
    body: JSON.stringify({
      item: {
        "@microsoft.graph.conflictBehavior": existing ? "replace" : "fail",
        name: input.result.fileName,
      },
      deferCommit: false,
    }),
  });
  const uploadUrl = stringField(body?.uploadUrl);
  if (!uploadUrl.startsWith("https://")) {
    throw new PersonalCloudUploadError("provider", "upload-session-url-missing", { provider: "OneDrive" });
  }
  return uploadUrl;
}

async function putOneDriveChunks(
  input: UploadPersonalCloudPackageInput,
  uploadUrl: string,
): Promise<OneDriveItem> {
  const blob = input.result.blob;
  let offset = 0;
  while (offset < blob.size) {
    const endExclusive = Math.min(blob.size, offset + ONEDRIVE_CHUNK_BYTES);
    const response = await request(input, "onedrive", uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Range": `bytes ${offset}-${endExclusive - 1}/${blob.size}`,
        "Content-Type": "application/octet-stream",
      },
      body: blob.slice(offset, endExclusive),
    });
    if (response.status === 202) {
      const progress = await jsonObject(response);
      const ranges = Array.isArray(progress.nextExpectedRanges)
        ? progress.nextExpectedRanges
        : [];
      const next = typeof ranges[0] === "string"
        ? /^(\d+)-/u.exec(ranges[0])
        : null;
      offset = next ? Number(next[1]) : endExclusive;
      emitProgress(input, "uploading", offset);
      continue;
    }
    await requireOk(response, "onedrive", "provider-upload-failed");
    const file = oneDriveItem(await jsonObject(response));
    if (!file) {
      throw new PersonalCloudUploadError("provider", "upload-result-unconfirmed", { provider: "OneDrive" });
    }
    emitProgress(input, "uploading", blob.size);
    return file;
  }
  throw new PersonalCloudUploadError("provider", "project-file-empty");
}
async function uploadOneDrive(
  input: UploadPersonalCloudPackageInput,
  contentHash: string,
): Promise<PersonalCloudUploadResult> {
  emitProgress(input, "checking", 0);
  const folder = await ensureOneDriveProjectFolder(input);
  const existing = input.binding?.remoteId
    ? await getOneDriveItemById(input, input.binding.remoteId)
    : await getOneDriveChild(input, folder.id, input.result.fileName);
  assertOneDriveVersion(input.binding, existing);
  const uploadUrl = await createOneDriveUploadSession(input, folder.id, existing);
  emitProgress(input, "uploading", 0);
  const file = await putOneDriveChunks(input, uploadUrl);
  emitProgress(input, "finalizing", input.result.blob.size);
  return Object.freeze({
    provider: "onedrive",
    remoteId: file.id,
    remotePath: `${PROJECT_FOLDER}/${projectFolderName(input.projectId)}/${file.name}`,
    remoteVersion: file.eTag,
    contentHash: `sha256:${contentHash}`,
    modifiedAt: file.modifiedAt || new Date().toISOString(),
    webUrl: file.webUrl,
    byteLength: file.size || input.result.blob.size,
  });
}

export async function uploadPersonalCloudProjectPackage(
  provider: PersonalCloudProviderId,
  input: UploadPersonalCloudPackageInput,
): Promise<PersonalCloudUploadResult> {
  if (input.binding && input.binding.provider !== provider) {
    throw new PersonalCloudUploadError("provider", "binding-provider-mismatch");
  }
  emitProgress(input, "preparing", 0);
  let contentHash: string;
  try {
    contentHash = await sha256Hex(input.result.blob);
  } catch (error) {
    throw new PersonalCloudUploadError("provider", "content-hash-failed", undefined, { cause: error });
  }
  if (provider === "google-drive") {
    return uploadGoogleDrive(input, contentHash);
  }
  if (provider === "dropbox") {
    return uploadDropbox(input, contentHash);
  }
  return uploadOneDrive(input, contentHash);
}
