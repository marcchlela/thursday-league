import { Image, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';
import { getSupabaseClient } from '@/lib/supabase';

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : `${parts[0][0]}${parts.at(-1)?.[0] || ''}`.toUpperCase();
}

export function Avatar({ name, path, size = 48 }: { name: string; path?: string | null; size?: number }) {
  const shape = { width: size, height: size, borderRadius: size / 2 };
  if (path) {
    const uri = getSupabaseClient().storage.from('profile-avatars').getPublicUrl(path).data.publicUrl;
    return <Image source={{ uri }} accessibilityLabel={`${name}'s profile photo`} style={[styles.image, shape]} />;
  }
  return <View accessibilityLabel={`${name}'s avatar`} style={[styles.fallback, shape]}><Text style={[styles.initials, { fontSize: Math.max(12, size * 0.32) }]}>{initials(name)}</Text></View>;
}

const styles = StyleSheet.create({ image: { borderWidth: 1, borderColor: colors.goldMuted, backgroundColor: colors.ink800 }, fallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldMuted, backgroundColor: colors.turf900 }, initials: { color: colors.chalk, fontWeight: '900' } });
