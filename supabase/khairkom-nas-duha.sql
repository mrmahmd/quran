-- Install after khairkom-third-round.sql.
-- In round 3, 31 is the option "من الناس للضحى". It is not a numbered part.
begin;
set local lock_timeout = '5s';

do $migration$
declare
  roster_check text;
  external_check text;
  numbered_parts smallint[] := array(select n::smallint from generate_series(1,30) n);
  round_three_parts smallint[] := array_append(numbered_parts,31::smallint);
begin
  select conname into strict roster_check from pg_constraint
    where conrelid='public.khairkom_nominations'::regclass and contype='c'
      and pg_get_constraintdef(oid) like '%cardinality(test_parts)%';
  select conname into strict external_check from pg_constraint
    where conrelid='quran_private.khairkom_external_nominees'::regclass and contype='c'
      and pg_get_constraintdef(oid) like '%cardinality(test_parts)%';

  execute format('alter table public.khairkom_nominations drop constraint %I, add constraint %I
    check (cardinality(test_parts)<=31 and array_position(test_parts,null) is null
      and test_parts <@ %L::smallint[])',roster_check,roster_check,round_three_parts);
  execute format('alter table quran_private.khairkom_external_nominees drop constraint %I, add constraint %I
    check (array_position(test_parts,null) is null and
      (case when period_no=3 then cardinality(test_parts)<=31 and test_parts <@ %L::smallint[]
        else cardinality(test_parts) between 1 and 30 and test_parts <@ %L::smallint[] end))',
    external_check,external_check,round_three_parts,numbered_parts);
end;
$migration$;

-- Adjust only validation in the installed writers, preserving authorization, round locks and auditing.
do $migration$
declare
  writer record;
  change record;
  definition text;
begin
  for writer in select * from (values
    ('quran_private.save_khairkom_nominations_period(integer,text,uuid,jsonb,integer)','p_period',true),
    ('quran_private.add_khairkom_nomination_period(integer,uuid,uuid,text,text,text,smallint[])','p_period',false),
    ('quran_private.update_khairkom_nominee(uuid,uuid,text,text,smallint[],integer)','target_period',false)
  ) as writers(signature,period_variable,is_teacher_save) loop
    definition := pg_get_functiondef(writer.signature::regprocedure);
    for change in select * from (values
      ('and 30 then', 'and (case when p_period=3 then 31 else 30 end) then', writer.is_teacher_save),
      (') and 30 or array_position', format(') and (case when %s=3 then 31 else 30 end) or array_position',writer.period_variable),not writer.is_teacher_save),
      ($old$or p.value::text !~ '^([1-9]|[12][0-9]|30)$'$old$,
       $new$or p.value::text !~ '^([1-9]|[12][0-9]|3[01])$' or (p.value::text='31' and p_period<>3)$new$,writer.is_teacher_save),
      ('p not between 1 and 30',format('p not between 1 and (case when %s=3 then 31 else 30 end)',writer.period_variable),not writer.is_teacher_save),
      ('اختر أجزاء مختلفة من ١ إلى ٣٠','اختر خيارات حفظ مختلفة من القائمة',true)
    ) as changes(old_text,new_text,applies) where applies loop
      if cardinality(string_to_array(definition,change.old_text))<>2 then
        raise exception 'Unexpected validation in %',writer.signature;
      end if;
      definition := replace(definition,change.old_text,change.new_text);
    end loop;
    execute definition;
  end loop;
end;
$migration$;

commit;
