import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { BRAND, fmtTime, type Outage, type OutageReportResponse, type OutageReportType } from '@demo/shared';
import { Button, Card, ErrorBox, InfoNote, OptionCard, Overline, Txt } from './ui';
import { Field } from './Field';
import { MapView } from './MapView';
import { Icon } from './icons';
import { colors, webSwitchProps } from '../lib/theme';
import { api } from '../lib/config';

const TYPES: { key: OutageReportType; label: string; sub: string }[] = [
  { key: 'NO_POWER', label: 'No power at all', sub: 'Everything is off' },
  { key: 'PARTIAL', label: 'Partial power / lights dim', sub: 'Some circuits work' },
  { key: 'FLICKER', label: 'Lights flickering', sub: 'Power keeps cutting in and out' },
];

/** Report-an-outage body, shared by the signed-in tab and the public (signed-out) route. */
export function OutageForm({ signedInAddress, onDone }: { signedInAddress: string | null; onDone: () => void }) {
  const [nearby, setNearby] = useState<Outage | null>(null);
  const [type, setType] = useState<OutageReportType>('NO_POWER');
  const [notify, setNotify] = useState(true);
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<OutageReportResponse | null>(null);

  const loadNearby = useCallback(() => {
    if (!signedInAddress) return Promise.resolve();
    return api.outageNearMe().then(setNearby, () => setNearby(null));
  }, [signedInAddress]);

  useEffect(() => {
    void loadNearby();
  }, [loadNearby]);

  async function submit() {
    if (!signedInAddress && !address.trim()) {
      setError('Please enter the address with the outage.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.reportOutage({ type, notifyOnRestore: notify, address: signedInAddress ? undefined : address.trim() });
      setDone(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your report');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const o = done.linkedOutage ?? nearby;
    return (
      <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
        <Card style={{ alignItems: 'center', gap: 14 }} padding={24}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.successBg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={38} color={colors.successText} strokeWidth={2.4} />
          </View>
          <Txt size={22} weight="bold" color={colors.navy} center>
            Thanks, we’ve got your report
          </Txt>
          <Txt size={15} center color={colors.textBody} lh={1.5}>
            Reference{' '}
            <Txt size={15} weight="bold" mono>
              {done.reference}
            </Txt>
            {o ? `. It’s linked to a known outage affecting ${o.affectedCount} customers${o.estRestoreAt ? `, estimated restoration ${fmtTime(o.estRestoreAt)}` : ''}.` : '.'}
            {notify ? ' We’ll text you when power is back.' : ''}
          </Txt>
          <Button label="Done" onPress={onDone} style={{ width: '100%' }} />
        </Card>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: colors.dangerBg, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 }}>
        <Icon name="alert" size={20} color={colors.dangerText} />
        <Txt size={13} color={colors.dangerText} lh={1.4} style={{ flex: 1 }}>
          <Txt size={13} weight="bold" color={colors.dangerText}>
            Downed wire?{' '}
          </Txt>
          Stay well back and call 911, then {BRAND.emergencyNumber}.
        </Txt>
      </View>

      {signedInAddress ? (
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <MapView outage={nearby ? { affectedCount: nearby.affectedCount, status: nearby.status, etaLabel: nearby.estRestoreAt ? `estimated restoration ${fmtTime(nearby.estRestoreAt)}` : undefined } : null} />
          <View style={{ paddingVertical: 12, paddingHorizontal: 16, gap: 4 }}>
            <Txt size={15} weight="bold" color={colors.navy}>
              {nearby ? 'Known outage near you' : 'No known outages near you'}
            </Txt>
            <Txt size={13} color={colors.textMuted}>
              {nearby
                ? `${nearby.affectedCount} customers affected · ${nearby.status === 'CREW_ASSIGNED' ? 'Crew assigned' : nearby.status === 'INVESTIGATING' ? 'Investigating' : 'Restored'}${nearby.estRestoreAt ? ` · Est. restoration ${fmtTime(nearby.estRestoreAt)}` : ''}`
                : 'If your power is out, tell us below.'}
            </Txt>
          </View>
        </Card>
      ) : null}

      <Card style={{ gap: 10 }}>
        {signedInAddress ? (
          <View style={{ gap: 2 }}>
            <Overline>Address</Overline>
            <Txt size={15} weight="bold" color={colors.navy}>
              {signedInAddress}
            </Txt>
          </View>
        ) : (
          <Field label="Address with the outage" value={address} onChangeText={setAddress} placeholder="Street address, town" autoComplete="street-address" icon="home" />
        )}
        <Txt size={16} weight="bold" color={colors.navy} style={{ marginTop: 6 }}>
          What’s happening?
        </Txt>
        <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
          {TYPES.map((t) => (
            <OptionCard key={t.key} on={t.key === type} onPress={() => setType(t.key)} label={t.label} sub={t.sub} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, marginTop: 4 }}>
          <Txt size={14} weight="medium">
            Text me when power is back
          </Txt>
          <Switch value={notify} onValueChange={setNotify} accessibilityLabel="Text me when power is back" trackColor={{ false: colors.borderInput, true: colors.primary }} thumbColor={colors.surface} {...webSwitchProps} />
        </View>
      </Card>
      <InfoNote icon="info">Reports go straight to the outage desk. Crews are dispatched to confirmed outages first.</InfoNote>
      {error ? <ErrorBox message={error} /> : null}
      <Button label="Submit report" onPress={submit} loading={busy} />
    </ScrollView>
  );
}
