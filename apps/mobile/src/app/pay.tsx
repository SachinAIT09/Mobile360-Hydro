import React, { useEffect, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BRAND, fmtDate, fmtMoney, fmtTime, type Bill, type Payment, type PaymentMethodKind } from '@demo/shared';
import { Button, Card, ErrorBox, InfoNote, Loading, NavyCard, OptionCard, Overline, ScreenHeader, TextLink, Txt, WaveDecor } from '../components/ui';
import { InfoSheet } from '../components/InfoSheet';
import { METHODS as PAY_METHODS, methodLabel as sharedMethodLabel } from '../components/PayOptions';
import { Icon, type IconName } from '../components/icons';
import { colors, font, gradientProps, shadowFloat } from '../lib/theme';
import { api } from '../lib/config';
import { useSession } from '../providers/SessionProvider';

/** Shared method list (components/PayOptions) plus a subline and icon per method for the card look. */
const METHOD_META: Record<PaymentMethodKind, { sub: string; icon: IconName }> = {
  SAVED_CARD: { sub: 'Default payment method', icon: 'card' },
  BANK_PAD: { sub: 'Pre-authorized debit', icon: 'wallet' },
  WALLET: { sub: 'Pay with your device wallet', icon: 'phone' },
};
const METHODS = PAY_METHODS.map((m) => ({ ...m, ...METHOD_META[m.key] }));

const STEPS = ['Amount', 'Pay with', 'Confirm'] as const;

