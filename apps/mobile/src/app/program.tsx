import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BRAND, PROGRAM, type ChargerType, type EnrollmentSource, type Program } from '@demo/shared';
import { BackButton, Button, Card, ErrorBox, HeroHeader, InfoNote, Overline, TextLink, Txt } from '../components/ui';
import { InfoSheet } from '../components/InfoSheet';
import { Icon } from '../components/icons';
import { colors } from '../lib/theme';
import { api } from '../lib/config';
import { useSession } from '../providers/SessionProvider';

const MAKES = ['Select', 'Tesla', 'Hyundai', 'Kia', 'Ford', 'Chevrolet', 'Volkswagen', 'Other'];

export default function ProgramScreen() {
  const params = useLocalSearchParams<{ messageId?: string; source?: string }>();
  const { summary, refreshSummary } = useSession();
  const [program, setProgram] = useState<Program | null>(null);
  const [make, setMake] = useState('Select');
  const [charger, setCharger] = useState<ChargerType>('LEVEL_2');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);

  useEffect(() => {
    api.program().then(setProgram).catch(() => setProgram(null));
  }, []);

  const p = program ?? { ...PROGRAM, id: '' };
  const alreadyEnrolled = summary?.evStatus === 'ENROLLED';
  const source: EnrollmentSource = params.source === 'CAMPAIGN' ? 'CAMPAIGN' : params.source === 'APP_POPUP' ? 'APP_POPUP' : params.messageId ? 'CAMPAIGN' : 'APP_POPUP';

  async function enroll() {
    setBusy(true);
    setError(null);
    try {
      await api.enroll({
        source,
        consent,
        messageId: params.messageId || undefined,
        evMake: make === 'Select' ? undefined : make,
        chargerType: charger,
      });
      await refreshSummary();
      router.replace('/enrolled' as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enrollment failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}>
        <HeroHeader bottomPad={60} style={{ paddingHorizontal: 16 }}>
          <BackButton color="#FFFFFF" backHref="/" onDark />
          <View style={{ paddingHorizontal: 4, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="carCharge" size={14} color={colors.accent} />
              <Overline color={colors.accent}>Demand response · EV</Overline>
            </View>
            <Txt size={26} weight="bold" color="#FFFFFF" lh={1.2} accessibilityRole="header">
              {p.name}
            </Txt>
            <Txt size={14} color={colors.headerMuted} lh={1.45}>
              Charge smarter, help your local grid, and get rewarded.
            </Txt>
          </View>
        </HeroHeader>

        <View style={{ marginTop: -40, paddingHorizontal: 16, gap: 14 }}>
          <Card padding={14}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Stat value={p.signupIncentive} label="sign-up reward" />
              <Stat value={p.perEventIncentive} label="per event" />
              <Stat value={`≤ ${p.maxEventsPerSeason}`} label="events / season" />
            </View>
          </Card>

          <Card style={{ gap: 14 }}>
            <Txt size={17} weight="bold" color={colors.navy}>
              How it works
            </Txt>
            <Step n={1} text="When your local line is under strain, we send you an alert in the app." />
            <Step n={2} text={`You pause EV charging for the event window, usually ${p.typicalEventHours} hours.`} />
            <Step n={3} text="You earn a credit on your bill. Can’t take part? Opt out of that event." />
          </Card>

          {alreadyEnrolled ? (
            <InfoNote icon="check" tone="success">
              You’re already enrolled in {p.name}.
            </InfoNote>
          ) : (
            <>
              <Card style={{ gap: 10 }}>
                <Txt size={17} weight="bold" color={colors.navy}>
                  About your EV{' '}
                  <Txt size={13} color={colors.textMuted}>
                    (optional)
                  </Txt>
                </Txt>
                <Overline>Vehicle make</Overline>
                <ChipRow options={MAKES} value={make} onChange={setMake} />
                <Overline style={{ marginTop: 4 }}>Charger</Overline>
                <ChipRow options={['Level 2', 'Level 1']} value={charger === 'LEVEL_2' ? 'Level 2' : 'Level 1'} onChange={(v) => setCharger(v === 'Level 2' ? 'LEVEL_2' : 'LEVEL_1')} />
              </Card>

              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: consent }}
                accessibilityLabel={`I agree to the program terms and to ${BRAND.utilityName} using my smart meter data for this program`}
                onPress={() => setConsent((c) => !c)}
                style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', minHeight: 44, paddingHorizontal: 4 }}
              >
                <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: consent ? colors.ev : colors.gridLine, backgroundColor: consent ? colors.ev : '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                  {consent ? <Icon name="check" size={16} color="#FFFFFF" strokeWidth={2.6} /> : null}
                </View>
                <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                  <Txt size={13} color={colors.textBody} lh={1.4}>
                    I agree to the{' '}
                  </Txt>
                  <TextLink label="program terms" size={13} color={colors.ev} style={{ minHeight: 20 }} onPress={() => setTermsOpen(true)} />
                  <Txt size={13} color={colors.textBody} lh={1.4}>
                    {' '}and to {BRAND.utilityName} using my smart meter data for this program.
                  </Txt>
                </View>
              </Pressable>
            </>
          )}

          {error ? <ErrorBox message={error} /> : null}
          <View style={{ marginTop: 'auto', paddingTop: 6 }}>
            {alreadyEnrolled ? (
              <Button label="Back to home" onPress={() => router.replace('/' as never)} />
            ) : (
              <Button label="Enroll now" variant="ev" onPress={enroll} disabled={!consent} loading={busy} accessibilityLabel={consent ? 'Enroll now' : 'Enroll now. Agree to the program terms first'} />
            )}
          </View>
        </View>
      </ScrollView>
      <InfoSheet
        visible={termsOpen}
        title={`${p.name} terms`}
        body="A summary of what you agree to:"
        bullets={PROGRAM.termsSummary}
        footnote={`The full terms will link to ${BRAND.utilityName}’s terms page (${PROGRAM.termsUrl}).`}
        onClose={() => setTermsOpen(false)}
      />
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.evTintSoft, borderRadius: 14, padding: 12, gap: 2 }}>
      <Txt size={17} weight="bold" color={colors.evDeep}>
        {value}
      </Txt>
      <Txt size={11} color={colors.textMuted}>
        {label}
      </Txt>
    </View>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.ev, alignItems: 'center', justifyContent: 'center' }}>
        <Txt size={13} weight="bold" color="#FFFFFF">
          {n}
        </Txt>
      </View>
      <Txt size={14} lh={1.45} style={{ flex: 1 }} color={colors.textBody}>
        {text}
      </Txt>
    </View>
  );
}

function ChipRow({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable
            key={o}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o)}
            style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center', borderWidth: 1.5, borderColor: on ? colors.ev : colors.border, backgroundColor: on ? colors.evTint : '#FFFFFF' }}
          >
            <Txt size={14} weight={on ? 'semibold' : 'medium'} color={on ? colors.evDeep : colors.textBody}>
              {o}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
