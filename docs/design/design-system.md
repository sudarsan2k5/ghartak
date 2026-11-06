# Design system

Extracted from the six frames in file `rZMMDNtnDu1v0454p3v7uF`. These are repeated literal styles, not Figma variables.

## Colour

| Role | Hex | Where it appears |
| --- | --- | --- |
| Page | `#FCFBF8` | Screen background |
| Ink | `#35203C` | Headings, prices, primary buttons, selected navigation |
| Lime | `#D7F66B` | Quantity steppers, offer strip, selected navigation pill, product and checkout buttons, campaign eyebrow |
| White | `#FFFFFF` | Cards, search field, headers, bottom navigation |
| Line | `#E9E5E9` | Borders, dividers, search separator, inactive gallery dots |
| Muted | `#837B86` | Placeholders, units, struck prices, inactive navigation |
| Secondary | `#665D6C` | Subtitles, bill labels, body copy |
| Savings | `#527527` | Discount labels and negative bill amounts |
| Payment wash | `#F1EAF5` | Selected UPI row |
| Map ground | `#EEEFE5` | Tracking map |
| Receipt wash | `#F1F9DA` | Paid-order summary on tracking |
| Aisle wash | `#F7F3E8` | Selected category aisle |
| Progress track | `#EAE5EB` | Unfinished tracking connector |

Shadows:

- Selected pack: `0 4px 12 rgba(53, 32, 60, 0.08)`
- Unselected pack: `0 2px 8 rgba(53, 32, 60, 0.05)`

## Typography

Two families are used.

- **Plus Jakarta Sans** for display headings, section titles, navigation labels, and some button labels. Weights in the file: Medium, SemiBold, Bold, ExtraBold, ExtraBold Italic.
- **Inter** for body, prices, metadata, and steppers. Weights in the file: Regular, Medium, Semi Bold, Bold, Extra Bold, Black.

| Use | Family | Weight | Size | Line height | Colour |
| --- | --- | --- | --- | --- | --- |
| Wordmark | Inter | Black | 27 | normal | Ink |
| Campaign headline | Plus Jakarta Sans | ExtraBold | 26 | 1.05 | White |
| Product title | Inter | ExtraBold | 26 | normal | Ink |
| Tracking headline | Plus Jakarta Sans | ExtraBold | 31 | normal | Ink |
| Page title | Plus Jakarta Sans | ExtraBold | 20 | normal | Ink |
| Section title | Plus Jakarta Sans | ExtraBold | 19 or 16–17 | normal | Ink |
| Price | Inter | ExtraBold | 14 on cards, 26 on product, 16–18 on totals | normal | Ink |
| Body | Inter | Regular | 11–13 | 1.5 where addresses wrap | Secondary |
| Meta / unit | Inter | Regular | 10 | normal | Muted |
| Eyebrow | Inter or Plus Jakarta Sans | ExtraBold or Bold | 9–11 | normal | Lime on campaign, Secondary elsewhere |
| Status time | Inter | Bold | 14 | normal | Ink |
| Navigation label | Plus Jakarta Sans or Inter | ExtraBold when selected, Medium otherwise | 10 | normal | Ink or Muted |

Struck prices use Inter Regular with a line-through.

## Spacing and shape

The phone frame is 402 px wide.

| Token | Value |
| --- | --- |
| Outer radius | 32 |
| Status bar | height 44, horizontal padding 26 |
| Page header | horizontal padding 20, vertical padding 14, icon 22, gap 12 |
| Page gutter | 16 or 20 |
| Search | height 46, padding 14, radius 12, icon 18, gap 10 |
| Card radius | 12 for controls and product cards, 18 for large cards and the map |
| Pill radius | 100 |
| Section gap | 12, 14, 16, 19, or 20 |
| Bottom navigation | height 64, horizontal padding 18, top border |
| Gesture handle | 120 × 4, ink, inside a 24 px bar |
| Quantity stepper | height 32, width 76 (88 on product dock), radius 8, horizontal padding 10 |

## Components

**Status bar.** Time on the left. Signal, Wi-Fi, and battery icons on the right, 18 px with a 25 px battery, gap 5.

**Page header.** Back arrow, title stack, and one trailing icon. The subtitle is `8 mins · Home, Indiranagar` except on Cart (`5 items · Home, Indiranagar`) and Tracking (`Order #ZP10482 · Placed at 9:41 AM`). Checkout hides the subtitle.

**Search field.** White, 1 px line border, search icon, muted placeholder, 1 px divider, microphone icon.

**Delivery badge.** Ink background, 8 px radius, 12 px zap icon, ExtraBold 12 px white label.

**Category tile.** White photo well, 76 × 65, radius 12, image about 65 × 59. Label is Inter Regular 10 px, centered, two lines, leading 1.2. Tiles are 83 px wide with a 10 px gap.

**Product card.** White, 1 px line border, radius 12, padding 10, internal gap 7. Photo area, green discount at the top left, two-line bold name at 12 px, unit in muted 10 px, price column, and either a lime stepper or an outlined `ADD +` button. Home cards are 175 px wide. Category cards are 144 px wide.

**Quantity stepper.** Lime fill and border when the item is in the basket. Minus, count, plus. The empty state is a white button with an ink border and the label `ADD +`.

**Basket bar.** Ink bar, height 52, radius 12, horizontal margin 16, vertical margin 9. Lime `5 ITEMS`, white `₹219`, white `View cart`, arrow.

**Bottom navigation.** Four items: Home, Categories, Orders, You. The selected item has a lime pill, 46 × 27, behind a 19 px icon, and an ExtraBold ink label. Unselected items use a white pill, muted icon, and Medium muted label. Item width is 72.

**Bill block.** White card, radius 18, padding 14–16. Rows pair a secondary label with a semibold amount. A 1 px divider sits above `To pay`. Savings amounts use the green `#527527`. Struck delivery fee stays muted.

**Primary button.** Height 52, radius 12, horizontal padding 18. Ink with white label on cart. Lime with ink label on product and checkout.

**Home indicator.** White bar, 24 px, centered 120 × 4 ink handle.

## Icons

Lucide-style icons used by name in the file:

`arrow-left`, `arrow-right`, `arrow-down-up`, `badge-percent`, `bike`, `check`, `chevron-down`, `chevron-right`, `chevron-up`, `circle`, `circle-check`, `circle-help`, `credit-card`, `headphones`, `heart`, `house`, `layout-grid`, `lock-keyhole`, `map-pin`, `message-square`, `mic`, `party-popper`, `phone`, `plus`, `search`, `share-2`, `shield-check`, `shopping-bag`, `sliders-horizontal`, `snowflake`, `store`, `user-round`, `zap`, plus iOS status glyphs.

## Photography

Product and category images are raster stills, `object-contain` on product shots and `object-cover` on some category stills. The tracking screen uses a portrait crop for the delivery partner. No asset was downloaded. The MCP image URLs expire after 7 days and are not part of the design specification.
