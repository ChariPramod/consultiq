import { SignIn } from '@clerk/nextjs';
import { authConfigured } from '@/server/access';
export const dynamic = 'force-dynamic';
export default function SignInPage() {
  return (
    <main className="sign-in-page">
      {authConfigured(process.env) ? (
        <SignIn routing="path" path="/sign-in" forceRedirectUrl="/workspace" />
      ) : (
        <div>
          <h1>Sign-in setup required</h1>
          <p>
            The owner needs to configure authentication before this workspace is
            available.
          </p>
        </div>
      )}
    </main>
  );
}
