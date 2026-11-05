import { useParams } from "react-router-dom";
import SquadEntry from "../components/SquadEntry";

export default function LiveEntry() {
  const { id = "", squadId = "" } = useParams();
  return <SquadEntry practiceId={id} squadId={squadId} />;
}
