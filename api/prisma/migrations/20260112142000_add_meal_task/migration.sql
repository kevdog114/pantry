-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN "customPrepInstructions" TEXT;
ALTER TABLE "Recipe" ADD COLUMN "thawInstructions" TEXT;

-- CreateTable
CREATE TABLE "RecipePrepTask" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "recipeId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "daysInAdvance" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RecipePrepTask_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MealTask" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "mealPlanId" INTEGER,
    "recipeId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MealTask_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MealTask_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RecipeProduct" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "recipeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "amount" REAL,
    "unit" TEXT,
    "productId" INTEGER,
    "unitOfMeasureId" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RecipeProduct_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecipeProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RecipeProduct_unitOfMeasureId_fkey" FOREIGN KEY ("unitOfMeasureId") REFERENCES "UnitOfMeasure" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RecipeProduct" ("amount", "createdAt", "id", "notes", "productId", "recipeId", "unitOfMeasureId", "updatedAt") SELECT "amount", "createdAt", "id", "notes", "productId", "recipeId", "unitOfMeasureId", "updatedAt" FROM "RecipeProduct";
DROP TABLE "RecipeProduct";
ALTER TABLE "new_RecipeProduct" RENAME TO "RecipeProduct";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

