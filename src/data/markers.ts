export interface Marker {
  id: string;
  position: [number, number, number]; // world-space [x, y, z]
  title: string;
  content: string;
  imageUrl?: string;
  linkUrl?: string;
  linkText?: string;
  triggerRadius: number; // distance in world units to show prompt
}

// Per-world markers — keyed by world index in the registry
export const MARKERS_BY_WORLD: Record<number, Marker[]> = {
  0: [
    {
      id: "st-marks-bookshop",
      position: [2, 0, 3],
      title: "St. Mark's Bookshop",
      content:
        "A legendary independent bookstore that was a fixture of the East Village for decades, known for its curated selection of literature, theory, and art books.",
      linkUrl: "https://en.wikipedia.org/wiki/St._Mark%27s_Bookshop",
      linkText: "Wikipedia",
      triggerRadius: 3,
    },
    {
      id: "trash-vaudeville",
      position: [-1.5, 0, 6],
      title: "Trash & Vaudeville",
      content:
        "Iconic punk rock clothing store that operated on St. Mark's Place from 1975 to 2016, outfitting generations of musicians and downtown scenesters.",
      linkUrl: "https://en.wikipedia.org/wiki/Trash_and_Vaudeville",
      linkText: "Wikipedia",
      triggerRadius: 3,
    },
    {
      id: "physical-graffiti-0",
      position: [0.5, 0, 9],
      title: "Physical Graffiti Building",
      content:
        "The tenement buildings at 96-98 St. Mark's Place famously appeared on the cover of Led Zeppelin's 1975 album Physical Graffiti.",
      triggerRadius: 3,
    },
  ],
  1: [
    {
      id: "gem-spa",
      position: [1, 0, 3],
      title: "Gem Spa",
      content:
        "The beloved East Village newsstand and egg cream destination that served the neighborhood from the 1920s until closing in 2020.",
      triggerRadius: 3,
    },
    {
      id: "theater-80",
      position: [-2, 0, 6],
      title: "Theater 80 St. Marks",
      content:
        "A historic revival movie house and Off-Broadway theater at 80 St. Mark's Place, a cultural landmark since 1964.",
      triggerRadius: 3,
    },
  ],
  2: [
    {
      id: "tompkins-square",
      position: [1.5, 0, 3],
      title: "Tompkins Square Park",
      content:
        "A 10.5-acre public park in the East Village, historically a gathering place for counterculture and political protests.",
      triggerRadius: 3,
    },
    {
      id: "holiday-cocktail-lounge",
      position: [-1, 0, 6],
      title: "Holiday Cocktail Lounge",
      content:
        "A classic East Village dive bar at 75 St. Mark's Place, serving the neighborhood since 1961.",
      triggerRadius: 3,
    },
    {
      id: "stmarks-church",
      position: [0, 0, 9],
      title: "St. Mark's Church in-the-Bowery",
      content:
        "The oldest site of continuous worship in Manhattan, this Episcopal church dates to 1660 and has been a hub for arts and activism.",
      triggerRadius: 3,
    },
  ],
};
