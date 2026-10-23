export interface CloudflareResponseHeader {
  key?: string;
  value?: string;
}

export interface CloudflareResponseRule {
  source?: string;
  headers?: CloudflareResponseHeader[];
}

export interface CloudflareResponsePolicy {
  headers?: CloudflareResponseRule[];
}

export function withInlineScriptHashes(
  responsePolicy: CloudflareResponsePolicy,
  root?: string,
): CloudflareResponsePolicy;
