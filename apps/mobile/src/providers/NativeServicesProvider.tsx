import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Linking } from 'react-native';
import * as Network from 'expo-network';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';

import { friendlyMobileError } from '@/lib/api';
import {
  disableNativePushToken,
  enableNativePushToken,
  readNativeNotificationState,
  registerNativePushToken,
  safeNotificationPath,
  unregisterNativePushToken,
  type NativeNotificationState,
} from '@/lib/notifications';
import { useAuth } from '@/providers/AuthProvider';
import { useLeagues } from '@/providers/LeagueProvider';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

type NativeServicesContextValue = {
  online: boolean;
  notificationState: NativeNotificationState;
  notificationBusy: boolean;
  notificationError: string | null;
  enableNotifications: () => Promise<void>;
  disableNotifications: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  openSystemSettings: () => Promise<void>;
};

const initialState: NativeNotificationState = { supported: false, permission: 'undetermined', registered: false, enabledByUser: false, token: null };
const NativeServicesContext = createContext<NativeServicesContextValue | null>(null);

export function NativeServicesProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const { session } = useAuth();
  const { leagues, activeLeague } = useLeagues();
  const [online, setOnline] = useState(true);
  const [notificationState, setNotificationState] = useState(initialState);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const lastHandledNotification = useRef<string | null>(null);

  const refreshNotifications = useCallback(async () => {
    try { setNotificationState(await readNativeNotificationState()); }
    catch (error) { setNotificationError(friendlyMobileError(error, 'Notification status could not be checked.')); }
  }, []);

  const enableNotifications = useCallback(async () => {
    if (!session) throw new Error('Log in before enabling notifications.');
    setNotificationBusy(true);
    setNotificationError(null);
    try {
      await enableNativePushToken(session.access_token);
      await refreshNotifications();
    } catch (error) {
      const message = friendlyMobileError(error, 'Notifications could not be enabled on this device.');
      setNotificationError(message);
      throw new Error(message);
    } finally { setNotificationBusy(false); }
  }, [refreshNotifications, session]);

  const disableNotifications = useCallback(async () => {
    if (!session) return;
    setNotificationBusy(true);
    setNotificationError(null);
    try {
      await disableNativePushToken(session.access_token);
    } catch (error) {
      const message = friendlyMobileError(error, 'Notifications could not be disabled on this device.');
      setNotificationError(message);
      throw new Error(message);
    } finally {
      await refreshNotifications();
      setNotificationBusy(false);
    }
  }, [refreshNotifications, session]);

  const routeNotification = useCallback((response: Notifications.NotificationResponse | null) => {
    if (!response || !session || !leagues.length) return;
    const identifier = response.notification.request.identifier;
    if (identifier === lastHandledNotification.current) return;
    lastHandledNotification.current = identifier;
    const path = safeNotificationPath(
      response.notification.request.content.data?.url,
      leagues.map(league => league.slug),
      activeLeague?.slug,
    );
    router.push(path);
  }, [activeLeague?.slug, leagues, router, session]);

  const synchronizePushRegistration = useCallback(async () => {
    const state = await readNativeNotificationState();
    if (!online) {
      setNotificationState(state);
      return;
    }
    try {
      if (!session && state.token) {
        await unregisterNativePushToken();
      } else if (session && state.enabledByUser && state.permission === 'granted') {
        await registerNativePushToken(session.access_token);
      } else if (session && !state.enabledByUser && state.token) {
        await unregisterNativePushToken(session.access_token);
      }
      setNotificationError(null);
    } catch (error) {
      setNotificationError(friendlyMobileError(error, 'Notification registration will retry when the connection is available.'));
    }
    setNotificationState(await readNativeNotificationState());
  }, [online, session]);

  useEffect(() => {
    void Network.getNetworkStateAsync().then(state => setOnline(state.isConnected !== false && state.isInternetReachable !== false));
    const networkSubscription = Network.addNetworkStateListener(state => {
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
    return () => networkSubscription.remove();
  }, []);

  useEffect(() => {
    void Promise.resolve().then(synchronizePushRegistration);
  }, [synchronizePushRegistration]);

  useEffect(() => {
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(routeNotification);
    const tokenSubscription = Notifications.addPushTokenListener(() => {
      void synchronizePushRegistration();
    });
    const appSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') void synchronizePushRegistration();
    });
    void Notifications.getLastNotificationResponseAsync().then(routeNotification);
    return () => {
      responseSubscription.remove();
      tokenSubscription.remove();
      appSubscription.remove();
    };
  }, [routeNotification, synchronizePushRegistration]);

  const value = useMemo<NativeServicesContextValue>(() => ({
    online,
    notificationState,
    notificationBusy,
    notificationError,
    enableNotifications,
    disableNotifications,
    refreshNotifications,
    openSystemSettings: Linking.openSettings,
  }), [disableNotifications, enableNotifications, notificationBusy, notificationError, notificationState, online, refreshNotifications]);
  return <NativeServicesContext.Provider value={value}>{children}</NativeServicesContext.Provider>;
}

export function useNativeServices() {
  const context = useContext(NativeServicesContext);
  if (!context) throw new Error('useNativeServices must be used inside NativeServicesProvider.');
  return context;
}
