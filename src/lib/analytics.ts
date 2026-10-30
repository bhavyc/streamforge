import crypto from 'crypto';
import { getRedisClient } from './redis';

export interface VisitRecord {
  id: string;
  timestamp: string; // ISO string
  timeAgo?: string;
  ip: string;
  path: string;
  referrer: string;
  device: 'Desktop' | 'Mobile' | 'Tablet';
  browser: string;
  os: string;
  screen?: string;
  country?: string;
}

export interface DailyStat {
  date: string; // YYYY-MM-DD
  label: string; // e.g. "Oct 30"
  visits: number;
  uniques: number;
}

export interface AnalyticsSummary {
  totalVisits: number;
  uniqueVisitors: number;
  todayVisits: number;
  todayUniques: number;
  totalJobs: number;
  totalSavedMB: number;
  toolsBreakdown: Record<string, number>;
  dailyHistory: DailyStat[];
  recentVisits: VisitRecord[];
}

// In-Memory Fallback State (persists during process lifetime if Redis is offline)
const inMemoryFallback = {
  totalVisits: 0,
  uniqueVisitors: new Set<string>(),
  dailyVisits: new Map<string, number>(),
  dailyUniques: new Map<string, Set<string>>(),
  toolsBreakdown: {
    compress: 0,
    'extract-audio': 0,
    trim: 0,
    mute: 0,
    speed: 0,
    gif: 0,
    convert: 0,
  } as Record<string, number>,
  jobsTotal: 0,
  savedMB: 0,
  recentVisits: [] as VisitRecord[],
};

/**
 * Lightweight User-Agent parser (Zero external dependencies)
 */
export function parseUserAgent(ua: string = '') {
  const isTablet = /iPad|Tablet|PlayBook/i.test(ua);
  const isMobile = !isTablet && /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const device: 'Desktop' | 'Mobile' | 'Tablet' = isTablet ? 'Tablet' : isMobile ? 'Mobile' : 'Desktop';

  let browser = 'Other';
  if (/Edg/i.test(ua)) browser = 'Edge';
  else if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) browser = 'Chrome';
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  else if (/Firefox/i.test(ua)) browser = 'Firefox';
  else if (/Opera|OPR/i.test(ua)) browser = 'Opera';

  let os = 'Other';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Linux/i.test(ua)) os = 'Linux';

  return { device, browser, os };
}

/**
 * Format Referrer into human readable platform
 */
export function formatReferrer(rawRef: string = ''): string {
  if (!rawRef || rawRef === 'direct' || rawRef === '') return 'Direct / None';
  try {
    const url = new URL(rawRef);
    const host = url.hostname.toLowerCase();
    if (host.includes('t.co') || host.includes('twitter.com') || host.includes('x.com')) return 'X (Twitter)';
    if (host.includes('google.')) return 'Google Search';
    if (host.includes('youtube.')) return 'YouTube';
    if (host.includes('linkedin.')) return 'LinkedIn';
    if (host.includes('reddit.')) return 'Reddit';
    if (host.includes('facebook.') || host.includes('fb.')) return 'Facebook';
    if (host.includes('whatsapp.')) return 'WhatsApp';
    if (host.includes('instagram.')) return 'Instagram';
    return url.hostname.replace(/^www\./, '');
  } catch {
    return rawRef.slice(0, 30);
  }
}

/**
 * Anonymize IP address for user privacy (e.g. 103.21.244.12 -> 103.21.***.***)
 */
