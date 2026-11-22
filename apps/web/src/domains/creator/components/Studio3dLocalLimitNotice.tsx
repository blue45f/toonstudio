import { HardDrive } from "lucide-react";
import { useMemo } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  describeStudio3dLocalLimitBanner,
  resolveStudio3dUploadLimitPolicy,
  type Studio3dDeviceProfile,
} from "../import-safety/studio-3d-upload-limit-policy";

export interface Studio3dLocalLimitNoticeProps {
  readonly profile?: Studio3dDeviceProfile;
  readonly includeSkp?: boolean;
  readonly includeCloudNote?: boolean;
}

/** 현재 브라우저의 Wasm64·기기 메모리·OPFS 기준 로컬 3D 수용 한도와 클라우드 동기화 한도를 구분해 안내한다. */
export function Studio3dLocalLimitNotice({
  profile = "desktop",
  includeSkp = false,
  includeCloudNote = true,
}: Studio3dLocalLimitNoticeProps) {
  const locale = useI18n((state) => state.lang);
  const copy = useMemo(() => {
    const policy = resolveStudio3dUploadLimitPolicy({ profile });
    return describeStudio3dLocalLimitBanner(policy, { includeSkp, includeCloudNote });
  }, [profile, includeSkp, includeCloudNote]);

  const isKo = locale.startsWith("ko");
  return (
    <div
      data-testid="studio-3d-local-limit-notice"
      className="mt-2 rounded-xl border border-line bg-card/70 px-3 py-2 text-[0.7rem] leading-relaxed text-fg-2"
    >
      <p className="flex items-center gap-1.5 font-bold text-fg">
        <HardDrive size={13} className="shrink-0 text-accent" aria-hidden />
        <span>{isKo ? copy.headlineKo : copy.headlineEn}</span>
      </p>
      <p className="mt-1 text-fg-3">{isKo ? copy.detailKo : copy.detailEn}</p>
    </div>
  );
}
