import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

export type IconName =
  | 'home'
  | 'bolt'
  | 'bill'
  | 'alert'
  | 'bell'
  | 'back'
  | 'car'
  | 'carCharge'
  | 'sun'
  | 'pylon'
  | 'lock'
  | 'check'
  | 'fingerprint'
  | 'search'
  | 'user'
  | 'chevronRight'
  | 'chevronDown'
  | 'arrowRight'
  | 'card'
  | 'wallet'
  | 'chart'
  | 'settings'
  | 'logout'
  | 'shield'
  | 'document'
  | 'receipt'
  | 'download'
  | 'share'
  | 'phone'
  | 'mail'
  | 'droplet'
  | 'star'
  | 'sparkle'
  | 'eye'
  | 'eyeOff'
  | 'edit'
  | 'plus'
  | 'info'
  | 'trendUp'
  | 'trendDown'
  | 'calendar'
  | 'globe'
  | 'trash'
  | 'verified'
  | 'close';

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/** Stroke icons (24×24 viewBox) in the style of the Figma reference. Decorative: hidden from screen readers. */
export function Icon({ name, size = 24, color = '#0F1B2D', strokeWidth = 1.8 }: Props) {
  const common = {
    fill: 'none',
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  let body: React.ReactNode;
  switch (name) {
    case 'home':
      body = <Path {...common} d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />;
      break;
    case 'bolt':
      body = <Path {...common} d="M13 2L4 14h7l-1 8 9-12h-7z" />;
      break;
    case 'bill':
      body = (
        <>
          <Path {...common} d="M6 2h9l5 5v15H6z" />
          <Path {...common} d="M14 2v6h6" />
          <Path {...common} d="M9 13h8M9 17h6" />
        </>
      );
      break;
    case 'alert':
      body = (
        <>
          <Path {...common} d="M12 3l10 18H2z" />
          <Path {...common} d="M12 10v5M12 18v.5" />
        </>
      );
      break;
    case 'bell':
      body = (
        <>
          <Path {...common} d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" />
          <Path {...common} d="M10 20a2 2 0 0 0 4 0" />
        </>
      );
      break;
    case 'back':
      body = <Path {...common} d="M15 5l-7 7 7 7" />;
      break;
    case 'chevronRight':
      body = <Path {...common} d="M9 5l7 7-7 7" />;
      break;
    case 'chevronDown':
      body = <Path {...common} d="M5 9l7 7 7-7" />;
      break;
    case 'arrowRight':
      body = <Path {...common} d="M4 12h16M13 5l7 7-7 7" />;
      break;
    case 'car':
      body = (
        <>
          <Path {...common} d="M5 16l1.5-5a2 2 0 0 1 2-1.5h7a2 2 0 0 1 2 1.5L19 16" />
          <Path {...common} d="M4 16h16v3H4z" />
          <Path {...common} d="M7 19v1.5M17 19v1.5" />
        </>
      );
      break;
    case 'carCharge':
      body = (
        <>
          <Path {...common} d="M5 16l1.5-5a2 2 0 0 1 2-1.5h7a2 2 0 0 1 2 1.5L19 16" />
          <Path {...common} d="M4 16h16v3H4z" />
          <Path {...common} d="M7 19v1.5M17 19v1.5" />
          <Path {...common} d="M13 2l-2 3h3l-2 3" />
        </>
      );
      break;
    case 'sun':
      body = (
        <>
          <Circle {...common} cx={12} cy={12} r={4} />
          <Path {...common} d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
        </>
      );
      break;
    case 'pylon':
      body = <Path {...common} d="M12 2l-5 20M12 2l5 20M8 9h8M7 14h10M5 6h14" />;
      break;
    case 'lock':
      body = (
        <>
          <Path {...common} d="M6 11V8a6 6 0 0 1 12 0v3" />
          <Path {...common} d="M4 11h16v10H4z" />
        </>
      );
      break;
    case 'check':
      body = <Path {...common} d="M5 12.5l4.5 4.5L19 7.5" />;
      break;
    case 'close':
      body = <Path {...common} d="M6 6l12 12M18 6L6 18" />;
      break;
    case 'fingerprint':
      body = (
        <Path
          {...common}
          d="M7 4.5A9 9 0 0 1 21 12M3 12a9 9 0 0 1 1.5-5M12 7a5 5 0 0 1 5 5v2M7 12a5 5 0 0 1 2-4M12 11v4a6 6 0 0 1-1 3.5M8 15a9 9 0 0 1-.5 3M16 17a12 12 0 0 1-1 3"
        />
      );
      break;
    case 'search':
      body = (
        <>
          <Circle {...common} cx={11} cy={11} r={7} />
          <Path {...common} d="M20 20l-3.5-3.5" />
        </>
      );
      break;
    case 'user':
      body = (
        <>
          <Circle {...common} cx={12} cy={8} r={4} />
          <Path {...common} d="M4 21a8 8 0 0 1 16 0" />
        </>
      );
      break;
    case 'card':
      body = (
        <>
          <Path {...common} d="M3 6h18v12H3z" />
          <Path {...common} d="M3 10h18M7 15h4" />
        </>
      );
      break;
    case 'wallet':
      body = (
        <>
          <Path {...common} d="M3 7a2 2 0 0 1 2-2h13v4" />
          <Path {...common} d="M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2z" />
          <Path {...common} d="M16 14h2" />
        </>
      );
      break;
    case 'chart':
      body = <Path {...common} d="M4 20V10M10 20V4M16 20v-7M22 20H2" />;
      break;
    case 'trendUp':
      body = <Path {...common} d="M3 17l6-6 4 4 8-8M15 7h6v6" />;
      break;
    case 'trendDown':
      body = <Path {...common} d="M3 7l6 6 4-4 8 8M15 17h6v-6" />;
      break;
    case 'settings':
      body = (
        <>
          <Circle {...common} cx={12} cy={12} r={3} />
          <Path {...common} d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          <Circle {...common} cx={12} cy={12} r={7} />
        </>
      );
      break;
    case 'logout':
      body = <Path {...common} d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5M15 8l4 4-4 4M9 12h10" />;
      break;
    case 'shield':
      body = <Path {...common} d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />;
      break;
    case 'document':
      body = (
        <>
          <Path {...common} d="M7 3h7l5 5v13H7z" />
          <Path {...common} d="M14 3v5h5M10 13h6M10 17h6" />
        </>
      );
      break;
    case 'receipt':
      body = (
        <>
          <Path {...common} d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z" />
          <Path {...common} d="M9 8h6M9 12h6M9 16h4" />
        </>
      );
      break;
    case 'download':
      body = <Path {...common} d="M12 4v11M7 10l5 5 5-5M4 20h16" />;
      break;
    case 'share':
      body = <Path {...common} d="M12 3v12M7 8l5-5 5 5M5 14v6h14v-6" />;
      break;
    case 'phone':
      body = <Path {...common} d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z" />;
      break;
    case 'mail':
      body = (
        <>
          <Path {...common} d="M3 5h18v14H3z" />
          <Path {...common} d="M3 6l9 7 9-7" />
        </>
      );
      break;
    case 'droplet':
      body = <Path {...common} d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />;
      break;
    case 'star':
      body = <Path {...common} d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 3 1.1-6.2L3 9.7l6.2-.9z" />;
      break;
    case 'sparkle':
      body = (
        <>
          <Path {...common} d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
          <Path {...common} d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
        </>
      );
      break;
    case 'eye':
      body = (
        <>
          <Path {...common} d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
          <Circle {...common} cx={12} cy={12} r={3} />
        </>
      );
      break;
    case 'eyeOff':
      body = (
        <>
          <Path {...common} d="M3 3l18 18M10.5 6.3A10 10 0 0 1 12 6c6.5 0 10 6 10 6a16 16 0 0 1-3 3.5M6.6 6.6A15 15 0 0 0 2 12s3.5 6 10 6a9 9 0 0 0 3.4-.6" />
          <Path {...common} d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </>
      );
      break;
    case 'edit':
      body = <Path {...common} d="M4 20h4l11-11-4-4L4 16zM13 7l4 4" />;
      break;
    case 'plus':
      body = <Path {...common} d="M12 5v14M5 12h14" />;
      break;
    case 'info':
      body = (
        <>
          <Circle {...common} cx={12} cy={12} r={9} />
          <Path {...common} d="M12 11v5M12 8v.5" />
        </>
      );
      break;
    case 'calendar':
      body = (
        <>
          <Path {...common} d="M4 6h16v15H4z" />
          <Path {...common} d="M4 10h16M8 3v5M16 3v5" />
        </>
      );
      break;
    case 'globe':
      body = (
        <>
          <Circle {...common} cx={12} cy={12} r={9} />
          <Path {...common} d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </>
      );
      break;
    case 'trash':
      body = <Path {...common} d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" />;
      break;
    case 'verified':
      body = (
        <>
          <Path {...common} d="M12 2l2.4 2 3.1-.4 1.2 2.9 2.7 1.6-.8 3 .8 3-2.7 1.6-1.2 2.9-3.1-.4L12 22l-2.4-2-3.1.4-1.2-2.9L2.6 15.9l.8-3-.8-3 2.7-1.6 1.2-2.9 3.1.4z" />
          <Path {...common} d="M8.5 12.5l2.5 2.5 4.5-5" />
        </>
      );
      break;
  }
  return (
    <View aria-hidden style={{ width: size, height: size, pointerEvents: 'none' }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {body}
      </Svg>
    </View>
  );
}
