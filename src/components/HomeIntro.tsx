const SPECIALTIES = ['Portrait', 'Street', 'Travel', 'Cinematography'];

function HomeIntro() {
  return (
    <section className="home-intro">
      {/* PLACEHOLDER — replace with Ariel's real bio */}
      <p className="home-intro__text">
        Ariel Barish is a photographer and cinematographer capturing life as it happens —
        from intimate portraits to unscripted street scenes across the world. Every frame
        is built on instinct, patience, and an eye for the story hiding in plain sight.
      </p>
      {/* PLACEHOLDER — adjust specialties to Ariel's real focus areas */}
      <div className="home-intro__chips">
        {SPECIALTIES.map(s => (
          <span key={s} className="home-intro__chip">{s}</span>
        ))}
      </div>
    </section>
  );
}

export default HomeIntro;
