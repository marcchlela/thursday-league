import { Children, isValidElement, type PropsWithChildren, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { colors, fonts, radius, shadows, spacing } from '@/constants/theme';
import { useNativeServices } from '@/providers/NativeServicesProvider';

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  compact?: boolean;
  contentStyle?: ViewStyle | ViewStyle[];
  header?: ReactNode;
  bottomBar?: ReactNode;
}>;

export function Screen({ children, scroll = true, compact = false, contentStyle, header, bottomBar }: ScreenProps) {
  const { online } = useNativeServices();
  const childNodes = Children.toArray(children);
  const slotFor = (node: ReactNode) => {
    if (!isValidElement(node)) return undefined;
    return (node.type as { chromeSlot?: 'header' | 'bottom' }).chromeSlot;
  };
  const inferredHeader = header || childNodes.find(node => slotFor(node) === 'header');
  const explicitBottomBar = bottomBar || childNodes.find(node => slotFor(node) === 'bottom');
  const headerType = isValidElement(inferredHeader)
    ? inferredHeader.type as { chromeBottom?: (props: Record<string, unknown>) => ReactNode }
    : null;
  const inferredBottomBar = explicitBottomBar || (isValidElement(inferredHeader) && headerType?.chromeBottom
    ? headerType.chromeBottom(inferredHeader.props as Record<string, unknown>)
    : null);
  const pageChildren = childNodes.filter(node => !slotFor(node));
  const innerStyle = [scroll ? styles.scrollContent : styles.fillContent, compact && styles.compactContent, contentStyle];
  const content = scroll
    ? <ScrollView contentContainerStyle={innerStyle} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{pageChildren}</ScrollView>
    : <View style={innerStyle}>{pageChildren}</View>;

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.backdropRingOne} />
      <View pointerEvents="none" style={styles.backdropRingTwo} />
      <SafeAreaView style={styles.safe}>
        {!online ? (
          <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.offline}>
            <Icon name={{ ios: 'wifi.slash', android: 'wifi_off' }} size={15} color={colors.gold} />
            <Text style={styles.offlineText}>You are offline. Reconnect before saving changes.</Text>
          </View>
        ) : null}
        {inferredHeader}
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>{content}</KeyboardAvoidingView>
        {inferredBottomBar}
      </SafeAreaView>
    </View>
  );
}

export function Icon({ name, size = 20, color = colors.chalkMuted }: { name: SymbolViewProps['name']; size?: number; color?: string }) {
  return <SymbolView name={name} size={size} tintColor={color} resizeMode="scaleAspectFit" />;
}

export function Eyebrow({ children, tone = 'gold' }: PropsWithChildren<{ tone?: 'gold' | 'green' | 'blue' }>) {
  return <Text style={[styles.eyebrow, tone === 'green' && styles.eyebrowGreen, tone === 'blue' && styles.eyebrowBlue]}>{children}</Text>;
}

export function Title({ children, size = 'large' }: PropsWithChildren<{ size?: 'large' | 'medium' }>) {
  return <Text style={[styles.title, size === 'medium' && styles.titleMedium]}>{children}</Text>;
}

export function Body({ children, muted = true, style }: PropsWithChildren<{ muted?: boolean; style?: TextStyle | TextStyle[] }>) {
  return <Text style={[styles.body, !muted && styles.bodyStrong, style]}>{children}</Text>;
}

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle | ViewStyle[] }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Pill({ children, tone = 'neutral' }: PropsWithChildren<{ tone?: 'neutral' | 'gold' | 'green' | 'red' }>) {
  return <View style={[styles.pill, tone === 'gold' && styles.pillGold, tone === 'green' && styles.pillGreen, tone === 'red' && styles.pillRed]}><Text style={[styles.pillText, tone === 'gold' && styles.pillTextGold, tone === 'green' && styles.pillTextGreen, tone === 'red' && styles.pillTextRed]}>{children}</Text></View>;
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel || label}
        placeholderTextColor={colors.chalk45}
        selectionColor={colors.gold}
        style={[styles.input, props.multiline && styles.inputMultiline, props.style]}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

type ButtonProps = PropsWithChildren<{
  onPress?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  accessibilityLabel?: string;
  icon?: SymbolViewProps['name'];
}>;

