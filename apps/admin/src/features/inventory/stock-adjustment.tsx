"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Field, controlClassName, describedBy } from "@/components/ui/field";
import { useAuthRedirect } from "@/features/auth/use-auth-redirect";
import { useSession } from "@/features/auth/session-provider";
import { formatCount } from "@/lib/utils/format";
import { buildStockChange, emptyStockDraft, planStockFailure, type StockDraft, type StockMovementType } from "@/lib/inventory/stock";
import { changeStock } from "@/lib/inventory/requests";
import { fetchProduct } from "@/lib/products/requests";

export type StockTarget = {
  id: string;
  name: string;
  stockQuantity: number;
  packageLabel: string;
};

export function StockAdjustment({
  product,
  onClose,
  onApplied,
  onRefresh,
}: {
  product: StockTarget;
  onClose: () => void;
  onApplied: (inventory: { stockQuantity: number; availability: "available" | "unavailable" | "out_of_stock" }) => void;
  onRefresh?: (stockQuantity: number) => void;
}) {
  const { client } = useSession();
  const redirect = useAuthRedirect();
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [current, setCurrent] = useState(product.stockQuantity);
  const [draft, setDraft] = useState<StockDraft>(emptyStockDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<"edit" | "confirm">("edit");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [applied, setApplied] = useState<number | null>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, pending]);

  const projection = buildStockChange(current, draft);
  const decreases = projection.ok && projection.projection.delta < 0;

  function review() {
    const next = buildStockChange(current, draft);
    if (!next.ok) {
      setErrors(next.errors);
      setStage("edit");
      return;
    }
    setErrors({});
    setNotice(null);
    setStage("confirm");
  }

  async function submit() {
    if (!client || pending || applied !== null) {
      return;
    }
    const next = buildStockChange(current, draft);
    if (!next.ok) {
      setErrors(next.errors);
      setStage("edit");
      return;
    }
    setPending(true);
    setNotice(null);
    const result = await changeStock(client, product.id, next.projection.payload);
    if (!result.ok) {
      const plan = planStockFailure(result.kind);
      if (await redirect(result)) {
        setPending(false);
        return;
      }
      if (plan.refreshProduct) {
        const fresh = await fetchProduct(client, product.id);
        if (fresh.ok) {
          setCurrent(fresh.data.inventory.stockQuantity);
          onRefresh?.(fresh.data.inventory.stockQuantity);
        }
        setNotice(`${result.message} Current stock was refreshed. Review the quantity before trying again.`);
      } else if (result.kind === "network") {
        setNotice("The admin service could not be reached. The stock request was not sent again.");
      } else {
        setNotice(result.message);
      }
      setStage("edit");
      setPending(false);
      return;
    }
    const stockAfter = result.data.inventory.stockQuantity;
    setCurrent(stockAfter);
    setApplied(stockAfter);
    setPending(false);
    onApplied({ stockQuantity: stockAfter, availability: result.data.inventory.availability });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/30 px-4 py-4 sm:place-items-center" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-white p-6 shadow-card">
        <h2 id={titleId} className="font-display text-xl font-extrabold">
          Adjust stock
        </h2>
        <p className="mt-2 text-sm text-secondary">
          {product.name} · {product.packageLabel}
        </p>
        <p className="mt-4 rounded-xl bg-page px-4 py-3 text-sm">
          Current stock <span className="font-medium">{formatCount(current)}</span>
        </p>
        {notice ? (
          <p className="mt-4 rounded-xl border border-line bg-wash px-4 py-3 text-sm" role="alert">
            {notice}
          </p>
        ) : null}
        {applied !== null ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm leading-6">Recorded stock is {formatCount(applied)}.</p>
            <button type="button" className="h-11 rounded-xl bg-ink px-4 text-sm font-medium text-white" onClick={onClose}>
              Close
            </button>
          </div>
        ) : stage === "confirm" && projection.ok ? (
          <div className="mt-4 space-y-4">
            <p className={`rounded-xl px-4 py-3 text-sm leading-6 ${decreases ? "bg-wash" : "bg-page"}`}>
              {movementLabel(draft.type)} of {formatCount(Math.abs(projection.projection.delta))} changes stock from {formatCount(current)} to {formatCount(projection.projection.next)}. Reason: {draft.reason.trim()}.
            </p>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button ref={cancelRef} type="button" className="h-11 rounded-xl border border-line px-4 text-sm font-medium" disabled={pending} onClick={() => setStage("edit")}>
                Back
              </button>
              <button type="button" className="h-11 rounded-xl bg-ink px-4 text-sm font-medium text-white disabled:opacity-60" disabled={pending} onClick={() => void submit()}>
                {pending ? "Recording" : decreases ? "Record decrease" : "Record stock"}
              </button>
            </div>
          </div>
        ) : (
          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              review();
            }}
          >
            <fieldset>
              <legend className="text-sm font-medium">Movement</legend>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["addition", "removal", "adjustment"] as const).map((type) => (
                  <label key={type} className={`rounded-xl border px-3 py-2 text-center text-sm capitalize ${draft.type === type ? "border-ink bg-page" : "border-line"}`}>
                    <input
                      type="radio"
                      name="movement"
                      className="sr-only"
                      checked={draft.type === type}
                      onChange={() => {
                        setDraft({ ...draft, type, amount: "" });
                        setErrors({});
                      }}
                    />
                    {type}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field id="stock-amount" label={draft.type === "adjustment" ? "Quantity delta" : "Quantity"} error={errors["amount"]} hint={amountHint(draft.type)}>
              <input
                id="stock-amount"
                inputMode={draft.type === "adjustment" ? "text" : "numeric"}
                value={draft.amount}
                aria-invalid={Boolean(errors["amount"])}
                aria-describedby={describedBy("stock-amount", errors["amount"], amountHint(draft.type))}
                className={controlClassName}
                onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
              />
            </Field>
            <Field id="stock-reason" label="Reason" error={errors["reason"]} hint="Required. Stored with the ledger row.">
              <input
                id="stock-reason"
                value={draft.reason}
                maxLength={200}
                aria-invalid={Boolean(errors["reason"])}
                aria-describedby={describedBy("stock-reason", errors["reason"], "Required. Stored with the ledger row.")}
                className={controlClassName}
                onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
              />
            </Field>
            {projection.ok ? (
              <p className={`rounded-xl px-4 py-3 text-sm ${projection.projection.delta < 0 ? "bg-wash" : "bg-page"}`}>
                Expected stock {formatCount(projection.projection.next)}
              </p>
            ) : null}
            {errors["form"] ? <p className="text-sm text-secondary">{errors["form"]}</p> : null}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button ref={cancelRef} type="button" className="h-11 rounded-xl border border-line px-4 text-sm font-medium" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="h-11 rounded-xl bg-lime px-4 font-display text-sm font-semibold text-ink">
                Review
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function amountHint(type: StockMovementType): string {
  if (type === "adjustment") {
    return "A positive number adds stock. A negative number removes it.";
  }
  if (type === "removal") {
    return "Whole units to remove. The result cannot go below zero.";
  }
  return "Whole units received.";
}

function movementLabel(type: StockMovementType): string {
  if (type === "addition") {
    return "Addition";
  }
  if (type === "removal") {
    return "Removal";
  }
  return "Adjustment";
}
