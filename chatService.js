import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SYSTEM_PROMPT, CHAT_CONFIG, API_KEYS } from './chatConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHAT_SESSIONS_FILE = path.join(__dirname, 'chat_sessions.json');
const LEGACY_HISTORY_FILE = path.join(__dirname, 'chat_history.json');

// Initialize or read chat_sessions.json
export function getChatSessionsData() {
  try {
    if (!fs.existsSync(CHAT_SESSIONS_FILE)) {
      // Migrate legacy chat_history.json if present
      let initialMessages = [];
      if (fs.existsSync(LEGACY_HISTORY_FILE)) {
        try {
          const legacy = JSON.parse(fs.readFileSync(LEGACY_HISTORY_FILE, 'utf8'));
          if (Array.isArray(legacy.messages) && legacy.messages.length > 0) {
            initialMessages = legacy.messages;
          }
        } catch (e) {}
      }

      const defaultSession = {
        id: 'session-' + Date.now(),
        title: initialMessages.length > 0 ? 'Previous Chat' : 'New Chat',
        pinned: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: initialMessages
      };

      const initial = {
        activeSessionId: defaultSession.id,
        sessions: [defaultSession],
        lastUpdated: new Date().toISOString()
      };

      fs.writeFileSync(CHAT_SESSIONS_FILE, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }

    const data = JSON.parse(fs.readFileSync(CHAT_SESSIONS_FILE, 'utf8'));
    if (!data.sessions || !Array.isArray(data.sessions) || data.sessions.length === 0) {
      const defaultSession = {
        id: 'session-' + Date.now(),
        title: 'New Chat',
        pinned: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: []
      };
      data.sessions = [defaultSession];
      data.activeSessionId = defaultSession.id;
      data.lastUpdated = new Date().toISOString();
      fs.writeFileSync(CHAT_SESSIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
    }
    return data;
  } catch (err) {
    console.error('Error reading chat_sessions.json:', err);
    const fallbackSession = {
      id: 'session-' + Date.now(),
      title: 'New Chat',
      pinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: []
    };
    return {
      activeSessionId: fallbackSession.id,
      sessions: [fallbackSession],
      lastUpdated: new Date().toISOString()
    };
  }
}

export function saveChatSessionsData(data) {
  try {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(CHAT_SESSIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving chat_sessions.json:', err);
    return false;
  }
}

export function getSessionList() {
  const data = getChatSessionsData();
  const list = data.sessions.map(s => ({
    id: s.id,
    title: s.title || 'New Chat',
    pinned: Boolean(s.pinned),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    messageCount: s.messages ? s.messages.length : 0
  }));

  // Pinned first, then sorted by updatedAt descending
  list.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });

  return {
    activeSessionId: data.activeSessionId || list[0]?.id,
    sessions: list
  };
}

export function getSession(sessionId) {
  const data = getChatSessionsData();
  let session = data.sessions.find(s => s.id === sessionId);
  if (!session) {
    session = data.sessions.find(s => s.id === data.activeSessionId) || data.sessions[0];
  }
  return session;
}

export function createSession(title = 'New Chat') {
  const data = getChatSessionsData();
  const newSession = {
    id: 'session-' + Date.now(),
    title,
    pinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: []
  };
  data.sessions.unshift(newSession);
  data.activeSessionId = newSession.id;
  saveChatSessionsData(data);
  return newSession;
}

export function setActiveSession(sessionId) {
  const data = getChatSessionsData();
  const found = data.sessions.find(s => s.id === sessionId);
  if (found) {
    data.activeSessionId = found.id;
    saveChatSessionsData(data);
    return found;
  }
  return null;
}

export function renameSession(sessionId, title) {
  const data = getChatSessionsData();
  const session = data.sessions.find(s => s.id === sessionId);
  if (session) {
    session.title = (title || 'New Chat').trim().slice(0, 60);
    session.updatedAt = new Date().toISOString();
    saveChatSessionsData(data);
    return session;
  }
  return null;
}

export function pinSession(sessionId, pinned) {
  const data = getChatSessionsData();
  const session = data.sessions.find(s => s.id === sessionId);
  if (session) {
    session.pinned = Boolean(pinned);
    session.updatedAt = new Date().toISOString();
    saveChatSessionsData(data);
    return session;
  }
  return null;
}

export function deleteSession(sessionId) {
  const data = getChatSessionsData();
  data.sessions = data.sessions.filter(s => s.id !== sessionId);

  if (data.sessions.length === 0) {
    const fresh = {
      id: 'session-' + Date.now(),
      title: 'New Chat',
      pinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: []
    };
    data.sessions = [fresh];
    data.activeSessionId = fresh.id;
  } else if (data.activeSessionId === sessionId) {
    data.activeSessionId = data.sessions[0].id;
  }

  saveChatSessionsData(data);
  return {
    activeSessionId: data.activeSessionId,
    sessions: getSessionList().sessions
  };
}

// Clean raw LLM title response
function cleanTitle(raw) {
  return raw
    .replace(/^["'`\s]+|["'`\s]+$/g, '')
    .replace(/["'*#`.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 45) || 'New Chat';
}

// Generate concise 3-5 word title using configured LLM
export async function generateTitleWithLLM(userQuery) {
  const openaiKey = (process.env.OPENAI_API_KEY || API_KEYS?.openai || '').trim();
  const geminiKey = (process.env.GEMINI_API_KEY || API_KEYS?.gemini || '').trim();
  const groqKey = (process.env.GROQ_API_KEY || API_KEYS?.groq || '').trim();
  const customUrl = (process.env.AI_BASE_URL || API_KEYS?.customBaseUrl || '').trim();

  const prompt = `Summarize the following programming/DSA interview request into a concise 3 to 5 word title. Do not use quotes, punctuation, or formatting:\n\n${userQuery}`;

  try {
    if (geminiKey) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return cleanTitle(text);
      }
    } else if (openaiKey || groqKey || customUrl) {
      let endpoint = 'https://api.openai.com/v1/chat/completions';
      let bearerKey = openaiKey;
      let model = 'gpt-4o-mini';

      if (groqKey && !openaiKey) {
        endpoint = 'https://api.groq.com/openai/v1/chat/completions';
        bearerKey = groqKey;
        model = 'llama-3.3-70b-versatile';
      } else if (customUrl) {
        endpoint = customUrl.endsWith('/chat/completions') ? customUrl : `${customUrl.replace(/\/+$/, '')}/chat/completions`;
        bearerKey = openaiKey || 'none';
        model = CHAT_CONFIG.ollamaModel || 'llama3.2';
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bearerKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 15,
          temperature: 0.4
        })
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) return cleanTitle(text);
      }
    }
  } catch (err) {
    console.warn('Title generation error, falling back:', err);
  }

  // Fallback clean snippet if LLM call fails
  const words = userQuery.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/);
  return cleanTitle(words.slice(0, 4).join(' '));
}

