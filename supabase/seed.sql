-- Local seed data. `supabase db reset` runs this after the migrations.
--
-- Test accounts (sign in at http://localhost:5173):
--   email                      password   role      data
--   alice.pm@example.com       password1  pm        two projects, three PRDs
--   ben.pm@example.com         password2  pm        one project, one PRD, for cross-owner tests
--   erin.engineer@example.com  password3  engineer
--   ada.admin@example.com      password4  admin     legacy global admin
--
-- These are deliberately obvious test-only passwords for the local stack.
-- They are not real credentials and don't exist on the hosted database.

-- Supabase Auth reads these token columns as strings, so they must be ''
-- rather than NULL, and email sign-in needs a matching identity row.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
  u.email, crypt(u.password, gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}', jsonb_build_object('full_name', u.full_name),
  now(), now(), '', '', '', ''
from (values
  ('00000000-0000-0000-0000-00000000a11c'::uuid, 'alice.pm@example.com', 'Alice PM', 'password1'),
  ('00000000-0000-0000-0000-000000000be4'::uuid, 'ben.pm@example.com', 'Ben PM', 'password2'),
  ('00000000-0000-0000-0000-0000000000e1'::uuid, 'erin.engineer@example.com', 'Erin Engineer', 'password3'),
  ('00000000-0000-0000-0000-0000000000ad'::uuid, 'ada.admin@example.com', 'Ada Admin', 'password4')
) as u(id, email, full_name, password);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, 'email',
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), now(), now(), now()
from auth.users
where email like '%@example.com';

-- handle_new_user created a 'pm' profile for each user; set the other roles.
update public.profile set role = 'engineer' where email = 'erin.engineer@example.com';
update public.profile set role = 'admin' where email = 'ada.admin@example.com';

insert into public.project (id, name, owner_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'Campus Life', '00000000-0000-0000-0000-00000000a11c'),
  ('00000000-0000-0000-0000-0000000000c2', 'Internal Tools', '00000000-0000-0000-0000-00000000a11c'),
  ('00000000-0000-0000-0000-0000000000c3', 'Community', '00000000-0000-0000-0000-000000000be4');

insert into public.prd (title, owner_id, project_id, status, content_text) values
  ('Campus Study Group Finder', '00000000-0000-0000-0000-00000000a11c',
   '00000000-0000-0000-0000-0000000000c1', 'draft', 'Help students find study groups.'),
  ('Library Room Booking', '00000000-0000-0000-0000-00000000a11c',
   '00000000-0000-0000-0000-0000000000c1', 'in_review', 'Book library rooms online.'),
  ('Expense Report Tool', '00000000-0000-0000-0000-00000000a11c', null, 'final', 'Submit expenses in one place.'),
  ('Neighborhood Lost Pet Board', '00000000-0000-0000-0000-000000000be4',
   '00000000-0000-0000-0000-0000000000c3', 'draft', 'Post and find lost pets.');

-- One PRD with sections so the editor has something to open. This uses the
-- frontend's current section shape; it is not the editor contract, which is
-- still being agreed (Tiptap JSON, S03).
update public.prd set content_json = '{
  "description": "Help students find study groups.",
  "sections": [
    {"type": "problem", "title": "Problem Statement",
     "html": "<p>Students struggle to find study groups for their classes.</p>"},
    {"type": "goals", "title": "Goals",
     "html": "<ul><li>Join a group within one day of searching</li></ul>"}
  ]
}'::jsonb
where title = 'Campus Study Group Finder';

insert into public.intake_answer (prd_id, question_key, answer_text)
select id, 'problem', content_text from public.prd;
