// Tablas de @core/shipping. Las recoge drizzle-kit vía src/lib/db/drizzle.config.ts.
import { boolean, index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from '../db/index.ts';

export const shippingZones = pgTable('shipping_zones', {
  id: primaryId('shz'),
  name: text('name').notNull(),
  /** Códigos ISO 3166-1 alpha-2; `*` = resto del mundo. */
  countries: jsonb('countries').$type<string[]>().notNull(),
  position: integer('position').notNull().default(0),
  ...timestamps,
});

export const shippingRates = pgTable(
  'shipping_rates',
  {
    id: primaryId('shr'),
    zoneId: text('zone_id')
      .notNull()
      .references(() => shippingZones.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Precio en unidades menores de la moneda de la tienda. */
    amount: integer('amount').notNull(),
    /** Gratis si el subtotal (tras descuentos) llega a este importe. */
    freeOver: integer('free_over'),
    /** Rango de aplicación por peso del carrito (gramos) y por subtotal. */
    minWeightGrams: integer('min_weight_grams'),
    maxWeightGrams: integer('max_weight_grams'),
    minSubtotal: integer('min_subtotal'),
    maxSubtotal: integer('max_subtotal'),
    /** Plazo de entrega estimado (días laborables), visible antes de pagar. */
    minDays: integer('min_days'),
    maxDays: integer('max_days'),
    active: boolean('active').notNull().default(true),
    position: integer('position').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('shipping_rates_zone_idx').on(t.zoneId)],
);

export type ShippingZone = typeof shippingZones.$inferSelect;
export type ShippingRate = typeof shippingRates.$inferSelect;
