export const brandTokens = {
  primary: "#07384D",
  background: "#5ADCE8",
  highlight: "#DCEB15",
  textOnDark: "#FFFFFF",
  neutralBg: "#EAF4F6"
} as const;

export const webCssVariables = {
  "--brand-primary": brandTokens.primary,
  "--brand-background": brandTokens.background,
  "--brand-highlight": brandTokens.highlight,
  "--brand-text-on-dark": brandTokens.textOnDark,
  "--brand-neutral-bg": brandTokens.neutralBg,
  "--radius-base": "10px",
  "--space-base": "16px"
} as const;

export const mobileTheme = {
  colors: {
    primary: brandTokens.primary,
    background: brandTokens.background,
    highlight: brandTokens.highlight,
    textOnDark: brandTokens.textOnDark,
    neutralBg: brandTokens.neutralBg
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32
  }
} as const;
