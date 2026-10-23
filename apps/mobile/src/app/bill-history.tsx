import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fmtDate, fmtMoney, type Bill, type BillSummary } from '@demo/shared';
import { EmptyState, ErrorBox, Loading, Pill, ScreenHeader, Txt } from '../components/ui';
import { InfoSheet } from '../components/InfoSheet';
import { colors } from '../lib/theme';
import { api } from '../lib/config';

const period = (b: { periodStart: string; periodEnd: string }) =>
  `${fmtDate(b.periodStart, { month: 'short', day: 'numeric' })} – ${fmtDate(b.periodEnd, { month: 'short', day: 'numeric' })}`;

export default function BillHistoryScreen() {
  const [bills, setBills] = useState<BillSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Bill | null>(null);
  const [selected, setSelected] = useState<BillSummary | null>(null);

  // Promise chain rather than async/await: state updates happen in callbacks, never synchronously in an effect.
  const load = useCallback(
    () =>
      api.bills().then(
        (list) => {
          setError(null);
          // API returns newest first; sort defensively so the order never depends on the server.
          setBills([...list].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)));
        },
        (e: unknown) => setError(e instanceof Error ? e.message : 'Could not load your bills'),
      ),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function open(b: BillSummary) {
    setSelected(b);
    // Line items exist only for the current bill; fetch them once, on demand.
    if (bills && b.id === bills[0]?.id && !current) {
      try {
        setCurrent(await api.billCurrent());
      } catch {
        // Fall back to the summary-only sheet.
      }
    }
  }

  const isCurrent = selected != null && bills != null && selected.id === bills[0]?.id;
  const lines = isCurrent && current && current.id === selected?.id ? current.lines : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <ScreenHeader title="Bill history" backHref="/bill" />
      </SafeAreaView>
      {!bills ? (
        error ? (
          <View style={{ padding: 16 }}>
            <ErrorBox message={error} onRetry={load} />
          </View>
        ) : (
          <Loading />
        )
      ) : bills.length === 0 ? (
        <EmptyState title="No bills yet" body="Your first bill will appear here at the end of your billing period." style={{ flex: 1 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 16 }} accessibilityRole="list">
            {bills.map((b, i) => (
              <Pressable
                key={b.id}
                accessibilityRole="button"
                accessibilityLabel={`${period(b)}, ${b.kWh.toLocaleString('en-CA')} kilowatt hours, ${fmtMoney(b.total)}, ${b.status === 'PAID' ? 'paid' : 'unpaid'}`}
                onPress={() => open(b)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 12, borderBottomWidth: i === bills.length - 1 ? 0 : 1, borderBottomColor: colors.divider }}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <Txt size={15} weight="semibold">
                    {period(b)}
                  </Txt>
                  <Txt size={13} color={colors.textMuted}>
                    {b.kWh.toLocaleString('en-CA')} kWh
                  </Txt>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Txt size={15} weight="bold">
                    {fmtMoney(b.total)}
                  </Txt>
                  {b.status === 'UNPAID' ? <Pill label="Unpaid" color={colors.warningText} bg={colors.warningBg} /> : <Pill label="Paid" color={colors.successText} bg={colors.successBg} />}
                </View>
                <Txt size={20} color={colors.textMuted} aria-hidden>
                  ›
                </Txt>
              </Pressable>
            ))}
          </View>
          <Txt size={12} color={colors.textMuted} center>
            Tap a bill for details. PDF copies are not part of this demo.
          </Txt>
        </ScrollView>
      )}
      <InfoSheet
        visible={selected !== null}
        title={selected ? `Bill · ${period(selected)}` : ''}
        body={selected ? [`${selected.kWh.toLocaleString('en-CA')} kWh · ${fmtMoney(selected.total)} · ${selected.status === 'PAID' ? 'Paid' : 'Unpaid'}`] : undefined}
        bullets={lines ? lines.map((l) => `${l.label}: ${fmtMoney(l.amount)}`) : undefined}
        footnote={lines ? `Total ${fmtMoney(selected?.total ?? 0)}` : 'Line items for past bills are in the PDF copy of the bill (not part of this demo).'}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}
