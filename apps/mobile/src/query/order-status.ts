export const orderStatusKeys = {
  detail: (orderNumber: string) => ["order-status", orderNumber] as const,
};
