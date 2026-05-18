-- CreateTable
CREATE TABLE "Cookbook" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "_CookbookToRecipe" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_CookbookToRecipe_A_fkey" FOREIGN KEY ("A") REFERENCES "Cookbook" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_CookbookToRecipe_B_fkey" FOREIGN KEY ("B") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "freezerLifespanDays" INTEGER,
    "refrigeratorLifespanDays" INTEGER,
    "openedLifespanDays" INTEGER,
    "pantryLifespanDays" INTEGER,
    "trackCountBy" TEXT NOT NULL DEFAULT 'quantity',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "isLeftover" BOOLEAN NOT NULL DEFAULT false,
    "leftoverRecipeId" INTEGER,
    "isPrep" BOOLEAN NOT NULL DEFAULT false,
    "prepRecipeId" INTEGER,
    "autoPrintLabel" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Product_leftoverRecipeId_fkey" FOREIGN KEY ("leftoverRecipeId") REFERENCES "Recipe" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_prepRecipeId_fkey" FOREIGN KEY ("prepRecipeId") REFERENCES "Recipe" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("autoPrintLabel", "createdAt", "freezerLifespanDays", "id", "isLeftover", "leftoverRecipeId", "openedLifespanDays", "pantryLifespanDays", "refrigeratorLifespanDays", "title", "trackCountBy", "updatedAt") SELECT "autoPrintLabel", "createdAt", "freezerLifespanDays", "id", "isLeftover", "leftoverRecipeId", "openedLifespanDays", "pantryLifespanDays", "refrigeratorLifespanDays", "title", "trackCountBy", "updatedAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
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
    "duplicateOfRecipeId" INTEGER,
    CONSTRAINT "Recipe_instructionForProductId_fkey" FOREIGN KEY ("instructionForProductId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Recipe_duplicateOfRecipeId_fkey" FOREIGN KEY ("duplicateOfRecipeId") REFERENCES "Recipe" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Recipe" ("cookTime", "createdAt", "customPrepInstructions", "description", "id", "ingredientText", "instructionForProductId", "name", "noSafeTemps", "prepTime", "receiptSteps", "source", "thawInstructions", "totalTime", "type", "updatedAt", "yield") SELECT "cookTime", "createdAt", "customPrepInstructions", "description", "id", "ingredientText", "instructionForProductId", "name", "noSafeTemps", "prepTime", "receiptSteps", "source", "thawInstructions", "totalTime", "type", "updatedAt", "yield" FROM "Recipe";
DROP TABLE "Recipe";
ALTER TABLE "new_Recipe" RENAME TO "Recipe";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "_CookbookToRecipe_AB_unique" ON "_CookbookToRecipe"("A", "B");

-- CreateIndex
CREATE INDEX "_CookbookToRecipe_B_index" ON "_CookbookToRecipe"("B");
