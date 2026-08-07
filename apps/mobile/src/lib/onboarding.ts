import AsyncStorage from '@react-native-async-storage/async-storage';

const INTRO_KEY = 'thursday-league:intro-complete:v1';
const PENDING_INVITE_KEY = 'thursday-league:pending-invite:v1';
const AUTH_NOTICE_KEY = 'thursday-league:auth-notice:v1';

export async function introWasCompleted() {
  return (await AsyncStorage.getItem(INTRO_KEY)) === 'true';
}

export async function completeIntro() {
  await AsyncStorage.setItem(INTRO_KEY, 'true');
}

export async function savePendingInvite(token: string) {
  await AsyncStorage.setItem(PENDING_INVITE_KEY, token);
}

export async function getPendingInvite() {
  return AsyncStorage.getItem(PENDING_INVITE_KEY);
}

export async function clearPendingInvite() {
  await AsyncStorage.removeItem(PENDING_INVITE_KEY);
}

export async function saveAuthNotice(message: string) {
  await AsyncStorage.setItem(AUTH_NOTICE_KEY, message);
}

export async function takeAuthNotice() {
  const message = await AsyncStorage.getItem(AUTH_NOTICE_KEY);
  if (message) await AsyncStorage.removeItem(AUTH_NOTICE_KEY);
  return message;
}
