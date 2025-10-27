import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';
import { ensureComponentModule, mountComponent } from './harness';

import type { TransactionInputWasm } from '../../core/types/actions';
import { ActionType } from '../../core/types/actions';

const WRAPPER_MODULE = '/sdk/w3a-tx-confirmer.js';
const WRAPPER_TAG = 'w3a-tx-confirmer';

test.describe('Lit component – drawer TxTree row toggles', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
    await ensureComponentModule(page, {
      modulePath: WRAPPER_MODULE,
      tagName: WRAPPER_TAG,
    });
  });

  test('action folder rows expand/collapse on click', async ({ page }) => {
    const txs: TransactionInputWasm[] = [{
      receiverId: 'merchant.testnet',
      actions: [{
        action_type: ActionType.FunctionCall,
        method_name: 'set_greeting',
        args: JSON.stringify({ greeting: 'hello' }),
        gas: '30000000000000',
        deposit: '0'
      }]
    }];

    await mountComponent(page, {
      tagName: WRAPPER_TAG,
      props: {
        variant: 'drawer',
        nearAccountId: 'demo.testnet',
        txSigningRequests: txs,
        theme: 'dark',
      },
    });

    // Find the first action folder <details> within the TxTree inside the drawer
    const openState = await page.evaluate(async () => {
      // Wait a tick for the drawer to mount and open
      await new Promise((r) => setTimeout(r, 50));
      const wrapper = document.querySelector('w3a-tx-confirmer') as HTMLElement | null;
      if (!wrapper) throw new Error('wrapper not found');
      const drawerVariant = wrapper.querySelector('w3a-drawer-tx-confirmer') as HTMLElement | null;
      if (!drawerVariant) throw new Error('drawer variant not found');
      // Into drawer element (content is slotted, not in shadowRoot query)
      const drawer = drawerVariant.shadowRoot?.querySelector('w3a-drawer') as HTMLElement | null;
      if (!drawer) throw new Error('w3a-drawer not found');
      // tx-confirm-content is a light DOM child of <w3a-drawer> and projects into its slot
      const content = drawer.querySelector('w3a-tx-confirm-content') as HTMLElement | null;
      if (!content) throw new Error('tx-confirm-content not found');
      // Into tx-confirm-content shadowRoot
      const tree = content.shadowRoot?.querySelector('w3a-tx-tree') as HTMLElement | null;
      if (!tree) throw new Error('w3a-tx-tree not found');
      const root = tree.shadowRoot as ShadowRoot | null;
      if (!root) throw new Error('tx-tree shadowRoot not found');

      // Transaction folder is open by default; pick first child action folder (<details.folder>) inside its folder-children
      const txFolder = root.querySelector('details.tree-node.folder');
      if (!txFolder) throw new Error('tx folder not found');
      const actionFolder = (txFolder as HTMLElement).querySelector('div.folder-children details.tree-node.folder');
      const target = actionFolder as HTMLDetailsElement | null;
      if (!target) throw new Error('action folder not found');

      // Initial should be closed
      const initialOpen = target.hasAttribute('open');
      // Click summary to open
      const summary = target.querySelector('summary') as HTMLElement | null;
      summary?.click();
      await new Promise((r) => setTimeout(r, 20));
      const afterOpen = target.hasAttribute('open');
      // Click summary to close
      summary?.click();
      await new Promise((r) => setTimeout(r, 20));
      const afterClose = target.hasAttribute('open');

      return { initialOpen, afterOpen, afterClose };
    });

    expect(openState.initialOpen).toBe(false);
    expect(openState.afterOpen).toBe(true);
    expect(openState.afterClose).toBe(false);
  });
});
