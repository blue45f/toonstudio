import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";

import { getSessionAuthenticationPrincipal } from "../../session-middleware";

interface GovernanceRequestLike extends Partial<Request> {
  headers: Record<string, string | string[] | undefined>;
}

const ALLOWED_OPERATOR_ROLES = new Set(["admin", "studio-admin", "legal-ops"]);

/**
 * session-middleware가 서명 세션 토큰 검증 후 설정한 주체(WeakMap principal 또는 검증된 x-user-id)와
 * 운영자 역할을 함께 검사해 헤더 단독 위조를 차단하는 NestJS 가드.
 */
@Injectable()
export class IpGovernanceOperatorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<GovernanceRequestLike>();
    const principal = getSessionAuthenticationPrincipal(req as Request);
    const rawUserId = req.headers["x-user-id"];
    const headerUserId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
    const authenticatedUserId = principal?.userId ?? headerUserId?.trim() ?? "";

    if (!authenticatedUserId) {
      throw new ForbiddenException("서명된 세션 로그인이 필요합니다.");
    }

    const rawRole = req.headers["x-toonstudio-governance-role"];
    const role = (Array.isArray(rawRole) ? rawRole[0] : rawRole ?? "").trim().toLowerCase();
    if (!ALLOWED_OPERATOR_ROLES.has(role)) {
      throw new ForbiddenException(
        "트러스트 배지 철회·재발급은 admin, studio-admin 또는 legal-ops 권한이 필요합니다.",
      );
    }

    return true;
  }
}
