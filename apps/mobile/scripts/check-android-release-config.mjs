import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = process.cwd();
const repositoryRoot = path.resolve(mobileRoot, '..', '..');
const appConfig = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8'));
const easConfig = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'eas.json'), 'utf8'));
const packageConfig = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'package.json'), 'utf8'));
const expo = appConfig.expo;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function resolveAsset(relativePath) {
  check(typeof relativePath === 'string' && relativePath.length > 0, 'A required Android asset path is missing.');
  const absolutePath = path.resolve(mobileRoot, relativePath);
  check(fs.existsSync(absolutePath), `Missing Android asset: ${relativePath}`);
  return absolutePath;
}

function pngDimensions(filePath) {
  const bytes = fs.readFileSync(filePath);
  check(bytes.length >= 24 && bytes.toString('ascii', 1, 4) === 'PNG', `${filePath} is not a valid PNG.`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function plugin(name) {
  return expo.plugins.find(item => Array.isArray(item) ? item[0] === name : item === name);
}

check(expo.android?.package === 'app.thursdayleague.mobile', 'Android package ID changed from its permanent value.');
check(!Object.hasOwn(expo.android, 'versionCode'), 'android.versionCode must remain remote-managed by EAS.');
check(expo.android.allowBackup === false, 'Android application backup must stay disabled.');

const blockedPermissions = new Set(expo.android.blockedPermissions || []);
for (const permission of [
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.SYSTEM_ALERT_WINDOW',
]) {
  check(blockedPermissions.has(permission), `Android permission is not blocked: ${permission}`);
}

const icon = pngDimensions(resolveAsset(expo.icon));
check(icon.width === 1024 && icon.height === 1024, 'The primary store icon must be a 1024x1024 PNG.');
resolveAsset(expo.android.adaptiveIcon?.foregroundImage);
resolveAsset(expo.android.adaptiveIcon?.monochromeImage);

const appLinkData = (expo.android.intentFilters || []).flatMap(filter => filter.data || []);
for (const pathPrefix of ['/invite', '/auth/confirm', '/l']) {
  check(appLinkData.some(item => item.scheme === 'https' && item.host === 'thursday-league.vercel.app' && item.pathPrefix === pathPrefix), `Missing verified Android App Link for ${pathPrefix}.`);
}

const notificationsPlugin = plugin('expo-notifications');
check(Array.isArray(notificationsPlugin), 'expo-notifications must have explicit Android configuration.');
check(notificationsPlugin[1]?.defaultChannel === 'matchweek', 'The default Android notification channel changed.');
resolveAsset(notificationsPlugin[1]?.icon);

const imagePickerPlugin = plugin('expo-image-picker');
check(Array.isArray(imagePickerPlugin), 'expo-image-picker must have explicit permission configuration.');
check(imagePickerPlugin[1]?.cameraPermission === false, 'Camera access must remain disabled.');
check(imagePickerPlugin[1]?.microphonePermission === false, 'Microphone access must remain disabled.');

check(packageConfig.dependencies?.expo?.startsWith('~57.'), 'This release gate expects Expo SDK 57.');
check(packageConfig.dependencies?.['react-native']?.startsWith('0.86.'), 'This release gate expects React Native 0.86.');

const production = easConfig.build?.production;
check(easConfig.cli?.appVersionSource === 'remote', 'EAS app versions must be managed remotely.');
check(production?.environment === 'production', 'The production EAS environment is not selected.');
check(production?.distribution === 'store', 'The production Android build must use store distribution.');
check(production?.android?.buildType === 'app-bundle', 'The production Android artifact must be an AAB.');
check(production?.autoIncrement === true, 'Production Android version codes must auto-increment.');

const easIgnore = fs.readFileSync(path.join(repositoryRoot, '.easignore'), 'utf8');
for (const ignored of ['.env.local', '*firebase-adminsdk*.json', '/apps/mobile/android', '/apps/mobile/ios', '/.git']) {
  check(easIgnore.includes(ignored), `EAS uploads must ignore ${ignored}.`);
}

for (const route of [
  'app/privacy/page.tsx',
  'app/terms/page.tsx',
  'app/support/page.tsx',
  'app/delete-account/page.tsx',
  'app/.well-known/assetlinks.json/route.ts',
]) {
  check(fs.existsSync(path.join(repositoryRoot, route)), `Required public release route is missing: ${route}`);
}

console.log('Android release configuration check passed.');
console.log('Package: app.thursdayleague.mobile');
console.log('Artifact: production store AAB with remote auto-incremented version code');
console.log('Permissions: camera, microphone, and system overlay blocked; backups disabled');
if (!expo.android.googleServicesFile) {
  console.warn('Pending hosted setup: add android.googleServicesFile after creating the Firebase Android app.');
}
