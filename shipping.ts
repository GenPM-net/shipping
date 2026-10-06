// Tarifas por zona y paso de envío de la tubería de totales de @core/cart.
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { type CartTotals, registerTotalsStep } from '../cart/index.ts';
import { type Executor, getDb } from '../db/index.ts';
import { money, sub } from '../money/index.ts';
import { type ShippingRate, type ShippingZone, shippingRates, shippingZones } from './schema.ts';

const Country = z.string().regex(/^([A-Z]{2}|\*)$/);
export const ZoneInput = z.object({ id: z.string().optional(), name: z.string().min(1).max(80), countries: z.array(Country).min(1).max(250), position: z.number().int().default(0) });
const Int = z.number().int().min(0).nullish();
export const RateInput = z.object({
  id: z.string().optional(),
  zoneId: z.string(),
  name: z.string().min(1).max(80),
  amount: z.number().int().min(0),
  freeOver: Int,
  minWeightGrams: Int,
  maxWeightGrams: Int,
  minSubtotal: Int,
  maxSubtotal: Int,
  minDays: Int,
  maxDays: Int,
  active: z.boolean().default(true),
  position: z.number().int().default(0),
});

export async function upsertZone(input: z.input<typeof ZoneInput>, db: Executor = getDb()): Promise<ShippingZone> {
  const z1 = ZoneInput.parse(input);
  const values = { name: z1.name, countries: [...new Set(z1.countries)], position: z1.position };
  const [row] = z1.id
    ? await db.update(shippingZones).set(values).where(eq(shippingZones.id, z1.id)).returning()
    : await db.insert(shippingZones).values(values).returning();
  return row!;
}

export async function upsertRate(input: z.input<typeof RateInput>, db: Executor = getDb()): Promise<ShippingRate> {
  const r = RateInput.parse(input);
  const { id, ...rest } = r;
  const n = (v: number | null | undefined) => v ?? null;
  const values = {
    ...rest,
    freeOver: n(rest.freeOver),
    minWeightGrams: n(rest.minWeightGrams),
    maxWeightGrams: n(rest.maxWeightGrams),
    minSubtotal: n(rest.minSubtotal),
    maxSubtotal: n(rest.maxSubtotal),
    minDays: n(rest.minDays),
    maxDays: n(rest.maxDays),
  };
  const [row] = id ? await db.update(shippingRates).set(values).where(eq(shippingRates.id, id)).returning() : await db.insert(shippingRates).values(values).returning();
  return row!;
}

/** Zona de un país: la que lo nombra explícitamente o, si no hay, la de `*`. */
export async function zoneFor(country: string, db: Executor = getDb()): Promise<ShippingZone | null> {
  const zones = await db.select().from(shippingZones).orderBy(asc(shippingZones.position), asc(shippingZones.id));
  return zones.find((z1) => z1.countries.includes(country)) ?? zones.find((z1) => z1.countries.includes('*')) ?? null;
}

export type RateOption = { id: string; name: string; amount: number; currency: string; minDays: number | null; maxDays: number | null; free: boolean };

/** Tarifas aplicables a un carrito y país (peso y subtotal tras descuentos), de la más barata a la más cara. */
export async function ratesFor(t: Pick<CartTotals, 'lines' | 'subtotal' | 'discountTotal' | 'currency'>, country: string, db: Executor = getDb()): Promise<RateOption[]> {
  const zone = await zoneFor(country, db);
  if (!zone) return [];
  const rates = await db.select().from(shippingRates).where(and(eq(shippingRates.zoneId, zone.id), eq(shippingRates.active, true))).orderBy(asc(shippingRates.position));
  const weight = t.lines.reduce((a, l) => a + (l.weightGrams ?? 0) * l.quantity, 0);
  const subtotal = sub(t.subtotal, t.discountTotal).amount;
  return rates
    .filter(
      (r) =>
        (r.minWeightGrams == null || weight >= r.minWeightGrams) &&
        (r.maxWeightGrams == null || weight <= r.maxWeightGrams) &&
        (r.minSubtotal == null || subtotal >= r.minSubtotal) &&
        (r.maxSubtotal == null || subtotal <= r.maxSubtotal),
    )
    .map((r) => {
      const free = r.freeOver != null && subtotal >= r.freeOver;
      return { id: r.id, name: r.name, amount: free ? 0 : r.amount, currency: t.currency, minDays: r.minDays, maxDays: r.maxDays, free };
    })
    .sort((a, b) => a.amount - b.amount);
}

/**
 * Paso de totales (orden 200). Usa `meta.country` y `meta.shippingRateId` del carrito: sin país no hay envío
 * todavía; con país, la tarifa elegida si sigue valiendo o la más barata; sin ninguna, avisa `no_shipping`.
 * Carritos solo con productos digitales no llevan envío.
 */
export async function shippingStep(t: CartTotals): Promise<CartTotals> {
  if (!t.lines.some((l) => l.kind === 'physical')) return t;
  const country = t.context.meta.country;
  if (!country) return t;
  const options = await ratesFor(t, country);
  if (!options.length) return { ...t, issues: [...t.issues, { code: 'no_shipping', message: `We don't ship to ${country}` }] };
  const chosen = options.find((o) => o.id === t.context.meta.shippingRateId) ?? options[0]!;
  return { ...t, shipping: { source: 'shipping', label: chosen.name, code: chosen.id, amount: money(chosen.amount, t.currency) } };
}

/** Activa el paso de envío en @core/cart (se llama al importar el módulo). */
export const registerShippingStep = () => registerTotalsStep({ name: 'shipping', order: 200, run: shippingStep });
registerShippingStep();

/** Plantillas de seguimiento de transportistas habituales (verifica las URL vigentes de los que uses). */
export const CARRIERS: Record<string, { name: string; url: (n: string) => string }> = {
  correos: { name: 'Correos', url: (n) => `https://www.correos.es/es/es/herramientas/localizador/envios/detalle?tracking-number=${n}` },
  seur: { name: 'SEUR', url: (n) => `https://www.seur.com/livetracking/?segOnlineIdentificador=${n}` },
  gls: { name: 'GLS', url: (n) => `https://gls-group.com/track/${n}` },
  dhl: { name: 'DHL', url: (n) => `https://www.dhl.com/global-en/home/tracking/tracking-express.html?tracking-id=${n}` },
  ups: { name: 'UPS', url: (n) => `https://www.ups.com/track?tracknum=${n}` },
  fedex: { name: 'FedEx', url: (n) => `https://www.fedex.com/fedextrack/?trknbr=${n}` },
  usps: { name: 'USPS', url: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}` },
  royalmail: { name: 'Royal Mail', url: (n) => `https://www.royalmail.com/track-your-item#/tracking-results/${n}` },
  generic: { name: '17TRACK', url: (n) => `https://t.17track.net/en#nums=${n}` },
};

/** URL de seguimiento (https) para un transportista conocido; si no se conoce, el rastreador genérico. */
export function trackingUrl(carrier: string | null | undefined, number: string): string {
  const n = encodeURIComponent(number.trim().slice(0, 60));
  return (CARRIERS[(carrier ?? '').toLowerCase().replace(/[^a-z]/g, '')] ?? CARRIERS.generic!).url(n);
}
