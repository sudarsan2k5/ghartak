import {
  adminCustomerTypeSchema,
  adminOrderListQuerySchema,
  orderPaymentStatusSchema,
  orderStatusSchema,
  paymentMethodSchema,
  type AdminOrderListQuery,
} from "@ghartak/contracts";

export const orderPageSize = 20;
export const orderRefreshMs = 30_000;

export type OrderListFilters = {
  page: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  customerType: string;
  createdFrom: string;
  createdTo: string;
};

export function filtersFromSearchParams(params: URLSearchParams): OrderListFilters {
  const page = Number(params.get("page") ?? "1");
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    orderNumber: params.get("number") ?? "",
    customerName: params.get("name") ?? "",
    customerPhone: params.get("phone") ?? "",
    status: params.get("status") ?? "",
    paymentStatus: params.get("payment") ?? "",
    paymentMethod: params.get("method") ?? "",
    customerType: params.get("type") ?? "",
    createdFrom: params.get("from") ?? "",
    createdTo: params.get("to") ?? "",
  };
}

export function orderListPath(filters: OrderListFilters): string {
  const query = new URLSearchParams();
  query.set("page", String(filters.page));
  query.set("limit", String(orderPageSize));
  const parsed = toListQuery(filters);
  if (parsed.orderNumber) {
    query.set("orderNumber", parsed.orderNumber);
  }
  if (parsed.customerName) {
    query.set("customerName", parsed.customerName);
  }
  if (parsed.customerPhone) {
    query.set("customerPhone", parsed.customerPhone);
  }
  if (parsed.status) {
    query.set("status", parsed.status);
  }
  if (parsed.paymentStatus) {
    query.set("paymentStatus", parsed.paymentStatus);
  }
  if (parsed.paymentMethod) {
    query.set("paymentMethod", parsed.paymentMethod);
  }
  if (parsed.customerType) {
    query.set("customerType", parsed.customerType);
  }
  if (parsed.createdFrom) {
    query.set("createdFrom", parsed.createdFrom);
  }
  if (parsed.createdTo) {
    query.set("createdTo", parsed.createdTo);
  }
  return `/api/v1/admin/orders?${query.toString()}`;
}

export function ordersPageHref(filters: OrderListFilters): string {
  const query = new URLSearchParams();
  if (filters.page > 1) {
    query.set("page", String(filters.page));
  }
  if (filters.orderNumber.trim()) {
    query.set("number", filters.orderNumber.trim());
  }
  if (filters.customerName.trim()) {
    query.set("name", filters.customerName.trim());
  }
  if (filters.customerPhone.trim()) {
    query.set("phone", filters.customerPhone.trim());
  }
  if (filters.status) {
    query.set("status", filters.status);
  }
  if (filters.paymentStatus) {
    query.set("payment", filters.paymentStatus);
  }
  if (filters.paymentMethod) {
    query.set("method", filters.paymentMethod);
  }
  if (filters.customerType) {
    query.set("type", filters.customerType);
  }
  if (filters.createdFrom) {
    query.set("from", filters.createdFrom);
  }
  if (filters.createdTo) {
    query.set("to", filters.createdTo);
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return `/orders${suffix}`;
}

export function toListQuery(filters: OrderListFilters): AdminOrderListQuery {
  return adminOrderListQuerySchema.parse({
    page: filters.page,
    limit: orderPageSize,
    orderNumber: filters.orderNumber.trim() || undefined,
    customerName: filters.customerName.trim() || undefined,
    customerPhone: filters.customerPhone.trim() || undefined,
    status: orderStatusSchema.safeParse(filters.status).success ? filters.status : undefined,
    paymentStatus: orderPaymentStatusSchema.safeParse(filters.paymentStatus).success ? filters.paymentStatus : undefined,
    paymentMethod: paymentMethodSchema.safeParse(filters.paymentMethod).success ? filters.paymentMethod : undefined,
    customerType: adminCustomerTypeSchema.safeParse(filters.customerType).success ? filters.customerType : undefined,
    createdFrom: dateBound(filters.createdFrom, false),
    createdTo: dateBound(filters.createdTo, true),
  });
}

function dateBound(value: string, endOfDay: boolean): string | undefined {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return undefined;
  }
  const date = new Date(`${trimmed}T${endOfDay ? "23:59:59.999" : "00:00:00"}`);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}
