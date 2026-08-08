import { Linking, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AdminBack } from '@/components/AdminChrome';
import { Button, Card, Eyebrow, Icon, Screen, Title } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/constants/theme';

const supportEmail = 'thursdayleagueapp@gmail.com';
type LegalPage = 'support' | 'privacy' | 'terms';
type Section = { title: string; paragraphs: string[] };

const content: Record<LegalPage, { eyebrow: string; title: string; intro: string; sections: Section[] }> = {
  support: { eyebrow: 'THURSDAY LEAGUE SUPPORT', title: 'How can we help?', intro: 'Most account and league issues can be resolved from inside the app.', sections: [
    { title: 'Account access', paragraphs: ['Use Forgot password on the sign-in screen. Recovery requires the verified email connected to your account.'] },
    { title: 'League access', paragraphs: ['Invite links join directly after confirmation. League codes create a request that an owner or admin must approve.'] },
    { title: 'Notifications', paragraphs: ['Open Settings, then Notifications. If alerts were blocked, re-enable Thursday League in your phone settings.'] },
    { title: 'Contact support', paragraphs: [`Email ${supportEmail}. Include your username and league name, but never send your password, access token, database credentials, or recovery codes.`] },
  ] },
  privacy: { eyebrow: 'LAST UPDATED 31 JULY 2026', title: 'Privacy policy', intro: 'Thursday League uses only the information needed to run private football leagues, secure accounts, deliver matchweek features, and improve reliability. We do not sell personal information or use it for advertising.', sections: [
    { title: 'Information we handle', paragraphs: ['Account information includes your username, verified email, authentication identifiers, profile photo if you add one, account status, and security records.', 'League activity includes memberships, roles, schedules, results, player records, Fantasy selections, virtual prediction slips and balances, and notification preferences. Private pre-match Fantasy picks and individual prediction activity remain access-controlled.'] },
    { title: 'How we use it', paragraphs: ['We use this information to secure accounts, operate leagues, calculate results and standings, deliver reminders, diagnose failures, prevent abuse, and support recovery. Virtual league coins cannot be purchased, withdrawn, or exchanged for money.'] },
    { title: 'Service providers', paragraphs: ['Supabase provides authentication, database, and file storage. Vercel hosts the website. Expo, Apple Push Notification service, and Firebase Cloud Messaging deliver native notifications.'] },
    { title: 'Your choices', paragraphs: ['You can update your recovery email, password, photo, and notification choices in the app. Account deletion removes personal account data while shared competition history remains under an anonymous deleted-user label. League owners must transfer ownership or archive first.'] },
    { title: 'Contact', paragraphs: [`Privacy questions can be sent to ${supportEmail}.`] },
  ] },
  terms: { eyebrow: 'LAST UPDATED 31 JULY 2026', title: 'Terms of use', intro: 'By creating an account or joining a league, you agree to use Thursday League responsibly and lawfully.', sections: [
    { title: 'The service', paragraphs: ['Thursday League helps groups organize recreational football, record matches and statistics, run Fantasy competitions, and make entertainment-only predictions using virtual league coins.', 'Virtual coins have no monetary value. They cannot be bought, sold, withdrawn, redeemed for prizes, or exchanged for money. Thursday League is not a gambling or financial service.'] },
    { title: 'Accounts and leagues', paragraphs: ['Keep your password private and tell us if you believe your account has been compromised. League owners and admins must manage lawful content and obtain permission needed for names, photos, statistics, or match information.'] },
    { title: 'Acceptable use', paragraphs: ['Do not access another person’s private information, bypass permissions, disrupt the service, automate abusive traffic, impersonate others, manipulate results dishonestly, or use Thursday League for unlawful wagering.'] },
    { title: 'Availability', paragraphs: ['The service is provided as available. Recreational match data is entered by league admins and may contain mistakes. Features may change as the product develops.'] },
    { title: 'Contact', paragraphs: [`Questions can be sent to ${supportEmail}.`] },
  ] },
};

export default function LegalScreen() {
  const router = useRouter();
  const { page } = useLocalSearchParams<{ page: string }>();
  const selected = content[(page as LegalPage) || 'support'] || content.support;
  return <Screen compact><AdminBack label="Settings" onPress={() => router.back()} /><View style={styles.hero}><View style={styles.icon}><Icon name={{ ios: page === 'privacy' ? 'hand.raised.fill' : page === 'terms' ? 'doc.text.fill' : 'lifepreserver.fill', android: page === 'privacy' ? 'privacy_tip' : page === 'terms' ? 'description' : 'support_agent' }} size={25} color={colors.gold} /></View><Eyebrow>{selected.eyebrow}</Eyebrow><Title>{selected.title}</Title><Text style={styles.intro}>{selected.intro}</Text></View>{selected.sections.map(section => <Card key={section.title}><Text style={styles.sectionTitle}>{section.title}</Text>{section.paragraphs.map(paragraph => <Text key={paragraph} style={styles.paragraph}>{paragraph}</Text>)}{section.title === 'Contact support' || section.title === 'Contact' ? <Button variant="secondary" onPress={() => void Linking.openURL(`mailto:${supportEmail}?subject=Thursday%20League%20support`)}>Email support</Button> : null}</Card>)}</Screen>;
}

const styles = StyleSheet.create({ hero: { alignItems: 'flex-start', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.goldBorder, paddingBottom: spacing.lg }, icon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldBorderStrong, borderRadius: radius.md, backgroundColor: colors.goldSoft }, intro: { maxWidth: 650, color: colors.chalk72, fontFamily: fonts.sans, fontSize: 13, lineHeight: 20 }, sectionTitle: { color: colors.chalk, fontFamily: fonts.display, fontSize: 24, textTransform: 'uppercase' }, paragraph: { color: colors.chalkMuted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 19 } });
