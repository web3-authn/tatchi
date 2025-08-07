
export const UserDetails = ({
  username,
  fullAccountId,
  isOpen,
  nearExplorerBaseUrl
}: {
  username: string;
  fullAccountId?: string;
  isOpen: boolean;
  nearExplorerBaseUrl?: string;
}) => {
  // Use the full account ID if provided, otherwise fall back to constructed version
  const displayAccountId = fullAccountId || `${username}`;

  return (
    <div className="web3authn-profile-dropdown-user-details">
      <p className="web3authn-profile-dropdown-username">
        {username || 'User'}
      </p>
      <a
        href={username ? `${nearExplorerBaseUrl}/address/${displayAccountId}` : '#'}
        target="_blank"
        rel="noopener noreferrer"
        className={`web3authn-profile-dropdown-account-id ${isOpen ? 'visible' : 'hidden'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {displayAccountId || 'user@example.com'}
      </a>
    </div>
  );
};