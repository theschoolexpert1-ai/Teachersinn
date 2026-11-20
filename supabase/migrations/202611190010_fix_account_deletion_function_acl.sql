revoke execute on function public.prepare_own_account_deletion(inet) from anon;
revoke execute on function public.prepare_own_account_deletion(inet) from service_role;
revoke execute on function public.prepare_own_account_deletion(inet) from public;
grant execute on function public.prepare_own_account_deletion(inet) to authenticated;
