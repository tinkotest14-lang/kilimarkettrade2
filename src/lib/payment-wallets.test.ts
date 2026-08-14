import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_PAYMENT_WALLETS, getPaymentAddress, setPaymentWallets } from './payment-wallets';

test('returns the default wallet for a supported network', () => {
  assert.equal(getPaymentAddress('BTC'), DEFAULT_PAYMENT_WALLETS.BTC);
  assert.equal(getPaymentAddress('ETH'), DEFAULT_PAYMENT_WALLETS.ETH);
});

test('allows overriding the wallet address for a network', () => {
  const original = getPaymentAddress('USDT TRC20');
  const customAddress = 'TCustomAddress1234567890';

  setPaymentWallets({ 'USDT TRC20': customAddress });
  assert.equal(getPaymentAddress('USDT TRC20'), customAddress);

  setPaymentWallets({ 'USDT TRC20': original });
  assert.equal(getPaymentAddress('USDT TRC20'), original);
});
