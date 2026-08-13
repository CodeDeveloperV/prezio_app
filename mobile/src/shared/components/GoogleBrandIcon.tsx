import type { SvgProps } from 'react-native-svg';
import Svg, { Path } from 'react-native-svg';

type GoogleBrandIconProps = SvgProps;

/**
 * Simple multicolor Google mark, kept local so the login/register buttons
 * stay readable in both light and dark themes without relying on a monochrome
 * icon glyph.
 */
export function GoogleBrandIcon(props: GoogleBrandIconProps) {
  return (
    <Svg viewBox="0 0 24 24" {...props}>
      <Path fill="#EA4335" d="M12 6.1c1.4 0 2.7.5 3.7 1.5l2.7-2.7A10 10 0 0 0 12 2a10 10 0 0 0-8.8 5.1l3.1 2.4C7.4 7.1 9.5 6.1 12 6.1Z" />
      <Path fill="#FBBC05" d="M6.3 12c0-.6.1-1.2.3-1.8L3.5 7.9A10 10 0 0 0 2 12c0 1.5.3 2.8.9 4l3.1-2.4c-.1-.5-.2-1-.2-1.6Z" />
      <Path fill="#34A853" d="m6.8 14.6-3.1 2.4A10 10 0 0 0 12 22c2.6 0 4.9-.8 6.6-2.2l-2.9-2.3c-1 .6-2.2 1-3.7 1-2.7 0-5-1.6-5.2-3.9Z" />
      <Path fill="#4285F4" d="M21.8 12c0-.7-.1-1.3-.2-1.9H12v4h5.6c-.5 1.4-1.4 2.3-2.7 3l2.9 2.3C19.7 18.2 21.8 15.7 21.8 12Z" />
    </Svg>
  );
}
