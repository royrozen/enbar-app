-- PROD alignment B3b: part_requests.notes was missed in B3 — DEV's
-- part_requests never had this column at all. Applied to PROD.
alter table part_requests drop column notes;
