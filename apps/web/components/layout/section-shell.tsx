// Thin pass-through. The brain layout (apps/web/app/brains/[brainId]/
// layout.tsx) now provides the sidebar + topbar shell, so legacy pages
// that still import SectionShell just need their inner content to render
// without re-mounting another shell.
//
// Renders: eyebrow, h1 title, sub-paragraph description, then children -
// no main element, no nav, no Back home button.

export async function SectionShell({
  title,
  description,
  children,
}: {
  brainId?: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <header
        style={{
          paddingBottom: 22,
          marginBottom: 28,
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--arvya-gold-700)",
          }}
        >
          Brain workspace
        </span>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 500,
            fontSize: 36,
            letterSpacing: "-0.015em",
            lineHeight: 1.05,
            margin: "8px 0 6px",
            color: "var(--text-primary)",
          }}
        >
          {title}
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            lineHeight: 1.55,
            maxWidth: "62ch",
            margin: 0,
          }}
        >
          {description}
        </p>
      </header>
      <div>{children}</div>
    </div>
  );
}
