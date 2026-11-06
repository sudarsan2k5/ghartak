const rupeePattern = /^(\d+)(?:\.(\d{1,2}))?$/;

export function rupeesToPaise(input: string): { ok: true; paise: number } | { ok: false; message: string } {
  const trimmed = input.trim();
  const match = rupeePattern.exec(trimmed);
  if (!match) {
    return { ok: false, message: "Enter a price in rupees with up to 2 decimal places." };
  }
  const rupees = match[1] ?? "0";
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const paise = BigInt(rupees) * 100n + BigInt(fraction);
  if (paise > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { ok: false, message: "That price is too large." };
  }
  return { ok: true, paise: Number(paise) };
}

export function paiseToRupeeInput(paise: number): string {
  const whole = Math.trunc(paise / 100);
  const fraction = Math.abs(paise % 100);
  if (fraction === 0) {
    return String(whole);
  }
  return `${whole}.${String(fraction).padStart(2, "0")}`;
}
