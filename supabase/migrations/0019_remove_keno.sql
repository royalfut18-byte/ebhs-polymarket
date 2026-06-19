-- Remove the retired Keno game from the casino surface and database.
delete from public.casino_rounds where game = 'keno';
delete from public.casino_bets where game = 'keno';

revoke execute on function public.casino_keno(numeric, int[]) from authenticated;
drop function if exists public.casino_keno(numeric, int[]);
