type FootprintCountry = {
  code?: string;
  name?: string;
};

export default function FootprintFlags({ countries }: { countries?: FootprintCountry[] }) {
  const seen = new Set<string>();
  const items = (countries || [])
    .map((country) => ({
      code: (country.code || '').trim().toLowerCase(),
      name: (country.name || '').trim(),
    }))
    .filter((country) => {
      if (!country.code || seen.has(country.code)) return false;
      seen.add(country.code);
      return true;
    });

  if (items.length === 0) return null;

  return (
    <div className="post-hero-footprint-flags" aria-label="文章足迹国家">
      {items.slice(0, 3).map((country) => (
        <img
          key={country.code}
          className="post-hero-footprint-flag"
          src={`https://flagcdn.io/flags/1x1/${country.code.toLowerCase()}.svg`}
          alt={country.name || country.code.toUpperCase()}
          title={country.name || country.code.toUpperCase()}
          loading="lazy"
        />
      ))}
      {items.length > 3 && (
        <span className="post-hero-footprint-more">+{items.length - 3}</span>
      )}
    </div>
  );
}
