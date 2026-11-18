import { HttpException, HttpStatus, Injectable, PayloadTooLargeException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { WORK_VRM_CUT_BODY_BYTES } from "@toonstudio/contracts/studio-work-vrm-cut";

@Injectable()
export class StudioWorkVrmCutBodyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    // 브라우저가 계산한 multipart 전체 길이를 먼저 제한한다. 파일 단위 Multer 한도만으로는 동시 버퍼 총량을 막지 못한다.
    const raw = context.switchToHttp().getRequest<{ headers: { "content-length"?: string } }>().headers["content-length"];
    if (!raw || !/^\d+$/u.test(raw)) throw new HttpException("팀 컷 업로드 본문의 전체 길이가 필요합니다.", HttpStatus.LENGTH_REQUIRED);
    if (Number(raw) > WORK_VRM_CUT_BODY_BYTES + 128 * 1024) throw new PayloadTooLargeException("팀 컷 파일의 전체 크기를 초과했습니다.");
    return true;
  }
}
