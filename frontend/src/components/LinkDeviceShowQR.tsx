import { ShowQRCode } from '@web3authn/passkey/react';
import { useTheme } from '@web3authn/passkey/react';
import './LinkDeviceShowQR.css';

export function LinkDeviceShowQR() {
  const { theme, isDark } = useTheme();

  return (
    <div className={`link-device-wrapper ${theme}-theme ${isDark ? 'dark' : 'light'}`}>
      <ShowQRCode />
    </div>
  );
}