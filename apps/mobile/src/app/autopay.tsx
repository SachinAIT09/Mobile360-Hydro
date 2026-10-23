import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { BRAND, fmtDate, type PaymentMethodKind } from '@demo/shared';
import { Button, ErrorBox, Loading, Pill, ScreenHeader, Txt } from '../components/ui';
import { METHODS, methodLabel, Option, Section } from '../components/PayOptions';
import { Icon } from '../components/icons';
import { colors } from '../lib/theme';
import { api } from '../lib/config';
import { useSession } from '../providers/SessionProvider';

export default function AutoPayScreen() {
  const { summary, refreshSummary } = useSession();
  const autoPay = summary?.customer.autoPay;
  const [method, setMethod] = useState<PaymentMethodKind>(autoPay?.method ?? 'SAVED_CARD');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ enabled: boolean; method: PaymentMethodKind | null } | null>(null);

  async function save(enabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      const profile = await api.updateAutoPay(enabled ? { enabled, method } : { enabled });
      await refreshSummary();
      setDone({ enabled: profile.autoPay.enabled, method: profile.autoPay.method });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update AutoPay');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <View style={{ flex: 1, padding: 24, gap: 16, justifyContent: 'center' }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.successBg, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
            <Icon name="check" size={40} color={colors.successText} strokeWidth={2.2} />
          </View>
          <Txt size={24} weight="semibold" center accessibilityRole="header">
            {done.enabled ? `AutoPay is on · ${methodLabel(done.method)}` : 'AutoPay is off'}
          </Txt>
          <Txt size={15} center color={colors.textBody} lh={1.5}>
            {done.enabled
              ? `We’ll pay each bill on its due date${summary ? `, starting ${fmtDate(summary.bill.dueDate)}` : ''}. You’ll get a notification 3 days before.`
              : 'You’ll pay each bill yourself from the Billing tab.'}
          </Txt>
          <Txt size={12} center color={colors.textMuted}>
            Payments processed by {BRAND.partners.payments} (demo — nothing is charged)
          </Txt>
          <Button label="Back to bill" onPress={() => router.replace('/bill' as never)} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <ScreenHeader title="AutoPay" backHref="/bill" />
      </SafeAreaView>
      {!summary || !autoPay ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt size={15} weight="semibold">
                {autoPay.enabled ? `AutoPay is on · ${methodLabel(autoPay.method)}` : 'AutoPay is off'}
              </Txt>
              <Txt size={13} color={colors.textMuted}>
                {autoPay.enabled
                  ? `Since ${autoPay.since ? fmtDate(autoPay.since) : '—'} · next payment ${fmtDate(summary.bill.dueDate)}`
                  : `Your next bill is due ${fmtDate(summary.bill.dueDate)}.`}
              </Txt>
            </View>
            {autoPay.enabled ? <Pill label="On" color={colors.successText} bg={colors.successBg} /> : <Pill label="Off" color={colors.textMuted} bg={colors.divider} />}
          </View>

          <Section title="Pay with">
            {METHODS.map((m) => (
              <Option key={m.key} on={method === m.key} onPress={() => setMethod(m.key)} label={m.label} />
            ))}
          </Section>

          <View style={{ backgroundColor: colors.primaryTint, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Icon name="lock" size={20} color={colors.primaryDark} />
            <Txt size={13} color={colors.primaryDark} lh={1.45} style={{ flex: 1 }}>
              We’ll pay each bill on its due date from the method you choose. You’ll get a notification 3 days before.
            </Txt>
          </View>

          {error ? <ErrorBox message={error} /> : null}
          <View style={{ marginTop: 'auto', gap: 10 }}>
            {autoPay.enabled ? (
              <>
                {method !== autoPay.method ? <Button label={`Switch to ${methodLabel(method)}`} onPress={() => save(true)} loading={busy} /> : null}
                <Button label="Turn off AutoPay" variant="secondary" onPress={() => save(false)} loading={busy} />
              </>
            ) : (
              <Button label="Turn on AutoPay" onPress={() => save(true)} loading={busy} />
            )}
            <Txt size={12} color={colors.textMuted} center>
              Processed by {BRAND.partners.payments}. Demo only — nothing is charged.
            </Txt>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
