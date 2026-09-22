'use client';
import { SignOutButton } from '@clerk/nextjs';
export function AccountSignOut() {
  return (
    <SignOutButton redirectUrl="/sign-in">
      <button type="button" className="secondary-button">
        Sign out
      </button>
    </SignOutButton>
  );
}
