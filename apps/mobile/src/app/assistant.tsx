import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View, type ScrollViewInstance } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ASSISTANT, type AssistantAnswer, type AssistantContext, type AssistantSuggestions } from '@demo/shared';
import { AnswerCard, AskChip, TypingBubble, UserBubble } from '../components/AssistantAnswer';
import { IconButton, IconTile, InfoNote, Txt } from '../components/ui';
import { api } from '../lib/config';
import { colors, font } from '../lib/theme';
import { runReveal, wordCount } from '../lib/typewriter';

interface Turn {
  id: number;
  question: string;
  status: 'pending' | 'done' | 'error';
  answer: AssistantAnswer | null;
  /** Words revealed so far (typewriter). */
  shown: number;
  error: string | null;
}

/** Context echoed back with the next question; only the fields the API validates. */
function nextContext(c: AssistantContext): AssistantContext {
  return c.lastIntent ? { lastIntent: c.lastIntent.slice(0, 40) } : {};
}

/** Energy assistant: a scripted, data-driven chat in a bottom sheet (same idiom as the EV-detected sheet). */
export default function AssistantSheet() {
  const insets = useSafeAreaInsets();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sugg, setSugg] = useState<AssistantSuggestions | null>(null);
  const [q, setQ] = useState('');
  const ctx = useRef<AssistantContext>({});
  const seq = useRef(0);
  const mounted = useRef(true);
  const reduceMotion = useRef(false);
  const scrollRef = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    mounted.current = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        reduceMotion.current = v;
      })
      .catch(() => undefined);
    api
      .mySuggestions()
      .then((s) => mounted.current && setSugg(s))
      .catch(() => mounted.current && setSugg({ greeting: 'Ask about your bill, usage or charging.', suggestions: [] }));
    return () => {
      mounted.current = false;
    };
  }, []);

  const update = useCallback((id: number, patch: Partial<Turn>) => {
    if (mounted.current) setTurns((t) => t.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, []);

  const ask = useCallback(
    (raw: string) => {
      const question = raw.trim().slice(0, 300);
      if (!question) return;
      const id = ++seq.current;
      setTurns((t) => [...t, { id, question, status: 'pending', answer: null, shown: 0, error: null }]);
      setQ('');
      api
        .askMe({ question, context: nextContext(ctx.current) })
        .then((answer) => {
          ctx.current = answer.context;
          const total = wordCount(answer.text);
          if (reduceMotion.current) {
            update(id, { status: 'done', answer, shown: total });
            return undefined;
          }
          update(id, { status: 'done', answer, shown: 0 });
          // Only the newest answer animates: a newer question cancels the reveal (it then shows in full).
          return runReveal(total, (n) => update(id, { shown: n }), () => !mounted.current || seq.current !== id).then(() => update(id, { shown: total }));
        })
        .catch((e: unknown) => update(id, { status: 'error', error: e instanceof Error ? e.message : 'The assistant is unavailable' }));
    },
    [update],
  );

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/' as never);
  }

  function open(route: string) {
    // Replace the sheet with the destination so Back returns to where the customer was.
    router.replace(route as never);
  }

  const maxWidth = Platform.OS === 'web' ? 480 : undefined;
  const canSend = q.trim().length > 0;

  return (
    <View style={{ flex: 1 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,33,72,0.6)' }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: insets.top + 36, alignItems: 'center' }} pointerEvents="box-none">
        <View
          accessibilityViewIsModal
          style={{ flex: 1, width: '100%', maxWidth, backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' }}
        >
          <View style={{ backgroundColor: '#FFFFFF', paddingTop: 12, paddingHorizontal: 18, paddingBottom: 12, gap: 12 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderInput, alignSelf: 'center' }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconTile name="sparkle" size={40} bg={colors.evTint} color={colors.ev} round />
              <Txt size={19} weight="bold" color={colors.navy} accessibilityRole="header" style={{ flex: 1 }}>
                {ASSISTANT.customerName}
              </Txt>
              <IconButton name="close" label="Close assistant" onPress={close} />
            </View>
            <InfoNote icon="info" tone="ev">
              {ASSISTANT.disclosure}
            </InfoNote>
          </View>

          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          >
            {turns.length === 0 ? (
              <View style={{ gap: 12 }}>
                <Txt size={15} lh={1.5} color={colors.textBody}>
                  {sugg?.greeting ?? 'Loading suggestions…'}
                </Txt>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {(sugg?.suggestions ?? []).map((s) => (
                    <AskChip key={s} label={s} onPress={() => ask(s)} />
                  ))}
                </View>
              </View>
            ) : null}
            {turns.map((t) => (
              <View key={t.id} style={{ gap: 10 }}>
                <UserBubble text={t.question} />
                {t.status === 'pending' ? <TypingBubble /> : null}
                {t.status === 'error' ? (
                  <Txt size={14} color={colors.dangerText}>
                    Sorry, I couldn&apos;t answer that ({t.error}).
                  </Txt>
                ) : null}
                {t.answer ? <AnswerCard answer={t.answer} shown={t.shown} onAsk={ask} onRoute={open} /> : null}
              </View>
            ))}
          </ScrollView>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 + insets.bottom, borderTopWidth: 1, borderTopColor: colors.divider }}>
            <TextInput
              accessibilityLabel="Ask the energy assistant"
              placeholder={ASSISTANT.placeholderCustomer}
              placeholderTextColor={colors.textMuted}
              value={q}
              onChangeText={setQ}
              onSubmitEditing={() => ask(q)}
              returnKeyType="send"
              maxLength={300}
              style={{ flex: 1, minHeight: 44, borderRadius: 22, backgroundColor: colors.inputTint, paddingHorizontal: 16, fontSize: 15, fontFamily: font.regular, color: colors.text }}
            />
            <IconButton name="send" label="Send question" onPress={() => canSend && ask(q)} bg={canSend ? colors.primary : colors.divider} color={canSend ? '#FFFFFF' : colors.textMuted} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
