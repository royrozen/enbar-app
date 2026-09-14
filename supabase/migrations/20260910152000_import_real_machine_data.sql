-- Real 21-machine dataset from Roy's מיפוי מכונות Enbar CSV (מספר מכונה == machine_no,
-- verified via identity assignment starting fresh). machines/machine_parts/machine_periods
-- were empty before this ran. next_due_date uses the placeholder anchors noted in the
-- Phase 3 plan (weekday=0/day_of_month=1/anchor_month=1+anchor_day=1) -- every machine+period
-- row needs its real anchor set by hand through the admin UI.
TRUNCATE machines RESTART IDENTITY CASCADE;

BEGIN;

-- 001 קו ייצור
DO $$
DECLARE
  v_machine_id uuid;
  v_period_id uuid;
  v_mp_0 uuid;
  v_mp_1 uuid;
BEGIN
  INSERT INTO machines (name) VALUES ('קו ייצור') RETURNING id INTO v_machine_id;
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, '90ea7d0f-96ff-4bbb-903a-21519b94013c', 0, NULL, NULL, NULL,
      compute_next_due_date('weekly', CURRENT_DATE, 0, NULL, NULL, NULL, 1))
    RETURNING id INTO v_mp_0;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בדוק מצב סלאוניד וחיבור למקום', 0);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בדוק רולרים חופשיים בגלגלות', 1);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בצע הידוק לברגי הגיליוטינה', 2);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בדוק מצב שמן הידראולי במיכל', 3);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בדוק לנזילות מסביב למכונה', 4);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בצע נקיון למכונה', 5);
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, 'c419be6d-5108-49c6-99d7-0ef0a98dbd5d', NULL, 1, NULL, NULL,
      compute_next_due_date('monthly', CURRENT_DATE, NULL, 1, NULL, NULL, 1))
    RETURNING id INTO v_mp_1;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_1, 'בצע גירוז עבור גלגלי שיניים', 0);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_1, 'בדוק מצב רצועות לשחיקה', 1);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_1, 'נקיון לוח חשמל עם מפוח יעודי', 2);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_1, 'בצע הידוק חיבורי חשמל בלוח חשמל', 3);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_1, 'בצע הידוק ברגים במכונה', 4);
END $$;

-- 002 מכונת שטוצרים
DO $$
DECLARE
  v_machine_id uuid;
  v_period_id uuid;
  v_mp_0 uuid;
BEGIN
  INSERT INTO machines (name) VALUES ('מכונת שטוצרים') RETURNING id INTO v_machine_id;
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, 'c419be6d-5108-49c6-99d7-0ef0a98dbd5d', NULL, 1, NULL, NULL,
      compute_next_due_date('monthly', CURRENT_DATE, NULL, 1, NULL, NULL, 1))
    RETURNING id INTO v_mp_0;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'פתח מכסים ובדוק חלקים לשלמות', 0);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בצע גירוז עבור גלגלי שיניים', 1);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בדוק תקינות רצועה', 2);
END $$;

-- 003 מערגלת חשמלית
DO $$
DECLARE
  v_machine_id uuid;
  v_period_id uuid;
  v_mp_0 uuid;
BEGIN
  INSERT INTO machines (name) VALUES ('מערגלת חשמלית') RETURNING id INTO v_machine_id;
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'גלילים');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'מנוע חשמלי');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'ממסרת');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'מסבים');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'לוח פיקוד');
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, 'c419be6d-5108-49c6-99d7-0ef0a98dbd5d', NULL, 1, NULL, NULL,
      compute_next_due_date('monthly', CURRENT_DATE, NULL, 1, NULL, NULL, 1))
    RETURNING id INTO v_mp_0;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בצע נקיון למכונה', 0);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'נקיון לוח חשמל עם מפוח יעודי', 1);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בצע הידוק כללי לברגי למכונה', 2);
END $$;

-- 004 פלזמה
DO $$
DECLARE
  v_machine_id uuid;
  v_period_id uuid;
  v_mp_0 uuid;
  v_mp_1 uuid;
