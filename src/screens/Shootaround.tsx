import { useParams } from "react-router-dom";
import { usePracticeData } from "../lib/usePracticeData";
import SquadEntry from "../components/SquadEntry";

// A shootaround is a shooting-only session with the whole roster on one squad.
// We resolve that single squad, then reuse the squad-entry UI in shootaround mode.
export default function Shootaround() {
  const { id = "" } = useParams();
  const { bundle, loading, error } = usePracticeData(id);
  if (loading) return <p className="text-gray-500">Loading shootaround…</p>;
  if (error) return <p className="text-red-600">Error: {error}</p>;
  const squad = bundle?.squads[0];
  if (!squad) return <p className="text-red-600">Shootaround not found.</p>;
  return <SquadEntry practiceId={id} squadId={squad.id} shootaround />;
}
