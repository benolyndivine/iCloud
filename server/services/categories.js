// Single source of truth for how files are grouped (photos, videos, music, ...).
export const CATEGORIES = ['photos', 'videos', 'music', 'docs', 'other'];

const EXT = {
  photos: 'jpg jpeg png heic heif gif webp bmp tif tiff dng raw svg avif',
  videos: 'mp4 mov avi mkv webm m4v 3gp wmv flv mpg mpeg mts',
  music:  'mp3 m4a aac wav flac ogg oga opus wma aiff aif alac amr mid midi',
  docs:   'pdf doc docx xls xlsx ppt pptx txt rtf csv md odt ods odp pages numbers key epub',
};
const EXT_MAP = Object.fromEntries(
  Object.entries(EXT).flatMap(([cat, list]) => list.split(' ').map((e) => [e, cat]))
);

export function classify(fileName = '', mimeType = '') {
  const mime = (mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'photos';
  if (mime.startsWith('video/')) return 'videos';
  if (mime.startsWith('audio/')) return 'music';
  const ext = fileName.toLowerCase().split('.').pop();
  return EXT_MAP[ext] || 'other';
}

// Keys look like users/<uid>/<category>/<ts>-<name>. Older keys have no category folder,
// so fall back to the extension.
export function classifyKey(key, uid) {
  const rest = key.slice(`users/${uid}/`.length);
  const folder = rest.split('/')[0];
  if (rest.includes('/') && CATEGORIES.includes(folder)) return folder;
  return classify(key);
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const v = bytes / Math.pow(1024, i);
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(2)} ${units[i]}`;
}