export default function PayScreen() {
  const { refreshSummary, summary } = useSession();
  const [bill, setBill] = useState<Bill | null>(null);
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<'due' | 'other'>('due');
  const [other, setOther] = useState('');
  const [method, setMethod] = useState<PaymentMethodKind>('SAVED_CARD');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<Payment | null>(null);
  const [addMethodOpen, setAddMethodOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState<'receipt' | 'share' | null>(null);

  useEffect(() => {
    api.billCurrent().then(setBill).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load bill'));
  }, []);

  const amount = bill ? (mode === 'due' ? bill.total : Number(other.replace(/[^0-9.]/g, '')) || 0) : 0;
  const methodLabel = sharedMethodLabel(method);

  function next() {
    if (amount <= 0) {
      setError('Enter an amount greater than $0.');
      return;
    }
    setError(null);
    setStep((s) => Math.min(2, s + 1));
  }

  async function pay() {
    if (!bill) return;
    if (amount <= 0) {
      setError('Enter an amount greater than $0.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const p = await api.pay({ billId: bill.id, amount: Math.round(amount * 100) / 100, method });
      setPaid(p);
      void refreshSummary();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed');
    } finally {
      setBusy(false);
    }
  }

  if (paid) {
    return (
      <LinearGradient {...gradientProps.hero} style={{ flex: 1 }}>
        <WaveDecor opacity={0.08} />
        <SafeAreaView style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20, justifyContent: 'center' }}>
            <View style={[{ backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, gap: 14, alignItems: 'center' }, shadowFloat]}>
              <View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: colors.successBg, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="check" size={44} color={colors.successText} strokeWidth={2.4} />
              </View>
              <Txt size={24} weight="bold" color={colors.navy} center accessibilityRole="header">
                Payment success
              </Txt>
              <Txt size={14} color={colors.textMuted} center lh={1.5}>
                Thanks, {summary?.customer.firstName ?? 'there'}. Your payment has been received.
              </Txt>
              <Txt size={34} weight="extrabold" color={colors.primary}>
                {fmtMoney(paid.amount)}
              </Txt>
              <View style={{ width: '100%', borderTopWidth: 1, borderTopColor: colors.divider, borderStyle: 'dashed', paddingTop: 12, gap: 10 }}>
                <DetailRow label="Confirmation no." value={paid.confirmationNo} mono />
                <DetailRow label="Method" value={sharedMethodLabel(paid.method)} />
                <DetailRow label="Date" value={`${fmtDate(paid.createdAt)} · ${fmtTime(paid.createdAt)}`} />
                <DetailRow label="Account" value={summary?.customer.accountNoMasked ?? ''} mono />
              </View>
              <Txt size={11} color={colors.textMuted} center lh={1.4}>
                Processed by {BRAND.partners.payments} (demo — no real payment was taken). An email receipt is on its way.
              </Txt>
              <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                <Button label="Receipt" variant="secondary" height={44} style={{ flex: 1 }} icon={<Icon name="download" size={16} color={colors.navy} />} onPress={() => setShareOpen('receipt')} />
                <Button label="Share" variant="secondary" height={44} style={{ flex: 1 }} icon={<Icon name="share" size={16} color={colors.navy} />} onPress={() => setShareOpen('share')} />
              </View>
              <Button label="Back to home" onPress={() => router.replace('/' as never)} style={{ width: '100%' }} />
            </View>
          </ScrollView>
        </SafeAreaView>
        <InfoSheet visible={shareOpen !== null} title={shareOpen === 'receipt' ? 'Receipt' : 'Share'} body={shareOpen === 'receipt' ? 'Your receipt has been emailed. Downloading it here is not part of this demo.' : 'Sharing a receipt is not part of this demo.'} onClose={() => setShareOpen(null)} />
      </LinearGradient>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <ScreenHeader title="Pay bill" onBack={step > 0 ? () => setStep((s) => s - 1) : undefined} backHref="/bill" />
        {/* 3-step progress */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, backgroundColor: '#FFFFFF', gap: 8 }} accessibilityLabel={`Step ${step + 1} of 3: ${STEPS[step]}`}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {STEPS.map((s, i) => (
              <View key={s} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= step ? colors.primary : colors.divider }} />
            ))}
          </View>
          <View style={{ flexDirection: 'row' }}>
            {STEPS.map((s, i) => (
              <Txt key={s} size={11} weight={i === step ? 'bold' : 'medium'} color={i <= step ? colors.primary : colors.textMuted} style={{ flex: 1, textAlign: i === 0 ? 'left' : i === 2 ? 'right' : 'center' }}>
                {s}
              </Txt>
            ))}
          </View>
        </View>
      </SafeAreaView>
      {!bill ? (
        error ? (
          <View style={{ padding: 16 }}>
            <ErrorBox message={error} />
          </View>
        ) : (
          <Loading />
        )
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <Card padding={0} style={{ overflow: 'hidden' }}>
            <NavyCard style={{ borderRadius: 0, alignItems: 'center', paddingVertical: 22 }}>
              <Overline color={colors.headerMuted}>{step === 2 ? 'You’re paying' : 'Bill'}</Overline>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6 }}>
                <Txt size={44} weight="extrabold" color="#FFFFFF">
                  {fmtMoney(step === 2 ? amount : bill.total).split('.')[0]}
                </Txt>
                <Txt size={22} weight="bold" color="#FFFFFF">
                  .{fmtMoney(step === 2 ? amount : bill.total).split('.')[1]}
                </Txt>
              </View>
              <Txt size={13} color={colors.headerMuted} center style={{ marginTop: 4 }}>
                Due {fmtDate(bill.dueDate)} · Account {summary?.customer.accountNoMasked ?? ''}
              </Txt>
            </NavyCard>

            <View style={{ padding: 16, gap: 10 }}>
              {step === 0 ? (
                <>
                  <OptionCard on={mode === 'due'} onPress={() => setMode('due')} label="Pay amount due" sub="Clear your balance in full" right={<Txt weight="bold" color={colors.navy}>{fmtMoney(bill.total)}</Txt>} />
                  <OptionCard
                    on={mode === 'other'}
                    onPress={() => setMode('other')}
                    label="Other amount"
                    sub="Pay part of the bill now and the rest later"
                    right={
                      mode === 'other' ? (
                        <TextInput
                          accessibilityLabel="Other amount in dollars"
                          value={other}
                          onChangeText={setOther}
                          keyboardType="decimal-pad"
                          placeholder="$ 0.00"
                          placeholderTextColor="#9AA7B8"
                          style={{ width: 96, minHeight: 36, borderBottomWidth: 1.5, borderColor: colors.primary, fontFamily: font.semibold, fontSize: 15, color: colors.navy, textAlign: 'right' }}
                        />
                      ) : (
                        <Txt color={colors.textMuted}>$ ____</Txt>
                      )
                    }
                  />
                </>
              ) : step === 1 ? (
                <>
                  {METHODS.map((m) => (
                    <OptionCard key={m.key} on={method === m.key} onPress={() => setMethod(m.key)} label={m.label} sub={m.sub} right={<Icon name={m.icon} size={20} color={colors.navy} />} />
                  ))}
                  <TextLink label="+ Add a payment method" onPress={() => setAddMethodOpen(true)} />
                </>
              ) : (
                <View style={{ gap: 10 }}>
                  <DetailRow label="Amount" value={fmtMoney(amount)} />
                  <DetailRow label="Pay with" value={methodLabel} />
                  <DetailRow label="Payment date" value="Today" />
                  <DetailRow label="Account" value={summary?.customer.accountNoMasked ?? ''} mono />
                </View>
              )}
            </View>
          </Card>

          <InfoNote icon="lock">
            <Txt size={13} weight="bold" color={colors.navy}>
              Secure checkout.{' '}
            </Txt>
            Payments are processed by {BRAND.partners.payments}. You’ll get a confirmation number and an email receipt.
          </InfoNote>

          {error ? <ErrorBox message={error} /> : null}
          <View style={{ marginTop: 'auto', gap: 10 }}>
            {step < 2 ? <Button label={`Continue · ${fmtMoney(amount)}`} onPress={next} /> : <Button label={`Pay ${fmtMoney(amount)}`} onPress={pay} loading={busy} />}
            {step > 0 ? <Button label="Back" variant="ghost" onPress={() => setStep((s) => s - 1)} /> : null}
          </View>
        </ScrollView>
      )}
      <InfoSheet
        visible={addMethodOpen}
        title="Add a payment method"
        body={`Adding a payment method happens on ${BRAND.partners.payments}’s secure page. Not part of this demo.`}
        onClose={() => setAddMethodOpen(false)}
      />
    </View>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <Txt size={13} color={colors.textMuted}>
        {label}
      </Txt>
      <Txt size={13} weight="bold" color={colors.navy} mono={mono} style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Txt>
    </View>
  );
}
