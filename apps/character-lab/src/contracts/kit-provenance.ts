/**
 * 키트 출처·라이선스 계약 — `character-kit.ts`에서 2026-10-23 CORE-1이 옮겼다(파일 크기 래칫 상쇄 추출, 규칙·문구 변경 없음).
 * v1·v2 키트 매니페스트가 같은 출처 규칙을 쓴다(라이선스 검사를 두 벌로 두지 않는다). `character-kit.ts`가 다시 내보낸다.
 */
import { z } from "zod";

import type { KitIssue } from "./kit-skeleton";

const SHA256_HEX = /^[0-9a-f]{64}$/u;
const HANGUL = /[가-힣]/u;

/**
 * 출처 라이선스 어휘.
 * - `CC0-1.0`: 내려받은 CC0 원천(예: Human Base Meshes). https URL과 원천 SHA-256이 필요하다.
 * - `original`: 이 저장소에서 새로 만든 원본 디자인.
 * - `hyper3d-rodin-output`(2026-10-11 추가): Hyper3D(Rodin) 구독 플랜으로 생성한 산출물과 그 파생물. 법적 허용을 뜻하지 않는다 —
 *   약관상 닫히지 않은 점은 `docs/hyper3d-terms-record.md`에 있고, 그 기록을 가리키는 `evidenceDoc`과 `generationId`가 없으면 거부해
 *   기록 없이 반입하지 못하게 하는 것이 목적이다.
 */
export const KIT_ALLOWED_LICENSES = ["CC0-1.0", "original", "hyper3d-rodin-output"] as const;

/** `hyper3d-rodin-output` 출처가 가리켜야 하는 반입 기록 문서(저장소 루트 기준 경로 접두) */
export const KIT_HYPER3D_EVIDENCE_PREFIX = "apps/character-lab/docs/";

const sha256Schema = z.string().regex(SHA256_HEX, "sha256은 64자리 소문자 hex여야 합니다.");

export const kitSourceSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    version: z.string().optional(),
    url: z.string().optional(),
    /** 내려받은 원천의 SHA-256(zip 또는, Hyper3D 생성물이면 원본 GLB) */
    zipSha256: sha256Schema.optional(),
    license: z.enum(KIT_ALLOWED_LICENSES),
    derivative: z.boolean(),
    changesKo: z.string(),
    /** `hyper3d-rodin-output` 전용: Hyper3D 생성 id(uuid) */
    generationId: z.string().uuid().optional(),
    /** `hyper3d-rodin-output` 전용: 반입 기록 문서 경로(저장소 루트 기준, `apps/character-lab/docs/` 아래) */
    evidenceDoc: z.string().optional(),
  })
  .strict();
export type KitSource = z.infer<typeof kitSourceSchema>;

/** provenance: 내려받은 소스는 https URL + zip SHA-256, 변경 내용은 한글, Hyper3D 산출물은 반입 기록 필수 */
export function kitProvenanceIssues(sources: readonly KitSource[]): KitIssue[] {
  const issues: KitIssue[] = [];
  sources.forEach((source, index) => {
    const path = ["provenance", "sources", index];
    if (source.license !== "original") {
      if (source.url === undefined || !source.url.startsWith("https://")) issues.push({ path: [...path, "url"], message: `${source.id}: 내려받은 소스는 https URL이 필요합니다.` });
      if (source.zipSha256 === undefined) issues.push({ path: [...path, "zipSha256"], message: `${source.id}: 내려받은 소스는 zipSha256이 필요합니다.` });
    }
    if (!HANGUL.test(source.changesKo)) issues.push({ path: [...path, "changesKo"], message: `${source.id}: changesKo에 한글 변경 내용이 필요합니다.` });
    if (source.license === "hyper3d-rodin-output") {
      if (!source.derivative) issues.push({ path: [...path, "derivative"], message: `${source.id}: Hyper3D 산출물은 리타깃·재베이크를 거친 파생물이어야 합니다(derivative: true).` });
      if (source.generationId === undefined) issues.push({ path: [...path, "generationId"], message: `${source.id}: Hyper3D 산출물은 generationId(uuid)가 필요합니다.` });
      const evidence = source.evidenceDoc;
      if (evidence === undefined || !evidence.startsWith(KIT_HYPER3D_EVIDENCE_PREFIX) || evidence.includes("..")) {
        issues.push({ path: [...path, "evidenceDoc"], message: `${source.id}: Hyper3D 산출물은 반입 기록 문서 경로(evidenceDoc, ${KIT_HYPER3D_EVIDENCE_PREFIX} 아래)가 필요합니다.` });
      }
    } else if (source.generationId !== undefined || source.evidenceDoc !== undefined) {
      issues.push({ path: [...path, "generationId"], message: `${source.id}: generationId·evidenceDoc은 hyper3d-rodin-output 출처에만 쓸 수 있습니다.` });
    }
  });
  return issues;
}
