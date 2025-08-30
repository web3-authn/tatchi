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
}

// Builds a TreeNode for a single action
function buildActionNode(action: ActionArgs, idx: number, highlightMethodNameColor?: string): TreeNode {

  const label = `Action ${idx + 1}: ${action.type}`;
  let actionNodes: TreeNode[];

  switch (action.type) {
    case 'FunctionCall':
      actionNodes = [
        {
          id: `a${idx}-method`,
          label: `method: ${action.methodName}`,
          type: 'file',
          ...(highlightMethodNameColor && {
            highlight: {
              type: 'methodName' as const,
              color: highlightMethodNameColor
            }
          })
        },
        { id: `a${idx}-gas`, label: `gas: ${formatGas(action.gas)}`, type: 'file' },
        { id: `a${idx}-deposit`, label: `deposit: ${formatDeposit(action.deposit)}`, type: 'file' },
        {
          id: `a${idx}-args`,
          label: 'args: ',
          type: 'file',
          open: true,
          hideChevron: true,
          content: formatArgs(action.args)
        }
      ];
      break;

    case 'Transfer':
      actionNodes = [
        { id: `a${idx}-amount`, label: `amount: ${action.amount}`, type: 'file' }
      ];
      break;

    case 'CreateAccount':
      actionNodes = [];
      break;

    case 'DeployContract':
      const code = (action as any).code;
      const codeSize = calculateCodeSize(code);
      actionNodes = [
        { id: `a${idx}-code-size`, label: `codeSize: ${codeSize}`, type: 'file' }
      ];
      break;

    case 'Stake':
      const a: any = action;
      actionNodes = [
        { id: `a${idx}-publicKey`, label: `publicKey: ${a.publicKey}`, type: 'file' },
        { id: `a${idx}-stake`, label: `stake: ${a.stake}`, type: 'file' }
      ];
      break;

    case 'AddKey':
      const ak = action.accessKey;
      let akPretty = '';
      try { akPretty = JSON.stringify(ak, null, 2); } catch { akPretty = String(ak); }
      actionNodes = [
        { id: `a${idx}-publicKey`, label: `publicKey: ${action.publicKey}`, type: 'file' },
        { id: `a${idx}-accessKey`, label: 'accessKey', type: 'file', content: akPretty }
      ];
      break;

    case 'DeleteKey':
      actionNodes = [
        { id: `a${idx}-publicKey`, label: `publicKey: ${action.publicKey}`, type: 'file' }
      ];
      break;

    case 'DeleteAccount':
      actionNodes = [
        { id: `a${idx}-beneficiaryId`, label: `beneficiaryId: ${action.beneficiaryId}`, type: 'file' }
      ];
      break;

    default:
      // Unknown action
      let raw = '';
      try { raw = JSON.stringify(action, null, 2); } catch { raw = String(action); }
      actionNodes = [{
        id: `a${idx}-raw`,
        label: 'data',
        type: 'file',
        open: true,
        content: raw
      }];
      break;
  }

  return {
    id: `action-${idx}`,
    label,
    type: 'folder',
    open: true,
    hideChevron: false,
    children: actionNodes
  } as TreeNode;
}

// Helper function for calculating code size
function calculateCodeSize(code: any): string {
  if (!code) return '0 bytes';
  if (code instanceof Uint8Array) return `${code.byteLength} bytes`;
  if (Array.isArray(code)) return `${code.length} bytes`;
  if (typeof code === 'string') return `${code.length} bytes`;
  return 'unknown';
}

// Pure builder that converts a TransactionInput into a TreeNode transaction tree
export function buildTransactionNode(
  tx: TransactionInput,
  tIdx: number,
  tooltipTreeStyles?: TooltipTreeStyles
): TreeNode {

  const highlightMethodColor = tooltipTreeStyles?.highlightMethodName?.color;
  const actionFolders: TreeNode[] = tx.actions.map((action: any, idx: number) =>
    buildActionNode(action, idx, highlightMethodColor)
  );

  return {
    id: `tx-${tIdx}`,
    label: `Transaction ${tIdx + 1} to ${tx.receiverId}`,
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

  const txFolders: TreeNode[] = txSigningRequests.map((tx: TransactionInput, tIdx: number) =>
    buildTransactionNode(tx, tIdx, tooltipTreeStyles)
  );

  return {
    id: 'txs-root',
    label: txFolders.length > 1 ? 'Transactions' : 'Transaction',
    type: 'folder',
    open: true,
    children: txFolders
  };
}