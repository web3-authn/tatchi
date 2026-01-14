import { ScanFace, Coffee, ShieldCheck, QrCode, KeyRound } from 'lucide-react';

export function BentoGrid() {
  return (
    <section className="bento-grid" aria-label="Key features">
      <div className="bento-card accent-blue" role="group" aria-labelledby="bento-flex-title">
        <div className="bento-content">
          <Coffee className="bento-icon" aria-hidden />
          <h3 className="bento-title" id="bento-flex-title">Simple and Serverless</h3>
          <p className="bento-desc">Simple to get started. Passkey authenticates with onchain contract, no backend needed</p>
        </div>
      </div>
      <div className="bento-card accent-blue" role="group" aria-labelledby="bento-dev-title">
        <div className="bento-content">
          <KeyRound className="bento-icon" aria-hidden />
          <h3 className="bento-title" id="bento-dev-title">Flexible UX</h3>
          <p className="bento-desc">No popup windows. No browser extensions. Keep full UX control over wallet signing flows.</p>
        </div>
      </div>

      <div className="bento-card accent-blue" role="group" aria-labelledby="bento-sync-title">
        <div className="bento-content">
          <ScanFace className="bento-icon" aria-hidden />
          <h3 className="bento-title" id="bento-sync-title">Account Sync</h3>
          <p className="bento-desc">Sync accounts directly from onchain Passkey authenticators with TouchID</p>
        </div>
      </div>
      <div className="bento-card accent-blue" role="group" aria-labelledby="bento-linking-title">
        <div className="bento-content">
          <QrCode className="bento-icon" aria-hidden />
          <h3 className="bento-title" id="bento-linking-title">Scan and Link Devices</h3>
          <p className="bento-desc">Backup accounts across multiple devices with QR scans without intermediaries.</p>
        </div>
      </div>
    </section>
  );
}
