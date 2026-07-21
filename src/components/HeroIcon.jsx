// One square hero icon from Valve's CDN, with a degrade-safe placeholder.
//
// Extracted from the two live-series-companion files that had hand-copied near-identical
// versions of it (`SeriesGameDraftStrip`'s 20px strip icon and `SeriesLivePulse`'s 32px
// DraftPickRow icon). They differed only in size, placeholder tint, and which CSS property the
// onError fallback sets — all three are props here, so the CDN URL shape and the null-key
// contract live in exactly one place.
//
// A null `heroKey` is a normal state, not an error: the hero map may still be loading, or the
// live feed may report hero_id 0 during the draft phase. It renders a neutral box rather than a
// broken image or a raw "Hero 155" string.
//
// Deliberately NOT used by DraftDisplay / PlayerStatsSection / TournamentHub — those build the
// same CDN URL but carry their own layout and hover treatments, and folding them in was not part
// of this refactor's scope.

const HERO_ICON_BASE = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/icons/'

/**
 * @param {object} props
 * @param {string|null} props.heroKey - Valve's hero key (e.g. "antimage"). Null renders the placeholder.
 * @param {string|null} [props.name] - Hero display name, used for alt/title.
 * @param {string} [props.sizeClassName] - Tailwind width/height pair for the box.
 * @param {string} [props.placeholderClassName] - Background applied to the null-key placeholder.
 * @param {boolean} [props.collapseOnError] - See onError below.
 */
export default function HeroIcon({
  heroKey,
  name,
  sizeClassName = 'w-5 h-5',
  placeholderClassName = 'bg-gray-200 dark:bg-gray-800',
  collapseOnError = false,
}) {
  const boxClassName = `${sizeClassName} rounded-sm flex-shrink-0`

  if (!heroKey) {
    return <div className={`${boxClassName} ${placeholderClassName}`} aria-hidden="true" />
  }

  return (
    <img
      src={`${HERO_ICON_BASE}${heroKey}.png`}
      alt={name || 'Hero'}
      title={name || undefined}
      className={`${boxClassName} object-cover`}
      loading="lazy"
      // A 404 (new hero, stale key) must not leave a broken-image glyph. Which fallback is
      // correct depends on the layout the icon sits in, so the caller picks:
      //   collapseOnError=true  -> display:none, for a flex row where the icon is one of several
      //                            children and the remaining text should close the gap.
      //   collapseOnError=false -> visibility:hidden, for a fixed 5v5 strip where the slot must
      //                            keep its width so the two teams' icons stay aligned.
      onError={(e) => {
        if (collapseOnError) e.currentTarget.style.display = 'none'
        else e.currentTarget.style.visibility = 'hidden'
      }}
    />
  )
}
