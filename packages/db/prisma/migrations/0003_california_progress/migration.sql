CREATE TABLE "CaliforniaProgress" (
    "userId" TEXT NOT NULL,
    "completedSteps" INTEGER[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CaliforniaProgress_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "CaliforniaProgress" ADD CONSTRAINT "CaliforniaProgress_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
