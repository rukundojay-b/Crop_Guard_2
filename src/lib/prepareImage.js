const MAX_EDGE = 1280
const QUALITY = 0.85

/**
 * Downscales and re-encodes a photo before upload. Phone cameras produce 6-12 MB
 * files that carry no extra diagnostic detail at this size, and shrinking here
 * keeps uploads fast on a rural connection and keeps model cost down.
 *
 * Returns the original file untouched if anything about the decode fails, so a
 * device that cannot use canvas still works.
 */
export async function prepareImage(file) {
  if (!file?.type?.startsWith('image/')) {
    throw new Error('That file is not an image. Use JPG, PNG or WEBP.')
  }

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))

    // Already small enough: re-encoding would only lose detail.
    if (scale === 1 && file.size < 1_500_000) {
      bitmap.close?.()
      return { file, previewUrl: URL.createObjectURL(file) }
    }

    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, QUALITY))
    if (!blob) return { file, previewUrl: URL.createObjectURL(file) }

    const name = file.name.replace(/\.[^.]+$/, '') + (mime === 'image/png' ? '.png' : '.jpg')
    const prepared = new File([blob], name, { type: mime })

    return { file: prepared, previewUrl: URL.createObjectURL(prepared) }
  } catch {
    throw new Error('That image could not be read. Try another photo.')
  }
}
