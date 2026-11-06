import type { AdminCategoryCreate, AdminCategoryUpdate } from "@ghartak/contracts";
import { categories, products, withTransaction, type Database } from "@ghartak/database";
import { asc, eq, sql } from "drizzle-orm";
import { HttpError, isUniqueViolation } from "../../../http/errors.js";

export function createAdminCategoryService(db: Database) {
  return {
    async list() {
      const rows = await db
        .select({
          id: categories.id,
          name: categories.name,
          slug: categories.slug,
          description: categories.description,
          isActive: categories.isActive,
          productCount: sql<number>`cast(count(${products.id}) as int)`,
        })
        .from(categories)
        .leftJoin(products, eq(products.categoryId, categories.id))
        .groupBy(categories.id)
        .orderBy(asc(categories.name), asc(categories.id));
      return {
        categories: rows.map((row) => ({ ...row, productCount: Number(row.productCount) })),
      };
    },

    async create(input: AdminCategoryCreate) {
      const slug = input.slug ?? slugify(input.name);
      try {
        const [category] = await db
          .insert(categories)
          .values({
            name: input.name,
            slug,
            description: input.description ?? null,
            isActive: input.isActive ?? true,
          })
          .returning({
            id: categories.id,
            name: categories.name,
            slug: categories.slug,
            description: categories.description,
            isActive: categories.isActive,
          });
        if (!category) {
          throw new HttpError(500, "Category could not be created");
        }
        return { ...category, productCount: 0 };
      } catch (error) {
        throw mapCategoryConflict(error);
      }
    },

    async update(categoryId: string, input: AdminCategoryUpdate) {
      const [existing] = await db.select().from(categories).where(eq(categories.id, categoryId)).limit(1);
      if (!existing) {
        throw new HttpError(404, "Category not found");
      }
      try {
        await db
          .update(categories)
          .set({
            name: input.name ?? existing.name,
            slug: input.slug ?? existing.slug,
            description: input.description === undefined ? existing.description : input.description,
            isActive: input.isActive ?? existing.isActive,
          })
          .where(eq(categories.id, categoryId));
      } catch (error) {
        throw mapCategoryConflict(error);
      }
      const [updated] = (await this.list()).categories.filter((category) => category.id === categoryId);
      if (!updated) {
        throw new HttpError(404, "Category not found");
      }
      return updated;
    },

    async remove(categoryId: string) {
      const [existing] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId)).limit(1);
      if (!existing) {
        throw new HttpError(404, "Category not found");
      }
      const [counted] = await db
        .select({ total: sql<number>`cast(count(*) as int)` })
        .from(products)
        .where(eq(products.categoryId, categoryId));
      if (Number(counted?.total ?? 0) > 0) {
        throw new HttpError(409, "Reassign or remove this category's products before deleting it");
      }
      await withTransaction(db, async (tx) => {
        await tx.delete(categories).where(eq(categories.id, categoryId));
      });
    },
  };
}

export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new HttpError(400, "name: Category name cannot be turned into a slug");
  }
  return slug;
}

function mapCategoryConflict(error: unknown): unknown {
  const unique = isUniqueViolation(error);
  if (unique?.constraint === "categories_slug_unique") {
    return new HttpError(409, "A category with that slug already exists");
  }
  return error;
}
