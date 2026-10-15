import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";

import {
  isPersistenceInternalError,
  userFacingException,
} from "./user-facing-error";

function postgresError(code: string, message: string): Error {
  return Object.assign(new Error(message), {
    code,
    severity: "ERROR",
    routine: "ExecConstraints",
    detail: "Failing row contains (secret-row-value).",
  });
}

describe("isPersistenceInternalError", () => {
  it("Drizzle 쿼리 실패는 SQL 본문과 바인딩 값을 담으므로 내부 오류다", () => {
    const error = new DrizzleQueryError(
      'insert into "creator_work" ("id","userId") values ($1,$2)',
      ["work-1", "user-secret"],
      postgresError("23505", 'duplicate key value violates unique constraint "creator_work_pkey"'),
    );
    expect(isPersistenceInternalError(error)).toBe(true);
  });

  it("래퍼 이름이 달라도 `Failed query:` 메시지나 원인 사슬의 pg 오류를 알아본다", () => {
    expect(isPersistenceInternalError(new Error("Failed query: select 1\nparams: "))).toBe(true);
    expect(
      isPersistenceInternalError(
        new Error("wrapped", { cause: postgresError("22P02", "invalid input syntax for type uuid") }),
      ),
    ).toBe(true);
  });

  it("연결 계층 오류(가용성)도 내부 오류로 본다", () => {
    expect(
      isPersistenceInternalError(
        Object.assign(new Error("connect ECONNREFUSED 10.1.2.3:5432"), { code: "ECONNREFUSED" }),
      ),
    ).toBe(true);
  });

  it("한글 안내 문장을 담은 도메인 오류와 비(非)Error 값은 내부 오류가 아니다", () => {
    expect(isPersistenceInternalError(new Error("제목을 입력해 주세요."))).toBe(false);
    expect(isPersistenceInternalError(Object.assign(new Error("충돌"), { code: "conflict" }))).toBe(false);
    expect(isPersistenceInternalError("문자열")).toBe(false);
    expect(isPersistenceInternalError(undefined)).toBe(false);
  });
});

describe("userFacingException", () => {
  it("도메인 오류는 기존처럼 메시지를 담은 400 으로 바꾼다", () => {
    const exception = userFacingException(new Error("제목을 입력해 주세요."), "저장할 수 없습니다.");
    expect(exception).toBeInstanceOf(BadRequestException);
    expect((exception as BadRequestException).message).toBe("제목을 입력해 주세요.");
  });

  it("Error 가 아닌 값은 기본 문구를 쓴다", () => {
    const exception = userFacingException("boom", "저장할 수 없습니다.");
    expect((exception as BadRequestException).message).toBe("저장할 수 없습니다.");
  });

  it("호출자가 다른 예외 종류를 지정할 수 있다", () => {
    const exception = userFacingException(
      new Error("릴리스를 찾을 수 없습니다."),
      "fallback",
      (message) => new NotFoundException(message),
    );
    expect(exception).toBeInstanceOf(NotFoundException);
  });

  it("DB 오류는 메시지를 노출하지 않고 원래 예외를 그대로 돌려준다", () => {
    const original = new DrizzleQueryError(
      'update "creator_work" set "title" = $1 where "id" = $2',
      ["private title", "work-1"],
      undefined,
    );
    const exception = userFacingException(original, "작품을 수정할 수 없습니다.");
    expect(exception).toBe(original);
    expect(exception).not.toBeInstanceOf(BadRequestException);
  });
});
