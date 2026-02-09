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
    "noSafeTemps" BOOLEAN NOT NULL DEFAULT false,
    "type" TEXT NOT NULL DEFAULT 'recipe',
    "instructionForProductId" INTEGER,
    CONSTRAINT "Recipe_instructionForProductId_fkey" FOREIGN KEY ("instructionForProductId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Recipe" ("cookTime", "createdAt", "customPrepInstructions", "description", "id", "ingredientText", "instructionForProductId", "name", "prepTime", "receiptSteps", "source", "thawInstructions", "totalTime", "type", "updatedAt", "yield") SELECT "cookTime", "createdAt", "customPrepInstructions", "description", "id", "ingredientText", "instructionForProductId", "name", "prepTime", "receiptSteps", "source", "thawInstructions", "totalTime", "type", "updatedAt", "yield" FROM "Recipe";
DROP TABLE "Recipe";
ALTER TABLE "new_Recipe" RENAME TO "Recipe";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
