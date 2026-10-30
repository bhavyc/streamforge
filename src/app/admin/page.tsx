'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  Users,
  Video,
  HardDrive,
  RefreshCw,
  LogOut,
  ArrowLeft,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  Activity,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Cpu,
  Sun,
  Moon,
  Search,
  Zap,
} from 'lucide-react';
import { AnalyticsSummary, VisitRecord } from '@/lib/analytics';

interface AdminStatsResponse {
  success: boolean;
  analytics: AnalyticsSummary;
  system: {
    uptimeSeconds: number;
    redisConnected: boolean;
    queue: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
      engine: string;
    };
    memoryUsageMb: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
    };
  };
}

export default function AdminPage() {
  // Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('streamforge_admin_theme') as 'light' | 'dark' | null;
      const initial = saved || 'dark';
      setTheme(initial);
      document.documentElement.setAttribute('data-theme', initial);
    } catch {
      setTheme('dark');
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    try {
      localStorage.setItem('streamforge_admin_theme', next);
      document.documentElement.setAttribute('data-theme', next);
    } catch {}
  };

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [adminEmail, setAdminEmail] = useState('bhavyc888@gmail.com');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Data state
  const [data, setData] = useState<AdminStatsResponse | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'visitors' | 'tools' | 'system'>('overview');

  // Check auth on mount
  useEffect(() => {
    fetch('/api/admin/login')
      .then((res) => res.json())
      .then((json) => {
        if (json.authenticated) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
      })
      .catch(() => {
        setIsAuthenticated(false);
      });
  }, []);

  // Fetch admin stats
  const fetchStats = useCallback(async () => {
    setLoadingData(true);
    try {
      const res = await fetch('/api/admin/stats');
      if (res.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      const json = await res.json();
      if (json.success) {
        setData(json);
        setLastRefreshed(new Date());
      }
    } catch (err) {
      console.error('Failed to fetch admin stats:', err);
    } finally {
      setLoadingData(false);
    }
  }, []);

  // Fetch stats when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchStats();
      const interval = setInterval(fetchStats, 20000); // 20s auto-refresh
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, fetchStats]);

  // Login handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: adminEmail,
          password: adminPassword,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setIsAuthenticated(true);
      } else {
        setLoginError(json.error || 'Authentication failed. Please check your credentials.');
      }
    } catch {
      setLoginError('Server network error. Please try again.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Logout handler
  const handleLogout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } catch {}
    setIsAuthenticated(false);
    setData(null);
    setAdminPassword('');
  };

  // Format relative time
  const formatTimeAgo = (isoDate: string) => {
    try {
      const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
      if (diff < 15) return 'Just now';
      if (diff < 60) return `${diff}s ago`;
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return `${Math.floor(diff / 86400)}d ago`;
    } catch {
      return isoDate;
    }
  };

  // Filter visitors by search
  const filteredVisits = (data?.analytics.recentVisits || []).filter((v) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      v.ip.toLowerCase().includes(term) ||
      v.referrer.toLowerCase().includes(term) ||
      v.browser.toLowerCase().includes(term) ||
      v.os.toLowerCase().includes(term) ||
      v.device.toLowerCase().includes(term) ||
      (v.country && v.country.toLowerCase().includes(term))
    );
  });

  // Calculate tool total
  const toolBreakdown = data?.analytics.toolsBreakdown || {};
  const totalToolUsage = Object.values(toolBreakdown).reduce((a, b) => a + b, 0) || 1;

  // Peak daily views for chart scaling
  const dailyHistory = data?.analytics.dailyHistory || [];
  const maxDayVisits = Math.max(1, ...dailyHistory.map((d) => d.visits));

  // Render Login Screen
  if (isAuthenticated === false) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary)',
          padding: '24px',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <div
          className="glass-panel"
          style={{
            width: '100%',
            maxWidth: '440px',
            borderRadius: '20px',
            padding: '36px',
            boxShadow: 'var(--shadow-card-hover)',
            border: '1px solid var(--border-glow)',
          }}
        >
          {/* Top Icon & Title */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent-purple) 100%)',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 24px -4px rgba(99, 102, 241, 0.4)',
                marginBottom: '16px',
              }}
            >
              <ShieldCheck size={32} />
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 6px', color: 'var(--text-main)' }}>
              StreamForge Admin
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-dim)', margin: 0 }}>
              Real-time traffic analytics, visitor logs & server telemetry
            </p>
          </div>

          {loginError && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: 'var(--danger-subtle)',
                color: 'var(--danger)',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '20px',
                border: '1px solid rgba(220, 38, 38, 0.2)',
              }}
            >
              <AlertCircle size={16} />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '18px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-main)',
                  marginBottom: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Admin Email
              </label>
              <input
                type="email"
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="bhavyc888@gmail.com"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-inner)',
                  color: 'var(--text-main)',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-main)',
                  marginBottom: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Admin Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Enter admin password"
                  style={{
                    width: '100%',
                    padding: '12px 42px 12px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-inner)',
                    color: 'var(--text-main)',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-dim)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '14px',
                fontWeight: 700,
                borderRadius: '10px',
                justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(99, 102, 241, 0.35)',
              }}
            >
              {loginLoading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>Verifying credentials...</span>
                </>
              ) : (
                <>
                  <Lock size={16} />
                  <span>Access Admin Console</span>
                </>
              )}
            </button>
          </form>

          <div style={{ marginTop: '24px', textAlign: 'center' }}>
            <a
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                color: 'var(--text-dim)',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              <ArrowLeft size={14} />
              <span>Back to StreamForge Studio</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Loading skeleton while initial check
  if (isAuthenticated === null) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary)',
          color: 'var(--text-dim)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <RefreshCw size={20} className="animate-spin" />
          <span>Authenticating Admin Session...</span>
        </div>
      </div>
    );
  }

  // Authenticated Admin Dashboard
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        color: 'var(--text-main)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Admin Navbar */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
          backdropFilter: 'blur(16px)',
          padding: '14px 24px',
        }}
      >
        <div
          style={{
            maxWidth: '1400px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          {/* Left branding */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <a
              href="/"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                textDecoration: 'none',
                color: 'var(--text-main)',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent-purple) 100%)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '18px',
                }}
              >
                ⚡
              </div>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 800, lineHeight: 1.2 }}>StreamForge</div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>ADMIN PORTAL</div>
              </div>
            </a>

            {/* Live Indicator */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--success-subtle)',
                color: 'var(--success)',
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: 700,
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'var(--success)',
                  display: 'inline-block',
                }}
              />
              LIVE TRACKING
            </div>
          </div>

          {/* Right actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Admin badge */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--bg-inner)',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                color: 'var(--text-main)',
                fontWeight: 600,
                border: '1px solid var(--border-color)',
              }}
            >
              <ShieldCheck size={14} color="var(--primary)" />
              <span>bhavyc888@gmail.com</span>
            </div>

            {/* Refresh */}
            <button
              onClick={fetchStats}
              disabled={loadingData}
              title="Refresh Analytics"
              className="btn btn-secondary"
              style={{ padding: '8px 12px', fontSize: '12px' }}
            >
              <RefreshCw size={14} className={loadingData ? 'animate-spin' : ''} />
              <span className="hide-mobile">Refresh</span>
            </button>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="btn btn-secondary"
              style={{ padding: '8px 10px' }}
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            {/* Back to Studio */}
            <a
              href="/"
              className="btn btn-secondary"
              style={{ padding: '8px 12px', fontSize: '12px', textDecoration: 'none' }}
            >
              <ArrowLeft size={14} />
              <span className="hide-mobile">Studio</span>
            </a>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="btn btn-secondary"
              style={{
                padding: '8px 12px',
                fontSize: '12px',
                color: 'var(--danger)',
                borderColor: 'rgba(220, 38, 38, 0.25)',
              }}
              title="Sign Out"
            >
              <LogOut size={14} />
              <span className="hide-mobile">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 20px 60px' }}>
        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: '14px',
            marginBottom: '24px',
            overflowX: 'auto',
          }}
        >
          <button
            onClick={() => setActiveTab('overview')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'overview' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'overview' ? '#fff' : 'var(--text-dim)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
            }}
          >
            <TrendingUp size={16} />
            <span>Overview & Analytics</span>
          </button>

          <button
            onClick={() => setActiveTab('visitors')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'visitors' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'visitors' ? '#fff' : 'var(--text-dim)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
            }}
          >
            <Users size={16} />
            <span>Visitor Logs ({data?.analytics.recentVisits.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('tools')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'tools' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'tools' ? '#fff' : 'var(--text-dim)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
            }}
          >
            <Video size={16} />
            <span>Tool Conversions</span>
          </button>

          <button
            onClick={() => setActiveTab('system')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'system' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'system' ? '#fff' : 'var(--text-dim)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
            }}
          >
            <Cpu size={16} />
            <span>System Telemetry</span>
          </button>
        </div>

        {/* 4 PRIMARY METRIC CARDS */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          {/* Card 1: Unique Visitors */}
          <div className="glass-panel" style={{ padding: '20px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dim)' }}>Unique Visitors</span>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'var(--primary-subtle)',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Users size={20} />
              </div>
            </div>
            <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>
              {(data?.analytics.uniqueVisitors || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle2 size={13} />
              <span>+{data?.analytics.todayUniques || 0} unique today</span>
            </div>
          </div>

          {/* Card 2: Total Page Views */}
          <div className="glass-panel" style={{ padding: '20px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dim)' }}>Total Page Views</span>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'var(--accent-subtle)',
                  color: 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Eye size={20} />
              </div>
            </div>
            <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>
              {(data?.analytics.totalVisits || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <TrendingUp size={13} />
              <span>+{data?.analytics.todayVisits || 0} views today</span>
            </div>
          </div>

          {/* Card 3: Video Jobs */}
          <div className="glass-panel" style={{ padding: '20px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dim)' }}>Jobs Transcoded</span>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'rgba(124, 58, 237, 0.12)',
                  color: '#7c3aed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Video size={20} />
              </div>
            </div>
            <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>
              {(data?.analytics.totalJobs || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-dim)', fontWeight: 500 }}>
              Queue Active: {data?.system.queue.active || 0} • Waiting: {data?.system.queue.waiting || 0}
            </div>
          </div>

          {/* Card 4: Bandwidth Saved */}
          <div className="glass-panel" style={{ padding: '20px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dim)' }}>Storage Saved</span>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'var(--success-subtle)',
                  color: 'var(--success)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <HardDrive size={20} />
              </div>
            </div>
            <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>
              {(data?.analytics.totalSavedMB || 0).toFixed(1)} <span style={{ fontSize: '18px', fontWeight: 600 }}>MB</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--success)', fontWeight: 600 }}>
              Zero permanent storage cost
            </div>
          </div>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* 14-Day Traffic Chart */}
            <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '20px',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px', color: 'var(--text-main)' }}>
                    Daily Visitor Trends (Last 14 Days)
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-dim)', margin: 0 }}>
                    Comparing total pageviews vs unique daily visitors
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'var(--primary)' }} />
                    <span style={{ color: 'var(--text-dim)' }}>Pageviews</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'var(--accent)' }} />
                    <span style={{ color: 'var(--text-dim)' }}>Unique Visitors</span>
                  </div>
                </div>
              </div>

              {/* Bar Chart Container */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: '12px',
                  height: '200px',
                  paddingTop: '20px',
                  borderBottom: '1px solid var(--border-color)',
                  overflowX: 'auto',
                }}
              >
                {dailyHistory.map((day, idx) => {
                  const visitHeightPct = maxDayVisits > 0 ? (day.visits / maxDayVisits) * 100 : 0;
                  const uniqueHeightPct = maxDayVisits > 0 ? (day.uniques / maxDayVisits) * 100 : 0;

                  return (
                    <div
                      key={idx}
                      style={{
                        flex: 1,
                        minWidth: '40px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        height: '100%',
                        justifyContent: 'flex-end',
                        position: 'relative',
                      }}
                      title={`${day.label}: ${day.visits} views, ${day.uniques} unique visitors`}
                    >
                      {/* Bars Group */}
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', width: '100%', justifyContent: 'center' }}>
                        {/* Views bar */}
                        <div
                          style={{
                            width: '12px',
                            height: `${Math.max(4, visitHeightPct)}%`,
                            background: 'var(--primary)',
                            borderRadius: '4px 4px 0 0',
                            transition: 'height 0.4s ease',
                          }}
                        />
                        {/* Uniques bar */}
                        <div
                          style={{
                            width: '12px',
                            height: `${Math.max(4, uniqueHeightPct)}%`,
                            background: 'var(--accent)',
                            borderRadius: '4px 4px 0 0',
                            transition: 'height 0.4s ease',
                          }}
                        />
                      </div>

                      {/* X Axis Label */}
                      <span
                        style={{
                          fontSize: '10px',
                          color: 'var(--text-dim)',
                          marginTop: '8px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {day.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Split row: Tool Popularity & Traffic Sources */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                gap: '20px',
              }}
            >
              {/* Tool Popularity */}
              <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px', color: 'var(--text-main)' }}>
                  Tool Conversion Distribution
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {[
                    { key: 'compress', label: 'Video Compressor', color: '#6366f1' },
                    { key: 'extract-audio', label: 'MP3 Audio Extractor', color: '#0284c7' },
                    { key: 'trim', label: 'Video Trimmer', color: '#10b981' },
                    { key: 'mute', label: 'Audio Remover / Muter', color: '#f59e0b' },
                    { key: 'speed', label: 'Speed Changer', color: '#ec4899' },
                    { key: 'gif', label: 'GIF Maker', color: '#8b5cf6' },
                    { key: 'convert', label: 'Format Converter', color: '#3b82f6' },
                  ].map((item) => {
                    const count = toolBreakdown[item.key] || 0;
                    const pct = Math.round((count / totalToolUsage) * 100);

                    return (
                      <div key={item.key}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{item.label}</span>
                          <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>
                            {count} uses ({pct}%)
                          </span>
                        </div>
                        <div
                          style={{
                            height: '8px',
                            background: 'var(--bg-inner)',
                            borderRadius: '4px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              height: '100%',
                              background: item.color,
                              borderRadius: '4px',
                              transition: 'width 0.4s ease',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Quick Traffic Overview */}
              <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                    Recent Visitor Feed
                  </h3>
                  <button
                    onClick={() => setActiveTab('visitors')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    View Full Log →
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(data?.analytics.recentVisits || []).slice(0, 6).map((v) => (
                    <div
                      key={v.id}
                      style={{
                        padding: '10px 12px',
                        background: 'var(--bg-inner)',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {v.device === 'Mobile' ? (
                          <Smartphone size={16} color="var(--primary)" />
                        ) : v.device === 'Tablet' ? (
                          <Tablet size={16} color="var(--accent)" />
                        ) : (
                          <Monitor size={16} color="var(--text-dim)" />
                        )}
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                            {v.browser} on {v.os}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                            Via {v.referrer} • {v.ip}
                          </div>
                        </div>
                      </div>

                      <span style={{ fontSize: '11px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                        {formatTimeAgo(v.timestamp)}
                      </span>
                    </div>
                  ))}

                  {(!data?.analytics.recentVisits || data.analytics.recentVisits.length === 0) && (
                    <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)', fontSize: '13px' }}>
                      No visitor records logged yet. Visits will appear live as users browse the site.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: FULL VISITOR LOGS TABLE */}
        {activeTab === 'visitors' && (
          <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px', color: 'var(--text-main)' }}>
                  Detailed Visitor Activity Log
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-dim)', margin: 0 }}>
                  Showing latest recorded visitor sessions with device & referrer telemetry
                </p>
              </div>

              {/* Search box */}
              <div style={{ position: 'relative', minWidth: '260px' }}>
                <Search
                  size={15}
                  color="var(--text-dim)"
                  style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                />
                <input
                  type="text"
                  placeholder="Filter by IP, referrer, OS, device..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 34px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-inner)',
                    color: 'var(--text-main)',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: '13px',
                }}
              >
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-dim)' }}>
                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>TIME</th>
                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>IP ADDRESS</th>
                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>DEVICE</th>
                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>BROWSER & OS</th>
                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>TRAFFIC SOURCE</th>
                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>PAGE PATH</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVisits.map((v) => (
                    <tr
                      key={v.id}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-inner)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: 'var(--text-dim)', fontSize: '12px' }}>
                        {formatTimeAgo(v.timestamp)}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                        {v.ip}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background:
                              v.device === 'Mobile'
                                ? 'rgba(99, 102, 241, 0.1)'
                                : v.device === 'Tablet'
                                ? 'rgba(2, 132, 199, 0.1)'
                                : 'var(--bg-inner)',
                            color:
                              v.device === 'Mobile'
                                ? 'var(--primary)'
                                : v.device === 'Tablet'
                                ? 'var(--accent)'
                                : 'var(--text-muted)',
                          }}
                        >
                          {v.device === 'Mobile' ? <Smartphone size={12} /> : v.device === 'Tablet' ? <Tablet size={12} /> : <Monitor size={12} />}
                          {v.device}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--text-main)' }}>
                        <div style={{ fontWeight: 600 }}>{v.browser}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{v.os}</div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 500,
                            background: v.referrer.includes('Twitter') || v.referrer.includes('X') ? 'rgba(29, 155, 240, 0.1)' : 'var(--bg-inner)',
                            color: v.referrer.includes('Twitter') || v.referrer.includes('X') ? '#1d9bf0' : 'var(--text-dim)',
                          }}
                        >
                          <Globe size={12} />
                          {v.referrer}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-dim)' }}>
                        {v.path}
                      </td>
                    </tr>
                  ))}

                  {filteredVisits.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>
                        No matching visitor records found for &ldquo;{searchTerm}&rdquo;.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: TOOLS BREAKDOWN */}
        {activeTab === 'tools' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {[
              {
                id: 'compress',
                title: 'Video Compressor',
                desc: 'WhatsApp <16MB/64MB, Email <25MB, Discord & Target size',
                count: toolBreakdown['compress'] || 0,
                color: '#6366f1',
                icon: HardDrive,
              },
              {
                id: 'extract-audio',
                title: 'MP3 Audio Extractor',
                desc: 'Instant 192k/320k sound extractor from videos',
                count: toolBreakdown['extract-audio'] || 0,
                color: '#0284c7',
                icon: Zap,
              },
              {
                id: 'trim',
                title: 'Video Trimmer',
                desc: 'Lossless stream-copy cutter without quality loss',
                count: toolBreakdown['trim'] || 0,
                color: '#10b981',
                icon: Video,
              },
              {
                id: 'mute',
                title: 'Audio Remover / Muter',
                desc: 'Strips noisy background audio with zero re-encoding',
                count: toolBreakdown['mute'] || 0,
                color: '#f59e0b',
                icon: Activity,
              },
              {
                id: 'speed',
                title: 'Video Speed Changer',
                desc: '0.25x Slo-Mo to 2.0x Time-lapse acceleration',
                count: toolBreakdown['speed'] || 0,
                color: '#ec4899',
                icon: TrendingUp,
              },
              {
                id: 'gif',
                title: 'GIF Maker',
                desc: 'Animated looping memes and snippets generator',
                count: toolBreakdown['gif'] || 0,
                color: '#8b5cf6',
                icon: CheckCircle2,
              },
              {
                id: 'convert',
                title: 'Format Converter',
                desc: 'Universal conversion to MP4, WebM, and standard formats',
                count: toolBreakdown['convert'] || 0,
                color: '#3b82f6',
                icon: RefreshCw,
              },
            ].map((tool) => {
              const Icon = tool.icon;
              const pct = Math.round((tool.count / totalToolUsage) * 100);

              return (
                <div key={tool.id} className="glass-panel" style={{ padding: '24px', borderRadius: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '12px',
                        background: `${tool.color}18`,
                        color: tool.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon size={22} />
                    </div>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>{tool.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{tool.desc}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
                    <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-main)' }}>
                      {tool.count.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: tool.color }}>
                      {pct}% of all jobs
                    </div>
                  </div>

                  <div style={{ height: '6px', background: 'var(--bg-inner)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: tool.color, borderRadius: '3px' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* TAB 4: SYSTEM & QUEUE TELEMETRY */}
        {activeTab === 'system' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '20px',
              }}
            >
              {/* RAM Monitor */}
              <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px', color: 'var(--text-main)' }}>
                  Render Free Tier RAM Monitor (512 MB Limit)
                </h3>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-dim)' }}>Resident Set Size (RSS)</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                    {data?.system.memoryUsageMb.rss || 0} MB / 512 MB
                  </span>
                </div>

                <div style={{ height: '10px', background: 'var(--bg-inner)', borderRadius: '5px', overflow: 'hidden', marginBottom: '18px' }}>
                  <div
                    style={{
                      width: `${Math.min(100, (((data?.system.memoryUsageMb.rss || 120) / 512) * 100))}%`,
                      height: '100%',
                      background: (data?.system.memoryUsageMb.rss || 0) > 400 ? 'var(--danger)' : 'var(--success)',
                      borderRadius: '5px',
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-dim)' }}>
                  <span>Heap Used: {data?.system.memoryUsageMb.heapUsed || 0} MB</span>
                  <span>Heap Total: {data?.system.memoryUsageMb.heapTotal || 0} MB</span>
                  <span>Headroom: {512 - (data?.system.memoryUsageMb.rss || 0)} MB</span>
                </div>
              </div>

              {/* Upstash & Queue Status */}
              <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px', color: 'var(--text-main)' }}>
                  Distributed Queue Health
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-dim)' }}>Redis Broker</span>
                    <span style={{ fontWeight: 700, color: data?.system.redisConnected ? 'var(--success)' : 'var(--warning)' }}>
                      {data?.system.redisConnected ? 'Connected (Upstash TLS)' : 'Embedded Queue Mode'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-dim)' }}>Queue Engine</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                      {data?.system.queue.engine || 'BullMQ v6'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-dim)' }}>Server Uptime</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                      {Math.floor((data?.system.uptimeSeconds || 0) / 3600)}h{' '}
                      {Math.floor(((data?.system.uptimeSeconds || 0) % 3600) / 60)}m
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-dim)' }}>Jobs Active / In Progress</span>
                    <span style={{ fontWeight: 700, color: 'var(--primary)' }}>
                      {data?.system.queue.active || 0} active
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-dim)' }}>Jobs Completed</span>
                    <span style={{ fontWeight: 700, color: 'var(--success)' }}>
                      {data?.system.queue.completed || 0} finished
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
