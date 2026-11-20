import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Card body Markdown, with GitHub-flavoured tables. Raw HTML is not rendered (react-markdown's
 * default), so content can't inject markup. Tables scroll sideways inside their own box on phones.
 */
export function Markdown({ children }: { children: string }) {
  if (!children.trim()) return null;
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: ({ alt, src }) => (typeof src === "string" ? <img src={src} alt={alt ?? ""} /> : null),
          a: ({ href, children: c }) => <a href={href}>{c}</a>,
          table: ({ children: c }) => (
            <div className="table-scroll prose-table" tabIndex={0} role="region" aria-label="Table">
              <table className="table">{c}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
