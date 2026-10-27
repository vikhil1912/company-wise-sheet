# 🚀 LeetCode Company DSA Practice Tracker & AI Interview Coach

A modern LeetCode-styled dark UI built with **React** and **Node.js / Express** to browse, track, and practice company-wise DSA interview questions with persistent local progress tracking and an integrated AI Interview Coach.

---

## 🌟 Key Features

- **LeetCode Dark Theme UI**: Built with React, matching LeetCode's design, typography, color-coded difficulties, and responsive controls.
- **🤖 AI Interview Coach (ChatGPT-Style Sidebar)**:
  - Collapsible left sidebar with token-by-token live streaming responses.
  - Formatted identically to ChatGPT: Markdown, headers, bullet lists, math, and syntax-highlighted code blocks with **"Copy code"** buttons.
  - **Multi-Session Management**: Create multiple chat sessions, switch between them, **pin** key conversations to the top, **rename** inline, or **delete** sessions.
  - **Auto-Generated Session Titles**: Starting a new chat automatically prompts the LLM to generate a concise, 3-5 word title based on your opening question.
  - **Persistent Conversation Memory**: Saves full chat transcripts to `chat_sessions.json`.
  - **One-Click Problem Coaching**: Click the **Coach** icon (`✨`) on any problem row to prompt the AI for progressive hints, edge cases, and time/space complexity analysis.
- **Persistent Local Tracking**:
  - Problem status (Solved `✓`, Attempted `◐`, Unsolved `○`, Starred `★`, and custom Solution Notes) is saved directly into `progress.json`.
- **466+ Companies Supported**:
  - Automatically scans and indexes all company folders in `leetcode-company-wise-problems/` (Meta, Bloomberg, Uber, TikTok, Google, Amazon, etc.).
  - Supports both new numbered CSV formats (`1. Thirty Days.csv`, `5. All.csv`) and classic formats (`thirty-days.csv`, `all.csv`).
- **Smooth Filtering & Searching**:
  - **Company**: Filter by quick-access top pills or browse all 466+ companies from the dropdown.
  - **Timeframe**: Last 30 Days, 3 Months, 6 Months, > 6 Months, or All Time.
  - **Difficulty**: All, Easy, Medium, Hard.
  - **Topics & Tags**: Topic badges displayed on problems (e.g. `Array`, `Hash Table`, `Dynamic Programming`) and searchable directly in the search bar.
  - **Status**: Solved, Attempted, Unsolved, Starred, Has Notes.
  - **Sorting**: By Question #, Title, Acceptance Rate, Frequency, or Difficulty.
- **LeetCode Progress Analytics**:
  - Solved progress ring with circular meter and detailed breakdown modal.
  - Random Pick (`🔀`) to pick a question matching your active filters for mock practice.
  - Direct links to open any problem directly on LeetCode.

---

## ⚡ Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment (.env)
Copy the example environment file and add your OpenAI API key:
```bash
cp .env.example .env
```
Open `.env` and set:
```env
OPENAI_API_KEY=your_openai_api_key_here
PORT=5000
```

### 3. Build & Run

**Option A (One-Click on Windows):**
Double-click `start.bat`.

**Option B (Terminal):**
```bash
# Build React frontend
npm run build

# Start the server
npm start
```

Then visit **`http://localhost:5000`** in your browser.

---

## 📁 Project Structure

```
├── leetcode-company-wise-problems/  # Company folders with CSV questions
├── src/                             # React frontend (Vite)
│   ├── App.jsx                      # Main LeetCode table, filters & stats
│   ├── ChatSidebar.jsx              # ChatGPT-style AI coach with multi-sessions
│   ├── main.jsx                     # Application entry point
│   └── index.css                    # Dark theme LeetCode styles
├── server.js                        # Express backend, CSV scanner & API routes
├── chatService.js                   # Multi-session LLM streaming & auto-titling
├── chatConfig.js                    # Coach system prompt & LLM model settings
├── leetcode_problem_map.json        # Offline slug-to-ID mapping
├── .env.example                     # Environment template (API keys)
├── .gitignore                       # Git ignore configuration
├── package.json
└── start.bat                        # Windows one-click startup launcher
```

---

## 🔒 Git & Security Note

Before pushing to GitHub:
- Your API key in `.env` is protected by `.gitignore`.
- Your personal AI chat logs (`chat_sessions.json`, `chat_history.json`) are also ignored by default.
- If you want your solved question progress (`progress.json`) kept private as well, you can uncomment `progress.json` in `.gitignore`.
