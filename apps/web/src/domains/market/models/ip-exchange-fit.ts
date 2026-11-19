/**
 * 마켓 B2B 원천 IP 2차 판권 딜 준비도 및 3D 배경·소품 셀러 리소스 Fit 검증 모델.
 * 순수 함수·결정론·DOM/React 무관.
 */

export type IpDealMediumId =
  | "drama-film"
  | "animation"
  | "game-dlc"
  | "local-tourism"
  | "education-public"
  | "wellness-goods";

export interface B2bIpListingSpec {
  readonly id: string;
  readonly title: string;
  readonly genre: string;
  readonly medium: IpDealMediumId;
  readonly episodesReady: number;
  readonly rightsBomCleared: boolean;
  readonly hasPilotCutPack: boolean;
  readonly hasStoryBible: boolean;
  readonly creatorRoyaltyPercent: number;
  readonly targetMgKrw: number;
}

export interface B2bIpDealAssessment {
  readonly listingId: string;
  readonly readinessScore: number;
  readonly status: "deal-ready" | "needs-pack" | "blocked";
  readonly statusLabelKo: string;
  readonly checklistKo: readonly string[];
}

export interface Seller3dAssetSpec {
  readonly assetId: string;
  readonly title: string;
  readonly format: "skp" | "glb" | "vrm";
  readonly modularSnap1m: boolean;
  readonly manifoldClean: boolean;
  readonly commercialBomCleared: boolean;
  readonly autoRoyaltyPercent: number;
}

export interface Seller3dAssetFitReport {
  readonly assetId: string;
  readonly fitScore: number;
  readonly badgeLabelKo: string;
  readonly tone: "good" | "warn" | "bad";
  readonly notesKo: readonly string[];
}

export const IP_DEAL_MEDIUM_LABELS: Readonly<Record<IpDealMediumId, string>> = Object.freeze({
  "drama-film": "드라마·영화 영상화",
  animation: "애니메이션·OTT",
  "game-dlc": "게임화·콜라보",
  "local-tourism": "로컬 관광·F&B 협업",
  "education-public": "역사·교육·공공 IP",
  "wellness-goods": "웰니스·감정 굿즈",
});

export function evaluateB2bIpDealReadiness(spec: B2bIpListingSpec): B2bIpDealAssessment {
  let score = 100;
  const checklistKo: string[] = [];

  if (!spec.rightsBomCleared) {
    score -= 45;
    checklistKo.push("상업 권리 BOM 클리어런스 미완료");
  }
  if (!spec.hasPilotCutPack) {
    score -= 20;
    checklistKo.push("파일럿 3컷 시각화 팩 미등록");
  }
  if (!spec.hasStoryBible) {
    score -= 20;
    checklistKo.push("세계관·인물 바이블 미연동");
  }
  if (spec.episodesReady < 10) {
    score -= 15;
    checklistKo.push(`최소 확보 회차 보강 필요 (${spec.episodesReady}/10화)`);
  }

  const bounded = Math.max(0, Math.min(100, score));
  const status: B2bIpDealAssessment["status"] = !spec.rightsBomCleared
    ? "blocked"
    : bounded >= 80
      ? "deal-ready"
      : "needs-pack";
  const statusLabelKo =
    status === "deal-ready"
      ? "B2B 딜 즉시 검토 가능"
      : status === "needs-pack"
        ? "피치 자료 보강 필요"
        : "권리 BOM 확인 대기";

  if (checklistKo.length === 0) {
    checklistKo.push("권리 BOM·파일럿 컷·세계관 바이블 검증 완료");
  }

  return {
    listingId: spec.id,
    readinessScore: bounded,
    status,
    statusLabelKo,
    checklistKo,
  };
}

export function evaluate3dSellerAssetFit(spec: Seller3dAssetSpec): Seller3dAssetFitReport {
  let score = 100;
  const notesKo: string[] = [];

  if (!spec.commercialBomCleared) {
    score -= 50;
    notesKo.push("상업 이용 Rights BOM 확인 필요");
  }
  if (!spec.manifoldClean) {
    score -= 25;
    notesKo.push("매쉬 토폴로지·면 겹침 정화 권장");
  }
  if (!spec.modularSnap1m) {
    score -= 15;
    notesKo.push("1m 조립형 스냅 규격 미적용");
  }
  if (spec.format === "skp") {
    notesKo.push("브라우저 OpenSKP 워커로 GLB 즉시 변환 지원");
  } else {
    notesKo.push(`${spec.format.toUpperCase()} 포맷 3D 스테이지 바로 배치 가능`);
  }

  const bounded = Math.max(0, Math.min(100, score));
  const tone: Seller3dAssetFitReport["tone"] = !spec.commercialBomCleared
    ? "bad"
    : bounded >= 85
      ? "good"
      : "warn";
  const badgeLabelKo =
    tone === "good"
      ? `스튜디오 Fit ${bounded}점 · 즉시 배치`
      : tone === "warn"
        ? `스튜디오 Fit ${bounded}점 · 점검 권장`
        : "상업 라이선스 보류";

  return {
    assetId: spec.assetId,
    fitScore: bounded,
    badgeLabelKo,
    tone,
    notesKo,
  };
}
