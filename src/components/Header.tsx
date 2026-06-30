type HeaderProps = {
  subtitle?: string;
};

function Header({ subtitle }: HeaderProps) {
  return (
    <header className="site-header">
      <span className="site-header__barcode">
        {subtitle ? `Ariel Barish - ${subtitle}` : 'Ariel Barish'}
      </span>
    </header>
  );
}

export default Header;
