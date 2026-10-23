import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RATE_PLANS, SMART_CHARGING, fmtMoney, fmtWindow, type RatePlanComparison, type RatePlanId, type SmartChargingPlan, type SmartChargingSettings } from '@demo/shared';
import { Button, Card, Chip, ErrorBox, InfoNote, LiveDot, Loading, NavyCard, OptionCard, Overline, Pill, ScreenHeader, SectionTitle, Txt } from '../components/ui';
import { ToggleRow } from '../components/ToggleRow';
import { ChargePlanChart, readyByLabel, timeLabel } from '../components/ChargePlanChart';
import { colors } from '../lib/theme';
import { api } from '../lib/config';
import { useSession } from '../providers/SessionProvider';

const READY_BY = ['06:00', '07:00', '08:00'];
const TARGETS = [20, 30, 40, 50];
const PLACEHOLDER_NOTE = `Rates shown are placeholders (${Object.values(RATE_PLANS)
  .map((p) => p.label)
  .join(', ')}), not your utility's actual prices. Grid CO₂ figures are illustrative.`;

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** Smart charging: settings, tonight's plan, savings and rate-plan comparison. */
export default function SmartChargingScreen() {
  const { summary } = useSession();
  const [plan, setPlan] = useState<SmartChargingPlan | null>(null);
  const [plans, setPlans] = useState<RatePlanComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [boosting, setBoosting] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([api.smartCharging(), api.ratePlans()]).then(
        ([p, r]) => {
          setPlan(p);
          setPlans(r);
          setError(null);
        },
        (e: unknown) => setError(errText(e, 'Could not load smart charging')),
      ),
    [],
  );

  // Refetch whenever the summary changes (`me:changed` from a save, a boost or a grid event refreshes it).
  useEffect(() => {
    void load();
  }, [load, summary]);

  const save = (patch: Partial<SmartChargingSettings>) => {
    if (!plan) return;
    const settings = { ...plan.settings, ...patch };
    setPlan({ ...plan, settings }); // optimistic
    api
      .updateSmartCharging(settings)
      .then((p) => {
        setPlan(p);
        setError(null);
        return api.ratePlans().then(setPlans);
      })
      .catch((e: unknown) => {
        setError(errText(e, 'Could not save smart charging'));
        void load();
      });
  };

  const boost = () => {
    setBoosting(true);
    api
      .boostCharging()
      .then((p) => {
        setPlan(p);
        setError(null);
      })
      .catch((e: unknown) => setError(errText(e, 'Could not start charging')))
      .finally(() => setBoosting(false));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <ScreenHeader title="Smart charging" backHref="/" />
      </SafeAreaView>
      {!plan ? (
        error ? (
          <View style={{ padding: 16 }}>
            <ErrorBox message={error} onRetry={() => void load()} />
          </View>
        ) : (
          <Loading />
        )
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
          {error ? <ErrorBox message={error} onRetry={() => void load()} /> : null}
          <Hero plan={plan} />

          {!plan.hasEv ? <InfoNote icon="car">We haven’t detected an EV at your home yet. Your settings are saved for when we do.</InfoNote> : null}
          {plan.settings.enabled
            ? plan.avoidedDrWindows.map((w) => (
                <InfoNote key={w.start} icon="alert" tone="warning">
                  Skips the grid event {fmtWindow(w.start, w.end)}
                </InfoNote>
              ))
            : null}
          {plan.boostUntil ? (
            <InfoNote icon="bolt" tone="ev">
              Charging now until {timeLabel(plan.boostUntil)}, then back to the plan.
            </InfoNote>
          ) : null}
          {plan.shortfallKwh > 0 ? (
            <InfoNote icon="info" tone="warning">
              Not enough time to add {plan.shortfallKwh.toFixed(1)} kWh by {readyByLabel(plan.settings.readyBy)}. Try a later ready-by time.
            </InfoNote>
          ) : null}

          <Card>
            <ToggleRow label="Smart charging" value={plan.settings.enabled} onChange={(v) => save({ enabled: v })} last />
            <Txt size={13} color={colors.textMuted} lh={1.45}>
              {SMART_CHARGING.name} charges your EV in the cheapest, cleanest hours and works around grid events.
            </Txt>
          </Card>

          <Card>
            <SectionTitle title="Ready by" />
            <View accessibilityRole="radiogroup" accessibilityLabel="Ready by" style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {READY_BY.map((t) => (
                <Chip key={t} role="radio" label={readyByLabel(t)} on={plan.settings.readyBy === t} onPress={() => save({ readyBy: t })} />
              ))}
            </View>
            <SectionTitle title="Charge to add" style={{ marginTop: 16 }} />
            <View accessibilityRole="radiogroup" accessibilityLabel="Charge to add" style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {TARGETS.map((k) => (
                <Chip key={k} role="radio" label={`${k} kWh`} on={plan.settings.targetKwh === k} onPress={() => save({ targetKwh: k })} />
              ))}
            </View>
          </Card>

          <Card>
            <SectionTitle title="Tonight’s plan" />
            <View style={{ marginTop: 12 }}>
              <ChargePlanChart hourly={plan.hourly} slots={plan.settings.enabled ? plan.slots : []} />
            </View>
          </Card>

          {plan.hasEv ? <Button label="Charge now for 1 hour" variant="secondary" onPress={boost} loading={boosting} /> : null}

          <Card>
            <SectionTitle title="Rate plan" />
            <View accessibilityRole="radiogroup" accessibilityLabel="Rate plan" style={{ gap: 8, marginTop: 10 }}>
              {(plans?.plans ?? []).map((p) => (
                <OptionCard
                  key={p.id}
                  on={plan.settings.ratePlan === p.id}
                  onPress={() => save({ ratePlan: p.id as RatePlanId })}
                  label={p.label}
                  sub={
                    plan.hasEv
                      ? `${fmtMoney(p.withSmartCharging)}/month with smart charging · ${fmtMoney(p.monthlyCost)} without`
                      : `${fmtMoney(p.monthlyCost)}/month`
                  }
                  right={p.best ? <Pill label="Best for you" color={colors.successText} bg={colors.successBg} /> : null}
                />
              ))}
            </View>
            {plans ? (
              <Txt size={12} color={colors.textMuted} style={{ marginTop: 10 }}>
                Based on {Math.round(plans.basisKwhPerMonth)} kWh a month (your recent bills). Energy charges only.
              </Txt>
            ) : null}
          </Card>

          <InfoNote>{PLACEHOLDER_NOTE}</InfoNote>
        </ScrollView>
      )}
    </View>
  );
}

