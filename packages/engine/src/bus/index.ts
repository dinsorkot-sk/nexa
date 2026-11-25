// Importing this module installs the bus record hooks (chained after the mail hooks).
import './hooks.js';

export {
  BusService, BROADCAST_CHANNEL, registerBusModels, unregisterBusModels, busNotifies, userChannel, partnerChannel, recordChannel,
  parseRecordChannel, type PublishOptions, type RecordRef,
} from './service.js';
export { BusHub, BusSubscription, BUS_LIMITS, type BusEvent, type SubscribeOptions } from './hub.js';
export { PgNotifyTransport, busTransport, setBusTransport, MAX_ENVELOPE_BYTES, type BusTransport } from './transport.js';
