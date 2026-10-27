import React, { useState, useEffect, useMemo, useRef } from 'react';
import ChatSidebar from './ChatSidebar.jsx';
import {
  Search,
  ArrowUpDown,
  Filter,
  Shuffle,
  Check,
  Circle,
  Clock,
  Star,
  ExternalLink,
  RefreshCw,
  FileText,
  ChevronLeft,
  ChevronRight,
  X,
  BarChart2,
  Download,
  Upload,
  CheckCircle2,
  Calendar,
  Sparkles,
  Building2,
  Layers,
  HelpCircle,
  CheckCircle,
  RotateCcw,
  Bot,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';

const API_BASE = '/api';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [progress, setProgress] = useState({});
  const [lastUpdated, setLastUpdated] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Chatbot Sidebar State
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [externalChatQuery, setExternalChatQuery] = useState(null);

  // Filters & Search
  const [selectedCompany, setSelectedCompany] = useState('all');
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('id'); // 'id', 'title', 'acceptance', 'frequency', 'difficulty'
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc', 'desc'
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Modals
  const [activeNoteModal, setActiveNoteModal] = useState(null); // question object
  const [currentNoteText, setCurrentNoteText] = useState('');
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [randomModalQuestion, setRandomModalQuestion] = useState(null);

  // Fetch initial data
  const fetchData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    try {
      const url = isManualRefresh ? `${API_BASE}/data?refresh=true` : `${API_BASE}/data`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load data`);
      const data = await res.json();
      if (data.success) {
        setCompanies(data.companies || []);
        setQuestions(data.questions || []);
        setProgress(data.progress || {});
        setLastUpdated(data.lastUpdated || new Date().toISOString());

        // Also save to localStorage as backup
        try {
          localStorage.setItem('dsa_tracker_progress', JSON.stringify(data.progress || {}));
        } catch (e) {}

        if (isManualRefresh) {
          showToast(`Refreshed! Found ${data.companies.length} companies, ${data.questions.length} questions.`);
        }
      } else {
        throw new Error(data.error || 'Server returned failure');
      }
    } catch (err) {
      console.error(err);
      setError(err.message);
      // Fallback to localStorage if server fails
      try {
        const cached = localStorage.getItem('dsa_tracker_progress');
        if (cached) setProgress(JSON.parse(cached));
      } catch (e) {}
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Toggle problem status: unsolved -> solved -> attempted -> unsolved
  const handleToggleStatus = async (question, e) => {
    if (e) e.stopPropagation();
    const current = progress[question.id]?.status || 'unsolved';
    let nextStatus = 'solved';
    if (current === 'unsolved') nextStatus = 'solved';
    else if (current === 'solved') nextStatus = 'attempted';
    else nextStatus = 'unsolved';

    // Optimistic update
    const updated = {
      ...progress,
      [question.id]: {
        ...(progress[question.id] || {}),
        status: nextStatus,
        updatedAt: new Date().toISOString()
      }
    };
    setProgress(updated);

    try {
      await fetch(`${API_BASE}/progress/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: question.id, status: nextStatus })
      });
    } catch (err) {
      console.error('Failed to sync status:', err);
    }
  };

  // Toggle Star / Favorite
  const handleToggleStar = async (question, e) => {
    if (e) e.stopPropagation();
    const current = Boolean(progress[question.id]?.starred);
    const nextStarred = !current;

    // Optimistic update
    const updated = {
      ...progress,
      [question.id]: {
        ...(progress[question.id] || {}),
        starred: nextStarred,
        updatedAt: new Date().toISOString()
      }
    };
    setProgress(updated);

    try {
      await fetch(`${API_BASE}/progress/star`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: question.id, starred: nextStarred })
      });
    } catch (err) {
      console.error('Failed to sync star:', err);
    }
  };

  // Open note modal
  const handleOpenNote = (question, e) => {
    if (e) e.stopPropagation();
    setActiveNoteModal(question);
    setCurrentNoteText(progress[question.id]?.notes || '');
  };

  // Save note
  const handleSaveNote = async () => {
    if (!activeNoteModal) return;
    const qId = activeNoteModal.id;
    const updated = {
      ...progress,
      [qId]: {
        ...(progress[qId] || {}),
        notes: currentNoteText,
        updatedAt: new Date().toISOString()
      }
    };
    setProgress(updated);
    setActiveNoteModal(null);
    showToast(`Notes saved for #${qId} ${activeNoteModal.title}`);

    try {
      await fetch(`${API_BASE}/progress/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: qId, notes: currentNoteText })
      });
    } catch (err) {
      console.error('Failed to save note to server:', err);
    }
  };

  // Top companies for quick pill access (sorted by question count)
  const topCompanies = useMemo(() => {
    return [...companies].sort((a, b) => b.uniqueQuestions - a.uniqueQuestions).slice(0, 8);
  }, [companies]);

  const isSelectedInTop = selectedCompany === 'all' || topCompanies.some(c => c.id === selectedCompany);
  const selectedCompanyObj = companies.find(c => c.id === selectedCompany);

  // Available periods for currently selected company
  const availablePeriods = useMemo(() => {
    if (selectedCompany === 'all') {
      // Collect unique period keys across all companies
      const map = new Map();
      companies.forEach(c => {
        c.periods?.forEach(p => {
          if (!map.has(p.key)) map.set(p.key, p);
        });
      });
      return Array.from(map.values()).sort((a, b) => a.order - b.order);
    }
    const comp = companies.find(c => c.id === selectedCompany);
    return comp ? comp.periods : [];
  }, [companies, selectedCompany]);

  // Reset period if not valid for selected company
  useEffect(() => {
    if (selectedPeriod !== 'all') {
      const isValid = availablePeriods.some(p => p.key === selectedPeriod);
      if (!isValid) setSelectedPeriod('all');
    }
  }, [availablePeriods, selectedPeriod]);

  // Unique questions list based on company and period selection
  const filteredQuestions = useMemo(() => {
    let list = questions;

    // Filter by Company
    if (selectedCompany !== 'all') {
      list = list.filter(q => q.companyId === selectedCompany);
    }

    // Filter by Period
    if (selectedPeriod !== 'all') {
      list = list.filter(q => q.periodKey === selectedPeriod);
    } else {
      // If "all" periods is selected, deduplicate by question ID to avoid showing duplicates
      // from 30-days, 6-months, and all.csv!
      const uniqueMap = new Map();
      list.forEach(q => {
        // Prefer 'all' period or higher frequency if duplicates exist
        if (!uniqueMap.has(q.id)) {
          uniqueMap.set(q.id, q);
        } else {
          const existing = uniqueMap.get(q.id);
          if (q.periodKey === 'all') {
            uniqueMap.set(q.id, q);
          } else if (q.frequencyNum > existing.frequencyNum) {
            uniqueMap.set(q.id, q);
          }
        }
      });
      list = Array.from(uniqueMap.values());
    }

    // Filter by Difficulty
    if (selectedDifficulty !== 'all') {
      list = list.filter(q => q.difficulty.toLowerCase() === selectedDifficulty.toLowerCase());
    }

    // Filter by Status
    if (selectedStatus !== 'all') {
      list = list.filter(q => {
        const itemStatus = progress[q.id]?.status || 'unsolved';
        if (selectedStatus === 'solved') return itemStatus === 'solved';
        if (selectedStatus === 'unsolved') return itemStatus === 'unsolved';
        if (selectedStatus === 'attempted') return itemStatus === 'attempted';
        if (selectedStatus === 'starred') return Boolean(progress[q.id]?.starred);
        if (selectedStatus === 'notes') return Boolean(progress[q.id]?.notes?.trim());
        return true;
      });
    }

    // Search query (by ID, Title, Difficulty, Company, or Topics)
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      list = list.filter(q => {
        return (
          q.id.toLowerCase().includes(query) ||
          q.title.toLowerCase().includes(query) ||
          q.difficulty.toLowerCase().includes(query) ||
          (q.company && q.company.toLowerCase().includes(query)) ||
          (q.topics && q.topics.toLowerCase().includes(query))
        );
      });
    }

    // Sorting
    list = [...list].sort((a, b) => {
      let valA, valB;
      if (sortField === 'id') {
        valA = parseInt(a.id, 10) || 0;
        valB = parseInt(b.id, 10) || 0;
      } else if (sortField === 'title') {
        valA = a.title.toLowerCase();
        valB = b.title.toLowerCase();
      } else if (sortField === 'acceptance') {
        valA = a.acceptanceNum;
        valB = b.acceptanceNum;
      } else if (sortField === 'frequency') {
        valA = a.frequencyNum;
        valB = b.frequencyNum;
      } else if (sortField === 'difficulty') {
        const diffWeight = { easy: 1, medium: 2, hard: 3 };
        valA = diffWeight[a.difficulty.toLowerCase()] || 2;
        valB = diffWeight[b.difficulty.toLowerCase()] || 2;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [
    questions,
    selectedCompany,
    selectedPeriod,
    selectedDifficulty,
    selectedStatus,
    searchQuery,
    sortField,
    sortDirection,
    progress
  ]);

  // Overall Statistics
  const stats = useMemo(() => {
    // Unique question IDs across the database
    const allUniqueIds = new Set(questions.map(q => q.id));
    const totalCount = allUniqueIds.size || 1;

    let solvedCount = 0;
    let easySolved = 0, mediumSolved = 0, hardSolved = 0;
    let easyTotal = 0, mediumTotal = 0, hardTotal = 0;

    // Deduplicated map for unique difficulty counts
    const idToDiff = new Map();
    questions.forEach(q => {
      if (!idToDiff.has(q.id)) {
        idToDiff.set(q.id, q.difficulty.toLowerCase());
      }
    });

    idToDiff.forEach((diff, id) => {
      if (diff === 'easy') easyTotal++;
      else if (diff === 'medium') mediumTotal++;
      else if (diff === 'hard') hardTotal++;

      if (progress[id]?.status === 'solved') {
        solvedCount++;
        if (diff === 'easy') easySolved++;
        else if (diff === 'medium') mediumSolved++;
        else if (diff === 'hard') hardSolved++;
      }
    });

    const percent = Math.round((solvedCount / totalCount) * 100) || 0;

    return {
      totalCount,
      solvedCount,
      percent,
      easy: { solved: easySolved, total: easyTotal },
      medium: { solved: mediumSolved, total: mediumTotal },
      hard: { solved: hardSolved, total: hardTotal }
    };
  }, [questions, progress]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCompany, selectedPeriod, selectedDifficulty, selectedStatus, searchQuery, itemsPerPage]);

  // Paginated questions
  const totalPages = Math.ceil(filteredQuestions.length / itemsPerPage) || 1;
  const paginatedQuestions = useMemo(() => {
    if (itemsPerPage === -1) return filteredQuestions;
    const start = (currentPage - 1) * itemsPerPage;
    return filteredQuestions.slice(start, start + itemsPerPage);
  }, [filteredQuestions, currentPage, itemsPerPage]);

  // Pick Random Question
  const handlePickRandom = () => {
    if (filteredQuestions.length === 0) {
      showToast('No questions match the current filters!');
      return;
    }
    // Prefer unsolved if possible
    const unsolved = filteredQuestions.filter(q => (progress[q.id]?.status || 'unsolved') !== 'solved');
    const pool = unsolved.length > 0 ? unsolved : filteredQuestions;
    const randomIndex = Math.floor(Math.random() * pool.length);
    const chosen = pool[randomIndex];
    setRandomModalQuestion(chosen);
  };

  // Export progress JSON
  const handleExportProgress = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(progress, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `leetcode-progress-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Progress exported successfully!');
  };

  // Import progress JSON
  const handleImportProgress = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const toSave = parsed.solved || parsed;
        setProgress(toSave);
        await fetch(`${API_BASE}/progress/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ solved: toSave })
        });
        showToast('Progress restored successfully from file!');
      } catch (err) {
        alert('Invalid JSON file format');
      }
    };
    reader.readAsText(file);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a', color: '#eff1f6' }}>
        <div style={{ textAlign: 'center' }}>
          <RefreshCw className="animate-spin" size={36} style={{ color: '#00b8a3', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Loading DSA Questions...</h2>
          <p style={{ color: '#8c8c8c', fontSize: '14px', marginTop: '6px' }}>Scanning company directories and CSV files</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#1a1a1a', color: '#eff1f6' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: '#2cbb5d',
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: 500,
          fontSize: '14px',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <CheckCircle2 size={18} />
          {toastMessage}
        </div>
      )}

      {/* Left Sidebar: AI Interview Coach */}
      <ChatSidebar
        isOpen={isChatOpen}
        onToggle={() => setIsChatOpen(!isChatOpen)}
        externalQuery={externalChatQuery}
        onClearExternalQuery={() => setExternalChatQuery(null)}
      />

      {/* Main Content Area */}
      <div style={{ flex: 1, minWidth: 0, overflowX: 'hidden' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '16px 20px 60px' }}>
          
          {/* Company & Timeframe Bar */}
          <div style={{
            background: '#222222',
            border: '1px solid #2e2e2e',
            borderRadius: '12px',
            padding: '12px 16px',
            marginBottom: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
          {/* Company Selector */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#8c8c8c', display: 'flex', alignItems: 'center', gap: '5px', minWidth: '80px' }}>
                <Building2 size={14} /> Company:
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                <button
                  onClick={() => setSelectedCompany('all')}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '20px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    border: 'none',
                    background: selectedCompany === 'all' ? '#ffffff' : '#2d2d2d',
                    color: selectedCompany === 'all' ? '#1a1a1a' : '#c5c5c5',
                    transition: 'all 0.15s'
                  }}
                >
                  All ({companies.length})
                </button>
                {topCompanies.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCompany(c.id)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '20px',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      border: 'none',
                      background: selectedCompany === c.id ? '#ffffff' : '#2d2d2d',
                      color: selectedCompany === c.id ? '#1a1a1a' : '#c5c5c5',
                      transition: 'all 0.15s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>{c.name}</span>
                    <span style={{
                      fontSize: '11px',
                      opacity: 0.75,
                      background: selectedCompany === c.id ? '#e0e0e0' : '#3d3d3d',
                      padding: '1px 6px',
                      borderRadius: '10px'
                    }}>
                      {c.uniqueQuestions}
                    </span>
                  </button>
                ))}
                {!isSelectedInTop && selectedCompanyObj && (
                  <button
                    onClick={() => setSelectedCompany(selectedCompanyObj.id)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '20px',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      border: 'none',
                      background: '#ffffff',
                      color: '#1a1a1a',
                      transition: 'all 0.15s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>{selectedCompanyObj.name}</span>
                    <span style={{
                      fontSize: '11px',
                      opacity: 0.75,
                      background: '#e0e0e0',
                      padding: '1px 6px',
                      borderRadius: '10px'
                    }}>
                      {selectedCompanyObj.uniqueQuestions}
                    </span>
                  </button>
                )}

                {/* Dropdown with all 467 companies */}
                <select
                  value={selectedCompany}
                  onChange={(e) => setSelectedCompany(e.target.value)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '8px',
                    background: '#222222',
                    border: '1px solid #3d3d3d',
                    color: '#e5e7eb',
                    fontSize: '12px',
                    cursor: 'pointer',
                    outline: 'none',
                    maxWidth: '190px'
                  }}
                  title="Browse all 467+ companies"
                >
                  <option value="all">More companies ({companies.length})...</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.uniqueQuestions})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Action Buttons (Rescan Folders & Stats) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => fetchData(true)}
                className="btn btn-secondary"
                title="Rescan current folder for new company folders or updated CSVs"
                disabled={refreshing}
                style={{ fontSize: '12px', padding: '4px 10px' }}
              >
                <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                <span>{refreshing ? 'Scanning...' : 'Rescan Folders'}</span>
              </button>

              <button
                onClick={() => setShowStatsModal(true)}
                className="btn btn-secondary"
                title="View detailed stats and export/import progress"
                style={{ fontSize: '12px', padding: '4px 10px' }}
              >
                <BarChart2 size={13} />
                <span>Stats & Backup</span>
              </button>
            </div>
          </div>

          {/* Timeframe / Period Selector */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', borderTop: '1px solid #2a2a2a', paddingTop: '10px' }}>
            <span style={{ fontSize: '13px', color: '#8c8c8c', display: 'flex', alignItems: 'center', gap: '5px', minWidth: '90px' }}>
              <Clock size={14} /> Timeframe:
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              <button
                onClick={() => setSelectedPeriod('all')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  border: selectedPeriod === 'all' ? '1px solid #3b82f6' : '1px solid #333',
                  background: selectedPeriod === 'all' ? '#1e293b' : '#262626',
                  color: selectedPeriod === 'all' ? '#60a5fa' : '#a0a0a0'
                }}
              >
                All Time (all.csv)
              </button>
              {availablePeriods.map(p => (
                <button
                  key={p.key}
                  onClick={() => setSelectedPeriod(p.key)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    border: selectedPeriod === p.key ? '1px solid #3b82f6' : '1px solid #333',
                    background: selectedPeriod === p.key ? '#1e293b' : '#262626',
                    color: selectedPeriod === p.key ? '#60a5fa' : '#a0a0a0'
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* LeetCode Style Control Bar (Directly Matching the User's Screenshot) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          gap: '12px',
          flexWrap: 'wrap'
        }}>
          {/* Left Controls: Search, Sort, Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 320px' }}>
            {/* Sidebar Open/Close Toggle Button */}
            <button
              onClick={() => setIsChatOpen(!isChatOpen)}
              className="btn-icon"
              title={isChatOpen ? 'Close AI Chat Sidebar' : 'Open AI Chat Sidebar'}
              style={{
                borderRadius: '8px',
                width: '36px',
                height: '36px',
                background: isChatOpen ? '#1e293b' : '#262626',
                borderColor: isChatOpen ? '#3b82f6' : '#333333',
                color: isChatOpen ? '#60a5fa' : '#a0a0a0',
                flexShrink: 0
              }}
            >
              {isChatOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
            </button>

            {/* Search Input Box */}
            <div style={{
              position: 'relative',
              width: '100%',
              maxWidth: '320px',
              display: 'flex',
              alignItems: 'center'
            }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: '12px',
                  color: '#8c8c8c',
                  pointerEvents: 'none'
                }}
              />
              <input
                type="text"
                placeholder="Search questions"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  background: '#262626',
                  border: '1px solid #333333',
                  borderRadius: '8px',
                  padding: '9px 36px 9px 36px',
                  color: '#eff1f6',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.15s ease'
                }}
                onFocus={(e) => (e.target.style.borderColor = '#4f46e5')}
                onBlur={(e) => (e.target.style.borderColor = '#333333')}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    background: 'none',
                    border: 'none',
                    color: '#8c8c8c',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Sort Toggle Button (up-down arrows from screenshot) */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                className={`btn-icon ${showSortMenu ? 'active' : ''}`}
                title="Sort options"
                style={{ borderRadius: '8px', width: '36px', height: '36px' }}
              >
                <ArrowUpDown size={17} />
              </button>

              {/* Sort Menu Dropdown */}
              {showSortMenu && (
                <div
                  style={{
                    position: 'absolute',
                    top: '44px',
                    left: 0,
                    background: '#222222',
                    border: '1px solid #383838',
                    borderRadius: '8px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                    zIndex: 100,
                    width: '200px',
                    padding: '6px'
                  }}
                >
                  <div style={{ fontSize: '11px', color: '#8c8c8c', padding: '6px 10px', fontWeight: 600, textTransform: 'uppercase' }}>
                    Sort Questions By
                  </div>
                  {[
                    { label: 'Problem # (ID)', field: 'id' },
                    { label: 'Title (A-Z)', field: 'title' },
                    { label: 'Acceptance Rate', field: 'acceptance' },
                    { label: 'Frequency Rate', field: 'frequency' },
                    { label: 'Difficulty', field: 'difficulty' }
                  ].map(item => (
                    <div
                      key={item.field}
                      onClick={() => {
                        if (sortField === item.field) {
                          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField(item.field);
                          setSortDirection(item.field === 'id' || item.field === 'title' ? 'asc' : 'desc');
                        }
                        setShowSortMenu(false);
                      }}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: sortField === item.field ? '#2c2c2c' : 'transparent',
                        color: sortField === item.field ? '#ffffff' : '#c5c5c5'
                      }}
                    >
                      <span>{item.label}</span>
                      {sortField === item.field && (
                        <span style={{ fontSize: '11px', color: '#00b8a3' }}>
                          {sortDirection === 'asc' ? '↑ Asc' : '↓ Desc'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Filter Toggle Button (funnel icon from screenshot) */}
            <button
              onClick={() => setShowFilterDrawer(!showFilterDrawer)}
              className={`btn-icon ${showFilterDrawer ? 'active' : ''}`}
              title="Toggle filters drawer"
              style={{ borderRadius: '8px', width: '36px', height: '36px' }}
            >
              <Filter size={17} />
            </button>
          </div>

          {/* Quick Difficulty Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {['all', 'Easy', 'Medium', 'Hard'].map(diff => {
              const isActive = selectedDifficulty.toLowerCase() === diff.toLowerCase();
              let color = '#c5c5c5';
              if (diff === 'Easy') color = '#00b8a3';
              if (diff === 'Medium') color = '#ffc01e';
              if (diff === 'Hard') color = '#ff375f';

              return (
                <button
                  key={diff}
                  onClick={() => setSelectedDifficulty(diff === 'all' ? 'all' : diff)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    border: '1px solid',
                    borderColor: isActive ? color : '#333333',
                    background: isActive ? (diff === 'all' ? '#333333' : '#242424') : '#1e1e1e',
                    color: isActive ? color : '#8c8c8c',
                    transition: 'all 0.12s'
                  }}
                >
                  {diff === 'all' ? 'All Diff.' : diff === 'Medium' ? 'Med.' : diff}
                </button>
              );
            })}
          </div>

          {/* Right Controls: Solved Progress Ring + Random Button (from screenshot!) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            
            {/* Solved Ring from screenshot: "441/4095 Solved" */}
            <div
              onClick={() => setShowStatsModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: '8px',
                background: '#222222',
                border: '1px solid #2e2e2e',
                transition: 'background 0.15s'
              }}
              title="Click to view detailed progress breakdown"
            >
              {/* Circular SVG Progress Ring */}
              <div style={{ position: 'relative', width: '22px', height: '22px' }}>
                <svg width="22" height="22" viewBox="0 0 36 36">
                  {/* Background track */}
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#383838"
                    strokeWidth="3.5"
                  />
                  {/* Progress stroke */}
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#2cbb5d"
                    strokeWidth="3.5"
                    strokeDasharray={`${stats.percent}, 100`}
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              {/* Text: "X/Y Solved" */}
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#eff1f6', whiteSpace: 'nowrap' }}>
                <span style={{ color: '#2cbb5d' }}>{stats.solvedCount}</span>
                <span style={{ color: '#8c8c8c' }}>/{stats.totalCount} Solved</span>
              </div>
            </div>

            {/* Shuffle / Random Question Button (crossing arrows from screenshot) */}
            <button
              onClick={handlePickRandom}
              className="btn-icon"
              title="Pick a random question from current list"
              style={{ borderRadius: '8px', width: '36px', height: '36px', background: '#262626' }}
            >
              <Shuffle size={17} style={{ color: '#00b8a3' }} />
            </button>
          </div>
        </div>

        {/* Expanded Filters Drawer (when filter button is clicked) */}
        {showFilterDrawer && (
          <div style={{
            background: '#222222',
            border: '1px solid #333333',
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '16px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '20px',
            animation: 'fadeIn 0.15s ease-out'
          }}>
            {/* Status Filter */}
            <div>
              <div style={{ fontSize: '12px', color: '#8c8c8c', marginBottom: '8px', fontWeight: 600 }}>
                STATUS
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { key: 'all', label: 'All' },
                  { key: 'solved', label: '✓ Solved' },
                  { key: 'unsolved', label: '○ Unsolved' },
                  { key: 'attempted', label: '◐ Attempted' },
                  { key: 'starred', label: '★ Starred' },
                  { key: 'notes', label: '📝 Has Notes' }
                ].map(s => (
                  <button
                    key={s.key}
                    onClick={() => setSelectedStatus(s.key)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      border: '1px solid',
                      borderColor: selectedStatus === s.key ? '#2cbb5d' : '#333333',
                      background: selectedStatus === s.key ? '#1c2e22' : '#282828',
                      color: selectedStatus === s.key ? '#2cbb5d' : '#c5c5c5'
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reset All Filters */}
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                onClick={() => {
                  setSelectedCompany('all');
                  setSelectedPeriod('all');
                  setSelectedDifficulty('all');
                  setSelectedStatus('all');
                  setSearchQuery('');
                  setSortField('id');
                  setSortDirection('asc');
                }}
                className="btn btn-secondary"
                style={{ fontSize: '12px', padding: '5px 12px' }}
              >
                <RotateCcw size={13} /> Reset All Filters
              </button>
            </div>
          </div>
        )}

        {/* Question Count Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 4px 10px',
          fontSize: '13px',
          color: '#8c8c8c'
        }}>
          <div>
            Showing <strong style={{ color: '#eff1f6' }}>{filteredQuestions.length}</strong> questions
            {selectedCompany !== 'all' && ` for ${companies.find(c => c.id === selectedCompany)?.name}`}
            {selectedPeriod !== 'all' && ` (${availablePeriods.find(p => p.key === selectedPeriod)?.label})`}
          </div>
          <div>
            Page {currentPage} of {totalPages}
          </div>
        </div>

        {/* Questions Table Container (LeetCode Dark Style) */}
        <div style={{
          background: '#1f1f1f',
          border: '1px solid #2a2a2a',
          borderRadius: '10px',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)'
        }}>
          {/* Table Column Headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '44px 1fr 100px 90px 110px 105px',
            padding: '12px 16px',
            fontSize: '12px',
            fontWeight: 600,
            color: '#8c8c8c',
            borderBottom: '1px solid #2e2e2e',
            background: '#232323',
            userSelect: 'none'
          }}>
            <div>Status</div>
            <div>Title</div>
            <div style={{ textAlign: 'right' }}>Acceptance</div>
            <div style={{ textAlign: 'center' }}>Difficulty</div>
            <div style={{ textAlign: 'center' }}>Frequency</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {/* Table Question Rows */}
          {paginatedQuestions.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#8c8c8c' }}>
              <HelpCircle size={36} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#eff1f6' }}>No questions match your filters</div>
              <div style={{ fontSize: '13px', marginTop: '6px' }}>Try broadening your search query or reset the difficulty/status filters</div>
              <button
                onClick={() => {
                  setSelectedCompany('all');
                  setSelectedPeriod('all');
                  setSelectedDifficulty('all');
                  setSelectedStatus('all');
                  setSearchQuery('');
                }}
                className="btn btn-secondary"
                style={{ marginTop: '16px' }}
              >
                Clear Filters
              </button>
            </div>
          ) : (
            paginatedQuestions.map((q) => {
              const itemProgress = progress[q.id] || {};
              const isSolved = itemProgress.status === 'solved';
              const isAttempted = itemProgress.status === 'attempted';
              const isStarred = Boolean(itemProgress.starred);
              const hasNotes = Boolean(itemProgress.notes?.trim());

              let diffClass = 'badge-medium';
              let diffText = 'Med.';
              if (q.difficulty.toLowerCase() === 'easy') {
                diffClass = 'badge-easy';
                diffText = 'Easy';
              } else if (q.difficulty.toLowerCase() === 'hard') {
                diffClass = 'badge-hard';
                diffText = 'Hard';
              }

              return (
                <div
                  key={`${q.companyId}-${q.periodKey}-${q.id}`}
                  className="question-row"
                  style={{
                    background: isSolved ? 'rgba(44, 187, 93, 0.03)' : undefined
                  }}
                >
                  {/* Status Toggle Icon (matching green checkmark from screenshot) */}
                  <div
                    onClick={(e) => handleToggleStatus(q, e)}
                    style={{
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-start'
                    }}
                    title={
                      isSolved
                        ? 'Solved (Click to set Attempted)'
                        : isAttempted
                        ? 'Attempted (Click to set Unsolved)'
                        : 'Unsolved (Click to set Solved)'
                    }
                  >
                    {isSolved ? (
                      <Check size={18} style={{ color: '#2cbb5d', strokeWidth: 2.8 }} />
                    ) : isAttempted ? (
                      <Circle size={17} style={{ color: '#ffc01e', strokeWidth: 2 }} />
                    ) : (
                      <Circle size={17} style={{ color: '#444444', strokeWidth: 1.5 }} />
                    )}
                  </div>

                  {/* Title & LeetCode Link (e.g. "1. Two Sum") */}
                  <div style={{ minWidth: 0, paddingRight: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' }}>
                      <a
                        href={q.url || `https://leetcode.com/problems/${q.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: '#eff1f6',
                          textDecoration: 'none',
                          fontWeight: 500,
                          fontSize: '14px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#3b82f6')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#eff1f6')}
                        title={`Open ${q.id}. ${q.title} on LeetCode`}
                      >
                        <span>{q.id}. {q.title}</span>
                        <ExternalLink size={12} style={{ opacity: 0.4, flexShrink: 0 }} />
                      </a>

                      {/* Notes Indicator */}
                      {hasNotes && (
                        <span
                          onClick={(e) => handleOpenNote(q, e)}
                          title={`Notes: ${itemProgress.notes.slice(0, 50)}...`}
                          style={{
                            cursor: 'pointer',
                            color: '#38bdf8',
                            display: 'inline-flex',
                            alignItems: 'center'
                          }}
                        >
                          <FileText size={13} />
                        </span>
                      )}

                      {/* Company Tag if viewing All Companies */}
                      {selectedCompany === 'all' && (
                        <span style={{
                          fontSize: '11px',
                          background: '#2b2b2b',
                          color: '#8c8c8c',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          border: '1px solid #333'
                        }}>
                          {q.company}
                        </span>
                      )}

                      {/* Topic Tags */}
                      {q.topicsList && q.topicsList.length > 0 && (
                        <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                          {q.topicsList.slice(0, 2).map((topic, i) => (
                            <span
                              key={i}
                              style={{
                                fontSize: '11px',
                                background: '#1c1917',
                                color: '#a8a29e',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                border: '1px solid #292524'
                              }}
                            >
                              {topic}
                            </span>
                          ))}
                          {q.topicsList.length > 2 && (
                            <span
                              title={q.topicsList.slice(2).join(', ')}
                              style={{
                                fontSize: '10px',
                                color: '#78716c',
                                background: '#141414',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                border: '1px solid #262626',
                                cursor: 'help'
                              }}
                            >
                              +{q.topicsList.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Acceptance % */}
                  <div style={{ textAlign: 'right', color: '#8c8c8c', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                    {q.acceptance}
                  </div>

                  {/* Difficulty (Easy, Med., Hard in respective LeetCode colors) */}
                  <div style={{ textAlign: 'center', fontSize: '13px' }}>
                    <span className={diffClass}>
                      {diffText}
                    </span>
                  </div>

                  {/* Frequency (Segmented Mini Bar / % Meter) */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                    <div style={{
                      width: '64px',
                      height: '5px',
                      background: '#2d2d2d',
                      borderRadius: '3px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min(100, Math.max(8, q.frequencyNum))}%`,
                        background: q.frequencyNum > 70 ? '#ffa116' : q.frequencyNum > 30 ? '#00b8a3' : '#6b7280',
                        borderRadius: '3px'
                      }} />
                    </div>
                    <span style={{ fontSize: '11px', color: '#737373', fontVariantNumeric: 'tabular-nums' }}>
                      {q.frequency}
                    </span>
                  </div>

                  {/* Action Icons (Star / Note / Coach) */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '4px'
                  }}>
                    {/* Ask Coach */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsChatOpen(true);
                        setExternalChatQuery(`Help me analyze problem #${q.id}. ${q.title} (${q.company}, ${q.difficulty}). Give me a progressive hint on the optimal intuition and edge cases without spoiling the full solution.`);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        color: '#10a37f',
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'opacity 0.15s'
                      }}
                      title="Ask Interview Coach for a hint"
                    >
                      <Sparkles size={16} />
                    </button>

                    {/* Star / Bookmark */}
                    <button
                      onClick={(e) => handleToggleStar(q, e)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        color: isStarred ? '#eab308' : '#4b5563',
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'color 0.15s'
                      }}
                      title={isStarred ? 'Unfavorite' : 'Add to Favorites'}
                    >
                      <Star size={16} fill={isStarred ? '#eab308' : 'none'} />
                    </button>

                    {/* Note Drawer */}
                    <button
                      onClick={(e) => handleOpenNote(q, e)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        color: hasNotes ? '#38bdf8' : '#4b5563',
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'color 0.15s'
                      }}
                      title="Add / Edit interview notes"
                    >
                      <FileText size={16} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination Footer */}
        {filteredQuestions.length > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '20px',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            {/* Items Per Page */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#8c8c8c' }}>
              <span>Show per page:</span>
              {[25, 50, 100, 200].map(cnt => (
                <button
                  key={cnt}
                  onClick={() => setItemsPerPage(cnt)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    border: '1px solid',
                    borderColor: itemsPerPage === cnt ? '#3b82f6' : '#333333',
                    background: itemsPerPage === cnt ? '#1e293b' : '#262626',
                    color: itemsPerPage === cnt ? '#60a5fa' : '#c5c5c5'
                  }}
                >
                  {cnt}
                </button>
              ))}
            </div>

            {/* Page Navigation */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="btn btn-secondary"
                style={{ padding: '6px 10px', opacity: currentPage === 1 ? 0.4 : 1 }}
              >
                <ChevronLeft size={16} /> Prev
              </button>
              
              <span style={{ fontSize: '13px', color: '#eff1f6', padding: '0 8px' }}>
                Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
              </span>

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="btn btn-secondary"
                style={{ padding: '6px 10px', opacity: currentPage === totalPages ? 0.4 : 1 }}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Note Modal */}
      {activeNoteModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: '#222222',
            border: '1px solid #383838',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '560px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            overflow: 'hidden',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #333',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#eff1f6' }}>
                  #{activeNoteModal.id}. {activeNoteModal.title}
                </h3>
                <span style={{ fontSize: '12px', color: '#8c8c8c' }}>
                  Interview practice notes & complexity approach
                </span>
              </div>
              <button
                onClick={() => setActiveNoteModal(null)}
                style={{ background: 'none', border: 'none', color: '#8c8c8c', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px' }}>
              <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '13px', color: '#8c8c8c' }}>Mark as:</span>
                {['unsolved', 'attempted', 'solved'].map(st => {
                  const currentSt = progress[activeNoteModal.id]?.status || 'unsolved';
                  return (
                    <button
                      key={st}
                      onClick={() => {
                        const updated = {
                          ...progress,
                          [activeNoteModal.id]: {
                            ...(progress[activeNoteModal.id] || {}),
                            status: st,
                            updatedAt: new Date().toISOString()
                          }
                        };
                        setProgress(updated);
                        fetch(`${API_BASE}/progress/status`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: activeNoteModal.id, status: st })
                        });
                      }}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        border: '1px solid',
                        borderColor: currentSt === st ? '#2cbb5d' : '#333',
                        background: currentSt === st ? '#192b1e' : '#282828',
                        color: currentSt === st ? '#2cbb5d' : '#c5c5c5'
                      }}
                    >
                      {st.charAt(0).toUpperCase() + st.slice(1)}
                    </button>
                  );
                })}
              </div>

              <textarea
                value={currentNoteText}
                onChange={(e) => setCurrentNoteText(e.target.value)}
                placeholder="Write your solution approach, time/space complexity O(n), edge cases to remember for this company..."
                rows={7}
                style={{
                  width: '100%',
                  background: '#1a1a1a',
                  border: '1px solid #333',
                  borderRadius: '8px',
                  padding: '12px',
                  color: '#eff1f6',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  outline: 'none'
                }}
              />
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '14px 20px',
              borderTop: '1px solid #333',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#1f1f1f'
            }}>
              <a
                href={activeNoteModal.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#3b82f6',
                  fontSize: '13px',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span>Solve on LeetCode</span>
                <ExternalLink size={13} />
              </a>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setActiveNoteModal(null)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNote}
                  className="btn btn-primary"
                >
                  Save Notes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats & Analytics Modal */}
      {showStatsModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: '#222222',
            border: '1px solid #383838',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '560px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            overflow: 'hidden',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #333',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BarChart2 size={20} style={{ color: '#00b8a3' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#eff1f6' }}>
                  Progress & Analytics
                </h3>
              </div>
              <button
                onClick={() => setShowStatsModal(false)}
                style={{ background: 'none', border: 'none', color: '#8c8c8c', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              {/* Overall Progress Bar */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600 }}>Total Solved</span>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#2cbb5d' }}>
                    {stats.solvedCount} / {stats.totalCount} ({stats.percent}%)
                  </span>
                </div>
                <div style={{ height: '8px', background: '#333', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${stats.percent}%`, background: '#2cbb5d', borderRadius: '4px' }} />
                </div>
              </div>

              {/* Difficulty Breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                {/* Easy */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '5px' }}>
                    <span style={{ color: '#00b8a3', fontWeight: 600 }}>Easy</span>
                    <span style={{ color: '#8c8c8c' }}>{stats.easy.solved} / {stats.easy.total}</span>
                  </div>
                  <div style={{ height: '6px', background: '#333', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${(stats.easy.solved / (stats.easy.total || 1)) * 100}%`,
                      background: '#00b8a3'
                    }} />
                  </div>
                </div>

                {/* Medium */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '5px' }}>
                    <span style={{ color: '#ffc01e', fontWeight: 600 }}>Medium</span>
                    <span style={{ color: '#8c8c8c' }}>{stats.medium.solved} / {stats.medium.total}</span>
                  </div>
                  <div style={{ height: '6px', background: '#333', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${(stats.medium.solved / (stats.medium.total || 1)) * 100}%`,
                      background: '#ffc01e'
                    }} />
                  </div>
                </div>

                {/* Hard */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '5px' }}>
                    <span style={{ color: '#ff375f', fontWeight: 600 }}>Hard</span>
                    <span style={{ color: '#8c8c8c' }}>{stats.hard.solved} / {stats.hard.total}</span>
                  </div>
                  <div style={{ height: '6px', background: '#333', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${(stats.hard.solved / (stats.hard.total || 1)) * 100}%`,
                      background: '#ff375f'
                    }} />
                  </div>
                </div>
              </div>

              {/* Backup & Restore in Current Folder */}
              <div style={{
                background: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '14px',
                marginTop: '16px'
              }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#eff1f6', marginBottom: '4px' }}>
                  Local Folder Persistence
                </div>
                <div style={{ fontSize: '12px', color: '#8c8c8c', marginBottom: '12px' }}>
                  Your progress is saved directly to <code style={{ color: '#38bdf8' }}>progress.json</code> in this folder.
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={handleExportProgress}
                    className="btn btn-secondary"
                    style={{ fontSize: '12px' }}
                  >
                    <Download size={13} /> Export Backup (.json)
                  </button>
                  <label
                    className="btn btn-secondary"
                    style={{ fontSize: '12px', cursor: 'pointer' }}
                  >
                    <Upload size={13} /> Restore Backup
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportProgress}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Random Question Picked Modal */}
      {randomModalQuestion && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: '#222222',
            border: '1px solid #383838',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '480px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            padding: '24px',
            textAlign: 'center',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: '#192b1e',
              border: '1px solid #2cbb5d',
              color: '#2cbb5d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <Sparkles size={24} />
            </div>

            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#eff1f6', marginBottom: '6px' }}>
              Random Pick for Practice!
            </h3>
            <p style={{ fontSize: '13px', color: '#8c8c8c', marginBottom: '20px' }}>
              From your selected filters ({randomModalQuestion.company})
            </p>

            <div style={{
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '20px'
            }}>
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
                {randomModalQuestion.id}. {randomModalQuestion.title}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', fontSize: '13px' }}>
                <span className={
                  randomModalQuestion.difficulty.toLowerCase() === 'easy'
                    ? 'badge-easy'
                    : randomModalQuestion.difficulty.toLowerCase() === 'hard'
                    ? 'badge-hard'
                    : 'badge-medium'
                }>
                  {randomModalQuestion.difficulty}
                </span>
                <span style={{ color: '#8c8c8c' }}>Acceptance: {randomModalQuestion.acceptance}</span>
                <span style={{ color: '#8c8c8c' }}>Freq: {randomModalQuestion.frequency}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                onClick={() => setRandomModalQuestion(null)}
                className="btn btn-secondary"
              >
                Close
              </button>
              <a
                href={randomModalQuestion.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setRandomModalQuestion(null)}
                className="btn btn-primary"
                style={{ textDecoration: 'none' }}
              >
                <span>Solve on LeetCode</span>
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
