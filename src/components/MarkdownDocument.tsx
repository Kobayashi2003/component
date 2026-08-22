import ReactMarkdown from 'react-markdown'

interface MarkdownDocumentProps {
  content: string
  hideTitle?: boolean
}

export default function MarkdownDocument({ content, hideTitle = false }: MarkdownDocumentProps) {
  const visibleContent = hideTitle ? content.replace(/^#\s+[^\r\n]+\r?\n+/, '') : content

  return (
    <div className="markdown-document">
      <ReactMarkdown>{visibleContent}</ReactMarkdown>
    </div>
  )
}
