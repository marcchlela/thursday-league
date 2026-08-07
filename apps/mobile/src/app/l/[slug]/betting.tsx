import { Redirect, useLocalSearchParams } from 'expo-router';

export default function BettingAlias() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <Redirect href={`/l/${slug}/bets`} />;
}
