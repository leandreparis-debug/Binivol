-- CreateEnum
CREATE TYPE "AccountTokenPurpose" AS ENUM ('INVITE', 'RESET');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "password_changed_at" TIMESTAMPTZ(3),
ADD COLUMN     "password_hash" TEXT,
ADD COLUMN     "username" TEXT;

-- CreateTable
CREATE TABLE "account_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "purpose" "AccountTokenPurpose" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,

    CONSTRAINT "account_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_tokens_token_hash_key" ON "account_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "account_tokens_user_id_idx" ON "account_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- AddForeignKey
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Integrity rules (ADR-070), written by hand.
-- Identifier: lower case, 3 to 40 characters, letters, digits, dot, dash, underscore.
ALTER TABLE "users"
  ADD CONSTRAINT "users_username_format" CHECK (username ~ '^[a-z0-9][a-z0-9._-]{2,39}$');
-- Only argon2id hashes, and a change date whenever a password is set.
ALTER TABLE "users"
  ADD CONSTRAINT "users_password_hash_argon2id" CHECK (password_hash LIKE '$argon2id$%');
ALTER TABLE "users"
  ADD CONSTRAINT "users_password_changed_at_set"
  CHECK ((password_hash IS NULL) = (password_changed_at IS NULL));
-- Only the SHA-256 (hex) of a token is stored, and a link always expires after its creation.
ALTER TABLE "account_tokens"
  ADD CONSTRAINT "account_tokens_token_hash_sha256" CHECK (token_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE "account_tokens"
  ADD CONSTRAINT "account_tokens_expires_after_creation" CHECK (expires_at > created_at);
