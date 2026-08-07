import type { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '@/constants/theme';
import { useNativeServices } from '@/providers/NativeServicesProvider';

export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  const { online } = useNativeServices();
  const content = scroll
    ? <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    : <View style={styles.fillContent}>{children}</View>;
  return <View style={styles.screen}><SafeAreaView style={styles.safe}>{!online ? <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.offline}><Text style={styles.offlineText}>You are offline. Reconnect before saving changes.</Text></View> : null}<KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>{content}</KeyboardAvoidingView></SafeAreaView></View>;
}

export function Eyebrow({ children }: PropsWithChildren) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Title({ children }: PropsWithChildren) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Body({ children, muted = true }: PropsWithChildren<{ muted?: boolean }>) {
  return <Text style={[styles.body, !muted && styles.bodyStrong]}>{children}</Text>;
}

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle | ViewStyle[] }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput {...props} accessibilityLabel={props.accessibilityLabel || label} placeholderTextColor={colors.chalkMuted} style={[styles.input, props.multiline && styles.inputMultiline, props.style]} />{hint ? <Text style={styles.hint}>{hint}</Text> : null}</View>;
}

export function Button({ children, onPress, disabled, variant = 'primary', accessibilityLabel }: PropsWithChildren<{ onPress?: () => void; disabled?: boolean; variant?: 'primary' | 'secondary' | 'danger'; accessibilityLabel?: string }>) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: !!disabled }} onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.button, variant === 'secondary' && styles.buttonSecondary, variant === 'danger' && styles.buttonDanger, disabled && styles.disabled, pressed && !disabled && styles.pressed]}><Text style={[styles.buttonText, variant === 'secondary' && styles.buttonSecondaryText, variant === 'danger' && styles.buttonDangerText]}>{children}</Text></Pressable>;
}

export function Message({ children, tone = 'info' }: PropsWithChildren<{ tone?: 'info' | 'error' | 'success' }>) {
  return <View accessibilityRole={tone === 'error' ? 'alert' : undefined} accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'} style={[styles.message, tone === 'error' && styles.messageError, tone === 'success' && styles.messageSuccess]}><Text style={[styles.messageText, tone === 'error' && styles.messageTextError]}>{children}</Text></View>;
}

export function Loading({ label = 'Loading Thursday League...' }: { label?: string }) {
  return <Screen scroll={false}><View style={styles.loading}><ActivityIndicator color={colors.gold} size="large" /><Text style={styles.loadingText}>{label}</Text></View></Screen>;
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text>{action}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.ink900 },
  safe: { flex: 1 },
  offline: { borderBottomWidth: 1, borderBottomColor: colors.gold, backgroundColor: colors.ink800, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  offlineText: { color: colors.gold, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  scrollContent: { flexGrow: 1, padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  fillContent: { flex: 1, padding: spacing.lg },
  eyebrow: { color: colors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.chalk, fontSize: 38, lineHeight: 40, fontWeight: '900', letterSpacing: -1 },
  body: { color: colors.chalkMuted, fontSize: 15, lineHeight: 22 },
  bodyStrong: { color: colors.chalk },
  card: { borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.lg, backgroundColor: colors.ink850, padding: spacing.lg, gap: spacing.md },
  field: { gap: spacing.sm },
  fieldLabel: { color: colors.chalk, fontSize: 12, fontWeight: '800' },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.md, backgroundColor: colors.ink800, paddingHorizontal: spacing.md, color: colors.chalk, fontSize: 16 },
  inputMultiline: { minHeight: 110, paddingTop: spacing.md, textAlignVertical: 'top' },
  hint: { color: colors.chalkMuted, fontSize: 11, lineHeight: 16 },
  button: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.gold, paddingHorizontal: spacing.lg },
  buttonSecondary: { backgroundColor: colors.ink800, borderWidth: 1, borderColor: colors.goldMuted },
  buttonDanger: { backgroundColor: '#3D1717', borderWidth: 1, borderColor: colors.danger },
  buttonText: { color: colors.ink900, fontSize: 15, fontWeight: '900' },
  buttonSecondaryText: { color: colors.gold },
  buttonDangerText: { color: colors.danger },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  message: { borderWidth: 1, borderColor: colors.goldMuted, borderRadius: radius.md, backgroundColor: colors.ink800, padding: spacing.md },
  messageError: { borderColor: colors.danger, backgroundColor: '#2D1717' },
  messageSuccess: { borderColor: colors.turf400, backgroundColor: colors.turf900 },
  messageText: { color: colors.chalkMuted, fontSize: 13, lineHeight: 19 },
  messageTextError: { color: colors.danger },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { color: colors.chalkMuted, fontSize: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  sectionTitle: { color: colors.chalk, fontSize: 20, fontWeight: '900' },
});
