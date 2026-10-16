import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";

import { isStudioRasterAssetAdmissionOptedIn } from "@toonstudio/contracts/studio-raster-asset-contract";
import { isStudioWorkAssetAdmissionOptedIn } from "@toonstudio/contracts/studio-work-asset-contract";

interface StudioAssetUploadRequest {
  headers?: Record<string, string | string[] | undefined>;
}

function requireAuthenticatedUploadRequest(context: ExecutionContext): void {
  const request = context.switchToHttp().getRequest<StudioAssetUploadRequest>();
  const userId = request.headers?.["x-user-id"];
  if (typeof userId !== "string" || userId.length === 0) {
    throw new ForbiddenException("로그인이 필요해요.");
  }
}

/**
 * 업로드 라우트용 최소 가드. 가드는 인터셉터(Multer)보다 먼저 실행되므로, 로그인하지 않은 호출이
 * 라우트 한도(5~20MB)만큼 본문을 메모리에 쌓게 하지 않고 본문을 읽기 전에 403 으로 끊는다.
 * 서비스의 권한 검사(작품 구성원·편집 권한)는 그대로 두고 그 앞에 로그인 확인만 더한다.
 */
@Injectable()
export class AuthenticatedUploadGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    requireAuthenticatedUploadRequest(context);
    return true;
  }
}

/** Runs before Multer, so a disabled experiment never buffers an upload body. */
@Injectable()
export class StudioRasterAssetUploadGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    requireAuthenticatedUploadRequest(context);
    if (!isStudioRasterAssetAdmissionOptedIn(
      process.env.STUDIO_RASTER_ASSET_ADMISSION
    )) {
      throw new ForbiddenException(
        "래스터 공동 편집 저장은 검증된 렌더러 인계가 준비될 때까지 비활성화되어 있습니다."
      );
    }
    return true;
  }
}

/** Runs before Multer, keeping every unfinished work-asset body path fail-closed. */
@Injectable()
export class StudioWorkAssetUploadGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    requireAuthenticatedUploadRequest(context);
    if (!isStudioWorkAssetAdmissionOptedIn(
      process.env.STUDIO_WORK_ASSET_ADMISSION
    )) {
      throw new ForbiddenException(
        "협업 에셋 입장은 안전한 버전 교체 기능을 준비하는 동안 비활성화되어 있습니다."
      );
    }
    return true;
  }
}
