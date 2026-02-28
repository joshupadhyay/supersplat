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

// Placeholder positions — calibrate by navigating the splat and noting camera coords
export const MARKERS: Marker[] = [
  {
    id: "st-marks-bookshop",
    position: [2, 0, 5],
    title: "St. Mark's Bookshop",
    content:
      "A legendary independent bookstore that was a fixture of the East Village for decades, known for its curated selection of literature, theory, and art books.",
    linkUrl: "https://en.wikipedia.org/wiki/St._Mark%27s_Bookshop",
    linkText: "Wikipedia",
    triggerRadius: 3,
  },
  {
    id: "trash-vaudeville",
    position: [-3, 0, 8],
    title: "Trash & Vaudeville",
    content:
      "Iconic punk rock clothing store that operated on St. Mark's Place from 1975 to 2016, outfitting generations of musicians and downtown scenesters.",
    linkUrl: "https://en.wikipedia.org/wiki/Trash_and_Vaudeville",
    linkText: "Wikipedia",
    triggerRadius: 3,
  },
  {
    id: "physical-graffiti",
    position: [0, 0, 12],
    title: "Physical Graffiti Building",
    content:
      "The tenement buildings at 96-98 St. Mark's Place famously appeared on the cover of Led Zeppelin's 1975 album Physical Graffiti.",
    triggerRadius: 3,
  },
];
