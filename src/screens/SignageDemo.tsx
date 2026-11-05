import { useMemo } from "react";
import { makeSeasonDemo } from "../lib/demo";
import { buildSeason } from "../lib/seasonData";
import SignageView from "../components/SignageView";

export default function SignageDemo() {
  const season = useMemo(() => buildSeason(makeSeasonDemo()), []);
  const start = Number(new URLSearchParams(window.location.search).get("s") || 0);
  return <SignageView season={season} start={start} />;
}
