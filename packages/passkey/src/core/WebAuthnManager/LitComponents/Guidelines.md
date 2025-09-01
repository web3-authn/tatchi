# Glass Design System Guidelines

This project uses a sophisticated glass/frosted glass design system with specific styling patterns and components. The system supports both light and dark modes with consistent visual effects.

## General Guidelines

- Use glass morphism effects with backdrop-blur and layered transparency
- Maintain the specific color palette and opacity values outlined below
- Preserve the exact border-radius relationships between layered elements
- Use the DotsBackground component for consistent dot pattern backgrounds
- Apply metallic chrome effects for special interactive elements like icon buttons
- Support both light and dark themes with appropriate color adjustments

## Color System

### Light Mode

#### Background Colors

- **Primary Background**: `oklch(0.88 0 0)` (light gray) - Main page background
- **Glass White Overlays**:
  - Primary glass: `rgba(255, 255, 255, 0.6)` (60% white opacity)
  - Secondary glass: `rgba(255, 255, 255, 0.15)` (15% white opacity)
  - Button glass: `rgba(255, 255, 255, 0.75)` (75% white opacity)

#### Text Colors

- **Primary Text**: `oklch(0 0 0)` - Main headings
- **Secondary Text**: `oklch(0.5 0.02 240)` - Descriptive text and labels
- **Button Text**: `oklch(0.4 0.02 220)` - Button labels

### Dark Mode

#### Background Colors

- **Primary Background**: `oklch(0.1 0 0)` (dark charcoal) - Main page background
- **Glass Dark Overlays**:
  - Primary glass: `rgba(255, 255, 255, 0.08)` (8% white opacity)
  - Secondary glass: `rgba(255, 255, 255, 0.05)` (5% white opacity)
  - Button glass: `rgba(255, 255, 255, 0.1)` (10% white opacity)

#### Text Colors

- **Primary Text**: `oklch(1 0 0)` - Main headings
- **Secondary Text**: `oklch(0.53 0 0)` - Descriptive text and labels
- **Button Text**: `oklch(0.8 0 0)` - Button labels

## Border Radius System

### Layered Glass Components

- **Outer Glass Layer**: `32px` border-radius
- **Inner Glass Layer**: `24px` border-radius
- **Buttons**: `rounded-full` for suggestion buttons

## Shadow System

### Light Mode Shadows

```css
/* Main card shadow */
boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.08)'

/* Metallic button shadow */
boxShadow: '0 2px 4px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08)'
```

### Dark Mode Shadows

```css
/* Main card shadow */
boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.3)'

/* Metallic button shadow */
boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4), 0 1px 4px rgba(0, 0, 0, 0.3)'

/* Suggestion button shadow */
boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)'
```

## Component Patterns

### Glass Card Container

```tsx
<div className="relative mb-8 max-w-2xl w-full">
  {/* Outer glass border */}
  <div
    className="absolute inset-0 rounded-[32px] backdrop-blur-sm border"
    style={{
      background: isDark
        ? "rgba(255, 255, 255, 0.05)"
        : "rgba(255, 255, 255, 0.15)",
      borderColor: isDark
        ? "rgba(255, 255, 255, 0.1)"
        : "rgba(255, 255, 255, 0.2)",
    }}
  ></div>

  {/* Inner main card */}
  <div
    className="relative backdrop-blur-sm rounded-[24px] px-12 py-28 m-2"
    style={{
      background: isDark
        ? "rgba(255, 255, 255, 0.08)"
        : "rgba(255, 255, 255, 0.6)",
      boxShadow: isDark
        ? "0 8px 32px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.3)"
        : "0 8px 32px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.08)",
    }}
  >
    {/* Content */}
  </div>
</div>
```

### Two-Layer Icon Button Structure

All icon buttons use a sophisticated two-layer design:
1. **Outer Circle**: Gradient background with dark border (2px)
2. **Inner Circle**: Gradient background with no border

### Figma Button (Two-Layer with Rainbow Border in Dark Mode)

