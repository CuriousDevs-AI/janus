/** Largest side of a stored logo. Small enough to keep in the browser, sharp enough for the sidebar. */
const MAX_SIDE = 192;
const MAX_INPUT_BYTES = 3 * 1024 * 1024;

/**
 * Reads an image file and returns a small data URL. Throws a message the person can act on.
 * SVG is refused: a logo should be a picture, never something that can carry a script.
 */
export async function readLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error("Use a PNG, JPG or WebP image.");
  if (file.size > MAX_INPUT_BYTES) throw new Error("That image is over 3 MB. Choose a smaller one.");
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error("That image could not be read.")); img.src = url; });
    const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("That image could not be read.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    // Keep transparency for PNG and WebP; JPEG stays JPEG.
    return canvas.toDataURL(file.type === "image/jpeg" || file.type === "image/jpg" ? "image/jpeg" : "image/png", 0.9);
  } finally { URL.revokeObjectURL(url); }
}
