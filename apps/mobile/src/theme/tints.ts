/** Soft tints from the design file, used to give category tiles a gentle rhythm. */
export const washes = {
  aisleWash: "#F7F3E8",
  receiptWash: "#F1F9DA",
  paymentWash: "#F1EAF5",
  mapGround: "#EEEFE5",
} as const;

const cycle = [washes.aisleWash, washes.receiptWash, washes.paymentWash, washes.mapGround] as const;

/** Cycles the washes so neighbouring tiles never share a colour. */
export function tileTint(index: number): string {
  const safe = Number.isInteger(index) ? index : 0;
  return cycle[((safe % cycle.length) + cycle.length) % cycle.length] ?? washes.aisleWash;
}
