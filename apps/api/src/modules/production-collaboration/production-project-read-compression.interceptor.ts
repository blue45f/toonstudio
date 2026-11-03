import { Injectable, Logger, StreamableFile } from "@nestjs/common";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { mergeMap } from "rxjs";

import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";

const gzipAsync = promisify(gzip);
const MINIMUM_JSON_BYTES = 1_024;

/** 전체 제작 프로젝트의 두 GET에만 붙이는 선택적 전송 압축. DTO와 캐시 정책은 바꾸지 않는다. */
@Injectable()
export class ProductionProjectReadCompressionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ProductionProjectReadCompressionInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler) {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    return next.handle().pipe(mergeMap(async (body: unknown) => {
      const contentType = response.getHeader("Content-Type");
      if (
        request.method !== "GET" || response.statusCode !== 200 || response.headersSent
        || response.getHeader("Content-Encoding") !== undefined
        || (contentType !== undefined && (typeof contentType !== "string"
          || !/^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)(?:\s*;|$)/iu.test(contentType)))
        || body === null || typeof body !== "object"
        || body instanceof StreamableFile || Buffer.isBuffer(body) || ArrayBuffer.isView(body)
      ) return body;

      const json = JSON.stringify(body);
      if (json === undefined) return body;
      const bytes = Buffer.from(json, "utf8");
      if (bytes.length < MINIMUM_JSON_BYTES) return body;
      response.vary("Accept-Encoding");
      // 없는 헤더와 gzip 비선택은 기존 identity 응답으로 둔다. q 값은 Express가 협상한다.
      if (request.headers["accept-encoding"] === undefined
        || request.acceptsEncodings("gzip", "identity") !== "gzip") return body;

      let compressed: Buffer;
      try {
        compressed = await gzipAsync(bytes);
      } catch {
        // 압축 실패는 데이터 실패가 아니다. 원본문을 유지하고 고정 경고만 남긴다.
        // next.handle/service를 다시 호출하거나 요청을 재전송하지 않는다.
        this.logger.warn("제작 프로젝트 응답 압축에 실패해 원래 JSON 응답을 유지합니다.");
        return body;
      }
      if (response.headersSent || response.destroyed || response.statusCode !== 200
        || response.getHeader("Content-Encoding") !== undefined) return body;
      response.setHeader("Content-Encoding", "gzip");
      response.setHeader("Content-Length", String(compressed.length));
      return new StreamableFile(compressed, {
        type: typeof contentType === "string" ? contentType : "application/json; charset=utf-8",
        length: compressed.length,
      });
    }));
  }
}
