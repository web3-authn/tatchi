import React from 'react'

export type TatchiLogoProps = React.SVGProps<SVGSVGElement> & {
  size?: number | string
  strokeWidth?: number
}

const TatchiLogo: React.FC<TatchiLogoProps> = ({
  size = 24,
  strokeWidth = 1,
  className,
  ...rest
}) => {
  // Use a group transform to scale the TouchIcon path to fit the center circle (r=3)
  // of the orbit icon. Scaling around (12,12) keeps it centered.
  // Slightly larger than the original center circle (r=3)
  // to make the fingerprint more prominent relative to the orbit
  const scale = 0.6

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={[
        'lucide',
        'lucide-orbit-icon',
        'lucide-orbit',
        'tatchi-logo-icon',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
      {...rest}
    >
      {/* Orbit paths and satellites (from favicon.svg), but without the center circle */}
      <path d="M20.341 6.484A10 10 0 0 1 10.266 21.85" pathLength={1} style={{ strokeWidth: 1 }} />
      <path d="M3.659 17.516A10 10 0 0 1 13.74 2.152" pathLength={1} style={{ strokeWidth: 1 }} />
      <circle cx="19" cy="5" r="2" pathLength={1} style={{ strokeWidth: 1 }} />
      <circle cx="5" cy="19" r="2" pathLength={1} style={{ strokeWidth: 1 }} />

      {/* TouchIcon path scaled to fit inside the center where the circle (r=3) was */}
      <g transform={`translate(12 12) scale(${scale}) translate(-12 -12)`}>
        <path
          className="tatchi-logo--fingerprint"
          d="M6.40519 19.0481C6.58912 18.6051 6.75832 18.1545 6.91219 17.6969M14.3433 20.6926C14.6095 19.9418 14.8456 19.1768 15.0502 18.399C15.2359 17.6934 15.3956 16.9772 15.5283 16.2516M19.4477 17.0583C19.8121 15.0944 20.0026 13.0694 20.0026 11C20.0026 6.58172 16.4209 3 12.0026 3C10.7472 3 9.55932 3.28918 8.50195 3.80456M3.52344 15.0245C3.83663 13.7343 4.00262 12.3865 4.00262 11C4.00262 9.25969 4.55832 7.64917 5.50195 6.33621M12.003 11C12.003 13.7604 11.5557 16.4163 10.7295 18.8992C10.5169 19.5381 10.2792 20.1655 10.0176 20.7803M7.71227 14.5C7.90323 13.3618 8.00262 12.1925 8.00262 11C8.00262 8.79086 9.79348 7 12.0026 7C14.2118 7 16.0026 8.79086 16.0026 11C16.0026 11.6166 15.9834 12.2287 15.9455 12.8357"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          pathLength={1}
        />
      </g>
    </svg>
  )
}

export default TatchiLogo
