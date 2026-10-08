import { Check, Copy, Download, Fingerprint, Loader2 } from "lucide-react";
import { useRef, useState } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  computeContentCid,
  fetchVerifiedContent,
  parseContentCid,
  toIpfsGatewayUrl,
  toIpfsUri,
  verifyContentBytes,
} from "./ipfs-content-address";

import type { ParsedContentCid } from "./ipfs-content-address";

/** 해시는 파일 전체를 메모리에 올려 계산하므로 상한을 둔다 (벌크 전송 상한과 같은 256MB). */
const MAX_FILE_BYTES = 256 * 1024 * 1024;

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; byteLength: number; verifyNote: string; blobUrl: string }
  | { kind: "error"; message: string };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 콘텐츠 주소(IPFS) 도구 — 파일 내용 자체를 주소로 만드는 CID를 계산·검증하고,
 * CID로 게이트웨이에서 검증하며 가져온다. js-ipfs(개발 종료)도 @helia/verified-fetch도
 * 쓰지 않고, multiformats로 CID를 만든 뒤 공개 게이트웨이 fetch로 받은 바이트의 해시를
 * CID와 직접 대조한다(ipfs-content-address.ts 머리말 참조). 브라우저 노드로
 * 네트워크에 제공하는 기능은 없으며, CID는 무결성 주소·공유 링크로 쓴다.
 */
