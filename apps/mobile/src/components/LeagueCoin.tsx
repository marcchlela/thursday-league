import { Image, StyleSheet, View, type ViewStyle } from 'react-native';

const coinAsset = require('../../../../public/icons/league-coin-v2.png');

export function LeagueCoin({ size = 24, style }: { size?: number; style?: ViewStyle | ViewStyle[] }) {
  return (
    <View style={[styles.shadow, { width: size, height: size }, style]}>
      <Image accessibilityIgnoresInvertColors source={coinAsset} resizeMode="contain" style={{ width: size, height: size }} />
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowColor: '#F7B733',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 3,
    elevation: 2,
  },
});
