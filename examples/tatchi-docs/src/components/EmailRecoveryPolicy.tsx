import React from 'react';

import { LoadingButton } from './LoadingButton';

export interface EmailRecoveryPolicyProps {
  minRequiredEmails: string;
  onChangeMinRequiredEmails: (next: string) => void;
  maxAgeMinutes: string;
  onChangeMaxAgeMinutes: (next: string) => void;
  disabled?: boolean;
  loading?: boolean;
  onSubmit: () => void;
}

export const EmailRecoveryPolicy: React.FC<EmailRecoveryPolicyProps> = ({
  minRequiredEmails,
  onChangeMinRequiredEmails,
  maxAgeMinutes,
  onChangeMaxAgeMinutes,
  disabled = false,
  loading = false,
  onSubmit,
}) => {
  return (
    <div style={{
      marginTop: '1.5rem',
      paddingTop: '1.5rem',
      borderTop: '1px solid var(--w3a-colors-borderPrimary)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      maxWidth: 480
    }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13, opacity: 0.9 }}>No. Required Emails</span>
        <input
          type="number"
          min={1}
          step={1}
          value={minRequiredEmails}
          onChange={e => onChangeMinRequiredEmails(e.target.value)}
          disabled={disabled}
          placeholder="Min required emails"
          style={{
            width: 80,
            padding: '0.25rem 0.5rem',
            borderRadius: 9999,
            border: '1px solid var(--fe-border)',
            background: 'var(--fe-input-bg)',
            color: 'var(--fe-input-text)',
            fontFamily: 'var(--fe-font-sans)',
          }}
        />
        <span style={{ fontSize: 12, opacity: 0.8 }}>Timeout (minutes)</span>
        <input
          type="number"
          min={1}
          step={1}
          value={maxAgeMinutes}
          onChange={e => onChangeMaxAgeMinutes(e.target.value)}
          disabled={disabled}
          placeholder="Max age (minutes)"
          style={{
            width: 80,
            padding: '0.25rem 0.5rem',
            borderRadius: 9999,
            border: '1px solid var(--fe-border)',
            background: 'var(--fe-input-bg)',
            color: 'var(--fe-input-text)',
            fontFamily: 'var(--fe-font-sans)',
          }}
        />
        <LoadingButton
          onClick={onSubmit}
          loading={loading}
          loadingText="Saving..."
          variant="secondary"
          size="small"
          style={{ width: 200 }}
        >
          Set Policy
        </LoadingButton>
      </div>
    </div>
  );
};

export default EmailRecoveryPolicy;
