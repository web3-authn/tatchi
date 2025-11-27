import React from 'react';

export interface EmailRecoveryFieldsProps {
  value?: string[];
  onChange?: (emails: string[]) => void;
  disabled?: boolean;
  onChainHashes?: string[];
  onClear?: () => void;
}

/**
 * EmailRecoveryFields
 * Simple controlled/uncontrolled list of email inputs with:
 * - "+" button to add new fields
 * - "×" button per field to remove it
 */
export const EmailRecoveryFields: React.FC<EmailRecoveryFieldsProps> = ({
  value,
  onChange,
  disabled = false,
  onChainHashes = [],
  onClear,
}) => {
  const [internalEmails, setInternalEmails] = React.useState<string[]>(['']);

  const emails = value ?? internalEmails;

  const updateEmails = (next: string[]) => {
    if (onChange) {
      onChange(next);
    }
    if (value === undefined) {
      setInternalEmails(next);
    }
  };

  const handleAdd = () => {
    if (disabled) return;
    updateEmails([...emails, '']);
  };

  const handleChange = (index: number, nextValue: string) => {
    const next = emails.slice();
    next[index] = nextValue;
    updateEmails(next);
  };

  const handleRemove = (index: number) => {
    if (disabled) return;
    if (emails.length === 1) {
      // Keep at least one empty field for UX
      updateEmails(['']);
      return;
    }
    const next = emails.filter((_, i) => i !== index);
    updateEmails(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {emails.map((email, idx) => (
        <div
          key={idx}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <input
            type="email"
            value={email}
            disabled={disabled}
            onChange={e => handleChange(idx, e.target.value)}
            placeholder="recovery@example.com"
            style={{
              flex: 1,
              padding: '0.4rem 0.75rem',
              borderRadius: 9999,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(11,15,25,0.85)',
              color: 'inherit',
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={() => handleRemove(idx)}
            disabled={disabled}
            aria-label="Remove email"
            style={{
              width: 32,
              height: 32,
              borderRadius: 9999,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'transparent',
              color: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: disabled ? 'default' : 'pointer',
            }}
          >
            ×
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          onClick={handleAdd}
          disabled={disabled}
          aria-label="Add recovery email"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.18)',
            background: 'transparent',
            color: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: disabled ? 'default' : 'pointer',
          }}
        >
          +
        </button>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            aria-label="Clear recovery emails"
            style={{
              padding: '0.25rem 0.75rem',
              borderRadius: 9999,
              border: '1px solid rgba(239,68,68,0.8)',
              background: 'rgba(127,29,29,0.2)',
              color: 'rgb(248,113,113)',
              fontSize: 12,
              cursor: disabled ? 'default' : 'pointer',
            }}
          >
            Clear emails
          </button>
        )}
      </div>
      {onChainHashes.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.85 }}>On-chain recovery emails</div>
          <ul style={{ margin: 4, paddingLeft: 16, fontSize: 11 }}>
            {onChainHashes.map((hash, idx) => (
              <li
                key={idx}
                style={{
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                  opacity: 0.9,
                }}
              >
                {hash}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default EmailRecoveryFields;
