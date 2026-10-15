import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { MARKET_KINDS, marketKindMeta } from "../models/market-kind";
import {
  SELLER_LISTING_WIZARD_STEPS,
  sellerListingWizardStepForReason,
  type SellerListingWizardStepId,
} from "../models/market-seller-center";
import { listingValidationMessage } from "../models/market-seller-listing-copy";
import {
  createSellerListing,
  MIN_SELLER_POINT_PRICE,
  validateSellerListingInput,
  type SellerListingInput,
  type SellerListingValidationReason,
} from "../models/market-seller-listings";

import type { CreatorMarketplaceResourceKind } from "@/shared/lib/creator-marketplace-resource-contract";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

const TITLE_ID = "seller-listing-title";
const KIND_ID = "seller-listing-kind";
const PRICE_ID = "seller-listing-price";
const DESCRIPTION_ID = "seller-listing-description";
const STEP_HEADING_ID = "seller-listing-step-heading";
const FEEDBACK_ID = "seller-listing-feedback";

const LAST_STEP_INDEX = SELLER_LISTING_WIZARD_STEPS.length - 1;

// 판매자 대시보드의 다른 입력(일괄 가격 등)과 같은 입력 모양이다.
const inputClass =
  "min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const labelClass = "block text-xs font-bold text-fg-2";

interface Feedback {
  readonly tone: "error" | "success";
  readonly text: string;
}

function stepIndexOf(id: SellerListingWizardStepId): number {
  return SELLER_LISTING_WIZARD_STEPS.findIndex((step) => step.id === id);
}

/** 검증 실패 사유가 가리키는 입력 칸. 판매자 이름은 폼 입력이 아니라 세션에서 와서 칸이 없다. */
function fieldIdForReason(reason: SellerListingValidationReason): string | null {
  switch (reason) {
    case "title-required":
    case "title-too-long":
      return TITLE_ID;
    case "description-too-long":
      return DESCRIPTION_ID;
    case "price-not-integer":
    case "price-too-low":
      return PRICE_ID;
    case "seller-name-required":
    case "seller-name-too-long":
      return null;
  }
}

/**
 * 포인트 리스팅 등록 마법사 (S1-5): 기본 정보 → 설명·가격 → 확인·등록 세 단계.
 *
 * 단계 정의는 모델(SELLER_LISTING_WIZARD_STEPS)이 갖고, 검증은 모델의
 * validateSellerListingInput 하나를 단계마다 다시 부른다 — "다음"은 현재 단계(와 그 앞)에서
 * 비롯된 실패만 막고, 뒤 단계의 실패는 그 단계에 도착했을 때 안내한다.
 * 입력값은 단계를 오가도 유지되고, 등록이 끝나야 비워진다. Enter 키도 "다음"과 같은 동작이다.
 */
