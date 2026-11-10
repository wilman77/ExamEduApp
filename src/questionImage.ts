export const MAX_QUESTION_IMAGE_CHARACTERS = 115_000;

/** Resize and flatten an image before storing it as part of a question. */
export async function prepareQuestionImage(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Gunakan gambar JPG, PNG, atau WebP.');
  }
  if (file.size > 10 * 1024 * 1024) throw new Error('Ukuran gambar asli maksimal 10 MB.');
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Gambar tidak dapat dibaca.');
    const initialScale = Math.min(1, 1400 / image.naturalWidth, 1000 / image.naturalHeight);
    let width = Math.max(1, Math.round(image.naturalWidth * initialScale));
    let height = Math.max(1, Math.round(image.naturalHeight * initialScale));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Browser ini tidak mendukung pemrosesan gambar.');
    for (let pass = 0; pass < 7; pass += 1) {
      canvas.width = width;
      canvas.height = height;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      for (const quality of [0.84, 0.74, 0.64, 0.54, 0.44]) {
        const data = canvas.toDataURL('image/jpeg', quality);
        if (data.length <= MAX_QUESTION_IMAGE_CHARACTERS) return data;
      }
      width = Math.max(1, Math.round(width * 0.8));
      height = Math.max(1, Math.round(height * 0.8));
    }
    throw new Error('Gambar masih terlalu besar. Potong bagian yang diperlukan lalu unggah kembali.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
