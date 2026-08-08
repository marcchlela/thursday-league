import { useCallback, useEffect, useState } from 'react';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { AdminBack } from '@/components/AdminChrome';
import { LeagueHeader } from '@/components/LeagueChrome';
import { Body, Button, Card, Loading, Message, Screen, Title } from '@/components/ui';
import { colors } from '@/constants/theme';
import { useScopedLeague } from '@/hooks/useScopedLeague';
import { friendlyMobileError } from '@/lib/api';
import { getSupabaseClient } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

const bucket = 'profile-avatars';
const maxBytes = 5 * 1024 * 1024;
const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export default function ProfilePhotoScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { user, profile, refreshProfile } = useAuth();
  const { league, loading, switching } = useScopedLeague(slug);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'success' | 'info' } | null>(null);

  const uploadAsset = useCallback(async (asset: ImagePicker.ImagePickerAsset) => {
    if (!user || !profile || busy) return;
    if (asset.fileSize && asset.fileSize > maxBytes) {
      setMessage({ text: 'Choose an image smaller than 5 MB.', tone: 'error' });
      return;
    }
    if (asset.mimeType && !acceptedTypes.has(asset.mimeType)) {
      setMessage({ text: 'Choose a JPG, PNG, or WebP image.', tone: 'error' });
      return;
    }

    setBusy(true);
    setMessage(null);
    let uploadedPath: string | null = null;
    try {
      const optimized = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 512, height: 512 } }],
        { compress: 0.86, format: ImageManipulator.SaveFormat.WEBP },
      );
      const optimizedFile = new File(optimized.uri);
      if (optimizedFile.size > maxBytes) throw new Error('The prepared image is still too large. Choose a smaller photo.');
      const bytes = await optimizedFile.arrayBuffer();
      uploadedPath = `${user.id}/avatar-${Date.now()}.webp`;
      const supabase = getSupabaseClient();
      const upload = await supabase.storage.from(bucket).upload(uploadedPath, bytes, {
        cacheControl: '31536000',
        contentType: 'image/webp',
        upsert: false,
      });
      if (upload.error) throw upload.error;

      const previousPath = profile.avatar_path;
      const update = await supabase.rpc('set_profile_avatar', { new_avatar_path: uploadedPath });
      if (update.error) throw update.error;
      await refreshProfile();
      if (previousPath && previousPath !== uploadedPath) void supabase.storage.from(bucket).remove([previousPath]);
      setMessage({ text: 'Profile photo updated.', tone: 'success' });
    } catch (error) {
      if (uploadedPath) await getSupabaseClient().storage.from(bucket).remove([uploadedPath]);
      setMessage({ text: friendlyMobileError(error, 'Your photo could not be uploaded. Try again.'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }, [busy, profile, refreshProfile, user]);

  useEffect(() => {
    void ImagePicker.getPendingResultAsync().then(result => {
      if (result && !('code' in result) && !result.canceled && result.assets[0]) void uploadAsset(result.assets[0]);
    }).catch(() => undefined);
  }, [uploadAsset]);

  async function choosePhoto() {
    setMessage(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage({ text: 'Allow photo access in system settings to choose a profile picture.', tone: 'error' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
      selectionLimit: 1,
    });
    if (!result.canceled && result.assets[0]) await uploadAsset(result.assets[0]);
  }

  async function removePhoto() {
    if (!profile?.avatar_path || busy) return;
    setBusy(true);
    setMessage(null);
    const previousPath = profile.avatar_path;
    const supabase = getSupabaseClient();
    const update = await supabase.rpc('set_profile_avatar', { new_avatar_path: null });
    if (update.error) {
      setMessage({ text: friendlyMobileError(update.error, 'Your photo could not be removed.'), tone: 'error' });
    } else {
      await refreshProfile();
      void supabase.storage.from(bucket).remove([previousPath]);
      setMessage({ text: 'Profile photo removed.', tone: 'success' });
    }
    setBusy(false);
  }

  if (loading || switching || !league || !profile) return <Loading label="Loading your profile photo..." />;

  return <Screen>
    <LeagueHeader league={league} />
    <AdminBack label="Profile" onPress={() => router.back()} />
    <View><Title>Profile photo</Title><Body>Your photo is account-wide and appears the same in every league.</Body></View>
    {message ? <Message tone={message.tone}>{message.text}</Message> : null}
    <Card style={styles.preview}>
      <Avatar name={profile.username} path={profile.avatar_path} size={144} />
      <Text style={styles.username}>{profile.username}</Text>
      <Text style={styles.detail}>JPG, PNG, or WebP. The app optimizes it to 512 px before saving it for your league profile.</Text>
    </Card>
    <Button disabled={busy} onPress={choosePhoto}>{busy ? 'Preparing photo...' : profile.avatar_path ? 'Choose a new photo' : 'Choose a photo'}</Button>
    {profile.avatar_path ? <Button variant="danger" disabled={busy} onPress={removePhoto}>Remove current photo</Button> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  preview: { alignItems: 'center' },
  username: { color: colors.chalk, fontSize: 22, fontWeight: '900' },
  detail: { maxWidth: 290, color: colors.chalkMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
