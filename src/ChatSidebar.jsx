import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Square,
  Bot,
  User,
  Plus,
  PanelLeftClose,
  Copy,
  Check,
  Pin,
  Pencil,
  Trash2,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  X
} from 'lucide-react';
import { marked } from 'marked';

// Configure marked
marked.setOptions({
  gfm: true,
  breaks: true
});

// Code block component with ChatGPT-style top bar and copy button
function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      margin: '12px 0',
      borderRadius: '8px',
      overflow: 'hidden',
      background: '#0d0d0d',
      border: '1px solid #333333'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '7px 14px',
        background: '#1e1e1e',
        borderBottom: '1px solid #2d2d2d',
        fontSize: '12px',
        color: '#a0a0a0',
        fontFamily: 'Inter, sans-serif'
      }}>
        <span style={{ textTransform: 'lowercase', fontWeight: 600, color: '#c5c5c5' }}>
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          style={{
            background: 'transparent',
            border: 'none',
            color: copied ? '#2cbb5d' : '#a0a0a0',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '12px',
            padding: '2px 6px',
            borderRadius: '4px',
            transition: 'color 0.15s'
          }}
          title="Copy code to clipboard"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          <span>{copied ? 'Copied!' : 'Copy code'}</span>
        </button>
      </div>

      <pre style={{
        padding: '14px',
        margin: 0,
        overflowX: 'auto',
        fontSize: '13px',
        fontFamily: "'JetBrains Mono', Consolas, Monaco, monospace",
        lineHeight: '1.55',
        color: '#e6edf3'
      }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

// Render formatted message content
function FormattedMessage({ content, isStreaming }) {
  const parts = [];
  const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        value: content.slice(lastIndex, match.index)
      });
    }
    parts.push({
      type: 'code',
      language: match[1] || 'python',
      value: match[2].trimEnd()
    });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex);
    const unclosedMatch = remaining.match(/^```([a-zA-Z0-9_-]*)\n([\s\S]*)$/);
    if (unclosedMatch) {
      parts.push({
        type: 'code',
        language: unclosedMatch[1] || 'python',
        value: unclosedMatch[2]
      });
    } else {
      parts.push({
        type: 'text',
        value: remaining
      });
    }
  }

  return (
    <div className="chatgpt-markdown" style={{ fontSize: '14px', lineHeight: '1.65', color: '#ececf1' }}>
      {parts.map((part, idx) => {
        if (part.type === 'code') {
          return <CodeBlock key={idx} language={part.language} code={part.value} />;
        }
        const rawHtml = marked.parse(part.value);
        return (
          <div
            key={idx}
            dangerouslySetInnerHTML={{ __html: rawHtml }}
            style={{ wordBreak: 'break-word' }}
          />
        );
      })}
      {isStreaming && (
        <span style={{
          display: 'inline-block',
          width: '7px',
          height: '15px',
          background: '#ececf1',
          marginLeft: '4px',
          verticalAlign: 'middle',
          animation: 'cursorBlink 0.8s infinite'
        }} />
      )}
    </div>
  );
}

export default function ChatSidebar({ isOpen, onToggle, externalQuery, onClearExternalQuery }) {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  // UI state for sessions drawer & inline editing
  const [showSessionsDrawer, setShowSessionsDrawer] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editTitleText, setEditTitleText] = useState('');

  // Isolated scroll reference
  const messagesContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Scroll ONLY the chat messages container to the bottom
  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  // Load all sessions from server
  const loadSessions = async (targetSessionId = null) => {
    try {
      const res = await fetch('/api/chat/sessions');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSessions(data.sessions || []);
          const idToLoad = targetSessionId || data.activeSessionId || data.sessions?.[0]?.id;
          if (idToLoad) {
            setActiveSessionId(idToLoad);
            loadSessionDetails(idToLoad);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load chat sessions:', err);
    }
  };

  // Load specific session messages
  const loadSessionDetails = async (sessionId) => {
    try {
      const res = await fetch(`/api/chat/sessions/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.session) {
          setCurrentSession(data.session);
          setMessages(data.session.messages || []);
          setActiveSessionId(data.session.id);
        }
      }
    } catch (err) {
      console.warn('Failed to load session details:', err);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  // Handle external query (e.g. from problem list row "Ask Coach")
  useEffect(() => {
    if (externalQuery) {
      if (!isOpen) onToggle();
      handleSend(externalQuery);
      if (onClearExternalQuery) onClearExternalQuery();
    }
  }, [externalQuery]);

  // Auto-resize textarea
  const handleInputChange = (e) => {
    setInputValue(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  };

  // Create New Chat Session
  const handleNewChat = async () => {
    try {
      const res = await fetch('/api/chat/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Chat' })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.session) {
          setCurrentSession(data.session);
          setMessages([]);
          setActiveSessionId(data.session.id);
          setShowSessionsDrawer(false);
          loadSessions(data.session.id);
        }
      }
    } catch (err) {
      console.error('Failed to create new session:', err);
    }
  };

  // Switch to a session
  const handleSwitchSession = async (sessionId) => {
    if (sessionId === activeSessionId) {
      setShowSessionsDrawer(false);
      return;
    }
    setActiveSessionId(sessionId);
    setShowSessionsDrawer(false);
    await fetch(`/api/chat/sessions/${sessionId}/switch`, { method: 'POST' });
    await loadSessionDetails(sessionId);
  };

  // Pin / Unpin session
  const handleTogglePin = async (sessionId, currentPinned, e) => {
    if (e) e.stopPropagation();
    try {
      const nextPinned = !currentPinned;
      const res = await fetch(`/api/chat/sessions/${sessionId}/pin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: nextPinned })
      });
      if (res.ok) {
        if (currentSession && currentSession.id === sessionId) {
          setCurrentSession(prev => ({ ...prev, pinned: nextPinned }));
        }
        loadSessions(activeSessionId);
      }
    } catch (err) {
      console.error('Failed to pin/unpin session:', err);
    }
  };

  // Start inline rename
  const handleStartRename = (session, e) => {
    if (e) e.stopPropagation();
    setEditingSessionId(session.id);
    setEditTitleText(session.title || 'New Chat');
  };

  // Save rename
  const handleSaveRename = async (sessionId, e) => {
    if (e) e.stopPropagation();
    if (!editTitleText.trim()) {
      setEditingSessionId(null);
      return;
    }
    try {
      const res = await fetch(`/api/chat/sessions/${sessionId}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitleText.trim() })
      });
      if (res.ok) {
        if (currentSession && currentSession.id === sessionId) {
          setCurrentSession(prev => ({ ...prev, title: editTitleText.trim() }));
        }
        setEditingSessionId(null);
        loadSessions(activeSessionId);
      }
    } catch (err) {
      console.error('Failed to rename session:', err);
    }
  };

  // Delete session
  const handleDeleteSession = async (sessionId, e) => {
    if (e) e.stopPropagation();
    if (window.confirm('Delete this chat session?')) {
      try {
        const res = await fetch(`/api/chat/sessions/${sessionId}`, {
          method: 'DELETE'
        });
        if (res.ok) {
          const data = await res.json();
          loadSessions(data.activeSessionId);
        }
      } catch (err) {
        console.error('Failed to delete session:', err);
      }
    }
  };

  // Stop streaming response
  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  };

  // Send message and stream response
  const handleSend = async (manualText = null) => {
    const textToSend = (manualText || inputValue).trim();
    if (!textToSend || isStreaming) return;

    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const userMessage = {
      id: 'msg-' + Date.now(),
      role: 'user',
      content: textToSend,
      timestamp: new Date().toISOString()
    };

    const initialAssistantMessage = {
      id: 'msg-' + (Date.now() + 1),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage, initialAssistantMessage]);
    setIsStreaming(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          sessionId: activeSessionId
        }),
        signal: abortController.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') {
              break;
            }
            try {
              const parsed = JSON.parse(dataStr);

              // Update title if generated by LLM
              if (parsed.sessionTitle) {
                setCurrentSession(prev => ({ ...prev, title: parsed.sessionTitle }));
                setSessions(prev =>
                  prev.map(s => s.id === (parsed.sessionId || activeSessionId) ? { ...s, title: parsed.sessionTitle } : s)
                );
              }

              if (parsed.token) {
                accumulated += parsed.token;
                setMessages(prev => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                    updated[lastIdx] = {
                      ...updated[lastIdx],
                      content: accumulated
                    };
                  }
                  return updated;
                });
              } else if (parsed.error) {
                accumulated += `\n\n*Error: ${parsed.error}*`;
              }
            } catch (e) {}
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Streaming failed:', err);
        setMessages(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: updated[lastIdx].content + '\n\n*Connection error. Please check your API key.*'
            };
          }
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
      // Refresh session list so message count and updatedAt are accurate
      loadSessions(activeSessionId);
    }
  };

  // Keyboard shortcut: Enter to send, Shift+Enter for new line
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // If closed, return null so there are no separate floating buttons on screen
  if (!isOpen) {
    return null;
  }

  const pinnedSessions = sessions.filter(s => s.pinned);
  const recentSessions = sessions.filter(s => !s.pinned);

  return (
    <aside
      style={{
        width: '420px',
        maxWidth: '90vw',
        height: '100vh',
        background: '#171717',
        borderRight: '1px solid #2d2d2d',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        flexShrink: 0,
        zIndex: 1000,
        boxShadow: '4px 0 24px rgba(0,0,0,0.4)'
      }}
    >
      {/* Top Header Bar */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid #282828',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#1a1a1a',
        position: 'relative'
      }}>
        {/* Left: Sessions Drawer Button & Active Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
          <button
            onClick={() => setShowSessionsDrawer(!showSessionsDrawer)}
            style={{
              background: showSessionsDrawer ? '#282828' : '#222222',
              border: '1px solid #333333',
              borderRadius: '6px',
              padding: '4px 8px',
              color: '#eff1f6',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '12px',
              fontWeight: 500,
              flexShrink: 0
            }}
            title="View all saved chat sessions"
          >
            <MessageSquare size={13} style={{ color: '#10a37f' }} />
            <span>Chats ({sessions.length})</span>
            {showSessionsDrawer ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {/* Active Session Title (Click to rename) */}
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#e5e7eb',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '160px',
              cursor: 'pointer'
            }}
            onClick={() => currentSession && handleStartRename(currentSession)}
            title="Click to rename session"
          >
            {currentSession?.title || 'New Chat'}
          </div>
        </div>

        {/* Right Action Icons: Pin Active, New Chat, Close Sidebar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
          {/* Quick Pin / Unpin active session */}
          {currentSession && (
            <button
              onClick={() => handleTogglePin(currentSession.id, currentSession.pinned)}
              style={{
                background: 'transparent',
                border: 'none',
                color: currentSession.pinned ? '#eab308' : '#6b7280',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                transition: 'color 0.15s'
              }}
              title={currentSession.pinned ? 'Unpin this chat' : 'Pin this chat'}
            >
              <Pin size={16} fill={currentSession.pinned ? '#eab308' : 'none'} />
            </button>
          )}

          {/* New Chat */}
          <button
            onClick={handleNewChat}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#a0a0a0',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center'
            }}
            title="New Chat Session"
          >
            <Plus size={18} />
          </button>

          {/* Close Sidebar */}
          <button
            onClick={onToggle}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#a0a0a0',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center'
            }}
            title="Close sidebar"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>
      </div>

      {/* Sessions Drawer / Dropdown Panel */}
      {showSessionsDrawer && (
        <div style={{
          position: 'absolute',
          top: '50px',
          left: 0,
          right: 0,
          background: '#1a1a1a',
          borderBottom: '1px solid #333333',
          boxShadow: '0 12px 30px rgba(0,0,0,0.6)',
          zIndex: 1100,
          maxHeight: '360px',
          overflowY: 'auto',
          padding: '10px 12px'
        }}>
          {/* Top Actions in Drawer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#8c8c8c', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Saved Chat Sessions
            </span>
            <button
              onClick={handleNewChat}
              style={{
                background: '#10a37f',
                color: '#ffffff',
                border: 'none',
                borderRadius: '5px',
                padding: '3px 8px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px'
              }}
            >
              <Plus size={12} /> New Chat
            </button>
          </div>

          {/* Pinned Section */}
          {pinnedSessions.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', color: '#eab308', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Pin size={10} fill="#eab308" /> PINNED
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {pinnedSessions.map(s => renderSessionRow(s))}
              </div>
            </div>
          )}

          {/* Recent Section */}
          <div>
            {pinnedSessions.length > 0 && (
              <div style={{ fontSize: '10px', color: '#8c8c8c', fontWeight: 600, marginBottom: '6px' }}>
                RECENT
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {recentSessions.length === 0 && pinnedSessions.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#6b7280', padding: '10px', textAlign: 'center' }}>
                  No saved sessions yet
                </div>
              ) : (
                recentSessions.map(s => renderSessionRow(s))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Messages Scroll Area - Strictly isolated scrolling */}
      <div
        ref={messagesContainerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px'
        }}
      >
        {messages.length === 0 ? (
          <div style={{
            margin: 'auto 0',
            textAlign: 'center',
            padding: '20px 10px',
            color: '#8c8c8c'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: '#222222',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 10px',
              color: '#10a37f'
            }}>
              <Bot size={20} />
            </div>
            <div style={{ fontSize: '14px', color: '#a0a0a0' }}>
              How can I help you today?
            </div>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isUser = msg.role === 'user';
            const isLastAssistant = !isUser && index === messages.length - 1;

            return (
              <div
                key={msg.id || index}
                style={{
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'flex-start',
                  justifyContent: isUser ? 'flex-end' : 'flex-start'
                }}
              >
                {!isUser && (
                  <div style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    background: '#10a37f',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px',
                    color: '#ffffff'
                  }}>
                    <Bot size={15} />
                  </div>
                )}

                <div style={{
                  maxWidth: isUser ? '85%' : '100%',
                  background: isUser ? '#2f2f2f' : 'transparent',
                  padding: isUser ? '10px 14px' : '2px 4px',
                  borderRadius: isUser ? '16px 16px 4px 16px' : '0',
                  color: '#eff1f6',
                  fontSize: '14px',
                  overflowX: 'hidden'
                }}>
                  {isUser ? (
                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: '1.5' }}>
                      {msg.content}
                    </div>
                  ) : (
                    <FormattedMessage
                      content={msg.content}
                      isStreaming={isStreaming && isLastAssistant}
                    />
                  )}
                </div>

                {isUser && (
                  <div style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    background: '#383838',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px',
                    color: '#c5c5c5'
                  }}>
                    <User size={14} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Input Box Footer */}
      <div style={{
        padding: '12px 14px 16px',
        borderTop: '1px solid #262626',
        background: '#171717'
      }}>
        <div style={{
          position: 'relative',
          background: '#212121',
          border: '1px solid #383838',
          borderRadius: '16px',
          padding: '8px 46px 8px 14px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          transition: 'border-color 0.15s'
        }}>
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Message..."
            rows={1}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#eff1f6',
              fontSize: '14px',
              fontFamily: 'inherit',
              resize: 'none',
              maxHeight: '140px',
              lineHeight: '1.45',
              paddingTop: '3px'
            }}
          />

          <div style={{
            position: 'absolute',
            right: '8px',
            bottom: '7px'
          }}>
            {isStreaming ? (
              <button
                onClick={handleStopStreaming}
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  background: '#ffffff',
                  border: 'none',
                  color: '#000000',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Stop generation"
              >
                <Square size={12} fill="#000000" />
              </button>
            ) : (
              <button
                onClick={() => handleSend()}
                disabled={!inputValue.trim()}
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  background: inputValue.trim() ? '#ffffff' : '#333333',
                  border: 'none',
                  color: inputValue.trim() ? '#000000' : '#737373',
                  cursor: inputValue.trim() ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s'
                }}
                title="Send message (Enter)"
              >
                <Send size={13} style={{ marginLeft: '1px' }} />
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );

  // Helper to render each session row in the drawer
  function renderSessionRow(session) {
    const isActive = session.id === activeSessionId;
    const isEditing = editingSessionId === session.id;

    return (
      <div
        key={session.id}
        onClick={() => !isEditing && handleSwitchSession(session.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 8px',
          borderRadius: '6px',
          background: isActive ? '#242424' : 'transparent',
          border: isActive ? '1px solid #10a37f' : '1px solid transparent',
          cursor: isEditing ? 'default' : 'pointer',
          transition: 'all 0.12s'
        }}
        onMouseEnter={(e) => {
          if (!isActive && !isEditing) e.currentTarget.style.background = '#202020';
        }}
        onMouseLeave={(e) => {
          if (!isActive && !isEditing) e.currentTarget.style.background = 'transparent';
        }}
      >
        {/* Left: Title or Inline Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
          <MessageSquare size={13} style={{ color: isActive ? '#10a37f' : '#6b7280', flexShrink: 0 }} />
          {isEditing ? (
            <input
              type="text"
              value={editTitleText}
              onChange={(e) => setEditTitleText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveRename(session.id, e);
                if (e.key === 'Escape') setEditingSessionId(null);
              }}
              autoFocus
              style={{
                width: '100%',
                background: '#111111',
                border: '1px solid #10a37f',
                borderRadius: '4px',
                padding: '2px 6px',
                color: '#eff1f6',
                fontSize: '12px',
                outline: 'none'
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span style={{
              fontSize: '12px',
              color: isActive ? '#ffffff' : '#d1d5db',
              fontWeight: isActive ? 600 : 400,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {session.title || 'New Chat'}
            </span>
          )}
        </div>

        {/* Right: Actions (Pin, Rename, Delete) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginLeft: '6px' }}>
          {isEditing ? (
            <>
              <button
                onClick={(e) => handleSaveRename(session.id, e)}
                style={{ background: 'none', border: 'none', color: '#2cbb5d', cursor: 'pointer', padding: '2px 4px' }}
                title="Save"
              >
                <Check size={13} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setEditingSessionId(null); }}
                style={{ background: 'none', border: 'none', color: '#8c8c8c', cursor: 'pointer', padding: '2px 4px' }}
                title="Cancel"
              >
                <X size={13} />
              </button>
            </>
          ) : (
            <>
              {/* Pin */}
              <button
                onClick={(e) => handleTogglePin(session.id, session.pinned, e)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: session.pinned ? '#eab308' : '#6b7280',
                  cursor: 'pointer',
                  padding: '2px 4px'
                }}
                title={session.pinned ? 'Unpin' : 'Pin'}
              >
                <Pin size={12} fill={session.pinned ? '#eab308' : 'none'} />
              </button>

              {/* Rename */}
              <button
                onClick={(e) => handleStartRename(session, e)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6b7280',
                  cursor: 'pointer',
                  padding: '2px 4px'
                }}
                title="Rename"
              >
                <Pencil size={12} />
              </button>

              {/* Delete */}
              <button
                onClick={(e) => handleDeleteSession(session.id, e)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6b7280',
                  cursor: 'pointer',
                  padding: '2px 4px'
                }}
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </>
          )}
        </div>
      </div>
    );
  }
}
