import { PersonaSwitch } from "@/components/PersonaSwitch";
import { GuidedTour } from "@/components/GuidedTour";

export default function ScmLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PersonaSwitch active="scm" />
      <main className="p-4">{children}</main>
      <GuidedTour />
    </>
  );
}
