'use client'

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FileText, Copy, Check } from 'lucide-react'

interface ReportDisplayProps {
  title: string
  content: string
  className?: string
}

export default function ReportDisplay({ title, content, className = '' }: ReportDisplayProps) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className={`bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden ${className}`}>
      <div className="bg-zinc-800 px-6 py-4 flex items-center justify-between border-b border-zinc-700">
        <div className="flex items-center space-x-2">
          <FileText className="w-5 h-5 text-blue-400" />
          <h3 className="text-lg font-semibold text-zinc-100">{title}</h3>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition-colors"
          aria-label="Copy report content"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 text-zinc-400" />
              <span className="text-sm text-zinc-400">Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-6 max-h-[600px] overflow-y-auto">
        <div className="prose prose-invert prose-zinc max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({children}) => <h1 className="text-3xl font-bold text-zinc-100 mb-4 mt-6 first:mt-0">{children}</h1>,
              h2: ({children}) => <h2 className="text-2xl font-semibold text-zinc-100 mb-3 mt-5">{children}</h2>,
              h3: ({children}) => <h3 className="text-xl font-medium text-zinc-200 mb-2 mt-4">{children}</h3>,
              p: ({children}) => <p className="text-zinc-300 mb-4 leading-relaxed">{children}</p>,
              ul: ({children}) => <ul className="list-disc list-inside text-zinc-300 mb-4 space-y-1">{children}</ul>,
              ol: ({children}) => <ol className="list-decimal list-inside text-zinc-300 mb-4 space-y-1">{children}</ol>,
              li: ({children}) => <li className="text-zinc-300">{children}</li>,
              blockquote: ({children}) => (
                <blockquote className="border-l-4 border-blue-500 pl-4 italic text-zinc-400 my-4">
                  {children}
                </blockquote>
              ),
              code: ({className, children, ...props}) => {
                const match = /language-(\w+)/.exec(className || '')
                const isInline = !match
                return isInline ? (
                  <code className="bg-zinc-800 text-blue-400 px-1.5 py-0.5 rounded text-sm" {...props}>
                    {children}
                  </code>
                ) : (
                  <code className="block bg-zinc-800 text-zinc-300 p-4 rounded-lg overflow-x-auto my-4" {...props}>
                    {children}
                  </code>
                )
              },
              table: ({children}) => (
                <div className="overflow-x-auto my-4">
                  <table className="min-w-full border border-zinc-700">{children}</table>
                </div>
              ),
              thead: ({children}) => <thead className="bg-zinc-800">{children}</thead>,
              tbody: ({children}) => <tbody className="divide-y divide-zinc-700">{children}</tbody>,
              tr: ({children}) => <tr className="border-b border-zinc-700">{children}</tr>,
              th: ({children}) => <th className="px-4 py-2 text-left text-zinc-200 font-semibold">{children}</th>,
              td: ({children}) => <td className="px-4 py-2 text-zinc-300">{children}</td>,
              a: ({children, href}) => (
                <a href={href} className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),
              hr: () => <hr className="border-zinc-700 my-6" />,
              strong: ({children}) => <strong className="font-semibold text-zinc-100">{children}</strong>,
              em: ({children}) => <em className="italic text-zinc-300">{children}</em>,
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
