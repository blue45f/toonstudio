import {
  Edit,
  LoaderCircle,
  ShieldAlert,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import { marketAuthorityErrorMessage } from "../models/market-authority";
import { updateCustomPublishedResource } from "../models/market-custom-registry";
import { MARKET_LICENSE_GUIDE } from "../models/market-kind";

import type {
  CreatorMarketplaceResourceLicense,
  CreatorMarketplaceResourceManifest,
  CreatorMarketplaceResourceRecord,
} from "@/shared/lib/creator-marketplace-resource-contract";

import { publishCreatorMarketplaceResource } from "@/platform/creator-marketplace-client";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

interface MarketEditResourceModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly record: CreatorMarketplaceResourceRecord;
  readonly onSaved: (updated: CreatorMarketplaceResourceRecord) => void;
  readonly mode?: "local" | "server";
}

function nextPatchSemVer(version: string): string {
  const parts = version.split(".");
  if (parts.length === 3) {
    const patch = Number(parts[2]);
    if (Number.isInteger(patch) && patch >= 0) {
      return `${parts[0]}.${parts[1]}.${patch + 1}`;
    }
  }
  return "1.0.1";
}

export function MarketEditResourceModal({
  open,
  onClose,
  record,
  onSaved,
  mode = "local",
}: MarketEditResourceModalProps) {
  const t = useBilingual("MarketEditResourceModal");
  const isServerRelease = mode === "server";
  const [name, setName] = useState(record.name);
  const [description, setDescription] = useState(record.description ?? "");
  const [tagInput, setTagInput] = useState(record.tags.join(", "));
  const [license, setLicense] = useState<CreatorMarketplaceResourceLicense>(() =>
    record.license === "toonstudio-standard" ? "toonspectrum-standard" : record.license,
  );
  const [attributionText, setAttributionText] = useState(
    () => record.attributionText || record.publisher.name,
  );
  const [bumpVersion, setBumpVersion] = useState(isServerRelease);
  const [newVersion, setNewVersion] = useState(() => nextPatchSemVer(record.resourceVersion));
  const [releaseNotes, setReleaseNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!open) return null;

  const requiresAttribution = license === "cc-by-4.0" || license === "cc-by-nc-4.0";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setErrorMessage(null);

    const parsedTags = tagInput
      .split(",")
      .map((tag) => tag.trim().replace(/^#/u, ""))
      .filter((tag) => tag.length > 0)
      .slice(0, 8);

    const targetVersion = newVersion.trim();
    if ((isServerRelease || bumpVersion) && !/^\d+\.\d+\.\d+$/u.test(targetVersion)) {
      setErrorMessage(
        t(
          "버전 번호는 1.0.1 같은 3자리 SemVer 형식이어야 합니다.",
          "Version must be a 3-part SemVer string such as 1.0.1.",
        ),
      );
      return;
    }

    if (requiresAttribution && !attributionText.trim()) {
      setErrorMessage(
        t(
          "CC BY 계열 라이선스에는 출처 표시 문구를 입력해야 합니다.",
          "Attribution text is required for CC BY licenses.",
        ),
      );
      return;
    }

    setSubmitting(true);
    try {
      const mergedDescription = releaseNotes.trim()
        ? `${description.trim()}\n\n[v${targetVersion} 변경사항] ${releaseNotes.trim()}`.trim().slice(0, 1000)
        : description.trim();

      if (isServerRelease) {
        const manifest: CreatorMarketplaceResourceManifest = {
          schemaVersion: 1,
          packageId: record.packageId,
          name: name.trim(),
          description: mergedDescription,
          kind: record.kind,
          resourceVersion: targetVersion,
          minimumStudioVersion: record.minimumStudioVersion,
          tags: parsedTags,
          license,
          attributionText: requiresAttribution
            ? attributionText.trim()
            : record.attributionText,
          containsAi: record.containsAi,
          rightsConfirmed: true,
          provenance: record.provenance,
          compatibility: record.compatibility,
          ...(record.previewRef ? { previewRef: record.previewRef } : {}),
          entries: record.entries,
        };
        const published = await publishCreatorMarketplaceResource(manifest);
        onSaved(published);
        onClose();
        return;
      }

      const updates: Partial<CreatorMarketplaceResourceRecord> = {
        name: name.trim(),
        description: mergedDescription,
        tags: parsedTags,
        license,
        ...(requiresAttribution ? { attributionText: attributionText.trim() } : {}),
        ...(bumpVersion && targetVersion
          ? {
            resourceVersion: targetVersion,
          }
          : {}),
      };

      const updated = updateCustomPublishedResource(record.id, updates);
      if (updated) {
        onSaved(updated);
        onClose();
      } else {
        setErrorMessage(
          t(
            "브라우저 등록 항목을 찾지 못했습니다. 서버 게시 패키지는 판매자 센터 관리 탭에서 새 버전으로 배포해 주세요.",
            "Could not find local draft entry. Use Seller Center Package Management to publish a new server release.",
          ),
        );
      }
    } catch (caught) {
      setErrorMessage(
        marketAuthorityErrorMessage(
          caught,
          t(
            "새 버전 릴리스를 게시하지 못했습니다. 버전 번호가 기존보다 높은지 확인해 주세요.",
            "Failed to publish the new release. Ensure the SemVer version is higher than previous releases.",
          ),
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="market-edit-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-card shadow-2xl animate-hud-in duration-200">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="market-edit-title" className="flex items-center gap-2 text-base font-bold text-fg">
            <Edit className="size-4 text-accent" aria-hidden="true" />
            <span>
              {isServerRelease
                ? t("새 버전 SemVer 릴리스 배포", "Publish New SemVer Release")
                : t("에셋 정보 수정 및 새 버전 릴리즈", "Edit Asset & Release New Version")}
            </span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-fg-3 hover:bg-raised hover:text-fg"
          >
            <X className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("닫기", "Close")}</span>
          </button>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="max-h-[80vh] space-y-4 overflow-y-auto p-5">
          {errorMessage ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/10 px-3.5 py-2.5 text-xs text-fg"
            >
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          ) : null}

          <div>
            <label htmlFor="edit-asset-name" className="block text-xs font-semibold text-fg">
              {t("에셋명", "Asset name")}
            </label>
            <input
              id="edit-asset-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
              className="mt-1 h-9 w-full rounded-lg border border-line bg-panel px-2.5 text-xs text-fg focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="edit-asset-desc" className="block text-xs font-semibold text-fg">
              {t("상세 설명", "Description")}
            </label>
            <textarea
              id="edit-asset-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              className="mt-1 w-full rounded-xl border border-line bg-panel p-2.5 text-xs leading-relaxed text-fg focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="edit-asset-tags" className="block text-xs font-semibold text-fg">
              {t("태그 (쉼표로 구분, 최대 8개)", "Tags (comma-separated, max 8)")}
            </label>
            <input
              id="edit-asset-tags"
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="선화, 펜터치, 3D, 웹툰, 로판"
              className="mt-1 h-9 w-full rounded-lg border border-line bg-panel px-2.5 text-xs text-fg focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="edit-asset-license" className="block text-xs font-semibold text-fg">
              {t("사용권 라이선스", "Usage license")}
            </label>
            <select
              id="edit-asset-license"
              value={license}
              onChange={(e) => setLicense(e.target.value as CreatorMarketplaceResourceLicense)}
              disabled={record.provenance.origin === "permissive"}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-panel px-2 text-xs text-fg focus:border-accent focus:outline-none disabled:opacity-60"
            >
              {MARKET_LICENSE_GUIDE.filter(
                (lic) =>
                  record.provenance.origin !== "permissive" ||
                  lic.license !== "toonspectrum-standard",
              ).map((lic) => (
                <option key={lic.license} value={lic.license}>
                  {lic.label} ({lic.summary})
                </option>
              ))}
            </select>
          </div>

          {requiresAttribution ? (
            <div>
              <label htmlFor="edit-asset-attribution" className="block text-xs font-semibold text-fg">
                {t("필수 출처 표기 문구", "Required attribution text")}
              </label>
              <input
                id="edit-asset-attribution"
                type="text"
                value={attributionText}
                onChange={(e) => setAttributionText(e.target.value)}
                maxLength={240}
                required
                className="mt-1 h-9 w-full rounded-lg border border-line bg-panel px-2.5 text-xs text-fg focus:border-accent focus:outline-none"
              />
            </div>
          ) : null}

          <div className="space-y-3 rounded-xl border border-accent/40 bg-accent/5 p-3.5">
            {isServerRelease ? (
              <p className="text-xs font-bold text-fg">
                {t(
                  "서버 패키지는 기존 버전을 덮어쓰지 않고 새 SemVer 릴리스를 head로 게시합니다.",
                  "Server packages are immutable; publishing creates a new SemVer release head.",
                )}
              </p>
            ) : (
              <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-bold text-fg">
                <input
                  type="checkbox"
                  checked={bumpVersion}
                  onChange={(e) => setBumpVersion(e.target.checked)}
                  className="rounded border-line text-accent focus:ring-accent"
                />
                <span>{t("새 버전으로 판올림 릴리즈 (SemVer Update)", "Bump SemVer version")}</span>
              </label>
            )}

            {isServerRelease || bumpVersion ? (
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-fg-3">
                    {t(`현재 v${record.resourceVersion} →`, `Current v${record.resourceVersion} →`)}
                  </span>
                  <input
                    type="text"
                    value={newVersion}
                    onChange={(e) => setNewVersion(e.target.value)}
                    placeholder="1.1.0"
                    aria-label={t("새 버전 번호", "New SemVer version")}
                    className="h-8 w-28 rounded-lg border border-line bg-panel px-2 font-mono text-xs font-bold text-accent focus:border-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="edit-asset-release-notes" className="block text-[0.7rem] font-semibold text-fg">
                    {t("릴리즈 노트 (업데이트 변경사항)", "Release notes (changelog)")}
                  </label>
                  <textarea
                    id="edit-asset-release-notes"
                    rows={2}
                    value={releaseNotes}
                    onChange={(e) => setReleaseNotes(e.target.value)}
                    placeholder={t(
                      "예: 필압 보정 곡선 최적화 및 3D 뷰포트 은선 렌더링 성능 향상",
                      "e.g. Optimized pressure curve and improved 3D hidden-line performance",
                    )}
                    className="mt-1 w-full rounded-lg border border-line bg-panel p-2 text-xs text-fg focus:border-accent focus:outline-none"
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className={buttonClass({ variant: "ghost", size: "sm" })}
            >
              {t("취소", "Cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className={buttonClass({
                variant: "solid",
                size: "md",
                className: "gap-1.5 disabled:opacity-40",
              })}
            >
              {submitting ? (
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              {isServerRelease
                ? t("새 버전 서버 게시", "Publish new release")
                : t("수정 사항 저장", "Save changes")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
