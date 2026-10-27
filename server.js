import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getSessionList,
  getSession,
  createSession,
  setActiveSession,
  renameSession,
  pinSession,
  deleteSession,
  streamChat
} from './chatService.js';
import { SYSTEM_PROMPT, CHAT_CONFIG } from './chatConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Automatically load .env file if present
const ENV_FILE = path.join(__dirname, '.env');
function loadEnv() {
  if (fs.existsSync(ENV_FILE)) {
    try {
      const content = fs.readFileSync(ENV_FILE, 'utf8');
      content.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=');
          if (idx !== -1) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
            if (key) process.env[key] = val;
          }
        }
      });
    } catch (e) {
      console.error('Error loading .env file:', e);
    }
  }
}
loadEnv();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const PROGRESS_FILE = path.join(__dirname, 'progress.json');

// Ensure progress.json exists
function getProgress() {
  try {
    if (!fs.existsSync(PROGRESS_FILE)) {
      const initial = { solved: {}, lastUpdated: new Date().toISOString() };
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }
    const data = fs.readFileSync(PROGRESS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading progress.json:', err);
    return { solved: {}, lastUpdated: new Date().toISOString() };
  }
}

function saveProgress(data) {
  try {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving progress.json:', err);
    return false;
  }
}

// RFC 4180 aware CSV line parser
function parseCSVLine(text) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

function parseCSV(content) {
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < headers.length) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      const cleanHeader = h.replace(/[\ufeff]/g, '').trim();
      obj[cleanHeader] = values[idx] || '';
    });
    rows.push(obj);
  }
  return rows;
}

// Load LeetCode problem map for fast ID lookup
let problemMap = {};
try {
  const mapPath = path.join(__dirname, 'leetcode_problem_map.json');
  if (fs.existsSync(mapPath)) {
    problemMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  }
} catch (e) {
  console.warn('Problem map load error:', e.message);
}

function formatAcceptance(raw) {
  if (raw === undefined || raw === null || raw === '') return { text: 'N/A', num: 0 };
  const str = String(raw).trim();
  const numVal = parseFloat(str.replace('%', ''));
  if (isNaN(numVal)) return { text: str, num: 0 };

  if (str.includes('%')) {
    return { text: `${numVal.toFixed(1)}%`, num: numVal };
  }
  if (numVal < 0.02) {
    const pct = +(numVal * 10000).toFixed(1);
    return { text: `${pct}%`, num: pct };
  }
  if (numVal <= 1) {
    const pct = +(numVal * 100).toFixed(1);
    return { text: `${pct}%`, num: pct };
  }
  return { text: `${numVal.toFixed(1)}%`, num: numVal };
}

function formatFrequency(raw) {
  if (raw === undefined || raw === null || raw === '') return { text: '0%', num: 0 };
  const str = String(raw).trim();
  const numVal = parseFloat(str.replace('%', ''));
  if (isNaN(numVal)) return { text: '0%', num: 0 };
  return { text: `${numVal.toFixed(1)}%`, num: numVal };
}

const PERIOD_CONFIG = {
  // New format
  '5. all.csv': { key: 'all', label: 'All Time', order: 1 },
  '1. thirty days.csv': { key: 'thirty-days', label: 'Last 30 Days', order: 2 },
  '2. three months.csv': { key: 'three-months', label: 'Last 3 Months', order: 3 },
  '3. six months.csv': { key: 'six-months', label: 'Last 6 Months', order: 4 },
  '4. more than six months.csv': { key: 'more-than-six-months', label: '> 6 Months', order: 5 },

  // Old format
  'all.csv': { key: 'all', label: 'All Time', order: 1 },
  'thirty-days.csv': { key: 'thirty-days', label: 'Last 30 Days', order: 2 },
  'three-months.csv': { key: 'three-months', label: 'Last 3 Months', order: 3 },
  'six-months.csv': { key: 'six-months', label: 'Last 6 Months', order: 4 },
  'more-than-six-months.csv': { key: 'more-than-six-months', label: '> 6 Months', order: 5 }
};

