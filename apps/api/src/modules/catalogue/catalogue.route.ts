import {
  categoryListResponseSchema,
  errorResponseSchema,
  parseProductIdParam,
  parseProductListQuery,
  productDetailResponseSchema,
  productListResponseSchema,
} from "@ghartak/contracts";
import type { Database } from "@ghartak/database";
import type { FastifyInstance } from "fastify";
import { createCatalogueService } from "./catalogue.service.js";

type CatalogueRouteDependencies = {
  db: Database;
};

export class CatalogueRequestError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "CatalogueRequestError";
    this.statusCode = statusCode;
  }
}

export function registerCatalogueRoutes(
  app: FastifyInstance,
  dependencies: CatalogueRouteDependencies,
): void {
  const catalogue = createCatalogueService(dependencies.db);

  app.get("/categories", async () => {
    return categoryListResponseSchema.parse(await catalogue.listCategories());
  });

  app.get("/products", async (request) => {
    const query = parseRequest(() => parseProductListQuery(request.query));
    return productListResponseSchema.parse(await catalogue.listProducts(query));
  });

  app.get("/products/:productId", async (request, reply) => {
    const productId = parseRequest(() => parseProductIdParam(request.params));
    const product = await catalogue.getProduct(productId);
    if (!product) {
      return reply.status(404).send(
        errorResponseSchema.parse({
          error: {
            code: "not_found",
            message: "Product not found",
          },
        }),
      );
    }
    return productDetailResponseSchema.parse(product);
  });
}

function parseRequest<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (isRequestValidationError(error)) {
      const issue = error.issues[0];
      const path = issue ? issue.path.map((part) => String(part)).join(".") : "request";
      const message = issue ? `${path}: ${issue.message}` : "Invalid request";
      throw new CatalogueRequestError(400, message);
    }
    throw error;
  }
}

function isRequestValidationError(error: unknown): error is {
  issues: Array<{ path: Array<PropertyKey>; message: string }>;
} {
  if (typeof error !== "object" || error === null || !("issues" in error)) {
    return false;
  }
  const named = error as { name?: unknown; issues?: unknown };
  return named.name === "ZodError" && Array.isArray(named.issues);
}
