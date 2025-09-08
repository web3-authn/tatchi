import { ShowQRCode } from '@web3authn/passkey/react';
import { useTheme } from '@web3authn/passkey/react';

export function LinkDeviceShowQR() {
  const { theme, isDark } = useTheme();

  return (
    <div className={`${theme}-theme ${isDark ? 'dark' : 'light'}`}
      style={{
        width: '100%',
        maxWidth: '400px',
        margin: '0 auto',
      }}
    >
      <ShowQRCode />
    </div>
  );
}