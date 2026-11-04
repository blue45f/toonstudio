import { z } from "zod";
import { HttpException } from "@nestjs/common";
import { STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";

export const StudioBg3dReaderCapabilitiesSchema = z.array(z.string().regex(/^[a-z0-9][a-z0-9.-]{0,63}$/u)).max(16).refine((values) => new Set(values).size === values.length);
export class StudioBg3dReaderUpgradeRequiredError extends Error {
  readonly requiredReaderCapabilities = [STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY];
  constructor() { super("이 원고의 보존된 6패스를 읽을 수 있는 앱으로 업데이트해 주세요."); this.name = "StudioBg3dReaderUpgradeRequiredError"; }
}
export function isStudioBg3dReaderUpgradeRequired(error: unknown): boolean {
  if (error instanceof StudioBg3dReaderUpgradeRequiredError) return true;
  if (!(error instanceof HttpException)) return false;
  const response = error.getResponse();
  return response !== null && typeof response === "object" && "code" in response && response.code === "studio_bg3d_reader_upgrade_required";
}
