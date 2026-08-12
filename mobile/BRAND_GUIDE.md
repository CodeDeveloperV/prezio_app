# Prezio Brand Guide

## Palette

- `#22C55E` primary brand green
- `#16A34A` pressed/active green
- `#0F172A` primary text and dark contrast
- `#64748B` secondary text and neutral icons
- `#F3F4F6` surfaces, cards, borders, light panels
- `#FFFFFF` pure white backgrounds and icon contrast

## Typography

- Heading font: `Poppins-SemiBold`
- Body font: `Poppins-Regular`
- Use heading font for titles, key labels, primary CTAs, and brand moments.
- Use body font for supporting copy, form text, metadata, and helper text.

## Iconography

- Style: Tabler outline icons
- Default stroke: `1.75`
- Subtle stroke: `1.5`
- Strong stroke: `2`
- Prefer `colorTokens.textSecondary` for neutral icons.
- Prefer `colorTokens.primary` for brand-positive states and main product actions.
- Prefer `colorTokens.textPrimary` for strong dark-on-light icons.

## Brand Surfaces

- Main light background: white
- Main surface: `#F3F4F6`
- Main dark contrast: `#0F172A`
- Keep tab bars, cards, and empty states aligned with the same palette instead of introducing new accent colors.

## Native Assets

- Android launcher and splash assets live under `mobile/android/app/src/main/res/`
- iOS app icon and launch screen assets live under `mobile/ios/PrezioMobile/Images.xcassets/`
- Use the generated Prezio logo assets already committed in the repo as the source of truth for app branding.

## Practical Rules

- Do not hardcode brand hex values in screens when a token exists.
- Do not mix icon stroke widths randomly.
- Do not introduce new brand colors unless they are added to the token file first.
- Keep the visual language clean, minimal, and grocery-app friendly.
