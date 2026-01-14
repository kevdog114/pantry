-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "freezerLifespanDays" INTEGER,
    "refrigeratorLifespanDays" INTEGER,
    "openedLifespanDays" INTEGER,
    "trackCountBy" TEXT NOT NULL DEFAULT 'quantity',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "isLeftover" BOOLEAN NOT NULL DEFAULT false,
    "leftoverRecipeId" INTEGER,
    CONSTRAINT "Product_leftoverRecipeId_fkey" FOREIGN KEY ("leftoverRecipeId") REFERENCES "Recipe" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("createdAt", "freezerLifespanDays", "id", "openedLifespanDays", "refrigeratorLifespanDays", "title", "trackCountBy", "updatedAt") SELECT "createdAt", "freezerLifespanDays", "id", "openedLifespanDays", "refrigeratorLifespanDays", "title", "trackCountBy", "updatedAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
