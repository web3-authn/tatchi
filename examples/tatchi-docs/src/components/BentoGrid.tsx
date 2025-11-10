import { ScanFace, Coffee, ShieldCheck, QrCode, KeyRound } from 'lucide-react';

export function BentoGrid() {
  return (
    <section className="bento-grid" aria-label="Key features">
      <div className="bento-card accent-blue" role="group" aria-labelledby="bento-dev-title">
        <div className="bento-content">
          <Coffee className="bento-icon" aria-hidden />
          <h3 className="bento-title" id="bento-dev-title">Simple UX</h3>
          <p className="bento-desc">No popup windows. Keep full UX control over wallet signing</p>
        </div>
      </div>
      <div className="bento-card accent-blue" role="group" aria-labelledby="bento-flex-title">
        <div className="bento-content">
          <KeyRound className="bento-icon" aria-hidden />
          <h3 className="bento-title" id="bento-flex-title">Serverless Passkeys</h3>
          <p className="bento-desc">No downtime. Serverless webauthn uses VRF challenges with onchain verification</p>
        </div>
      </div>

      <div className="bento-card accent-blue" role="group" aria-labelledby="bento-recovery-title">
        <div className="bento-content">
          <ScanFace className="bento-icon" aria-hidden />
          <h3 className="bento-title" id="bento-recovery-title">Account Recovery</h3>
          <p className="bento-desc">Recover accounts directly from onchain Passkey authenticators with TouchID</p>
        </div>
      </div>
      <div className="bento-card accent-blue" role="group" aria-labelledby="bento-linking-title">
        <div className="bento-content">
          <QrCode className="bento-icon" aria-hidden />
          <h3 className="bento-title" id="bento-linking-title">Scan and Link Devices</h3>
          <p className="bento-desc">Backup accounts across multiple devices with QR scans without intermediaries</p>
        </div>
      </div>
    </section>
  );
}
