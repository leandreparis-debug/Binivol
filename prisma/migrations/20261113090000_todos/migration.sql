-- CreateEnum
CREATE TYPE "TodoProjectColor" AS ENUM ('INK', 'ACCENT', 'OK', 'WARN', 'DANGER', 'MUTED');

-- CreateEnum
CREATE TYPE "TodoProjectRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateTable
CREATE TABLE "todo_projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" "TodoProjectColor" NOT NULL DEFAULT 'INK',
    "owner_id" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "todo_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todo_project_members" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "TodoProjectRole" NOT NULL DEFAULT 'MEMBER',
    "added_by_id" TEXT,
    "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(3),

    CONSTRAINT "todo_project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todos" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "project_id" TEXT,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "due_date" DATE,
    "person_id" TEXT,
    "completed_at" TIMESTAMPTZ(3),
    "completed_by_id" TEXT,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "todos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todo_assignees" (
    "id" TEXT NOT NULL,
    "todo_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "assigned_by_id" TEXT,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(3),
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "todo_assignees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todo_comments" (
    "id" TEXT NOT NULL,
    "todo_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "todo_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "todo_projects_owner_id_idx" ON "todo_projects"("owner_id");

-- CreateIndex
CREATE INDEX "todo_project_members_user_id_removed_at_idx" ON "todo_project_members"("user_id", "removed_at");

-- CreateIndex
CREATE UNIQUE INDEX "todo_project_members_one_active" ON "todo_project_members"("project_id", "user_id") WHERE (removed_at IS NULL);

-- CreateIndex
CREATE INDEX "todos_project_id_completed_at_due_date_idx" ON "todos"("project_id", "completed_at", "due_date");

-- CreateIndex
CREATE INDEX "todos_owner_active" ON "todos"("owner_id") WHERE (archived_at IS NULL);

-- CreateIndex
CREATE INDEX "todos_person_active" ON "todos"("person_id") WHERE (archived_at IS NULL);

-- CreateIndex
CREATE INDEX "todo_assignees_user_id_removed_at_idx" ON "todo_assignees"("user_id", "removed_at");

-- CreateIndex
CREATE UNIQUE INDEX "todo_assignees_one_active" ON "todo_assignees"("todo_id", "user_id") WHERE (removed_at IS NULL);

-- CreateIndex
CREATE INDEX "todo_comments_todo_id_created_at_idx" ON "todo_comments"("todo_id", "created_at");

-- AddForeignKey
ALTER TABLE "todo_projects" ADD CONSTRAINT "todo_projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_project_members" ADD CONSTRAINT "todo_project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "todo_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_project_members" ADD CONSTRAINT "todo_project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todos" ADD CONSTRAINT "todos_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todos" ADD CONSTRAINT "todos_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "todo_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todos" ADD CONSTRAINT "todos_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_assignees" ADD CONSTRAINT "todo_assignees_todo_id_fkey" FOREIGN KEY ("todo_id") REFERENCES "todos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_assignees" ADD CONSTRAINT "todo_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_comments" ADD CONSTRAINT "todo_comments_todo_id_fkey" FOREIGN KEY ("todo_id") REFERENCES "todos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_comments" ADD CONSTRAINT "todo_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- CHECK constraints (written by hand: Prisma cannot express them)
-- ---------------------------------------------------------------------------

ALTER TABLE "todo_projects"
  ADD CONSTRAINT "todo_projects_name_length" CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  ADD CONSTRAINT "todo_projects_description_length" CHECK (description IS NULL OR char_length(description) <= 1000);

ALTER TABLE "todos"
  ADD CONSTRAINT "todos_title_length" CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  ADD CONSTRAINT "todos_note_length" CHECK (note IS NULL OR char_length(note) <= 2000),
  -- A task is either open, or done with the name of who checked it.
  ADD CONSTRAINT "todos_completed_by" CHECK ((completed_at IS NULL) = (completed_by_id IS NULL));

ALTER TABLE "todo_comments"
  ADD CONSTRAINT "todo_comments_body_length" CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000);
