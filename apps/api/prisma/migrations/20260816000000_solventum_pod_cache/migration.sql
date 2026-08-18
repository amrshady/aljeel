CREATE TABLE "SolventumPodCache" (
    "pdfSha256" TEXT NOT NULL,
    "lineItems" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SolventumPodCache_pkey" PRIMARY KEY ("pdfSha256")
);
