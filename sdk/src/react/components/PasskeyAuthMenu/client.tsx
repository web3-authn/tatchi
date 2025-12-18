import React from 'react';
import { ArrowLeftIcon, MailIcon } from './ui/icons';
import { SegmentedControl } from './ui/SegmentedControl';
import { PasskeyInput } from './ui/PasskeyInput';
import { ContentSwitcher } from './ui/ContentSwitcher';
import { EmailRecoverySlide } from './ui/EmailRecoverySlide';
import QRCodeIcon from '../QRCodeIcon';
import { AuthMenuMode, type PasskeyAuthMenuProps } from './types';
import './PasskeyAuthMenu.css';
import { usePasskeyAuthMenuRuntime } from './adapters/tatchi';
import { usePasskeyAuthMenuController } from './controller/usePasskeyAuthMenuController';

const LazyShowQRCode = React.lazy(() =>
  import('../ShowQRCode').then((m) => ({ default: m.ShowQRCode })),
);

const preloadShowQRCode = () => import('../ShowQRCode').then(() => undefined);

export const PasskeyAuthMenuClient: React.FC<PasskeyAuthMenuProps> = ({
  onLogin,
  onRegister,
  onRecoverAccount,
  linkDeviceOptions,
  emailRecoveryOptions,
  header,
  defaultMode,
  style,
  className,
  socialLogin,
  loadingScreenDelayMs,
  headings,
}) => {
  const runtime = usePasskeyAuthMenuRuntime();
  const controller = usePasskeyAuthMenuController(
    {
      onLogin,
      onRegister,
      onRecoverAccount,
      defaultMode,
      headings,
      linkDeviceOptions,
    },
    runtime,
  );

  const prefetchQRCode = React.useCallback(() => {
    void preloadShowQRCode().catch(() => {});
  }, []);

  const segActiveBg = 'var(--w3a-passkey-auth-menu2-seg-active-bg)';

  return (
    <div
      className={`w3a-signup-menu-root${className ? ` ${className}` : ''}`}
      data-mode={controller.mode}
      data-waiting={controller.waiting}
      data-scan-device={controller.showScanDevice}
      data-email-recovery={controller.showEmailRecovery}
      style={{
        ...style,
        ['--w3a-waiting-delay' as any]:
          loadingScreenDelayMs != null ? `${loadingScreenDelayMs}ms` : undefined,
      }}
    >
      <ContentSwitcher
        waiting={controller.waiting}
        waitingText={
          controller.mode === AuthMenuMode.Register
            ? 'Registering passkey…'
            : 'Waiting for Passkey…'
        }
        backButton={
          <button
            aria-label="Back"
            onClick={() => {
              if (controller.showEmailRecovery) {
                controller.closeEmailRecovery();
                return;
              }
              controller.onResetToStart();
            }}
            className={`w3a-back-button${controller.waiting || controller.showScanDevice || controller.showEmailRecovery ? ' is-visible' : ''}`}
          >
            <ArrowLeftIcon size={18} strokeWidth={2.25} style={{ display: 'block' }} />
          </button>
        }
        showScanDevice={controller.showScanDevice}
        showQRCodeElement={
          <React.Suspense fallback={<div className="qr-loading"><p>Loading QR…</p></div>}>
            <LazyShowQRCode
              isOpen={controller.linkDevice.isOpen}
              onClose={controller.linkDevice.onClose}
              onEvent={controller.linkDevice.onEvent}
              onError={controller.linkDevice.onError}
            />
          </React.Suspense>
        }
        showEmailRecovery={controller.showEmailRecovery}
        emailRecoveryElement={
          <EmailRecoverySlide
            tatchiPasskey={runtime.tatchiPasskey}
            accountId={runtime.targetAccountId}
            refreshLoginState={runtime.refreshLoginState}
            emailRecoveryOptions={emailRecoveryOptions}
          />
        }
      >
        <div className="w3a-header">
          {header ?? (
            <div>
              <div className="w3a-title">{controller.title.title}</div>
              <div className="w3a-subhead">{controller.title.subtitle}</div>
            </div>
          )}
        </div>

        <PasskeyInput
          value={controller.currentValue}
          onChange={controller.onInputChange}
          placeholder={
            controller.mode === AuthMenuMode.Register
              ? 'Pick a username'
              : controller.mode === AuthMenuMode.Recover
                ? 'Leave blank to discover accounts'
                : 'Enter your username'
          }
          postfixText={controller.postfixText}
          isUsingExistingAccount={controller.isUsingExistingAccount}
          canProceed={controller.canShowContinue}
          onProceed={controller.onProceed}
          mode={controller.mode}
          secure={controller.secure}
          waiting={controller.waiting}
        />

        <SegmentedControl
          items={[
            { value: AuthMenuMode.Register, label: 'Register', className: 'register' },
            { value: AuthMenuMode.Login, label: 'Login', className: 'login' },
            { value: AuthMenuMode.Recover, label: 'Recover', className: 'recover' },
          ]}
          value={controller.mode}
          onValueChange={(v) => controller.onSegmentChange(v as AuthMenuMode)}
          activeBg={segActiveBg}
        />

        <div className="w3a-seg-help-row">
          <div className="w3a-seg-help" aria-live="polite">
            {controller.mode === AuthMenuMode.Login && 'Sign in with your passkey'}
            {controller.mode === AuthMenuMode.Register && 'Create a new account'}
            {controller.mode === AuthMenuMode.Recover && 'Recover account (iCloud/Chrome sync)'}
          </div>
        </div>

        <div className="w3a-scan-device-row">
          <div className="w3a-section-divider">
            <span className="w3a-section-divider-text">Already have an account?</span>
          </div>
          <div className="w3a-secondary-actions">
            <button
              onClick={controller.openScanDevice}
              onPointerEnter={prefetchQRCode}
              onFocus={prefetchQRCode}
              onTouchStart={prefetchQRCode}
              className="w3a-link-device-btn"
            >
              <QRCodeIcon width={18} height={18} strokeWidth={2} />
              Scan and Link Device
            </button>
            <button
              onClick={controller.openEmailRecovery}
              className="w3a-link-device-btn"
            >
              <MailIcon size={18} strokeWidth={2} style={{ display: 'block' }} />
              Recover Account with Email
            </button>
          </div>
        </div>
      </ContentSwitcher>
    </div>
  );
};

export default PasskeyAuthMenuClient;
