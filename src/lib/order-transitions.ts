/**
 * Service-order workflow types and valid transitions.
 * Dependency-free so both the server library (orders.ts) and the plain Node
 * test runner can import it. The database guard trigger in
 * 0004_orders_flights_airports.sql mirrors these rules as the second,
 * independent boundary.
 */
export type OrderStatus =
  | "pending_payment"
  | "payment_verified"
  | "accepted"
  | "info_requested"
  | "rejected"
  | "booking_confirmed"
  | "ticketed"
  | "completed"
  | "cancelled"
  | "refunded";

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["payment_verified", "cancelled"],
  payment_verified: ["accepted", "info_requested", "rejected", "refunded", "cancelled"],
  accepted: ["info_requested", "booking_confirmed", "rejected", "refunded"],
  info_requested: ["accepted", "rejected", "cancelled", "refunded"],
  rejected: ["refunded"],
  booking_confirmed: ["ticketed", "refunded"],
  ticketed: ["completed", "refunded"],
  completed: [],
  cancelled: [],
  refunded: [],
};

/** True when the transition from → to is valid. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (ORDER_TRANSITIONS[from] ?? []).includes(to);
}
