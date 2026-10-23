import { colors } from './theme';

export function tagColors(tag: string): { fg: string; bg: string } {
  switch (tag) {
    case 'Grid alert':
      return { fg: colors.warningText, bg: colors.warningBg };
    case 'Offer':
    case 'EV':
      return { fg: colors.evText, bg: colors.evTint };
    case 'Billing':
      return { fg: colors.primaryDark, bg: colors.primaryTint };
    default:
      return { fg: colors.successText, bg: colors.successBg };
  }
}
