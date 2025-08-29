import type { TransactionInput } from '../../../types/actions';
import { formatArgs, formatGas, formatDeposit } from '../renderUtils';

export type TreeNodeType = 'folder' | 'file';

export interface TreeNode {
  id: string;
  label: string;
  type: TreeNodeType;
  open?: boolean;
  /**
   * Optional content for the node. When provided on a 'file' node,
   * it will be shown inside a collapsible details section.
   */
  content?: string;
  children?: TreeNode[];
}

// Pure builder that converts a TransactionInput into a TreeNode action subtree
// Consumers can inject a formatter for complex fields (e.g., args pretty JSON)
export function buildActionTree(tx: TransactionInput, highlightMethodNameColor?: string): TreeNode {
  const actionFolders: TreeNode[] = tx.actions.map((action: any, idx: number) => {

    const label = `Action ${idx + 1}: ${action.type}`;

    const fieldNodes: TreeNode[] = (() => {
      if (action.type === 'FunctionCall') {
        return [
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
            label: 'args',
            type: 'file',
            open: true,
            content: formatArgs(action.args)
          }
        ];
      }
      if (action.type === 'Transfer') {
        return [
          { id: `a${idx}-amount`, label: `amount: ${action.amount}`, type: 'file' }
        ];
      }
      if (action.type === 'CreateAccount') {
        return [];
      }
      if (action.type === 'DeployContract') {
        const code = (action as any).code;
        const codeSize = (() => {
          if (!code) return '0 bytes';
          if (code instanceof Uint8Array) return `${code.byteLength} bytes`;
          if (Array.isArray(code)) return `${code.length} bytes`;
          if (typeof code === 'string') return `${code.length} bytes`;
          return 'unknown';
        })();
        return [
          { id: `a${idx}-code-size`, label: `codeSize: ${codeSize}`, type: 'file' }
        ];
      }
      if (action.type === 'Stake') {
        const a: any = action;
        return [
          { id: `a${idx}-publicKey`, label: `publicKey: ${a.publicKey}`, type: 'file' },
          { id: `a${idx}-stake`, label: `stake: ${a.stake}`, type: 'file' }
        ];
      }
      if (action.type === 'AddKey') {
        const ak = action.accessKey;
        let akPretty = '';
        try { akPretty = JSON.stringify(ak, null, 2); } catch { akPretty = String(ak); }
        return [
          { id: `a${idx}-publicKey`, label: `publicKey: ${action.publicKey}`, type: 'file' },
          { id: `a${idx}-accessKey`, label: 'accessKey', type: 'file', content: akPretty }
        ];
      }
      if (action.type === 'DeleteKey') {
        return [
          { id: `a${idx}-publicKey`, label: `publicKey: ${action.publicKey}`, type: 'file' }
        ];
      }
      if (action.type === 'DeleteAccount') {
        return [
          { id: `a${idx}-beneficiaryId`, label: `beneficiaryId: ${action.beneficiaryId}`, type: 'file' }
        ];
      }
      // Unknown action
      let raw = '';
      try { raw = JSON.stringify(action, null, 2); } catch { raw = String(action); }
      return [{
        id: `a${idx}-raw`,
        label: 'data',
        type: 'file',
        open: true,
        content: raw
      }];
    })();

    return {
      id: `action-${idx}`,
      label,
      type: 'folder',
      open: true,
      children: fieldNodes
    } as TreeNode;
  });

  return {
    id: 'tx-root',
    label: actionFolders.length > 1 ? 'Transaction' : 'Action',
    type: 'folder',
    open: true,
    children: actionFolders
  } as TreeNode;
}