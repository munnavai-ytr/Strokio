export interface ProcessedImageResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  originalSize: number;
  processedSize: number;
}

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

const MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_LONG_EDGE = 1024; // Longest edge max 1024px

/**
 * Validates, resizes to max 1024px on the long edge, and re-encodes to WebP (quality 0.85)
 * using client-side HTML5 Canvas.
 */
export async function processAndResizeImage(
  file: File,
  onProgress?: (stage: string) => void
): Promise<ProcessedImageResult> {
  // 1. Validation
  onProgress?.('Validating image file...');
  const isExtensionValid = /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
  const isTypeValid = ALLOWED_MIME_TYPES.includes(file.type.toLowerCase()) || isExtensionValid;

  if (!isTypeValid) {
    throw new Error('Unsupported format. Please select a JPEG, PNG, or WebP photo.');
  }

  if (file.size > MAX_INPUT_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(`File is too large (${sizeMb} MB). Maximum allowed size is 10 MB.`);
  }

  // 2. Load into HTMLImageElement
  onProgress?.('Decoding photo...');
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Failed to decode the image. Please try a different photo.'));
      element.src = objectUrl;
    });

    const origWidth = img.naturalWidth || img.width;
    const origHeight = img.naturalHeight || img.height;

    if (!origWidth || !origHeight) {
      throw new Error('Could not determine image dimensions.');
    }

    // 3. Compute scale for 1024px maximum long edge
    let targetWidth = origWidth;
    let targetHeight = origHeight;

    if (origWidth > MAX_LONG_EDGE || origHeight > MAX_LONG_EDGE) {
      if (origWidth >= origHeight) {
        targetWidth = MAX_LONG_EDGE;
        targetHeight = Math.round((origHeight * MAX_LONG_EDGE) / origWidth);
      } else {
        targetHeight = MAX_LONG_EDGE;
        targetWidth = Math.round((origWidth * MAX_LONG_EDGE) / origHeight);
      }
    }

    // 4. Draw to Canvas
    onProgress?.('Optimizing resolution for drawing analysis...');
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize 2D canvas context.');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    // 5. Encode as WebP (quality 0.85)
    onProgress?.('Re-encoding to WebP...');
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) {
            resolve(b);
          } else {
            // Fallback for browsers that don't support webp encoding
            canvas.toBlob(
              (fallbackBlob) => {
                if (fallbackBlob) resolve(fallbackBlob);
                else reject(new Error('Could not convert canvas to image blob.'));
              },
              'image/jpeg',
              0.85
            );
          }
        },
        'image/webp',
        0.85
      );
    });

    const dataUrl = canvas.toDataURL('image/webp', 0.85);

    return {
      blob,
      dataUrl,
      width: targetWidth,
      height: targetHeight,
      originalSize: file.size,
      processedSize: blob.size,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
