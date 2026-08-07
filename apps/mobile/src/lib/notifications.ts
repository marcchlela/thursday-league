import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { apiRequest } from '@/lib/api';

const installationKey = 'thursday-league:native-installation:v1';
const tokenKey = 'thursday-league:expo-push-token:v1';
const enabledKey = 'thursday-league:native-push-enabled:v1';

export type NativeNotificationState = {
  supported: boolean;
  permission: 'granted' | 'denied' | 'undetermined';
  registered: boolean;
  enabledByUser: boolean;
  token: string | null;
};

export async function installationId() {
  const existing = await AsyncStorage.getItem(installationKey);
  if (existing) return existing;
  const created = Crypto.randomUUID().replace(/-/g, '');
  await AsyncStorage.setItem(installationKey, created);
  return created;
}

export function notificationPermissionGranted(status: Notifications.NotificationPermissionsStatus) {
  return status.granted || status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function readNativeNotificationState(): Promise<NativeNotificationState> {
  if (!Device.isDevice || (Platform.OS !== 'ios' && Platform.OS !== 'android')) {
    return { supported: false, permission: 'undetermined', registered: false, enabledByUser: false, token: null };
  }
  const permission = await Notifications.getPermissionsAsync();
  const [token, enabledSetting] = await Promise.all([
    AsyncStorage.getItem(tokenKey),
    AsyncStorage.getItem(enabledKey),
  ]);
  return {
    supported: true,
    permission: notificationPermissionGranted(permission) ? 'granted' : permission.status === 'denied' ? 'denied' : 'undetermined',
    registered: !!token,
    enabledByUser: enabledSetting === 'true' || (enabledSetting === null && !!token),
    token,
  };
}

export async function requestNativeNotificationPermission() {
  if (!Device.isDevice) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('matchweek', {
      name: 'Matchweek updates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 100, 180],
      lightColor: '#D6B64C',
      sound: 'default',
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (notificationPermissionGranted(current)) return true;
  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return notificationPermissionGranted(requested);
}

export async function registerNativePushToken(accessToken: string) {
  if (!await requestNativeNotificationPermission()) throw new Error('Notifications are not allowed on this device.');
  const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
  if (!projectId) throw new Error('Native notification configuration is incomplete.');
  const expoToken = await Notifications.getExpoPushTokenAsync({ projectId });
  await apiRequest<{ success: boolean }>({
    path: '/api/push/native-token',
    token: accessToken,
    body: {
      expoPushToken: expoToken.data,
      platform: Platform.OS,
      installationId: await installationId(),
      appVersion: Constants.expoConfig?.version || null,
    },
    timeoutMs: 20000,
  });
  await AsyncStorage.setItem(tokenKey, expoToken.data);
  return expoToken.data;
}

export async function enableNativePushToken(accessToken: string) {
  await AsyncStorage.setItem(enabledKey, 'true');
  return registerNativePushToken(accessToken);
}

export async function unregisterNativePushToken(accessToken?: string) {
  const expoPushToken = await AsyncStorage.getItem(tokenKey);
  if (expoPushToken) {
    await apiRequest<{ success: boolean }>({
      path: '/api/push/native-token',
      token: accessToken,
      method: 'DELETE',
      body: { expoPushToken, installationId: await installationId() },
    });
  }
  await AsyncStorage.removeItem(tokenKey);
}

export async function disableNativePushToken(accessToken?: string) {
  await AsyncStorage.setItem(enabledKey, 'false');
  return unregisterNativePushToken(accessToken);
}

export async function clearStoredPushToken() {
  await AsyncStorage.removeItem(tokenKey);
}

export function safeNotificationPath(value: unknown, leagueSlugs: string[], activeSlug?: string | null) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return activeSlug ? `/l/${activeSlug}` : '/';
  let parsed: URL;
  try { parsed = new URL(value, 'https://thursday-league.invalid'); }
  catch { return activeSlug ? `/l/${activeSlug}` : '/'; }
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments[0] !== 'l') {
    if (parsed.pathname === '/leagues') return '/leagues';
    return activeSlug ? `/l/${activeSlug}` : '/';
  }
  const slug = segments[1];
  if (!slug || !leagueSlugs.includes(slug)) return '/leagues';
  const suffix = segments.slice(2).join('/');
  if (!suffix) return `/l/${slug}`;
  if (suffix === 'betting') return `/l/${slug}/bets`;
  if (suffix === 'profile') return `/l/${slug}/profile`;
  if (suffix === 'fantasy') return `/l/${slug}/fantasy`;
  if (suffix === 'players') return `/l/${slug}/players`;
  if (/^players\/[0-9a-f-]+$/i.test(suffix)) return `/l/${slug}/${suffix}`;
  if (suffix === 'games') return `/l/${slug}/games`;
  if (/^games\/[0-9a-f-]+$/i.test(suffix)) return `/l/${slug}/${suffix}`;
  if (suffix === 'admin') {
    const section = parsed.searchParams.get('section');
    if (section === 'roster') return `/l/${slug}/admin/roster`;
    if (section === 'games') return `/l/${slug}/admin/games`;
    if (section === 'seasons') return `/l/${slug}/admin/seasons`;
    if (section === 'league') return `/l/${slug}/members`;
    return `/l/${slug}/admin`;
  }
  return `/l/${slug}`;
}
