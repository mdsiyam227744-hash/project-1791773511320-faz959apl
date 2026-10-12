import type { Metadata } from "next";
import PlannerForm from "./planner-form";

export const metadata: Metadata = { title: "Route & Trip Cost Planner" };

export default function PlannerPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <h1 className="text-3xl font-bold">Route &amp; trip cost planner</h1>
      <p className="mt-2 max-w-2xl text-navy-600">
        Get an approximate distance between cities, live flight fare quotes when our flight-data
        provider is configured, and a full cost breakdown including official visa fees and our
        service fees. Amounts marked as estimates are never presented as confirmed prices.
      </p>
      <PlannerForm />
    </div>
  );
}
