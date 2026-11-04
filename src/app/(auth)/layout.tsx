/** Bare layout of the sign-in page: canvas only, no navigation. */
export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main
      id="contenu"
      className="flex min-h-dvh items-center justify-center bg-canvas px-gutter py-10"
    >
      {children}
    </main>
  );
}
