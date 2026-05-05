import { PersonaSwitch } from "@/components/PersonaSwitch";
import { GuidedTour } from "@/components/GuidedTour";

export default function QualityLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PersonaSwitch active="quality" />
      <main className="p-4">{children}</main>
      <GuidedTour />
    </>
  );
}
