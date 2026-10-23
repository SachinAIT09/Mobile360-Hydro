import React, { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND, fmtDate, fmtTime, PROGRAM, type Message } from '@demo/shared';
import { BrandMark, Button, ErrorBox, TextLink, Txt } from '../components/ui';
import { Icon } from '../components/icons';
import { colors, shadowFloat } from '../lib/theme';
import { api } from '../lib/config';
import { useSession } from '../providers/SessionProvider';

/** Use case 1: pop-up shown the moment Net2Grid first detects an EV at a home that is not on a DR program. */
export default function EvDetectedSheet() {
  const insets = useSafeAreaInsets();
  const { summary, refreshSummary } = useSession();
  const [msg, setMsg] = useState<Message | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .messages()
      .then((list) => setMsg(list.filter((m) => m.kind === 'EV_DETECTED').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null))
      .catch(() => setMsg(null));
  }, []);

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/' as never);
  }

  async function remindLater() {
    if (msg) {
      try {
        await api.messageAction(msg.id, { action: 'REMIND_LATER' });
      } catch {
        // non-blocking
      }
    }
    close();
  }

  async function notEv() {
    setBusy(true);
    try {
      await api.notEv();
      await refreshSummary();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send feedback');
    } finally {
      setBusy(false);
    }
  }

  const detectedAt = summary?.evDetectedAt ?? msg?.createdAt ?? null;
  const address = summary?.customer.address ?? 'your home';
  const maxWidth = Platform.OS === 'web' ? 480 : undefined;

  return (
    <View style={{ flex: 1 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,33,72,0.6)' }} />

      {/* push-style card */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: insets.top + 12, alignItems: 'center' }}>
        <View style={[{ width: '94%', maxWidth: 456, backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 20, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', gap: 12 }, shadowFloat]}>
          <BrandMark size={38} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Txt size={12} color={colors.textMuted}>
                {BRAND.utilityName.toUpperCase()}
              </Txt>
              <Txt size={12} color={colors.textMuted}>
                now
              </Txt>
            </View>
            <Txt size={13} weight="bold" lh={1.35}>
              {msg?.title ?? 'We noticed an EV charging at your home'}
            </Txt>
            <Txt size={13} lh={1.35}>
              {msg?.body ?? `Earn ${PROGRAM.signupIncentive} by joining ${PROGRAM.name}. Tap to learn more.`}
            </Txt>
          </View>
        </View>
      </View>

      {/* bottom sheet */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' }}>
        <View
          accessibilityViewIsModal
          style={{ width: '100%', maxWidth, backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 12, paddingHorizontal: 22, paddingBottom: 24 + insets.bottom, gap: 14 }}
        >
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderInput, alignSelf: 'center' }} />
          <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.evTint, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="carCharge" size={34} color={colors.ev} strokeWidth={1.7} />
          </View>
          <Txt size={23} weight="bold" lh={1.25} color={colors.navy} accessibilityRole="header">
            Looks like you’ve got a new EV
          </Txt>
          <Txt size={15} lh={1.5} color={colors.textBody}>
            We detected EV charging at{' '}
            <Txt size={15} weight="bold">
              {address}
            </Txt>
            {detectedAt ? (
              <>
                {' '}starting{' '}
                <Txt size={15} weight="bold">
                  {fmtDate(detectedAt, { month: 'short', day: 'numeric' })}, {fmtTime(detectedAt)}
                </Txt>
              </>
            ) : null}
            . Your home isn’t enrolled in a demand response program yet.
          </Txt>
          <View style={{ backgroundColor: colors.evTintSoft, borderRadius: 16, padding: 14, gap: 8 }}>
            <Txt size={15} weight="bold" color={colors.evDeep}>
              {PROGRAM.name}
            </Txt>
            <Txt size={14} color={colors.evDeep}>
              ✓ Earn {PROGRAM.signupIncentive} for shifting charging off-peak
            </Txt>
            <Txt size={14} color={colors.evDeep}>
              ✓ Only a few events a season, with notice
            </Txt>
            <Txt size={14} color={colors.evDeep}>
              ✓ You can opt out of any event
            </Txt>
          </View>
          {error ? <ErrorBox message={error} /> : null}
          <Button
            label="See program & enroll"
            variant="ev"
            onPress={() => router.replace({ pathname: '/program', params: { source: 'APP_POPUP', ...(msg ? { messageId: msg.id } : {}) } } as never)}
          />
          <Button label="Remind me later" variant="secondary" onPress={remindLater} />
          <TextLink label="Not an EV? Let us know" color={colors.textMuted} onPress={notEv} style={{ alignSelf: 'center' }} />
          {busy ? (
            <Txt size={12} center color={colors.textMuted}>
              Sending…
            </Txt>
          ) : null}
        </View>
      </View>
    </View>
  );
}
