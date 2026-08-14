import assert from 'node:assert/strict';
import {
  buildCustomerDirectionsUrl,
  resolveCustomerDirectionsDestination,
} from '../src/utils/customerLocationDirections.js';

const gpsCustomer = {
  location: { lat: 10.801234, lng: 106.655678 },
  address: 'Fallback address',
};
const gpsUrl = new URL(buildCustomerDirectionsUrl(gpsCustomer));
assert.equal(gpsUrl.origin, 'https://www.google.com');
assert.equal(gpsUrl.pathname, '/maps/dir/');
assert.equal(gpsUrl.searchParams.get('api'), '1');
assert.equal(gpsUrl.searchParams.get('destination'), '10.801234,106.655678');
assert.equal(gpsUrl.searchParams.get('travelmode'), 'driving');

const legacyMapsCustomer = {
  location: 'https://www.google.com/maps/search/?api=1&query=7P28RJHR%2B2BWP',
  address: '474 Pham Van Bach, Ho Chi Minh City',
};
assert.equal(
  resolveCustomerDirectionsDestination(legacyMapsCustomer),
  '7P28RJHR+2BWP',
  'A saved Google Maps search URL must reuse its destination for directions.'
);
assert.equal(
  new URL(buildCustomerDirectionsUrl(legacyMapsCustomer)).searchParams.get('destination'),
  '7P28RJHR+2BWP'
);

const addressCustomer = { address: '474 Pham Van Bach, Ho Chi Minh City' };
assert.equal(
  new URL(buildCustomerDirectionsUrl(addressCustomer)).searchParams.get('destination'),
  '474 Pham Van Bach, Ho Chi Minh City'
);

assert.equal(buildCustomerDirectionsUrl({}), '', 'A customer without a location must not generate a navigation URL.');

console.log('customer location directions tests: PASS');
