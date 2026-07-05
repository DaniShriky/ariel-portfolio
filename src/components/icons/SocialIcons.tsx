type IconProps = { className?: string };

export function InstagramIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
      <circle cx="12" cy="12" r="4.3" />
      <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TiktokIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.5 2h-3.1v13.3a2.7 2.7 0 1 1-2.2-2.66v-3.15a5.9 5.9 0 1 0 5.3 5.87V8.63a7 7 0 0 0 4.1 1.32V6.85a4 4 0 0 1-4.1-4.07z" />
    </svg>
  );
}

export function WhatsappIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.7 14.06c-.26-.13-1.5-.74-1.73-.82-.23-.08-.4-.13-.57.13-.17.26-.66.82-.8.98-.15.17-.3.19-.55.06-.26-.13-1.08-.4-2.06-1.27-.76-.68-1.28-1.51-1.42-1.77-.15-.26-.02-.4.11-.53.11-.11.26-.3.38-.44.13-.15.17-.26.26-.43.09-.17.04-.32-.02-.45-.06-.13-.57-1.37-.78-1.87-.2-.49-.42-.42-.57-.43h-.49c-.17 0-.44.06-.68.32-.23.26-.9.87-.9 2.13 0 1.26.92 2.47 1.05 2.65.13.17 1.81 2.76 4.38 3.87.61.26 1.09.42 1.46.53.61.2 1.17.17 1.61.1.49-.07 1.5-.61 1.71-1.2.21-.6.21-1.1.15-1.21-.06-.11-.23-.17-.49-.3z" />
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2.5a9.5 9.5 0 0 0-8.2 14.3L2.5 21.5l4.85-1.27A9.5 9.5 0 1 0 12 2.5zm5.44 14.94a7.7 7.7 0 0 1-10.9-.02l-.34-.34-2.88.75.77-2.8-.32-.37a7.7 7.7 0 1 1 13.67 2.78z" />
    </svg>
  );
}
