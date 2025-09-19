'use client'

import React from 'react'
import { X, FileSearch, AlertCircle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface BriefReviewModalProps {
  isOpen: boolean
  title: string
  brief: string
  selectedModel: string
  onModelChange: (model: string) => void
  onExecute: () => void
  onCancel: () => void
  isExecuting?: boolean
}

const researchModels = [
  { id: 'perplexity/sonar-deep-research', name: 'Perplexity 70B Online', description: 'Web-connected, fast, and comprehensive' },
  { id: 'alibaba/tongyi-deepresearch-30b-a3b', name: 'Tongyi DeepResearch 30B', description: 'Advanced research with deep analysis capabilities' },
]

export default function BriefReviewModal({
  isOpen,
  title,
  brief,
  selectedModel,
  onModelChange,
  onExecute,
  onCancel,
  isExecuting = false,
}: BriefReviewModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Overlay */}
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onCancel}
        />

        {/* Modal */}
        <div className="relative bg-zinc-900 rounded-xl border border-zinc-800 w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
            <div className="flex items-center space-x-2">
              <FileSearch className="w-5 h-5 text-blue-400" />
              <h2 className="text-xl font-semibold text-zinc-100">{title}</h2>
            </div>
            <button
              onClick={onCancel}
              className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          </div>

          {/* Brief Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="bg-zinc-800/50 rounded-lg p-4 mb-6">
              <div className="flex items-start space-x-2 mb-3">
                <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-zinc-400">
                  Review the research brief below. This will guide the AI research engine in conducting comprehensive analysis.
                </p>
              </div>
            </div>

            <div className="prose prose-invert prose-zinc max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({children}) => <h1 className="text-2xl font-bold text-zinc-100 mb-3">{children}</h1>,
                  h2: ({children}) => <h2 className="text-xl font-semibold text-zinc-100 mb-2 mt-4">{children}</h2>,
                  h3: ({children}) => <h3 className="text-lg font-medium text-zinc-200 mb-2 mt-3">{children}</h3>,
                  p: ({children}) => <p className="text-zinc-300 mb-3 leading-relaxed">{children}</p>,
                  ul: ({children}) => <ul className="list-disc list-inside text-zinc-300 mb-3 space-y-1">{children}</ul>,
                  ol: ({children}) => <ol className="list-decimal list-inside text-zinc-300 mb-3 space-y-1">{children}</ol>,
                  li: ({children}) => <li className="text-zinc-300">{children}</li>,
                  blockquote: ({children}) => (
                    <blockquote className="border-l-4 border-blue-500 pl-4 italic text-zinc-400 my-3">
                      {children}
                    </blockquote>
                  ),
                  code: ({className, children, ...props}) => {
                    const isInline = !className
                    return isInline ? (
                      <code className="bg-zinc-800 text-blue-400 px-1.5 py-0.5 rounded text-sm" {...props}>
                        {children}
                      </code>
                    ) : (
                      <code className="block bg-zinc-800 text-zinc-300 p-3 rounded-lg overflow-x-auto my-3" {...props}>
                        {children}
                      </code>
                    )
                  },
                  strong: ({children}) => <strong className="font-semibold text-zinc-100">{children}</strong>,
                  em: ({children}) => <em className="italic text-zinc-300">{children}</em>,
                }}
              >
                {brief}
              </ReactMarkdown>
            </div>
          </div>

          {/* Model Selection */}
          <div className="px-6 py-4 border-t border-zinc-800">
            <label className="block text-sm font-medium text-zinc-300 mb-3">
              Select Research Engine
            </label>
            <div className="space-y-2">
              {researchModels.map((model) => (
                <label
                  key={model.id}
                  className="flex items-start space-x-3 p-3 rounded-lg border border-zinc-700 hover:bg-zinc-800/50 cursor-pointer transition-colors"
                >
                  <input
                    type="radio"
                    name="research-model"
                    value={model.id}
                    checked={selectedModel === model.id}
                    onChange={(e) => onModelChange(e.target.value)}
                    className="mt-1 w-4 h-4 text-blue-600 bg-zinc-800 border-zinc-600 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-zinc-200">{model.name}</div>
                    <div className="text-sm text-zinc-400">{model.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end space-x-3 px-6 py-4 border-t border-zinc-800">
            <button
              onClick={onCancel}
              disabled={isExecuting}
              className="px-4 py-2 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={onExecute}
              disabled={isExecuting || !selectedModel}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {isExecuting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Executing...</span>
                </>
              ) : (
                <span>Execute Research</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
