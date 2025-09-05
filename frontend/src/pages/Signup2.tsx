import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';

import {
  SignupMenu,
  usePasskeyContext,
  RegistrationPhase,
  RegistrationStatus,
  LoginPhase,
  type RegistrationSSEEvent,
} from '@web3authn/passkey/react';

import { GlassBorder } from '../components/GlassBorder';
import { usePostfixPosition } from '../hooks/usePostfixPosition';
import '../components/PasskeyLoginMenu.css';

export function Signup2() {
  const {
    accountInputState: {
      inputUsername,
      targetAccountId,
      displayPostfix,
      isUsingExistingAccount,
      accountExists,
    },
    setInputUsername,
    loginPasskey,
    registerPasskey,
    useRelayer,
  } = usePasskeyContext();

  // Always show the menu on this page; the X resets its own state
  const [open] = useState(true);
  const [isSecureContext] = useState(() => window.isSecureContext);

  const usernameInputRef = useRef<HTMLInputElement>(null);
  const postfixRef = useRef<HTMLSpanElement>(null);
  usePostfixPosition({ inputRef: usernameInputRef, postfixRef, inputValue: inputUsername });

  const handleLocalUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputUsername(e.target.value);
  };

  return (
    <main style={{ display: 'flex', justifyContent: 'center', paddingTop: '10vh' }}>
      {open && (
        <SignupMenu
          title="Sign In"
          defaultMode={accountExists ? 'login' : 'register'}
          onBeginPasskeyLogin={(mode) => console.log('Begin passkey flow:', mode)}
        />
      )}
    </main>
  );
}

export default Signup2;
