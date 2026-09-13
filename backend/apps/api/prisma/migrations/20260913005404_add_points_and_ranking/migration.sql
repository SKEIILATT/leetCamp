-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "points" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "streaks" ADD COLUMN     "total_points" INTEGER NOT NULL DEFAULT 0;
