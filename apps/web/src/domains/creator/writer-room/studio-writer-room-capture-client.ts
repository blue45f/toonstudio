import { StudioWriterRoomCaptureRequestSchema, StudioWriterRoomCaptureResponseSchema,
  type StudioWriterRoomCaptureRequest, type StudioWriterRoomCaptureResponse } from "@toonstudio/contracts/studio-writer-room";
import { canonicalJson } from "@toonstudio/studio-project-model";
import { api } from "@/platform/api";

/** 선택한 제출과 고정 원고 tuple을 함께 보낸다. 최신 head나 현재 Writer Room을 읽지 않는다. */
export async function getStudioWriterRoomCapture(raw: StudioWriterRoomCaptureRequest, signal?: AbortSignal): Promise<StudioWriterRoomCaptureResponse> {
  const input = StudioWriterRoomCaptureRequestSchema.parse(raw), { workId, reviewId, schemaVersion: _version, ...pin } = input.subject;
  const query = new URLSearchParams({ ...pin, productionProjectId: input.productionProjectId, submissionId: input.submissionId });
  const result = StudioWriterRoomCaptureResponseSchema.parse(await api.get<unknown>(
    `/creator/works/${encodeURIComponent(workId)}/writer-room-captures/${encodeURIComponent(reviewId)}?${query}`, { signal }));
  if (result.productionProjectId !== input.productionProjectId || result.submissionId !== input.submissionId
    || canonicalJson(result.subject) !== canonicalJson(input.subject)) throw new Error("선택한 제출본과 고정 대본 응답이 다릅니다.");
  return result;
}
