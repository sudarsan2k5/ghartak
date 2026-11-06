export type GuestCheckoutCustomer = {
  name: string;
  phone: string;
  address: string;
};

export const guestCheckoutCopy = {
  title: "Checkout",
  eyebrow: "Guest checkout",
  body: "Place a Cash on Delivery order without creating an account.",
  notReady: "Your cart still needs a change before checkout.",
  payOnDelivery: "You will pay in cash when the order is delivered. This is not an online payment.",
  deliveryPending: "Delivery fee is confirmed by Ghartak when you place the order.",
  placing: "Placing order",
} as const;
