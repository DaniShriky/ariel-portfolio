import { Link, useNavigate } from 'react-router-dom';

type HeaderProps = {
  subtitle?: string;
};

function Header({ subtitle }: HeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="site-header">
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
