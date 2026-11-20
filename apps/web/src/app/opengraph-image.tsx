import { OG_SIZE, shareCard } from "@/lib/og";

export const alt = "HamPath: free prep for Canada's Basic amateur radio exam";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return shareCard({
    kicker: "Free, for Canada's Basic amateur radio exam",
    title: "Learn every ISED question by doing",
    stats: [
      ["984", "ISED questions"],
      ["100", "short lessons"],
      ["35", "hands-on labs"],
    ],
  });
}
