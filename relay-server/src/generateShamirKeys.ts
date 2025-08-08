#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import { Shamir3PassUtils, getShamirPB64uFromWasm } from '@web3authn/passkey/server';

async function main() {

  const p_b64u = await getShamirPB64uFromWasm();
  console.log(`p_b64u=${p_b64u}`);
  const utils = new Shamir3PassUtils({ p_b64u });
  const {
    e_s_b64u,
    d_s_b64u
  } = await utils.generateServerKeypair();

  console.log('\n*****************************************');
  console.log('Generated Shamir 3-pass server keypair.');
  console.log('Backup these values in your .env file:\n');
  console.log(`SHAMIR_P_B64U=${p_b64u}`);
  console.log(`SHAMIR_E_S_B64U=${e_s_b64u}`);
  console.log(`SHAMIR_D_S_B64U=${d_s_b64u}`);
  console.log('*****************************************');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

