import CraftLogo from "@/components/CraftLogo";

import styles from "./auth-screen.module.css";

export default function AuthScreen({
  authError,
  isConfigured,
  missingEnv,
}: {
  authError?: "failed" | "not-configured";
  isConfigured: boolean;
  missingEnv: string[];
}) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <CraftLogo size={28} />
      </header>

      <main className={styles.main}>
        <section className={styles.panel} aria-labelledby="auth-title">
          <div className={styles.titleBlock}>
            <h1 id="auth-title" className={styles.title}>Sign in to Craft</h1>
            <p className={styles.subtitle}>
              Use your Google account to create videos and keep your library tied to your workspace.
            </p>
          </div>

          {authError === "failed" && (
            <p className={`${styles.notice} ${styles.error}`}>
              Google sign-in could not be completed. Try again.
            </p>
          )}

          {isConfigured ? (
            <a className={styles.googleButton} href="/api/auth/google">
              <svg className={styles.googleIcon} viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.8.54-1.84.86-3.05.86-2.35 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z" />
                <path fill="#FBBC05" d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33z" />
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.65 3.58 9 3.58z" />
              </svg>
              Continue with Google
            </a>
          ) : (
            <div className={styles.notice}>
              <strong>Google auth is not configured yet.</strong>
              <div className={styles.envList}>
                {missingEnv.map((name) => (
                  <span className={styles.envItem} key={name}>{name}</span>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
