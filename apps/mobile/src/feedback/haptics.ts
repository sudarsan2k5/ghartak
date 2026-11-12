import * as Haptics from "expo-haptics";

// Haptics are a nicety. Devices without a motor, or a failed call, must never break a tap.
function run(effect: () => Promise<void>): void {
  effect().catch(() => undefined);
}

/** A light tap for stepping a quantity up or down. */
export function tapQuantity(): void {
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** A firmer tap for putting a product in the cart for the first time. */
export function tapAddToCart(): void {
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** A warning buzz when the cart refuses a change, such as asking for more than is in stock. */
export function warnCartRefused(): void {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

/** A success pattern for a placed order. */
export function confirmSuccess(): void {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** The lightest tick, for moving between tabs and categories. */
export function tapSelection(): void {
  run(() => Haptics.selectionAsync());
}
