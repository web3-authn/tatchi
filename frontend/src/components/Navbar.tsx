import React from 'react';
import { Link } from 'react-router-dom';

import { usePasskeyContext, ProfileSettingsButton } from '@web3authn/passkey/react';

export const Navbar: React.FC = () => {
  const { loginState } = usePasskeyContext();

  return (
    <nav className="navbar-container">
      <div className="navbar-title">
        <Link to="/">
          Web3Authn Passkeys
        </Link>
      </div>

      <div className="navbar-links">
        <Link to="/">
          Home
        </Link>
        <Link to="/settings">
          Settings
        </Link>
        <Link to="/embedded">
          Embedded Demo
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