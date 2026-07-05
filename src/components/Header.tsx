import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAdminMode } from '../context/AdminModeContext';

type HeaderProps = {
  subtitle?: string;
};

function Header({ subtitle }: HeaderProps) {
  const navigate        = useNavigate();
  const location        = useLocation();
  const { isAdmin }     = useAdminMode();
  const [hidden, setHidden] = useState(false);

  // Always show the header when navigating to a new page
  useEffect(() => {
    setHidden(false);
  }, [location.pathname]);

  useEffect(() => {
    let lastY = window.scrollY;

    const handleScroll = () => {
      const currentY = window.scrollY;

      // Always reveal when near the top
      if (currentY < 10) {
        setHidden(false);
        lastY = currentY;
        return;
      }

      const delta = currentY - lastY;
      if (Math.abs(delta) < 8) return; // ignore micro-jitter

      setHidden(delta > 0); // down → hide, up → show
      lastY = currentY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Sit below the admin toolbar (44px) when it's visible
  const stickyTop = isAdmin ? '44px' : '0';

  return (
    <header
      className={`site-header${hidden ? ' site-header--hidden' : ''}`}
      style={{ top: stickyTop }}
    >
      {subtitle && (
        <button className="site-header__back" onClick={() => navigate(-1)} title="Go back">
          ←
        </button>
      )}
      <Link to="/" className="site-header__link">
        <span className="site-header__barcode">
          {subtitle ? `Ariel Barish - ${subtitle}` : 'Ariel Barish'}
        </span>
      </Link>
    </header>
  );
}

export default Header;
