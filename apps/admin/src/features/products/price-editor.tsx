"use client";

import { useState, type FormEvent } from "react";
import { controlClassName, describedBy, Field } from "@/components/ui/field";
import { useAuthRedirect } from "@/features/auth/use-auth-redirect";
import { useSession } from "@/features/auth/session-provider";
import { paiseToRupeeInput, rupeesToPaise } from "@/lib/products/money";
import { updateProductPrice } from "@/lib/products/requests";
import { formatPaise } from "@/lib/utils/format";

export function PriceEditor({
  productId,
  pricePaise,
  onSaved,
}: {
  productId: string;
  pricePaise: number;
  onSaved: (pricePaise: number) => void;
}) {
  const { client } = useSession();
  const redirect = useAuthRedirect();
  const [rupees, setRupees] = useState(paiseToRupeeInput(pricePaise));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || pending) {
      return;
    }
    const price = rupeesToPaise(rupees);
    if (!price.ok) {
      setError(price.message);
      setSaved(false);
      return;
    }
    setPending(true);
    setError(null);
    setSaved(false);
    const result = await updateProductPrice(client, productId, price.paise);
    setPending(false);
    if (!result.ok) {
      if (await redirect(result)) {
        return;
      }
      setError(result.message);
      return;
    }
    setRupees(paiseToRupeeInput(result.data.inventory.pricePaise));
    onSaved(result.data.inventory.pricePaise);
    setSaved(true);
  }

  return (
    <form className="rounded-2xl border border-line bg-white p-5 shadow-card" onSubmit={(event) => void onSubmit(event)}>
      <h2 className="font-display text-lg font-extrabold">Central price</h2>
      <p className="mt-1 text-sm text-muted">Current price {formatPaise(pricePaise)}. This does not change stock.</p>
      <div className="mt-4 max-w-xs">
        <Field id="price-rupees" label="Price in rupees" error={error ?? undefined} hint="Up to 2 decimal places.">
          <input
            id="price-rupees"
            inputMode="decimal"
            value={rupees}
            aria-invalid={error !== null}
            aria-describedby={describedBy("price-rupees", error ?? undefined, "Up to 2 decimal places.")}
            className={controlClassName}
            onChange={(event) => {
              setRupees(event.target.value);
              setSaved(false);
            }}
          />
        </Field>
      </div>
      <button type="submit" disabled={pending || client === null} className="mt-4 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
        {pending ? "Saving price" : "Save price"}
      </button>
      {saved ? <p className="mt-3 text-sm text-savings">Price saved.</p> : null}
    </form>
  );
}
