// The host baked into printed QR stickers. Changing it invalidates every
// sticker already glued to a machine — see TODO.md before touching it.
//
// Deliberately NOT window.location.origin (which is what the signature links
// in ExceptionView.jsx use): a manager printing from localhost or a Vercel
// preview URL would otherwise produce permanently dead stickers. A signature
// link is consumed within days; a sticker has to work for years.
export const APP_BASE_URL =
  import.meta.env.VITE_PUBLIC_BASE_URL || 'https://enbar-reports.vercel.app'

export function machineQrUrl(machineId) {
  return `${APP_BASE_URL}/maintenance/${machineId}`
}
