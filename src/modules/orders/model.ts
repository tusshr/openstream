import { t } from "elysia";

const OrderStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("completed"),
  t.Literal("refunded"),
  t.Literal("failed"),
]);

export const CheckoutBodySchema = t.Object({
  courseId: t.String({ minLength: 1 }),
});

export const OrderSchema = t.Object({
  id: t.String(),
  userId: t.String(),
  status: OrderStatusSchema,
  totalAmount: t.String(),
  paymentReference: t.Union([t.String(), t.Null()]),
  createdAt: t.Date(),
});

export const OrderItemSchema = t.Object({
  id: t.String(),
  courseId: t.String(),
  courseTitle: t.String(),
  unitPrice: t.String(),
  enrollmentId: t.Union([t.String(), t.Null()]),
});

export const OrderWithItemsSchema = t.Composite([
  OrderSchema,
  t.Object({ items: t.Array(OrderItemSchema) }),
]);
