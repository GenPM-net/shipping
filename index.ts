// @core/shipping — API pública. Al importarlo se registra el paso de envío en @core/cart.
export { shippingAdminResources, shippingRatesAdminResource, shippingZonesAdminResource } from './admin.js';
export {
  CARRIERS,
  RateInput,
  type RateOption,
  ratesFor,
  registerShippingStep,
  shippingStep,
  trackingUrl,
  upsertRate,
  upsertZone,
  ZoneInput,
  zoneFor,
} from './shipping.js';
export { type ShippingRate, type ShippingZone, shippingRates, shippingZones } from './schema.js';
