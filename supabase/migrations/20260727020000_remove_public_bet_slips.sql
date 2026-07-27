-- Public bet-slip browsing has been removed. Personal slips remain available
-- through the owner-only bet_slips and bet_legs policies used by My Bets.

revoke execute on function public.get_public_bet_slips(uuid) from authenticated;