BEGIN
  INSERT INTO machines (name) VALUES ('פלזמה') RETURNING id INTO v_machine_id;
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'לפיד פלזמה');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'אלקטרודות ודיזות');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'מחולל פלזמה');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'מנועים וצירים');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'מערכת שאיבה');
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, '90ea7d0f-96ff-4bbb-903a-21519b94013c', 0, NULL, NULL, NULL,
      compute_next_due_date('weekly', CURRENT_DATE, 0, NULL, NULL, NULL, 1))
    RETURNING id INTO v_mp_0;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בצע נקיון למכונה', 0);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בצע ניקיון לסביבת המכונה', 1);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'פתח לוח מחשב ונקה עם שואב את פנים הקופסא', 2);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בדוק לנזילות אוויר', 3);
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, 'c419be6d-5108-49c6-99d7-0ef0a98dbd5d', NULL, 1, NULL, NULL,
      compute_next_due_date('monthly', CURRENT_DATE, NULL, 1, NULL, NULL, 1))
    RETURNING id INTO v_mp_1;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_1, 'החלפת פסי פח', 0);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_1, 'ניקוי פנים הפלזמה', 1);
END $$;

-- 005 מכבש פינות
DO $$
DECLARE
  v_machine_id uuid;
  v_period_id uuid;
  v_mp_0 uuid;
BEGIN
  INSERT INTO machines (name) VALUES ('מכבש פינות') RETURNING id INTO v_machine_id;
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'בוכנה הידראולית');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'סכיני כבישה');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'תבניות');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'שסתומים');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'לוח פיקוד');
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, 'c419be6d-5108-49c6-99d7-0ef0a98dbd5d', NULL, 1, NULL, NULL,
      compute_next_due_date('monthly', CURRENT_DATE, NULL, 1, NULL, NULL, 1))
    RETURNING id INTO v_mp_0;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'מלא שמן בקווים ע״י המשאבה', 0);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בדוק מיקום מכונה לסימון 1.5 ס״מ', 1);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בדוק חיזוק תבנית למקום', 2);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בדוק לשלמות המכונה', 3);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בצע נקיון למכונה בעזרת סמרטוט לח', 4);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בצע הידוק ברגים במכונה', 5);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בדיקת פדל לתקינות', 6);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'נקיון לוח חשמל', 7);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'הידוק לוח חשמל', 8);
END $$;

-- 006 מנקבת פחים
DO $$
DECLARE
  v_machine_id uuid;
  v_period_id uuid;
  v_mp_0 uuid;
BEGIN
  INSERT INTO machines (name) VALUES ('מנקבת פחים') RETURNING id INTO v_machine_id;
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'מטריצות');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'פאנצ''ים');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'בוכנות הידראוליות');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'מנועים');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'חיישנים');
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, 'c419be6d-5108-49c6-99d7-0ef0a98dbd5d', NULL, 1, NULL, NULL,
      compute_next_due_date('monthly', CURRENT_DATE, NULL, 1, NULL, NULL, 1))
    RETURNING id INTO v_mp_0;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בצע ניקיון כללי למכונה', 0);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בדוק חיבורי חשמל', 1);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בדוק לפעולה תקינה', 2);
END $$;

-- 007 מכונת פלאנג׳ים
DO $$
DECLARE
  v_machine_id uuid;
  v_period_id uuid;
  v_mp_0 uuid;
  v_mp_1 uuid;
BEGIN
  INSERT INTO machines (name) VALUES ('מכונת פלאנג׳ים') RETURNING id INTO v_machine_id;
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'גלגלי ערגול');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'מנוע חשמלי');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'תמסורת');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'סכיני חיתוך');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'מערכת הידוק');
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, 'c419be6d-5108-49c6-99d7-0ef0a98dbd5d', NULL, 1, NULL, NULL,
      compute_next_due_date('monthly', CURRENT_DATE, NULL, 1, NULL, NULL, 1))
    RETURNING id INTO v_mp_0;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בצע גירוז לגג״ש', 0);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בדוק חיבורי חשמל', 1);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בדוק ויזואלית מכונה', 2);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בצע הידוק ברגים במכונה', 3);
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, '90ea7d0f-96ff-4bbb-903a-21519b94013c', 0, NULL, NULL, NULL,
      compute_next_due_date('weekly', CURRENT_DATE, 0, NULL, NULL, NULL, 1))
    RETURNING id INTO v_mp_1;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_1, 'העבר פח במכונה ובדוק לתקינות', 0);
