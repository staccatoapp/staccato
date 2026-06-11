import { type HomeAlbum } from "@/lib/home-types";

// TODO: replace with real API fetching when the recently-played endpoint exists
export function useRecentlyPlayed(): HomeAlbum[] {
  return [
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
  ];
}
