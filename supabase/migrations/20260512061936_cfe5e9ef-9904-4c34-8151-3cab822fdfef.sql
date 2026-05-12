-- Add named projects: each user can have many projects with unique names.
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_pkey;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'Untitled',
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT now();

ALTER TABLE public.projects ADD PRIMARY KEY (id);

CREATE UNIQUE INDEX IF NOT EXISTS projects_user_name_unique
  ON public.projects (user_id, name);

CREATE INDEX IF NOT EXISTS projects_user_updated_idx
  ON public.projects (user_id, updated_at DESC);