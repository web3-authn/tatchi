# Web3Authn Design System - UX First

A design system that prioritizes user experience, information hierarchy, and purposeful design over visual consistency alone. Based on production patterns from `jords.css` and `jords.html`.

## Table of Contents
- [UX Principles](#ux-principles)
- [Information Hierarchy](#information-hierarchy)
- [Component Purpose & Context](#component-purpose--context)
- [Design Tokens](#design-tokens)
- [Typography System](#typography-system)
- [Layout & Spacing](#layout--spacing)
- [Component Library](#component-library)
- [Animation & Motion](#animation--motion)
- [Responsive Design](#responsive-design)
- [Implementation Guide](#implementation-guide)

## UX Principles

### 1. Purpose Over Polish
Every visual element should serve a user need:
- **Primary actions** get primary styling
- **Secondary information** gets secondary styling
- **Navigation** is functional first, beautiful second
- **Decorative elements** enhance, never distract

### 2. Information Hierarchy
Guide users through content in order of importance:
- **Critical actions** (login, confirm, save) are most prominent
- **Supporting information** (help text, status) is less prominent
- **Navigation** is accessible but not competing for attention
- **Errors and warnings** are appropriately urgent

### 3. Context Matters
Different contexts require different treatments:
- **Forms** need clear input states and validation feedback
- **Status displays** need scannable information
- **Navigation** needs to be predictable and accessible
- **Modals** need to focus attention without overwhelming

### 4. Progressive Enhancement
Start with functional, enhance with beautiful:
- **Core functionality** works without animations
- **Visual polish** enhances but doesn't break experience
- **Mobile-first** design scales up, not down
- **Accessibility** is built-in, not added later

## Information Hierarchy

### Visual Weight Scale
Use these levels to guide user attention:

```css
/* Level 1: Critical Actions (Primary buttons, main CTAs) */
--visual-weight-critical: 900;
--visual-weight-critical-color: var(--w3a-text);

/* Level 2: Primary Content (Main headings, important text) */
--visual-weight-primary: 700;
--visual-weight-primary-color: var(--w3a-text);

/* Level 3: Secondary Content (Body text, descriptions) */
--visual-weight-secondary: 400;
--visual-weight-secondary-color: var(--w3a-text-secondary);

/* Level 4: Supporting Content (Help text, metadata) */
--visual-weight-supporting: 300;
--visual-weight-supporting-color: var(--w3a-text-dim);

/* Level 5: Navigation & Utilities (Nav links, icons) */
--visual-weight-utility: 400;
--visual-weight-utility-color: var(--w3a-text-secondary);
```

### Application Examples

```html
<!-- Critical: Login button -->
<button class="button button--critical">Sign In</button>

<!-- Primary: Main heading -->
<h1 class="heading-style-h1 heading--primary">Welcome Back</h1>

<!-- Secondary: Description -->
<p class="text-size-regular text--secondary">Enter your credentials to continue</p>

<!-- Supporting: Help text -->
<p class="text-size-small text--supporting">Don't have an account? <a href="/register">Sign up</a></p>

<!-- Utility: Navigation -->
<nav class="navbar_component navbar--utility">
  <a class="navbar_link" href="/help">Help</a>
</nav>
```

## Component Purpose & Context

### Form Components
**Purpose**: Collect user input with clear feedback
**UX Requirements**:
- Clear input states (focus, error, success)
- Immediate validation feedback
- Logical tab order
- Accessible labels and descriptions

```html
<!-- Good: Clear purpose and feedback -->
<div class="form_component">
  <label class="form_label" for="email">Email Address</label>
  <input
    class="form_input"
    id="email"
    type="email"
    aria-describedby="email-help"
    required
  />
  <div class="form_message-error" id="email-help">Please enter a valid email</div>
</div>

<!-- Avoid: Decorative styling without purpose -->
<div class="liquid-border"> <!-- Unnecessary animation -->
  <div class="glass-surface">
    <input class="form_input" type="email" />
  </div>
</div>
```

### Navigation Components
**Purpose**: Help users move between sections
**UX Requirements**:
- Predictable placement and behavior
- Clear current page indication
- Accessible to keyboard and screen readers
- Mobile-friendly interaction patterns

```html
<!-- Good: Functional navigation -->
<nav class="navbar_component">
  <div class="navbar_body">
    <a class="navbar_link w--current" href="/">Home</a>
    <a class="navbar_link" href="/settings">Settings</a>
  </div>
</nav>

<!-- Avoid: Navigation competing for attention -->
<nav class="navbar_component animated-border"> <!-- Distracting animation -->
  <div class="navbar_body glass-surface"> <!-- Unnecessary glass effect -->
    <!-- Navigation content -->
  </div>
</nav>
```

### Status & Information Components
**Purpose**: Display information users need to understand
**UX Requirements**:
- Scannable information hierarchy
- Appropriate urgency levels
- Clear action implications
- Consistent with user expectations

```html
<!-- Good: Clear information hierarchy -->
<div class="status_component">
  <h3 class="status_title">Transaction Complete</h3>
  <p class="status_description">Your payment has been processed</p>
  <div class="status_actions">
    <button class="button">View Receipt</button>
  </div>
</div>

<!-- Avoid: Equal visual weight for all information -->
<div class="liquid-border"> <!-- Distracts from content -->
  <div class="glass-surface">
    <h3>Transaction Complete</h3>
    <p>Your payment has been processed</p>
    <button class="button">View Receipt</button>
  </div>
</div>
```

## Design Tokens

### Theme System
The design system supports light and dark themes through CSS custom properties with a structured naming convention.

#### Theme Classes
```css
/* Default light theme (no class needed) */
/* Dark theme can be implemented by overriding CSS variables */
```

#### Color Tokens
```css
/* Web3Authn Design System Colors */
--w3a-bg: #ffffff                    /* Main background */
--w3a-surface: rgba(255, 255, 255, 0.8)  /* Translucent surface */
--w3a-surface-solid: #ffffff         /* Solid surface */
--w3a-text: #1f2937                 /* Primary text */
--w3a-text-primary: #1f2937         /* Primary text */
--w3a-text-secondary: #4a5568       /* Secondary text */
--w3a-text-dim: #4a5568             /* Dimmed text */
--w3a-border: #e2e8f0               /* Standard border */
--w3a-border-strong: #cbd5e0        /* Strong border */
--w3a-shadow: rgba(0, 0, 0, 0.05)   /* Subtle shadow */
--w3a-shadow-strong: rgba(0, 0, 0, 0.1) /* Strong shadow */
--w3a-bg-secondary: #f8fafc         /* Secondary background */
--w3a-bg-tertiary: #f1f5f9          /* Tertiary background */

/* Dark backgrounds */
--w3a-bg-dark-1: #001233            /* Dark background 1 */
--w3a-bg-dark-2: #001845            /* Dark background 2 */
--w3a-bg-dark-3: #002855            /* Dark background 3 */

/* Slate gray scale */
--slate-grey-100: #f1f5f9           /* Lightest gray */
--slate-grey-200: #e2e8f0           /* Light gray */
--slate-grey-300: #cbd5e0           /* Medium light gray */
--slate-grey-400: #94a3b8           /* Medium gray */
--slate-grey-500: #64748b           /* Medium dark gray */
--slate-grey-600: #475569           /* Dark gray */
--slate-grey-700: #334155           /* Darker gray */
--slate-grey-800: #1e293b           /* Very dark gray */
--slate-grey-900: #0f172a           /* Darkest gray */
```

#### Usage
```html
<body>
  <div style="color: var(--w3a-text);">Body text</div>
  <div style="background: var(--w3a-bg);">Surface</div>
  <div style="border: 1px solid var(--w3a-border);">Bordered element</div>
</body>
```

### Brand Colors
The system uses a sophisticated neutral palette with cobalt blue as the primary accent color:

#### Cobalt Blue Color Palette
- **Primary**: `#0353A4` (Cobalt Primary - Primary brand color)
- **Primary Hover**: `#0466C8` (Cobalt Primary Hover - Hover state)
- **Primary Dimmed**: `#023E7D` (Cobalt Primary Dimmed - Disabled state)
- **Light**: `#5FA8D3` (Cobalt Light - Light accent)
- **Lighter**: `#89C2D9` (Cobalt Lighter - Very light accent)
- **Lightest**: `#A9D6E5` (Cobalt Lightest - Lightest accent)

#### Complete Color Palette
- `--cobalt-primary`: `#0353A4` (Cobalt Primary - Primary buttons, focus states)
- `--cobalt-primary-hover`: `#0466C8` (Cobalt Primary Hover - Hover states)
- `--cobalt-primary-dimmed`: `#023E7D` (Cobalt Primary Dimmed - Disabled states)
- `--cobalt-light`: `#5FA8D3` (Cobalt Light - Light backgrounds, borders)
- `--cobalt-lighter`: `#89C2D9` (Cobalt Lighter - Very light backgrounds)
- `--cobalt-lightest`: `#A9D6E5` (Cobalt Lightest - Lightest backgrounds)
- `--cobalt-shadow`: `rgba(3, 83, 164, 0.3)` (Cobalt Shadow - Focus shadows)
- `--cobalt-focus`: `rgba(3, 83, 164, 0.18)` (Cobalt Focus - Focus states)
- `--cobalt-disabled`: `#718096` (Cobalt Disabled - Disabled states)

#### Gradient Options
- **Primary Gradient**: `linear-gradient(135deg, #0353A4 0%, #5FA8D3 100%)`
- **Subtle Gradient**: `linear-gradient(135deg, #A9D6E5 0%, #89C2D9 100%)`

#### Other Colors
- **Success**: `#0353A4` (Cobalt blue for success states)
- **Warning**: `#fbbf24` (amber)
- **Error**: `#f87171` (red)
- **Neutral grays**: Extensive scale from `#f1f5f9` to `#0f172a`

## Typography System

### Heading Hierarchy
The system uses semantic heading classes with consistent tokens:

```css
/* Typography tokens */
--w3a-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--w3a-font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--w3a-font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;

/* Font weights */
--w3a-font-normal: 400;
--w3a-font-medium: 500;
--w3a-font-semibold: 600;
--w3a-font-bold: 700;

/* Text sizes */
--w3a-text-xs: 0.75rem;    /* 12px */
--w3a-text-sm: 0.875rem;   /* 14px */
--w3a-text-base: 1rem;     /* 16px */
--w3a-text-lg: 1.125rem;   /* 18px */
--w3a-text-xl: 1.25rem;    /* 20px */
--w3a-text-2xl: 1.5rem;    /* 24px */
```

#### Heading Classes
```html
<h1 class="heading-style-h1">Main Title</h1>
<h2 class="heading-style-h2">Section Heading</h2>
<h3 class="heading-style-h3">Subsection</h3>
<h4 class="heading-style-h4">Card Title</h4>
<h5 class="heading-style-h5">Small Heading</h5>
<h6 class="heading-style-h6">Micro Heading</h6>
```

### Text Styles
```html
<!-- Body text -->
<p class="text-size-regular">Standard body text</p>
<p class="text-size-large">Large body text</p>
<p class="text-size-small">Small body text</p>
<p class="text-size-tiny">Fine print</p>

<!-- Text weights -->
<span class="text-weight-light">Light (300)</span>
<span class="text-weight-normal">Normal (400)</span>
<span class="text-weight-medium">Medium (500)</span>
<span class="text-weight-semibold">Semibold (600)</span>
<span class="text-weight-bold">Bold (700)</span>

<!-- Special styles -->
<p class="text-style-tagline">UPPERCASE LABELS</p>
<p class="text-style-italic">Italic text</p>
<p class="text-style-strikethrough">Strikethrough</p>
<blockquote class="text-style-quote">Quoted content</blockquote>
```

### Font Stack
```css
/* Primary font stack */
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;

/* Monospace font stack */
font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
```

## Layout & Spacing

### Container System
Semantic container classes for consistent content widths:

```html
<div class="container-small">    <!-- 48rem / 768px max-width -->
<div class="container-medium">   <!-- 64rem / 1024px max-width -->
<div class="container-large">    <!-- 75rem / 1200px max-width -->
```

### Max-Width Utilities
Fine-grained width control:
```html
<div class="max-width-xxsmall">  <!-- 20rem -->
<div class="max-width-xsmall">   <!-- 24rem -->
<div class="max-width-small">    <!-- 32rem -->
<div class="max-width-medium">   <!-- 48rem -->
<div class="max-width-large">    <!-- 64rem -->
<div class="max-width-xlarge">   <!-- 80rem -->
<div class="max-width-xxlarge">  <!-- 96rem -->
```

### Spacing Scale
Consistent spacing system with T-shirt sizing:

```css
/* Sizing & Spacing tokens */
--w3a-radius-sm: 12px;     /* Small border radius */
--w3a-radius: 24px;        /* Standard border radius */
--w3a-radius-lg: 32px;     /* Large border radius */
--w3a-radius-xl: 40px;     /* Extra large border radius */

/* Gap spacing */
--w3a-gap-1: 4px;          /* Tiny gap */
--w3a-gap-2: 8px;          /* Small gap */
--w3a-gap-3: 12px;         /* Medium gap */
--w3a-gap-4: 16px;         /* Large gap */
--w3a-gap-6: 24px;         /* Extra large gap */

/* Motion tokens */
--w3a-ease: cubic-bezier(0.2, 0.6, 0.2, 1);
--w3a-fast: 200ms;
--w3a-med: 400ms;
```

### Section Padding
Semantic section spacing:
```html
<section class="padding-section-small">   <!-- 3rem vertical -->
<section class="padding-section-medium">  <!-- 5rem vertical -->
<section class="padding-section-large">   <!-- 7rem vertical -->
```

### Spacers
Vertical rhythm utilities:
```html
<div class="spacer-tiny"></div>     <!-- 0.25rem top padding -->
<div class="spacer-small"></div>    <!-- 1rem top padding -->
<div class="spacer-medium"></div>   <!-- 1.5rem top padding -->
<div class="spacer-large"></div>    <!-- 2rem top padding -->
<div class="spacer-xlarge"></div>   <!-- 3rem top padding -->
```

### Grid System
Responsive grid utilities:
```html
<div class="fs-styleguide_1-col">  <!-- Single column -->
<div class="fs-styleguide_2-col">  <!-- Two columns -->
<div class="fs-styleguide_3-col">  <!-- Three columns -->
<div class="fs-styleguide_4-col">  <!-- Four columns -->
```

## Component Library

### Navigation

#### Navbar System
Multi-layer navigation with glassmorphism:

```html
<nav class="navbar_component">
  <div class="navbar_container">
    <div class="navbar_body">
      <div class="navbar_bg"></div>  <!-- Blur overlay -->

      <!-- Logo/Brand -->
      <div class="navbar_logo">
        <img src="logo.svg" alt="Brand" />
      </div>

      <!-- Navigation Links -->
      <div class="navbar_link-list">
        <a class="navbar_link w--current" href="/">Home</a>
        <a class="navbar_link" href="/about">About</a>
        <a class="navbar_link" href="/contact">Contact</a>
      </div>

      <!-- Optional theme toggle -->
      <button class="mode_button">
        <div class="mode_icon-wrap">
          <div class="mode_icon"></div>
          <div class="mode_icon is-2"></div>
        </div>
        <div class="mode_bg is-1"></div>
        <div class="mode_bg is-2"></div>
      </button>
    </div>
  </div>
</nav>
```

Key features:
- Fixed positioning with backdrop blur
- Current page indicator (`.w--current`)
- Smooth theme transitions
- Mobile responsive (collapses to hamburger)

### Buttons

#### Button System
Comprehensive button variants with consistent styling:

```html
<!-- Primary Actions -->
<button class="button">Primary Button</button>
<button class="button is-large">Large Primary</button>
<button class="button is-small">Small Primary</button>

<!-- Secondary Actions -->
<button class="button is-secondary">Secondary</button>
<button class="button ghost">Ghost Button</button>
<button class="button is-text">Text Only</button>

<!-- Icon Buttons -->
<button class="button is-icon">
  <img class="button-img" src="icon.svg" alt="" />
  <span class="button-main-text">With Icon</span>
  <span class="button-subtext">Optional subtitle</span>
</button>

<!-- Special Variants -->
<button class="button is-even">Equal Width</button>
<button class="button is-m-nav">Mobile Nav</button>
<button class="button is-d-nav">Desktop Nav</button>
```

#### Button Groups
```html
<div class="button-group">
  <button class="button ghost">Cancel</button>
  <button class="button">Confirm</button>
</div>

<div class="button-group is-center">
  <button class="button">Left</button>
  <button class="button">Center</button>
  <button class="button">Right</button>
</div>
```

### Cards & Surfaces

#### Bento Grid System
Modern card-based layouts with the "bento box" pattern:

```html
<section class="bento_grid">
  <!-- Standard card -->
  <div class="bento_card-wrap">
    <div class="bento_t-card">
      <div class="bento_card_content">
        <h3 class="bento_card_title">Card Title</h3>
        <p>Card content goes here.</p>
      </div>
    </div>
  </div>

  <!-- Wide card (spans 2 columns) -->
  <div class="bento_card-wrap is-wide">
    <div class="bento_t-card">
      <div class="bento_card_content">
        <h3 class="bento_card_title">Wide Card</h3>
      </div>
    </div>
  </div>

  <!-- Full-width card -->
  <div class="bento_card-wrap is-full">
    <div class="bento_t-card">
      <div class="bento_card_content">
        <h3 class="bento_card_title">Full Width</h3>
      </div>
    </div>
  </div>

  <!-- Top-aligned card -->
  <div class="bento_card-wrap is-top">
    <div class="bento_t-card">
      <div class="bento_card_content">
        <h3 class="bento_card_title">Top Aligned</h3>
      </div>
    </div>
  </div>
</section>
```

#### Portfolio/Slider Cards
For showcasing work or testimonials:

```html
<div class="portfolio_slider-slide">
  <div class="portfolio_slide_frame">
    <div class="portfolio_slide_inner">
      <div class="portfolio_slide_img-wrap">
        <img class="portfolio_slide_img" src="image.jpg" alt="" />
      </div>
      <div class="portfolio_slide_content">
        <h3 class="portfolio_slide_title">Project Title</h3>
        <div class="portfolio_slide_info-wrap">
          <div class="portfolio_slide_info">Project details</div>
        </div>
      </div>
    </div>
  </div>
</div>
```

### Forms & Inputs

#### Form Components
Consistent form styling with validation states:

```html
<div class="form_component">
  <!-- Text Input -->
  <div class="form_input-wrapper">
    <label class="form_label">Email Address</label>
    <input class="form_input" type="email" placeholder="Enter your email" />
  </div>

  <!-- Textarea -->
  <div class="form_input-wrapper">
    <label class="form_label">Message</label>
    <textarea class="form_input is-text-area" placeholder="Your message"></textarea>
  </div>

  <!-- Radio Buttons -->
  <div class="form_radio">
    <input type="radio" name="option" id="option1" />
    <label for="option1">
      <div class="form_radio-icon"></div>
      Option 1
    </label>
  </div>

  <!-- Checkboxes -->
  <div class="form_checkbox">
    <input type="checkbox" id="agree" />
    <label for="agree">
      <div class="form_checkbox-icon"></div>
      I agree to the terms
    </label>
  </div>
</div>
```

#### Form Messages
```html
<div class="form_message-success">Success message</div>
<div class="form_message-error">Error message</div>
```

### Labels & Tags

#### Chips and Labels
```html
<!-- Standard labels -->
<span class="fs-styleguide_label">New</span>
<span class="fs-styleguide_label is-tag">Beta</span>

<!-- Text styles -->
<span class="text-style-tagline">UPPERCASE LABELS</span>
<span class="text-style-allcaps">ALL CAPS</span>
```

### Hero Sections

#### Hero Layout System
Full-featured hero sections with decorative elements:

```html
<section class="hero_layout">
  <div class="hero_top">
    <!-- Optional decorative blob -->
    <div class="hero_top-blob-wrap">
      <div class="hero_top-blob"></div>
    </div>

    <div class="hero_logo">
      <img src="logo.svg" alt="Logo" />
    </div>
  </div>

  <div class="hero_content">
    <!-- Eyebrow text -->
    <div class="hero_eyebrow-wrap">
      <div class="hero_eyebrow-icon-wrap">
        <div class="hero_arrow-icon"></div>
      </div>
      <p class="hero_sub-eyebrow">Introducing</p>
    </div>

    <!-- Main heading -->
    <h1 class="hero_head">Your Amazing Product</h1>

    <!-- Subheading -->
    <div class="hero_sub-wrap">
      <p class="hero_subtext">Beautiful, functional, and built for the future.</p>
      <p class="hero_subline">Get started today.</p>
    </div>

    <!-- CTA buttons -->
    <div class="hero_c-logo-wrap">
      <button class="button is-large">Get Started</button>
      <button class="button ghost is-large">Learn More</button>
    </div>
  </div>

  <!-- Background elements -->
  <div class="hero_bg-wrap">
    <div class="hero_bg-blob"></div>
  </div>
</section>
```

## Animation & Motion

### Progress Indicators
```html
<div class="progress-bar-wrap">
  <div class="progress-bar" style="width: 75%;"></div>
</div>
```

### Reveal Animations
Section reveal effects:
```html
<section class="section_reveal">
  <div class="reveal_layout">
    <div class="reveal_bg_wrap">
      <div class="reveal_cloud"></div>
    </div>
    <!-- Content -->
  </div>
</section>
```

## Responsive Design

### Breakpoint System
The design system uses standard breakpoints:

```css
/* Mobile Portrait */
@media screen and (max-width: 479px) { }

/* Mobile Landscape */
@media screen and (max-width: 767px) { }

/* Tablet */
@media screen and (max-width: 991px) { }

/* Desktop */
@media screen and (min-width: 992px) { }
```

### Responsive Utilities
```html
<!-- Visibility controls -->
<div class="hide-mobile-portrait">Hidden on mobile portrait</div>
<div class="hide-mobile-landscape">Hidden on mobile landscape</div>
<div class="hide-tablet">Hidden on tablet</div>

<!-- Responsive max-widths -->
<div class="max-width-full-mobile-portrait">Full width on mobile portrait</div>
<div class="max-width-full-mobile-landscape">Full width on mobile landscape</div>
<div class="max-width-full-tablet">Full width on tablet</div>
```

### Text & Display Utilities

#### Text Alignment
```html
<p class="text-align-left">Left aligned</p>
<p class="text-align-center">Center aligned</p>
<p class="text-align-right">Right aligned</p>
```

#### Overflow Control
```html
<div class="overflow-hidden">Hidden overflow</div>
<div class="overflow-visible">Visible overflow</div>
<div class="overflow-scroll">Scrollable</div>
<div class="overflow-auto">Auto overflow</div>
```

#### Display Control
```html
<div class="hide">Hidden element</div>
<div class="pointer-events-none">No pointer events</div>
<div class="pointer-events-auto">Pointer events enabled</div>
```

## Implementation Guide

### UX-First Decision Framework

#### 1. Identify Component Purpose
Before applying any styling, ask:
- What is the primary user need this component serves?
- What is the most important action or information?
- What is the user's mental model for this component?

#### 2. Determine Information Hierarchy
- **Critical**: Must be immediately visible and actionable
- **Primary**: Important but not urgent
- **Secondary**: Supporting information
- **Utility**: Navigation, help, settings

#### 3. Choose Appropriate Styling
- **Critical actions**: Use primary button styles, prominent positioning
- **Primary content**: Use heading styles, good contrast
- **Secondary content**: Use body text styles, moderate contrast
- **Utility elements**: Use subtle styling, don't compete for attention

#### 4. Consider Context
- **Forms**: Focus on clarity and feedback
- **Navigation**: Focus on predictability and accessibility
- **Status displays**: Focus on scannability
- **Modals**: Focus on attention without overwhelming

### Best Practices

#### Class Composition
Prefer multiple utility classes over custom CSS:
```html
<!-- Good -->
<div class="container-medium padding-section-large text-align-center">

<!-- Avoid -->
<div class="custom-centered-section">
```

#### Theme Consistency
Always use design tokens instead of hardcoded values:
```css
/* Good */
color: var(--w3a-text);
background: var(--w3a-bg);

/* Avoid */
color: #333;
background: #fff;
```

#### Component Layering
Follow the established patterns for complex components:
```html
<!-- Frame → Surface → Content -->
<div class="bento_card-wrap">          <!-- Frame -->
  <div class="bento_t-card">           <!-- Surface -->
    <div class="bento_card_content">   <!-- Content -->
      <!-- Your content -->
    </div>
  </div>
</div>
```

### Accessibility Guidelines

1. **Focus States**: Preserve existing focus styles or enhance them
2. **Color Contrast**: Design tokens ensure WCAG compliance
3. **Motion**: Respect `prefers-reduced-motion`
4. **Semantic HTML**: Use proper heading hierarchy and landmarks

### Performance Notes

- **CSS Custom Properties**: Efficiently themed with minimal overhead
- **Decorative Elements**: Blob/edge elements are optional for simpler builds
- **Animation**: Subtle, performant CSS animations using `transform` and `opacity`

### Quick Reference

#### Essential Classes
```html
<!-- Layout -->
.container-{small|medium|large}
.padding-{size}, .margin-{size}
.spacer-{size}

<!-- Typography -->
.heading-style-{h1-h6}
.text-{size|weight|align}-{value}

<!-- Components -->
.button, .button.{variant}
.bento_grid, .bento_card-wrap
.navbar_component

<!-- Utilities -->
.hide-{breakpoint}
.max-width-{size}
.overflow-{type}
```

### Animated Liquid Glass Border

This pattern combines an animated conic-gradient frame with a blurred glass content surface. Source: `EmbeddedTxConfirm.tsx` (`.action-list`, `.tooltip-content`). Use for hero sections, modals, and root containers.

#### Core CSS

```css
/* Animated conic-gradient frame */
.liquid-border {
  /* Border animation */
  --border-angle: 0deg;
  animation: liquid-rotate 4s linear infinite;

  /* Frame look */
  background: linear-gradient(#ffffff, #ffffff) padding-box,
    conic-gradient(
      from var(--border-angle),
      rgba(0, 0, 0, 0.10) 0%,
      rgba(0, 0, 0, 0.50) 25%,
      rgba(0, 0, 0, 0.10) 50%,
      rgba(0, 0, 0, 0.50) 75%,
      rgba(0, 0, 0, 0.10) 100%
    ) border-box;
  border: 1px solid transparent;          /* thickness */
  border-radius: var(--liquid-radius, 16px); /* action-list uses 16px */
  position: relative;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0,0,0,.05);
}

@property --border-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

@keyframes liquid-rotate {
  from { --border-angle: 0deg; }
  to   { --border-angle: 360deg; }
}

/* Glass content surface */
.glass-surface {
  background: transparent;                /* keep translucent */
  backdrop-filter: blur(var(--glass-blur, 8px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 8px));
  border: 1px solid var(--glass-border, #e2e8f0);
  border-radius: var(--glass-radius, 24px); /* tooltip uses 24px */
  padding: var(--glass-padding, 8px);       /* tooltip uses 8px */
}
```

Notes:
- `.action-list` maps to `.liquid-border` (1px border, radius 16px, subtle shadow, animated via `--border-angle`).
- `.tooltip-content` maps to `.glass-surface` (blur 8px, border 1px, radius 24px, padding 8px). Visibility handled by parent hover in the original.

#### Sizing and Spacing Guidance

- **Border thickness**: 1px (keep thin to preserve liquid effect).
- **Corner radii**:
  - Root/hero containers: 24–32px (`--liquid-radius`/`--glass-radius`).
  - Modals/standard cards: 16–24px (Embedded example uses 16px for frame, 24px for inner).
- **Padding**:
  - Tooltips/small popovers: 8–12px (`--glass-padding`).
  - Modals/hero content: 16–24px.
- **Offsets (tooltips)**: 8px gap from trigger (`--tooltip-offset: 8px`).

#### Usage Examples

Hero container
```html
<section class="liquid-border" style="--liquid-radius: 28px;">
  <div class="glass-surface" style="--glass-radius: 28px; --glass-padding: 24px;">
    <h1 class="heading-style-h1">Beautiful liquid frame</h1>
    <p class="subhead">Translucent, animated, and crisp.</p>
  </div>
.</section>
```

Modal container
```html
<div class="liquid-border" style="--liquid-radius: 20px;">
  <div class="glass-surface" style="--glass-radius: 20px; --glass-padding: 20px; max-width: 560px;">
    <h3 class="heading-style-h3">Confirm action</h3>
    <p>Review the details, then continue.</p>
    <div class="button-group">
      <button class="button">Cancel</button>
      <button class="button">Confirm</button>
    </div>
  </div>
.</div>
```

Root container
```html
<main class="liquid-border" style="--liquid-radius: 24px;">
  <div class="glass-surface" style="--glass-radius: 24px; --glass-padding: 24px; max-width: 960px; margin: 0 auto;">
    <!-- app content -->
  </div>
.</main>
```

Tooltip (directional sizing borrowed from Embedded)
```html
<div class="tooltip-container" style="--tooltip-width: 280px; --tooltip-max-width: 320px; --tooltip-offset: 8px;">
  <button class="button is-small">Details</button>
  <div class="glass-surface tooltip-content top">
    <div class="liquid-border" style="--liquid-radius: 16px;">
      <div class="glass-surface" style="--glass-radius: 16px; --glass-padding: 12px;">
        Tooltip content
      </div>
    </div>
  </div>
.</div>
```

Implementation tips:
- Preserve the two-layer approach: outer animated frame (`.liquid-border`) + inner blurred surface (`.glass-surface`).
- Keep animation at ~4s linear for subtle motion; avoid dramatic color stops.
- You can swap neutral RGBA stops with brand colors if needed, but keep opacities low (0.1–0.5) to prevent noise.


