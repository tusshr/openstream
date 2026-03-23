import { asc } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { db } from "@/db";
import { categories } from "@/db/schema";
import { collectionOf, okWithMeta } from "@/lib/response";

const CategorySchema = t.Object({
  id: t.String(),
  name: t.String(),
  slug: t.String(),
  description: t.Union([t.String(), t.Null()]),
});

export const categoriesModule = new Elysia({
  name: "categories",
  prefix: "/categories",
})
  .model({ "categories.list": collectionOf(CategorySchema) })
  .get(
    "/",
    async () => {
      const rows = await db
        .select({
          id: categories.id,
          name: categories.name,
          slug: categories.slug,
          description: categories.description,
        })
        .from(categories)
        .orderBy(asc(categories.name));

      return okWithMeta(rows, {
        hasMore: false,
        nextCursor: null,
        previousCursor: null,
        limit: rows.length,
      });
    },
    {
      response: { 200: "categories.list" },
      detail: {
        summary: "List categories",
        description: "Returns all course categories ordered alphabetically.",
        tags: ["Categories"],
      },
    },
  );
