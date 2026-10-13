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

export function withGodotInlineHashes(
  responsePolicy: CloudflareResponsePolicy,
  root?: string,
): CloudflareResponsePolicy;
