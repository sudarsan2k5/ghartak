type FormatRupeesOptions = {
  fractionDigits?: "auto" | 2;
};

export function formatRupees(paise: number, options: FormatRupeesOptions = {}): string {
  const rupees = paise / 100;
  const fractionDigits = options.fractionDigits === 2 || !Number.isInteger(rupees) ? 2 : 0;
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(rupees);
  return `₹${formatted}`;
}
