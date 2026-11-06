const tones: Record<string, string> = {
  published: "bg-[#F1F9DA] text-savings",
  draft: "bg-wash text-secondary",
  archived: "bg-page text-muted",
  available: "bg-[#F1F9DA] text-savings",
  out_of_stock: "bg-wash text-ink",
  unavailable: "bg-page text-muted",
  active: "bg-[#F1F9DA] text-savings",
  inactive: "bg-page text-muted",
  placed: "bg-lime text-ink",
  confirmed: "bg-[#F1F9DA] text-savings",
  packed: "bg-wash text-ink",
  out_for_delivery: "bg-wash text-ink",
  delivered: "bg-[#F1F9DA] text-savings",
  cancelled: "bg-page text-muted",
  pending: "bg-wash text-ink",
  paid: "bg-[#F1F9DA] text-savings",
  failed: "bg-page text-secondary",
  refunded: "bg-page text-muted",
  guest: "bg-wash text-ink",
  registered: "bg-[#F1F9DA] text-savings",
  cash_on_delivery: "bg-wash text-ink",
};

export function StatusBadge({ value, label }: { value: string; label?: string }) {
  const tone = tones[value] ?? "bg-page text-secondary";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${tone}`}>
      {label ?? value.replaceAll("_", " ")}
    </span>
  );
}