// Stream chat response for a specific session
export async function streamChat({ message, sessionId, res }) {
  const data = getChatSessionsData();
  let session = data.sessions.find(s => s.id === sessionId);
  if (!session) {
    session = data.sessions.find(s => s.id === data.activeSessionId) || data.sessions[0];
  }

  const isFirstMessage = !session.messages || session.messages.length === 0;
  const isDefaultTitle = !session.title || session.title === 'New Chat' || session.title === 'Untitled';

  const userMsgId = 'msg-' + Date.now();
  const userTimestamp = new Date().toISOString();

  // Add user message to session
  const userMessageObj = {
    id: userMsgId,
    role: 'user',
    content: message,
    timestamp: userTimestamp
  };
  session.messages.push(userMessageObj);
  session.updatedAt = new Date().toISOString();

  // Prepare memory window (last N messages)
  const maxMemory = CHAT_CONFIG.maxMemoryMessages || 20;
  const memoryContext = session.messages.slice(-maxMemory);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let assistantContent = '';

  try {
    // Generate title asynchronously if this is the first message in the session
    let titlePromise = null;
    if (isFirstMessage && isDefaultTitle) {
      titlePromise = generateTitleWithLLM(message);
    }

    // Determine configured keys
    const geminiKey = (process.env.GEMINI_API_KEY || API_KEYS?.gemini || '').trim();
    const openaiKey = (process.env.OPENAI_API_KEY || API_KEYS?.openai || '').trim();
    const groqKey = (process.env.GROQ_API_KEY || API_KEYS?.groq || '').trim();
    const customUrl = (process.env.AI_BASE_URL || API_KEYS?.customBaseUrl || '').trim();

    if (geminiKey) {
      // 1. Google Gemini Streaming API
      const geminiModel = CHAT_CONFIG.geminiModel || 'gemini-1.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${geminiKey}`;

      const contents = memoryContext.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

      const body = {
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { temperature: CHAT_CONFIG.temperature || 0.3 }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`Gemini API error ${response.status}: ${await response.text()}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            try {
              const parsed = JSON.parse(jsonStr);
              const textChunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
              if (textChunk) {
                assistantContent += textChunk;
                res.write(`data: ${JSON.stringify({ token: textChunk })}\n\n`);
              }
            } catch (e) {}
          }
        }
      }
    } else if (openaiKey || groqKey || customUrl) {
      // 2. OpenAI / Groq / Custom OpenAI-Compatible Streaming
      let endpoint = 'https://api.openai.com/v1/chat/completions';
      let bearerKey = openaiKey;
      let model = CHAT_CONFIG.openaiModel || 'gpt-4o-mini';

      if (groqKey && !openaiKey) {
        endpoint = 'https://api.groq.com/openai/v1/chat/completions';
        bearerKey = groqKey;
        model = CHAT_CONFIG.groqModel || 'llama-3.3-70b-versatile';
      } else if (customUrl) {
        endpoint = customUrl.endsWith('/chat/completions') ? customUrl : `${customUrl.replace(/\/+$/, '')}/chat/completions`;
        bearerKey = openaiKey || 'none';
        model = CHAT_CONFIG.ollamaModel || 'llama3.2';
      }

      const messagesPayload = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...memoryContext.map(m => ({ role: m.role, content: m.content }))
      ];

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bearerKey}`
        },
        body: JSON.stringify({
          model,
          messages: messagesPayload,
          stream: true,
          temperature: CHAT_CONFIG.temperature || 0.3
        })
      });

      if (!response.ok) {
        throw new Error(`LLM Provider API error ${response.status}: ${await response.text()}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
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
            if (dataStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(dataStr);
              const textChunk = parsed.choices?.[0]?.delta?.content || '';
              if (textChunk) {
                assistantContent += textChunk;
                res.write(`data: ${JSON.stringify({ token: textChunk })}\n\n`);
              }
            } catch (e) {}
          }
        }
      }
    } else {
      assistantContent = `⚠️ **API Key Required**\n\nNo API key was detected. Please add your API key to \`.env\` or \`chatConfig.js\` in this folder.`;
      res.write(`data: ${JSON.stringify({ token: assistantContent })}\n\n`);
    }

    // Await title if generating
    if (titlePromise) {
      try {
        const generatedTitle = await titlePromise;
        if (generatedTitle) {
          session.title = generatedTitle;
          res.write(`data: ${JSON.stringify({ sessionTitle: generatedTitle, sessionId: session.id })}\n\n`);
        }
      } catch (e) {}
    }

    // Finish streaming
    res.write('data: [DONE]\n\n');
    res.end();

    // Save assistant response to session
    const assistantMsgId = 'msg-' + (Date.now() + 1);
    session.messages.push({
      id: assistantMsgId,
      role: 'assistant',
      content: assistantContent,
      timestamp: new Date().toISOString()
    });
    session.updatedAt = new Date().toISOString();

    saveChatSessionsData(data);
  } catch (err) {
    console.error('Error during chat streaming:', err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
}
