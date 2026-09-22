import Link from 'next/link';
export function SignInLink({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link className={className} href="/sign-in">
      {children}
    </Link>
  );
}
