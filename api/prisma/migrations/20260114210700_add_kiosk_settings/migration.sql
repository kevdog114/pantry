-- CreateTable
CREATE TABLE "Equipment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "purchaseDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "_EquipmentToFile" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_EquipmentToFile_A_fkey" FOREIGN KEY ("A") REFERENCES "Equipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_EquipmentToFile_B_fkey" FOREIGN KEY ("B") REFERENCES "File" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Kiosk" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "lastActive" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "hasKeyboardScanner" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Kiosk_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Kiosk" ("createdAt", "id", "lastActive", "name", "updatedAt", "userId") SELECT "createdAt", "id", "lastActive", "name", "updatedAt", "userId" FROM "Kiosk";
DROP TABLE "Kiosk";
ALTER TABLE "new_Kiosk" RENAME TO "Kiosk";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "_EquipmentToFile_AB_unique" ON "_EquipmentToFile"("A", "B");

-- CreateIndex
CREATE INDEX "_EquipmentToFile_B_index" ON "_EquipmentToFile"("B");

