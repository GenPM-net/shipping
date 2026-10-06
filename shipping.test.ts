import { beforeEach, describe, expect, it } from 'vitest';
import * as authSchema from '../auth/schema.ts';
import { addLine, applyOrderDiscount, clearTotalsSteps, computeTotals, getOrCreateCart, registerTotalsStep, setCartMeta } from '../cart/index.ts';
import * as cartSchema from '../cart/schema.ts';
import { carts } from '../cart/schema.ts';
import { createProduct, getProduct } from '../catalog/index.ts';
import * as catalogSchema from '../catalog/schema.ts';
import type { AdminContext } from '../contracts/index.ts';
import { testDb } from '../db/__fixtures__/pglite.ts';
import type { Db } from '../db/index.ts';
import { money } from '../money/index.ts';
import { eq } from 'drizzle-orm';
import * as schema from './schema.ts';
import { ratesFor, registerShippingStep, shippingRatesAdminResource, trackingUrl, upsertRate, upsertZone, zoneFor } from './index.ts';

let db: Db;
let mug: string;
let ebook: string;

beforeEach(async () => {
  db = await testDb(authSchema, catalogSchema, cartSchema, schema);
  Object.assign(process.env, { CART_COOKIE_SECRET: 'c'.repeat(40), STORE_CURRENCY: 'EUR' });
  clearTotalsSteps();
  registerShippingStep();
  await createProduct({ slug: 'mug', name: 'Mug', status: 'active', variants: [{ price: 1500, stock: 100, weightGrams: 400 }] });
  await createProduct({ slug: 'ebook', name: 'Ebook', status: 'active', kind: 'digital', variants: [{ price: 900, trackStock: false }] });
  mug = (await getProduct('mug'))!.variants[0]!.id;
  ebook = (await getProduct('ebook'))!.variants[0]!.id;
  const es = await upsertZone({ name: 'Spain', countries: ['ES'] });
  const world = await upsertZone({ name: 'World', countries: ['*'], position: 10 });
  await upsertRate({ zoneId: es.id, name: 'Standard', amount: 399, freeOver: 4000, minDays: 2, maxDays: 4 });
  await upsertRate({ zoneId: es.id, name: 'Express', amount: 899, minDays: 1, maxDays: 1, position: 1 });
  await upsertRate({ zoneId: es.id, name: 'Heavy', amount: 1299, minWeightGrams: 5000, position: 2 });
  await upsertRate({ zoneId: world.id, name: 'International', amount: 1999, minDays: 7, maxDays: 15 });
});

async function cartWith(lines: Array<[string, number]>, meta: Record<string, string> = {}) {
  const { cart } = await getOrCreateCart(null, null);
  for (const [v, q] of lines) await addLine(cart.id, v, q);
  if (Object.keys(meta).length) await setCartMeta(cart.id, meta);
  const [fresh] = await db.select().from(carts).where(eq(carts.id, cart.id));
  return fresh!;
}

describe('zones and rates', () => {
  it('matches countries explicitly first, then the rest-of-world zone', async () => {
    expect((await zoneFor('ES'))?.name).toBe('Spain');
    expect((await zoneFor('FR'))?.name).toBe('World');
  });

  it('filters by weight and subtotal, applies free shipping after discounts, sorts by price', async () => {
    const t = await computeTotals(await cartWith([[mug, 2]]));
    expect((await ratesFor(t, 'ES')).map((r) => [r.name, r.amount, r.minDays])).toEqual([['Standard', 399, 2], ['Express', 899, 1]]);
    const heavy = await computeTotals(await cartWith([[mug, 13]])); // 5,2 kg y 195 € → Standard gratis
    expect((await ratesFor(heavy, 'ES')).map((r) => [r.name, r.amount, r.free])).toEqual([['Standard', 0, true], ['Express', 899, false], ['Heavy', 1299, false]]);
    // Con un descuento que baja el subtotal de 40 €, deja de ser gratis.
    const big = await computeTotals(await cartWith([[mug, 3]])); // 45 €
    expect((await ratesFor(big, 'ES'))[0]!.amount).toBe(0);
    const discounted = applyOrderDiscount(big, { source: 'd', label: 'd', amount: money(600, 'EUR') });
    expect((await ratesFor(discounted, 'ES'))[0]!.amount).toBe(399);
  });
});

describe('totals step', () => {
  it('no shipping until a country is known; then the chosen or cheapest rate', async () => {
    expect((await computeTotals(await cartWith([[mug, 1]]))).shipping).toBeNull();
    const es = await computeTotals(await cartWith([[mug, 1]], { country: 'ES' }));
    expect([es.shipping?.label, es.shipping?.amount.amount, es.total.amount]).toEqual(['Standard', 399, 1899]);
    const rates = await ratesFor(es, 'ES');
    const express = await computeTotals(await cartWith([[mug, 1]], { country: 'ES', shippingRateId: rates[1]!.id }));
    expect(express.shipping?.label).toBe('Express');
    const stale = await computeTotals(await cartWith([[mug, 1]], { country: 'FR', shippingRateId: rates[1]!.id }));
    expect(stale.shipping?.label).toBe('International');
  });

  it('digital-only carts skip shipping; countries without zones get an issue', async () => {
    expect((await computeTotals(await cartWith([[ebook, 1]], { country: 'ES' }))).shipping).toBeNull();
    await db.delete(schema.shippingZones).where(eq(schema.shippingZones.name, 'World'));
    const t = await computeTotals(await cartWith([[mug, 1]], { country: 'JP' }));
    expect(t.issues).toEqual([{ code: 'no_shipping', message: "We don't ship to JP" }]);
  });

  it('runs after discounts registered earlier in the pipeline', async () => {
    registerTotalsStep({ name: 'discounts', order: 100, run: (t) => applyOrderDiscount(t, { source: 'd', label: 'd', amount: money(600, 'EUR') }) });
    const t = await computeTotals(await cartWith([[mug, 3]], { country: 'ES' }));
    expect([t.discountTotal.amount, t.shipping?.amount.amount, t.total.amount]).toEqual([600, 399, 4299]);
  });
});

describe('tracking and admin', () => {
  it('builds https tracking URLs and escapes the number', () => {
    expect(trackingUrl('Correos', 'PQ123ES')).toBe('https://www.correos.es/es/es/herramientas/localizador/envios/detalle?tracking-number=PQ123ES');
    expect(trackingUrl('unknown', 'A B&C')).toBe('https://t.17track.net/en#nums=A%20B%26C');
  });

  it('admin needs shipping permissions', async () => {
    const ctx = (perms: string[]): AdminContext => ({ user: { id: 'u', email: null, name: null }, can: async (p) => perms.includes(p) });
    expect((await shippingRatesAdminResource.list({ page: 1, pageSize: 50 }, ctx(['shipping:read']))).total).toBe(4);
    await expect(shippingRatesAdminResource.list({ page: 1, pageSize: 10 }, ctx([]))).rejects.toThrow(/forbidden/);
  });
});
