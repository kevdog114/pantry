/*
  Warnings:

  - You are about to drop the column `metadata` on the `MealTask` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MealTask" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "mealPlanId" INTEGER,
    "recipeId" INTEGER,
    "relatedMealPlanIds" TEXT,
    "relatedMealDates" TEXT,
    "relatedRecipeTitles" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MealTask_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MealTask_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_MealTask" ("completed", "createdAt", "date", "description", "id", "mealPlanId", "recipeId", "type", "updatedAt") SELECT "completed", "createdAt", "date", "description", "id", "mealPlanId", "recipeId", "type", "updatedAt" FROM "MealTask";
DROP TABLE "MealTask";
ALTER TABLE "new_MealTask" RENAME TO "MealTask";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
