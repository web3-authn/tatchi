import TouchIcon from "./icons/TouchIcon"
import { HaloBorder } from "./HaloBorder"
import LitHaloBorder from "../LitHaloBorder"
import { useTheme } from "../theme";

interface PasskeyHaloLoadingProps {
  style?: React.CSSProperties;
  className?: string;
  height?: number;
  width?: number;
  innerPadding?: number;
}

export const PasskeyHaloLoading: React.FC<PasskeyHaloLoadingProps> = ({
  style = {},
  className = '',
  height = 24,
  width = 24,
  innerPadding = 5,
}) => {
  const { theme } = useTheme();
  return (
    <div className={`w3a-passkey-loading-root ${theme} ${className}`} style={style}>
      <LitHaloBorder
        theme={theme}
        animated={true}
        ringGap={4}
        ringWidth={4}
        ringBorderRadius="1.5rem"
        innerPadding={`${innerPadding}px`}
        innerBackground="var(--w3a-colors-surface)"
        ringBackground={
          theme === 'dark'
          ? `transparent 0%, var(--w3a-colors-green400) 10%, var(--w3a-colors-green500) 25%, transparent 35%`
          : `transparent 0%, var(--w3a-colors-blue400) 10%, var(--w3a-colors-blue500) 25%, transparent 35%`
        }
      >
        <div
          className="w3a-passkey-loading-touch-icon-container"
          style={{
            display: 'grid',
            placeItems: 'center',
            backgroundColor: 'var(--w3a-colors-colorBackground)',
            borderRadius: '1.25rem',
            width: 'fit-content',
            height: 'fit-content',
          }}
        >
          <TouchIcon
            height={height}
            width={width}
            strokeWidth={4}
            style={{
              color: 'var(--w3a-colors-textSecondary)',
              margin: '0.75rem',
            }}
          />
        </div>
      </LitHaloBorder>
    </div>
  )
}

export default PasskeyHaloLoading;
