import { BadRequestException } from "@nestjs/common";
import { parseAdminWorkspaceSave, type AdminWorkspaceSave } from "@toonstudio/contracts/admin-workspace";

/** 외부 입력은 공통 계약을 통과한 뒤에만 저장 계층으로 전달한다. */
export function requireAdminWorkspaceSave(value: unknown, now = new Date()): AdminWorkspaceSave {
  const parsed = parseAdminWorkspaceSave(value, now);
  if (!parsed.ok) {
    throw new BadRequestException({
      code: "admin_workspace_invalid",
      message: "작업 보드의 형식·근거·실행 제한을 확인해 주세요.",
      errors: parsed.errors.slice(0, 20),
    });
  }
  return parsed.value;
}
