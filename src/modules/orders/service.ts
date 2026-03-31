import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { courses, enrollments, orderItems, orders } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const ORDER_COLUMNS = {
  id: orders.id,
  userId: orders.userId,
  status: orders.status,
  totalAmount: orders.totalAmount,
  paymentReference: orders.paymentReference,
  createdAt: orders.createdAt,
};

type OrderRow = {
  id: string;
  userId: string;
  status: "pending" | "completed" | "refunded" | "failed";
  totalAmount: string;
  paymentReference: string | null;
  createdAt: Date;
};

type CheckoutResult =
  | { kind: "ok"; order: OrderRow }
  | { kind: "not-found" } // course missing or not published
  | { kind: "already-enrolled" };

type PayResult =
  | { kind: "ok"; order: OrderRow }
  | { kind: "not-found" }
  | { kind: "not-payable" };

async function ensureEnrollment(
  tx: Tx,
  userId: string,
  courseId: string,
): Promise<string> {
  const [existing] = await tx
    .select({ id: enrollments.id, status: enrollments.status })
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)),
    );

  if (existing) {
    if (existing.status !== "active" && existing.status !== "completed") {
      await tx
        .update(enrollments)
        .set({ status: "active", completedAt: null })
        .where(eq(enrollments.id, existing.id));
      await tx
        .update(courses)
        .set({ enrolledCount: sql`${courses.enrolledCount} + 1` })
        .where(eq(courses.id, courseId));
    }
    return existing.id;
  }

  const [created] = await tx
    .insert(enrollments)
    .values({ userId, courseId, status: "active" })
    .returning({ id: enrollments.id });
  await tx
    .update(courses)
    .set({ enrolledCount: sql`${courses.enrolledCount} + 1` })
    .where(eq(courses.id, courseId));
  return created!.id;
}

export class OrderService {
  async checkout(userId: string, courseId: string): Promise<CheckoutResult> {
    const [course] = await db
      .select({ status: courses.status, price: courses.price })
      .from(courses)
      .where(eq(courses.id, courseId));
    if (!course || course.status !== "published") return { kind: "not-found" };

    const [enr] = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.userId, userId),
          eq(enrollments.courseId, courseId),
          inArray(enrollments.status, ["active", "completed"]),
        ),
      );
    if (enr) return { kind: "already-enrolled" };

    return db.transaction(async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({ userId, status: "pending", totalAmount: course.price })
        .returning(ORDER_COLUMNS);
      await tx
        .insert(orderItems)
        .values({ orderId: order!.id, courseId, unitPrice: course.price });
      return { kind: "ok", order: order! };
    });
  }

  async pay(userId: string, orderId: string): Promise<PayResult> {
    return db.transaction(async (tx) => {
      const [order] = await tx
        .select({ id: orders.id, status: orders.status })
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.userId, userId)));
      if (!order) return { kind: "not-found" };
      if (order.status === "completed") {
        const [done] = await tx
          .select(ORDER_COLUMNS)
          .from(orders)
          .where(eq(orders.id, orderId));
        return { kind: "ok", order: done! };
      }
      if (order.status !== "pending") return { kind: "not-payable" };

      const items = await tx
        .select({ id: orderItems.id, courseId: orderItems.courseId })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));
      for (const item of items) {
        const enrollmentId = await ensureEnrollment(tx, userId, item.courseId);
        await tx
          .update(orderItems)
          .set({ enrollmentId })
          .where(eq(orderItems.id, item.id));
      }

      const [updated] = await tx
        .update(orders)
        .set({
          status: "completed",
          paymentProvider: "mock",
          paymentReference: `mock_${orderId}`,
        })
        .where(eq(orders.id, orderId))
        .returning(ORDER_COLUMNS);
      return { kind: "ok", order: updated! };
    });
  }

  listForUser(userId: string) {
    return db
      .select(ORDER_COLUMNS)
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt));
  }

  async getForUser(userId: string, orderId: string) {
    const [order] = await db
      .select(ORDER_COLUMNS)
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId)));
    if (!order) return null;

    const items = await db
      .select({
        id: orderItems.id,
        courseId: orderItems.courseId,
        courseTitle: courses.title,
        unitPrice: orderItems.unitPrice,
        enrollmentId: orderItems.enrollmentId,
      })
      .from(orderItems)
      .innerJoin(courses, eq(orderItems.courseId, courses.id))
      .where(eq(orderItems.orderId, orderId));

    return { ...order, items };
  }
}

export const orderService = new OrderService();
