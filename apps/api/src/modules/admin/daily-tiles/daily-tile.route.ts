import { adminDailyTileListResponseSchema, adminDailyTileSchema, adminDailyTileUpdateSchema, type AdminDailyTileUpdate } from "@ghartak/contracts";
import { categories, homeDailyTiles, withTransaction, type Database } from "@ghartak/database";
import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../../../http/errors.js";
import { routeParam } from "../../../http/params.js";
import { parseRequest } from "../../../http/validation.js";
import { requireAdmin } from "../auth/guard.js";
import { discardDisplayImage, readDisplayImage, storeDisplayImage } from "../images/display-image.js";
import type { ImageStorage } from "../images/image-storage.js";

const positionSchema = z.coerce.number().int().min(1).max(4);

export function registerAdminDailyTileRoutes(app: FastifyInstance, db: Database, storage: ImageStorage | null): void {
  const guard = { preHandler: requireAdmin(db) };

  async function list() {
    const tiles = await db
      .select({
        position: homeDailyTiles.position,
        label: homeDailyTiles.label,
        imageDeliveryPath: homeDailyTiles.imageDeliveryPath,
        categoryId: homeDailyTiles.categoryId,
        categoryName: categories.name,
      })
      .from(homeDailyTiles)
      .leftJoin(categories, eq(homeDailyTiles.categoryId, categories.id))
      .orderBy(asc(homeDailyTiles.position));
    return { tiles };
  }

  async function one(position: number) {
    const tile = (await list()).tiles.find((row) => row.position === position);
    if (!tile) {
      throw new HttpError(404, "Tile not found");
    }
    return adminDailyTileSchema.parse(tile);
  }

  async function update(position: number, input: AdminDailyTileUpdate) {
    if (input.categoryId) {
      const [category] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, input.categoryId));
      if (!category) {
        throw new HttpError(400, "categoryId: Category not found");
      }
    }
    await db
      .update(homeDailyTiles)
      .set({
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(homeDailyTiles.position, position));
  }

  async function setImage(position: number, image: { objectKey: string; deliveryPath: string } | null) {
    return withTransaction(db, async (tx) => {
      const [existing] = await tx
        .select({ imageObjectKey: homeDailyTiles.imageObjectKey })
        .from(homeDailyTiles)
        .where(eq(homeDailyTiles.position, position))
        .for("update");
      if (!existing) {
        throw new HttpError(404, "Tile not found");
      }
      await tx
        .update(homeDailyTiles)
        .set({ imageObjectKey: image?.objectKey ?? null, imageDeliveryPath: image?.deliveryPath ?? null, updatedAt: new Date() })
        .where(eq(homeDailyTiles.position, position));
      return existing.imageObjectKey;
    });
  }

  app.get("/admin/daily-tiles", guard, async () => {
    return adminDailyTileListResponseSchema.parse(await list());
  });

  app.patch("/admin/daily-tiles/:position", guard, async (request) => {
    const position = parseRequest(() => positionSchema.parse(routeParam(request.params, "position")));
    const body = parseRequest(() => adminDailyTileUpdateSchema.parse(request.body));
    await update(position, body);
    request.log.info({ actorUserId: request.admin?.userId, position }, "admin updated daily tile");
    return one(position);
  });

  app.post("/admin/daily-tiles/:position/image", guard, async (request) => {
    const position = parseRequest(() => positionSchema.parse(routeParam(request.params, "position")));
    const upload = await readDisplayImage(request);
    const image = await storeDisplayImage(storage, `daily-tiles/${position}`, upload);
    let previousKey: string | null;
    try {
      previousKey = await setImage(position, image);
    } catch (error) {
      await discardDisplayImage(storage, image.objectKey, request.log);
      throw error;
    }
    if (previousKey) {
      await discardDisplayImage(storage, previousKey, request.log);
    }
    request.log.info({ actorUserId: request.admin?.userId, position }, "admin updated daily tile image");
    return one(position);
  });

  app.delete("/admin/daily-tiles/:position/image", guard, async (request) => {
    const position = parseRequest(() => positionSchema.parse(routeParam(request.params, "position")));
    const previousKey = await setImage(position, null);
    if (previousKey) {
      await discardDisplayImage(storage, previousKey, request.log);
    }
    request.log.info({ actorUserId: request.admin?.userId, position }, "admin removed daily tile image");
    return one(position);
  });
}
