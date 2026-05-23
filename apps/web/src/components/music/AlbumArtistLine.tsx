import { Fragment } from "react";
import { Link } from "@tanstack/react-router";
import type { AlbumArtistCredit } from "@staccato/shared";

// Full release-level artist credit, lead inclusive: "MF DOOM & MF Grimm", each
// name linked, separators taken from each credit's MusicBrainz joinPhrase.
export function AlbumArtistLine({
  credits,
  className,
}: {
  credits: AlbumArtistCredit[];
  className?: string;
}) {
  if (credits.length === 0) return null;
  return (
    <span className={className}>
      {credits.map((c, i) => (
        <Fragment key={`${c.artistId}-${i}`}>
          <Link
            to="/artists/$artistKey"
            params={{ artistKey: c.artistId }}
            className="hover:underline"
          >
            {c.name}
          </Link>
          {c.joinPhrase ?? (i < credits.length - 1 ? ", " : "")}
        </Fragment>
      ))}
    </span>
  );
}
