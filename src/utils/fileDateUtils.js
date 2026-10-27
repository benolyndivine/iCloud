/**
 * fileDateUtils.js
 * Intelligently extracts the real captured or saved date and time from media files,
 * inspecting file metadata (capturedAt, fileLastModified), camera roll filename
 * conventions (IMG_YYYYMMDD_HHMMSS, PXL, VID, Screenshots), and fallbacks.
 */

export function extractFileDateTime(file) {
  if (!file) {
    const now = new Date();
    return formatParsedDate(now);
  }

  // 1. Check explicit metadata if present
  if (file.capturedAt) {
    const d = new Date(file.capturedAt);
    if (!isNaN(d.getTime())) return formatParsedDate(d);
  }
  if (file.originalDate) {
    const d = new Date(file.originalDate);
    if (!isNaN(d.getTime())) return formatParsedDate(d);
  }
  if (file.fileLastModified) {
    const d = new Date(file.fileLastModified);
    if (!isNaN(d.getTime())) return formatParsedDate(d);
  }

  // 2. Extract from filename
  const rawName =
    file.name ||
    file.fileName ||
    file.originalName ||
    (typeof file.key === 'string' ? file.key.split('/').pop() : '') ||
    '';

  // Strip leading upload timestamp prefix (e.g. "1792702916264-IMG_20260919_175754.webp")
  const cleanName = rawName.replace(/^\d{10,14}-/, '');

  // Pattern A: YYYYMMDD_HHMMSS or YYYYMMDD-HHMMSS (e.g. IMG_20260919_175754, PXL_20260919_175754)
  const dtMatch = cleanName.match(
    /(?:IMG|VID|PXL|AUD|Screenshot|ScreenShot|REC)?[-_]?(\d{4})(\d{2})(\d{2})[-_](\d{2})(\d{2})(\d{2})/i
  );
  if (dtMatch) {
    const [, y, m, d, hr, min, sec] = dtMatch;
    const year = parseInt(y, 10);
    const month = parseInt(m, 10) - 1;
    const day = parseInt(d, 10);
    const hour = parseInt(hr, 10);
    const minute = parseInt(min, 10);
    const second = parseInt(sec, 10);

    if (year >= 1990 && year <= 2035 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const parsedDate = new Date(year, month, day, hour, minute, second);
      if (!isNaN(parsedDate.getTime())) {
        return formatParsedDate(parsedDate);
      }
    }
  }

  // Pattern B: YYYY-MM-DD at HH.MM.SS (iOS / macOS / Windows camera roll)
  const iosMatch = cleanName.match(
    /(\d{4})[-.](\d{2})[-.](\d{2})[-_ ](?:at|T)?[-_ ]?(\d{2})[-.:](\d{2})[-.:](\d{2})/i
  );
  if (iosMatch) {
    const [, y, m, d, hr, min, sec] = iosMatch;
    const year = parseInt(y, 10);
    const month = parseInt(m, 10) - 1;
    const day = parseInt(d, 10);
    const hour = parseInt(hr, 10);
    const minute = parseInt(min, 10);
    const second = parseInt(sec, 10);

    if (year >= 1990 && year <= 2035 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const parsedDate = new Date(year, month, day, hour, minute, second);
      if (!isNaN(parsedDate.getTime())) {
        return formatParsedDate(parsedDate);
      }
    }
  }

  // Pattern C: Date only YYYYMMDD (e.g. IMG-20260919-WA0001)
  const dOnlyMatch = cleanName.match(/(?:IMG|VID|PXL|AUD)?[-_]?(\d{4})(\d{2})(\d{2})/i);
  if (dOnlyMatch) {
    const [, y, m, d] = dOnlyMatch;
    const year = parseInt(y, 10);
    const month = parseInt(m, 10) - 1;
    const day = parseInt(d, 10);

    if (year >= 1990 && year <= 2035 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const parsedDate = new Date(year, month, day, 12, 0, 0);
      if (!isNaN(parsedDate.getTime())) {
        return formatParsedDate(parsedDate);
      }
    }
  }

  // 3. Fallback to file.createdAt or file.lastModified
  const fallback = file.createdAt || file.lastModified;
  if (fallback) {
    const d = new Date(fallback);
    if (!isNaN(d.getTime())) return formatParsedDate(d);
  }

  return formatParsedDate(new Date());
}

function formatParsedDate(date) {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = yesterday.toDateString() === date.toDateString();

  let dateLabel = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  if (isToday) dateLabel = 'Today';
  else if (isYesterday) dateLabel = 'Yesterday';
  else if (date.getFullYear() !== now.getFullYear()) {
    dateLabel = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  // Formatted 12-hour time: e.g. "5:57 PM"
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return {
    date,
    dateKey: date.toDateString(),
    dateLabel,
    timeStr,
    timestamp: date.getTime(),
    fullIso: date.toISOString(),
  };
}
