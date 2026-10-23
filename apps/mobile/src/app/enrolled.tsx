import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { PROGRAM, type Channels } from '@demo/shared';
import { Button, Card, ErrorBox, HeroHeader, Overline, Txt } from '../components/ui';
import { ToggleRow } from '../components/ToggleRow';
import { Icon } from '../components/icons';
import { colors } from '../lib/theme';
import { api } from '../lib/config';
import { useSession } from '../providers/SessionProvider';

export default function EnrolledScreen() {
  const { summary, refreshSummary } = useSession();
  /** The user's latest choice; null until they touch a switch, so the saved preferences show through. */
  const [edited, setEdited] = useState<Channels | null>(null);
  const [error, setError] = useState<string | null>(null);
  const channels: Channels = edited ?? summary?.customer.channels ?? { push: true, sms: true, email: false };
  const enrolled = summary?.evStatus === 'ENROLLED';

  async function toggle(key: keyof Channels, value: boolean) {
    const previous = channels;
    const next = { ...previous, [key]: value };
    setEdited(next);
    try {
      setError(null);
      await api.updateChannels(next);
      void refreshSummary();
    } catch (e) {
      setEdited(previous);
      setError(e instanceof Error ? e.message : 'Could not save your preference');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}>
        <HeroHeader bottomPad={64} style={{ alignItems: 'center', paddingTop: 32 }}>
          <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={44} color="#FFFFFF" strokeWidth={2.4} />
          </View>
          <Txt size={26} weight="bold" color="#FFFFFF" center accessibilityRole="header">
            {enrolled ? 'You’re enrolled' : 'Notification settings'}
          </Txt>
          <Txt size={14} center color={colors.headerMuted} lh={1.5}>
            {enrolled ? `Welcome to ${PROGRAM.name}. Your ${PROGRAM.signupIncentive} sign-up reward will appear on your next bill.` : 'Choose how we reach you about grid events.'}
          </Txt>
        </HeroHeader>
        <View style={{ marginTop: -44, paddingHorizontal: 16, gap: 14, flex: 1 }}>
          <Card style={{ gap: 10 }}>
            <Txt size={16} weight="bold" color={colors.evDeep}>
              What happens next
            </Txt>
            <Bullet text="We’ll alert you here before any event on your local line." />
            <Bullet text="Your home screen now shows your program status and earnings." />
            <Bullet text="You can leave the program anytime from your Profile." />
          </Card>
          <Card padding={0} style={{ overflow: 'hidden' }}>
            <View style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 6 }}>
              <Overline color={colors.navy}>How should we reach you for events?</Overline>
            </View>
            <View style={{ paddingHorizontal: 18 }}>
              <ToggleRow label="App notification" value={channels.push} onChange={(v) => toggle('push', v)} />
              <ToggleRow label="Text message" value={channels.sms} onChange={(v) => toggle('sms', v)} />
              <ToggleRow label="Email" value={channels.email} onChange={(v) => toggle('email', v)} last />
            </View>
          </Card>
          {error ? <ErrorBox message={error} /> : null}
          <Button label="Back to home" onPress={() => router.replace('/' as never)} style={{ marginTop: 'auto' }} />
        </View>
      </ScrollView>
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Icon name="check" size={18} color={colors.ev} strokeWidth={2.4} />
      <Txt size={14} color={colors.textBody} lh={1.45} style={{ flex: 1 }}>
        {text}
      </Txt>
    </View>
  );
}

