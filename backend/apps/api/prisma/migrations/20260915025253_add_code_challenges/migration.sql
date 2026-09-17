-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "judge_details" JSONB;

-- AlterTable
ALTER TABLE "challenges" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'prediction',
ALTER COLUMN "code_snippet" DROP NOT NULL,
ALTER COLUMN "expected_answer" DROP NOT NULL;

-- CreateTable
CREATE TABLE "code_challenges" (
    "challenge_id" UUID NOT NULL,
    "starter_code" TEXT NOT NULL,
    "language" TEXT NOT NULL,

    CONSTRAINT "code_challenges_pkey" PRIMARY KEY ("challenge_id")
);

-- CreateTable
CREATE TABLE "test_cases" (
    "id" UUID NOT NULL,
    "code_challenge_id" UUID NOT NULL,
    "input" TEXT NOT NULL,
    "expected_output" TEXT NOT NULL,
    "is_hidden" BOOLEAN NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "test_cases_code_challenge_id_idx" ON "test_cases"("code_challenge_id");

-- CreateIndex
CREATE INDEX "challenges_type_idx" ON "challenges"("type");

-- AddForeignKey
ALTER TABLE "code_challenges" ADD CONSTRAINT "code_challenges_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_code_challenge_id_fkey" FOREIGN KEY ("code_challenge_id") REFERENCES "code_challenges"("challenge_id") ON DELETE CASCADE ON UPDATE CASCADE;