END $$;

-- 008 מכונת שיכטה/אמריקה
DO $$
DECLARE
  v_machine_id uuid;
  v_period_id uuid;
  v_mp_0 uuid;
BEGIN
  INSERT INTO machines (name) VALUES ('מכונת שיכטה/אמריקה') RETURNING id INTO v_machine_id;
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'גלגלות עיצוב');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'מנוע');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'מסבים');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'סרגלי הנחיה');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'רצועות הנעה');
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, 'c419be6d-5108-49c6-99d7-0ef0a98dbd5d', NULL, 1, NULL, NULL,
      compute_next_due_date('monthly', CURRENT_DATE, NULL, 1, NULL, NULL, 1))
    RETURNING id INTO v_mp_0;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'פתח מכונה ובצע נקיון יסודי', 0);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בדוק מצב רצועה', 1);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בצע גירוז לגג״ש', 2);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בדוק חיבורי חשמל תקינים כולל שקע', 3);
END $$;

-- 009 מכונת בורט
DO $$
DECLARE
  v_machine_id uuid;
  v_period_id uuid;
  v_mp_0 uuid;
BEGIN
  INSERT INTO machines (name) VALUES ('מכונת בורט') RETURNING id INTO v_machine_id;
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'גלגלות עיצוב');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'מנוע');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'צירים');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'מנגנון הידוק');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'פדאל הפעלה');
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, 'c419be6d-5108-49c6-99d7-0ef0a98dbd5d', NULL, 1, NULL, NULL,
      compute_next_due_date('monthly', CURRENT_DATE, NULL, 1, NULL, NULL, 1))
    RETURNING id INTO v_mp_0;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'פתח מכונה ובצע נקיון יסודי', 0);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בדוק מצב רצועה', 1);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בצע גירוז לגג״ש', 2);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בדוק חיבורי חשמל תקינים כולל שקע', 3);
END $$;

-- 010 אמריקה 1.25
DO $$
DECLARE
  v_machine_id uuid;
  v_period_id uuid;
  v_mp_0 uuid;
BEGIN
  INSERT INTO machines (name) VALUES ('אמריקה 1.25') RETURNING id INTO v_machine_id;
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'גלגלות ערגול');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'גלגלי שיניים');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'מנוע חשמלי');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'רצועות הנעה');
  INSERT INTO machine_parts (machine_id, name) VALUES (v_machine_id, 'מובילי פח');
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, 'c419be6d-5108-49c6-99d7-0ef0a98dbd5d', NULL, 1, NULL, NULL,
      compute_next_due_date('monthly', CURRENT_DATE, NULL, 1, NULL, NULL, 1))
    RETURNING id INTO v_mp_0;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'פתח מכונה ובצע נקיון יסודי', 0);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בדוק מצב רצועה', 1);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בצע גירוז לגג״ש', 2);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בדוק חיבורי חשמל תקינים כולל שקע', 3);
END $$;

-- ֿ011 מכופפת הידראולית 1.25
DO $$
DECLARE
  v_machine_id uuid;
  v_period_id uuid;
  v_mp_0 uuid;
  v_mp_1 uuid;
BEGIN
  INSERT INTO machines (name) VALUES ('מכופפת הידראולית 1.25') RETURNING id INTO v_machine_id;
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, '90ea7d0f-96ff-4bbb-903a-21519b94013c', 0, NULL, NULL, NULL,
      compute_next_due_date('weekly', CURRENT_DATE, 0, NULL, NULL, NULL, 1))
    RETURNING id INTO v_mp_0;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'נקיון כללי סביב המכונה', 0);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בדוק נזילות בבוכנות', 1);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בדוק מפלס שמן במכונה', 2);
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, 'c419be6d-5108-49c6-99d7-0ef0a98dbd5d', NULL, 1, NULL, NULL,
      compute_next_due_date('monthly', CURRENT_DATE, NULL, 1, NULL, NULL, 1))
    RETURNING id INTO v_mp_1;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_1, 'בצע נקיון בלוח חשמל', 0);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_1, 'בצע הידוק ברגים במכונה (כולל שולחן ובוכנות)', 1);