export function IpfsContentAddressPanel() {
  const lang = useI18n((state) => state.lang);
  const ko = lang.startsWith("ko");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileCid, setFileCid] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [cidInput, setCidInput] = useState("");
  const [parsed, setParsed] = useState<ParsedContentCid | null>(null);
  const [parseFailed, setParseFailed] = useState(false);
  const [fetchState, setFetchState] = useState<FetchState>({ kind: "idle" });

  const onFile = async (file: File | undefined) => {
    setFileError(null);
    setFileCid(null);
    setCopied(false);
    if (!file) return;
    setFileName(file.name);
    if (file.size > MAX_FILE_BYTES) {
      setFileError(ko
        ? `파일이 너무 큽니다. ${formatBytes(MAX_FILE_BYTES)}까지 계산할 수 있습니다.`
        : `File is too large. CIDs can be computed up to ${formatBytes(MAX_FILE_BYTES)}.`);
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setFileCid(await computeContentCid(bytes));
    } catch {
      setFileError(ko ? "CID를 계산하지 못했습니다." : "Could not compute the CID.");
    }
  };

  const onParse = (value: string) => {
    setCidInput(value);
    setFetchState({ kind: "idle" });
    if (!value.trim()) {
      setParsed(null);
      setParseFailed(false);
      return;
    }
    const result = parseContentCid(value);
    setParsed(result);
    setParseFailed(result === null);
  };

  const onFetch = async () => {
    if (!parsed) return;
    setFetchState({ kind: "loading" });
    try {
      const response = await fetchVerifiedContent(parsed.cid);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      // verified-fetch가 블록 해시를 이미 검증한다. raw CID면 바이트까지 재대조한다.
      const verdict = await verifyContentBytes(bytes, parsed.cid);
      const verifyNote = verdict === "match"
        ? (ko ? "로컬 해시 재검증까지 일치합니다." : "Local hash re-verification also matches.")
        : (ko
          ? "게이트웨이 블록 해시 검증은 통과했습니다(파일 단위 재검증은 raw CID에서만 가능합니다)."
          : "Gateway block-hash verification passed (byte-level re-verification is raw-CID only).");
      const blobUrl = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer]));
      setFetchState({ kind: "done", byteLength: bytes.byteLength, verifyNote, blobUrl });
    } catch (error) {
      setFetchState({
        kind: "error",
        message: ko
          ? `가져오지 못했습니다. 게이트웨이에 콘텐츠가 없거나, 검증에 실패했거나, 이 사이트의 보안 정책(CSP)이 게이트웨이 연결을 막았을 수 있습니다. (${error instanceof Error ? error.message : "unknown"})`
          : `Fetch failed. The content may be unavailable on gateways, may have failed verification, or this site's security policy (CSP) may have blocked the gateway connection. (${error instanceof Error ? error.message : "unknown"})`,
      });
    }
  };

  const copyCid = async () => {
    if (!fileCid) return;
    try {
      await navigator.clipboard.writeText(fileCid);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const gatewayUrl = fileCid ? toIpfsGatewayUrl(fileCid) : null;

  return (
    <section className="mb-6 rounded-2xl border border-line bg-panel/50 p-4" aria-label={ko ? "콘텐츠 주소(IPFS) 도구" : "Content addressing (IPFS) tool"}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Fingerprint size={18} aria-hidden />
        </span>
        <div>
          <h2 className="font-bold text-fg">{ko ? "콘텐츠 주소(IPFS)" : "Content addressing (IPFS)"}</h2>
          <p className="mt-1 text-sm leading-6 text-fg-2">
            {ko
              ? "파일 위치(URL)가 아니라 내용 자체가 주소가 되는 CID를 만듭니다. 같은 파일은 언제나 같은 CID라, 에셋의 무결성을 확인하거나 공유 링크로 쓰는 데 적합합니다. 가져오기는 공개 게이트웨이에서 받은 바이트의 해시를 CID와 직접 대조하며, 브라우저가 네트워크에 파일을 제공하는 기능은 없습니다. 다만 이 사이트의 보안 정책(CSP)은 허용한 주소로만 연결을 열고, 현재 연결 허용 목록(connect-src)에 공개 게이트웨이 주소(ipfs.io·dweb.link·trustless-gateway.link)가 없어 운영 사이트에서는 가져오기가 브라우저에서 차단될 수 있습니다. 그 경우에도 CID 계산·복사·게이트웨이 링크 열기는 그대로 됩니다."
              : "A CID addresses content itself, not a location. Identical files always produce the same CID, which suits asset integrity checks and share links. Fetches go through public gateways and compare the downloaded bytes' hash with the CID; the browser does not provide files to the network. However, this site's security policy (CSP) only opens connections to allowed addresses, and its current connect-src allow-list does not include the public gateways (ipfs.io, dweb.link, trustless-gateway.link), so fetching may be blocked by the browser on the production site. CID computation, copying and opening gateway links still work."}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-card p-4">
          <h3 className="text-sm font-bold text-fg">{ko ? "파일 → CID 만들기" : "File → CID"}</h3>
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            aria-label={ko ? "CID를 만들 파일 선택" : "Choose a file to address"}
            onChange={(event) => void onFile(event.currentTarget.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold text-fg-2 hover:text-fg"
          >
            {ko ? "파일 선택" : "Choose file"}
          </button>
          {fileName ? <p className="mt-2 text-xs text-fg-3">{fileName}</p> : null}
          {fileError ? <p role="alert" className="mt-2 text-sm text-danger">{fileError}</p> : null}
          {fileCid ? (
            <div className="mt-3 space-y-2 text-sm">
              <p className="break-all rounded-lg bg-canvas p-2 font-mono text-xs text-fg">{fileCid}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyCid()}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-semibold text-fg-2 hover:text-fg"
                >
                  {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
                  {copied ? (ko ? "복사됨" : "Copied") : (ko ? "CID 복사" : "Copy CID")}
                </button>
                {gatewayUrl ? (
                  <a
                    href={gatewayUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-9 items-center rounded-lg border border-line px-3 text-xs font-semibold text-fg-2 hover:text-fg"
                  >
                    {ko ? "게이트웨이에서 열기" : "Open on gateway"}
                  </a>
                ) : null}
              </div>
              <p className="break-all text-xs text-fg-3">{toIpfsUri(fileCid)}</p>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-line bg-card p-4">
          <h3 className="text-sm font-bold text-fg">{ko ? "CID 확인 · 검증하며 가져오기" : "Inspect CID · verified fetch"}</h3>
          <label className="mt-3 block">
            <span className="sr-only">{ko ? "CID 입력" : "CID input"}</span>
            <input
              value={cidInput}
              onChange={(event) => onParse(event.currentTarget.value)}
              placeholder="bafkrei… / ipfs://… / https://ipfs.io/ipfs/…"
              className="min-h-11 w-full rounded-xl border border-line bg-canvas px-3 font-mono text-xs text-fg"
            />
          </label>
          {parseFailed ? (
            <p role="alert" className="mt-2 text-sm text-danger">
              {ko ? "CID 형식이 올바르지 않습니다." : "That is not a valid CID."}
            </p>
          ) : null}
          {parsed ? (
            <div className="mt-3 space-y-2 text-sm text-fg-2">
              <p className="text-xs leading-5">
                CID v{parsed.version} · {ko ? "코덱" : "codec"} {parsed.codecName}(0x{parsed.codecCode.toString(16)}) · {ko ? "해시" : "hash"} {parsed.hashName}
              </p>
              <button
                type="button"
                onClick={() => void onFetch()}
                disabled={fetchState.kind === "loading"}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent disabled:opacity-60"
              >
                {fetchState.kind === "loading"
                  ? <Loader2 size={15} className="animate-spin" aria-hidden />
                  : <Download size={15} aria-hidden />}
                {ko ? "검증하며 가져오기" : "Fetch with verification"}
              </button>
              {fetchState.kind === "loading" ? (
                <p role="status" className="text-xs text-fg-3">
                  {ko ? "게이트웨이에서 블록을 받아 해시를 대조하는 중입니다…" : "Fetching blocks from gateways and checking hashes…"}
                </p>
              ) : null}
              {fetchState.kind === "error" ? (
                <p role="alert" className="text-sm text-danger">{fetchState.message}</p>
              ) : null}
              {fetchState.kind === "done" ? (
                <div className="space-y-2">
                  <p role="status" className="text-xs leading-5 text-fg-2">
                    {formatBytes(fetchState.byteLength)} {ko ? "를 검증해 가져왔습니다." : "fetched and verified."} {fetchState.verifyNote}
                  </p>
                  <a
                    href={fetchState.blobUrl}
                    download={`ipfs-${parsed.cid}`}
                    className="inline-flex min-h-9 items-center rounded-lg border border-line px-3 text-xs font-semibold text-fg-2 hover:text-fg"
                  >
                    {ko ? "파일로 저장" : "Save as file"}
                  </a>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
