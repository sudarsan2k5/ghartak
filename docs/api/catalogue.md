# Customer catalogue API

Read-only catalogue for the customer app. All routes are under `/api/v1`. There is no authentication in this phase.

Prices are integer paise. A price of `12000` is ₹120.00. `minPrice` and `maxPrice` use the same unit.

## Visibility

A product is public only when all of these are true:

- `publication_status` is `published`
- `is_active` is true
- its category is active
- it has the single central `store_products` row
- that listing is not `unavailable`

`draft`, `archived`, inactive products, products in inactive categories, and `unavailable` listings are not returned. The detail route uses the same rule and responds with `404` `not_found`, including for an unknown id.

A product with availability `out_of_stock` stays visible. Its `stock.purchasable` value is false. `purchasable` is true only when availability is `available` and quantity is greater than zero. The database already rejects `available` with zero stock.

`inStock=true` returns only purchasable products. `inStock=false` and an omitted `inStock` do not apply that filter.

## GET /api/v1/categories

Returns active categories in the admin-set display order, then by name and id. Each category includes `imageDeliveryPath`, which is `null` when no front image has been uploaded.

## GET /api/v1/home/daily-tiles

Returns the four "Your daily everything" boxes ordered by `position`, each with `label`, `imageDeliveryPath`, and `categoryId`. `categoryId` is `null` when the box has no linked category or its category is inactive; the app then opens the full category list.

```json
{
  "categories": [
    {
      "id": "10000000-0000-4000-8000-000000000022",
      "name": "Dairy",
      "slug": "dairy"
    }
  ]
}
```

## GET /api/v1/products

| Query | Default | Rule |
|---|---|---|
| `page` | `1` | Integer from 1 to 10000 |
| `limit` | `20` | Integer from 1 to 50 |
| `categoryId` | none | Category UUID |
| `search` | none | 1–80 characters after trimming. Blank is ignored |
| `sort` | `name` | `name`, `price_asc`, `price_desc`, or `newest` |
| `minPrice` | none | Integer paise, inclusive |
| `maxPrice` | none | Integer paise, inclusive. Must be greater than or equal to `minPrice` |
| `inStock` | `false` | `true` or `false` |

Search is case-insensitive and matches product name or brand. `%`, `_`, and `\` in the search text are matched literally. Filters run before pagination. `total` is the filtered count. Ordering is stable because every sort ends with the product id. An empty page is returned when `page` is past the end.

`descriptionSummary` is the description truncated to 160 characters. `primaryImage` is null when the product has no primary image.

The seeded catalogue, sorted by name:

| Product | Price (paise) | Stock |
|---|---|---|
| Onion | 3000 | 50 |
| Tomato | 4000 | 30 |
| Toned Milk | 5600 | 60 |
| Toor Dal | 12000 | 40 |
| Wheat Atta | 25000 | 25 |

```json
{
  "products": [
    {
      "id": "10000000-0000-4000-8000-000000000033",
      "name": "Toned Milk",
      "brand": "Ghartak Dairy",
      "descriptionSummary": "Pasteurised toned milk",
      "category": {
        "id": "10000000-0000-4000-8000-000000000022",
        "name": "Dairy",
        "slug": "dairy"
      },
      "unit": "litre",
      "packageSize": 1,
      "packageLabel": "1 L",
      "pricePaise": 5600,
      "stock": {
        "quantity": 60,
        "availability": "available",
        "purchasable": true
      },
      "primaryImage": {
        "id": "10000000-0000-4000-8000-000000000084",
        "deliveryPath": "/catalog/toned-milk/primary.jpg",
        "altText": "Toned milk pack",
        "position": 0,
        "isPrimary": true
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "pageCount": 1
  }
}
```

`GET /api/v1/products?search=milk` returns that object.

## GET /api/v1/products/:productId

`:productId` must be a UUID. The body adds the full description and the image gallery ordered by position. A missing image list is an empty array. Brand may be null.

```json
{
  "id": "10000000-0000-4000-8000-000000000031",
  "name": "Toor Dal",
  "brand": "Ghartak Staples",
  "descriptionSummary": "Split pigeon peas",
  "description": "Split pigeon peas",
  "category": {
    "id": "10000000-0000-4000-8000-000000000021",
    "name": "Staples",
    "slug": "staples"
  },
  "unit": "kg",
  "packageSize": 1,
  "packageLabel": "1 kg",
  "pricePaise": 12000,
  "stock": {
    "quantity": 40,
    "availability": "available",
    "purchasable": true
  },
  "primaryImage": {
    "id": "10000000-0000-4000-8000-000000000081",
    "deliveryPath": "/catalog/toor-dal/primary.jpg",
    "altText": "Toor dal pack",
    "position": 0,
    "isPrimary": true
  },
  "images": [
    {
      "id": "10000000-0000-4000-8000-000000000081",
      "deliveryPath": "/catalog/toor-dal/primary.jpg",
      "altText": "Toor dal pack",
      "position": 0,
      "isPrimary": true
    },
    {
      "id": "10000000-0000-4000-8000-000000000082",
      "deliveryPath": "/catalog/toor-dal/detail.jpg",
      "altText": "Toor dal detail",
      "position": 1,
      "isPrimary": false
    }
  ]
}
```

## Errors

```json
{
  "error": {
    "code": "request_error",
    "message": "limit: must be between 1 and 50"
  }
}
```

Invalid query parameters and an invalid product id return `400` `request_error`.

```json
{
  "error": {
    "code": "not_found",
    "message": "Product not found"
  }
}
```

Unknown and non-public products return `404` `not_found`. Unexpected failures return `500` `internal_error` without the database message.

## Images

Responses include the delivery path, alt text, position, and primary flag. They do not include the storage provider or the object key as separate fields. Demo paths are local, for example `/catalog/toor-dal/primary.jpg`. Those paths currently mirror the stored object key. Production delivery will use Cloudflare R2 when admin image management is built. This API does not upload, replace, or delete files, and it does not read R2 credentials.

## Not included

The response does not include warehouse id, publication status, or operational flags. There is no Redis cache, no admin write API, and no cart or checkout.
