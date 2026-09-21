-- App-wide: platform_admin becomes a true super-admin, identical access to
-- factory_manager everywhere. Widens only the role predicate on 40 existing
-- policies (role='factory_manager' -> role = ANY(['factory_manager','platform_admin'])).
-- Every other condition (EXISTS checks, created_by checks) left byte-identical.
-- Standalone app-wide change, separate from the maintenance module's own phases.

-- catalog_items
ALTER POLICY "manager insert catalog_items" ON catalog_items
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));
ALTER POLICY "manager select all catalog_items" ON catalog_items
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));
ALTER POLICY "manager update catalog_items" ON catalog_items
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]))
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));

-- clients
ALTER POLICY "manager insert clients" ON clients
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));
ALTER POLICY "manager select all clients" ON clients
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));
ALTER POLICY "manager update clients" ON clients
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]))
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));

-- employees
ALTER POLICY "manager insert employees" ON employees
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));
ALTER POLICY "manager select employees" ON employees
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));
ALTER POLICY "manager update employees" ON employees
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]))
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));

-- exception_logs
ALTER POLICY "manager insert exception_logs as team_lead" ON exception_logs
  WITH CHECK (
    ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]))
    AND (EXISTS (SELECT 1 FROM team_leads t WHERE t.id = exception_logs.team_lead_id AND t.is_active AND t.deleted_at IS NULL))
  );
ALTER POLICY "manager select all exception_logs" ON exception_logs
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));
ALTER POLICY "manager update exception_logs" ON exception_logs
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]))
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));

-- exception_photos
ALTER POLICY "manager insert any exception photos" ON exception_photos
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));
ALTER POLICY "manager select all exception_photos" ON exception_photos
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));

-- lunch_menu_items
ALTER POLICY "manager insert lunch_menu_items" ON lunch_menu_items
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));
ALTER POLICY "manager update lunch_menu_items" ON lunch_menu_items
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]))
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));

-- lunch_orders
ALTER POLICY "manager select lunch_orders" ON lunch_orders
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));

-- lunch_settings
ALTER POLICY "manager update lunch_settings" ON lunch_settings
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]))
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));

-- part_orders
ALTER POLICY "manager insert part_orders as team_lead" ON part_orders
  WITH CHECK (
    ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]))
    AND (EXISTS (SELECT 1 FROM team_leads t WHERE t.id = part_orders.team_lead_id AND t.is_active AND t.deleted_at IS NULL))
  );
ALTER POLICY "manager select all part_orders" ON part_orders
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));
ALTER POLICY "manager update part_orders" ON part_orders
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]))
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));

-- part_requests
ALTER POLICY "manager delete pending part_requests" ON part_requests
  USING (
    ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]))
    AND (EXISTS (SELECT 1 FROM part_orders po WHERE po.id = part_requests.order_id AND po.status = 'pending'))
  );
ALTER POLICY "manager insert part_requests" ON part_requests
  WITH CHECK (
    ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]))
    AND (EXISTS (SELECT 1 FROM part_orders po WHERE po.id = part_requests.order_id AND po.status = 'pending'))
  );
ALTER POLICY "manager select all part_requests" ON part_requests
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));
ALTER POLICY "manager update part_requests" ON part_requests
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]))
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));

-- profiles
ALTER POLICY "manager select all profiles" ON profiles
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));

-- projects
ALTER POLICY "manager insert projects" ON projects
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));
ALTER POLICY "manager select all projects" ON projects
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));
ALTER POLICY "manager update projects" ON projects
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]))
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));

-- report_photos
ALTER POLICY "manager insert any report photos" ON report_photos
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));
ALTER POLICY "manager select all report_photos" ON report_photos
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));

-- reports
ALTER POLICY "manager insert as team_lead" ON reports
  WITH CHECK (
    ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]))
    AND (created_by = auth.uid())
    AND (EXISTS (SELECT 1 FROM team_leads t WHERE t.id = reports.team_lead_id AND t.is_active AND t.deleted_at IS NULL))
  );
ALTER POLICY "manager select all reports" ON reports
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));
ALTER POLICY "manager update any report" ON reports
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]))
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));

-- signature_requests
ALTER POLICY "manager insert signature_requests" ON signature_requests
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));
ALTER POLICY "manager select all signature_requests" ON signature_requests
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));
ALTER POLICY "manager update signature_requests" ON signature_requests
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]))
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));

-- team_leads
ALTER POLICY "manager insert team_leads" ON team_leads
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));
ALTER POLICY "manager select all team_leads" ON team_leads
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));
ALTER POLICY "manager update team_leads" ON team_leads
  USING ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]))
  WITH CHECK ((SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id)) = ANY (ARRAY['factory_manager'::text,'platform_admin'::text]));
