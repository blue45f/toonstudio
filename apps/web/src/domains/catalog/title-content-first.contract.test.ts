import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const file = readFileSync(new URL("./TitleDetailPage.tsx", import.meta.url), "utf8");
const source = ts.createSourceFile("TitleDetailPage.tsx", file, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const elements: ts.JsxElement[] = [];
function visit(node: ts.Node) { if (ts.isJsxElement(node)) elements.push(node); ts.forEachChild(node, visit); }
visit(source);
function byAttribute(name: string, value: string): ts.JsxElement {
  const found = elements.find((el) => el.openingElement.attributes.properties.some((attr) =>
    ts.isJsxAttribute(attr) && attr.name.getText(source) === name && attr.initializer &&
    ts.isStringLiteral(attr.initializer) && attr.initializer.text === value));
  if (!found) throw new Error(`Missing ${name}=${value}`);
  return found;
}

describe("작품 상세 콘텐츠 우선 JSX 계약 (화면 렌더 검증 아님)", () => {
  it("회차와 보조 접기는 같은 상위 컨테이너의 형제이며 회차가 먼저다", () => {
    const episodes = byAttribute("id", "title-episodes-anchor");
    const secondary = byAttribute("data-testid", "title-detail-secondary-tools");
    expect(secondary.parent).toBe(episodes.parent);
    expect(episodes.pos).toBeLessThan(secondary.pos);
    expect(secondary.openingElement.tagName.getText(source)).toBe("details");
    expect(secondary.openingElement.attributes.properties.some((attr) => ts.isJsxAttribute(attr) && attr.name.getText(source) === "open")).toBe(false);
  });
  it("성향 경고·얼리액세스 안내와 리뷰 오류는 접기 바깥에 둔다", () => {
    const secondary = byAttribute("data-testid", "title-detail-secondary-tools");
    const text = secondary.getText(source);
    expect(text).not.toContain("<PersonalContentPreferenceNotice");
    expect(text).not.toContain("<TitleEarlyAccessNotice");
    expect(text).not.toContain("reviewsUnavailableTitle");
    expect(file).toContain("<PersonalContentPreferenceNotice title={title} />");
    expect(file).toContain("<TitleEarlyAccessNotice titleId={title.id} />");
  });
  it("기존 개인 기록·구독·공유 및 모든 상세 anchor를 보존한다", () => {
    for (const component of ["ReadStateSelector", "CollectionAdd", "SubscribeButton", "NewsletterSubscribeButton", "ShareButton", "AvailabilityHistoryPanel"]) {
      expect(file).toContain(`<${component}`);
    }
    for (const id of ["title-episodes-anchor", "title-availability", "metrics", "title-character-talk", "title-reviews"]) {
      expect(file).toContain(`id="${id}"`);
    }
  });
});


it("리뷰 목적 구간과 오류·빈 상태를 관련 지표보다 먼저 독립 제공한다", () => {
  const related = byAttribute("data-testid", "title-detail-related-tools");
  expect(related.openingElement.tagName.getText(source)).toBe("details");
  expect(related.openingElement.attributes.properties.some((attr) => ts.isJsxAttribute(attr) && attr.name.getText(source) === "open")).toBe(false);
  expect(related.getText(source)).toContain('id="metrics"');
  expect(related.getText(source)).toContain('id="title-character-talk"');
  expect(related.getText(source)).not.toContain('id="title-reviews"');
  expect(related.getText(source)).not.toContain("reviewsUnavailableTitle");
  const reviews = byAttribute("id", "title-reviews");
  expect(reviews.parent).toBe(byAttribute("data-testid", "title-detail-secondary-tools").parent);
  expect(reviews.pos).toBeLessThan(related.pos);
  expect(reviews.openingElement.tagName.getText(source)).toBe("details");
  expect(reviews.openingElement.attributes.properties.some((attr) => ts.isJsxAttribute(attr) && attr.name.getText(source) === "open")).toBe(false);
  const reviewText = reviews.getText(source);
  expect(reviewText).toContain('bi("독자 리뷰", "Reader reviews")');
  expect(reviewText).toContain("!reviewsAvailable ?");
  expect(reviewText).toContain("reviewsUnavailableTitle");
  expect(reviewText).toContain("reviewsUnavailableDescription");
  expect(reviewText).toContain("리뷰 목록이 비어 있다는 뜻은 아닙니다.");
  expect(reviewText).toContain("reviews.length === 0");
  expect(reviewText).toContain("<ReviewForm");
});