END $$;

-- ֿ012 מכופפת הידראולית 2.5
DO $$
DECLARE
  v_machine_id uuid;
  v_period_id uuid;
  v_mp_0 uuid;
  v_mp_1 uuid;
BEGIN
  INSERT INTO machines (name) VALUES ('מכופפת הידראולית 2.5') RETURNING id INTO v_machine_id;
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, '90ea7d0f-96ff-4bbb-903a-21519b94013c', 0, NULL, NULL, NULL,
      compute_next_due_date('weekly', CURRENT_DATE, 0, NULL, NULL, NULL, 1))
    RETURNING id INTO v_mp_0;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'נקיון כללי סביב המכונה', 0);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בדוק נזילות בבוכנות', 1);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בדוק מפלס שמן במכונה', 2);
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, 'c419be6d-5108-49c6-99d7-0ef0a98dbd5d', NULL, 1, NULL, NULL,
      compute_next_due_date('monthly', CURRENT_DATE, NULL, 1, NULL, NULL, 1))
    RETURNING id INTO v_mp_1;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_1, 'בצע נקיון בלוח חשמל', 0);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_1, 'בצע הידוק ברגים במכונה (כולל שולחן ובוכנות)', 1);
END $$;

-- ֿ013 מגהצת פח
DO $$
DECLARE
  v_machine_id uuid;
  v_period_id uuid;
  v_mp_0 uuid;
  v_mp_1 uuid;
BEGIN
  INSERT INTO machines (name) VALUES ('מגהצת פח') RETURNING id INTO v_machine_id;
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, '90ea7d0f-96ff-4bbb-903a-21519b94013c', 0, NULL, NULL, NULL,
      compute_next_due_date('weekly', CURRENT_DATE, 0, NULL, NULL, NULL, 1))
    RETURNING id INTO v_mp_0;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בצע הידוק ברגים במכונה', 0);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בדוק רולרים', 1);
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, 'c419be6d-5108-49c6-99d7-0ef0a98dbd5d', NULL, 1, NULL, NULL,
      compute_next_due_date('monthly', CURRENT_DATE, NULL, 1, NULL, NULL, 1))
    RETURNING id INTO v_mp_1;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_1, 'בצע נקיון כללי למכונה', 0);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_1, 'בצע נקיון בלוח חשמל', 1);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_1, 'גירוז פטמות', 2);
END $$;

-- 014 מכשיר סיכות
DO $$
DECLARE
  v_machine_id uuid;
  v_period_id uuid;
  v_mp_0 uuid;
BEGIN
  INSERT INTO machines (name) VALUES ('מכשיר סיכות') RETURNING id INTO v_machine_id;
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, 'c419be6d-5108-49c6-99d7-0ef0a98dbd5d', NULL, 1, NULL, NULL,
      compute_next_due_date('monthly', CURRENT_DATE, NULL, 1, NULL, NULL, 1))
    RETURNING id INTO v_mp_0;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'פתח ובצע נקיון בעזרת לחץ אויר', 0);
END $$;

-- 015 גיליוטינה
DO $$
DECLARE
  v_machine_id uuid;
  v_period_id uuid;
  v_mp_0 uuid;
  v_mp_1 uuid;
BEGIN
  INSERT INTO machines (name) VALUES ('גיליוטינה') RETURNING id INTO v_machine_id;
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, '90ea7d0f-96ff-4bbb-903a-21519b94013c', 0, NULL, NULL, NULL,
      compute_next_due_date('weekly', CURRENT_DATE, 0, NULL, NULL, NULL, 1))
    RETURNING id INTO v_mp_0;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בצע בדיקת כיון לסרגל אחורי', 0);
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, 'c419be6d-5108-49c6-99d7-0ef0a98dbd5d', NULL, 1, NULL, NULL,
      compute_next_due_date('monthly', CURRENT_DATE, NULL, 1, NULL, NULL, 1))
    RETURNING id INTO v_mp_1;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_1, 'בצע גירוז לחלזונות', 0);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_1, 'בצע נקיון כללי למכונה', 1);
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_1, 'בצע נקיון בלוח חשמל', 2);
END $$;