function formatPeriodLabel(filename) {
  const lower = filename.toLowerCase().trim();
  if (PERIOD_CONFIG[lower]) {
    return PERIOD_CONFIG[lower];
  }
  if (lower.includes('all')) return { key: 'all', label: 'All Time', order: 1 };
  if (lower.includes('thirty') || lower.includes('30')) return { key: 'thirty-days', label: 'Last 30 Days', order: 2 };
  if (lower.includes('three') || lower.includes('3-month') || lower.includes('90')) return { key: 'three-months', label: 'Last 3 Months', order: 3 };
  if (lower.includes('six') || lower.includes('6-month')) {
    if (lower.includes('more')) return { key: 'more-than-six-months', label: '> 6 Months', order: 5 };
    return { key: 'six-months', label: 'Last 6 Months', order: 4 };
  }
  const cleanName = filename.replace(/^\d+[\.\s_-]*/, '').replace(/\.csv$/i, '').replace(/[-_]/g, ' ');
  const capitalized = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
  return { key: filename.replace(/\.csv$/i, ''), label: capitalized, order: 10 };
}

function formatCompanyName(dirName) {
  return dirName
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Ignore system/build folders
const IGNORED_DIRS = new Set([
  'node_modules',
  'src',
  'dist',
  'public',
  '.git',
  '.gemini',
  'brain',
  'build',
  '.vscode',
  '.idea'
]);

// Recursively find company directories containing .csv files
function findCompanyDirs(baseDir, maxDepth = 2, currentDepth = 0) {
  if (currentDepth > maxDepth) return [];
  const results = [];
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const nameLower = entry.name.toLowerCase();
      if (IGNORED_DIRS.has(nameLower) || entry.name.startsWith('.')) continue;

      const fullPath = path.join(baseDir, entry.name);
      let subFiles = [];
      try {
        subFiles = fs.readdirSync(fullPath);
      } catch {
        continue;
      }
      const hasCsv = subFiles.some(f => f.toLowerCase().endsWith('.csv'));
      if (hasCsv) {
        results.push({ name: entry.name, path: fullPath });
      } else {
        results.push(...findCompanyDirs(fullPath, maxDepth, currentDepth + 1));
      }
    }
  } catch (err) {
    console.error('Error finding company dirs in:', baseDir, err);
  }
  return results;
}

let cachedScanData = null;

