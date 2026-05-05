import { PersonaSwitch } from "@/components/PersonaSwitch";
import { GuidedTour } from "@/components/GuidedTour";

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PersonaSwitch active="buyer" />
      <main className="p-4">{children}</main>
      <GuidedTour />
    </>
  );
}