export function anonymizeIp(ip: string): string {
  if (!ip || ip === '127.0.0.1' || ip === '::1') return '127.0.0.1';
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.***.***`;
    }
  }
  return ip.slice(0, 8) + '...';
}

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Record a page visit into Redis (and in-memory fallback)
 */
export async function recordVisit(params: {
  visitorId?: string;
  ip: string;
  path?: string;
  referrer?: string;
  userAgent?: string;
  screen?: string;
  country?: string;
}): Promise<void> {
  const today = getTodayStr();
  const uaInfo = parseUserAgent(params.userAgent || '');
  const refClean = formatReferrer(params.referrer || '');

  // Compute unique visitor identifier
  const rawId = params.visitorId || `${params.ip}_${params.userAgent || ''}`;
  const visitorHash = crypto.createHash('sha256').update(rawId).digest('hex').slice(0, 16);

  const visitRecord: VisitRecord = {
    id: `vis_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    ip: anonymizeIp(params.ip),
    path: params.path || '/',
    referrer: refClean,
    device: uaInfo.device,
    browser: uaInfo.browser,
    os: uaInfo.os,
    screen: params.screen,
    country: params.country || 'Unknown',
  };

  // Always update in-memory
  inMemoryFallback.totalVisits++;
  inMemoryFallback.uniqueVisitors.add(visitorHash);
  inMemoryFallback.dailyVisits.set(today, (inMemoryFallback.dailyVisits.get(today) || 0) + 1);
  if (!inMemoryFallback.dailyUniques.has(today)) {
    inMemoryFallback.dailyUniques.set(today, new Set());
  }
  inMemoryFallback.dailyUniques.get(today)!.add(visitorHash);
  inMemoryFallback.recentVisits.unshift(visitRecord);
  if (inMemoryFallback.recentVisits.length > 200) {
    inMemoryFallback.recentVisits.pop();
  }

  // Update Redis
  try {
    const redis = getRedisClient();
    const pipeline = redis.pipeline();

    // Overall metrics
    pipeline.incr('analytics:total_visits');
    pipeline.sadd('analytics:unique_visitors_set', visitorHash);

    // Daily metrics
    pipeline.incr(`analytics:daily_visits:${today}`);
    pipeline.sadd(`analytics:daily_uniques_set:${today}`, visitorHash);
    pipeline.sadd('analytics:active_dates', today);

    // Recent visits feed (max 200)
    pipeline.lpush('analytics:recent_visits', JSON.stringify(visitRecord));
    pipeline.ltrim('analytics:recent_visits', 0, 199);

    await pipeline.exec();
  } catch (err: any) {
    // Non-blocking fallback
    console.warn('[Analytics Warning]: Redis recordVisit fallback used:', err.message);
  }
}

/**
 * Record tool usage count and saved bytes
 */
export async function trackToolUsage(tool: string, savedMB: number = 0): Promise<void> {
  inMemoryFallback.jobsTotal++;
  inMemoryFallback.toolsBreakdown[tool] = (inMemoryFallback.toolsBreakdown[tool] || 0) + 1;
  inMemoryFallback.savedMB += savedMB;

  try {
    const redis = getRedisClient();
    const pipeline = redis.pipeline();
    pipeline.incr('analytics:jobs_total');
    pipeline.hincrby('analytics:tools', tool, 1);
    if (savedMB > 0) {
      pipeline.incrbyfloat('analytics:total_saved_mb', savedMB);
    }
    await pipeline.exec();
  } catch {}
}

/**
 * Retrieve comprehensive analytics for the Admin Panel
 */
