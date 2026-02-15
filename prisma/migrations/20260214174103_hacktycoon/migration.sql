-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slackId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 100,
    "bank" INTEGER NOT NULL DEFAULT 0,
    "lastWork" DATETIME,
    "timesWorked" INTEGER NOT NULL DEFAULT 0,
    "totalEarned" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastStreakDate" DATETIME,
    "ownedItems" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("balance", "channelId", "createdAt", "currentStreak", "id", "lastStreakDate", "lastWork", "longestStreak", "ownedItems", "slackId", "timesWorked", "totalEarned", "updatedAt", "username") SELECT "balance", "channelId", "createdAt", "currentStreak", "id", "lastStreakDate", "lastWork", "longestStreak", "ownedItems", "slackId", "timesWorked", "totalEarned", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_slackId_channelId_key" ON "User"("slackId", "channelId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
