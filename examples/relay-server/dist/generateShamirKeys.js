#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import { Shamir3PassUtils } from '@tatchi-xyz/sdk/server';
async function main() {
    const utils = new Shamir3PassUtils({});
    // leave args empty: initialise with the default p_b64u from wasm-vrf-worker
    const { p_b64u } = await utils.initialize();
    const { e_s_b64u, d_s_b64u } = await utils.generateServerKeypair();
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
//# sourceMappingURL=generateShamirKeys.js.map