/**
 * PackagePanel 하위 표시 컴포넌트: 미저장 전환 보호 안내 + 모듈식 키트 출처(provenance)·제공 파츠 표.
 */
import { KIT_BASE_IDS, KIT_PART_SLOTS, SLOT_LABELS_KO, SLOT_PRESET_IDS } from "../../../../contracts";

import { shortSha } from "./PackageDetail";

import type { KitBaseId, KitManifest } from "../../../../contracts";

export const KIT_BASE_LABELS_KO: Readonly<Record<KitBaseId, string>> = {
  female: "여성",
  male: "남성",
};

/** 출처 목록의 라이선스 합집합(`KitPlan.licenseNote`와 같은 규칙: 요약 + 라이선스 목록). */
export function licenseNoteOf(manifest: KitManifest): string {
  const licenses = [...new Set(manifest.provenance.sources.map((entry) => entry.license))];
  return `${manifest.provenance.summaryKo} (라이선스: ${licenses.join(", ")})`;
}

export interface PackageUnsavedGuardProps {
  readonly reasonKo: string;
  readonly targetLabelKo: string;
  readonly onSaveFirst: () => void;
  readonly onConfirmSwitch: () => void;
  readonly onCancel: () => void;
}

export function PackageUnsavedGuard({
  reasonKo,
  targetLabelKo,
  onSaveFirst,
  onConfirmSwitch,
  onCancel,
}: PackageUnsavedGuardProps) {
  return (
    <div
      className="cl-package-kit-notice"
      role="region"
      aria-label="미저장 변경 보호 안내"
      data-testid="package-unsaved-guard"
    >
      <p className="cl-package-reason">
        {reasonKo}이(가) 있습니다. &lsquo;{targetLabelKo}&rsquo;(으)로 모델을 전환하면 이미 칠한 페인트 UV나 슬롯 호환성이 달라질 수 있습니다. 먼저 레시피를 저장하거나 전환 방식을 선택하세요.
      </p>
      <div className="cl-package-actions">
        <button type="button" data-testid="package-unsaved-save-first" onClick={onSaveFirst}>
          내보내기 탭에서 먼저 저장
        </button>
        <button type="button" data-testid="package-unsaved-confirm-switch" onClick={onConfirmSwitch}>
          변경 유지하고 전환
        </button>
        <button type="button" data-testid="package-unsaved-cancel" onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  );
}

export interface KitProvenanceProps {
  readonly manifest: KitManifest;
}

/** 출처·라이선스(provenance)와 키트 메타. CC0 파생물인지 원본인지, 무엇을 가공했는지를 숨기지 않고 보인다. */
export function KitProvenance({ manifest }: KitProvenanceProps) {
  const { provenance } = manifest;
  return (
    <div className="cl-package-kit-provenance">
      <dl className="cl-package-facts">
        <dt>키트</dt>
        <dd>
          {manifest.displayName} · {manifest.kitId} v{manifest.kitVersion} · 생성 {manifest.generatedAt}
        </dd>
        <dt>제작 도구</dt>
        <dd>
          {manifest.generator.tool} · Blender {manifest.generator.blender}
        </dd>
        <dt>스켈레톤</dt>
        <dd>joint {manifest.skeleton.joints.length}개 (모든 GLB가 같은 순서)</dd>
        <dt>출처 요약</dt>
        <dd>{provenance.summaryKo}</dd>
        <dt>라이선스</dt>
        <dd>{licenseNoteOf(manifest)}</dd>
      </dl>
      <ul className="cl-package-kit-sources" aria-label="출처와 라이선스">
        {provenance.sources.map((entry) => (
          <li key={entry.id} data-source-id={entry.id}>
            <strong>{entry.name}</strong>
            {entry.version ? ` ${entry.version}` : ""} · 라이선스 {entry.license} · {entry.derivative ? "파생물" : "원본 디자인"}
            <br />
            변경 내용: {entry.changesKo}
            {entry.url ? (
              <>
                <br />
                내려받은 곳: {entry.url}
              </>
            ) : null}
            {entry.zipSha256 ? (
              <>
                <br />
                원본 SHA-256 {shortSha(entry.zipSha256)}
              </>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="cl-package-hint cl-package-kit-hint">출처 고지 파일: {provenance.noticeFile}</p>
    </div>
  );
}

export interface KitPartsTableProps {
  readonly manifest: KitManifest;
}

/** 베이스별 제공 파츠 수(어휘 대비)와 미제공 사유. 미제공은 선택할 수 없는 카드로 SlotPanel에 나타난다. */
export function KitPartsTable({ manifest }: KitPartsTableProps) {
  const bases = KIT_BASE_IDS.filter((baseId) => manifest.bases[baseId] !== undefined);
  return (
    <table className="cl-package-kit-parts">
      <caption>베이스별 제공 파츠(어휘 대비)</caption>
      <thead>
        <tr>
          <th scope="col">슬롯</th>
          {bases.map((baseId) => (
            <th key={baseId} scope="col">
              {KIT_BASE_LABELS_KO[baseId]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {KIT_PART_SLOTS.map((slot) => {
          const parts = manifest.parts.filter((part) => part.slot === slot);
          const total = SLOT_PRESET_IDS[slot].length;
          return (
            <tr key={slot} data-slot={slot}>
              <th scope="row">{SLOT_LABELS_KO[slot]}</th>
              {bases.map((baseId) => {
                const provided = parts.filter((part) => part.variants[baseId] !== undefined).length;
                const missing = parts.filter((part) => part.variants[baseId] === undefined);
                const title = missing.map((part) => `${part.id}: ${part.unavailable[baseId] ?? "미제공"}`).join(" / ");
                return (
                  <td key={baseId} data-base={baseId} title={title || undefined}>
                    {provided}/{total}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
