-- Adds a self-service display name for profiles that have no other name
-- source. Team leads already resolve their name via team_leads.name
-- everywhere (Home.jsx, History.jsx, ManagerDashboard.jsx) — display_name
-- stays empty for them, every read already falls back to that. A
-- factory_manager has no equivalent row, hence this column.
alter table profiles add column display_name text not null default '';

-- profiles had no policy letting a user touch their own row (the existing
-- "manager update team_lead profiles" policy is scoped to *other* people's
-- team_lead rows). Needed so a factory_manager can set their own name.
create policy "own profile update" on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
