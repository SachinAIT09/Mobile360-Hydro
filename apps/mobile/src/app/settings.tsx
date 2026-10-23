import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { BRAND, PROGRAM, fmtDate, type Channels } from '@demo/shared';
import { Button, ErrorBox, Loading, Pill, ScreenHeader, Txt } from '../components/ui';
import { ToggleRow } from '../components/ToggleRow';
import { methodLabel } from '../components/PayOptions';
import { colors } from '../lib/theme';
import { api } from '../lib/config';
import { useSession } from '../providers/SessionProvider';
import { useAuth } from '../providers/AuthProvider';

export default function SettingsScreen() {
  const { summary, refreshSummary } = useSession();
  const { logout } = useAuth();
  const [edited, setEdited] = useState<Channels | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  if (!summary) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
          <ScreenHeader title="Settings" backHref="/" />
        </SafeAreaView>
        <Loading />
      </View>
    );
  }

  const { customer, evStatus, bill } = summary;
  const channels: Channels = edited ?? customer.channels;
  const enrolled = evStatus === 'ENROLLED';
  const version = Constants.expoConfig?.version;

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

  async function signOut() {
    setLeaving(true);
    await logout();
    router.replace('/login' as never);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <ScreenHeader title="Settings" backHref="/" />
      </SafeAreaView>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 28 }}>
        {/* Profile */}
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, gap: 4 }}>
          <Txt size={18} weight="semibold">
            {customer.firstName} {customer.lastName}
          </Txt>
          <Txt size={13} color={colors.textMuted}>
            Account {customer.accountNoMasked}
          </Txt>
          <Txt size={13} color={colors.textMuted}>
            {customer.address}
          </Txt>
        </View>

        {/* Notifications */}
        <SettingsCard title="Notifications" sub="How we reach you for grid events and outages">
          <ToggleRow label="App notification" value={channels.push} onChange={(v) => toggle('push', v)} />
          <ToggleRow label="Text message" value={channels.sms} onChange={(v) => toggle('sms', v)} />
          <ToggleRow label="Email" value={channels.email} onChange={(v) => toggle('email', v)} last />
          {error ? <ErrorBox message={error} /> : null}
        </SettingsCard>

        {/* Payments */}
        <SettingsCard title="Payments">
          <LinkRow
            label="AutoPay"
            value={customer.autoPay.enabled ? `On · ${methodLabel(customer.autoPay.method)}` : 'Off'}
            pill={customer.autoPay.enabled ? { label: 'On', color: colors.successText, bg: colors.successBg } : undefined}
            onPress={() => router.push('/autopay' as never)}
          />
          <LinkRow label="Bill history" value={`Latest ${fmtDate(bill.periodEnd, { month: 'short', day: 'numeric' })} · ${bill.status === 'PAID' ? 'paid' : 'unpaid'}`} onPress={() => router.push('/bill-history' as never)} last />
        </SettingsCard>

        {/* Program */}
        <SettingsCard title="Program">
          <LinkRow
            label={PROGRAM.name}
            value={enrolled ? 'Enrolled · alerts before each grid event' : evStatus === 'DETECTED_NOT_ENROLLED' ? 'EV detected · not enrolled' : 'Not enrolled'}
            pill={enrolled ? { label: 'Enrolled', color: colors.evText, bg: colors.evTint } : undefined}
            onPress={() => router.push('/program' as never)}
          />
          <LinkRow label="Program terms" value="What you agree to" onPress={() => router.push('/program-terms' as never)} last />
        </SettingsCard>

        {/* About */}
        <SettingsCard title="About">
          <Txt size={14}>{BRAND.appName}</Txt>
          <Txt size={13} color={colors.textMuted}>
            {BRAND.conceptLabel}
          </Txt>
          <Txt size={13} color={colors.textMuted}>
            Built by {BRAND.vendorName}
            {version ? ` · v${version}` : ''}
          </Txt>
        </SettingsCard>

        <View style={{ gap: 10, marginTop: 8 }}>
          <Button label="Switch account" variant="secondary" onPress={signOut} loading={leaving} accessibilityLabel="Switch account: sign out and sign in as another demo customer" />
          <Txt size={12} color={colors.textMuted} center>
            Presenter: signs out so you can sign in as another demo customer.
          </Txt>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            disabled={leaving}
            onPress={signOut}
            style={({ pressed }) => ({ minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}
          >
            <Txt size={15} weight="medium" color={colors.dangerText}>
              Sign out
            </Txt>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function SettingsCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, gap: 4 }}>
      <Txt size={15} weight="semibold">
        {title}
      </Txt>
      {sub ? (
        <Txt size={12} color={colors.textMuted} style={{ marginBottom: 4 }}>
          {sub}
        </Txt>
      ) : null}
      {children}
    </View>
  );
}

function LinkRow({ label, value, pill, onPress, last }: { label: string; value: string; pill?: { label: string; color: string; bg: string }; onPress: () => void; last?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${value}`}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.divider }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={15}>{label}</Txt>
        <Txt size={13} color={colors.textMuted}>
          {value}
        </Txt>
      </View>
      {pill ? <Pill label={pill.label} color={pill.color} bg={pill.bg} /> : null}
      <Txt size={20} color={colors.textMuted} aria-hidden>
        ›
      </Txt>
    </Pressable>
  );
}
