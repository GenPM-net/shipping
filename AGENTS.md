# @core/shipping — rules for AI agents

## Purpose
Shipping zones (ISO country lists, `*` = rest of world) and rates per zone: flat price, weight and order-value
ranges, free shipping over an amount (after discounts) and delivery estimates in days. Registers the `shipping`
step (order 200) of the @core/cart totals pipeline and builds tracking URLs for common carriers.
No label purchase or live carrier quotes. Tables: `shipping_zones`, `shipping_rates`.

## Map
- `index.ts` — public API: `upsertZone`, `upsertRate`, `ratesFor`, `zoneFor`, `trackingUrl`, `CARRIERS`, `shippingAdminResources`.
- `shipping.ts` — rules and the totals step. `admin.ts` — admin resources. `schema.ts` — tables.

## Integration
1. Migrations as in `src/lib/db/AGENTS.md`. Import this module at startup (it registers the totals step).
2. Create zones and rates in the admin (`...shippingAdminResources()` in `src/genpm/admin.ts`, permissions `shipping:read|update`).
3. At checkout, store the country and the chosen rate on the cart: `setCartMeta(cart.id, { country: 'ES', shippingRateId })`;
   list options with `ratesFor(totals, country)` and show `minDays–maxDays` before payment.
4. Tracking: `trackingUrl(carrier, number)` when marking an order shipped (@core/orders).
5. Verify: a cart with country `ES` gets the cheapest Spanish rate; one over the free threshold pays 0.

## Conventions
- Prices in minor units of `STORE_CURRENCY`; weights in grams from catalog variants.
- Digital-only carts never get shipping.
- Show `no_shipping` issues clearly and block checkout for those countries.

## Don't
- Don't hide delivery times or shipping costs until after payment (EU consumer law requires them upfront).
- Don't trust a rate id or amount sent by the browser; the totals step recomputes it.
