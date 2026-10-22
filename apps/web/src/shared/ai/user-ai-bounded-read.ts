/**
 * 응답 본문을 상한까지만 읽는다. `content-length`가 상한을 넘거나 스트리밍 중 누적 길이가
 * 상한을 넘으면 즉시 취소한다. 기존 OpenAI 호환 전송과 Claude 어댑터가 함께 쓴다.
 */
export async function readBoundedResponseBytes(
  response: Response,
  maximum: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.body || Number(response.headers.get("content-length") ?? 0) > maximum) {
    await response.body?.cancel();
    throw new Error("AI 응답 용량이 허용 범위를 넘었습니다.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.byteLength;
      if (length > maximum) {
        throw new Error("AI 응답 용량이 허용 범위를 넘었습니다.");
      }
      chunks.push(item.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
