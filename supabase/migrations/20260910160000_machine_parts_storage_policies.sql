-- Phase 1 created the machine-parts and fault-reports Storage buckets but
-- never added storage.objects RLS policies for either — public=true only
-- covers public GET, not INSERT, so uploads to machine-parts would have
-- failed silently. Found and fixed while building Phase 4 (parts catalog
-- photo upload). fault-reports has the same gap, left for whichever phase
-- builds the fault-report flow (see TODO.md).

CREATE POLICY "public read machine-parts" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'machine-parts');

CREATE POLICY "manager upload machine-parts" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'machine-parts'
    AND (SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id))
      = ANY (ARRAY['factory_manager', 'platform_admin'])
  );

CREATE POLICY "manager update machine-parts" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'machine-parts'
    AND (SELECT auth_profile.role FROM auth_profile() auth_profile(role, team_lead_id))
      = ANY (ARRAY['factory_manager', 'platform_admin'])
  );
