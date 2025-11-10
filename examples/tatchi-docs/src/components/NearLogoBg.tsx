import NearLogo from './icons/NearLogo'

/**
 * Semi-translucent NEAR logo background overlay for the right layout column.
 * Uses inline SVG so we can theme via CSS (currentColor).
 */
export function NearLogoBg() {
  return (
    <div className="near-logo-bg" aria-hidden>
      <NearLogo className="near-logo-bg__svg" aria-hidden />
    </div>
  )
}

export default NearLogoBg