export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  const today = getTodayStr();

  // Try Redis first
  try {
    const redis = getRedisClient();
    const [
      totalVisitsRaw,
      uniqueVisitorsCount,
      todayVisitsRaw,
      todayUniquesCount,
      jobsTotalRaw,
      savedMbRaw,
      toolsHash,
      recentVisitsRaw,
      activeDatesList,
    ] = await Promise.all([
      redis.get('analytics:total_visits'),
      redis.scard('analytics:unique_visitors_set'),
      redis.get(`analytics:daily_visits:${today}`),
      redis.scard(`analytics:daily_uniques_set:${today}`),
      redis.get('analytics:jobs_total'),
      redis.get('analytics:total_saved_mb'),
      redis.hgetall('analytics:tools'),
      redis.lrange('analytics:recent_visits', 0, 99),
      redis.smembers('analytics:active_dates'),
    ]);

    // Build last 14 days chart data
    const last14Days: string[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      last14Days.push(d.toISOString().slice(0, 10));
    }

    // Fetch daily visits & uniques for the last 14 days
    const dailyPipeline = redis.pipeline();
    last14Days.forEach((dateStr) => {
      dailyPipeline.get(`analytics:daily_visits:${dateStr}`);
      dailyPipeline.scard(`analytics:daily_uniques_set:${dateStr}`);
    });
    const dailyResults = await dailyPipeline.exec();

    const dailyHistory: DailyStat[] = last14Days.map((dateStr, idx) => {
      const visitsRes = dailyResults?.[idx * 2]?.[1];
      const uniquesRes = dailyResults?.[idx * 2 + 1]?.[1];
      const visits = parseInt((visitsRes as string) || '0', 10);
      const uniques = typeof uniquesRes === 'number' ? uniquesRes : 0;

      const dateObj = new Date(dateStr + 'T00:00:00Z');
      const label = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      return {
        date: dateStr,
        label,
        visits,
        uniques,
      };
    });

    const parsedRecentVisits: VisitRecord[] = (recentVisitsRaw || []).map((jsonStr) => {
      try {
        return JSON.parse(jsonStr);
      } catch {
        return null;
      }
    }).filter(Boolean);

    // Format tools breakdown
    const toolsBreakdown: Record<string, number> = {
      compress: parseInt(toolsHash?.compress || '0', 10),
      'extract-audio': parseInt(toolsHash?.['extract-audio'] || '0', 10),
      trim: parseInt(toolsHash?.trim || '0', 10),
      mute: parseInt(toolsHash?.mute || '0', 10),
      speed: parseInt(toolsHash?.speed || '0', 10),
      gif: parseInt(toolsHash?.gif || '0', 10),
      convert: parseInt(toolsHash?.convert || '0', 10),
    };

    return {
      totalVisits: Math.max(parseInt(totalVisitsRaw || '0', 10), inMemoryFallback.totalVisits),
      uniqueVisitors: Math.max(uniqueVisitorsCount || 0, inMemoryFallback.uniqueVisitors.size),
      todayVisits: Math.max(parseInt(todayVisitsRaw || '0', 10), inMemoryFallback.dailyVisits.get(today) || 0),
      todayUniques: Math.max(todayUniquesCount || 0, inMemoryFallback.dailyUniques.get(today)?.size || 0),
      totalJobs: Math.max(parseInt(jobsTotalRaw || '0', 10), inMemoryFallback.jobsTotal),
      totalSavedMB: Math.max(parseFloat(savedMbRaw || '0'), inMemoryFallback.savedMB),
      toolsBreakdown,
      dailyHistory,
      recentVisits: parsedRecentVisits.length > 0 ? parsedRecentVisits : inMemoryFallback.recentVisits,
    };
  } catch (err: any) {
    console.warn('[Analytics Warning]: getAnalyticsSummary falling back to in-memory:', err.message);

    // Return in-memory data
    const last14Days: DailyStat[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      last14Days.push({
        date: dateStr,
        label,
        visits: inMemoryFallback.dailyVisits.get(dateStr) || 0,
        uniques: inMemoryFallback.dailyUniques.get(dateStr)?.size || 0,
      });
    }

    return {
      totalVisits: inMemoryFallback.totalVisits,
      uniqueVisitors: inMemoryFallback.uniqueVisitors.size,
      todayVisits: inMemoryFallback.dailyVisits.get(today) || 0,
      todayUniques: inMemoryFallback.dailyUniques.get(today)?.size || 0,
      totalJobs: inMemoryFallback.jobsTotal,
      totalSavedMB: inMemoryFallback.savedMB,
      toolsBreakdown: inMemoryFallback.toolsBreakdown,
      dailyHistory: last14Days,
      recentVisits: inMemoryFallback.recentVisits,
    };
  }
}
