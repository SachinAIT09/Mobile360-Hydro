import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { BRAND, PROGRAM } from '@demo/shared';
import { Avatar, Button, Card, ErrorBox, HeroHeader, ListRow, Loading, Overline, Txt } from '../../components/ui';
import { InfoSheet } from '../../components/InfoSheet';
import { methodLabel } from '../../components/PayOptions';
import { Icon } from '../../components/icons';
import { colors } from '../../lib/theme';
import { useAuth } from '../../providers/AuthProvider';
import { useSession } from '../../providers/SessionProvider';

type Sheet = { title: string; body: string | string[]; bullets?: readonly string[] } | null;

export default function ProfileScreen() {
  const { logout } = useAuth();
  const { summary, summaryError, refreshSummary } = useSession();
  const [sheet, setSheet] = useState<Sheet>(null);

  if (!summary) {
    return summaryError ? (
      <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
        <ErrorBox message={summaryError} onRetry={refreshSummary} />
      </View>
    ) : (
      <Loading />
    );
  }

  const { customer, evStatus, program } = summary;
  const ch = customer.channels;
  const channelsLine = [ch.push ? 'App' : null, ch.sms ? 'Text' : null, ch.email ? 'Email' : null].filter(Boolean).join(' · ') || 'All off';
  const notInDemo = (title: string, what: string) => setSheet({ title, body: `${what} is not part of this demo.` });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <HeroHeader bottomPad={24}>
          <Txt size={20} weight="bold" color="#FFFFFF" accessibilityRole="header">
            Profile
          </Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Avatar name={`${customer.firstName} ${customer.lastName}`} size={64} onDark />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Txt size={20} weight="bold" color="#FFFFFF" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {customer.firstName} {customer.lastName}
                </Txt>
                <Icon name="verified" size={18} color={colors.accent} />
              </View>
              <Txt size={13} color={colors.headerMuted} numberOfLines={1}>
                {customer.email}
              </Txt>
            </View>
            <Button label="Edit" variant="onDark" height={40} icon={<Icon name="edit" size={16} color="#FFFFFF" />} onPress={() => notInDemo('Edit profile', 'Editing your profile')} />
          </View>
          <View style={{ flexDirection: 'row', gap: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)', paddingTop: 16 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Overline color={colors.headerMuted}>Account number</Overline>
              <Txt size={15} weight="bold" color="#FFFFFF" mono>
                {customer.accountNoMasked}
              </Txt>
            </View>
            <View style={{ flex: 1.4, gap: 4 }}>
              <Overline color={colors.headerMuted}>Service address</Overline>
              <Txt size={14} weight="semibold" color="#FFFFFF" lh={1.35}>
                {customer.address}
              </Txt>
            </View>
          </View>
        </HeroHeader>

        <View style={{ paddingHorizontal: 16, paddingTop: 20, gap: 22 }}>
          <Group title="Account">
            <ListRow icon="user" title="Personal information" sub="Name, email, phone" href="/settings" />
            <ListRow icon="home" title="Account & service" sub={customer.address} onPress={() => setSheet({ title: 'Account & service', body: [`Account ${customer.accountNoMasked}`, customer.address, `Feeder ${customer.feederCode} · Substation ${customer.substationCode}`, customer.hasSolar ? 'Rooftop solar on this premise.' : 'No solar on this premise.'] })} />
            <ListRow icon="card" title="AutoPay" sub={customer.autoPay.enabled ? `On · ${methodLabel(customer.autoPay.method)}` : 'Off'} href="/autopay" />
            <ListRow icon="document" title="Billing preferences" sub="Paperless on · bill history" href="/bill-history" />
            <ListRow icon="wallet" title="Payment methods" sub={methodLabel(customer.autoPay.method ?? 'SAVED_CARD')} href="/autopay" last />
          </Group>

          <Group title="Preferences">
            <ListRow icon="bell" title="Notifications" sub={`Grid events: ${channelsLine}`} href="/settings" accessibilityLabel={`Notifications. Grid events: ${channelsLine}. Opens settings`} />
            <ListRow icon="chart" title="Usage preferences" sub="Live feed, kWh, cost estimate" href="/energy" last />
          </Group>

          <Group title="Program">
            <ListRow
              icon="carCharge"
              title={program.name}
              sub={evStatus === 'ENROLLED' ? 'Enrolled · you earn credits for pausing EV charging' : evStatus === 'DETECTED_NOT_ENROLLED' ? `EV detected · earn ${program.signupIncentive} by enrolling` : 'Demand response for EV owners'}
              href="/program"
              last
            />
          </Group>

          <Group title="Support">
            <ListRow icon="phone" title="Support & requests" sub={`Emergency: ${BRAND.emergencyNumber}`} onPress={() => setSheet({ title: 'Support', body: [`Downed wire or emergency: call 911, then ${BRAND.emergencyNumber}.`, 'Other requests are not part of this demo.'] })} />
            <ListRow icon="shield" title="Privacy" sub="Policy, data controls, terms" onPress={() => setSheet({ title: 'Privacy & program terms', body: 'A summary of what the program asks you to agree to:', bullets: PROGRAM.termsSummary })} />
            <ListRow icon="info" title="About" sub={BRAND.conceptLabel} onPress={() => setSheet({ title: `About ${BRAND.appName}`, body: [BRAND.conceptLabel, `Built by ${BRAND.vendorName} for ${BRAND.utilityName}. EV detection by ${BRAND.partners.evDetection}, payments by ${BRAND.partners.payments} (both simulated).`] })} last />
          </Group>

          <Group title="Account actions">
            <ListRow icon="logout" title="Sign out" sub="You can sign back in any time" onPress={() => void logout().then(() => router.replace('/login' as never))} last />
          </Group>
        </View>
      </ScrollView>
      <InfoSheet visible={sheet !== null} title={sheet?.title ?? ''} body={sheet?.body} bullets={sheet?.bullets} onClose={() => setSheet(null)} />
    </View>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Overline color={colors.navy} style={{ paddingHorizontal: 4 }}>
        {title}
      </Overline>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        {children}
      </Card>
    </View>
  );
}
