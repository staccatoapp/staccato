import { type GradientKey } from "@staccato/shared";

/**
 * View models for the Home screen, shaped like the future API responses.
 * `artUrl` is null until real artwork endpoints exist; `gradientKey` selects
 * the placeholder gradient rendered by AlbumArt in the meantime.
 */

export interface HomeAlbum {
  id: string;
  title: string;
  artistName: string;
  releaseYear: number;
  gradientKey: GradientKey;
  artUrl: string | null;
}

export interface HomePlaylist {
  id: string;
  name: string;
  trackCount: number;
  gradientKey: GradientKey;
  artUrl: string | null;
}

export interface HomeMix {
  id: string;
  name: string;
  subtitle: string;
  gradientKey: GradientKey;
  artUrl: string | null;
}

export interface HomeRecPlaylist {
  id: string;
  name: string;
  trackCount: number;
  artistSummary: string;
  gradientKey: GradientKey;
  artUrl: string | null;
}

export interface HomeScreenData {
  /** When null, the Home screen drops the hero and leads with the quick-start grid. */
  recPlaylist: HomeRecPlaylist | null;
  recentlyPlayed: HomeAlbum[];
  mixes: HomeMix[];
  playlists: HomePlaylist[];
}

/** Sample content from the design handoff, used until the real endpoints exist. */
export const homeData: HomeScreenData = {
  recPlaylist: {
    id: "rp1",
    name: "Songs for Night Drives",
    trackCount: 28,
    artistSummary: "Fleetwood Mac, Talking Heads, Prince & more",
    gradientKey: "berry",
    artUrl: null,
  },
  recentlyPlayed: [
    {
      id: "1",
      title: "Rumours",
      artistName: "Fleetwood Mac",
      releaseYear: 1977,
      gradientKey: "sunset",
      artUrl: null,
    },
    {
      id: "3",
      title: "Blue",
      artistName: "Joni Mitchell",
      releaseYear: 1971,
      gradientKey: "sea",
      artUrl: null,
    },
    {
      id: "6",
      title: "In the Aeroplane Over the Sea",
      artistName: "Neutral Milk Hotel",
      releaseYear: 1998,
      gradientKey: "dusk",
      artUrl: null,
    },
    {
      id: "8",
      title: "Loveless",
      artistName: "My Bloody Valentine",
      releaseYear: 1991,
      gradientKey: "rose",
      artUrl: null,
    },
    {
      id: "4",
      title: "Purple Rain",
      artistName: "Prince",
      releaseYear: 1984,
      gradientKey: "berry",
      artUrl: null,
    },
    {
      id: "10",
      title: "Astral Weeks",
      artistName: "Van Morrison",
      releaseYear: 1968,
      gradientKey: "sea",
      artUrl: null,
    },
  ],
  mixes: [
    {
      id: "m1",
      name: "Discover Weekly",
      subtitle: "Updated Mondays",
      gradientKey: "berry",
      artUrl: null,
    },
    {
      id: "m2",
      name: "Folk & Acoustic",
      subtitle: "Joni Mitchell, Nick Drake & more",
      gradientKey: "sea",
      artUrl: null,
    },
    {
      id: "m3",
      name: "Late '70s Rock",
      subtitle: "Fleetwood Mac, Steely Dan & more",
      gradientKey: "sunset",
      artUrl: null,
    },
    {
      id: "m4",
      name: "Jazz Cornerstones",
      subtitle: "Miles, Coltrane, Mingus",
      gradientKey: "ocean",
      artUrl: null,
    },
  ],
  playlists: [
    {
      id: "p1",
      name: "Morning Chill",
      trackCount: 14,
      gradientKey: "sea",
      artUrl: null,
    },
    {
      id: "p2",
      name: "Late Night Drive",
      trackCount: 22,
      gradientKey: "dusk",
      artUrl: null,
    },
    {
      id: "p3",
      name: "Workout Fuel",
      trackCount: 31,
      gradientKey: "amber",
      artUrl: null,
    },
    {
      id: "p4",
      name: "Sunday Morning",
      trackCount: 18,
      gradientKey: "ocean",
      artUrl: null,
    },
  ],
};
