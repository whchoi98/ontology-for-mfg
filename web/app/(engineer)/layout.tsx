import { PersonaSwitch } from "@/components/PersonaSwitch";
import { GuidedTour } from "@/components/GuidedTour";

export default function EngineerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PersonaSwitch active="engineer" />
      <main className="p-4">{children}</main>
      <GuidedTour />
    </>
  );
}
