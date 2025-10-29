import React, { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ActionPhase,
  ActionType,
  TouchIdWithText,
  TxExecutionStatus,
  usePasskeyContext,
} from '@tatchi-xyz/sdk/react';
import { SendTxButtonWithTooltip } from '@tatchi-xyz/sdk/react';
import type { ActionArgs } from '@tatchi-xyz/sdk/react';
import { WEBAUTHN_CONTRACT_ID, NEAR_EXPLORER_BASE_URL } from '../config';
import { GlassBorder } from './GlassBorder';


interface EmbeddedTxButtonProps {
};

export const EmbeddedTxButton: React.FC<EmbeddedTxButtonProps> = ({  }) => {

  const {
    loginState: { isLoggedIn, nearAccountId },
  } = usePasskeyContext();

  const [embeddedGreetingInput, setEmbeddedGreetingInput] = useState('Hello from Embedded Component!');

  const createEmbeddedGreetingAction = useCallback((): ActionArgs => {
    const newGreetingMessage = `${embeddedGreetingInput.trim()} [updated: ${new Date().toLocaleTimeString()}]`;
    return {
      type: ActionType.FunctionCall,
      methodName: 'set_greeting',
      args: { greeting: newGreetingMessage },
      gas: '30000000000000',
      deposit: '0',
    };
  }, [embeddedGreetingInput]);

  if (!isLoggedIn || !nearAccountId) {
    return null;
  }

  return (
    <GlassBorder
      style={{ marginTop: '1rem', zIndex: 2 }}
      className="section-root"
    >
      <div className="section-container">
        <h2 className="section-title">
          Example 2: Embedded Tx Button
        </h2>
        <p className="section-caption">
          Or import the iframe button from the SDK directly.
          <br/>
          It's hosted in a cross-origin iframe for security
          and validates the digest hash of the
          tx being signed in the tooltip.
        </p>
      </div>

      <div className="section-container">
        <input
          type="text"
          className="embedded-tx-input"
          value={embeddedGreetingInput}
          onChange={(e) => setEmbeddedGreetingInput(e.target.value)}
          placeholder="Enter your greeting message"
        />
      </div>

      <div className="section-container">
        <SendTxButtonWithTooltip
          nearAccountId={nearAccountId}
          txSigningRequests={[
            {
              receiverId: WEBAUTHN_CONTRACT_ID,
              actions: [
                createEmbeddedGreetingAction(),
                {
                  type: ActionType.Transfer,
                  amount: '100000000000000000000',
                },
              ],
            },
            {
              receiverId: WEBAUTHN_CONTRACT_ID,
              actions: [
                {
                  type: ActionType.Transfer,
                  amount: '200000000000000000000',
                },
              ],
            },
          ]}
          onEvent={(event: any) => {
            switch (event.phase) {
              case ActionPhase.STEP_1_PREPARATION:
              case ActionPhase.STEP_2_USER_CONFIRMATION:
              case ActionPhase.STEP_3_CONTRACT_VERIFICATION:
                toast.loading(event.message, { id: 'embedded' });
                break;
              case ActionPhase.STEP_4_WEBAUTHN_AUTHENTICATION:
              case ActionPhase.STEP_5_AUTHENTICATION_COMPLETE:
              case ActionPhase.STEP_6_TRANSACTION_SIGNING_PROGRESS:
              case ActionPhase.STEP_7_TRANSACTION_SIGNING_COMPLETE:
              case ActionPhase.STEP_8_BROADCASTING:
                toast.loading(event.message, { id: 'embedded' });
                break;
              case ActionPhase.STEP_9_ACTION_COMPLETE:
                toast.success(event.message, { id: 'embedded' });
                break;
              case ActionPhase.ACTION_ERROR:
              case ActionPhase.WASM_ERROR:
                toast.error(`Transaction failed: ${event.error}`, { id: 'embedded' });
                break;
            }
          }}
          options={{
            beforeCall: () => {},
            waitUntil: TxExecutionStatus.EXECUTED_OPTIMISTIC,
            afterCall: (success: boolean, result?: any) => {
              const extractTxId = (res: any): string | undefined => {
                if (Array.isArray(res)) {
                  const last = res[res.length - 1] ?? res[0];
                  return last?.transactionId;
                }
                return res?.transactionId;
              };

              if (success) {
                const txId = extractTxId(result);
                if (txId) {
                  const txLink = `${NEAR_EXPLORER_BASE_URL}/transactions/${txId}`;
                  toast.success(
                    (
                      <span>
                        Embedded flow complete.{' '}
                        <a href={txLink} target="_blank" rel="noopener noreferrer">View transaction</a>
                      </span>
                    ),
                    { id: 'embedded' }
                  );
                } else {
                  toast.success('Embedded flow success (no TxID)', { id: 'embedded' });
                }
              } else {
                const errMsg = result?.error || 'Unknown error';
                toast.error(`Embedded flow failed: ${errMsg}`, { id: 'embedded' });
              }
            },
            onError: (error: any) => console.error(error),
          }}
          buttonStyle={{
            color: 'white',
            background: 'var(--w3a-colors-primary)',
            borderRadius: '2rem',
            border: 'none',
            boxShadow: '0px 0px 3px 1px rgba(0, 0, 0, 0.1)',
            fontSize: '16px',
            height: '44px',
            width: '480px',
          }}
          buttonHoverStyle={{
            background: 'var(--w3a-colors-primaryHover)',
            boxShadow: '0px 0px 4px 2px rgba(0, 0, 0, 0.2)',
          }}
          tooltipPosition={{
            height: 'auto',
            position: 'bottom-left',
          }}
          txTreeTheme="light"
          buttonTextElement={<TouchIdWithText buttonText="Send Transaction" />}
          onCancel={() => console.log("cancelled Tx")}
        />
      </div>
    </GlassBorder>
  );
};

export default EmbeddedTxButton;