export function Button({ children, onPress, disabled, variant = 'primary', accessibilityLabel, icon }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        variant === 'ghost' && styles.buttonGhost,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      {icon ? <Icon name={icon} size={18} color={variant === 'primary' ? colors.goldInk : variant === 'danger' ? colors.danger : colors.gold} /> : null}
      <Text style={[styles.buttonText, variant !== 'primary' && styles.buttonSecondaryText, variant === 'danger' && styles.buttonDangerText, variant === 'ghost' && styles.buttonGhostText]}>{children}</Text>
    </Pressable>
  );
}

export function Message({ children, tone = 'info' }: PropsWithChildren<{ tone?: 'info' | 'error' | 'success' }>) {
  const icon = tone === 'error'
    ? { ios: 'exclamationmark.circle.fill', android: 'error' } as const
    : tone === 'success'
      ? { ios: 'checkmark.circle.fill', android: 'check_circle' } as const
      : { ios: 'info.circle.fill', android: 'info' } as const;
  const color = tone === 'error' ? colors.danger : tone === 'success' ? colors.turf400 : colors.gold;
  return (
    <View accessibilityRole={tone === 'error' ? 'alert' : undefined} accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'} style={[styles.message, tone === 'error' && styles.messageError, tone === 'success' && styles.messageSuccess]}>
      <Icon name={icon} size={18} color={color} />
      <Text style={[styles.messageText, tone === 'error' && styles.messageTextError, tone === 'success' && styles.messageTextSuccess]}>{children}</Text>
    </View>
  );
}

export function Loading({ label = 'Loading Thursday League...' }: { label?: string }) {
  return <Screen scroll={false}><View style={styles.loading}><View style={styles.loadingMark}><Image source={require('../../assets/images/splash-icon.png')} resizeMode="contain" style={styles.loadingLogo} /></View><Text style={styles.loadingEyebrow}>THURSDAY LEAGUE</Text><Text style={styles.loadingText}>{label}</Text><ActivityIndicator color={colors.gold} size="small" /></View></Screen>;
}