function Hero({ plan }: { plan: SmartChargingPlan }) {
  const on = plan.settings.enabled && plan.hasEv;
  return (
    <NavyCard>
      <View style={{ gap: 10 }}>
        <Overline color={colors.headerMuted}>Tonight’s plan</Overline>
        <Txt size={16} weight="semibold" color="#FFFFFF">
          Ready by {readyByLabel(plan.settings.readyBy)} · {plan.settings.targetKwh} kWh
        </Txt>
        {!on ? (
          <Pill label={plan.hasEv ? 'Smart charging is off' : 'No EV detected'} color={colors.navy} bg={colors.accentTint} />
        ) : plan.chargingNow ? (
          <LiveDot label="● Charging now · 7.2 kW" />
        ) : plan.nextStart ? (
          <Pill label={`Next charge starts ${timeLabel(plan.nextStart)}`} color={colors.evText} bg={colors.evTint} />
        ) : (
          <Pill label="Charging done for tonight" color={colors.navy} bg={colors.accentTint} />
        )}
        <Txt size={30} weight="extrabold" color="#FFFFFF" lh={1.1}>
          {on ? `Saves ${fmtMoney(plan.savings)} tonight` : `Could save ${fmtMoney(plan.savings)} tonight`}
        </Txt>
        <Txt size={14} color={colors.headerMuted}>
          {plan.co2SavedKg.toFixed(1)} kg CO₂ less than charging at plug-in · {fmtMoney(plan.cost)} vs {fmtMoney(plan.baselineCost)}
        </Txt>
      </View>
    </NavyCard>
  );
}
