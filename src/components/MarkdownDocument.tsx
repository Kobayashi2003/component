import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownDocumentProps {
  content: string
  hideTitle?: boolean
}

export default function MarkdownDocument({ content, hideTitle = false }: MarkdownDocumentProps) {
  const visibleContent = hideTitle ? content.replace(/^#\s+[^\r\n]+\r?\n+/, '') : content

  return (
    <div className="markdown-document">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {visibleContent}
      </ReactMarkdown>
    </div>
  )
}

const markdownComponents: Components = {
  table({ node, ...props }) {
    void node
    return (
      <div className="markdown-table" role="region" aria-label="Scrollable table" tabIndex={0}>
        <table {...props} />
      </div>
    )
  },
}
