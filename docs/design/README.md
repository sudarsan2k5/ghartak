# Ghartak mobile design inspection

Source: [Untitled](https://www.figma.com/design/rZMMDNtnDu1v0454p3v7uF/Untitled?node-id=0-1)

- File key: `rZMMDNtnDu1v0454p3v7uF`
- Page: `Page 1` (`0:1`)
- Inspected through Figma MCP on 30 October 2026
- The file was not modified

`get_variable_defs` on the Home frame returned an empty object. This file does not expose reusable Figma variables. Colours, type, and spacing below are taken from the frame styles.

The on-canvas wordmark is **zipli**, not GharTak. The sample location is Indiranagar, Bengaluru.

## File structure

All six screens are top-level frames on Page 1. Each is 402 px wide and uses a 32 px outer corner radius.

| Screen | Frame name | Node | Position | Size |
| --- | --- | --- | --- | --- |
| Home | Home · Your neighbourhood, delivered | `3:5300` | x -182, y -473 | 402 × 1039 |
| Categories | Categories · Dairy, bread & eggs | `3:5441` | x 300, y -473 | 402 × 970 |
| Product Details | Product · Amul Taaza milk | `3:5585` | x 782, y -473 | 402 × 944 |
| Cart | Cart · Your daily essentials | `3:5664` | x -182, y 682 | 402 × 944 |
| Checkout | Checkout · One tap from fresh | `3:5774` | x 300, y 682 | 402 × 944 |
| Order Tracking | Tracking · A little good is on its way | `3:5856` | x 782, y 682 | 402 × 1018 |

Home and Categories sit in the top row with the product screen. Cart, Checkout, and Tracking sit in the row below.

## Documents

- [Design system](design-system.md)
- [Home](screens/home.md)
- [Categories](screens/categories.md)
- [Product details](screens/product-details.md)
- [Cart](screens/cart.md)
- [Checkout](screens/checkout.md)
- [Order tracking](screens/order-tracking.md)
