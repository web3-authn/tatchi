import { TxTreeStyles } from './tx-tree-themes';
import type { ActionArgs, TransactionInput } from '../../../types/actions';
import { formatArgs, formatDeposit, shortenPubkey, formatCodeSize } from '../common/formatters';
import { isString } from '@/utils/validation';

export type TreeNodeType = 'folder' | 'file';

// Structured highlight specification for labels
export type HighlightSpec =
  | { transaction: 'receiverId' }
  | { actionType: 'FunctionCall' | 'Transfer' | string; highlightKeys: string[] };

export interface TreeNode {
  /* Unique identifier for the tree node, used for React keys and DOM element IDs */
  id: string;
  /* Display text shown for this node in the tree UI */
  label: string;
  /* Type of the tree node - either 'folder' (expandable) or 'file' (leaf node) */
  type: TreeNodeType;
  /* Whether the node is initially expanded (folders only). Defaults to false.
   * When true, folder nodes will be rendered in an open state.
   */
  open?: boolean;
  /* Optional content for the node. When provided on a 'file' node,
   * it will be shown inside a collapsible details section.
   * Typically used for displaying formatted data like JSON arguments.
   */
  content?: string;
  /* Child nodes for folder-type nodes. Undefined or empty array for file nodes.
   * The tree structure is built recursively through this property.
   */
  children?: TreeNode[];
  /** Optional value that can be copied to clipboard when the row is clicked */
  copyValue?: string;
  /**
   * Optional highlighting information for special nodes
   */
  highlight?: {
    type: 'receiverId' | 'methodName';
    color: string;
  };
  /** Structured highlighting preferences for building labels */
  highlightSpec?: HighlightSpec;
  /* Optional flag to hide the chevron icon for folder nodes.
   * When true, the expand/collapse chevron will not be rendered,
   * though the folder will still be expandable/collapsible.
   */
  hideChevron?: boolean;
  /* Optional flag to hide the label text for file nodes.
   * When true, the label will be set to display: none,
   * but the content will still be visible.
   */
  hideLabel?: boolean;

  /**
   * For action folder nodes, attach the underlying ActionArgs so the
   * renderer can construct the label and apply selective highlights.
   */
  action?: ActionArgs;
  /**
   * The index of this action within its transaction, for display purposes.
   */
  actionIndex?: number;
  /** Transaction data for transaction-level folder nodes */
  transaction?: TransactionInput;
  /** Index of this transaction in the list */
  transactionIndex?: number;
  /** Total count of transactions in the request */
  totalTransactions?: number;
}

