/**
 * FAQ Chat Bar Component
 * AI-powered FAQ assistant using AnythingLLM
 */

import { useState, useRef, useEffect } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"
import Icon from "./ui/Icon"
import { useAuth } from "../contexts/auth"

function cn(...parts) {
  return parts.filter(Boolean).join(" ")
}

export default function FaqChatBar() {
  const [isExpanded, setIsExpanded] = useState(false)
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const { user } = useAuth()

  const exampleQuestions = [
    "How do I create a ticket?",
    "What's the SLA policy?",
    "How to escalate urgent issues?",
    "Team assignment process"
  ]

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isExpanded])

  const handleClick = () => {
    setIsExpanded(!isExpanded)
  }

  const sendMessage = async (text) => {
    if (!text.trim() || isLoading) return

    const userMessage = { role: "user", content: text.trim() }
    setMessages(prev => [...prev, userMessage])
    setInputValue("")
    setIsLoading(true)

    try {
      const token = localStorage.getItem("token")

      if (!token) {
        throw new Error("Please log in to use the chat assistant")
      }

      const response = await fetch("/api/ai-chat/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          message: text.trim(),
          conversationHistory: messages
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to get response")
      }

      const aiMessage = {
        role: "assistant",
        content: data.response
      }
      setMessages(prev => [...prev, aiMessage])

    } catch (error) {
      console.error("AI Chat Error:", error)
      let errorContent = "I apologize, but I'm having trouble connecting right now. Please try again later or contact support if the issue persists."

      // Show more specific error if available
      if (error.message && error.message !== "Failed to get response") {
        errorContent = `Error: ${error.message}`
      }

      const errorMessage = {
        role: "assistant",
        content: errorContent
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSend = () => {
    sendMessage(inputValue)
  }

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleExampleClick = (question) => {
    sendMessage(question)
  }

  const handleClearChat = () => {
    setMessages([])
  }

  return (
    <>
      {/* Expanded Modal */}
      {isExpanded && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm pointer-events-auto"
            onClick={handleClick}
          />

          {/* Modal Content - Bottom Right */}
          <div
            className={cn(
              "absolute bottom-6 right-6 left-6 sm:left-auto pointer-events-auto",
              "w-full sm:max-w-md",
              "bg-[var(--bg-elevated)] border border-[var(--border-default)]",
              "rounded-2xl shadow-2xl",
              "animate-slide-up",
              "flex flex-col",
              "max-h-[600px]"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)] flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center",
                  "bg-gradient-to-br from-purple-500/20 to-blue-500/20",
                  "border border-purple-500/30"
                )}>
                  <Icon name="messageCircle" className="text-purple-400" size={20} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[var(--fg-primary)]">
                    AI FAQ Assistant
                  </h3>
                  <p className="text-xs text-[var(--fg-muted)]">
                    Get instant answers to common questions
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {messages.length > 0 && (
                  <button
                    onClick={handleClearChat}
                    className={cn(
                      "p-2 rounded-lg text-[var(--fg-muted)]",
                      "hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)]",
                      "transition-colors duration-200"
                    )}
                    title="Clear chat"
                  >
                    <Icon name="trash" size={18} />
                  </button>
                )}
                <button
                  onClick={handleClick}
                  className={cn(
                    "p-2 rounded-lg text-[var(--fg-muted)]",
                    "hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)]",
                    "transition-colors duration-200"
                  )}
                >
                  <Icon name="close" size={20} />
                </button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {messages.length === 0 ? (
                // Welcome Screen
                <div className="flex flex-col items-center justify-center h-full py-8">
                  <div className={cn(
                    "w-20 h-20 rounded-2xl flex items-center justify-center mb-6",
                    "bg-gradient-to-br from-purple-500/10 to-blue-500/10",
                    "border border-purple-500/20"
                  )}>
                    <Icon name="lightning" className="text-purple-400" size={32} />
                  </div>

                  <h4 className="text-lg font-semibold text-[var(--fg-primary)] mb-2">
                    How can I help you?
                  </h4>

                  <p className="text-sm text-[var(--fg-secondary)] text-center max-w-md mb-6">
                    Ask me about tickets, processes, SLA policies, or anything related to the Service Desk.
                  </p>

                  <div className="flex flex-wrap gap-2 justify-center">
                    {exampleQuestions.map((example, i) => (
                      <button
                        key={i}
                        onClick={() => handleExampleClick(example)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs",
                          "bg-[var(--bg-surface)] text-[var(--fg-secondary)]",
                          "border border-[var(--border-default)]",
                          "hover:border-purple-500/50 hover:bg-purple-500/5",
                          "transition-all duration-200"
                        )}
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                // Chat Messages
                <>
                  {messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "flex",
                        msg.role === "user" ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] px-4 py-2.5 rounded-2xl",
                          msg.role === "user"
                            ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white"
                            : "bg-[var(--bg-surface)] text-[var(--fg-primary)] border border-[var(--border-default)]"
                        )}
                      >
                        <div className="text-sm prose prose-sm max-w-none break-words markdown-content">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeRaw]}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] px-4 py-2.5 rounded-2xl">
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                          <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                          <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input Area */}
            <div className="border-t border-[var(--border-default)] p-4 flex-shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask me anything..."
                  rows={1}
                  className={cn(
                    "flex-1 px-4 py-2.5 rounded-xl resize-none",
                    "bg-[var(--bg-surface)] border border-[var(--border-default)]",
                    "text-[var(--fg-primary)] text-sm",
                    "focus:outline-none focus:ring-2 focus:ring-purple-500/50",
                    "placeholder:text-[var(--fg-muted)]",
                    "max-h-32"
                  )}
                  style={{
                    height: "auto",
                    minHeight: "42px"
                  }}
                  onInput={(e) => {
                    e.target.style.height = "auto"
                    e.target.style.height = e.target.scrollHeight + "px"
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isLoading}
                  className={cn(
                    "px-4 py-2.5 rounded-xl",
                    "bg-gradient-to-r from-purple-600 to-blue-600",
                    "text-white font-medium text-sm",
                    "transition-all duration-200",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    "hover:shadow-lg hover:scale-105 active:scale-95"
                  )}
                >
                  <Icon name="send" size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Bottom Right Button */}
      <button
        onClick={handleClick}
        className={cn(
          "fixed bottom-6 right-6 z-40",
          "px-5 py-3 rounded-full",
          "bg-gradient-to-r from-purple-600 to-blue-600",
          "text-white font-medium text-sm",
          "shadow-lg hover:shadow-xl",
          "flex items-center gap-2",
          "transition-all duration-300",
          "hover:scale-105",
          "border border-purple-400/30"
        )}
      >
        <Icon name="messageCircle" size={18} />
        <span>Have a question?</span>
        <div className={cn(
          "w-2 h-2 rounded-full bg-green-400",
          "animate-pulse"
        )} />
      </button>

      <style>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }

        /* Markdown content styling */
        .markdown-content {
          color: inherit;
        }

        .markdown-content h1,
        .markdown-content h2,
        .markdown-content h3,
        .markdown-content h4 {
          font-weight: 600;
          margin-top: 1em;
          margin-bottom: 0.5em;
          line-height: 1.3;
        }

        .markdown-content h1 { font-size: 1.25rem; }
        .markdown-content h2 { font-size: 1.15rem; }
        .markdown-content h3 { font-size: 1.05rem; }
        .markdown-content h4 { font-size: 1rem; }

        .markdown-content p {
          margin-bottom: 0.75em;
          line-height: 1.6;
        }

        .markdown-content ul,
        .markdown-content ol {
          margin-left: 1.5em;
          margin-bottom: 0.75em;
        }

        .markdown-content li {
          margin-bottom: 0.25em;
        }

        .markdown-content code {
          background-color: rgba(0, 0, 0, 0.1);
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-size: 0.9em;
          font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
        }

        .markdown-content pre {
          background-color: rgba(0, 0, 0, 0.1);
          padding: 0.75rem;
          border-radius: 0.5rem;
          overflow-x: auto;
          margin-bottom: 0.75em;
        }

        .markdown-content pre code {
          background-color: transparent;
          padding: 0;
        }

        .markdown-content table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 0.75em;
          font-size: 0.9em;
        }

        .markdown-content th,
        .markdown-content td {
          border: 1px solid var(--border-default);
          padding: 0.5rem;
          text-align: left;
        }

        .markdown-content th {
          background-color: rgba(0, 0, 0, 0.05);
          font-weight: 600;
        }

        .markdown-content blockquote {
          border-left: 3px solid var(--border-default);
          padding-left: 1rem;
          margin-left: 0;
          font-style: italic;
          opacity: 0.9;
        }

        .markdown-content a {
          color: #6366f1;
          text-decoration: underline;
        }

        .markdown-content strong {
          font-weight: 600;
        }

        .markdown-content em {
          font-style: italic;
        }

        .markdown-content hr {
          border: none;
          border-top: 1px solid var(--border-default);
          margin: 1em 0;
        }

        /* Remove top margin from first element */
        .markdown-content > *:first-child {
          margin-top: 0;
        }

        /* Remove bottom margin from last element */
        .markdown-content > *:last-child {
          margin-bottom: 0;
        }
      `}</style>
    </>
  )
}
