// Enbar logo — served from the company website CDN (swap to a local asset later if needed).
const LOGO_URL =
  'https://static.wixstatic.com/media/1cfb16_ef0e81d45650435c9963c1188df5a376~mv2.png/v1/fill/w_250,h_96,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/%D7%A2%D7%A0%D7%91%D7%A8%20%D7%AA%D7%A2%D7%A9%D7%99%D7%95%D7%AA%20%D7%A4%D7%97.png'

export default function Logo({ className = 'h-10 w-auto' }) {
  // Source PNG has a white background box — blend it out so it doesn't
  // clash with the app's off-white page background.
  return (
    <img
      src={LOGO_URL}
      alt="ENBAR תעשיות פח"
      className={className}
      style={{ mixBlendMode: 'multiply' }}
    />
  )
}
