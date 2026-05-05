import { PersonaSwitch } from "@/components/PersonaSwitch";
import { GuidedTour } from "@/components/GuidedTour";

export default function PlantLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PersonaSwitch active="plant" />
      <main className="p-4">{children}</main>
      <GuidedTour />
    </>
  );
}
