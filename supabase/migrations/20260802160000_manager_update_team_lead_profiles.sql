-- profiles had zero UPDATE/INSERT/DELETE policies — only the two SELECT ones
-- from Phase 2. Manager Settings' team-leads tab needs to let a manager edit
-- a team lead's phone (which lives on profiles, not team_leads). Scoped to
-- role = 'team_lead' rows only — managers can't use this to touch other
-- managers' profiles.

create policy "manager update team_lead profiles" on profiles
  for update to authenticated
  using (
    (select role from auth_profile()) = 'factory_manager'
    and role = 'team_lead'
  )
  with check (
    (select role from auth_profile()) = 'factory_manager'
    and role = 'team_lead'
  );
