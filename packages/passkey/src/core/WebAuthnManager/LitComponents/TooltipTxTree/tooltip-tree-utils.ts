import { TooltipTreeStyles } from '.';
import type { ActionArgs, TransactionInput } from '../../../types/actions';
import { formatArgs, formatGas, formatDeposit } from '../formatters';

export type TreeNodeType = 'folder' | 'file';

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
  /**
   * Optional highlighting information for special nodes
   */
  highlight?: {
    type: 'receiverId' | 'methodName';
    color: string;
  };
  /* Optional flag to hide the chevron icon for folder nodes.
   * When true, the expand/collapse chevron will not be rendered,
   * though the folder will still be expandable/collapsible.
   */
  hideChevron?: boolean;
  /* Optional flag to hide the label text for file nodes.
   * When true, the label will be set to display: none,
   * but the content will still be visible.
   */
  displayNone?: boolean;
}

// Builds a TreeNode for a single action
function buildActionNode(action: ActionArgs, idx: number, highlightMethodNameColor?: string): TreeNode {

  // Generate user-friendly labels for each action type
  let label: string;
  switch (action.type) {
    case 'FunctionCall':
      label = `Calling ${action.methodName} with`;
      break;
    case 'Transfer':
      label = `Transferring ${formatDeposit(action.amount)} to`;
      break;
    case 'CreateAccount':
      label = 'Creating Account';
      break;
    case 'DeleteAccount':
      label = 'Deleting Account';
      break;
    case 'Stake':
      label = `Staking ${formatDeposit(action.stake)} to`;
      break;
    case 'AddKey':
      label = 'Adding Key';
      break;
    case 'DeleteKey':
      label = 'Deleting Key';
      break;
    case 'DeployContract':
      label = 'Deploying Contract';
      break;
    default:
      label = `Action ${idx + 1}: ${action.type}`;
  }

  let actionNodes: TreeNode[];

  switch (action.type) {
    case 'FunctionCall':
      actionNodes = [
        { id: `a${idx}-gas`, label: `gas: ${formatGas(action.gas)}`, type: 'file' },
        // Only show deposit if it's not 0
        ...(action.deposit && action.deposit !== '0' ? [{
          id: `a${idx}-deposit`,
          label: `deposit: ${formatDeposit(action.deposit)}`,
          type: 'file' as const
        }] : []),
        {
          id: `a${idx}-args`,
          label: 'args:',
          type: 'file',
          open: true,
          hideChevron: true,
          displayNone: true, // hide "args:" row label
          content: formatArgs(action.args)
        }
      ];
      break;

    case 'Transfer':
      actionNodes = [
        // Transfers don't have gas property, show basic info
      ];
      break;

    case 'CreateAccount':
      actionNodes = [];
      break;

    case 'DeployContract':
      const code = action.code;
      const codeSize = calculateCodeSize(code);
      actionNodes = [
        { id: `a${idx}-code-size`, label: `Code size: ${codeSize}`, type: 'file' }
      ];
      break;

    case 'Stake':
      actionNodes = [
        { id: `a${idx}-publicKey`, label: `Validator: ${action.publicKey}`, type: 'file' }
      ];
      break;

    case 'AddKey':
      const ak = action.accessKey;
      let permissions = '';
      try {
        const accessKeyObj = typeof ak === 'string' ? JSON.parse(ak) : ak;
        permissions = 'FullAccess' in accessKeyObj.permission
          ? 'Full Access'
          : 'Function Call';
      } catch {
        permissions = 'Unknown';
      }
      actionNodes = [
        { id: `a${idx}-publicKey`, label: `Key: ${action.publicKey}`, type: 'file' },
        { id: `a${idx}-permissions`, label: `Permissions: ${permissions}`, type: 'file' }
      ];
      break;

    case 'DeleteKey':
      actionNodes = [
        { id: `a${idx}-publicKey`, label: `Key: ${action.publicKey}`, type: 'file' }
      ];
      break;

    case 'DeleteAccount':
      actionNodes = [
        { id: `a${idx}-beneficiaryId`, label: `Beneficiary: ${action.beneficiaryId}`, type: 'file' }
      ];
      break;

    default:
      // Unknown action - show raw data
      let raw = '';
      try { raw = JSON.stringify(action, null, 2); } catch { raw = String(action); }
      actionNodes = [{
        id: `a${idx}-action`,
        label: `Action: ${action.type || 'Unknown'}`,
        type: 'file'
      }, {
        id: `a${idx}-raw`,
        label: 'Raw Data',
        type: 'file',
        open: false,
        content: raw
      }];
      break;
  }

  // Conditionally add highlight for FunctionCall method names
  const functionCallHighlight = action.type === 'FunctionCall' && highlightMethodNameColor
    ? {
        highlight: {
          type: 'methodName' as const,
          color: highlightMethodNameColor
        }
      }
    : {};

  return {
    id: `action-${idx}`,
    label,
    type: 'folder',
    open: true,
    hideChevron: true,
    ...functionCallHighlight,
    children: actionNodes
  } as TreeNode;
}

// Helper function for calculating code size
function calculateCodeSize(code: Uint8Array | string): string {
  if (!code) return '0 bytes';
  if (code instanceof Uint8Array) return `${code.byteLength} bytes`;
  if (Array.isArray(code)) return `${code.length} bytes`;
  if (typeof code === 'string') return `${code.length} bytes`;
  return 'unknown';
}

// Pure builder that converts a TransactionInput into a TreeNode transaction tree
// Label format: "Transaction to receiverId" for single tx, "Transaction(index) to receiverId" for multiple txs
export function buildTransactionNode(
  tx: TransactionInput,
  tIdx: number,
  totalTransactions: number,
  tooltipTreeStyles?: TooltipTreeStyles
): TreeNode {

  const highlightMethodColor = tooltipTreeStyles?.highlightMethodName?.color;
  const actionFolders: TreeNode[] = tx.actions.map((action: ActionArgs, idx: number) =>
    buildActionNode(action, idx, highlightMethodColor)
  );

    // Generate appropriate label based on whether there are multiple transactions
  const label = totalTransactions === 1
    ? `Transaction to ${tx.receiverId}`
    : `Transaction(${tIdx}) to ${tx.receiverId}`;

  return {
    id: `tx-${tIdx}`,
    label: label,
    type: 'folder',
    open: tIdx === 0,
    ...(tooltipTreeStyles?.highlightReceiverId?.color && {
      highlight: {
        type: 'receiverId' as const,
        color: tooltipTreeStyles.highlightReceiverId.color
      }
    }),
    hideChevron: true,
    children: [...actionFolders]
  };
}

// Builds a display tree from transaction payloads for tooltip rendering
// a two-level tree: Transaction -> Action N -> subfields
export function buildDisplayTreeFromTxPayloads(
  txSigningRequests: TransactionInput[],
  tooltipTreeStyles?: TooltipTreeStyles
): TreeNode {

  const totalTransactions = txSigningRequests.length;
  const txFolders: TreeNode[] = txSigningRequests.map((tx: TransactionInput, tIdx: number) =>
    buildTransactionNode(tx, tIdx, totalTransactions, tooltipTreeStyles)
  );

  return {
    id: 'txs-root',
    label: totalTransactions > 1 ? 'Transactions' : 'Transaction',
    type: 'folder',
    open: true,
    children: txFolders
  };
}