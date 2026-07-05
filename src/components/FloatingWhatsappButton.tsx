import { getWhatsappLink } from '../lib/contact';
import { WhatsappIcon } from './icons/SocialIcons';

function FloatingWhatsappButton() {
  return (
    <a
      className="floating-whatsapp-btn"
      href={getWhatsappLink("Hi Ariel, I'd love to talk about a project.")}
      target="_blank"
      rel="noreferrer"
      aria-label="Chat on WhatsApp"
    >
      <WhatsappIcon />
    </a>
  );
}

export default FloatingWhatsappButton;
