import ReactMarkdown from "react-markdown";

/** Card body Markdown. Raw HTML is not rendered (react-markdown's default), so content can't inject markup. */
export function Markdown({ children }: { children: string }) {
  if (!children.trim()) return null;
  return (
    <div className="prose">
      <ReactMarkdown
        components={{
          img: ({ alt, src }) => (typeof src === "string" ? <img src={src} alt={alt ?? ""} /> : null),
          a: ({ href, children: c }) => <a href={href}>{c}</a>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
