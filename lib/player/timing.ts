/**
 * Calculates step playback duration synchronized with narration duration.
 * Clamps the speed adaptation factor between 0.7x and 1.6x.
 */
export function calculatePacedDuration(
  stepDurationMs: number,
  narrationDurationMs?: number | null,
  userSpeedMultiplier = 1.0
): number {
  const baseDuration = Math.max(stepDurationMs || 5000, 3000);
  const speed = Math.max(userSpeedMultiplier, 0.1);

  if (!narrationDurationMs || narrationDurationMs <= 0) {
    return Math.round(baseDuration / speed);
  }

  // Desired duration is close to narration length
  // Clamp rate adaptation factor between 0.7x and 1.6x
  const desiredRatio = baseDuration / narrationDurationMs;
  const clampedFactor = Math.min(Math.max(desiredRatio, 0.7), 1.6);

  const adjustedDuration = baseDuration / clampedFactor;
  return Math.round(Math.max(adjustedDuration / speed, 2500));
}

/**
 * Calculates stroke dashoffset for a path given progress 0..1
 */
export function getDashoffset(pathLength: number, progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  return pathLength * (1 - p);
}
