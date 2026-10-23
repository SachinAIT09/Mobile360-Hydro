import React from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../lib/theme';
import { Button, TextLink, Txt } from './ui';
import { Icon } from './icons';

export interface InfoSheetProps {
  visible: boolean;
  title: string;
  /** A paragraph, or several (each rendered as its own line; use `bullets` for a list). */
  body?: string | string[];
  /** Rendered as a bulleted list under the body. */
  bullets?: readonly string[];
  /** Fine print under the list (e.g. a terms link note). */
  footnote?: string;
  /** Primary button label; defaults to "Got it". */
  primaryLabel?: string;
  /** Called when the primary button, the backdrop or the hardware back button closes the sheet. */
  onClose: () => void;
  /** Optional secondary text link. */
  secondary?: { label: string; onPress: () => void };
  /** Optional icon/illustration shown above the title. */
  icon?: React.ReactNode;
}

/**
 * Informational bottom sheet: same idiom as the EV-detected sheet (dimmed backdrop, handle, title, body,
 * primary "Got it"), but self-contained in a transparent Modal so any screen can show it without a route.
 * Use this for "not in this demo" / explanatory notes; keep real errors on ErrorBox.
 */
export function InfoSheet({ visible, title, body, bullets, footnote, primaryLabel = 'Got it', onClose, secondary, icon }: InfoSheetProps) {
  const insets = useSafeAreaInsets();
  const paragraphs = body == null ? [] : Array.isArray(body) ? body : [body];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,33,72,0.6)' }}
        />
        {/* On Expo Web the root layout caps the app at 480px; mirror that so the sheet lines up with the phone column. */}
        <View style={{ width: '100%', maxWidth: Platform.OS === 'web' ? 480 : undefined, alignSelf: 'center' }}>
          <View
            accessibilityViewIsModal
            accessibilityRole="alert"
            accessibilityLabel={title}
            style={{
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingTop: 12,
              paddingHorizontal: 22,
              paddingBottom: 24 + insets.bottom,
              gap: 14,
            }}
          >
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderInput, alignSelf: 'center' }} />
            {icon}
            <Txt size={21} weight="bold" lh={1.25} color={colors.navy} accessibilityRole="header">
              {title}
            </Txt>
            {paragraphs.map((p, i) => (
              <Txt key={i} size={15} lh={1.5} color={colors.textBody}>
                {p}
              </Txt>
            ))}
            {bullets && bullets.length ? (
              <View style={{ gap: 8 }} accessibilityRole="list">
                {bullets.map((b, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                    <View style={{ marginTop: 3 }}>
                      <Icon name="check" size={16} color={colors.primary} strokeWidth={2.4} />
                    </View>
                    <Txt size={15} lh={1.5} color={colors.textBody} style={{ flex: 1 }}>
                      {b}
                    </Txt>
                  </View>
                ))}
              </View>
            ) : null}
            {footnote ? (
              <Txt size={12} lh={1.4} color={colors.textMuted}>
                {footnote}
              </Txt>
            ) : null}
            <Button label={primaryLabel} onPress={onClose} />
            {secondary ? <TextLink label={secondary.label} onPress={secondary.onPress} style={{ alignSelf: 'center' }} /> : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
