create extension if not exists pgcrypto;
create extension if not exists vector;

do $$
begin
  create type public.app_role as enum ('ADMIN', 'TEACHER', 'PARENT');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.english_skill as enum ('reading', 'listening', 'speaking', 'writing', 'grammar', 'vocabulary');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.assignment_status as enum ('assigned', 'submitted', 'reviewed', 'missing');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.attendance_status as enum ('present', 'absent', 'late', 'excused');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.document_type as enum ('policy', 'faq', 'handbook', 'announcement', 'course_description', 'program_guide');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.audit_action as enum ('create', 'read', 'update', 'delete', 'analyze', 'chat', 'login');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text not null unique,
  full_name text not null,
  role public.app_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  date_of_birth date,
  current_level text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teachers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  display_name text not null,
  email text not null unique,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  level text not null,
  description text,
  objectives text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete restrict,
  name text not null,
  location text,
  starts_on date,
  ends_on date,
  schedule_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parent_student_links (
  parent_user_id uuid not null references public.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  relationship text not null default 'parent',
  created_at timestamptz not null default now(),
  primary key (parent_user_id, student_id)
);

create table if not exists public.teacher_class_links (
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  role text not null default 'primary_teacher',
  created_at timestamptz not null default now(),
  primary key (teacher_id, class_id)
);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  enrolled_on date not null default current_date,
  status text not null default 'active',
  unique (student_id, class_id)
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null,
  instructions text,
  status public.assignment_status not null default 'assigned',
  due_at timestamptz,
  created_by_teacher_id uuid references public.teachers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  class_date date not null,
  status public.attendance_status not null,
  note text,
  recorded_by_teacher_id uuid references public.teachers(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (class_id, student_id, class_date)
);

create table if not exists public.teacher_feedback (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  feedback_text text not null,
  parent_visible boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.skill_scores (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  skill public.english_skill not null,
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  scale text not null default 'percent',
  assessed_on date not null default current_date,
  source text,
  created_at timestamptz not null default now()
);

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null,
  description text,
  assessment_date date,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  lockdown_enabled boolean not null default true,
  max_violation_count integer default 2 check (max_violation_count is null or max_violation_count >= 0),
  created_by_teacher_id uuid references public.teachers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  question_text text not null,
  expected_answer text,
  skill_tag public.english_skill not null,
  max_score numeric(5,2) not null default 10 check (max_score > 0),
  position integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.rubrics (
  id uuid primary key default gen_random_uuid(),
  assessment_question_id uuid not null references public.assessment_questions(id) on delete cascade,
  criteria jsonb not null,
  score_range numrange not null,
  created_at timestamptz not null default now()
);

create table if not exists public.student_answers (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  assessment_question_id uuid not null references public.assessment_questions(id) on delete cascade,
  answer_text text not null,
  submitted_at timestamptz not null default now(),
  unique (student_id, assessment_question_id)
);

create table if not exists public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  started_at timestamptz not null,
  expires_at timestamptz,
  submitted_at timestamptz,
  status text not null default 'in_progress',
  violation_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, assessment_id)
);

create table if not exists public.assessment_attempt_events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.assessment_attempts(id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.answer_analyses (
  id uuid primary key default gen_random_uuid(),
  student_answer_id uuid not null references public.student_answers(id) on delete cascade,
  strengths text[] not null default '{}',
  mistakes text[] not null default '{}',
  missing_concepts text[] not null default '{}',
  parent_friendly_explanation text not null,
  suggested_parent_actions text[] not null default '{}',
  confidence numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
  ai_provider text not null default 'openai',
  model_name text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  document_type public.document_type not null,
  locale text not null default 'en',
  source_uri text,
  content text not null,
  is_active boolean not null default true,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create table if not exists public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  student_id uuid references public.students(id) on delete cascade,
  insight_type text not null,
  content text not null,
  retrieved_context jsonb not null default '[]'::jsonb,
  safety_notes text[] not null default '{}',
  is_stale boolean not null default false,
  stale_reason text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  actor_role public.app_role,
  action public.audit_action not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_users_role on public.users(role);
create index if not exists idx_parent_student_links_parent on public.parent_student_links(parent_user_id);
create index if not exists idx_parent_student_links_student on public.parent_student_links(student_id);
create index if not exists idx_teacher_class_links_teacher on public.teacher_class_links(teacher_id);
create index if not exists idx_teacher_class_links_class on public.teacher_class_links(class_id);
create index if not exists idx_enrollments_student on public.enrollments(student_id);
create index if not exists idx_enrollments_class on public.enrollments(class_id);
create index if not exists idx_assignments_class_due on public.assignments(class_id, due_at);
create index if not exists idx_attendance_student_date on public.attendance(student_id, class_date desc);
create index if not exists idx_teacher_feedback_student on public.teacher_feedback(student_id, created_at desc);
create index if not exists idx_skill_scores_student_skill on public.skill_scores(student_id, skill, assessed_on desc);
create index if not exists idx_assessment_questions_assessment on public.assessment_questions(assessment_id, position);
create index if not exists idx_student_answers_student on public.student_answers(student_id);
create index if not exists idx_answer_analyses_answer on public.answer_analyses(student_answer_id);
create index if not exists idx_documents_type_active on public.documents(document_type, is_active);
create index if not exists idx_document_chunks_document on public.document_chunks(document_id, chunk_index);
create index if not exists idx_audit_logs_actor_created on public.audit_logs(actor_user_id, created_at desc);
create index if not exists idx_ai_insights_student_created on public.ai_insights(student_id, created_at desc);
create index if not exists idx_ai_insights_stale_student on public.ai_insights(student_id, is_stale, updated_at desc);

create index if not exists idx_document_chunks_embedding
  on public.document_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100)
  where embedding is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists trg_students_updated_at on public.students;
create trigger trg_students_updated_at
before update on public.students
for each row execute function public.set_updated_at();

drop trigger if exists trg_teachers_updated_at on public.teachers;
create trigger trg_teachers_updated_at
before update on public.teachers
for each row execute function public.set_updated_at();

drop trigger if exists trg_courses_updated_at on public.courses;
create trigger trg_courses_updated_at
before update on public.courses
for each row execute function public.set_updated_at();

drop trigger if exists trg_classes_updated_at on public.classes;
create trigger trg_classes_updated_at
before update on public.classes
for each row execute function public.set_updated_at();

drop trigger if exists trg_assignments_updated_at on public.assignments;
create trigger trg_assignments_updated_at
before update on public.assignments
for each row execute function public.set_updated_at();

drop trigger if exists trg_assessments_updated_at on public.assessments;
create trigger trg_assessments_updated_at
before update on public.assessments
for each row execute function public.set_updated_at();

drop trigger if exists trg_documents_updated_at on public.documents;
create trigger trg_documents_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

drop trigger if exists trg_ai_insights_updated_at on public.ai_insights;
create trigger trg_ai_insights_updated_at
before update on public.ai_insights
for each row execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.students enable row level security;
alter table public.teachers enable row level security;
alter table public.courses enable row level security;
alter table public.classes enable row level security;
alter table public.parent_student_links enable row level security;
alter table public.teacher_class_links enable row level security;
alter table public.enrollments enable row level security;
alter table public.assignments enable row level security;
alter table public.attendance enable row level security;
alter table public.teacher_feedback enable row level security;
alter table public.skill_scores enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.rubrics enable row level security;
alter table public.student_answers enable row level security;
alter table public.answer_analyses enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.ai_insights enable row level security;
alter table public.audit_logs enable row level security;
