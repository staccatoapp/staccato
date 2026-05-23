import { Fragment } from "react";
import { Link } from "@tanstack/react-router";
import type { TrackArtistCredit } from "@staccato/shared";

// Renders the "feat." suffix of a track's credit list: everything after the
// lead (position 0), which is shown elsewhere. Each guest links to their
// artist page. MusicBrainz join phrases are used verbatim so " feat. " and
// " & " render faithfully. Renders nothing when there are no guests.
export function FeaturedArtists({
  credits,
  className,
}: {
  credits?: TrackArtistCredit[];
  className?: string;
}) {
  if (!credits || credits.length <= 1) return null;
  const lead = credits[0];
  const guests = credits.slice(1);
  if (!lead) return null;
  const prefix =
    lead.joinPhrase && lead.joinPhrase.trim() ? lead.joinPhrase : " feat. ";
  return (
    <span className={className}>
      {prefix}
      {guests.map((g, i) => (
        <Fragment key={`${g.artistId}-${i}`}>
          <Link
            to="/artists/$artistKey"
            params={{ artistKey: g.artistId }}
            className="hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {g.name}
          </Link>
          {g.joinPhrase ?? ""}
        </Fragment>
      ))}
    </span>
  );
}