export function MarketSellerListingWizard({
  sellerId,
  sellerName,
  onCreated,
}: {
  readonly sellerId: string;
  readonly sellerName: string;
  readonly onCreated: () => void;
}) {
  const bt = useBilingual("MarketSellerListingWizard");
  const [stepId, setStepId] = useState<SellerListingWizardStepId>("details");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<CreatorMarketplaceResourceKind>("brush");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("100");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [invalidFieldId, setInvalidFieldId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ readonly id: string } | null>(null);

  // 단계가 바뀌거나 검증에 실패하면 새로 그려진 요소로 포커스를 옮긴다.
  // DOM 포커스는 렌더가 끝난 뒤에야 옮길 수 있는 외부 상태라 이 effect 로 동기화한다.
  useEffect(() => {
    if (focusRequest) document.getElementById(focusRequest.id)?.focus();
  }, [focusRequest]);

  // 단계 라벨은 리터럴 튜플의 합집합이라 그대로 펼칠 수 없다 — [ko, en] 튜플로 넓혀서 고른다.
  const stepLabel = (label: readonly [string, string]) => bt(...label);
  const stepIndex = stepIndexOf(stepId);
  const isLastStep = stepIndex === LAST_STEP_INDEX;
  const currentStep = SELLER_LISTING_WIZARD_STEPS[stepIndex];
  const draft: SellerListingInput = {
    sellerId,
    sellerName,
    title,
    kind,
    description,
    pointPrice: Number(price),
  };

  const moveTo = (nextId: SellerListingWizardStepId) => {
    setStepId(nextId);
    setFeedback(null);
    setInvalidFieldId(null);
    setFocusRequest({ id: STEP_HEADING_ID });
  };

  const reject = (reason: SellerListingValidationReason) => {
    const fieldId = fieldIdForReason(reason);
    setStepId(sellerListingWizardStepForReason(reason));
    setFeedback({ tone: "error", text: listingValidationMessage(bt, reason) });
    setInvalidFieldId(fieldId);
    setFocusRequest({ id: fieldId ?? STEP_HEADING_ID });
  };

  const goNext = () => {
    const validation = validateSellerListingInput(draft);
    if (!validation.ok && stepIndexOf(sellerListingWizardStepForReason(validation.reason)) <= stepIndex) {
      reject(validation.reason);
      return;
    }
    if (stepIndex < LAST_STEP_INDEX) moveTo(SELLER_LISTING_WIZARD_STEPS[stepIndex + 1].id);
  };

  const goBack = () => {
    if (stepIndex > 0) moveTo(SELLER_LISTING_WIZARD_STEPS[stepIndex - 1].id);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!isLastStep) {
      goNext();
      return;
    }
    const result = createSellerListing(draft);
    if (!result.ok) {
      reject(result.reason);
      return;
    }
    setStepId("details");
    setTitle("");
    setDescription("");
    setPrice("100");
    setInvalidFieldId(null);
    setFeedback({
      tone: "success",
      text: bt(
        "리스팅을 등록했어요. 아래 목록에서 판매 상태를 관리할 수 있어요.",
        "Listing created. Manage its sale status below.",
      ),
    });
    setFocusRequest({ id: STEP_HEADING_ID });
    onCreated();
  };

  /** 검증에 걸린 입력 칸에만 오류 상태와 안내 연결을 붙인다. */
  const fieldState = (id: string) =>
    invalidFieldId === id ? { "aria-invalid": true, "aria-describedby": FEEDBACK_ID } as const : {};

  const stepHint =
    stepId === "details"
      ? bt("리스팅 이름과 종류를 정해요.", "Name your listing and pick its kind.")
      : stepId === "pricing"
        ? bt(
            `가격은 ${MIN_SELLER_POINT_PRICE}P 이상의 정수 포인트로 정해요. 설명은 비워 둬도 돼요.`,
            `Set a whole-point price of ${MIN_SELLER_POINT_PRICE}P or more. The description is optional.`,
          )
        : bt(
            "아래 내용으로 등록해요. 고칠 곳이 있으면 이전으로 돌아가세요.",
            "Check the details below, then create. Go back to change anything.",
          );

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-line bg-card p-5"
      aria-label={bt("새 리스팅 등록", "Create a new listing")}
    >
      <h3 className="text-base font-bold text-fg">{bt("새 리스팅 등록", "New listing")}</h3>
      <p className="mt-1 text-xs leading-5 text-fg-3">
        {bt(
          "가격은 활동 포인트 전용입니다. 현금 결제·출금은 없어요.",
          "Prices are in activity points only. There is no cash payment or withdrawal.",
        )}
      </p>

      <ol
        aria-label={bt("리스팅 등록 단계", "Listing creation steps")}
        className="mt-4 grid grid-cols-3 gap-1.5"
      >
        {SELLER_LISTING_WIZARD_STEPS.map((step, index) => {
          const status = index === stepIndex ? "current" : index < stepIndex ? "done" : "todo";
          return (
            <li
              key={step.id}
              aria-current={status === "current" ? "step" : undefined}
              className={cn(
                "flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-full border px-2 text-xs font-bold",
                status === "current"
                  ? "border-accent bg-accent-soft text-accent"
                  : status === "done"
                    ? "border-line bg-panel text-fg-2"
                    : "border-line bg-card text-fg-3",
              )}
            >
              {status === "done" ? (
                <Check className="size-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <span aria-hidden="true" className="tnum shrink-0">
                  {index + 1}
                </span>
              )}
              <span className="truncate">{stepLabel(step.label)}</span>
              {status === "done" ? <span className="sr-only">{bt("완료", "done")}</span> : null}
            </li>
          );
        })}
      </ol>

      <h4
        id={STEP_HEADING_ID}
        tabIndex={-1}
        className="mt-4 text-sm font-bold text-fg focus-visible:outline-none"
      >
        {stepLabel(currentStep.label)}
      </h4>
      <p className="mt-1 text-xs leading-5 text-fg-3">{stepHint}</p>

      {stepId === "details" ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={TITLE_ID} className={labelClass}>
              {bt("제목", "Title")}
            </label>
            <input
              id={TITLE_ID}
              className={cn(inputClass, "mt-1")}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              required
              {...fieldState(TITLE_ID)}
            />
          </div>
          <div>
            <label htmlFor={KIND_ID} className={labelClass}>
              {bt("종류", "Kind")}
            </label>
            <select
              id={KIND_ID}
              className={cn(inputClass, "mt-1")}
              value={kind}
              onChange={(event) => {
                const next = MARKET_KINDS.find((meta) => meta.kind === event.target.value);
                if (next) setKind(next.kind);
              }}
            >
              {MARKET_KINDS.map((meta) => (
                <option key={meta.kind} value={meta.kind}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {stepId === "pricing" ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={PRICE_ID} className={labelClass}>
              {bt("포인트 가격", "Point price")}
            </label>
            <input
              id={PRICE_ID}
              className={cn(inputClass, "mt-1")}
              type="number"
              min={MIN_SELLER_POINT_PRICE}
              step={1}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              required
              {...fieldState(PRICE_ID)}
            />
          </div>
          <div>
            <label htmlFor={DESCRIPTION_ID} className={labelClass}>
              {bt("설명 (선택)", "Description (optional)")}
            </label>
            <input
              id={DESCRIPTION_ID}
              className={cn(inputClass, "mt-1")}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              {...fieldState(DESCRIPTION_ID)}
            />
          </div>
        </div>
      ) : null}

      {stepId === "review" ? (
        <dl className="mt-4 grid gap-3 rounded-xl border border-line bg-panel p-4 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className={labelClass}>{bt("제목", "Title")}</dt>
            <dd className="mt-1 break-words font-bold text-fg">{title.trim()}</dd>
          </div>
          <div className="min-w-0">
            <dt className={labelClass}>{bt("종류", "Kind")}</dt>
            <dd className="mt-1 text-fg">{marketKindMeta(kind).label}</dd>
          </div>
          <div className="min-w-0">
            <dt className={labelClass}>{bt("포인트 가격", "Point price")}</dt>
            <dd className="numeral tnum mt-1 font-bold text-fg">{Number(price)}P</dd>
          </div>
          <div className="min-w-0">
            <dt className={labelClass}>{bt("설명", "Description")}</dt>
            <dd className="mt-1 break-words text-fg-2">
              {description.trim() || bt("설명 없음", "No description")}
            </dd>
          </div>
        </dl>
      ) : null}

      {feedback ? (
        <p
          id={FEEDBACK_ID}
          role={feedback.tone === "error" ? "alert" : "status"}
          className={cn("mt-3 text-sm", feedback.tone === "error" ? "text-bad" : "text-fg")}
        >
          {feedback.text}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {stepIndex > 0 ? (
          <button
            type="button"
            onClick={goBack}
            className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}
          >
            {bt("이전", "Back")}
          </button>
        ) : null}
        <button
          type="submit"
          className={buttonClass({ variant: "solid", size: "md", className: "min-h-11" })}
        >
          {isLastStep ? bt("리스팅 등록", "Create listing") : bt("다음", "Next")}
        </button>
      </div>
    </form>
  );
}
