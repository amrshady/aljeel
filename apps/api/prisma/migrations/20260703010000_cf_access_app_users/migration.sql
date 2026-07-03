-- Internal AP/staff identities resolved after Cloudflare Access authentication.
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUser_role_check" CHECK ("role" IN ('AP_CLERK', 'AP_APPROVER')),
    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");
