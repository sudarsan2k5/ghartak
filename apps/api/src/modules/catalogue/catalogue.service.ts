import {
  summarizeDescription,
  type CatalogueImage,
  type CategoryListResponse,
  type ProductDetailResponse,
  type ProductListQuery,
  type ProductListResponse,
} from "@ghartak/contracts";
import type { Database } from "@ghartak/database";
import {
  createCatalogueRepository,
  type CatalogueImageRow,
  type CatalogueProductRow,
} from "./catalogue.repository.js";

export function createCatalogueService(db: Database) {
  const repository = createCatalogueRepository(db);

  return {
    async listCategories(): Promise<CategoryListResponse> {
      const categories = await repository.listCategories();
      return { categories };
    },

    async listDailyTiles() {
      return { tiles: await repository.listDailyTiles() };
    },

    async listProducts(query: ProductListQuery): Promise<ProductListResponse> {
      const { rows, total } = await repository.listProducts(query);
      const images = await repository.listPrimaryImages(rows.map((row) => row.id));
      const primaryByProduct = new Map(images.map((image) => [image.productId, toImage(image)]));
      return {
        products: rows.map((row) => toSummary(row, primaryByProduct.get(row.id) ?? null)),
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          pageCount: total === 0 ? 0 : Math.ceil(total / query.limit),
        },
      };
    },

    async getProduct(productId: string): Promise<ProductDetailResponse | null> {
      const product = await repository.findProduct(productId);
      if (!product) {
        return null;
      }
      const images = await repository.listImages(productId);
      const gallery = images.map(toImage);
      return {
        ...toSummary(product, gallery.find((image) => image.isPrimary) ?? null),
        description: product.description,
        images: gallery,
      };
    },
  };
}

function toSummary(product: CatalogueProductRow, primaryImage: CatalogueImage | null) {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    descriptionSummary: summarizeDescription(product.description),
    category: {
      id: product.categoryId,
      name: product.categoryName,
      slug: product.categorySlug,
    },
    packageLabel: product.packageLabel,
    pricePaise: product.pricePaise,
    mrpPaise: product.mrpPaise !== null && product.mrpPaise > product.pricePaise ? product.mrpPaise : null,
    stock: toStock(product.stockQuantity, product.availability),
    primaryImage,
  };
}

function toImage(image: CatalogueImageRow): CatalogueImage {
  return {
    id: image.id,
    deliveryPath: image.deliveryPath,
    altText: image.altText,
    position: image.position,
    isPrimary: image.isPrimary,
  };
}

function toStock(quantity: number, availability: CatalogueProductRow["availability"]) {
  if (availability === "unavailable") {
    throw new Error("unavailable inventory is not part of the customer catalogue");
  }
  return {
    quantity,
    availability,
    purchasable: availability === "available" && quantity > 0,
  };
}
