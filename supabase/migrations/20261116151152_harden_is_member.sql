revoke execute on function public.is_member(uuid, public.member_role) from anon, public;
grant execute on function public.is_member(uuid, public.member_role) to authenticated;
revoke execute on function public.release_stuck_variants() from anon, authenticated, public;
revoke execute on function public.claim_due_variants(int) from anon, authenticated, public;
