'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  Video,
  Layers,
  Music,
  Scissors,
  VolumeX,
  Zap,
  Film,
  Repeat,
  Download,
  Share2,
  Copy,
  Check,
  Play,
  Pause,
  Sun,
  Moon,
  ShieldCheck,
  Trash2,
  Sparkles,
  ArrowRight,
  Clock,
  HardDrive,
  FileCheck,
} from 'lucide-react';
import { JobDetailsResponse, VideoProcessingResult, VideoToolType } from '@/lib/types';

export default function HomePage() {
  // Theme state
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
    try {
      localStorage.setItem('streamforge_theme', next);
      document.documentElement.setAttribute('data-theme', next);
    } catch {}
  };

  // Tool state
  const [selectedTool, setSelectedTool] = useState<VideoToolType>('compress');
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Tool Options
  const [compressPreset, setCompressPreset] = useState<string>('whatsapp-16');
  const [audioBitrate, setAudioBitrate] = useState<string>('192k');
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(10);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1.5);
  const [targetFormat, setTargetFormat] = useState<string>('mp4');

  // Job & Result state
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [jobData, setJobData] = useState<JobDetailsResponse | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  // File selection
  const handleFile = (selected: File) => {
    if (!selected.type.startsWith('video/') && !selected.name.match(/\.(mp4|mov|mkv|webm|avi|flv)$/i)) {
      alert('Please upload a valid video file (MP4, MOV, MKV, WebM, AVI).');
      return;
    }

    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    const objectUrl = URL.createObjectURL(selected);
    setFile(selected);
    setFilePreviewUrl(objectUrl);
    setJobData(null);
    setCurrentJobId(null);

    // Auto set trim duration when video metadata loads
    const tempVideo = document.createElement('video');
    tempVideo.src = objectUrl;
    tempVideo.onloadedmetadata = () => {
      const dur = Math.round(tempVideo.duration) || 10;
      setVideoDuration(dur);
      setTrimStart(0);
      setTrimEnd(Math.min(dur, 30));
    };
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // Poll active job status with resilient fallback
  useEffect(() => {
    if (!currentJobId) return;

    let pollingInterval: NodeJS.Timeout | null = null;

    const pollJobStatus = async () => {
      try {
        const res = await fetch(`/api/jobs/${currentJobId}`);
        const json = await res.json();
        if (json.success && json.job) {
          const j = json.job;
          setJobData(j);
          if (j.status === 'completed' || j.status === 'failed') {
            if (pollingInterval) clearInterval(pollingInterval);
          }
        }
      } catch {}
    };

    const eventSource = new EventSource(`/api/jobs/${currentJobId}/stream`);

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.error) return;

        setJobData((prev) => ({
          ...(prev || {}),
          id: payload.id,
          status: payload.status,
          progress: payload.progress,
          progressMessage: payload.progressMessage,
          currentStage: payload.currentStage,
          result: payload.result,
        } as JobDetailsResponse));

        if (payload.status === 'completed' || payload.status === 'failed') {
          eventSource.close();
          if (pollingInterval) clearInterval(pollingInterval);
        }
      } catch (err) {
        console.error('SSE Error:', err);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      if (!pollingInterval) {
        pollingInterval = setInterval(pollJobStatus, 1500);
      }
    };

    const safetyTimer = setInterval(pollJobStatus, 2500);

    return () => {
      eventSource.close();
      if (pollingInterval) clearInterval(pollingInterval);
      clearInterval(safetyTimer);
    };
  }, [currentJobId]);

  // Submit Job
  const handleProcessVideo = async () => {
    if (!file) return;

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('video', file);
      formData.append('tool', selectedTool);

      const toolOptions = {
        compressPreset,
        audioBitrate,
        startTimeSec: trimStart,
        endTimeSec: trimEnd,
        speedMultiplier,
        targetFormat,
      };
      formData.append('toolOptions', JSON.stringify(toolOptions));

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setCurrentJobId(data.jobId);
      setJobData({
        id: data.jobId,
        status: 'waiting',
        progress: 10,
        progressMessage: 'Uploaded! Preparing video engine...',
        data: {
          jobId: data.jobId,
          originalFileName: file.name,
          rawFilePath: '',
          uploadedAt: new Date().toISOString(),
          tool: selectedTool,
        },
        timestamp: Date.now(),
      });
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const copyShareLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const resetAll = () => {
    setFile(null);
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setFilePreviewUrl(null);
    setCurrentJobId(null);
    setJobData(null);
  };

  const activeResult: VideoProcessingResult | undefined = jobData?.result || jobData?.returnvalue;
  const isDone = jobData?.status === 'completed' && activeResult;
  const isProcessing = jobData && jobData.status !== 'completed' && jobData.status !== 'failed';
  const isFailed = jobData?.status === 'failed';

  // Compute savings
  const originalMB = file ? file.size / (1024 * 1024) : 0;
  const resultMB = activeResult?.outputFileSizeBytes ? activeResult.outputFileSizeBytes / (1024 * 1024) : 0;
  const savingsPct = originalMB > 0 && resultMB > 0 ? Math.round(((originalMB - resultMB) / originalMB) * 100) : 0;

  // Tool Definitions
  const TOOLS = [
    {
      id: 'compress' as VideoToolType,
      name: 'Compress Video',
      icon: <Layers size={20} />,
      tagline: 'Shrink for WhatsApp & Email',
      color: '#4f46e5',
    },
    {
      id: 'extract-audio' as VideoToolType,
      name: 'Extract MP3',
      icon: <Music size={20} />,
      tagline: 'Convert video to audio',
      color: '#059669',
    },
    {
      id: 'trim' as VideoToolType,
      name: 'Trim & Cut',
      icon: <Scissors size={20} />,
      tagline: 'Cut start or end clips',
      color: '#0284c7',
    },
    {
      id: 'mute' as VideoToolType,
      name: 'Mute Audio',
      icon: <VolumeX size={20} />,
      tagline: 'Remove background noise',
      color: '#dc2626',
    },
    {
      id: 'speed' as VideoToolType,
      name: 'Change Speed',
      icon: <Zap size={20} />,
      tagline: 'Slow-Mo or Fast-Forward',
      color: '#d97706',
    },
    {
      id: 'gif' as VideoToolType,
      name: 'Make GIF',
      icon: <Film size={20} />,
      tagline: 'Convert clip to sticker',
      color: '#7c3aed',
    },
    {
      id: 'convert' as VideoToolType,
      name: 'Convert Format',
      icon: <Repeat size={20} />,
      tagline: 'MOV/MKV/AVI to MP4',
      color: '#2563eb',
    },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      {/* Top Navbar */}
      <header
        style={{
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #4f46e5 0%, #0284c7 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)',
              }}
            >
              <Video size={20} color="#ffffff" />
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text-main)' }}>
                Stream<span className="gradient-text">Forge</span> Studio
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 500 }}>
                100% Free Online Video Tools
              </div>
            </div>
          </div>

          {/* Badges & Dark Mode */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                padding: '4px 10px',
                borderRadius: '20px',
                background: 'var(--success-subtle)',
                color: 'var(--success)',
                fontWeight: 600,
                border: '1px solid rgba(5, 150, 105, 0.2)',
              }}
            >
              <ShieldCheck size={14} />
              100% Private (Auto-deleted)
            </span>

            <button
              onClick={toggleTheme}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'var(--bg-inner)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-main)',
                cursor: 'pointer',
              }}
              title="Toggle theme"
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, maxWidth: '1100px', width: '100%', margin: '0 auto', padding: '32px 20px' }}>
        {/* Hero Section */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <h1
            style={{
              fontSize: '34px',
              fontWeight: 800,
              letterSpacing: '-1px',
              color: 'var(--text-main)',
              marginBottom: '10px',
            }}
          >
            The Simple, Free <span className="gradient-text">Video Studio</span>
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--text-muted)', maxWidth: '620px', margin: '0 auto' }}>
            Compress for WhatsApp, extract clear MP3 audio, trim clips, remove noisy background audio, or convert
            formats in seconds. No watermark, zero permanent storage.
          </p>
        </div>

        {/* Step 1: Tool Selector Grid */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Choose a Tool:
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
              gap: '12px',
            }}
          >
            {TOOLS.map((t) => {
              const active = selectedTool === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedTool(t.id)}
                  style={{
                    padding: '14px 10px',
                    borderRadius: '12px',
                    background: active ? 'var(--primary-subtle)' : 'var(--bg-card)',
                    border: active ? `2px solid var(--primary)` : '1px solid var(--border-color)',
                    color: active ? 'var(--primary)' : 'var(--text-main)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease',
                    boxShadow: active ? '0 4px 15px rgba(79, 70, 229, 0.15)' : 'var(--shadow-card)',
                  }}
                >
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: active ? 'var(--primary)' : 'var(--bg-inner)',
                      color: active ? '#ffffff' : t.color,
                    }}
                  >
                    {t.icon}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 700 }}>{t.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.2 }}>
                    {t.tagline}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Studio Workspace Container */}
        <div
          className="glass-panel"
          style={{
            padding: '28px',
            borderRadius: '16px',
            boxShadow: 'var(--shadow-card)',
            marginBottom: '32px',
          }}
        >
          {/* If no file uploaded yet: Dropzone */}
          {!file && (
            <div
              onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragActive ? 'var(--primary)' : 'var(--border-color)'}`,
                borderRadius: '14px',
                padding: '48px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                background: dragActive ? 'var(--drop-active)' : 'var(--bg-inner)',
                transition: 'all 0.2s ease',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                style={{ display: 'none' }}
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <div
                style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  background: 'var(--primary-subtle)',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <Upload size={28} />
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                Click to browse or drop your video here
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Supports MP4, MOV, MKV, WebM, AVI (Up to 500 MB)
              </div>
            </div>
          )}

          {/* When a file is chosen: Tool Configuration Panel */}
          {file && (
            <div>
              {/* File Info Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  borderRadius: '12px',
                  background: 'var(--bg-inner)',
                  border: '1px solid var(--border-color)',
                  marginBottom: '24px',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      background: 'var(--primary-subtle)',
                      color: 'var(--primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Video size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>{file.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                      Original Size: {(file.size / (1024 * 1024)).toFixed(2)} MB • {videoDuration > 0 ? `${videoDuration}s duration` : 'Analyzing'}
                    </div>
                  </div>
                </div>

                {!isProcessing && (
                  <button
                    onClick={resetAll}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12px',
                      color: 'var(--danger)',
                      background: 'var(--danger-subtle)',
                      border: '1px solid rgba(220, 38, 38, 0.2)',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    <Trash2 size={14} /> Change Video
                  </button>
                )}
              </div>

              {/* Tool Options Section (If not processing/done) */}
              {!jobData && (
                <div style={{ marginBottom: '28px' }}>
                  {/* COMPRESS OPTIONS */}
                  {selectedTool === 'compress' && (
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '12px' }}>
                        Select Target Size Preset:
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                        {[
                          { id: 'whatsapp-16', label: '💬 WhatsApp Safe', desc: 'Fits under 16 MB limit' },
                          { id: 'whatsapp-64', label: '📱 WhatsApp HD', desc: 'High Quality (< 64 MB)' },
                          { id: 'email-25', label: '📧 Email / Gmail', desc: 'Fits under 25 MB' },
                          { id: 'half', label: '⚡ 50% Smaller', desc: 'Cut file size in half' },
                          { id: 'quarter', label: '📉 75% Maximum Save', desc: 'Smallest possible size' },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            onClick={() => setCompressPreset(opt.id)}
                            style={{
                              padding: '12px 14px',
                              borderRadius: '10px',
                              textAlign: 'left',
                              background: compressPreset === opt.id ? 'var(--primary-subtle)' : 'var(--bg-inner)',
                              border: compressPreset === opt.id ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                              cursor: 'pointer',
                              color: 'var(--text-main)',
                            }}
                          >
                            <div style={{ fontSize: '13px', fontWeight: 700 }}>{opt.label}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{opt.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* EXTRACT AUDIO OPTIONS */}
                  {selectedTool === 'extract-audio' && (
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '12px' }}>
                        MP3 Audio Quality:
                      </div>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        {[
                          { id: '192k', label: '192 kbps (Standard Audio)', desc: 'Small file, great for speech' },
                          { id: '320k', label: '320 kbps (High Fidelity)', desc: 'Studio sound, best for music' },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            onClick={() => setAudioBitrate(opt.id)}
                            style={{
                              padding: '12px 18px',
                              borderRadius: '10px',
                              textAlign: 'left',
                              background: audioBitrate === opt.id ? 'var(--primary-subtle)' : 'var(--bg-inner)',
                              border: audioBitrate === opt.id ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                              cursor: 'pointer',
                              color: 'var(--text-main)',
                            }}
                          >
                            <div style={{ fontSize: '13px', fontWeight: 700 }}>{opt.label}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{opt.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TRIM OPTIONS */}
                  {selectedTool === 'trim' && (
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '12px' }}>
                        Cut Range (in Seconds):
                      </div>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                          <label style={{ fontSize: '12px', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>
                            Start Time (Seconds)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={trimEnd - 1}
                            value={trimStart}
                            onChange={(e) => setTrimStart(Math.max(0, parseFloat(e.target.value) || 0))}
                            style={{
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-inner)',
                              color: 'var(--text-main)',
                              width: '120px',
                              fontSize: '14px',
                            }}
                          />
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-dim)', paddingTop: '18px' }}>➔</div>
                        <div>
                          <label style={{ fontSize: '12px', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>
                            End Time (Seconds)
                          </label>
                          <input
                            type="number"
                            min={trimStart + 1}
                            max={videoDuration || 999}
                            value={trimEnd}
                            onChange={(e) => setTrimEnd(parseFloat(e.target.value) || 10)}
                            style={{
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-inner)',
                              color: 'var(--text-main)',
                              width: '120px',
                              fontSize: '14px',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 600, paddingTop: '18px' }}>
                          Selected Clip Duration: {Math.max(0, trimEnd - trimStart)}s
                        </span>
                      </div>
                    </div>
                  )}

                  {/* MUTE OPTIONS */}
                  {selectedTool === 'mute' && (
                    <div
                      style={{
                        padding: '16px 20px',
                        borderRadius: '10px',
                        background: 'var(--primary-subtle)',
                        border: '1px solid var(--primary-border)',
                        color: 'var(--primary)',
                        fontSize: '13px',
                      }}
                    >
                      🔇 <strong>Instant Sound Removal:</strong> The entire audio track and background noise will be removed. The video stream will be copied in original 100% quality in under 2 seconds!
                    </div>
                  )}

                  {/* SPEED OPTIONS */}
                  {selectedTool === 'speed' && (
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '12px' }}>
                        Playback Speed:
                      </div>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {[
                          { val: 0.5, label: '0.5x (Slow-Mo)' },
                          { val: 0.75, label: '0.75x' },
                          { val: 1.25, label: '1.25x' },
                          { val: 1.5, label: '1.5x (Fast)' },
                          { val: 2.0, label: '2.0x (Double)' },
                        ].map((opt) => (
                          <button
                            key={opt.val}
                            onClick={() => setSpeedMultiplier(opt.val)}
                            style={{
                              padding: '10px 16px',
                              borderRadius: '8px',
                              background: speedMultiplier === opt.val ? 'var(--primary)' : 'var(--bg-inner)',
                              color: speedMultiplier === opt.val ? '#ffffff' : 'var(--text-main)',
                              border: '1px solid var(--border-color)',
                              fontWeight: 700,
                              fontSize: '13px',
                              cursor: 'pointer',
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* GIF OPTIONS */}
                  {selectedTool === 'gif' && (
                    <div
                      style={{
                        padding: '16px 20px',
                        borderRadius: '10px',
                        background: 'var(--primary-subtle)',
                        border: '1px solid var(--primary-border)',
                        color: 'var(--primary)',
                        fontSize: '13px',
                      }}
                    >
                      🎞️ <strong>Animated GIF Generator:</strong> Generates a lightweight, looping animated GIF sticker starting from the beginning of your video.
                    </div>
                  )}

                  {/* CONVERT OPTIONS */}
                  {selectedTool === 'convert' && (
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '12px' }}>
                        Target Universal Format:
                      </div>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        {[
                          { id: 'mp4', label: 'MP4 (Universal Web)', desc: 'Plays on all phones & TVs' },
                          { id: 'webm', label: 'WebM (High Compression)', desc: 'Optimized for modern browsers' },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            onClick={() => setTargetFormat(opt.id)}
                            style={{
                              padding: '12px 18px',
                              borderRadius: '10px',
                              textAlign: 'left',
                              background: targetFormat === opt.id ? 'var(--primary-subtle)' : 'var(--bg-inner)',
                              border: targetFormat === opt.id ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                              cursor: 'pointer',
                              color: 'var(--text-main)',
                            }}
                          >
                            <div style={{ fontSize: '13px', fontWeight: 700 }}>{opt.label}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{opt.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ACTION BUTTON (If not processing/done) */}
              {!jobData && (
                <button
                  onClick={handleProcessVideo}
                  disabled={isUploading}
                  style={{
                    width: '100%',
                    padding: '16px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #4f46e5 0%, #0284c7 100%)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '16px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    boxShadow: '0 4px 15px rgba(79, 70, 229, 0.35)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <Sparkles size={20} />
                  {isUploading ? 'Uploading to Studio...' : `Run ${TOOLS.find((t) => t.id === selectedTool)?.name} Now`}
                </button>
              )}

              {/* PROCESSING PROGRESS BAR */}
              {isProcessing && (
                <div style={{ padding: '24px 0', textAlign: 'center' }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>
                    {jobData.progressMessage || 'Processing your video...'}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '16px' }}>
                    {jobData.progress}% complete
                  </div>

                  <div
                    style={{
                      width: '100%',
                      height: '10px',
                      background: 'var(--bg-inner)',
                      borderRadius: '5px',
                      overflow: 'hidden',
                      marginBottom: '16px',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <div
                      style={{
                        width: `${jobData.progress}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #4f46e5 0%, #0284c7 100%)',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                    ⚡ Powered by FFmpeg background worker. Please wait a few seconds...
                  </div>
                </div>
              )}

              {/* ERROR STATE */}
              {isFailed && (
                <div
                  style={{
                    padding: '20px',
                    borderRadius: '12px',
                    background: 'var(--danger-subtle)',
                    border: '1px solid rgba(220, 38, 38, 0.3)',
                    color: 'var(--danger)',
                    marginTop: '20px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '6px' }}>Processing Failed</div>
                  <div style={{ fontSize: '13px' }}>{jobData.failedReason || 'Something went wrong.'}</div>
                  <button
                    onClick={resetAll}
                    style={{
                      marginTop: '12px',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      background: 'var(--danger)',
                      color: '#ffffff',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    Try Another File
                  </button>
                </div>
              )}

              {/* SUCCESS / DOWNLOAD SHOWCASE */}
              {isDone && (
                <div style={{ marginTop: '10px' }}>
                  <div
                    style={{
                      padding: '16px 20px',
                      borderRadius: '12px',
                      background: 'var(--success-subtle)',
                      border: '1px solid rgba(5, 150, 105, 0.3)',
                      color: 'var(--success)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '24px',
                      flexWrap: 'wrap',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <FileCheck size={22} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '15px' }}>Your video is ready to download!</div>
                        <div style={{ fontSize: '12px', opacity: 0.9 }}>
                          Processed in {(activeResult.processingTimeMs / 1000).toFixed(1)}s • Auto-expires in 30 minutes
                        </div>
                      </div>
                    </div>

                    {savingsPct > 0 && (
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 800,
                          background: 'var(--success)',
                          color: '#ffffff',
                          padding: '4px 12px',
                          borderRadius: '20px',
                        }}
                      >
                        🎉 {savingsPct}% Smaller!
                      </span>
                    )}
                  </div>

                  {/* Media Preview Player */}
                  <div style={{ marginBottom: '24px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-color)', background: '#000000' }}>
                    {activeResult.outputFormat === 'mp3' ? (
                      <div style={{ padding: '30px 20px', textAlign: 'center', background: 'var(--bg-inner)' }}>
                        <div
                          style={{
                            width: '60px',
                            height: '60px',
                            borderRadius: '50%',
                            background: 'var(--success-subtle)',
                            color: 'var(--success)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 16px',
                          }}
                        >
                          <Music size={28} />
                        </div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '12px' }}>
                          {activeResult.outputFileName}
                        </div>
                        <audio
                          src={activeResult.outputFileUrl}
                          controls
                          style={{ width: '100%', maxWidth: '450px' }}
                        />
                      </div>
                    ) : activeResult.outputFormat === 'gif' ? (
                      <div style={{ padding: '20px', textAlign: 'center', background: 'var(--bg-inner)' }}>
                        <img
                          src={activeResult.outputFileUrl}
                          alt="GIF Preview"
                          style={{ maxWidth: '100%', maxHeight: '350px', borderRadius: '8px' }}
                        />
                      </div>
                    ) : (
                      <video
                        src={activeResult.outputFileUrl}
                        controls
                        autoPlay
                        style={{ width: '100%', maxHeight: '420px', display: 'block' }}
                      />
                    )}
                  </div>

                  {/* Size Comparison Cards */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                      gap: '12px',
                      marginBottom: '24px',
                    }}
                  >
                    <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--bg-inner)', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>ORIGINAL SIZE</div>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-main)', marginTop: '4px' }}>
                        {originalMB.toFixed(2)} MB
                      </div>
                    </div>
                    <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--bg-inner)', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>PROCESSED SIZE</div>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--success)', marginTop: '4px' }}>
                        {resultMB.toFixed(2)} MB
                      </div>
                    </div>
                    <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--bg-inner)', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600 }}>FORMAT</div>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>
                        {activeResult.outputFormat?.toUpperCase() || 'MP4'}
                      </div>
                    </div>
                  </div>

                  {/* DOWNLOAD & SHARE BUTTONS */}
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <a
                      href={activeResult.outputFileUrl}
                      download={activeResult.outputFileName || 'processed_video.mp4'}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        flex: 1,
                        minWidth: '200px',
                        padding: '14px 20px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                        color: '#ffffff',
                        textDecoration: 'none',
                        fontSize: '15px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 14px rgba(5, 150, 105, 0.35)',
                      }}
                    >
                      <Download size={18} />
                      Download {activeResult.outputFileName || 'File'}
                    </a>

                    <button
                      onClick={() => copyShareLink(activeResult.outputFileUrl || '')}
                      style={{
                        padding: '14px 18px',
                        borderRadius: '10px',
                        background: 'var(--bg-inner)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      {copiedLink ? <Check size={16} color="var(--success)" /> : <Copy size={16} />}
                      {copiedLink ? 'Link Copied!' : 'Copy Direct Link'}
                    </button>

                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(`Check out this video: ${activeResult.outputFileUrl}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '14px 18px',
                        borderRadius: '10px',
                        background: '#25D366',
                        color: '#ffffff',
                        textDecoration: 'none',
                        fontSize: '14px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <Share2 size={16} /> Share on WhatsApp
                    </a>

                    <button
                      onClick={resetAll}
                      style={{
                        padding: '14px 18px',
                        borderRadius: '10px',
                        background: 'transparent',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-dim)',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Process Another
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Feature Highlights Grid for Users */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '16px',
            marginTop: '20px',
          }}
        >
          <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--success-subtle)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldCheck size={18} />
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>100% Private & Secure</div>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
              All uploaded and processed files are automatically purged from our cloud storage after download. Your media is completely private.
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--primary-subtle)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles size={18} />
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>No Watermarks, Ever</div>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
              Unlike other free video tools, we never add logos or watermarks. Your exports are clean, full-quality, and ready for work or social media.
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--accent-subtle)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Zap size={18} />
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>High Speed Cloud Transcoding</div>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
              Powered by native FFmpeg and BullMQ asynchronous queues for lightning-fast encoding without freezing your device.
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          padding: '20px',
          textAlign: 'center',
          fontSize: '12px',
          color: 'var(--text-dim)',
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            StreamForge Studio © {new Date().getFullYear()} • Free Video Toolkit
          </div>
          <div>
            Built with Next.js, FFmpeg, BullMQ, and Supabase Cloud Storage
          </div>
        </div>
      </footer>
    </div>
  );
}
