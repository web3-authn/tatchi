import { PanelsTopLeft, Boxes, Cog, Code } from 'lucide-react';

export function BentoGrid() {
  return (
    <section className="bento-grid" aria-label="Key features">
      <div className="bento-card accent-pink" role="group" aria-labelledby="bento-dev-title">
        <div className="bento-content">
          <PanelsTopLeft className="bento-icon" aria-hidden />
          <h3 className="bento-title" id="bento-dev-title">Developer First</h3>
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
      <div className="bento-card accent-teal" role="group" aria-labelledby="bento-simple-title">
        <div className="bento-content">
          <Cog className="bento-icon" aria-hidden />
          <h3 className="bento-title" id="bento-simple-title">Simple & modular</h3>
          <p className="bento-desc">Open source. Use just the parts you need.</p>
        </div>
      </div>
      <div className="bento-card accent-blue" role="group" aria-labelledby="bento-prog-title">
        <div className="bento-content">
          <Code className="bento-icon" aria-hidden />
          <h3 className="bento-title" id="bento-prog-title">Programmable</h3>
          <p className="bento-desc">Integrate flows, tooltips, and confirmations in your app.</p>
        </div>
      </div>
    </section>
  );
}

