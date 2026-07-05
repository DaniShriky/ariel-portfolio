import { getWhatsappLink, PHONE_NUMBER } from '../lib/contact';
import { InstagramIcon, TiktokIcon } from './icons/SocialIcons';

const INSTAGRAM_URL = 'https://www.instagram.com/ariel_barish_/';
const TIKTOK_URL = 'https://www.tiktok.com/@ariel.barish';

function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__socials">
        <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" aria-label="Instagram">
          <InstagramIcon />
        </a>
        <a href={TIKTOK_URL} target="_blank" rel="noreferrer" aria-label="TikTok">
          <TiktokIcon />
        </a>
      </div>
      <p className="site-footer__contact">
        <a href={getWhatsappLink()}>WhatsApp</a>
        {' · '}
        <a href={`tel:${PHONE_NUMBER}`}>{PHONE_NUMBER}</a>
      </p>
      <p className="site-footer__copyright">© {new Date().getFullYear()} Ariel Barish</p>
    </footer>
  );
}

export default Footer;
