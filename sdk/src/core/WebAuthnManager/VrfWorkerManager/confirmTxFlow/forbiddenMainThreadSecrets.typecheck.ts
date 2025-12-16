// Type-level regression test: confirmTxFlow must never allow PRF outputs or wrap key
// material in main-thread request/response envelopes.
//
// This file is compiled by `tsc` during `pnpm -C sdk build`. The `@ts-expect-error`
// assertions ensure ForbiddenMainThreadSecrets remains enforced.

import { sendConfirmResponse } from './flows/common';

type Decision = Parameters<typeof sendConfirmResponse>[1];

const okDecision: Decision = {
  requestId: 'r1',
  confirmed: true,
};

void okDecision;

// @ts-expect-error - PRF outputs must never be present in main-thread envelopes
const badPrfOutput: Decision = { requestId: 'r2', confirmed: true, prfOutput: 'nope' };
void badPrfOutput;

// @ts-expect-error - WrapKeySeed must never be present in main-thread envelopes
const badWrapKeySeed: Decision = { requestId: 'r3', confirmed: true, wrapKeySeed: 'nope' };
void badWrapKeySeed;

// @ts-expect-error - WrapKeySalt must never be present in main-thread envelopes
const badWrapKeySalt: Decision = { requestId: 'r4', confirmed: true, wrapKeySalt: 'nope' };
void badWrapKeySalt;

// @ts-expect-error - vrf_sk must never be present in main-thread envelopes
const badVrfSk: Decision = { requestId: 'r5', confirmed: true, vrf_sk: 'nope' };
void badVrfSk;

export {};

