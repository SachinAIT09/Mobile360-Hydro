import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { fmtDate, fmtMoney, PROGRAM, type Bill, type BillSummary, type UsageMonth } from '@demo/shared';
import { Button, Card, Chip, ErrorBox, Loading, NavyCard, Overline, Pill, ScreenHeader, SectionTitle, TextLink, Txt } from '../../components/ui';
import { InfoSheet } from '../../components/InfoSheet';
import { methodLabel } from '../../components/PayOptions';
import { Icon } from '../../components/icons';
import { colors, webSwitchProps } from '../../lib/theme';
import { api } from '../../lib/config';
import { useSession } from '../../providers/SessionProvider';

/** Secondary bill actions that open an InfoSheet (PDF, receipts/invoices are not generated in the demo). */
type BillAction = 'pdf' | 'receipt' | 'invoice';
const BILL_ACTION_SHEET: Record<BillAction, { title: string; body: string }> = {
  pdf: { title: 'PDF download is coming next', body: 'Downloading this bill as a PDF will be available in an upcoming version of this demo.' },
  receipt: { title: 'Receipt', body: 'Payment receipts are emailed after each payment. Viewing them here is not part of this demo.' },
  invoice: { title: 'Invoice', body: 'The full bill PDF will be available in an upcoming version of this demo.' },
};

const LINE_COLORS = [colors.navy, colors.primary, colors.accentDark, colors.solar, colors.headerMuted, colors.purple];

type Filter = 'All bills' | 'Unpaid' | 'Paid';

