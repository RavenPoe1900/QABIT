-- CreateTable
-- Generada con `prisma migrate diff`; los CHECK se añadieron a mano ANTES de aplicarla
-- (Prisma no los genera). Los límites coinciden con packages/shared (TITLE_MAX = 120,
-- ASSIGNEE_MAX = 60). Una migración ya aplicada no se modifica: cualquier cambio va en una nueva.
CREATE TABLE "tasks" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "assignee" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "tasks_status_check" CHECK ("status" IN ('pending', 'in_progress', 'done')),
    CONSTRAINT "tasks_title_check" CHECK (length(trim("title")) BETWEEN 1 AND 120),
    CONSTRAINT "tasks_assignee_check" CHECK (length(trim("assignee")) BETWEEN 1 AND 60)
);

-- CreateIndex
CREATE INDEX "idx_tasks_status" ON "tasks"("status");