// Builds a TreeNode for a single action
function buildActionNode(action: ActionArgs, idx: number): TreeNode {

  let actionNodes: TreeNode[];

  switch (action.type) {
    case 'FunctionCall':
      actionNodes = [
        // Skip showing gas for FunctionCall, we show it in the label
        // { id: `a${idx}-gas`, label: `gas: ${formatGas(action.gas)}`, type: 'file' },
        {
          id: `a${idx}-args`,
          label: 'using args:',
          type: 'file',
          open: false,
          hideChevron: true,
          hideLabel: true, // hide "args:" row label
          content: formatArgs(action.args)
        }
      ];
      break;

    case 'Transfer':
      actionNodes = []; // Transfers don't have gas property
      break;

    case 'CreateAccount':
      actionNodes = [];
      break;

    case 'DeployContract': {
      const code = action.code;
      const codeSize = formatCodeSize(code as any);
      actionNodes = [
        {
          id: `a${idx}-code-size`,
          label: `WASM contract code size: ${codeSize}`,
          type: 'file',
          open: false,
        }
      ];
      break;
    }

    case 'DeployGlobalContract': {
      const code = action.code;
      const deployMode = action.deployMode;
      const codeSize = formatCodeSize(code as any);
      actionNodes = [
        {
          id: `a${idx}-deploy-mode`,
          label: `mode: ${deployMode}`,
          type: 'file',
          open: false,
        },
        {
          id: `a${idx}-code-size`,
          label: `WASM global contract code size: ${codeSize}`,
          type: 'file',
          open: false,
        }
      ];
      break;
    }

    case 'UseGlobalContract': {
      const accountId = action.accountId;
      const codeHash = action.codeHash;
      let label: string;
      if (accountId) {
        label = `by account: ${accountId}`;
      } else if (codeHash) {
        const short = shortenPubkey(codeHash, { prefix: 10, suffix: 6 });
        label = `by hash: ${short}`;
      } else {
        label = 'by global contract identifier';
      }
      actionNodes = [
        {
          id: `a${idx}-identifier`,
          label,
          type: 'file',
          open: false,
        }
      ];
      break;
    }

    case 'Stake':
      actionNodes = [
        {
          id: `a${idx}-publicKey`,
          label: `validator: ${shortenPubkey(action.publicKey)}`,
          type: 'file',
          open: true,
          copyValue: action.publicKey
        }
      ];
      break;

    case 'AddKey':
      const ak = action.accessKey;
      let permissions = '';
      try {
        const accessKeyObj = isString(ak) ? JSON.parse(ak) : ak;
        permissions = accessKeyObj.permission === 'FullAccess'
          ? 'Full Access'
          : 'Function Call';
      } catch {
        permissions = 'Unknown';
      }
      actionNodes = [
        {
          id: `a${idx}-publicKey`,
          label: `key: ${shortenPubkey(action.publicKey)}`,
          open: false,
          type: 'file',
          copyValue: action.publicKey
        },
        {
          id: `a${idx}-permissions`,
          label: `permissions: ${permissions}`,
          open: false,
          type: 'file'
        }
      ];
      break;

    case 'DeleteKey':
      actionNodes = [
        {
          id: `a${idx}-publicKey`,
          label: `key: ${shortenPubkey(action.publicKey)}`,
          open: false,
          type: 'file',
          copyValue: action.publicKey
        }
      ];
      break;

    case 'DeleteAccount':
      actionNodes = [
        {
          id: `a${idx}-beneficiaryId`,
          label: `sending balance to: ${action.beneficiaryId}`,
          open: false,
          type: 'file'
        }
      ];
      break;

    default:
      // Unknown action - show raw data
      let raw = '';
      try { raw = JSON.stringify(action, null, 2); } catch { raw = String(action); }
      actionNodes = [
        {
          id: `a${idx}-action`,
          label: `Action: ${action.type || 'Unknown'}`,
          open: false,
          type: 'file'
        },
        {
          id: `a${idx}-raw`,
          label: 'Raw Data',
          type: 'file',
          open: false,
          content: raw
        }
      ];
      break;
  }

  return {
    id: `action-${idx}`,
    // Label is now computed at render time from action data
    label: '',
    type: 'folder',
    open: false,
    hideChevron: true,
    // Attach action data for the renderer
    action,
    actionIndex: idx,
    children: actionNodes
  } as TreeNode;
}

// Pure builder that converts a TransactionInput into a TreeNode transaction tree
// Label format: "Transaction to receiverId" for single tx, "Transaction(index) to receiverId" for multiple txs
export function buildTransactionNode(
  tx: TransactionInput,
  tIdx: number,
  totalTransactions: number,
  styles?: TxTreeStyles
): TreeNode {

  const actionFolders: TreeNode[] = tx.actions.map((action: ActionArgs, idx: number) =>
    buildActionNode(action, idx)
  );

  return {
    id: `tx-${tIdx}`,
    // Label is computed at render time; keep empty string here
    label: '',
    type: 'folder',
    open: true, // all transactions folders are open by default
    hideChevron: true,
    transaction: tx,
    transactionIndex: tIdx,
    totalTransactions,
    children: [...actionFolders]
  };
}

// Builds a display tree from transaction payloads for tooltip rendering
// a two-level tree: Transaction -> Action N -> subfields
export function buildDisplayTreeFromTxPayloads(
  txSigningRequests: TransactionInput[],
  styles?: TxTreeStyles
): TreeNode {

  const totalTransactions = txSigningRequests.length;
  const txFolders: TreeNode[] = txSigningRequests.map((tx: TransactionInput, tIdx: number) =>
    buildTransactionNode(tx, tIdx, totalTransactions, styles)
  );

  return {
    id: 'txs-root',
    label: totalTransactions > 1 ? 'Transactions' : 'Transaction',
    type: 'folder',
    open: true,
    children: txFolders
  };
}
