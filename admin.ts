// Panel: zonas y tarifas de envío.
import { asc, count, eq } from 'drizzle-orm';
import type { AdminContext, AdminResource } from '../contracts/index.ts';
import { getDb } from '../db/index.ts';
import { RateInput, upsertRate, upsertZone, ZoneInput } from './shipping.ts';
import { type ShippingRate, type ShippingZone, shippingRates, shippingZones } from './schema.ts';

class ShippingForbidden extends Error {
  readonly code = 'forbidden';
}
async function need(ctx: AdminContext, action: 'read' | 'update') {
  if (!(await ctx.can(`shipping:${action}`))) throw new ShippingForbidden(`forbidden: shipping:${action}`);
}

function resource<T extends { id: string }>(cfg: {
  name: string;
  label: { singular: string; plural: string };
  table: typeof shippingZones | typeof shippingRates;
  fields: AdminResource<T>['fields'];
  input: AdminResource<T>['input'];
  title: (r: T) => string;
  save: (input: unknown) => Promise<T>;
}): AdminResource<T> {
  return {
    name: cfg.name,
    label: cfg.label,
    group: 'Store',
    fields: cfg.fields,
    input: cfg.input,
    title: cfg.title,
    async list(q, ctx) {
      await need(ctx, 'read');
      const [total] = await getDb().select({ n: count() }).from(cfg.table);
      const rows = (await getDb().select().from(cfg.table).orderBy(asc(cfg.table.position)).limit(q.pageSize).offset((Math.max(q.page, 1) - 1) * q.pageSize)) as unknown as T[];
      return { rows, total: total?.n ?? 0 };
    },
    async get(id, ctx) {
      await need(ctx, 'read');
      const [row] = (await getDb().select().from(cfg.table).where(eq(cfg.table.id, id))) as unknown as T[];
      return row ?? null;
    },
    async create(input, ctx) {
      await need(ctx, 'update');
      return cfg.save(input);
    },
    async update(id, input, ctx) {
      await need(ctx, 'update');
      return cfg.save({ ...(input as object), id });
    },
    async delete(id, ctx) {
      await need(ctx, 'update');
      await getDb().delete(cfg.table).where(eq(cfg.table.id, id));
    },
  };
}

export const shippingZonesAdminResource = resource<ShippingZone>({
  name: 'shipping-zones',
  label: { singular: 'Shipping zone', plural: 'Shipping zones' },
  table: shippingZones,
  fields: [
    { name: 'name', label: 'Name', type: 'text', required: true, list: true },
    { name: 'countries', label: 'Countries (ISO codes, * = rest of world)', type: 'json', required: true, list: true },
    { name: 'position', label: 'Order', type: 'number' },
  ],
  input: ZoneInput,
  title: (z) => z.name,
  save: (i) => upsertZone(i as never),
});

export const shippingRatesAdminResource = resource<ShippingRate>({
  name: 'shipping-rates',
  label: { singular: 'Shipping rate', plural: 'Shipping rates' },
  table: shippingRates,
  fields: [
    { name: 'zoneId', label: 'Zone', type: 'relation', relationTo: 'shipping-zones', required: true, list: true },
    { name: 'name', label: 'Name', type: 'text', required: true, list: true },
    { name: 'amount', label: 'Price', type: 'money', required: true, list: true },
    { name: 'freeOver', label: 'Free from', type: 'money' },
    { name: 'minWeightGrams', label: 'Min weight (g)', type: 'number' },
    { name: 'maxWeightGrams', label: 'Max weight (g)', type: 'number' },
    { name: 'minDays', label: 'Delivery from (days)', type: 'number' },
    { name: 'maxDays', label: 'Delivery to (days)', type: 'number' },
    { name: 'active', label: 'Active', type: 'boolean', list: true },
  ],
  input: RateInput,
  title: (r) => r.name,
  save: (i) => upsertRate(i as never),
});

export const shippingAdminResources = () => [shippingZonesAdminResource, shippingRatesAdminResource];
