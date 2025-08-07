import React from 'react';
import { Link } from 'react-router-dom';

import { usePasskeyContext, ProfileSettingsButton } from '@web3authn/passkey/react';

export const Navbar: React.FC = () => {

  const { loginState } = usePasskeyContext();

  return (
    <nav className="navbar-container">
      <div className="navbar-title">
        <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          Web3Authn Passkeys
        </Link>
      </div>

      <div className="navbar-links" style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
        <Link to="/" style={{ textDecoration: 'none', color: '#666', fontSize: '14px' }}>
          Home
        </Link>
      </div>

      {
        loginState.isLoggedIn &&
        <ProfileSettingsButton
          username={loginState.nearAccountId}
          onLogout={() => {}}
        />
      }
    </nav>
  );
};