export function SectionHeader({ title, eyebrow, action }: { title: string; eyebrow?: string; action?: ReactNode }) {
  return <View style={styles.sectionHeader}><View style={styles.sectionCopy}>{eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}<Text style={styles.sectionTitle}>{title}</Text></View>{action}</View>;
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return <View style={styles.empty}><View style={styles.emptyIcon}><Icon name={{ ios: 'flag.fill', android: 'flag' }} color={colors.gold} size={22} /></View><Text style={styles.emptyTitle}>{title}</Text>{text ? <Text style={styles.emptyText}>{text}</Text> : null}{action}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, overflow: 'hidden', backgroundColor: colors.ink900 },
  safe: { flex: 1 },
  backdropRingOne: { position: 'absolute', left: -170, top: -190, width: 350, height: 350, borderWidth: 56, borderColor: 'rgba(218,165,32,0.018)', borderRadius: radius.pill },
  backdropRingTwo: { position: 'absolute', right: -210, bottom: -260, width: 440, height: 440, borderWidth: 1, borderColor: 'rgba(218,165,32,0.055)', borderRadius: radius.pill },
  offline: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.goldBorderStrong, backgroundColor: colors.ink800, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  offlineText: { color: colors.chalk85, fontFamily: fonts.sansBold, fontSize: 11, textAlign: 'center' },
  scrollContent: { flexGrow: 1, width: '100%', maxWidth: 960, alignSelf: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xxxl, gap: spacing.md },
  fillContent: { flex: 1, width: '100%', maxWidth: 960, alignSelf: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.md },
  compactContent: { paddingTop: spacing.sm },
  eyebrow: { color: colors.gold, fontFamily: fonts.sansBlack, fontSize: 9, letterSpacing: 1.8 },
  eyebrowGreen: { color: colors.turf400 },
  eyebrowBlue: { color: colors.perimeter400 },
  title: { color: colors.chalk, fontFamily: fonts.displayBold, fontSize: 42, lineHeight: 45, letterSpacing: -0.6, textTransform: 'uppercase' },
  titleMedium: { fontSize: 32, lineHeight: 36 },
  body: { color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 14, lineHeight: 21 },
  bodyStrong: { color: colors.chalk, fontFamily: fonts.sansMedium },
  card: { ...shadows.card, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.lg, backgroundColor: colors.ink850, padding: spacing.lg, gap: spacing.md },
  pill: { alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(245,242,232,0.08)', borderRadius: radius.pill, backgroundColor: 'rgba(245,242,232,0.03)', paddingHorizontal: 10, paddingVertical: 5 },
  pillGold: { borderColor: colors.goldBorder, backgroundColor: colors.goldSoft },
  pillGreen: { borderColor: 'rgba(49,185,78,0.25)', backgroundColor: colors.successSoft },
  pillRed: { borderColor: 'rgba(248,113,113,0.25)', backgroundColor: colors.dangerSoft },
  pillText: { color: colors.chalkMuted, fontFamily: fonts.sansBlack, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' },
  pillTextGold: { color: colors.gold },
  pillTextGreen: { color: colors.turf400 },
  pillTextRed: { color: colors.danger },
  stat: { flex: 1, minWidth: 88, borderWidth: 1, borderColor: 'rgba(218,165,32,0.15)', borderRadius: radius.md, backgroundColor: 'rgba(0,0,0,0.18)', padding: 12 },
  statValue: { color: colors.chalk, fontFamily: fonts.monoBold, fontSize: 22 },
  statLabel: { marginTop: 4, color: colors.chalkMuted, fontFamily: fonts.sansBold, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' },
  field: { gap: spacing.sm },
  fieldLabel: { color: colors.chalk72, fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 0.25 },
  input: { minHeight: 52, borderWidth: 1, borderColor: 'rgba(218,165,32,0.18)', borderRadius: radius.md, backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: spacing.md, color: colors.chalk, fontFamily: fonts.sansMedium, fontSize: 15 },
  inputMultiline: { minHeight: 110, paddingTop: spacing.md, textAlignVertical: 'top' },
  hint: { color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 10, lineHeight: 15 },
  button: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.gold, paddingHorizontal: spacing.lg },
  buttonSecondary: { borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: 'rgba(0,0,0,0.16)' },
  buttonDanger: { borderWidth: 1, borderColor: 'rgba(248,113,113,0.35)', backgroundColor: colors.dangerSoft },
  buttonGhost: { minHeight: 44, backgroundColor: colors.transparent },
  buttonText: { color: colors.goldInk, fontFamily: fonts.sansExtraBold, fontSize: 14 },
  buttonSecondaryText: { color: colors.chalk85 },
  buttonDangerText: { color: colors.danger },
  buttonGhostText: { color: colors.gold },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.988 }] },
  message: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.md, backgroundColor: colors.goldSoft, padding: spacing.md },
  messageError: { borderColor: 'rgba(248,113,113,0.3)', backgroundColor: colors.dangerSoft },
  messageSuccess: { borderColor: 'rgba(49,185,78,0.28)', backgroundColor: colors.successSoft },
  messageText: { flex: 1, color: colors.chalk72, fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 18 },
  messageTextError: { color: '#FECACA' },
  messageTextSuccess: { color: colors.turf100 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loadingMark: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.pill, backgroundColor: colors.goldSoft },
  loadingLogo: { width: 70, height: 70 },
  loadingEyebrow: { marginTop: spacing.sm, color: colors.gold, fontFamily: fonts.sansBlack, fontSize: 9, letterSpacing: 2 },
  loadingText: { color: colors.chalkMuted, fontFamily: fonts.sansMedium, fontSize: 13 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md },
  sectionCopy: { flex: 1, gap: 3 },
  sectionTitle: { color: colors.chalk, fontFamily: fonts.display, fontSize: 26, lineHeight: 30, textTransform: 'uppercase' },
  empty: { alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.goldBorder, borderRadius: radius.lg, backgroundColor: colors.ink850, paddingHorizontal: spacing.lg, paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.goldSoft },
  emptyTitle: { marginTop: spacing.xs, color: colors.chalk, fontFamily: fonts.display, fontSize: 25, textAlign: 'center', textTransform: 'uppercase' },
  emptyText: { maxWidth: 420, color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
