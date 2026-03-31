import { Elysia, status, t } from "elysia";

import { errorModels } from "@/lib/api/error-models";
import { dataOf, HttpProblem, ok } from "@/lib/response";
import { authMacro } from "@/modules/auth";

import { CheckoutBodySchema, OrderSchema, OrderWithItemsSchema } from "./model";
import { orderService } from "./service";

const idParam = t.Object({ id: t.String({ minLength: 1 }) });
const mutateSecurity = [{ sessionCookie: [], csrfHeader: [] }];

export const ordersModule = new Elysia({ name: "orders", prefix: "/orders" })
  .use(authMacro)
  .use(errorModels)
  .post(
    "/",
    async ({ body, user }) => {
      const result = await orderService.checkout(user.id, body.courseId);
      switch (result.kind) {
        case "not-found":
          throw new HttpProblem(
            404,
            "NOT_FOUND",
            "Course not found or not published.",
          );
        case "already-enrolled":
          throw new HttpProblem(
            409,
            "ALREADY_ENROLLED",
            "You are already enrolled in this course.",
          );
        case "ok":
          return status(201, { data: result.order });
      }
    },
    {
      auth: { can: ["create", "Order"] },
      body: CheckoutBodySchema,
      response: {
        401: "ProblemDetails",
        422: "ProblemDetails",
        201: dataOf(OrderSchema),
        404: "ProblemDetails",
        409: "ProblemDetails",
      },
      detail: {
        summary: "Checkout a course",
        description: "Creates a pending order. Pay it to enrol.",
        tags: ["Orders"],
        security: mutateSecurity,
      },
    },
  )
  .post(
    "/:id/pay",
    async ({ params, user }) => {
      const result = await orderService.pay(user.id, params.id);
      switch (result.kind) {
        case "not-found":
          throw new HttpProblem(404, "NOT_FOUND", "Order not found.");
        case "not-payable":
          throw new HttpProblem(
            409,
            "ORDER_NOT_PAYABLE",
            "This order is not awaiting payment.",
          );
        case "ok":
          return ok(result.order);
      }
    },
    {
      auth: { can: ["create", "Order"] },
      params: idParam,
      response: {
        401: "ProblemDetails",
        200: dataOf(OrderSchema),
        404: "ProblemDetails",
        409: "ProblemDetails",
      },
      detail: {
        summary: "Pay an order (mock)",
        description:
          "Stand-in for a payment-provider webhook: marks the order completed and enrols the buyer in its courses.",
        tags: ["Orders"],
        security: mutateSecurity,
      },
    },
  )
  .get("/", async ({ user }) => ok(await orderService.listForUser(user.id)), {
    auth: { can: ["read", "Order"] },
    response: { 401: "ProblemDetails", 200: dataOf(t.Array(OrderSchema)) },
    detail: {
      summary: "List my orders",
      tags: ["Orders"],
      security: [{ sessionCookie: [] }],
    },
  })
  .get(
    "/:id",
    async ({ params, user }) => {
      const order = await orderService.getForUser(user.id, params.id);
      if (!order) throw new HttpProblem(404, "NOT_FOUND", "Order not found.");
      return ok(order);
    },
    {
      auth: { can: ["read", "Order"] },
      params: idParam,
      response: {
        401: "ProblemDetails",
        200: dataOf(OrderWithItemsSchema),
        404: "ProblemDetails",
      },
      detail: {
        summary: "Get an order",
        tags: ["Orders"],
        security: [{ sessionCookie: [] }],
      },
    },
  );
