"use client"

import React from 'react'
import ReactMarkdown, { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Copy, Check } from 'lucide-react'

interface MarkdownRendererProps {
  content: string
  className?: string
}

export default function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null)

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(null), 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }

  const components: Components = {
    // Code blocks
    pre: ({ children, ...props }) => (
      <div className="relative group">
        <pre 
          className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4 overflow-x-auto text-sm"
          {...props}
        >
          {children}
        </pre>
        {typeof children === 'object' && children && 'props' in children && 
         children.props && typeof children.props.children === 'string' && (
          <button
            onClick={() => copyCode(children.props.children)}
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity
                       bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded p-1.5"
            title="Copy code"
          >
            {copiedCode === children.props.children ? (
              <Check className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-gray-400" />
            )}
          </button>
        )}
      </div>
    ),
    
    // Inline code
    code: ({ children, className, ...props }) => {
      const isBlock = className?.includes('language-')
      if (isBlock) {
        return <code className={className} {...props}>{children}</code>
      }
      return (
        <code 
          className="bg-[#f6f8fa] dark:bg-[#21262d] text-[#c9510c] dark:text-[#f85149] 
                     px-1.5 py-0.5 rounded text-sm border dark:border-[#30363d]"
          {...props}
        >
          {children}
        </code>
      )
    },
    
    // Paragraphs
    p: ({ children, ...props }) => (
      <p className="text-[15px] leading-relaxed mb-4 last:mb-0" {...props}>
        {children}
      </p>
    ),
    
    // Headers
    h1: ({ children, ...props }) => (
      <h1 className="text-xl font-semibold mb-4 mt-6 first:mt-0" {...props}>
        {children}
      </h1>
    ),
    h2: ({ children, ...props }) => (
      <h2 className="text-lg font-semibold mb-3 mt-5 first:mt-0" {...props}>
        {children}
      </h2>
    ),
    h3: ({ children, ...props }) => (
      <h3 className="text-base font-semibold mb-2 mt-4 first:mt-0" {...props}>
        {children}
      </h3>
    ),
    
    // Lists
    ul: ({ children, ...props }) => (
      <ul className="list-disc list-inside mb-4 space-y-1 ml-4" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol className="list-decimal list-inside mb-4 space-y-1 ml-4" {...props}>
        {children}
      </ol>
    ),
    li: ({ children, ...props }) => (
      <li className="text-[15px] leading-relaxed" {...props}>
        {children}
      </li>
    ),
    
    // Blockquotes
    blockquote: ({ children, ...props }) => (
      <blockquote 
        className="border-l-4 border-[#30363d] pl-4 my-4 italic text-gray-300 bg-[#0d1117] py-2"
        {...props}
      >
        {children}
      </blockquote>
    ),
    
    // Tables
    table: ({ children, ...props }) => (
      <div className="overflow-x-auto my-4">
        <table className="min-w-full border-collapse border border-[#30363d] text-sm" {...props}>
          {children}
        </table>
      </div>
    ),
    th: ({ children, ...props }) => (
      <th 
        className="border border-[#30363d] px-3 py-2 bg-[#21262d] font-semibold text-left"
        {...props}
      >
        {children}
      </th>
    ),
    td: ({ children, ...props }) => (
      <td className="border border-[#30363d] px-3 py-2" {...props}>
        {children}
      </td>
    ),
    
    // Links
    a: ({ children, href, ...props }) => (
      <a 
        href={href}
        className="text-blue-400 hover:text-blue-300 underline"
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      >
        {children}
      </a>
    ),
    
    // Strong and emphasis
    strong: ({ children, ...props }) => (
      <strong className="font-semibold" {...props}>
        {children}
      </strong>
    ),
    em: ({ children, ...props }) => (
      <em className="italic" {...props}>
        {children}
      </em>
    ),
  }

  return (
    <div className={`prose prose-invert max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