```tsx
<button className="transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]">
  <div
    className="w-[54px] h-[54px] rounded-full relative border"
    style={{
      borderColor: isDark ? "oklch(0.2 0 0)" : "oklch(0.8 0 0)",
      background: isDark
        ? "conic-gradient(from 0deg, #ff6b35, #f7931e, #ffd23f, #3dd68c, #00d9ff, #5865f2, #8b5cf6, #ff6b35)"
        : "linear-gradient(180deg, oklch(0.97 0 0) 0%, oklch(0.69 0 0) 25%, oklch(0.91 0 0) 100%)",
      boxShadow: isDark
        ? "0 2px 8px rgba(0, 0, 0, 0.4), 0 1px 4px rgba(0, 0, 0, 0.3)"
        : "0 2px 4px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08)",
      padding: "2px",
    }}
  >
    <div
      className="w-full h-full rounded-full flex items-center justify-center relative z-10"
      style={{
        background: isDark
          ? "linear-gradient(135deg, oklch(0.23 0 0) 0%, oklch(0.1 0 0) 50%, oklch(0.16 0 0) 100%)"
          : "linear-gradient(135deg, oklch(1 0 0) 0%, oklch(0.96 0 0) 50%, oklch(1 0 0) 100%)",
      }}
    >
      <Figma
        className="w-5 h-5"
        style={{ color: isDark ? "oklch(1 0 0)" : "oklch(0 0 0)" }}
        strokeWidth={1.5}
      />
    </div>
  </div>
</button>
```

### GitHub Button (Two-Layer with Metallic Effects)

```tsx
<button className="transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]">
  <div
    className="w-[54px] h-[54px] rounded-full relative border"
    style={{
      borderColor: isDark ? "oklch(0.2 0 0)" : "oklch(0.8 0 0)",
      background: isDark
        ? "linear-gradient(180deg, oklch(0.13 0 0) 0%, oklch(0.25 0 0) 25%, oklch(0.13 0 0) 100%)"
        : "linear-gradient(180deg, oklch(0.97 0 0) 0%, oklch(0.69 0 0) 25%, oklch(0.91 0 0) 100%)",
      boxShadow: isDark
        ? "0 2px 8px rgba(0, 0, 0, 0.4), 0 1px 4px rgba(0, 0, 0, 0.3)"
        : "0 2px 4px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08)",
      padding: "2px",
    }}
  >
    <div
      className="w-full h-full rounded-full flex items-center justify-center relative z-10"
      style={{
        background: isDark
          ? "linear-gradient(135deg, oklch(0.23 0 0) 0%, oklch(0.1 0 0) 50%, oklch(0.16 0 0) 100%)"
          : "linear-gradient(135deg, oklch(1 0 0) 0%, oklch(0.96 0 0) 50%, oklch(1 0 0) 100%)",
      }}
    >
      <Github
        className="w-5 h-5"
        style={{ color: isDark ? "oklch(1 0 0)" : "oklch(0 0 0)" }}
        strokeWidth={1.5}
      />
    </div>
  </div>
</button>
```

### Theme-Aware Suggestion Buttons

```tsx
<button
  className="backdrop-blur-sm rounded-full px-10 py-5 shadow-md transition-colors flex items-center gap-2"
  style={{
    background: isDark
      ? "rgba(255, 255, 255, 0.1)"
      : "rgba(255, 255, 255, 0.75)",
    boxShadow: isDark
      ? "0 4px 16px rgba(0, 0, 0, 0.3)"
      : "0 4px 16px rgba(0, 0, 0, 0.1)",
  }}
  onMouseEnter={(e) => {
    e.currentTarget.style.background = isDark
      ? "rgba(255, 255, 255, 0.15)"
      : "rgba(255, 255, 255, 0.9)";
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.background = isDark
      ? "rgba(255, 255, 255, 0.1)"
      : "rgba(255, 255, 255, 0.75)";
  }}
>
  <span style={{ color: isDark ? "oklch(0.8 0 0)" : "oklch(0.4 0.02 220)" }}>
    Button Text
  </span>
</button>
```

## Typography Guidelines

### Icon Styling

- Use `strokeWidth={1.5}` for all Lucide icons to maintain thin, refined lines
- Icon size: `w-5 h-5` for standard interface icons
- Icon colors: `oklch(0 0 0)` (light mode) / `oklch(1 0 0)` (dark mode)

### Text Positioning

- Use absolute positioning sparingly - mainly for overlay text like "Describe what you want to build"
- Position overlay text with `absolute left-8 top-8` (left: 2rem, top: 2rem)

## Background Components

### DotsBackground

