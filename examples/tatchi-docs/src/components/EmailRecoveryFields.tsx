import React from 'react';

export interface EmailRecoveryFieldsProps {
  value?: string[];
  onChange?: (emails: string[]) => void;
  disabled?: boolean;
  onChainHashes?: string[];
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
    <div className="email-recovery-fields">
      {emails.map((email, idx) => (
        <div key={idx} className="email-recovery-fields__row">
          <input
            type="email"
            value={email}
            disabled={disabled}
            onChange={e => handleChange(idx, e.target.value)}
            placeholder="recovery@example.com"
            className="email-recovery-fields__input"
          />
          <button
            type="button"
            onClick={() => handleRemove(idx)}
            disabled={disabled}
            aria-label="Remove email"
            className="email-recovery-fields__icon-btn"
          >
            ×
          </button>
        </div>
      ))}
      <div className="email-recovery-fields__actions">
        <button
          type="button"
          onClick={handleAdd}
          disabled={disabled}
          aria-label="Add recovery email"
          className="email-recovery-fields__add-btn"
        >
          + add email
        </button>
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
