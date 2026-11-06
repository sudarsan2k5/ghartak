import { AppText } from "@/theme/AppText";
import { formatRupees } from "@/theme/money";

type PriceTextProps = {
  paise: number;
  struck?: boolean;
  tone?: "ink" | "white";
  size?: "card" | "total";
  fractionDigits?: "auto" | 2;
};

export function PriceText({
  paise,
  struck = false,
  tone = "ink",
  size = "card",
  fractionDigits = "auto",
}: PriceTextProps) {
  const sizeClass = size === "total" ? "text-[16px]" : "text-[14px]";
  const colorClass = struck ? "text-muted" : tone === "white" ? "text-white" : "text-ink";
  return (
    <AppText
      family="inter"
      weight={struck ? "regular" : "extrabold"}
      className={`${sizeClass} ${colorClass} ${struck ? "line-through" : ""}`}
    >
      {formatRupees(paise, { fractionDigits })}
    </AppText>
  );
}
