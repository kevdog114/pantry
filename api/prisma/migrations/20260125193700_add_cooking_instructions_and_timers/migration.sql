-- CreateTable
CREATE TABLE "Timer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT,
    "duration" INTEGER NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'RUNNING'
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Recipe" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'user',
    "ingredientText" TEXT,
    "prepTime" INTEGER,
    "cookTime" INTEGER,
    "totalTime" INTEGER,
    "yield" TEXT,
    "thawInstructions" TEXT,
    "customPrepInstructions" TEXT,
    "receiptSteps" TEXT,
    "type" TEXT NOT NULL DEFAULT 'recipe',
    "instructionForProductId" INTEGER,
    CONSTRAINT "Recipe_instructionForProductId_fkey" FOREIGN KEY ("instructionForProductId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Recipe" ("cookTime", "createdAt", "customPrepInstructions", "description", "id", "ingredientText", "name", "prepTime", "receiptSteps", "source", "thawInstructions", "totalTime", "updatedAt", "yield") SELECT "cookTime", "createdAt", "customPrepInstructions", "description", "id", "ingredientText", "name", "prepTime", "receiptSteps", "source", "thawInstructions", "totalTime", "updatedAt", "yield" FROM "Recipe";
DROP TABLE "Recipe";
ALTER TABLE "new_Recipe" RENAME TO "Recipe";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