-- 016 מקדחת עמוד
DO $$
DECLARE
  v_machine_id uuid;
  v_period_id uuid;
  v_mp_0 uuid;
BEGIN
  INSERT INTO machines (name) VALUES ('מקדחת עמוד') RETURNING id INTO v_machine_id;
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, '90ea7d0f-96ff-4bbb-903a-21519b94013c', 0, NULL, NULL, NULL,
      compute_next_due_date('weekly', CURRENT_DATE, 0, NULL, NULL, NULL, 1))
    RETURNING id INTO v_mp_0;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'בצע נקיון כללי למכונה', 0);
END $$;

-- 017 מזגן אולם ייצור 1
DO $$
DECLARE
  v_machine_id uuid;
  v_period_id uuid;
  v_mp_0 uuid;
BEGIN
  INSERT INTO machines (name) VALUES ('מזגן אולם ייצור 1') RETURNING id INTO v_machine_id;
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, '90ea7d0f-96ff-4bbb-903a-21519b94013c', 0, NULL, NULL, NULL,
      compute_next_due_date('weekly', CURRENT_DATE, 0, NULL, NULL, NULL, 1))
    RETURNING id INTO v_mp_0;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'ניקוי ושטיפת פילטרים', 0);
END $$;

-- 018 מזגן אולם ייצור 2
DO $$
DECLARE
  v_machine_id uuid;
  v_period_id uuid;
  v_mp_0 uuid;
BEGIN
  INSERT INTO machines (name) VALUES ('מזגן אולם ייצור 2') RETURNING id INTO v_machine_id;
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, '90ea7d0f-96ff-4bbb-903a-21519b94013c', 0, NULL, NULL, NULL,
      compute_next_due_date('weekly', CURRENT_DATE, 0, NULL, NULL, NULL, 1))
    RETURNING id INTO v_mp_0;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'ניקוי ושטיפת פילטרים', 0);
END $$;

-- 019 מזגן חן
DO $$
DECLARE
  v_machine_id uuid;
  v_period_id uuid;
  v_mp_0 uuid;
BEGIN
  INSERT INTO machines (name) VALUES ('מזגן חן') RETURNING id INTO v_machine_id;
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, '90ea7d0f-96ff-4bbb-903a-21519b94013c', 0, NULL, NULL, NULL,
      compute_next_due_date('weekly', CURRENT_DATE, 0, NULL, NULL, NULL, 1))
    RETURNING id INTO v_mp_0;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'ניקוי ושטיפת פילטרים', 0);
END $$;

-- 020 מזגן משרד הנדסה
DO $$
DECLARE
  v_machine_id uuid;
  v_period_id uuid;
  v_mp_0 uuid;
BEGIN
  INSERT INTO machines (name) VALUES ('מזגן משרד הנדסה') RETURNING id INTO v_machine_id;
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, 'd6078b79-f581-434e-8040-51ffdf19b367', NULL, NULL, 1, 1,
      compute_next_due_date('triannual', CURRENT_DATE, NULL, NULL, 1, 1, 1))
    RETURNING id INTO v_mp_0;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'ניקוי ושטיפת פילטרים', 0);
END $$;

-- 021 מזגן משרד מנכ״ל
DO $$
DECLARE
  v_machine_id uuid;
  v_period_id uuid;
  v_mp_0 uuid;
BEGIN
  INSERT INTO machines (name) VALUES ('מזגן משרד מנכ״ל') RETURNING id INTO v_machine_id;
  INSERT INTO machine_periods (machine_id, period_id, weekday, day_of_month, anchor_month, anchor_day, next_due_date)
    VALUES (v_machine_id, 'd6078b79-f581-434e-8040-51ffdf19b367', NULL, NULL, 1, 1,
      compute_next_due_date('triannual', CURRENT_DATE, NULL, NULL, 1, 1, 1))
    RETURNING id INTO v_mp_0;
  INSERT INTO machine_period_tasks (machine_period_id, task_name, sort_order) VALUES (v_mp_0, 'ניקוי ושטיפת פילטרים', 0);
END $$;

COMMIT;
