import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import './App.css';

const suggestions = [
  {
    title: 'Scale a service',
    prompt: 'Scale my ECS service to 3 running tasks.',
    icon: '↗',
  },
  {
    title: 'Adjust resources',
    prompt: 'Set the task CPU to 512 and memory to 1024 MiB.',
    icon: '⌘',
  },
  {
    title: 'Change task memory',
    prompt: 'Set the task memory to 2048 MiB.',
    icon: '◷',
  },
];

function AssistantMark({ small = false }) {
  return (
    <span className={`assistant-mark${small ? ' assistant-mark--small' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M12 2.8 14.5 9.5 21.2 12l-6.7 2.5L12 21.2l-2.5-6.7L2.8 12l6.7-2.5L12 2.8Z" />
        <path d="m19.2 2 .8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8.8-2.1Z" />
      </svg>
    </span>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M17 3 9 11M17 3l-5.1 14-2.9-6-6-2.9L17 3Z" />
    </svg>
  );
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messageId = useRef(0);
  const requestInProgress = useRef(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  const addMessage = (message) => {
    const nextMessage = { ...message, id: ++messageId.current };
    setMessages((currentMessages) => [...currentMessages, nextMessage]);
  };

  const sendMessage = async (prompt = input) => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || requestInProgress.current) return;

    requestInProgress.current = true;
    addMessage({ role: 'user', content: trimmedPrompt });
    setInput('');
    setLoading(true);

    try {
      const response = await axios.post(
        '/api/chat',
        { prompt: trimmedPrompt },
        { timeout: 30000 },
      );
      const responseMessage = response.data?.message;

      addMessage({
        role: 'assistant',
        content:
          typeof responseMessage === 'string' && responseMessage.trim()
            ? responseMessage
            : 'The service responded without a message. Please try again.',
        isError: response.data?.status === 'error',
      });
    } catch (error) {
      let errorMessage = 'I couldn’t reach the chat service. Check your connection and try again.';

      if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
        errorMessage = 'The request took too long to complete. Please try again.';
      } else if (error?.response) {
        const status = error.response.status;
        const apiMessage = error.response.data?.message;
        errorMessage = `The chat service returned an error (${status}). ${
          typeof apiMessage === 'string' && apiMessage.trim()
            ? apiMessage
            : 'Please try again in a moment.'
        }`;
      }

      addMessage({ role: 'assistant', content: errorMessage, isError: true });
    } finally {
      requestInProgress.current = false;
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  const handleSuggestion = (prompt) => {
    void sendMessage(prompt);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="ECS Command Center home">
          <span className="brand-icon" aria-hidden="true">
            <svg viewBox="0 0 28 28" fill="none">
              <path d="M14 2.5 24 8v12l-10 5.5L4 20V8l10-5.5Z" />
              <path d="m4.5 8.3 9.5 5.4 9.5-5.4M14 14v11" />
              <path d="m9 5.3 10 5.6" />
            </svg>
          </span>
          <span className="brand-copy">
            <span className="brand-name">ECS Command Center</span>
            <span className="brand-caption">Cloud operations assistant</span>
          </span>
        </a>
        <div className="topbar-meta">
          <span className="environment-tag">
            <span className="environment-dot" />
            AWS environment
          </span>
          <span className="topbar-divider" aria-hidden="true" />
          <span className="secure-label">
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 1.8 14 13H2L8 1.8Z" />
            <path d="M8 5.5v3.2M8 11.1v.1" />
            </svg>
          Changes apply on send
          </span>
        </div>
      </header>

      <main className="workspace">
        <section className="chat-panel" aria-label="ECS assistant chat">
          <div className="chat-heading">
            <div className="heading-copy">
              <div className="eyebrow"><span className="eyebrow-line" /> YOUR OPERATIONS COPILOT</div>
              <h1>What can I help you manage?</h1>
              <p>Ask in plain language to scale services or adjust task resources.</p>
            </div>
            <div className="assistant-status">
              <AssistantMark small />
              <span>
                <strong>ECS Assistant</strong>
                <small><span className="status-dot" /> Ready to help</small>
              </span>
            </div>
          </div>

          <section className="conversation" aria-label="Conversation">
            {messages.length === 0 ? (
              <div className="welcome-state">
                <div className="welcome-icon"><AssistantMark /></div>
                <span className="welcome-kicker">WELCOME TO YOUR COMMAND CENTER</span>
                <h2>Make your next move.</h2>
                <p>
                  Describe what you need for your ECS environment. I can help with
                  service scaling and task CPU or memory updates.
                </p>
                <div className="suggestion-grid" aria-label="Suggested prompts">
                  {suggestions.map((suggestion) => (
                    <button
                      className="suggestion-card"
                      key={suggestion.title}
                      type="button"
                      onClick={() => handleSuggestion(suggestion.prompt)}
                      disabled={loading}
                    >
                      <span className="suggestion-icon" aria-hidden="true">{suggestion.icon}</span>
                      <span className="suggestion-text">
                        <strong>{suggestion.title}</strong>
                        <span>{suggestion.prompt}</span>
                      </span>
                      <span className="suggestion-arrow" aria-hidden="true">↗</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="message-list" aria-live="polite" aria-relevant="additions text">
                {messages.map((message) => (
                  <article
                    className={`message-row message-row--${message.role}${message.isError ? ' message-row--error' : ''}`}
                    key={message.id}
                  >
                    {message.role === 'assistant' && (
                      <AssistantMark small />
                    )}
                    <div className="message-content">
                      <span className="message-author">
                        {message.role === 'user' ? 'You' : message.isError ? 'Assistant · needs attention' : 'ECS Assistant'}
                      </span>
                      <div className="message-bubble">{message.content}</div>
                    </div>
                    {message.role === 'user' && <span className="user-avatar" aria-hidden="true">Y</span>}
                  </article>
                ))}
                {loading && (
                  <div className="message-row message-row--assistant" role="status" aria-label="Assistant is preparing a response">
                    <AssistantMark small />
                    <div className="message-content">
                      <span className="message-author">ECS Assistant</span>
                      <div className="typing-bubble">
                        <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
                        <span>Working on your request…</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div ref={bottomRef} />
          </section>

          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
          >
            <label className="sr-only" htmlFor="chat-prompt">Message the ECS Assistant</label>
            <div className="composer-input-wrap">
              <textarea
                id="chat-prompt"
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your ECS environment…"
                rows={1}
                aria-describedby="composer-hint"
                disabled={loading}
              />
              <button
                className="send-button"
                type="submit"
                disabled={!input.trim() || loading}
                aria-label={loading ? 'Sending message' : 'Send message'}
              >
                {loading ? <span className="send-spinner" aria-hidden="true" /> : <SendIcon />}
              </button>
            </div>
            <div className="composer-footer">
              <span id="composer-hint">Enter to send <span aria-hidden="true">·</span> Shift + Enter for a new line</span>
              <span className="composer-context">
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 1.8 13 4v3.4c0 3.1-2.1 5.5-5 6.8-2.9-1.3-5-3.7-5-6.8V4l5-2.2Z" />
                  <path d="m5.8 7.8 1.5 1.5 3-3.1" />
                </svg>
                AWS updates apply immediately
              </span>
            </div>
          </form>
        </section>
        <footer className="page-footer">
          <span>Double-check requested values before sending</span>
          <span className="footer-separator" aria-hidden="true">·</span>
          <span>Changes are applied when requests are sent</span>
        </footer>
      </main>
    </div>
  );
}
