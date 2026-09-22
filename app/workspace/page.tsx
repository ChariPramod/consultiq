import { AccountSignOut } from '../sign-out-button';
import Link from 'next/link';
import { SignInLink } from '../sign-in-link';
import { sessionAccess } from '@/server/session';
import type { Metadata } from 'next';
import Workspace from './workspace-client';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Workspace | ConsultIQ',
  robots: { index: false, follow: false },
};
export default async function WorkspacePage() {
  const access = await sessionAccess();
  if (access.status === 'unconfigured' || access.status === 'forbidden')
    return (
      <main className="sign-in-page">
        <div>
          <h1>Private workspace</h1>
          <p>
            {access.status === 'unconfigured'
              ? 'Authentication setup is pending.'
              : 'Your account has not been granted access. Contact the workspace owner.'}
          </p>
          {access.status === 'forbidden' && <AccountSignOut />}
          <Link href="/tour">Explore the product tour</Link>
          <Link href="/">Return to ConsultIQ</Link>
        </div>
      </main>
    );
  if (access.status !== 'authorized')
    return (
      <main className="sign-in-page">
        <div>
          <h1>ConsultIQ workspace</h1>
          <p>Sign in to access your private consultation records.</p>
          <SignInLink className="primary-button">Sign in</SignInLink>
          <Link href="/tour">Explore the product tour</Link>
          <Link href="/">Return to ConsultIQ</Link>
        </div>
      </main>
    );
  return (
    <>
      <div className="flex justify-end px-6 pt-4">
        <AccountSignOut />
      </div>
      <Workspace />
    </>
  );
}
