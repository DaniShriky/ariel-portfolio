import { getWhatsappLink, PHONE_NUMBER } from '../lib/contact';
import { WhatsappIcon } from './icons/SocialIcons';

function ContactCTA() {
  return (
    <section className="contact-cta">
      <h2 className="contact-cta__title">Let's Create Something Together</h2>
      <p className="contact-cta__subtitle">
        Have a project in mind? Reach out and let's talk about it.
      </p>
      <a
        className="contact-cta__primary"
        href={getWhatsappLink("Hi Ariel, I'd love to talk about a project.")}
        target="_blank"
        rel="noreferrer"
      >
        <WhatsappIcon className="contact-cta__primary-icon" />
        Chat on WhatsApp
      </a>
      <a className="contact-cta__secondary" href={`tel:${PHONE_NUMBER}`}>
        or call {PHONE_NUMBER}
      </a>
    </section>
  );
}

export default ContactCTA;
