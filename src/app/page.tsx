'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  Video,
  Layers,
  Cpu,
  HardDrive,
  CheckCircle2,
  Clock,
  Play,
  Download,
  Terminal,
  Activity,
  Server,
  Sparkles,
  RefreshCw,
  FileVideo,
  Info,
  Maximize2,
  ChevronRight,
  ExternalLink,
  Sun,
  Moon,
} from 'lucide-react';
import { JobDetailsResponse, VideoRendition, VideoProcessingResult } from '@/lib/types';

export default function HomePage() {
  // Theme state: defaults to modern Light theme
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('streamforge_theme') as 'light' | 'dark' | null;
      const initial = saved || 'light';
      setTheme(initial);
      document.documentElement.setAttribute('data-theme', initial);
    } catch {
      setTheme('light');
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('streamforge_theme', next);
    } catch {}
  };

  // State
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [jobData, setJobData] = useState<JobDetailsResponse | null>(null);
  const [selectedResolution, setSelectedResolution] = useState<string>('720p');
  const [recentJobs, setRecentJobs] = useState<any[]>([]);
  const [queueMetrics, setQueueMetrics] = useState<any>({ waiting: 0, active: 0, completed: 0, failed: 0 });
  const [redisConnected, setRedisConnected] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [showArchModal, setShowArchModal] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Fetch initial queue status and recent jobs
  const fetchDashboardStats = async () => {
    try {
      const [statsRes, jobsRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/jobs'),
      ]);
      const statsJson = await statsRes.json();
      const jobsJson = await jobsRes.json();

      if (statsJson.success) {
        setQueueMetrics(statsJson.queue.metrics);
        setRedisConnected(Boolean(statsJson.redisConnected));
      }
      if (jobsJson.success) {
        setRecentJobs(jobsJson.jobs);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  useEffect(() => {
    fetchDashboardStats();
    const interval = setInterval(fetchDashboardStats, 5000);
    return () => clearInterval(interval);
  }, []);

  // Server-Sent Events (SSE) listener for active job progress
  useEffect(() => {
    if (!currentJobId) return;

    addLog(`Subscribed to real-time telemetry stream for Job ID: ${currentJobId}`);
    const eventSource = new EventSource(`/api/jobs/${currentJobId}/stream`);

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);

        if (payload.error) {
          addLog(`[Error]: ${payload.error}`);
          return;
        }

        setJobData((prev) => ({
          ...(prev || {}),
          id: payload.id,
          status: payload.status,
          progress: payload.progress,
          progressMessage: payload.progressMessage,
          currentStage: payload.currentStage,
          result: payload.result,
        } as JobDetailsResponse));

        if (payload.progressMessage) {
          addLog(`[Worker]: ${payload.progressMessage} (${payload.progress}%)`);
        }

        if (payload.status === 'completed') {
          addLog(` Transcoding completed successfully for Job: ${payload.id}`);
          eventSource.close();
          fetchDashboardStats();
        } else if (payload.status === 'failed') {
          addLog(` Job failed: ${payload.failedReason || 'Unknown error'}`);
          eventSource.close();
          fetchDashboardStats();
        }
      } catch (err) {
        console.error('SSE Parse Error:', err);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [currentJobId]);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-40), `[${time}] ${msg}`]);
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (selected: File) => {
    if (!selected.type.startsWith('video/') && !selected.name.match(/\.(mp4|mov|mkv|webm|avi|flv)$/i)) {
      alert('Please upload a valid video file (MP4, WebM, MOV, MKV, AVI).');
      return;
    }
    setFile(selected);
    addLog(`Selected input video: ${selected.name} (${(selected.size / (1024 * 1024)).toFixed(2)} MB)`);
  };

  // Upload and enqueue job
  const handleUpload = async () => {
    if (!file) return;

    try {
      setIsUploading(true);
      addLog(`Initiating multipart upload to /api/upload...`);

      const formData = new FormData();
      formData.append('video', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      addLog(`HTTP 202 Accepted. Job enqueued to BullMQ Redis Queue with ID: ${data.jobId}`);
      setCurrentJobId(data.jobId);
      setJobData({
        id: data.jobId,
        status: 'waiting',
        progress: 0,
        progressMessage: 'Job queued in Redis, awaiting available worker...',
        data: {
          jobId: data.jobId,
          originalFileName: file.name,
          rawFilePath: '',
          uploadedAt: new Date().toISOString(),
        },
        timestamp: Date.now(),
      });
      fetchDashboardStats();
    } catch (err: any) {
      addLog(`[Upload Error]: ${err.message}`);
      alert(`Upload error: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };


  // Helper to load a past job for inspection
  const loadJob = async (jobId: string) => {
    try {
      addLog(`Loading details for past Job: ${jobId}`);
      const res = await fetch(`/api/jobs/${jobId}`);
      const json = await res.json();
      if (json.success) {
        setCurrentJobId(jobId);
        setJobData(json.job);
        addLog(`Loaded Job ${jobId} (Status: ${json.job.status})`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Select rendition URL
  const activeResult: VideoProcessingResult | undefined = jobData?.result || jobData?.returnvalue;
  const activeRenditions: VideoRendition[] = activeResult?.renditions || [];
  const currentRendition =
    activeRenditions.find((r) => r.resolution === selectedResolution) ||
    activeRenditions[0];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <header
        style={{
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        <div
          style={{
            maxWidth: '1400px',
            margin: '0 auto',
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          {/* Logo & Subtitle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #4f46e5 0%, #0284c7 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 15px rgba(79, 70, 229, 0.35)',
              }}
            >
              <Video size={22} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text-main)' }}>
                  Stream<span className="gradient-text">Forge</span>
                </h1>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '20px',
                    background: 'var(--primary-subtle)',
                    color: 'var(--primary)',
                    border: '1px solid var(--primary-border)',
                  }}
                >
                  v2.4 Media Engine
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Distributed Asynchronous Video Transcoding & HLS Pipeline
              </p>
            </div>
          </div>

          {/* Right Status Badges, Architecture trigger & Theme Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '30px',
                background: 'var(--bg-inner)',
                border: '1px solid var(--border-color)',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              <span className="pulse-indicator" />
              <span style={{ color: 'var(--text-muted)' }}>Queue Worker:</span>
              <span style={{ color: 'var(--success)', fontWeight: 600 }}>Active</span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '30px',
                background: 'var(--bg-inner)',
                border: '1px solid var(--border-color)',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              <HardDrive size={14} color={redisConnected ? 'var(--accent)' : 'var(--success)'} />
              <span style={{ color: 'var(--text-muted)' }}>Queue Engine:</span>
              <span style={{ color: redisConnected ? 'var(--accent)' : 'var(--success)', fontWeight: 600 }}>
                {redisConnected ? 'Redis BullMQ' : 'Async Worker (Active)'}
              </span>
            </div>

            <button
              id="architecture-btn"
              onClick={() => setShowArchModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '30px',
                background: 'var(--primary-subtle)',
                border: '1px solid var(--primary-border)',
                color: 'var(--primary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <Layers size={14} />
              System Architecture
            </button>

            <button
              id="theme-toggle-btn"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '30px',
                background: 'var(--bg-inner)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-main)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {theme === 'light' ? (
                <>
                  <Moon size={14} color="#4f46e5" />
                  <span>Dark Mode</span>
                </>
              ) : (
                <>
                  <Sun size={14} color="#f59e0b" />
                  <span>Light Mode</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px', flex: 1, width: '100%' }}>
        {/* Top Metric Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          <div className="glass-panel" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>
                Active Transcodes
              </span>
              <Activity size={18} color="var(--primary)" />
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '8px', color: 'var(--primary)' }}>
              {queueMetrics.active}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
              Currently in FFmpeg processing
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>
                Waiting in Queue
              </span>
              <Clock size={18} color="var(--warning)" />
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '8px', color: 'var(--warning)' }}>
              {queueMetrics.waiting}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
              Redis BullMQ priority queue
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>
                Completed Assets
              </span>
              <CheckCircle2 size={18} color="var(--success)" />
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '8px', color: 'var(--success)' }}>
              {queueMetrics.completed}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
              Multi-bitrate MP4s & thumbnails
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>
                Storage Adapter
              </span>
              <Server size={18} color="var(--accent)" />
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '8px', color: 'var(--accent)' }}>
              Local / AWS S3
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
              Pluggable object storage layer
            </div>
          </div>
        </div>

        {/* Studio Layout: Left column (Uploader & Pipeline), Right column (Player & Output) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 1fr) minmax(450px, 1.3fr)', gap: '24px' }}>
          {/* LEFT COLUMN: Upload & Progress Pipeline */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Upload Box */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
                  <Upload size={18} color="var(--primary)" />
                  Media Ingestion Studio
                </h2>
                <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                  Non-blocking HTTP 202
                </span>
              </div>

              {/* Drag and drop zone */}
              <div
                id="drop-zone"
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragActive ? 'var(--primary)' : 'var(--drop-border)'}`,
                  background: dragActive ? 'var(--drop-active)' : 'var(--drop-bg)',
                  borderRadius: '14px',
                  padding: '32px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                }}
              >
                <input
                  id="video-file-input"
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />

                <div
                  style={{
                    width: '54px',
                    height: '54px',
                    borderRadius: '50%',
                    background: 'var(--primary-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 14px auto',
                    border: '1px solid var(--primary-border)',
                  }}
                >
                  <FileVideo size={26} color="var(--primary)" />
                </div>

                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                  {file ? file.name : 'Drag & drop your video file here'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {file
                    ? `${(file.size / (1024 * 1024)).toFixed(2)} MB • Ready for queuing`
                    : 'Supports MP4, MOV, MKV, WebM, AVI up to 500MB'}
                </div>
              </div>

              {/* Upload CTA */}
              <div style={{ marginTop: '16px' }}>
                <button
                  id="upload-button"
                  onClick={handleUpload}
                  disabled={!file || isUploading}
                  className="gradient-btn"
                  style={{
                    width: '100%',
                    padding: '13px 20px',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    cursor: !file || isUploading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isUploading ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      Uploading & Enqueuing...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      Dispatch to Transcode Queue
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Pipeline Stage Tracker */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
                  <Cpu size={18} color="var(--accent)" />
                  Distributed Pipeline Monitor
                </h3>
                {jobData && (
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '3px 10px',
                      borderRadius: '12px',
                      background:
                        jobData.status === 'completed'
                          ? 'var(--success-subtle)'
                          : jobData.status === 'failed'
                          ? 'var(--danger-subtle)'
                          : 'var(--primary-subtle)',
                      color:
                        jobData.status === 'completed'
                          ? 'var(--success)'
                          : jobData.status === 'failed'
                          ? 'var(--danger)'
                          : 'var(--primary)',
                      border: '1px solid currentColor',
                      textTransform: 'uppercase',
                      fontWeight: 700,
                    }}
                  >
                    {jobData.status}
                  </span>
                )}
              </div>

              {jobData ? (
                <div>
                  {/* Progress Bar */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {jobData.progressMessage || 'Processing pipeline stages...'}
                      </span>
                      <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{jobData.progress}%</span>
                    </div>

                    <div
                      style={{
                        width: '100%',
                        height: '10px',
                        background: 'var(--bg-inner)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        className={jobData.status === 'active' ? 'progress-shimmer' : ''}
                        style={{
                          width: `${jobData.progress}%`,
                          height: '100%',
                          background:
                            jobData.status === 'completed'
                              ? 'linear-gradient(90deg, #10b981, #059669)'
                              : jobData.status === 'failed'
                              ? '#ef4444'
                              : 'linear-gradient(90deg, #4f46e5, #0284c7)',
                          borderRadius: '6px',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>

                  {/* 5-Step Visual Stepper */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {[
                      {
                        title: '1. Multipart Raw Ingestion',
                        desc: 'Stored in /storage/raw with UUID deduplication',
                        done: true,
                        active: false,
                      },
                      {
                        title: '2. FFprobe Codec & Stream Inspection',
                        desc: 'Extracting dimensions, audio/video codecs & FPS',
                        done: jobData.progress >= 10,
                        active: jobData.progress > 0 && jobData.progress < 10,
                      },
                      {
                        title: '3. Multi-Bitrate Transcoding',
                        desc: '1080p, 720p, 480p, 360p with Faststart Web flag',
                        done: jobData.progress >= 85,
                        active: jobData.progress >= 10 && jobData.progress < 85,
                      },
                      {
                        title: '4. Keyframe Snapshots & Animated GIF',
                        desc: 'Generating 4 timecode thumbnails + 2.5s teaser clip',
                        done: jobData.progress >= 95,
                        active: jobData.progress >= 85 && jobData.progress < 95,
                      },
                      {
                        title: '5. Asset Publishing & Webhook Dispatch',
                        desc: 'Finalized in storage & client notified via SSE',
                        done: jobData.progress >= 100,
                        active: jobData.progress >= 95 && jobData.progress < 100,
                      },
                    ].map((step, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '10px 14px',
                          borderRadius: '10px',
                          background: step.active
                            ? 'var(--primary-subtle)'
                            : step.done
                            ? 'var(--success-subtle)'
                            : 'var(--bg-inner)',
                          border: `1px solid ${
                            step.active
                              ? 'var(--primary-border)'
                              : step.done
                              ? 'var(--success)'
                              : 'var(--border-color)'
                          }`,
                        }}
                      >
                        <div
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: step.done
                              ? 'var(--success)'
                              : step.active
                              ? 'var(--primary)'
                              : 'var(--border-color)',
                            color: step.done || step.active ? '#ffffff' : 'var(--text-dim)',
                            fontSize: '11px',
                            fontWeight: 700,
                          }}
                        >
                          {step.done ? '✓' : idx + 1}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontSize: '13px',
                              fontWeight: 600,
                              color: step.active ? 'var(--primary)' : step.done ? 'var(--text-main)' : 'var(--text-dim)',
                            }}
                          >
                            {step.title}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{step.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    padding: '30px 20px',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '13px',
                  }}
                >
                  <Cpu size={32} color="var(--text-dim)" style={{ margin: '0 auto 10px auto' }} />
                  Select or upload a video above to observe the real-time background worker stages.
                </div>
              )}
            </div>

            {/* Live Terminal Output */}
            <div className="glass-panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Terminal size={16} color="#38bdf8" />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>
                    Worker Telemetry Log
                  </span>
                </div>
                <button
                  onClick={() => setLogs([])}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-dim)',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Clear Log
                </button>
              </div>

              <div
                className="terminal-window"
                style={{
                  height: '160px',
                  overflowY: 'auto',
                  padding: '12px',
                }}
              >
                {logs.length === 0 ? (
                  <div style={{ color: '#475569', fontStyle: 'italic' }}>
                    // Worker pipeline listening on Redis queue: video-transcode-pipeline...
                  </div>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} style={{ marginBottom: '4px', wordBreak: 'break-all' }}>
                      {log}
                    </div>
                  ))
                )}
                <div ref={terminalEndRef} />
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Media Player, Renditions & Asset Gallery */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Player Container */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
                  <Play size={18} color="var(--success)" />
                  Adaptive Rendition Player
                </h3>
                {currentRendition && (
                  <span
                    style={{
                      fontSize: '12px',
                      padding: '3px 10px',
                      borderRadius: '8px',
                      background: 'var(--primary-subtle)',
                      border: '1px solid var(--primary-border)',
                      color: 'var(--primary)',
                      fontWeight: 600,
                    }}
                  >
                    Streaming: {currentRendition.resolution} ({currentRendition.bitrate})
                  </span>
                )}
              </div>

              {/* Video Player */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '16/9',
                  background: currentRendition ? '#000000' : 'var(--bg-inner)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {currentRendition ? (
                  <video
                    ref={videoRef}
                    key={currentRendition.fileUrl}
                    controls
                    autoPlay
                    playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    poster={activeResult?.thumbnails?.[0]}
                  >
                    <source src={currentRendition.fileUrl} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                ) : (
                  <div style={{ textAlign: 'center', padding: '20px' }}>
                    <Video size={48} color="var(--text-dim)" style={{ margin: '0 auto 12px auto' }} />
                    <div style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 500 }}>
                      Player waiting for transcoded output...
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>
                      Once background worker finishes, multi-resolution streams will activate here.
                    </div>
                  </div>
                )}
              </div>

              {/* Resolution Switcher Tabs */}
              {activeRenditions.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>
                    SWITCH PLAYBACK RESOLUTION (BITRATE):
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {activeRenditions.map((rend) => (
                      <button
                        key={rend.resolution}
                        onClick={() => setSelectedResolution(rend.resolution)}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '8px',
                          border: `1px solid ${
                            selectedResolution === rend.resolution
                              ? 'var(--primary)'
                              : 'var(--border-color)'
                          }`,
                          background:
                            selectedResolution === rend.resolution
                              ? 'var(--primary-subtle)'
                              : 'var(--bg-inner)',
                          color: selectedResolution === rend.resolution ? 'var(--primary)' : 'var(--text-muted)',
                          fontWeight: 700,
                          fontSize: '13px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span>{rend.resolution}</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                          ({(rend.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB)
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Video Metadata Inspector */}
              {activeResult?.metadata && (
                <div
                  style={{
                    marginTop: '20px',
                    padding: '16px',
                    borderRadius: '10px',
                    background: 'var(--bg-inner)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', color: 'var(--primary)' }}>
                    FFprobe Stream Specifications
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                      gap: '10px',
                      fontSize: '12px',
                    }}
                  >
                    <div>
                      <span style={{ color: 'var(--text-dim)' }}>Original Resolution:</span>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                        {activeResult.metadata.width} x {activeResult.metadata.height}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-dim)' }}>Duration:</span>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{activeResult.metadata.duration.toFixed(1)}s</div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-dim)' }}>Frame Rate:</span>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{activeResult.metadata.fps} FPS</div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-dim)' }}>Video Codec:</span>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{activeResult.metadata.videoCodec?.toUpperCase()}</div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-dim)' }}>Audio Codec:</span>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{activeResult.metadata.audioCodec?.toUpperCase()}</div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-dim)' }}>Pipeline Latency:</span>
                      <div style={{ fontWeight: 600, color: 'var(--success)' }}>
                        {(activeResult.processingTimeMs / 1000).toFixed(2)}s
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Thumbnail Snapshots & Hover Animated GIF */}
            {activeResult && (
              <div className="glass-panel" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
                  <Sparkles size={16} color="var(--warning)" />
                  Auto-Extracted Thumbnail Keyframes & GIF Teaser
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
                  {activeResult.thumbnails?.map((thumbUrl, idx) => (
                    <div
                      key={idx}
                      style={{
                        borderRadius: '8px',
                        overflow: 'hidden',
                        border: '1px solid var(--border-color)',
                        aspectRatio: '16/9',
                        background: 'var(--bg-inner)',
                        position: 'relative',
                      }}
                    >
                      <img
                        src={thumbUrl}
                        alt={`Snapshot ${idx + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          bottom: '4px',
                          right: '4px',
                          fontSize: '9px',
                          background: 'rgba(0,0,0,0.7)',
                          color: '#ffffff',
                          padding: '1px 5px',
                          borderRadius: '4px',
                        }}
                      >
                        Frame {idx + 1}
                      </span>
                    </div>
                  ))}

                  {/* Animated GIF Preview */}
                  {activeResult.previewGif && (
                    <div
                      style={{
                        borderRadius: '8px',
                        overflow: 'hidden',
                        border: '2px solid var(--primary)',
                        aspectRatio: '16/9',
                        background: 'var(--bg-inner)',
                        position: 'relative',
                      }}
                    >
                      <img
                        src={activeResult.previewGif}
                        alt="Animated Teaser"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          bottom: '4px',
                          right: '4px',
                          fontSize: '9px',
                          background: 'var(--primary)',
                          color: '#ffffff',
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: '4px',
                        }}
                      >
                        GIF PREVIEW
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Recent Jobs History Table */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
                  <Clock size={16} color="var(--primary)" />
                  Recent Pipeline Jobs
                </h3>
                <button
                  onClick={fetchDashboardStats}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--primary)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={12} />
                  Refresh
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {recentJobs.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px', padding: '16px' }}>
                    No recent transcoding jobs found in Redis.
                  </div>
                ) : (
                  recentJobs.slice(0, 5).map((job) => (
                    <div
                      key={job.id}
                      onClick={() => loadJob(job.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        background: job.id === currentJobId ? 'var(--primary-subtle)' : 'var(--bg-inner)',
                        border: `1px solid ${job.id === currentJobId ? 'var(--primary)' : 'var(--border-color)'}`,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FileVideo size={18} color="var(--primary)" />
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                            {job.fileName || `Job ${job.id.slice(0, 8)}...`}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                            ID: {job.id.slice(0, 12)}...
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background:
                              job.status === 'completed'
                                ? 'var(--success-subtle)'
                                : job.status === 'active'
                                ? 'var(--primary-subtle)'
                                : 'var(--warning-subtle)',
                            color:
                              job.status === 'completed'
                                ? 'var(--success)'
                                : job.status === 'active'
                                ? 'var(--primary)'
                                : 'var(--warning)',
                            border: '1px solid currentColor',
                            textTransform: 'uppercase',
                          }}
                        >
                          {job.status}
                        </span>
                        <ChevronRight size={14} color="var(--text-dim)" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* System Architecture Modal for Recruiters & System Design Demos */}
      {showArchModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px',
          }}
          onClick={() => setShowArchModal(false)}
        >
          <div
            className="glass-panel"
            style={{
              maxWidth: '850px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '32px',
              position: 'relative',
              background: 'var(--bg-secondary)',
              boxShadow: 'var(--shadow-card-hover)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)' }}>
                  High-Level System Architecture (HLD)
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  How this distributed video transcoding pipeline achieves zero API blocking
                </p>
              </div>
              <button
                onClick={() => setShowArchModal(false)}
                style={{
                  background: 'var(--bg-inner)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </div>

            {/* Architecture diagram cards */}
            <div
              style={{
                background: 'var(--terminal-bg)',
                padding: '20px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                lineHeight: 1.6,
                color: 'var(--terminal-text)',
                marginBottom: '20px',
                overflowX: 'auto',
              }}
            >
              {`+----------------+      1. POST /api/upload       +-------------------------+
|                | ----------------------------> |                         |
|   Client UI    | <---------------------------- |   Next.js API Gateway   |
|  (Web/Mobile)  |      2. 202 Accepted (JobId)  |   (Stateless Web Tier)  |
+----------------+                               +-------------------------+
       ^                                                      |
       | 5. Server-Sent Events (SSE)                          | 3. Add Job
       |    Live 0-100% Progress                              v
       |                                         +-------------------------+
       +---------------------------------------- |    Redis Message Queue  |
                                                 |   (BullMQ Task Broker)  |
                                                 +-------------------------+
                                                              |
                                                              | 4. Pull Job (Lock)
                                                              v
                                                 +-------------------------+
                                                 |  Decoupled Worker Node  |
                                                 |  (FFmpeg Transcoder)    |
                                                 +-------------------------+
                                                              |
                                            +------------------+------------------+
                                            |                                     |
                                            v                                     v
                            +-----------------------------+       +-----------------------------+
                            |   Multi-Bitrate Renditions  |       |   Object Storage Sync       |
                            | (1080p, 720p, 480p, 360p)   |       |   (Local Disk / AWS S3)     |
                            +-----------------------------+       +-----------------------------+`}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--bg-inner)', border: '1px solid var(--border-color)' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)', marginBottom: '6px' }}>
                  1. Non-Blocking Ingestion
                </h4>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Video upload immediately returns an HTTP 202 Accepted response with a Job UUID. Heavy encoding
                  tasks never stall web request threads.
                </p>
              </div>

              <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--bg-inner)', border: '1px solid var(--border-color)' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent)', marginBottom: '6px' }}>
                  2. Redis BullMQ Reliability
                </h4>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Supports exponential backoff retries, concurrency limits (2-4 per worker), and atomic distributed
                  job locking to prevent duplicate encoding.
                </p>
              </div>

              <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--bg-inner)', border: '1px solid var(--border-color)' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--success)', marginBottom: '6px' }}>
                  3. Production Media Packaging
                </h4>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Uses FFmpeg <code>-movflags +faststart</code> for immediate web streaming without buffering, plus
                  automated keyframe thumbnails and animated teaser GIFs.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border-color)',
          padding: '20px 24px',
          textAlign: 'center',
          fontSize: '12px',
          color: 'var(--text-dim)',
          background: 'var(--bg-secondary)',
        }}
      >
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            Built with <strong>Next.js</strong>, <strong>Redis</strong>, <strong>BullMQ</strong>, <strong>FFmpeg</strong>, and <strong>AWS S3</strong>.
          </div>
          <div>
            Designed for High-Throughput Media Processing Pipelines & Distributed Cloud Architectures.
          </div>
        </div>
      </footer>
    </div>
  );
}
