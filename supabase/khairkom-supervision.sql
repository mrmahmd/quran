-- Scoped Khairkom supervision. Existing teacher nomination writes remain unchanged.
begin;
create table if not exists quran_private.khairkom_supervisors (
 teacher_username text primary key references public.teacher_accounts(username),
 can_edit_identity boolean not null default false,
 active boolean not null default true
);
alter table quran_private.khairkom_supervisors enable row level security;
revoke all on quran_private.khairkom_supervisors from public,anon,authenticated;
-- Do not assign permissions to a mismatched account.
do $$begin
 if not exists(select 1 from public.teacher_accounts where username='quran17' and full_name like '%نمر%' and active)
 or not exists(select 1 from public.teacher_accounts where username='quran19' and full_name like '%عثمان%' and active)
 then raise exception 'تحقق من حسابي محمد النمر ومحمد عثمان قبل منح الصلاحية'; end if;
end;$$;
insert into quran_private.khairkom_supervisors(teacher_username,can_edit_identity) values ('quran17',true),('quran19',false)
on conflict(teacher_username) do update set can_edit_identity=excluded.can_edit_identity,active=true;
create or replace function quran_private.khairkom_permissions() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('view',auth.uid() is not null and (exists(select 1 from public.admin_accounts where auth_user_id=auth.uid() and active) or exists(select 1 from quran_private.khairkom_supervisors k join public.teacher_accounts t on t.username=k.teacher_username where t.auth_user_id=auth.uid() and t.active and k.active)),
 'edit_identity',auth.uid() is not null and (exists(select 1 from public.admin_accounts where auth_user_id=auth.uid() and active) or exists(select 1 from quran_private.khairkom_supervisors k join public.teacher_accounts t on t.username=k.teacher_username where t.auth_user_id=auth.uid() and t.active and k.active and k.can_edit_identity)));
$$;
create or replace function public.khairkom_permissions() returns jsonb language sql stable security invoker set search_path='' as $$select quran_private.khairkom_permissions();$$;
create or replace function quran_private.khairkom_report_snapshot(p_term uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce((quran_private.khairkom_permissions()->>'view')::boolean,false) then raise exception 'ليس لديك صلاحية عرض ترشيحات خيركم' using errcode='42501'; end if;
 return jsonb_build_object(
 'teachers',(select coalesce(jsonb_agg(jsonb_build_object('username',t.username,'full_name',t.full_name,'class_name',t.class_name,'ring_name',t.ring_name,'active',t.active) order by t.username),'[]'::jsonb) from public.teacher_accounts t where t.active or exists(select 1 from public.khairkom_nomination_sets ns where ns.teacher_username=t.username and ns.term_id=p_term)),
 'sets',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'teacher_username',s.teacher_username,'version',s.version)),'[]'::jsonb) from public.khairkom_nomination_sets s where s.term_id=p_term),
 'rows',(select coalesce(jsonb_agg(jsonb_build_object('set_id',n.set_id,'teacher_username',n.teacher_username,'student_id',n.student_id,'test_parts',n.test_parts,'identity_number',n.identity_number) order by n.teacher_username,n.student_id),'[]'::jsonb) from public.khairkom_nominations n join public.khairkom_nomination_sets s on s.id=n.set_id where s.term_id=p_term and n.nominated),
 'students',(select coalesce(jsonb_agg(jsonb_build_object('id',st.id,'full_name',st.full_name,'teacher_username',st.teacher_username,'source_class',st.source_class) order by st.full_name),'[]'::jsonb) from public.students st where exists(select 1 from public.khairkom_nominations n join public.khairkom_nomination_sets s on s.id=n.set_id where n.student_id=st.id and n.nominated and s.term_id=p_term)));
end;$$;
create or replace function public.khairkom_report_snapshot(p_term uuid) returns jsonb language sql stable security invoker set search_path='' as $$select quran_private.khairkom_report_snapshot(p_term);$$;
create table if not exists quran_private.khairkom_identity_audit (
 id bigint generated always as identity primary key,
 set_id uuid not null,student_id uuid not null,actor_id uuid not null,
 old_identity text,new_identity text not null,changed_at timestamptz not null default now()
);
alter table quran_private.khairkom_identity_audit enable row level security;
revoke all on quran_private.khairkom_identity_audit from public,anon,authenticated;
create or replace function quran_private.update_khairkom_identity(p_set uuid,p_student uuid,p_identity text,p_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rec public.khairkom_nomination_sets; previous text; cleaned text;
begin
 if not coalesce((quran_private.khairkom_permissions()->>'edit_identity')::boolean,false) then raise exception 'ليس لديك صلاحية تعديل هوية المرشح' using errcode='42501'; end if;
 cleaned:=btrim(p_identity);
 if cleaned is null or cleaned !~ '^[0-9]{6,20}$' then raise exception 'رقم الهوية يجب أن يكون من ٦ إلى ٢٠ رقمًا'; end if;
 select * into rec from public.khairkom_nomination_sets where id=p_set;
 if not found then raise exception 'الترشيح غير موجود'; end if;
 perform pg_advisory_xact_lock(hashtextextended('khairkom'||rec.teacher_username||rec.term_id::text,0));
 select * into rec from public.khairkom_nomination_sets where id=p_set for update;
 if p_version is null or rec.version<>p_version then raise exception 'تغيّرت الترشيحات. حدّث البيانات ثم حاول مرة أخرى'; end if;
 select identity_number into previous from public.khairkom_nominations where set_id=p_set and student_id=p_student and nominated for update;
 if not found then raise exception 'الطالب لم يعد مرشحًا'; end if;
 update public.khairkom_nominations set identity_number=cleaned,updated_at=now() where set_id=p_set and student_id=p_student;
 update public.khairkom_nomination_sets set version=version+1,updated_at=now() where id=p_set;
 insert into quran_private.khairkom_identity_audit(set_id,student_id,actor_id,old_identity,new_identity) values(p_set,p_student,auth.uid(),previous,cleaned);
 return jsonb_build_object('saved',true);
end;$$;
create or replace function public.update_khairkom_identity(p_set uuid,p_student uuid,p_identity text,p_version integer) returns jsonb language sql security invoker set search_path='' as $$select quran_private.update_khairkom_identity(p_set,p_student,p_identity,p_version);$$;
revoke all on function quran_private.khairkom_permissions(),public.khairkom_permissions(),quran_private.khairkom_report_snapshot(uuid),public.khairkom_report_snapshot(uuid),quran_private.update_khairkom_identity(uuid,uuid,text,integer),public.update_khairkom_identity(uuid,uuid,text,integer) from public,anon;
grant execute on function quran_private.khairkom_permissions(),public.khairkom_permissions(),quran_private.khairkom_report_snapshot(uuid),public.khairkom_report_snapshot(uuid),quran_private.update_khairkom_identity(uuid,uuid,text,integer),public.update_khairkom_identity(uuid,uuid,text,integer) to authenticated;
commit;
