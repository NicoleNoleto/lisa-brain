-- Admins cadastrados em team_members devem ter o mesmo acesso dos admins de user_roles.
-- O vínculo user_id pode estar ausente enquanto o convite ainda não foi associado;
-- nesse caso, o e-mail autenticado também identifica o membro.
CREATE OR REPLACE FUNCTION public.is_admin_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = 'admin'::public.app_role
  )
  OR EXISTS (
    SELECT 1
    FROM public.team_members tm
    JOIN auth.users au ON au.id = _user_id
    WHERE tm.role = 'admin'::public.member_role
      AND (tm.user_id = _user_id OR lower(tm.email) = lower(au.email))
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_user(uuid) TO authenticated;

DROP POLICY IF EXISTS "users_own_whatsapp_connections" ON public.whatsapp_connections;
CREATE POLICY "users_own_whatsapp_connections" ON public.whatsapp_connections
  FOR ALL TO authenticated
  USING (auth.uid() = owner_user_id OR public.is_admin_user(auth.uid()))
  WITH CHECK (auth.uid() = owner_user_id OR public.is_admin_user(auth.uid()));
