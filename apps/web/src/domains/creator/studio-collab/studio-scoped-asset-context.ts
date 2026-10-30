import { StudioScopedWriteContextSchema, type StudioScopedWriteContext } from "@toonstudio/contracts/studio-scoped-write";

/** 업로드는 생성 선언을 소비하지 않는 별도 목적이다. 원고 생성은 ACK 받은 실제 ID로 별도 전송한다. */
export function appendStudioScopedAssetContext(form: FormData, input?: StudioScopedWriteContext): void {
  if (input === undefined) return;
  const context = StudioScopedWriteContextSchema.parse(input);
  if (context.creations.length || context.restorations.length) throw new Error("현재 담당 배정을 확인한 업로드 목적만 사용할 수 있습니다.");
  form.set("writeContext", JSON.stringify(context));
}
