import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandLogo, Button, ErrorBox, Overline, TextLink, Txt, WaveDecor } from '../components/ui';
import { InfoSheet } from '../components/InfoSheet';
import { Icon } from '../components/icons';
import { colors, gradientProps, shadowFloat, webSwitchProps } from '../lib/theme';
import { Field } from '../components/Field';
import { useAuth } from '../providers/AuthProvider';
import { BRAND } from '@demo/shared';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('manny@demo.test');
  const [password, setPassword] = useState('demo');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'forgot' | 'register' | null>(null);
  const [biometric, setBiometric] = useState(false);
  const biometricTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (biometricTimer.current) clearTimeout(biometricTimer.current); }, []);

  /** Mock biometric prompt: a 700 ms "Checking Face ID…" overlay, then the normal sign-in. No native module. */
  function biometricSignIn() {
    if (biometric || busy) return;
    setBiometric(true);
    biometricTimer.current = setTimeout(() => {
      setBiometric(false);
      void submit();
    }, 700);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.replace('/' as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {/* Navy hero: the white card below overlaps its bottom edge. */}
          <LinearGradient {...gradientProps.hero} style={{ overflow: 'hidden', borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
            <WaveDecor />
            <SafeAreaView edges={['top']}>
              <View style={{ paddingTop: 36, paddingHorizontal: 28, paddingBottom: 150, gap: 10 }}>
                <Overline color={colors.headerMuted}>Welcome back</Overline>
                <Txt size={34} weight="bold" color="#FFFFFF" lh={1.15} accessibilityRole="header">
                  Sign in to{'\n'}
                  <Txt size={34} weight="regular" color="#FFFFFF">
                    your energy.
                  </Txt>
                </Txt>
              </View>
            </SafeAreaView>
          </LinearGradient>

          <View style={[{ marginTop: -128, marginHorizontal: 20, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 22, gap: 14 }, shadowFloat]}>
            <Field label="Email or account number" value={email} onChangeText={setEmail} placeholder="name@example.com" autoComplete="email" icon="mail" />
            <Field label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secure icon="lock" />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Switch value={remember} onValueChange={setRemember} accessibilityLabel="Remember me" trackColor={{ false: colors.borderInput, true: colors.primary }} thumbColor={colors.surface} {...webSwitchProps} />
                <Txt size={14} weight="medium">
                  Remember me
                </Txt>
              </View>
              <TextLink label="Forgot password?" color={colors.purple} onPress={() => setSheet('forgot')} />
            </View>
            {error ? <ErrorBox message={error} /> : null}
            <Button label="Sign in" onPress={submit} loading={busy} />
            <Button
              label="Sign in with Face ID / fingerprint"
              variant="secondary"
              onPress={biometricSignIn}
              loading={biometric}
              icon={<Icon name="fingerprint" size={20} color={colors.navy} />}
            />
            <Txt size={12} color={colors.textMuted} center>
              Demo logins: manny@demo.test / priya@demo.test, any password
            </Txt>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
            <Txt size={14} color={colors.textMuted}>
              New to {BRAND.appName}?{' '}
            </Txt>
            <TextLink label="Register your account" color={colors.navy} onPress={() => setSheet('register')} />
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/outage-report' as never)}
            style={{ marginHorizontal: 20, marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.warningBg, minHeight: 44 }}
          >
            <Icon name="alert" size={22} color={colors.warningText} />
            <Txt size={14} weight="medium" color={colors.warningText} style={{ flex: 1 }}>
              Power out? Report an outage without signing in
            </Txt>
            <Icon name="chevronRight" size={18} color={colors.warningText} />
          </Pressable>

          <View style={{ marginTop: 'auto', alignItems: 'center', paddingTop: 28, gap: 6 }}>
            <BrandLogo width={150} onDark={false} />
            <Txt size={11} color={colors.textMuted}>
              {BRAND.conceptLabel}
            </Txt>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <InfoSheet
        visible={sheet !== null}
        title={sheet === 'forgot' ? 'Password reset' : 'Registration'}
        body={[
          sheet === 'forgot' ? 'Password reset is not part of this demo.' : 'Registering a new account is not part of this demo.',
          DEMO_LOGIN_HINT,
        ]}
        onClose={() => setSheet(null)}
      />

      {/* Biometric mock overlay */}
      <Modal visible={biometric} transparent animationType="fade" onRequestClose={() => undefined} statusBarTranslucent>
        <View
          accessibilityViewIsModal
          accessibilityRole="alert"
          accessibilityLabel="Checking Face ID"
          style={{ flex: 1, backgroundColor: 'rgba(8,33,72,0.6)', alignItems: 'center', justifyContent: 'center' }}
        >
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 24, paddingVertical: 24, paddingHorizontal: 28, alignItems: 'center', gap: 14, minWidth: 220 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="fingerprint" size={34} color={colors.primary} strokeWidth={1.7} />
            </View>
            <Txt size={16} weight="semibold">
              Checking Face ID…
            </Txt>
            <ActivityIndicator color={colors.primary} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const DEMO_LOGIN_HINT = 'Use manny@demo.test or priya@demo.test with any password.';
