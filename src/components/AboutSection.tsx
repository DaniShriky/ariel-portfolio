const SPECIALTIES = ['Portrait', 'Street', 'Travel', 'Cinematography'];

function AboutSection() {
  return (
    <section className="about-section">
      {/* PLACEHOLDER — replace with Ariel's real bio */}
      <p className="about-section__quote">
        "I chase the moment before it disappears — a look, a gesture, a flash of light —
        and turn it into something that lasts."
      </p>
      <p className="about-section__body">
        Ariel Barish is a photographer and cinematographer capturing life as it happens,
        from intimate portraits to unscripted street scenes across the world. Every frame
        is built on instinct, patience, and an eye for the story hiding in plain sight.
      </p>
      {/* PLACEHOLDER — adjust specialties to Ariel's real focus areas */}
      <div className="about-section__chips">
        {SPECIALTIES.map(s => (
          <span key={s} className="about-section__chip">{s}</span>
        ))}
      </div>
    </section>
  );
}

export default AboutSection;
