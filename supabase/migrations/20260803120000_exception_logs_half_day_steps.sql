alter table exception_logs alter column work_days type numeric(4,1);

-- workers x 0.5 x workDays can now land on quarter-days (workDays itself
-- steps by 0.5), e.g. 3 workers x 0.5 day = 0.75 -- numeric(5,1) would
-- silently round that to 0.8.
alter table exception_logs alter column billable_days type numeric(6,2);
