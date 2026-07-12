-- Move contact fields from clients to projects
-- Contact person, phone, and email are now project-specific
-- since different projects of the same client may have different contact persons

alter table public.projects
  add column contact_person text,
  add column phone text,
  add column email text;

-- Drop contact columns from clients table
alter table public.clients
  drop column if exists contact_person,
  drop column if exists phone,
  drop column if exists email;
