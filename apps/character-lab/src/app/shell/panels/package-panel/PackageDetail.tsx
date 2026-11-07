/** 검증된 제작 패키지의 상세 정보와 슬롯 능력을 표시한다. 로딩·소스 전환은 PackagePanel이 소유한다. */
import { CHARACTER_SLOT_KINDS, SLOT_LABELS_KO } from "../../../../contracts";
import { compareCapabilities } from "../../../../domains/authored/package-capability";

import type { SlotCapabilityStatus, SlotKind } from "../../../../contracts";
import type { AuthoredPackageLoadResult } from "../../../../domains/authored/package-load-flow";
import type { VrmcVrmInfo } from "../../../../domains/authored/vrm-extension-parser";

type LoadedPackage = Extract<AuthoredPackageLoadResult, { ok: true }>;

export interface PackageReadyState {
  readonly phase: "ready";
  readonly result: LoadedPackage;
  readonly vrm: VrmcVrmInfo | null;
  readonly vrmNoteKo: string;
  readonly applied: "engine" | "registry";
}

const STATUS_LABELS_KO: Readonly<Record<SlotCapabilityStatus, string>> = { available: "지원", partial: "부분 지원", unavailable: "미지원" };

export function shortSha(sha: string | null | undefined): string {
  return sha ? `${sha.slice(0, 12)}…` : "-";
}

interface CapabilityTableProps {
  readonly result: LoadedPackage;
}

function CapabilityTable({ result }: CapabilityTableProps) {
  const { judgement } = result.detail;
  const comparison = compareCapabilities(judgement.ruleOnly, result.plan.capabilities);
  const divergent = new Map<SlotKind, SlotCapabilityStatus>(comparison.divergent.map((entry) => [entry.slot, entry.rule]));
  return (
    <table className="cl-package-capabilities">
      <caption>
        15슬롯 능력(선언 = Blender 레인 slot-mapping.json, 규칙 = manifest 판정) · 불일치 {comparison.divergent.length}개
      </caption>
      <thead>
        <tr>
          <th scope="col">슬롯</th>
          <th scope="col">상태</th>
          <th scope="col">출처</th>
          <th scope="col">사유</th>
        </tr>
      </thead>
      <tbody>
        {CHARACTER_SLOT_KINDS.map((slot) => {
          const capability = result.plan.capabilities[slot];
          const ruleStatus = divergent.get(slot);
          return (
            <tr key={slot} data-slot={slot} data-status={capability.status}>
              <th scope="row">{SLOT_LABELS_KO[slot]}</th>
              <td>
                <span className={`cl-package-badge cl-package-badge--${capability.status}`}>{STATUS_LABELS_KO[capability.status]}</span>
              </td>
              <td>
                {judgement.basis[slot] === "declared" ? "선언" : "규칙"}
                {ruleStatus ? ` (규칙 판정: ${STATUS_LABELS_KO[ruleStatus]})` : ""}
              </td>
              <td className="cl-package-reason">{capability.reasonKo ?? ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

interface PackageDetailProps {
  readonly state: PackageReadyState;
}

export function PackageDetail({ state }: PackageDetailProps) {
  const { result, vrm, vrmNoteKo, applied } = state;
  const { plan, detail } = result;
  const { bones, shapeKeys, meshes } = detail.judgement.mappings;
  const quality = plan.manifest.quality;
  return (
    <div className="cl-package-detail">
      <p className="cl-package-status" role="status">
        {applied === "engine" ? "엔진에 올렸습니다" : "플랜을 등록했습니다(엔진이 준비되면 적용 루프가 올립니다)"} · GLB SHA-256 {shortSha(detail.observedSha256)} 검증 일치 · {plan.glbBytes.toLocaleString("ko-KR")} B
      </p>
      <dl className="cl-package-facts">
        <dt>품질(패키지 선언)</dt>
        <dd>
          {quality.score} / 최소 {quality.minimumScore} · {quality.passed ? "통과" : "미통과"}
        </dd>
        <dt>라이선스</dt>
        <dd>{plan.licenseNote}</dd>
        <dt>헤어</dt>
        <dd>
          {detail.hairLod.style ?? "없음"} · LOD {detail.hairLod.lods.join("/") || "-"} · 표시 LOD {detail.hairLod.chosen ?? "-"} · 숨김 {detail.hairLod.hidden.length}개 · 삼각형 {plan.manifest.capabilities.authoredHair.lodTriangles.join("/") || "-"}
        </dd>
        <dt>본 매핑</dt>
        <dd>
          필수 {bones.required.covered.length}/15 · 손가락 {bones.fingers.covered.length}/30 · 전체 {bones.all.covered.length}/55 · 미매핑 {bones.unmapped.length}개
        </dd>
        <dt>shape key</dt>
        <dd>
          매핑 {Object.keys(shapeKeys.mapped).length}개 · 규약 밖 {shapeKeys.unmapped.length}개 · FACS 유닛 {detail.judgement.facsUnits.length}개
        </dd>
        <dt>메시 역할</dt>
        <dd>
          분류 {Object.keys(meshes.roles).length}개 · 미분류 {meshes.unknown.length}개 · 외곽선 셸 {meshes.outlines.length}개
        </dd>
        <dt>VRM 확장(베타 파서)</dt>
        <dd>{vrm ? `${vrm.family} · ${vrm.meta.name ?? "이름 없음"} · 저자 ${vrm.meta.authors.join(", ") || "-"} · 라이선스 ${vrm.meta.licenseName ?? "-"} · humanoid ${Object.keys(vrm.humanoid).length}본 · 표정 ${vrm.expressions.length}개` : vrmNoteKo}</dd>
      </dl>
      <p className="cl-package-hint">패키지 제공자가 기록한 검수 점수입니다. 파일 크기와 SHA-256은 불러온 데이터로 확인합니다.</p>
      {detail.warnings.length > 0 ? (
        <ul className="cl-package-warnings" aria-label="경고">
          {detail.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      <CapabilityTable result={result} />
      {detail.gaps.length > 0 ? (
        <details className="cl-package-gaps">
          <summary>패키지 격차 {detail.gaps.length}개</summary>
          <ul>
            {detail.gaps.map((gap) => (
              <li key={gap.id}>
                [{gap.severity}] {gap.id}: {gap.summary}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {shapeKeys.unmapped.length > 0 || bones.unmapped.length > 0 || meshes.unknown.length > 0 ? (
        <details className="cl-package-unmapped">
          <summary>규약 밖 이름(사유)</summary>
          <ul>
            {shapeKeys.unmapped.map((entry) => (
              <li key={`sk:${entry.name}`}>shape key {entry.reasonKo}</li>
            ))}
            {bones.unmapped.map((entry) => (
              <li key={`bone:${entry.name}`}>본 {entry.reasonKo}</li>
            ))}
            {meshes.unknown.map((entry) => (
              <li key={`mesh:${entry.name}`}>메시 {entry.reasonKo}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