- Grid: 15x15 dots
- Spacing: 19px between dots
- Dot radius: 3px
- Color: `oklch(0.4 0 0)` (same for both light and dark mode)
- Fade effect: Radial from top-left corner with opacity range 0-0.2
- Always position as `absolute inset-0` with full width/height
- Pass `isDark` prop for theme awareness

## Layout Patterns

### Main Container Structure

```tsx
<div
  className={`min-h-screen flex flex-col items-center justify-center p-8 relative overflow-hidden ${isDark ? "dark" : ""}`}
  style={{ backgroundColor: isDark ? "oklch(0.1 0 0)" : "oklch(0.88 0 0)" }}
>
  <DotsBackground isDark={isDark} />
  <div className="relative z-10 flex flex-col items-center w-full max-w-6xl">
    {/* Content */}
  </div>
</div>
```

### Theme Toggle Button

```tsx
<button
  onClick={toggleTheme}
  className="absolute top-8 right-8 z-20 p-3 rounded-full transition-all duration-200"
  style={{
    background: isDark
      ? "rgba(255, 255, 255, 0.1)"
      : "rgba(255, 255, 255, 0.75)",
    backdropFilter: "blur(8px)",
  }}
>
  {isDark ? (
    <Sun
      className="w-5 h-5"
      style={{ color: "oklch(1 0 0)" }}
      strokeWidth={1.5}
    />
  ) : (
    <Moon
      className="w-5 h-5"
      style={{ color: "oklch(0 0 0)" }}
      strokeWidth={1.5}
    />
  )}
</button>
```

## Special Dark Mode Features

### Figma Button Rainbow Gradient

In dark mode, the Figma button features a vibrant conic gradient border:

```css
background: "conic-gradient(from 0deg, #ff6b35, #f7931e, #ffd23f, #3dd68c, #00d9ff, #5865f2, #8b5cf6, #ff6b35)";
```

### Dark Mode Glass Effects

- Reduced opacity values for subtler glass effects
- Stronger shadows for better definition
- Darker inner button backgrounds (`oklch(0.16 0 0)`)
- Adjusted border colors for dark theme compatibility

## Spacing Standards

- Container padding: `py-28` for tall glass cards
- Container margins: `m-2` between glass layers
- Button gaps: `gap-4` for icon button groups
- Card margins: `mb-8` for card spacing

## Interactive Elements

### Hover Effects

- Metallic buttons: `hover:scale-[1.02]` and `active:scale-[0.98]`
- Glass buttons: Different hover backgrounds for light/dark modes
- Transition duration: `transition-all duration-150`
- Theme toggle: `transition-all duration-200`

### Border Specifications

- Light mode glass borders: `rgba(255, 255, 255, 0.2)`
- Dark mode glass borders: `rgba(255, 255, 255, 0.1)`
- **Button outer borders**: `oklch(0.2 0 0)` (dark mode, 1px) / `oklch(0.8 0 0)` (light mode, 1px)
- Button inner circles have no borders for a cleaner appearance

## Button Design Structure

### Two-Layer Architecture

All metallic icon buttons follow a consistent two-layer design pattern:

1. **Outer Circle Layer**:
   - 1px border for definition (subtle colors for both modes)
   - Gradient background (rainbow for Figma in dark mode, metallic for others)
   - 2px padding to create space for inner circle
   - Drop shadows for depth

2. **Inner Circle Layer**:
   - Gradient background with subtle depth
   - No border for clean appearance
   - Houses the icon with proper color contrast

### Button Gradients

#### Outer Circle Backgrounds
- **Figma (Dark)**: Rainbow conic gradient starting from 0deg
- **Figma (Light)**: Metallic linear gradient (180deg)
- **GitHub (Dark)**: Flipped metallic gradient - dark at top/bottom, light in middle
- **GitHub (Light)**: Standard metallic linear gradient (180deg)

#### Inner Circle Backgrounds
- **Dark Mode**: `linear-gradient(135deg, oklch(0.23 0 0) 0%, oklch(0.1 0 0) 50%, oklch(0.16 0 0) 100%)`
- **Light Mode**: `linear-gradient(135deg, oklch(1 0 0) 0%, oklch(0.96 0 0) 50%, oklch(1 0 0) 100%)`

### Button Dimensions
- Total button size: `54px × 54px`
- Outer padding: `2px` (creates the gradient ring effect)
- Inner circle: Calculated automatically to fit within padding