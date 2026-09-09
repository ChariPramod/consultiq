import Link from 'next/link';
import { SignInLink } from '../sign-in-link';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import Workspace from './workspace-client';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Workspace | ConsultIQ',
  robots: { index: false, follow: false },
};
export default async function WorkspacePage() {
  const identity = (await headers()).get('oai-authenticated-user-id');
  if (!identity)
    return (
      <main className="sign-in-page">
        <div>
          <h1>ConsultIQ workspace</h1>
          <p>Sign in to access your private consultation records.</p>
          <SignInLink className="primary-button">
            Sign in with ChatGPT
          </SignInLink>
          <Link href="/">Return to ConsultIQ</Link>
        </div>
      </main>
    );
  return <Workspace />;
}
