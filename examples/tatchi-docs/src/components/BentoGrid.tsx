import { PanelsTopLeft, Boxes, ShieldCheck, QrCode } from 'lucide-react';

export function BentoGrid() {
  return (
    <section className="bento-grid" aria-label="Key features">
      <div className="bento-card accent-pink" role="group" aria-labelledby="bento-dev-title">
        <div className="bento-content">
          <PanelsTopLeft className="bento-icon" aria-hidden />
          <h3 className="bento-title" id="bento-dev-title">UX Focused</h3>
          <p className="bento-desc">No selectors or popups. Embed and keep full UX control.</p>
        </div>
      </div>
      <div className="bento-card accent-orange" role="group" aria-labelledby="bento-flex-title">
        <div className="bento-content">
          <Boxes className="bento-icon" aria-hidden />
          <h3 className="bento-title" id="bento-flex-title">Serverless WebAuthn</h3>
          <p className="bento-desc">VRF‑based challenges replace centralized verifiers.</p>
        </div>
      </div>

      <div className="bento-card accent-teal" role="group" aria-labelledby="bento-recovery-title">
        <div className="bento-content">
          <ShieldCheck className="bento-icon" aria-hidden />
          <h3 className="bento-title" id="bento-recovery-title">Serverless Account Recovery</h3>
          <p className="bento-desc">Onchain account backups without intermediaries.</p>
        </div>
      </div>
      <div className="bento-card accent-blue" role="group" aria-labelledby="bento-linking-title">
        <div className="bento-content">
          <QrCode className="bento-icon" aria-hidden />
          <h3 className="bento-title" id="bento-linking-title">Device Linking</h3>
          <p className="bento-desc">Backup accounts across multiple devices with QR scans. Never lose access to your account.</p>
        </div>
      </div>
    </section>
  );
}
