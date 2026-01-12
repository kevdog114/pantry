-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ShoppingListItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shoppingListId" INTEGER NOT NULL,
    "productId" INTEGER,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "fromLogistics" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShoppingListItem_shoppingListId_fkey" FOREIGN KEY ("shoppingListId") REFERENCES "ShoppingList" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShoppingListItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ShoppingListItem" ("checked", "createdAt", "id", "name", "productId", "quantity", "shoppingListId", "updatedAt") SELECT "checked", "createdAt", "id", "name", "productId", "quantity", "shoppingListId", "updatedAt" FROM "ShoppingListItem";
DROP TABLE "ShoppingListItem";
ALTER TABLE "new_ShoppingListItem" RENAME TO "ShoppingListItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
