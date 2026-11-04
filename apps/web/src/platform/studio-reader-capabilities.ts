import { STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";

/** 기능 입장 전에 실제 본문을 검증하는 reader만 이 capability를 선언한다. */
export const STUDIO_READER_CAPABILITIES = [STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY] as const;
export const STUDIO_READER_CAPABILITY_HEADERS = { "x-studio-reader-capabilities": JSON.stringify(STUDIO_READER_CAPABILITIES) } as const;
export function withStudioReaderCapabilities<T extends object>(input: T): T & { readonly readerCapabilities: typeof STUDIO_READER_CAPABILITIES } {
  return { ...input, readerCapabilities: STUDIO_READER_CAPABILITIES };
}
