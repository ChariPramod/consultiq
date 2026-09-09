/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in is dispatcher-owned and must use a top-level anchor without prefetch. */
export function SignInLink({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      className={className}
      href="/signin-with-chatgpt?return_to=%2Fworkspace"
      target="_top"
    >
      {children}
    </a>
  );
}
