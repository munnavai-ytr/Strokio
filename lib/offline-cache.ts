export const OFFLINE_CACHE_NAME = 'drawalong-offline-lessons-v1';

export async function saveLessonOffline(
  lessonId: string,
  signedImageUrl?: string | null,
  stepAudioUrls: (string | null)[] = []
): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window)) return false;

  try {
    const cache = await caches.open(OFFLINE_CACHE_NAME);

    // 1. Cache the lesson JSON endpoint
    const lessonUrl = `/api/lessons/${lessonId}`;
    const lessonRes = await fetch(lessonUrl);
    if (lessonRes.ok) {
      await cache.put(lessonUrl, lessonRes.clone());
    }

    // 2. Cache original photo
    if (signedImageUrl) {
      try {
        const imgRes = await fetch(signedImageUrl, { mode: 'cors' });
        if (imgRes.ok) {
          await cache.put(`offline-image:${lessonId}`, imgRes);
        }
      } catch (err) {
        console.warn('[Offline Cache] Photo caching skipped:', err);
      }
    }

    // 3. Cache pre-fetched narration audios
    for (let i = 0; i < stepAudioUrls.length; i++) {
      const audioUrl = stepAudioUrls[i];
      if (audioUrl) {
        try {
          const audioRes = await fetch(audioUrl);
          if (audioRes.ok) {
            await cache.put(`offline-audio:${lessonId}:step-${i}`, audioRes);
          }
        } catch {
          // ignore individual audio fetch issues
        }
      }
    }

    // Mark lesson ID in local list
    const stored = JSON.parse(localStorage.getItem('drawalong_offline_lessons') || '[]');
    if (!stored.includes(lessonId)) {
      stored.push(lessonId);
      localStorage.setItem('drawalong_offline_lessons', JSON.stringify(stored));
    }

    return true;
  } catch (err) {
    console.error('[Offline Cache] Failed to save lesson:', err);
    return false;
  }
}

export async function checkLessonIsOffline(lessonId: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window)) return false;
  try {
    const cache = await caches.open(OFFLINE_CACHE_NAME);
    const match = await cache.match(`/api/lessons/${lessonId}`);
    return Boolean(match);
  } catch {
    return false;
  }
}

export async function removeLessonOffline(lessonId: string): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  try {
    const cache = await caches.open(OFFLINE_CACHE_NAME);
    await cache.delete(`/api/lessons/${lessonId}`);
    await cache.delete(`offline-image:${lessonId}`);

    // Remove any step audio keys
    const keys = await cache.keys();
    for (const req of keys) {
      if (req.url.includes(`offline-audio:${lessonId}`)) {
        await cache.delete(req);
      }
    }

    const stored: string[] = JSON.parse(
      localStorage.getItem('drawalong_offline_lessons') || '[]'
    );
    const updated = stored.filter((id) => id !== lessonId);
    localStorage.setItem('drawalong_offline_lessons', JSON.stringify(updated));
  } catch (err) {
    console.warn('[Offline Cache] Error deleting lesson:', err);
  }
}

export async function getOfflineStorageEstimate(): Promise<{
  usageBytes: number;
  formatted: string;
}> {
  if (typeof window === 'undefined') return { usageBytes: 0, formatted: '0 KB' };

  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const bytes = estimate.usage || 0;
      const mb = (bytes / (1024 * 1024)).toFixed(1);
      return {
        usageBytes: bytes,
        formatted: `${mb} MB`,
      };
    } catch {
      // Fallback
    }
  }

  return { usageBytes: 0, formatted: 'Available' };
}
