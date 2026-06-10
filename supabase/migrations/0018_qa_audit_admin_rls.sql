-- Replace service_role-only write policies on qa_page_audit and qa_site_audit
-- with the standard is_admin() pattern used by all other tables.

DROP POLICY IF EXISTS "service write qa_page_audit" ON public.qa_page_audit;
CREATE POLICY "admin_insert_qa_page_audit" ON public.qa_page_audit
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "admin_update_qa_page_audit" ON public.qa_page_audit
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_delete_qa_page_audit" ON public.qa_page_audit
  FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "service write qa_site_audit" ON public.qa_site_audit;
CREATE POLICY "admin_insert_qa_site_audit" ON public.qa_site_audit
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "admin_update_qa_site_audit" ON public.qa_site_audit
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin_delete_qa_site_audit" ON public.qa_site_audit
  FOR DELETE TO authenticated USING (public.is_admin());
