import { BadRequestException } from "@nestjs/common";
import { scopeContains, validateProductionReviewPolicy, type ProductionProjectAggregate, type ReviewPolicy } from "@toonstudio/core/production";

/** 호출자의 manage 권한은 기존 repository 경계가 확인하고 정책 내용은 같은 최신 aggregate로 검사한다. */
export function applyProductionReviewPolicyCommand(aggregate: ProductionProjectAggregate, policy: ReviewPolicy, at: string) {
  const issues = [...validateProductionReviewPolicy(aggregate, policy, at)];
  if (aggregate.reviewPolicies.filter((entry) => entry.id === policy.id).length > 1) issues.push("같은 정책 ID가 중복되어 있습니다.");
  if (!issues.length && aggregate.reviewPolicies.some((entry) => entry.id !== policy.id
    && scopeContains(entry.scope, policy.scope) && scopeContains(policy.scope, entry.scope))) {
    issues.push("같은 범위에는 검수 정책이 이미 있습니다. 기존 정책을 선택해 수정하세요.");
  }
  if (issues.length) throw new BadRequestException({ message: "검수 정책을 저장할 수 없습니다.", issues });
  const found = aggregate.reviewPolicies.some((entry) => entry.id === policy.id);
  return { aggregate: { ...aggregate, reviewPolicies: found
    ? aggregate.reviewPolicies.map((entry) => entry.id === policy.id ? policy : entry)
    : [...aggregate.reviewPolicies, policy] } };
}
