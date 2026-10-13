import { AirportDistanceTool } from "./distance-tool";

export const metadata = {
  title: "Airport-to-airport distance — VisaBridge Global",
  description:
    "Great-circle distance between two airports, computed from dataset coordinates with the method and Earth radius stated.",
};

export default function DistancePage() {
  return <AirportDistanceTool />;
}