function scanDirectory(forceRefresh = false) {
  if (cachedScanData && !forceRefresh) {
    return cachedScanData;
  }

  const companyDirs = findCompanyDirs(__dirname);
  const companyMap = new Map();
  const allQuestions = [];

  for (const { name: dirName, path: companyDir } of companyDirs) {
    let files;
    try {
      files = fs.readdirSync(companyDir);
    } catch {
      continue;
    }

    const csvFiles = files.filter(f => f.toLowerCase().endsWith('.csv'));
    if (csvFiles.length === 0) continue;

    const companyId = dirName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const companyDisplayName = formatCompanyName(dirName);

    let companyEntry = companyMap.get(companyId);
    if (!companyEntry) {
      companyEntry = {
        id: companyId,
        name: companyDisplayName,
        periods: [],
        questions: []
      };
      companyMap.set(companyId, companyEntry);
    }

    // Sort CSV files to keep All Time, 30 Days, 3 Months, 6 Months in order
    csvFiles.sort((a, b) => {
      const orderA = formatPeriodLabel(a).order;
      const orderB = formatPeriodLabel(b).order;
      return orderA - orderB;
    });

    for (const file of csvFiles) {
      const periodInfo = formatPeriodLabel(file);
      companyEntry.periods.push({
        file,
        key: periodInfo.key,
        label: periodInfo.label,
        order: periodInfo.order
      });

      const filePath = path.join(companyDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const rows = parseCSV(content);

        rows.forEach(row => {
          const title = (row.Title || row.title || '').trim();
          if (!title) return;

          const url = (row.Link || row.link || row.URL || row.url || '').trim();
          const slugMatch = url.match(/\/problems\/([^/?#]+)/);
          const slug = slugMatch ? slugMatch[1] : '';

          // Look up numeric ID from leetcode_problem_map or use ID column or slug
          let id = row.ID || row.id || '';
          if (!id) {
            if (slug && problemMap[slug]) {
              id = String(problemMap[slug]);
            } else if (slug) {
              id = slug;
            } else {
              id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            }
          }

          const rawDiff = (row.Difficulty || row.difficulty || 'Medium').trim();
          const difficulty = rawDiff.charAt(0).toUpperCase() + rawDiff.slice(1).toLowerCase();

          const acc = formatAcceptance(row['Acceptance Rate'] || row['Acceptance %'] || row.acceptance || row.Acceptance);
          const freq = formatFrequency(row['Frequency'] || row['Frequency %'] || row.frequency || row.Frequency);
          const topics = (row.Topics || row.topics || '').trim();
          const topicsList = topics ? topics.split(',').map(t => t.trim()).filter(Boolean) : [];

          const questionObj = {
            id: String(id),
            title,
            url: url || (slug ? `https://leetcode.com/problems/${slug}` : `https://leetcode.com/problems/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`),
            difficulty,
            acceptance: acc.text,
            acceptanceNum: acc.num,
            frequency: freq.text,
            frequencyNum: freq.num,
            topics,
            topicsList,
            company: companyDisplayName,
            companyId,
            periodKey: periodInfo.key,
            periodLabel: periodInfo.label,
            periodFile: file
          };

          companyEntry.questions.push(questionObj);
          allQuestions.push(questionObj);
        });
      } catch (err) {
        console.error(`Error reading ${filePath}:`, err);
      }
    }
  }

  const companies = Array.from(companyMap.values()).map(c => {
    const uniqueIds = new Set(c.questions.map(q => q.id));
    return {
      id: c.id,
      name: c.name,
      periods: c.periods,
      totalQuestions: c.questions.length,
      uniqueQuestions: uniqueIds.size
    };
  });

  // Sort companies alphabetically
  companies.sort((a, b) => a.name.localeCompare(b.name));

  cachedScanData = { companies, questions: allQuestions };
  return cachedScanData;
}

// API Routes
app.get('/api/data', (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const data = scanDirectory(forceRefresh);
    const progress = getProgress();
    res.json({
      success: true,
      companies: data.companies,
      questions: data.questions,
      progress: progress.solved || {},
      lastUpdated: progress.lastUpdated
    });
  } catch (err) {
    console.error('Error scanning data:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/progress', (req, res) => {
  const progress = getProgress();
  res.json({ success: true, progress: progress.solved || {}, lastUpdated: progress.lastUpdated });
});

app.post('/api/progress/status', (req, res) => {
  const { id, status } = req.body;
  if (!id) return res.status(400).json({ success: false, error: 'Missing question ID' });

  const progress = getProgress();
  if (!progress.solved) progress.solved = {};

  const current = progress.solved[id] || {};
  progress.solved[id] = {
    ...current,
    status: status, // 'solved', 'attempted', 'unsolved'
    updatedAt: new Date().toISOString()
  };

  saveProgress(progress);
  res.json({ success: true, item: progress.solved[id] });
});

app.post('/api/progress/star', (req, res) => {
  const { id, starred } = req.body;
  if (!id) return res.status(400).json({ success: false, error: 'Missing question ID' });

  const progress = getProgress();
  if (!progress.solved) progress.solved = {};

  const current = progress.solved[id] || {};
  progress.solved[id] = {
    ...current,
    starred: Boolean(starred),
    updatedAt: new Date().toISOString()
  };

  saveProgress(progress);
  res.json({ success: true, item: progress.solved[id] });
});

app.post('/api/progress/notes', (req, res) => {
  const { id, notes } = req.body;
  if (!id) return res.status(400).json({ success: false, error: 'Missing question ID' });

  const progress = getProgress();
  if (!progress.solved) progress.solved = {};

  const current = progress.solved[id] || {};
  progress.solved[id] = {
    ...current,
    notes: String(notes || ''),
    updatedAt: new Date().toISOString()
  };

  saveProgress(progress);
  res.json({ success: true, item: progress.solved[id] });
});

app.post('/api/progress/batch', (req, res) => {
  const { solved } = req.body;
  if (!solved || typeof solved !== 'object') {
    return res.status(400).json({ success: false, error: 'Invalid payload' });
  }

  const progress = getProgress();
  progress.solved = { ...progress.solved, ...solved };
  saveProgress(progress);
  res.json({ success: true, progress: progress.solved });
});

// Chat Session API Routes
app.get('/api/chat/sessions', (req, res) => {
  try {
    const list = getSessionList();
    res.json({ success: true, ...list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/chat/sessions', (req, res) => {
  try {
    const session = createSession(req.body?.title);
    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/chat/sessions/:id', (req, res) => {
  try {
    const session = getSession(req.params.id);
    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/chat/sessions/:id/switch', (req, res) => {
  try {
    const session = setActiveSession(req.params.id);
    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/chat/sessions/:id/rename', (req, res) => {
  try {
    const session = renameSession(req.params.id, req.body?.title);
    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/chat/sessions/:id/pin', (req, res) => {
  try {
    const session = pinSession(req.params.id, req.body?.pinned);
    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/chat/sessions/:id', (req, res) => {
  try {
    const result = deleteSession(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Legacy history endpoint (returns active session messages)
app.get('/api/chat/history', (req, res) => {
  try {
    const session = getSession();
    res.json({
      success: true,
      messages: session?.messages || [],
      maxMemory: CHAT_CONFIG.maxMemoryMessages || 20
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/chat/clear', (req, res) => {
  try {
    const session = getSession();
    if (session) session.messages = [];
    res.json({ success: true, messages: [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/chat/stream', (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ success: false, error: 'Message text is required' });
  }
  streamChat({ message, sessionId, res });
});

// Key status & update endpoints
app.get('/api/chat/keys', (req, res) => {
  res.json({
    success: true,
    hasGemini: Boolean(process.env.GEMINI_API_KEY),
    hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
    hasGroq: Boolean(process.env.GROQ_API_KEY),
    geminiPreview: process.env.GEMINI_API_KEY ? `${process.env.GEMINI_API_KEY.slice(0, 6)}...` : '',
    openaiPreview: process.env.OPENAI_API_KEY ? `${process.env.OPENAI_API_KEY.slice(0, 6)}...` : '',
    groqPreview: process.env.GROQ_API_KEY ? `${process.env.GROQ_API_KEY.slice(0, 6)}...` : ''
  });
});

app.post('/api/chat/keys', (req, res) => {
  const { gemini, openai, groq } = req.body;
  if (gemini !== undefined) process.env.GEMINI_API_KEY = gemini.trim();
  if (openai !== undefined) process.env.OPENAI_API_KEY = openai.trim();
  if (groq !== undefined) process.env.GROQ_API_KEY = groq.trim();

  // Also update .env file
  try {
    const lines = [
      '# AI Chatbot API Keys',
      `GEMINI_API_KEY=${process.env.GEMINI_API_KEY || ''}`,
      `OPENAI_API_KEY=${process.env.OPENAI_API_KEY || ''}`,
      `GROQ_API_KEY=${process.env.GROQ_API_KEY || ''}`
    ];
    fs.writeFileSync(ENV_FILE, lines.join('\n'), 'utf8');
  } catch (err) {
    console.error('Error writing .env file:', err);
  }

  res.json({
    success: true,
    hasGemini: Boolean(process.env.GEMINI_API_KEY),
    hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
    hasGroq: Boolean(process.env.GROQ_API_KEY)
  });
});

// Serve frontend build if dist folder exists
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
}

app.listen(PORT, () => {
  console.log(`LeetCode Company DSA Tracker running at http://localhost:${PORT}`);
});