export default function BillScreen() {
  const { summary, refreshSummary } = useSession();
  const [bill, setBill] = useState<Bill | null>(null);
  const [history, setHistory] = useState<BillSummary[]>([]);
  const [usage, setUsage] = useState<UsageMonth[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<BillAction | null>(null);
  const [filter, setFilter] = useState<Filter>('All bills');
  const [autoPayBusy, setAutoPayBusy] = useState(false);
  const [autoPayError, setAutoPayError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([api.billCurrent(), api.usageHistory(), api.bills().catch(() => [] as BillSummary[])]).then(
        ([b, u, h]) => {
          setBill(b);
          setUsage(u);
          setHistory(h);
          setError(null);
        },
        (e: unknown) => setError(e instanceof Error ? e.message : 'Could not load your bill'),
      ),
    [],
  );

  // Reload when the summary changes (e.g. after paying).
  useEffect(() => {
    void load();
  }, [load, summary?.bill.status]);

  async function toggleAutoPay(enabled: boolean) {
    setAutoPayBusy(true);
    setAutoPayError(null);
    try {
      await api.updateAutoPay(enabled ? { enabled: true, method: 'SAVED_CARD' } : { enabled: false });
      await refreshSummary();
    } catch (e) {
      setAutoPayError(e instanceof Error ? e.message : 'Could not update AutoPay');
    } finally {
      setAutoPayBusy(false);
    }
  }

  const autoPay = summary?.customer.autoPay.enabled ?? false;
  const unpaid = bill?.status === 'UNPAID';
  // Latest five inline; the full list lives on /bill-history.
  const shownHistory = history.filter((h) => filter === 'All bills' || (filter === 'Paid' ? h.status === 'PAID' : h.status === 'UNPAID')).slice(0, 5);
  const previous = history.find((h) => bill && h.id !== bill.id);
  const delta = bill && previous ? bill.total - previous.total : null;
  const nextEst = history.length ? history.slice(0, 3).reduce((s, h) => s + h.total, 0) / Math.min(3, history.length) : bill?.total ?? 0;
  const maxUsage = Math.max(1, ...usage.map((u) => u.kWh));
  const lineTotal = bill ? Math.max(0.01, bill.lines.reduce((s, l) => s + l.amount, 0)) : 1;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <ScreenHeader title="Bills & payments" backHref="/" right={<TextLink label="PDF" onPress={() => setSheet('pdf')} style={{ paddingHorizontal: 8 }} />} />
      </SafeAreaView>
      {!bill ? (
        error ? (
          <View style={{ padding: 16 }}>
            <ErrorBox message={error} onRetry={load} />
          </View>
        ) : (
          <Loading />
        )
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
          {/* Current bill: navy card with the Pay pill overlapping its bottom edge, AutoPay row beneath. */}
          <Card padding={0} style={{ overflow: 'visible' }}>
            <NavyCard style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, alignItems: 'center', paddingBottom: unpaid ? 44 : 22 }}>
              <Overline color={colors.headerMuted}>{unpaid ? 'Current bill' : 'Last bill · paid'}</Overline>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 8 }}>
                <Txt size={48} weight="extrabold" color="#FFFFFF">
                  {fmtMoney(bill.total).split('.')[0]}
                </Txt>
                <Txt size={24} weight="bold" color="#FFFFFF">
                  .{fmtMoney(bill.total).split('.')[1]}
                </Txt>
              </View>
              <Txt size={13} color={colors.headerMuted} center style={{ marginTop: 4 }}>
                {unpaid ? `Due ${fmtDate(bill.dueDate)}` : `Paid · ${fmtDate(bill.periodEnd)}`} · Account {summary?.customer.accountNoMasked ?? ''}
              </Txt>
              <Txt size={12} color={colors.headerMuted} center style={{ marginTop: 2 }}>
                {fmtDate(bill.periodStart, { month: 'short', day: 'numeric' })} – {fmtDate(bill.periodEnd)} · {bill.days} days · {bill.kWh.toLocaleString('en-CA')} kWh
              </Txt>
            </NavyCard>
            {unpaid ? (
              <View style={{ alignItems: 'center', marginTop: -26 }}>
                <Button label={`Pay ${fmtMoney(bill.total)}`} href="/pay" height={52} style={{ minWidth: 180, borderWidth: 4, borderColor: '#FFFFFF' }} accessibilityLabel={`Pay bill, ${fmtMoney(bill.total)}`} />
              </View>
            ) : null}
            <View style={{ paddingHorizontal: 18, paddingTop: unpaid ? 12 : 16, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Pressable accessibilityRole="link" accessibilityLabel="AutoPay settings" onPress={() => router.push('/autopay' as never)} style={{ flex: 1, gap: 2, minHeight: 44, justifyContent: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Txt size={15} weight="bold" color={colors.navy}>
                    AutoPay
                  </Txt>
                  <Icon name="chevronRight" size={16} color={colors.gridLine} />
                </View>
                <Txt size={12} color={colors.textMuted}>
                  {autoPay ? `On · ${methodLabel(summary?.customer.autoPay.method)} on the due date` : 'Pay automatically on each due date'}
                </Txt>
              </Pressable>
              <Switch value={autoPay} disabled={autoPayBusy} onValueChange={toggleAutoPay} accessibilityLabel="AutoPay" trackColor={{ false: colors.borderInput, true: colors.primary }} thumbColor={colors.surface} {...webSwitchProps} />
            </View>
            {autoPayError ? (
              <View style={{ paddingHorizontal: 18, paddingBottom: 14 }}>
                <ErrorBox message={autoPayError} />
              </View>
            ) : null}
          </Card>

          {/* Bill comparison */}
          <SectionTitle title="Usage comparison" action={{ label: 'View insights', href: '/energy' }} />
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ gap: 2 }}>
                <Txt size={15} weight="bold" color={colors.navy}>
                  Previous vs. current
                </Txt>
                <Txt size={12} color={colors.textMuted}>
                  {usage.length}-month usage history
                </Txt>
              </View>
              {delta != null ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <Txt size={15} weight="bold" color={delta <= 0 ? colors.successText : colors.danger}>
                    {delta <= 0 ? '↓' : '↑'} {fmtMoney(Math.abs(delta))}
                  </Txt>
                  <Txt size={11} color={colors.textMuted}>
                    vs last bill
                  </Txt>
                </View>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 110, marginTop: 16 }} accessibilityLabel={usage.map((u) => `${u.month} ${u.kWh} kWh`).join(', ')}>
              {usage.map((u, i) => {
                const last = i === usage.length - 1;
                return (
                  <View key={u.month} style={{ flex: 1, alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                    <Txt size={10} weight="semibold" color={last ? colors.navy : colors.textMuted}>
                      {u.kWh.toLocaleString('en-CA')}
                    </Txt>
                    <View style={{ width: '100%', height: `${Math.max(6, (u.kWh / maxUsage) * 78)}%`, borderRadius: 10, backgroundColor: last ? colors.primary : colors.accentTint }} />
                  </View>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
              {usage.map((u, i) => (
                <Txt key={u.month} size={11} center weight={i === usage.length - 1 ? 'bold' : 'regular'} color={i === usage.length - 1 ? colors.navy : colors.textMuted} style={{ flex: 1 }}>
                  {u.month}
                </Txt>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
              <Legend color={colors.accentTint} label="Previous months" />
              <Legend color={colors.primary} label="Current month" />
            </View>
          </Card>

          {/* This bill at a glance */}
          <SectionTitle title="This bill at a glance" />
          <Card>
            <Txt size={12} color={colors.textMuted}>
              {bill.kWh.toLocaleString('en-CA')} kWh metered · {bill.days}-day cycle
            </Txt>
            <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 3, marginTop: 12 }} accessibilityLabel="Bill breakdown">
              {bill.lines.map((l, i) => (
                <View key={l.label} style={{ width: `${(l.amount / lineTotal) * 100}%`, backgroundColor: LINE_COLORS[i % LINE_COLORS.length], borderRadius: 5 }} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, rowGap: 10 }}>
              {bill.lines.map((l, i) => (
                <View key={l.label} style={{ width: '50%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 8 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }} />
                  <Txt size={13} color={colors.textBody} style={{ flex: 1 }}>
                    {l.label}
                  </Txt>
                  <Txt size={13} weight="bold" color={colors.navy}>
                    {fmtMoney(l.amount)}
                  </Txt>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Txt size={14} weight="bold">
                Total
              </Txt>
              <Txt size={14} weight="bold" color={colors.navy}>
                {fmtMoney(bill.total)}
              </Txt>
            </View>
            {bill.evSharePct != null ? (
              <View style={{ marginTop: 12, backgroundColor: colors.evTintSoft, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                <Icon name="carCharge" size={16} color={colors.ev} />
                <Txt size={13} color={colors.evText}>
                  EV charging was about {Math.round(bill.evSharePct)}% of this bill.{' '}
                </Txt>
                {summary?.evStatus !== 'ENROLLED' ? <TextLink label={`Save with ${PROGRAM.name}`} size={13} color={colors.ev} onPress={() => router.push('/program' as never)} style={{ minHeight: 24 }} /> : null}
              </View>
            ) : null}
          </Card>

          {/* vs last bill / next bill */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Card style={{ flex: 1 }} padding={16}>
              <Overline>Vs last bill</Overline>
              <Txt size={24} weight="extrabold" color={delta == null ? colors.navy : delta <= 0 ? colors.successText : colors.danger} style={{ marginTop: 6 }}>
                {delta == null ? '–' : `${delta <= 0 ? '−' : '+'}${fmtMoney(Math.abs(delta))}`}
              </Txt>
              <Txt size={12} color={colors.textMuted} style={{ marginTop: 2 }}>
                {previous ? `${delta != null && previous.total ? `${delta <= 0 ? '' : '+'}${Math.round((delta / previous.total) * 100)}% · ` : ''}${fmtDate(previous.periodEnd, { month: 'short', year: 'numeric' })} ${fmtMoney(previous.total)}` : 'No previous bill'}
              </Txt>
              <TextLink label="Why it changed ›" href="/energy" size={13} style={{ minHeight: 32 }} />
            </Card>
            <NavyCard style={{ flex: 1 }} padding={16}>
              <Overline color={colors.headerMuted}>Next bill (est.)</Overline>
              <Txt size={24} weight="extrabold" color="#FFFFFF" style={{ marginTop: 6 }}>
                {fmtMoney(nextEst)}
              </Txt>
              <Txt size={12} color={colors.headerMuted} style={{ marginTop: 2 }}>
                Based on your recent bills
              </Txt>
              <TextLink label="View forecast ›" href="/energy" size={13} color="#FFFFFF" style={{ minHeight: 32 }} />
            </NavyCard>
          </View>

          {/* Payment history */}
          <SectionTitle title="Payment history" action={{ label: 'See all', href: '/bill-history' }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 16 }} style={{ marginRight: -16 }} accessibilityRole="tablist">
            {(['All bills', 'Unpaid', 'Paid'] as Filter[]).map((f) => (
              <Chip key={f} label={f} on={f === filter} onPress={() => setFilter(f)} />
            ))}
          </ScrollView>
          <Card padding={6}>
            {shownHistory.length === 0 ? (
              <Txt size={13} color={colors.textMuted} style={{ padding: 12 }}>
                {history.length === 0 ? 'Bill history is not available yet.' : 'No bills match this filter.'}
              </Txt>
            ) : (
              shownHistory.map((h, i) => {
                const paid = h.status === 'PAID';
                return (
                  <View key={h.id} style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 10 }}>
                    <View style={{ alignItems: 'center', width: 12 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: paid ? colors.navy : colors.solar, marginTop: 5 }} />
                      {i < shownHistory.length - 1 ? <View style={{ flex: 1, width: 2, backgroundColor: colors.divider, marginTop: 4 }} /> : null}
                    </View>
                    <View style={{ flex: 1, gap: 8 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ gap: 2 }}>
                          <Txt size={15} weight="bold" color={colors.navy}>
                            {fmtDate(h.periodEnd, { month: 'short', year: 'numeric' })}
                          </Txt>
                          <Txt size={12} color={colors.textMuted}>
                            {h.kWh.toLocaleString('en-CA')} kWh · {fmtDate(h.periodStart, { month: 'short', day: 'numeric' })} – {fmtDate(h.periodEnd, { month: 'short', day: 'numeric' })}
                          </Txt>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          <Txt size={15} weight="bold" color={colors.navy}>
                            {fmtMoney(h.total)}
                          </Txt>
                          {paid ? <Pill label="✓ Paid" color={colors.primaryDark} bg={colors.primaryTint} /> : <Pill label="Unpaid" color={colors.warningText} bg={colors.warningBg} />}
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <SmallAction icon="receipt" label="Receipt" onPress={() => setSheet('receipt')} />
                        <SmallAction icon="download" label="Invoice" onPress={() => setSheet('invoice')} />
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </Card>
        </ScrollView>
      )}
      <InfoSheet
        visible={sheet !== null}
        title={sheet ? BILL_ACTION_SHEET[sheet].title : ''}
        body={sheet ? BILL_ACTION_SHEET[sheet].body : undefined}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
      <Txt size={12} color={colors.textMuted}>
        {label}
      </Txt>
    </View>
  );
}

function SmallAction({ icon, label, onPress }: { icon: 'receipt' | 'download'; label: string; onPress: () => void }) {
  return (
    <Button label={label} variant="secondary" height={40} onPress={onPress} icon={<Icon name={icon} size={16} color={colors.navy} />} style={{ flex: 1 }} />
  );
}
