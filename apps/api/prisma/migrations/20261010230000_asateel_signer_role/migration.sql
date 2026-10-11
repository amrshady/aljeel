-- Commit the new role before any later migration uses it.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ASATEEL_SIGNER';
