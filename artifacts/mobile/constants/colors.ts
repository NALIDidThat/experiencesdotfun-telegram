/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#131114',
    tint: '#F20789',

    // Core surfaces
    background: '#FCFAFD',
    foreground: '#131114',

    // Cards / elevated surfaces
    card: '#FFFFFF',
    cardForeground: '#131114',

    // Primary action color (buttons, links, active states)
    primary: '#F20789',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#F5EDF8',
    secondaryForeground: '#312535',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#F2EEF3',
    mutedForeground: '#776D79',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#EDE4FF',
    accentForeground: '#6805F2',

    // Destructive actions (delete, error states)
    destructive: '#C73663',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#E7DEE9',
    input: '#D9CEDC',
    violet: '#6805F2',
    teal: '#04ADBF',
    inkSoft: '#554956',
    success: '#168A70',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 18,
};

export default colors;
